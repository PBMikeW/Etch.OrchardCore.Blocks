import Undo from 'editorjs-undo';

/**
 * Cross-widget undo/redo for EditorJS.
 *
 * Each ContentBlock widget is a separate EditorJS instance. `editorjs-undo`
 * gives each instance its own history stack (and handles the messy
 * typing-granularity reconciliation), but its Ctrl+Z/Ctrl+Y are scoped to a
 * single editor holder. This module layers a page-wide timeline on top so a
 * single Ctrl+Z walks back content edits across ALL ContentBlock editors in
 * the order they happened, regardless of which widget has focus.
 *
 * Scope: content inside the editors (typing, block changes, Format Painter
 * conversions). Structural OrchardCore Flow operations (add/delete/move whole
 * widgets) are outside EditorJS and not covered.
 *
 * State is module-scoped, so it is shared across every editor instance on the
 * page (the bundle loads once).
 */

// Ordered record of every change across all instances: { undo, holderEl }.
const timeline = [];
// Index of the last-applied change; -1 means "at baseline".
let pointer = -1;
// True while we drive undo()/redo(); suppresses recording the resulting
// re-render as a brand-new change (editorjs-undo fires onUpdate on undo/redo
// too, so this guard is required).
let isApplying = false;
let keyListenerAttached = false;

function recordChange(undo, holderEl) {
  if (isApplying) {
    return;
  }
  // Drop any redo branch ahead of the pointer, then append this change.
  if (pointer < timeline.length - 1) {
    timeline.length = pointer + 1;
  }
  timeline.push({ undo, holderEl });
  pointer = timeline.length - 1;
}

// Bring the affected widget into view and focus it, so an undo/redo that
// changes an off-screen widget is actually visible to the user.
function revealWidget(holderEl) {
  if (!holderEl) {
    return;
  }
  holderEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const firstBlock = holderEl.querySelector('.ce-block [contenteditable], .ce-block');
  if (firstBlock && typeof firstBlock.focus === 'function') {
    try {
      firstBlock.focus();
    } catch (e) {
      // Some block elements aren't focusable; ignore.
    }
  }
}

function globalUndo() {
  if (pointer < 0) {
    return;
  }
  const entry = timeline[pointer];
  isApplying = true;
  try {
    entry.undo.undo();
  } finally {
    isApplying = false;
  }
  pointer -= 1;
  revealWidget(entry.holderEl);
}

function globalRedo() {
  if (pointer >= timeline.length - 1) {
    return;
  }
  const entry = timeline[pointer + 1];
  isApplying = true;
  try {
    entry.undo.redo();
  } finally {
    isApplying = false;
  }
  pointer += 1;
  revealWidget(entry.holderEl);
}

function onGlobalKeyDown(e) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.key !== 'z' && e.key !== 'Z' && e.key !== 'y' && e.key !== 'Y') {
    return;
  }
  const key = e.key.toLowerCase();
  const isRedo = key === 'y' || (key === 'z' && e.shiftKey);

  // Pre-empt editorjs-undo's per-holder bubble-phase shortcuts so the global
  // timeline is the single source of truth.
  e.preventDefault();
  e.stopPropagation();

  if (isRedo) {
    globalRedo();
  } else {
    globalUndo();
  }
}

/**
 * Attach cross-widget undo to one editor instance.
 *
 * @param {object} editor      EditorJS instance.
 * @param {HTMLElement} holderEl The editor's holder element.
 * @param {object} initialData The data the editor loaded with (so the
 *                             history baseline isn't empty).
 */
export function attachUndo(editor, holderEl, initialData) {
  if (!editor || !holderEl) {
    return;
  }

  // `undoInstance` is declared before `new Undo` because editorjs-undo calls
  // onUpdate synchronously during construction and initialize (for the empty
  // baseline). Using `let` (initialised to null) avoids a temporal-dead-zone
  // reference, and the `ready` flag ignores those early baseline calls so they
  // aren't recorded as user changes.
  let undoInstance = null;
  let ready = false;

  undoInstance = new Undo({
    editor,
    config: { debounceTimer: 200 },
    onUpdate() {
      if (!ready) {
        return;
      }
      recordChange(undoInstance, holderEl);
    },
  });

  undoInstance.initialize(initialData || {});
  ready = true;

  // One shared, capture-phase document listener handles Ctrl+Z/Y for every
  // instance. Capture fires before editorjs-undo's holder (bubble) listeners,
  // and stopPropagation prevents them from also firing.
  if (!keyListenerAttached) {
    document.addEventListener('keydown', onGlobalKeyDown, true);
    keyListenerAttached = true;
  }
}
