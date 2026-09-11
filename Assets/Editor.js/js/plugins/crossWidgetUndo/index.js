/**
 * Cross-widget undo/redo for EditorJS.
 *
 * Each ContentBlock widget is a separate EditorJS instance. This module keeps
 * a snapshot of every instance's block data after every change, plus ONE
 * page-wide timeline of those changes, so a single Ctrl+Z walks back edits
 * across all ContentBlock editors in the order they actually happened,
 * whichever widget has focus.
 *
 * Why the engine is home-grown. It used to wrap `editorjs-undo` (2.0.28, the
 * last release; upstream is dead), which is a diff-and-patch engine, and four
 * of its behaviours were wrong here:
 *   a) a multi-block paste is one history entry but its undo deletes exactly
 *      one block, stranding the other N-1 pasted blocks;
 *   b) an empty widget's baseline was `{}`, so the second undo hit a TypeError;
 *   c) the baseline came from the hidden field's raw JSON (no ids, tunes or
 *      version) while every later state came from `editor.save()`, so the two
 *      never compared equal and a bare click recorded a phantom step;
 *   d) redo re-applied its patch after the wrapper's "we are applying" guard
 *      had already cleared, duplicating blocks.
 * Snapshots sidestep all of it: undo is "render the previous state", which
 * cannot half-apply. The cost is memory, bounded by MAX_TIMELINE.
 *
 * What makes one step: EditorJS 2.31.6 delivers one batched `onChange(api,
 * events)` per user action — a three-paragraph paste arrives as a single batch
 * of [block-added x3, block-changed x3]. Its modification observer also holds
 * mutations for 400 ms before delivering them, so an unbroken typing run comes
 * through as one batch too. One batch == one user action == one undo step;
 * TYPING_COALESCE_MS below only catches same-block runs that still arrive as
 * separate batches.
 *
 * Scope: content inside the editors (typing, pasting, block changes, Format
 * Painter conversions — those go through blocks.convert/update, which emit
 * block-changed, so they are covered for free). Structural OrchardCore Flow
 * operations (add/delete/move whole widgets) are outside EditorJS and are not.
 *
 * Event contract, so an admin theme can render page-level Undo / Redo buttons
 * without importing this bundle (modules never import each other; see the
 * pb:domain:action convention):
 *   - out: `pb:undo:state` on document, detail { canUndo, canRedo } — once the
 *     first editor has its baseline, and after every recorded change, undo,
 *     redo and history truncation. Coalesced to one event per user action.
 *   - in:  `pb:undo:undo` / `pb:undo:redo` on document — exactly what Ctrl+Z /
 *     Ctrl+Y do, same code path. Ignored silently while a render is in flight
 *     or when there is nothing to do, but the state event still fires so a
 *     button can re-sync.
 *   - in:  `pb:undo:query` on document — re-emits pb:undo:state, so a buttons
 *     script that loads after the first baseline can still sync.
 * No globals: the module exposes nothing on `window`.
 *
 * State is module-scoped, so it is shared across every editor instance on the
 * page (the bundle loads once). Editors added later by ajax can attach at any
 * time; the page-level listeners are registered exactly once.
 */

// Successive block-changed batches on the same block within this many ms are
// one step, so Ctrl+Z undoes a word rather than a keystroke.
const TYPING_COALESCE_MS = 300;
// Upper bound on the page-wide history. The old engine capped each editor at
// 30 states while the timeline was unbounded, so entries past that silently
// became no-ops; one explicit cap avoids that mismatch.
const MAX_TIMELINE = 100;
// How long we wait after our own render for the change EditorJS batches up
// from it. Its observer holds mutations for 400 ms, so anything shorter can
// let the echo land after the guard has gone.
const ECHO_GUARD_MS = 600;

// { editor, holderEl, snapshots: [ { json, caret, changedIndex } ], position, ... }
// `position` indexes the snapshot currently rendered; snapshots[0] is the
// baseline taken at load.
const instances = [];
// Ordered record of every change across all instances:
// { instance, snapshotIndex } means "this change took `instance` from
// snapshot[snapshotIndex - 1] to snapshot[snapshotIndex]".
const timeline = [];
// Index in `timeline` of the last-applied change; -1 means "at baseline".
let pointer = -1;
// True from accepting an undo/redo until its render has finished.
let pendingApply = false;
// One coalesced pb:undo:state per user action rather than one per internal
// step.
let statePending = false;
let pageListenersAttached = false;
let baselineAnnounced = false;

// Tell the page what the buttons should look like. Coalesced onto the next
// macrotask so a change that records, truncates and trims emits once.
function scheduleStateEvent() {
  if (statePending) {
    return;
  }
  statePending = true;
  setTimeout(() => {
    statePending = false;
    document.dispatchEvent(new CustomEvent('pb:undo:state', {
      bubbles: false,
      detail: { canUndo: pointer >= 0, canRedo: pointer < timeline.length - 1 },
    }));
  }, 0);
}

/**
 * Remember the content we just rendered, so the change EditorJS batches up
 * from that render can be recognised when it arrives — by content, not by
 * timing, so it is caught however long the 400 ms batcher holds it. Held per
 * instance and per content, so several undos in quick succession each get
 * their own echo back rather than the newest one masking the rest.
 */
function armEcho(instance, json) {
  instance.pendingEchoes.push({ json, at: Date.now() });
}

// True when `json` is one of our own renders coming back. Expired entries are
// dropped on the way past; there are never more than a few.
function takeEcho(instance, json) {
  const now = Date.now();
  instance.pendingEchoes = instance.pendingEchoes.filter((echo) => now - echo.at < ECHO_GUARD_MS);
  const at = instance.pendingEchoes.findIndex((echo) => echo.json === json);
  if (at === -1) {
    return false;
  }
  instance.pendingEchoes.splice(at, 1);
  return true;
}

function instanceFor(editor) {
  for (const instance of instances) {
    if (instance.editor === editor) {
      return instance;
    }
  }
  return null;
}

function inManagedEditor(node) {
  if (!node || !node.nodeType) {
    return false;
  }
  return instances.some((instance) => instance.holderEl && instance.holderEl.contains(node));
}

/**
 * True for the editor's own chrome — the toolbox search box, the link tool's
 * URL field, a tune's input. Ctrl+Z there is the browser's to handle: those
 * fields have their own native undo and are not part of any block's content.
 */
function isChromeField(node) {
  if (!node || node.nodeType !== 1) {
    return false;
  }
  const tag = node.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  // A contenteditable outside .ce-block is chrome too; a block's own editable
  // always sits inside one.
  return !!node.isContentEditable && !node.closest('.ce-block');
}

// Forget an instance whose holder has gone (an OrchardCore widget deleted
// while the page is open): its timeline entries would otherwise swallow a
// keypress to render into a detached DOM, and hold the editor in memory.
function dropInstance(instance) {
  for (let i = timeline.length - 1; i >= 0; i--) {
    if (timeline[i].instance !== instance) {
      continue;
    }
    timeline.splice(i, 1);
    if (i <= pointer) {
      pointer -= 1;
    }
  }
  const at = instances.indexOf(instance);
  if (at !== -1) {
    instances.splice(at, 1);
  }
}

function blockElementAt(instance, index) {
  if (typeof index !== 'number' || index < 0) {
    return null;
  }
  return instance.holderEl.querySelectorAll('.ce-block')[index] || null;
}

// The block's first contenteditable. Good enough for paragraphs, headers and
// lists; a quote's caption or a table cell is a second editable in the same
// block, so a caret captured there restores to the block's first field.
function editableAt(instance, index) {
  const blockEl = blockElementAt(instance, index);
  return blockEl ? blockEl.querySelector('[contenteditable]') : null;
}

/**
 * Where the caret sits right now, as { blockIndex, offset } with `offset`
 * counted in characters from the start of the block's editable. Absolute
 * offsets survive a re-render; DOM nodes do not.
 */
function captureCaret(instance) {
  try {
    const blockIndex = instance.editor.blocks.getCurrentBlockIndex();
    if (typeof blockIndex !== 'number' || blockIndex < 0) {
      return null;
    }
    const selection = window.getSelection();
    const editable = editableAt(instance, blockIndex);
    if (!selection || !selection.anchorNode || !editable || !editable.contains(selection.anchorNode)) {
      return { blockIndex, offset: null };
    }
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    return { blockIndex, offset: range.toString().length };
  } catch (e) {
    // An editor mid-render has no current block; the caret is a nicety, so a
    // failure here must never cost us the snapshot.
    return null;
  }
}

function placeOffset(editable, offset) {
  if (!editable) {
    return;
  }
  const walker = document.createTreeWalker(editable, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let target = null;
  let node = walker.nextNode();
  while (node) {
    const length = node.textContent.length;
    if (remaining <= length) {
      target = node;
      break;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  if (!target) {
    return;
  }
  try {
    const range = document.createRange();
    range.setStart(target, remaining);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  } catch (e) {
    // The block can come back a different shape (a list rebuilt as one node
    // per item); leaving the caret where setToBlock put it is fine.
  }
}

function restoreCaret(instance, caret, fallbackIndex) {
  const editor = instance.editor;
  let index = caret ? caret.blockIndex : fallbackIndex;
  if (typeof index !== 'number' || index < 0) {
    return;
  }
  let count = 0;
  try {
    count = editor.blocks.getBlocksCount();
  } catch (e) {
    return;
  }
  if (!count) {
    return;
  }
  if (index > count - 1) {
    index = count - 1;
  }
  try {
    // setToBlock also tells EditorJS which block is current, which a raw DOM
    // selection would not, so it runs even when we then refine the offset.
    editor.caret.setToBlock(index, 'default', 0);
  } catch (e) {
    return;
  }
  if (!caret || caret.offset == null) {
    return;
  }
  // setToBlock counts its offset inside the block's first deepest text node,
  // which is the wrong node as soon as the block contains inline markup, so
  // place the absolute offset over the block's text nodes ourselves.
  placeOffset(editableAt(instance, index), caret.offset);
}

// Bring the affected widget into view, so an undo that changes an off-screen
// widget is actually visible. Scroll to the block that changed, not to the
// widget's first block.
function revealWidget(instance, blockIndex) {
  const target = blockElementAt(instance, blockIndex) || instance.holderEl;
  if (!target) {
    return;
  }
  try {
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch (e) {
    // Position is cosmetic; never let it break an undo.
  }
}

function eventList(events) {
  if (!events) {
    return [];
  }
  return Array.isArray(events) ? events : [events];
}

// Which block the caret is in, for changes that arrive without events.
function currentBlockId(instance) {
  try {
    const index = instance.editor.blocks.getCurrentBlockIndex();
    const block = index >= 0 ? instance.editor.blocks.getBlockByIndex(index) : null;
    return (block && block.id) || null;
  } catch (e) {
    return null;
  }
}

/**
 * Reduce one onChange batch to what the recorder needs: did it change the
 * block set (added / removed / moved), which single block did it touch, and
 * which index was involved. A batch with no events at all (our own flush
 * before an undo) is "unknown": not structural, and the caller fills in the
 * focused block so a typing run can still coalesce.
 */
function summariseEvents(events) {
  const list = eventList(events);
  let structural = false;
  let blockId = null;
  let mixed = false;
  let index = null;
  for (const event of list) {
    try {
      if (!event || event.type !== 'block-changed') {
        structural = true;
      }
      const detail = (event && event.detail) || {};
      if (index === null && typeof detail.index === 'number') {
        index = detail.index;
      }
      const id = detail.target && detail.target.id;
      if (id) {
        if (blockId === null) {
          blockId = id;
        } else if (blockId !== id) {
          mixed = true;
        }
      }
    } catch (e) {
      structural = true;
    }
  }
  return { structural, blockId: mixed ? null : blockId, index, unknown: list.length === 0 };
}

// A new change after an undo abandons the redo branch: drop the timeline
// entries ahead of the pointer and the snapshots they produced.
function truncateRedoBranch() {
  if (pointer >= timeline.length - 1) {
    return;
  }
  for (let i = pointer + 1; i < timeline.length; i++) {
    const dropped = timeline[i];
    if (dropped.instance.snapshots.length > dropped.snapshotIndex) {
      dropped.instance.snapshots.length = dropped.snapshotIndex;
    }
  }
  timeline.length = pointer + 1;
}

function trimTimeline() {
  while (timeline.length > MAX_TIMELINE) {
    const dropped = timeline.shift();
    pointer -= 1;
    // Nothing can walk back past this entry now, so the snapshots it could
    // have restored are dead weight. Blank their contents but keep the array
    // length, so every later snapshotIndex stays valid.
    for (let i = 0; i < dropped.snapshotIndex; i++) {
      dropped.instance.snapshots[i] = null;
    }
  }
}

/**
 * Turn one change into a history step, unless it is not a change at all.
 *
 * @param {object} instance   The registered instance.
 * @param {object} savedData  Its `save()` output for this change.
 * @param {Array|object} events The onChange batch, or null when we saved the
 *                            editor ourselves (see flushPendingTyping).
 * @param {boolean} forceStep Never coalesce into the previous step.
 */
function recordSnapshot(instance, savedData, events, forceStep) {
  if (!savedData) {
    return;
  }
  // The baseline save() has not resolved yet, so this change is still part of
  // loading the editor.
  if (!instance.snapshots.length) {
    return;
  }

  const blocks = savedData.blocks || [];
  const json = JSON.stringify(blocks);
  // The change EditorJS batches up from our own render comes back here like
  // any other. Dropping it is what keeps an undo from looking like a user
  // edit and truncating the redo branch.
  if (takeEcho(instance, json)) {
    return;
  }
  const current = instance.snapshots[instance.position];
  // Identical content is not a step — this is what kills the phantom step a
  // bare click used to produce.
  if (current && current.json === json) {
    return;
  }

  const summary = summariseEvents(events);
  const now = Date.now();
  const caret = captureCaret(instance);
  const changedIndex = summary.index != null ? summary.index : caret && caret.blockIndex;
  const blockId = summary.unknown ? currentBlockId(instance) : summary.blockId;

  // Coalesce a typing run on one block into one step. Never coalesce a batch
  // that added, removed or moved blocks: one paste must stay one undo.
  const atTip = pointer >= 0 &&
    pointer === timeline.length - 1 &&
    timeline[pointer].instance === instance &&
    timeline[pointer].snapshotIndex === instance.position;
  const canCoalesce = !forceStep &&
    atTip &&
    !!current &&
    instance.position > 0 &&
    !summary.structural &&
    !instance.lastStructural &&
    blockId != null &&
    instance.lastBlockId === blockId &&
    now - instance.lastRecordedAt < TYPING_COALESCE_MS;

  if (canCoalesce) {
    current.json = json;
    current.caret = caret;
    current.changedIndex = changedIndex;
    instance.lastRecordedAt = now;
    scheduleStateEvent();
    return;
  }

  truncateRedoBranch();
  instance.snapshots.push({ json, caret, changedIndex });
  instance.position = instance.snapshots.length - 1;
  timeline.push({ instance, snapshotIndex: instance.position });
  pointer = timeline.length - 1;
  instance.lastBlockId = blockId;
  instance.lastStructural = summary.structural;
  instance.lastRecordedAt = now;
  trimTimeline();
  scheduleStateEvent();
}

/**
 * Record one change. Called from the editor's own onChange, after it has
 * saved — the saved data is passed in so the page saves once per change
 * rather than twice.
 *
 * @param {object} editor       EditorJS instance the change came from.
 * @param {object} savedData    That editor's `save()` output for this change.
 * @param {Array|object} events The onChange batch (block-added, …).
 */
export function recordChange(editor, savedData, events) {
  const instance = instanceFor(editor);
  if (!instance) {
    return;
  }
  recordSnapshot(instance, savedData, events, false);
}

/**
 * EditorJS holds a change for up to 400 ms before delivering it, so at the
 * moment Ctrl+Z is pressed the last few seconds of typing may not have been
 * recorded yet. Save the editors that could be mid-run and record what we
 * find, so the first Ctrl+Z undoes that typing (and can redo it) instead of
 * discarding it along with the step before it.
 */
async function flushPendingTyping() {
  const focused = instances.filter((instance) => instance.holderEl.contains(document.activeElement));
  // save() is cheap; with nothing focused we cannot tell which editor is
  // mid-run, so check them all.
  const targets = focused.length ? focused : instances.slice();
  for (const instance of targets) {
    if (!instance.snapshots.length) {
      continue;
    }
    let saved = null;
    try {
      saved = await instance.editor.save();
    } catch (e) {
      continue;
    }
    // forceStep: the in-progress run must be its own step, or undoing it
    // would take the step before it away as well.
    recordSnapshot(instance, saved, null, true);
  }
}

/**
 * Render one snapshot into its editor.
 *
 * @returns {Promise<boolean>} false if the render failed, so the caller can
 *   leave the history where it was rather than desynchronising the pointer
 *   from what is on screen.
 */
async function applyTo(instance, snapshotIndex, fallbackFocusIndex) {
  const snapshot = instance.snapshots[snapshotIndex];
  if (!snapshot) {
    return false;
  }
  try {
    const blocks = JSON.parse(snapshot.json);
    if (blocks.length) {
      await instance.editor.blocks.render({ blocks });
    } else {
      // render() with an empty list leaves the editor with nothing to type
      // into; clear() puts the default empty paragraph back.
      await instance.editor.blocks.clear();
    }
    instance.position = snapshotIndex;

    // Re-save and adopt the result as the snapshot's content. What the editor
    // holds after a render is not always byte-identical to what we asked for
    // (clear() builds a fresh empty paragraph, tools normalise their data),
    // and the change EditorJS batches up from this render carries the
    // post-render form. Storing it means that echo compares exactly equal and
    // is dropped, instead of looking like a user edit that truncates the redo
    // branch.
    let saved = null;
    try {
      saved = await instance.editor.save();
      snapshot.json = JSON.stringify(saved.blocks || []);
    } catch (err) {
      console.warn('Cross-widget undo: could not re-read the editor after a render', err);
    }
    armEcho(instance, snapshot.json);

    // EditorJS disables its modification observer while render() runs, so the
    // editor's own onChange does NOT fire for an undo (verified on 2.31.6:
    // zero onChange calls across an undo and a redo). Without this callback
    // the hidden field the form posts would still hold the pre-undo content.
    if (instance.onApplied && saved) {
      try {
        instance.onApplied(saved);
      } catch (err) {
        console.warn('Cross-widget undo: onApplied hook failed', err);
      }
    }

    // A snapshot recorded without a caret (the baseline) falls back to the
    // block the undone change touched.
    const focusIndex = snapshot.caret ? snapshot.caret.blockIndex : fallbackFocusIndex;
    revealWidget(instance, focusIndex);
    restoreCaret(instance, snapshot.caret, fallbackFocusIndex);
    return true;
  } catch (e) {
    console.warn('Cross-widget undo: could not restore a snapshot', e);
    return false;
  }
}

// Which block a timeline entry's change touched, for focusing after an undo
// whose target snapshot has no caret of its own.
function changedIndexOf(entry) {
  const snapshot = entry.instance.snapshots[entry.snapshotIndex];
  return snapshot ? snapshot.changedIndex : null;
}

/**
 * Step one entry back (or forward, with `forward`). The single entry point:
 * the keyboard shortcut and the pb:undo:undo / pb:undo:redo events both come
 * through here, so they behave identically. A request that arrives while a
 * render is still in flight, or with nothing to do, is dropped — but the
 * state event still fires so a button can re-sync.
 *
 * @returns {Promise<boolean>} whether anything was applied.
 */
async function step(forward) {
  // One render at a time. A second request during one is dropped rather than
  // queued; the echo bookkeeping is per content, so the dropped keypress is
  // the only cost.
  if (pendingApply) {
    scheduleStateEvent();
    return false;
  }
  pendingApply = true;
  try {
    if (!forward) {
      await flushPendingTyping();
    }

    // Skip over entries belonging to widgets that have been removed from the
    // page: drop them and keep walking, so the keypress still undoes
    // something the user can see.
    let target = forward ? pointer + 1 : pointer;
    while (target >= 0 && target <= timeline.length - 1) {
      const candidate = timeline[target];
      if (document.contains(candidate.instance.holderEl)) {
        break;
      }
      dropInstance(candidate.instance);
      target = forward ? pointer + 1 : pointer;
    }
    if (target < 0 || target > timeline.length - 1) {
      return false;
    }

    const entry = timeline[target];
    const applied = await applyTo(
      entry.instance,
      forward ? entry.snapshotIndex : entry.snapshotIndex - 1,
      changedIndexOf(entry)
    );
    // Only move on a render that worked, so the pointer cannot drift away
    // from what the editors actually show.
    if (applied) {
      pointer = forward ? pointer + 1 : pointer - 1;
    }
    return applied;
  } finally {
    pendingApply = false;
    scheduleStateEvent();
  }
}

export function undo() {
  return step(false);
}

export function redo() {
  return step(true);
}

/**
 * 'z', 'y' or '' for a keydown. A single-character e.key is what the user's
 * layout actually produced, so it wins — on QWERTZ, Ctrl+Z is the key that
 * types z, whichever physical key that is. e.code is the fallback for layouts
 * whose e.key is a non-Latin character or a dead key.
 */
function undoLetter(e) {
  const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
  if (key.length === 1) {
    return key === 'z' || key === 'y' ? key : '';
  }
  const code = typeof e.code === 'string' ? e.code : '';
  if (code === 'KeyZ') {
    return 'z';
  }
  return code === 'KeyY' ? 'y' : '';
}

function onGlobalKeyDown(e) {
  if (!e.ctrlKey && !e.metaKey || e.isComposing) {
    return;
  }
  const letter = undoLetter(e);
  if (!letter) {
    return;
  }
  const action = letter === 'y' || e.shiftKey ? 'redo' : 'undo';
  // The editor's own fields (toolbox search, link URL, tune inputs) keep the
  // browser's undo: they are not block content and have their own history.
  if (isChromeField(e.target) || isChromeField(document.activeElement)) {
    return;
  }
  // Only claim the shortcut inside an editor we manage. Elsewhere on the admin
  // page — a title input, a taxonomy field — the browser's own undo has to
  // keep working.
  if (!inManagedEditor(e.target) && !inManagedEditor(document.activeElement)) {
    return;
  }
  // Inside our editors we swallow the key even when there is nothing to undo:
  // the browser's contenteditable undo edits the DOM behind EditorJS's back
  // and desyncs its block model, which is worse than doing nothing.
  e.preventDefault();
  e.stopPropagation();

  if (action === 'redo') {
    redo();
  } else {
    undo();
  }
}

// Registered once per page, however many editors attach (OrchardCore adds
// widgets by ajax long after load).
function attachPageListeners() {
  if (pageListenersAttached) {
    return;
  }
  pageListenersAttached = true;
  // Capture phase: we see Ctrl+Z before any block tool does.
  document.addEventListener('keydown', onGlobalKeyDown, true);
  document.addEventListener('pb:undo:undo', () => undo());
  document.addEventListener('pb:undo:redo', () => redo());
  // A buttons script that loads after the first baseline missed the first
  // state event; this lets it ask for one.
  document.addEventListener('pb:undo:query', () => scheduleStateEvent());
}

/**
 * Attach cross-widget undo to one editor instance. Idempotent: a second call
 * for the same editor is ignored, so a widget that is re-initialised cannot
 * end up recording every change twice.
 *
 * @param {object} editor        EditorJS instance (already ready).
 * @param {HTMLElement} holderEl The editor's holder element.
 * @param {Function} [onApplied] Called with the editor's post-render `save()`
 *                               output after each undo/redo, for the caller to
 *                               write its hidden field — no onChange fires for
 *                               our own render (see applyTo).
 */
export async function attachUndo(editor, holderEl, onApplied) {
  if (!editor || !holderEl || instanceFor(editor)) {
    return;
  }

  const instance = {
    editor,
    holderEl,
    onApplied: typeof onApplied === 'function' ? onApplied : null,
    snapshots: [],
    position: 0,
    pendingEchoes: [],
    lastBlockId: null,
    lastStructural: true,
    lastRecordedAt: 0,
  };
  instances.push(instance);
  attachPageListeners();

  // Baseline from save(), never from the hidden field: the field's JSON has no
  // block ids, tunes or version, so it could never compare equal to a later
  // save() and the first change always looked like two. An empty editor
  // baselines as [] rather than {}.
  let saved = null;
  try {
    saved = await editor.save();
  } catch (e) {
    // A baseline of "empty" would be worse than no undo at all: the first
    // Ctrl+Z would wipe the widget to one empty paragraph and onApplied would
    // write that to the hidden field. Drop the registration instead; a later
    // attachUndo call for this editor can try again.
    dropInstance(instance);
    console.warn('Cross-widget undo: could not read the editor, undo is off for this widget', e);
    return;
  }
  const blocks = (saved && saved.blocks) || [];
  instance.snapshots.push({ json: JSON.stringify(blocks), caret: null, changedIndex: null });
  instance.position = 0;

  // Announce the (empty) history once the page has its first editor, so undo
  // buttons can render disabled instead of guessing.
  if (!baselineAnnounced) {
    baselineAnnounced = true;
    scheduleStateEvent();
  }
}
