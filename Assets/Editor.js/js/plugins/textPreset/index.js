import './index.css';
import { applyWholeBlockStyles, extractWholeBlockStyles, stripProperty } from '../formatPainter/inlineStyles';
import { rawExport } from '../formatPainter';
import { blockTagOf, upgradeLegacyMarkup } from '../utils/legacyMarkup';
import {
  DARK_GROUND,
  LIGHT_GROUND,
  alignmentOfTunes,
  hasStyleMarkup,
  isClearPreset,
  matchesFingerprint,
  readPresets,
  resolve,
} from './presets';

/**
 * Text presets for EditorJS.
 *
 * One named style — "Section heading", "Body", "Small print" — applied to a
 * block, or to every block of a cross-block selection, in one gesture and as
 * ONE undo step. See ./presets.js for why the vocabulary looks the way it does.
 *
 * Storage: a preset is not a new kind of data. It expands to exactly the inline
 * markup the colour and font-size tools already write, through the format
 * painter's helpers, so nothing downstream has to learn about presets: the C#
 * block parsers, the theme CSS, the painter, the colour picker and
 * remove-formatting all keep working on the result, and a preset applied by
 * mistake can be undone with the ordinary tools.
 *
 * What a preset owns: block type, heading level, whole-block colour, font size,
 * and alignment when the preset names one — including the colour and size of
 * text inside links, which the theme's own `a { color }` would otherwise
 * override (the anchors themselves, and every href, are left exactly as they
 * were). What it never touches: bold and italic (real inline emphasis — see the
 * census note in ./presets.js), the anchor and padding tunes, and the block's
 * own alignment when the preset has none.
 *
 * Two ways in, because a cross-block selection and the block settings popover
 * are not always available at the same moment:
 *   1. a `textPreset` block tune ("Style" with a nested preset list), and
 *   2. a button next to the format painter's brush in the toolbar actions row,
 *      opening our own small dropdown.
 * Both apply to the cross-selected blocks when there is a selection, and to the
 * current block otherwise, and both go through the same applyPreset().
 *
 * Ground. Half of all colour applications in production were "make this white,
 * the widget sits on a dark banner". So every preset has a Light-ground and a
 * Dark-ground colour and the menu carries a ground toggle, remembered per tab
 * in sessionStorage: an editor building a dark banner flips once and then just
 * picks roles.
 *
 * Lists and quotes keep their structure: a preset applied to one styles its
 * text in place and does NOT convert it to a paragraph. Converting would join a
 * list's bullets into one line and fold a quote's caption into its text (that
 * is what the tools' own exporters do), which is far too destructive for a menu
 * click that may be hitting four blocks at once.
 *
 * Known cost of the conversions that do still happen: a paragraph with a <br>
 * in it loses the <br> on the way to a heading, because blocks.convert()
 * sanitises against the NEW tool and @editorjs/header's sanitiser config does
 * not allow one.
 *
 * Batching. EditorJS delivers one batched `onChange` per user action (its
 * modification observer holds mutations for 400 ms), so the N blocks.update()
 * calls one preset click makes arrive as a single change — one snapshot, and
 * therefore one Ctrl+Z, for the whole selection. See ../crossWidgetUndo.
 */

// Tools the Style menu is offered on, for BOTH ways in: a block whose tool is
// not in here gets no "Style" row in its settings popover and no toolbar button
// (table, image, embed, kbButton, raw, delimiter all carry no text a preset
// could own, and a live-looking button that opens nine no-op rows is worse than
// no button at all).
const MENU_TOOLS = ['paragraph', 'header', 'list', 'quote'];
// Tools with text "None" can clear.
const STYLABLE_TOOLS = ['paragraph', 'header', 'list', 'quote'];
// Tools a preset styles in place rather than converting; see the header note.
// A quote is styled on its `text` alone, so its caption is never touched.
//
// One note on quotes, recorded here because it is invisible from this file:
// @editorjs/quote's own sanitiser allows nothing but <br> in `text`, so a
// preset's <font> would be stripped on editor.save() if that were the whole
// rule. The fork registers the tool with `inlineToolbar: true`
// (Assets/Editor.js/js/index.js), which merges every inline tool's sanitiser
// config into the field — so colour, size and bold all survive a save inside
// a quote, and a preset on a quote sticks. Take the inline toolbar off that
// registration again and every one of them goes back to being stripped.
const KEEPS_TYPE = ['list', 'quote'];

// Properties a preset owns, in the ../formatPainter/inlineStyles vocabulary.
// "None" clears exactly these and nothing else.
const PRESET_PROPS = ['color', 'backgroundColor', 'fontSize'];

// Tools with an alignment field of their own in `data`, and the values each one
// understands. The editor-wide alignment tune is not the whole story for these:
// see the note where this is used.
const OWN_ALIGNMENT_TOOLS = { quote: ['left', 'center'] };

// Classes that exist only to carry a font size: the current tool's, and the
// legacy ones from ../utils/legacyMarkup.
const SIZE_CLASS = /^(fontsize-tool|editor-fs-[\w-]+)$/;

// Remembered per tab, not per editor: an editor working on a dark banner
// crosses several ContentBlock widgets before the ground changes again.
const GROUND_KEY = 'pb:preset-ground';

const PRESET_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 16 8 5.5 12.5 16"/><path d="M5.2 12.4h5.6"/><rect x="14.5" y="13.5" width="7.5" height="7" rx="1.5"/><path d="M16.5 17h3.5"/></svg>`;

// Filled white / filled near-black: the ground the preset colours are for.
const GROUND_ICONS = {
  [LIGHT_GROUND]: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" fill="#ffffff" stroke="currentColor" stroke-width="1.5"/></svg>`,
  [DARK_GROUND]: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="6.5" fill="#1d202b" stroke="currentColor" stroke-width="1.5"/></svg>`,
};

const CLEAR_ICON = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="6.5"/><path d="m5.4 14.6 9.2-9.2"/></svg>`;

// Shared across every editor instance on the page, like the format painter's:
// the bundle loads once and each ContentBlock widget is its own editor.
let currentGroundValue = null;
let openMenu = null;
let escListenerAttached = false;

// Read once per menu, never cached for the page's lifetime: the island is
// ordinary DOM, so it can arrive after this bundle or be swapped by another
// script, and an editor looking at yesterday's vocabulary has no way to tell.
// Parsing a handful of rows costs nothing next to opening a menu — but it is
// still one read per menu, threaded through to whatever repaints the rows,
// rather than one per row.
function presets() {
  return readPresets(document);
}

function ground() {
  if (currentGroundValue) {
    return currentGroundValue;
  }
  try {
    currentGroundValue = window.sessionStorage.getItem(GROUND_KEY) === DARK_GROUND ? DARK_GROUND : LIGHT_GROUND;
  } catch (e) {
    // Storage can be blocked outright (private mode, locked-down browser).
    // The toggle still works, it just does not survive a page load.
    currentGroundValue = LIGHT_GROUND;
  }
  return currentGroundValue;
}

function toggleGround() {
  currentGroundValue = ground() === DARK_GROUND ? LIGHT_GROUND : DARK_GROUND;
  try {
    window.sessionStorage.setItem(GROUND_KEY, currentGroundValue);
  } catch (e) {
    // See above: remembering it is a convenience, not a requirement.
  }
  return currentGroundValue;
}

function groundLabel() {
  return ground() === DARK_GROUND ? 'Ground: Dark' : 'Ground: Light';
}

// Colour of `preset` on the current ground, for the menu's swatch.
function swatchColor(preset) {
  const plan = resolve(preset, ground());
  return (plan && plan.styles.color) || '';
}

// Only a literal colour goes into an icon's markup — the table can come from a
// site's data island, and that string is never trusted into HTML.
function safeColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^[a-z]+$/i.test(value) ? value : '';
}

// A preset label, safe to hand to something that will set it as innerHTML.
// EditorJS renders a popover item's `title` with innerHTML, and a label can
// come from a site's data island (see sanitisePreset in ./presets.js), so an
// island shipping `<img src=x onerror=...>` as a label would otherwise run it
// in the admin. A text node is the escaper: what the browser round-trips out of
// textContent is by definition safe to put back in as HTML.
//
// Our own dropdown in section 2 needs no equivalent — it assigns textContent.
function escapeHtml(value) {
  const probe = document.createElement('span');
  probe.textContent = value == null ? '' : String(value);
  return probe.innerHTML;
}

function swatchIcon(preset) {
  if (isClearPreset(preset)) {
    return CLEAR_ICON;
  }
  const color = safeColor(swatchColor(preset));
  const fill = color || 'transparent';
  // On the dark ground the preset colours are light, so the swatch sits on a
  // dark chip: white on the menu's white would read as "no colour at all".
  const backdrop = ground() === DARK_GROUND
    ? '<rect x="1" y="1" width="18" height="18" rx="4" fill="#1d202b"/>'
    : '';
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none">${backdrop}<circle cx="10" cy="10" r="6" fill="${fill}" stroke="rgba(29, 32, 43, 0.35)"/></svg>`;
}

// data-item-name of a preset's row in the settings popover.
function itemName(preset) {
  return `textPreset-${preset.id}`;
}

const GROUND_ITEM_NAME = 'textPresetGround';

// ---------------------------------------------------------------------------
// Reading a block
// ---------------------------------------------------------------------------

// The alignment a block is at: the current tune key, then the legacy one, then
// the DOM.
//
// Both tune keys come first because only `alignmentTune` has any effect in the
// editor — AlignmentTune.wrap() writes text-align from its own data, and a
// block whose alignment still lives under the legacy `anyTune` key renders
// left-aligned here while the site centres it. Reading the DOM alone would
// therefore show an old centred h4 as unaligned, and "Stat / tile label" would
// never look active on exactly the blocks it was built for.
function alignmentOfBlock(tunes, content) {
  const tuned = tunes && (tunes.alignmentTune || tunes.anyTune);
  // alignmentOfTunes defaults to 'left', which would mask the DOM, so the keys
  // are checked for a value before it is trusted for the precedence.
  if (tuned && tuned.alignment) {
    return alignmentOfTunes(tunes);
  }
  // The tune writes text-align onto the tool's element, and re-writes it onto
  // .ce-block__content when it is clicked; either can be the live one.
  return content.style.textAlign
    || (content.firstElementChild && content.firstElementChild.style.textAlign)
    || 'left';
}

// The block settings popover renders synchronously, but block.save() is async,
// so the fingerprint is read off the rendered block instead. That is the honest
// source anyway: the DOM is exactly what the block would save.
//
// `tunes` is the one thing the DOM cannot answer for (see alignmentOfBlock), so
// it is an optional second pass: both menus paint from the DOM first and
// repaint with the saved tunes when they land. See repaintForLegacyAlignment.
function fingerprintOfBlock(block, tunes) {
  const holder = block && block.holder;
  const content = holder && holder.querySelector('.ce-block__content');
  if (!content) {
    return null;
  }
  const heading = block.name === 'header' ? content.querySelector('h1, h2, h3, h4, h5, h6') : null;
  const level = heading ? Number(heading.tagName.slice(1)) : undefined;
  const tag = blockTagOf({ type: block.name, data: { level } });
  const html = content.innerHTML;
  const styles = extractWholeBlockStyles([html], document, tag);
  return {
    tool: block.name,
    level,
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    fontSize: styles.fontSize,
    // Whether there is ANY colour or size markup, whole-block or not: what
    // "None" would have to clear. See hasStyleMarkup in ./presets.js.
    styled: hasStyleMarkup(html),
    alignment: alignmentOfBlock(tunes, content),
  };
}

// The saved tunes are the only place a legacy `anyTune` alignment exists, and
// block.save() is async while both menus are built synchronously — so a menu is
// painted from the DOM and then repainted once the save lands. That is a
// microtask or two later, which is after the rows are in the document but well
// inside the time it takes to read a menu and move the mouse to a row.
//
// Only legacy blocks pay for it, and only they can be wrong: with no `anyTune`
// the DOM has already answered, and nothing is repainted.
function repaintForLegacyAlignment(block, repaint) {
  if (!block || typeof block.save !== 'function') {
    return;
  }
  block.save().then((saved) => {
    const tunes = saved && saved.tunes;
    if (tunes && tunes.anyTune) {
      repaint(fingerprintOfBlock(block, tunes));
    }
  }).catch(() => {
    // A block that cannot save cannot be fingerprinted any better than the DOM
    // already has been; the menu stays as painted.
  });
}

// Measured on EditorJS 2.31.6: pressing the block settings button COLLAPSES a
// cross-block selection to the one block that was clicked, and the tune's
// render() runs after that — four drag-selected paragraphs come back as one. So
// the selection is snapshotted on the way down, while it is still live, and the
// menu falls back to the snapshot. The snapshot is only trusted for the gesture
// that made it: same editor, seconds old, and it has to contain the block whose
// menu is opening, or it is describing some older selection.
const SELECTION_SNAPSHOT_MS = 1500;
let selectionSnapshot = null; // { redactor, blockEls, at }
let snapshotListenerAttached = false;

function snapshotSelection(e) {
  const target = e.target;
  if (!target || !target.closest || !target.closest('.ce-toolbar')) {
    return;
  }
  const editorEl = target.closest('.codex-editor');
  const redactor = editorEl && editorEl.querySelector('.codex-editor__redactor');
  if (!redactor) {
    return;
  }
  selectionSnapshot = {
    redactor,
    blockEls: Array.from(redactor.querySelectorAll('.ce-block--selected')),
    at: Date.now(),
  };
}

// Capture phase and once per page: it has to run before EditorJS's own
// mousedown handling, whichever editor instance the toolbar belongs to.
function ensureSnapshotListener() {
  if (snapshotListenerAttached) {
    return;
  }
  document.addEventListener('mousedown', snapshotSelection, true);
  snapshotListenerAttached = true;
}

function snapshotFor(redactor, fallbackBlock) {
  const snapshot = selectionSnapshot;
  if (!snapshot || snapshot.redactor !== redactor || snapshot.blockEls.length < 2) {
    return null;
  }
  if (Date.now() - snapshot.at > SELECTION_SNAPSHOT_MS) {
    return null;
  }
  const holder = fallbackBlock && fallbackBlock.holder;
  return holder && snapshot.blockEls.indexOf(holder) !== -1 ? snapshot.blockEls : null;
}

/**
 * The blocks a menu click should act on: every cross-selected block when there
 * is a cross-block selection, else just the block the menu was opened from.
 *
 * Ids rather than BlockAPIs, because they are captured when the menu OPENS and
 * used when an item is activated — by which time a conversion may have replaced
 * the block objects.
 *
 * @param {object} api  the editor API, or the editor instance: both expose .blocks
 */
function targetBlockIds(api, redactor, fallbackBlock) {
  let selected = redactor ? Array.from(redactor.querySelectorAll('.ce-block--selected')) : [];
  if (selected.length < 2) {
    selected = snapshotFor(redactor, fallbackBlock) || selected;
  }
  const ids = selected
    .map((el) => api.blocks.getBlockByElement(el))
    .filter(Boolean)
    .map((block) => block.id);
  if (ids.length) {
    return ids;
  }
  return fallbackBlock ? [fallbackBlock.id] : [];
}

function redactorOf(holderEl) {
  return holderEl ? holderEl.querySelector('.codex-editor__redactor') : null;
}

function currentBlockOf(api) {
  const index = api.blocks.getCurrentBlockIndex();
  return index >= 0 ? api.blocks.getBlockByIndex(index) || null : null;
}

// ---------------------------------------------------------------------------
// Applying a preset
// ---------------------------------------------------------------------------

function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

// Size wrappers stripProperty leaves behind. It only touches elements whose
// inline style it has just taken away, so a <span class="fontsize-tool"> that
// never carried one — or a legacy editor-fs-* class outside the range the
// themes defined, which upgradeLegacyMarkup deliberately leaves alone because
// it renders as no size at all — would survive. A preset owns size, so both go.
function unwrapSizeWrappers(root) {
  Array.from(root.querySelectorAll('span[class]')).forEach((el) => {
    const classes = Array.from(el.classList);
    if (!classes.length || !classes.every((name) => SIZE_CLASS.test(name))) {
      return;
    }
    el.removeAttribute('class');
    // A span carrying some other inline style is still doing a job; only the
    // size class goes.
    if (!el.getAttribute('style')) {
      unwrap(el);
    }
  });
}

// Remove `props` from one block's HTML, leaving everything else — bold, italic,
// links, line breaks — exactly as it was. Legacy markup is upgraded on the way,
// so a legacy block clears like a current one.
function stripStyles(html, props, tag) {
  const root = document.createElement('div');
  root.innerHTML = upgradeLegacyMarkup(html, tag, document) || '';
  props.forEach((prop) => stripProperty(root, prop));
  if (props.indexOf('fontSize') !== -1) {
    unwrapSizeWrappers(root);
  }
  return root.innerHTML;
}

// One fragment of a block's text, restyled for `plan`.
function restyle(html, plan, tag) {
  if (plan.clear) {
    return stripStyles(html, PRESET_PROPS, tag);
  }
  // A preset owns size as much as colour, so the existing size always comes off
  // first — whether or not the preset names one. Without this, "Body" over an
  // old "Intro" keeps the intro size, AND "Intro" over a block carrying a
  // styleless <span class="fontsize-tool"> or an out-of-range editor-fs-* class
  // nests one size wrapper inside another: applyWholeBlockStyles only strips
  // the sizes it can see as inline styles, and those two carry none.
  // A highlight is left alone — presets do not own it, and only "None" clears
  // it — so the strip list here is the size and nothing else.
  const base = stripStyles(html, ['fontSize'], tag);
  // includeLinks: a preset is a statement about the whole block, and the theme's
  // own `a { color }` beats a colour the link merely inherits — so without this
  // every link in the block kept the site's link colour and the preset looked
  // like it had not applied. See applyWholeBlockStyles.
  return applyWholeBlockStyles(base, plan.styles, document, tag, { includeLinks: true });
}

/**
 * One list block's items, restyled.
 *
 * Items come in either shape the list tools have used: a plain HTML string
 * (@editorjs/list v1, which is what this fork bundles and what
 * ListBlockParser.cs reads), or v2's { content, items } node with its own
 * nested children. Nested bullets are styled too — they are part of the block
 * the preset was applied to — and anything unrecognised is passed through
 * untouched rather than flattened to a string.
 *
 * @returns {{ items: Array, changed: boolean }} `changed` decides whether the
 *   block is updated at all, so an unchanged list is not rewritten.
 */
function restyleItems(items, plan, tag) {
  let changed = false;
  const styled = items.map((item) => {
    if (typeof item === 'string') {
      const text = restyle(item, plan, tag);
      if (text !== item) {
        changed = true;
      }
      return text;
    }
    if (!item || typeof item !== 'object') {
      return item;
    }
    const next = { ...item };
    if (typeof item.content === 'string') {
      next.content = restyle(item.content, plan, tag);
      if (next.content !== item.content) {
        changed = true;
      }
    }
    if (Array.isArray(item.items)) {
      const nested = restyleItems(item.items, plan, tag);
      if (nested.changed) {
        next.items = nested.items;
        changed = true;
      }
    }
    return next;
  });
  return { items: styled, changed };
}

// Data overrides for blocks.convert(), the same trick the format painter uses:
// convert() sanitises the exported text against the NEW tool's field-level
// config, which strips every inline tag and <br>, so the raw export goes back
// in as an override and carries the block's own formatting through the type
// change. See rawExport in ../formatPainter.
function conversionOverrides(saved, plan) {
  const overrides = {};
  const raw = rawExport(saved);
  if (plan.tool === 'header' && plan.level) {
    overrides.level = plan.level;
  }
  if (raw !== undefined) {
    overrides.text = raw;
  }
  return overrides;
}

async function applyPresetToBlock(api, block, plan) {
  let saved = await block.save();
  if (!saved) {
    return;
  }
  // "None" never converts, so a block with no styleable text has nothing it
  // could do; the caller reports it and moves on to the rest of the selection.
  if (plan.clear && !STYLABLE_TOOLS.includes(saved.tool)) {
    throw new Error(`${saved.tool} has no text a preset can clear`);
  }
  // Captured before anything else: blocks.convert() drops tune data, and
  // blocks.update() replaces every tune with what it is handed, so the block's
  // own anchor and padding have to be carried across by hand.
  const tunes = { ...saved.tunes };
  let target = block;

  // Lists and quotes keep their type (see the header comment); everything else
  // converts when the preset names a different one. An unconvertible block —
  // table, image, button — throws here and is reported by the caller.
  const converted = !plan.clear && KEEPS_TYPE.indexOf(saved.tool) === -1 && saved.tool !== plan.tool;
  if (converted) {
    target = await api.blocks.convert(block.id, plan.tool, conversionOverrides(saved, plan));
    saved = await target.save();
    if (!saved) {
      return;
    }
  }

  const data = saved.data || {};
  const update = {};
  // Same-type level changes go through update(): convert() to the type a block
  // already has is not a conversion.
  if (!plan.clear && saved.tool === 'header' && plan.level && data.level !== plan.level) {
    update.level = plan.level;
  }
  const tag = blockTagOf({ type: saved.tool, data: { ...data, level: update.level || data.level } });

  if (saved.tool === 'list') {
    const restyled = restyleItems(data.items || [], plan, tag);
    if (restyled.changed) {
      update.items = restyled.items;
    }
  } else {
    // `text` only, for a quote as much as for a paragraph or a heading: the
    // update is merged into the block's existing data, so a quote's caption and
    // its own alignment field come through untouched.
    const text = restyle(data.text || '', plan, tag);
    if (text !== (data.text || '')) {
      update.text = text;
    }
  }

  // Alignment only when the preset names one: otherwise the block keeps its own.
  //
  // The test is against `alignmentTune` alone, NOT against alignmentOfTunes:
  // the server reads only alignmentTune, so a block whose alignment still lives
  // under the legacy `anyTune` key needs alignmentTune written even though it
  // already looks aligned — otherwise applying a centring preset to an old
  // centred block is a silent no-op and the alignment stays invisible to this
  // editor for good. And `anyTune` goes when alignmentTune is written, so the
  // two keys can never be left disagreeing.
  let alignmentChanged = false;
  if (plan.alignment) {
    // What the server reads today, and the legacy value that would contradict
    // it. Either being wrong is a write; the tune stores nothing for its 'left'
    // default, so absent and left are the same thing on both sides.
    const written = (tunes.alignmentTune && tunes.alignmentTune.alignment) || 'left';
    const legacy = tunes.anyTune && tunes.anyTune.alignment;
    if (written !== plan.alignment || legacy) {
      tunes.alignmentTune = plan.alignment === 'left' ? undefined : { alignment: plan.alignment };
      if (legacy) {
        // Only an alignment is dropped: `anyTune` is somebody else's key and
        // anything else it might hold is none of this preset's business.
        delete tunes.anyTune;
      }
      alignmentChanged = true;
    }
    // Some tools keep their own alignment as well as taking the tune, and the
    // tune is not what they render from: @editorjs/quote shows "Align Left" /
    // "Align Center" rows of its own in the same settings popover, renders from
    // data.alignment, and QuoteBlockParser.cs reads that field and not the
    // tune. Writing only the tune centred the quote in the editor while its own
    // setting — and the published page — still said left, which is exactly the
    // "in settings it was still left aligned" that was reported. Written only
    // for the values the tool has a setting for; the tune still records the
    // rest, though on a quote they change nothing on the published page —
    // Block-Quote.cshtml looks for "center" and nothing else, so right and
    // justify are front-end no-ops there whichever key carries them.
    const own = OWN_ALIGNMENT_TOOLS[saved.tool];
    if (own && own.indexOf(plan.alignment) !== -1 && data.alignment !== plan.alignment) {
      update.alignment = plan.alignment;
    }
  }

  if (!converted && !Object.keys(update).length && !alignmentChanged) {
    return;
  }
  // Always with tunes: update() treats a missing tunes argument as "no tunes",
  // which would wipe the block's anchor and padding.
  await api.blocks.update(target.id, update, tunes);
}

/**
 * Apply one preset to one or more blocks.
 *
 * Sequential rather than parallel: each step converts and re-saves the block it
 * is working on, and EditorJS's block manager is not re-entrant. The whole loop
 * still lands inside one 400 ms observer window, so it is one undo step.
 *
 * @param {object} api       the editor API, or the editor instance
 * @param {string[]} blockIds
 * @param {object} preset    an entry from ./presets.js
 */
export async function applyPreset(api, blockIds, preset) {
  const plan = resolve(preset, ground());
  if (!plan || !blockIds || !blockIds.length) {
    return;
  }
  for (const id of blockIds) {
    const block = api.blocks.getById(id);
    if (!block) {
      continue;
    }
    try {
      await applyPresetToBlock(api, block, plan);
    } catch (e) {
      // Blocks with no convertible text (tables, images, buttons) are skipped
      // rather than aborting the rest of the selection.
      console.warn(`Text presets: could not style ${block.name} block`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. The block tune: Style > [ground toggle, presets, None]
// ---------------------------------------------------------------------------

// Re-label the ground row and re-mark the active preset in an OPEN settings
// popover after the ground has been flipped. The popover is EditorJS-owned and
// its items take no updates after render, and onActivate is called with the
// item's params only (no event, no element), so the rows are found by the
// data-item-name EditorJS writes from `name`.
function refreshTuneMenu(list, fingerprint) {
  // Searched from the document rather than from one popover element: only one
  // settings popover is ever open, and the nested list EditorJS renders for
  // `children` is not always a descendant of the row it belongs to.
  const root = document;
  const groundRow = root.querySelector(`[data-item-name="${GROUND_ITEM_NAME}"]`);
  if (groundRow) {
    const title = groundRow.querySelector('.ce-popover-item__title');
    if (title) {
      title.textContent = groundLabel();
    }
    const icon = groundRow.querySelector('.ce-popover-item__icon');
    if (icon) {
      icon.innerHTML = GROUND_ICONS[ground()];
    }
  }
  list.forEach((preset) => {
    const row = root.querySelector(`[data-item-name="${itemName(preset)}"]`);
    if (!row) {
      return;
    }
    const icon = row.querySelector('.ce-popover-item__icon');
    if (icon) {
      icon.innerHTML = swatchIcon(preset);
    }
    row.classList.toggle('ce-popover-item--active', matchesFingerprint(preset, ground(), fingerprint, document));
  });
}

// `list` is the island read for this menu, threaded through so the ground
// toggle's refresh cannot pick up a different table half way through a gesture.
function tuneMenuItems(api, list, fingerprint, blockIds) {
  const items = [
    {
      icon: GROUND_ICONS[ground()],
      title: groundLabel(),
      name: GROUND_ITEM_NAME,
      // The popover stays open: flipping the ground is a step towards picking a
      // preset, not an action of its own.
      closeOnActivate: false,
      onActivate: () => {
        toggleGround();
        refreshTuneMenu(list, fingerprint);
      },
    },
    { type: 'separator' },
  ];
  list.forEach((preset) => {
    items.push({
      icon: swatchIcon(preset),
      // Escaped: EditorJS puts `title` into the row with innerHTML. See
      // escapeHtml.
      title: escapeHtml(preset.label),
      name: itemName(preset),
      isActive: matchesFingerprint(preset, ground(), fingerprint, document),
      closeOnActivate: true,
      onActivate: () => applyPreset(api, blockIds, preset),
    });
  });
  return items;
}

/**
 * The `textPreset` block tune. Registered in ../../index.js as both a tool and
 * a tune, so every block gets a "Style" row in its settings popover.
 *
 * It saves nothing: a preset leaves ordinary inline markup behind, so there is
 * no preset state to store on the block (and nothing for the C# parsers to
 * learn).
 */
export default class TextPresetTune {
  static get isTune() {
    return true;
  }

  constructor({ api, block }) {
    this.api = api;
    this.block = block;
    ensureSnapshotListener();
  }

  render() {
    if (MENU_TOOLS.indexOf(this.block.name) === -1) {
      // Tables, images and buttons carry no text a preset could own.
      return [];
    }
    const fingerprint = fingerprintOfBlock(this.block);
    // Captured now, while the popover is opening: whether a cross-block
    // selection survives the click that opens it is EditorJS's business, and
    // reading it later would be reading it after any conversion has run.
    const holder = this.block.holder;
    const redactor = holder ? holder.closest('.codex-editor__redactor') : null;
    const blockIds = targetBlockIds(this.api, redactor, this.block);
    const selectionCount = blockIds.length;
    const list = presets();
    repaintForLegacyAlignment(this.block, (corrected) => refreshTuneMenu(list, corrected));
    return {
      icon: PRESET_ICON,
      title: selectionCount > 1 ? `Style (${selectionCount} blocks)` : 'Style',
      name: 'textPreset',
      children: {
        searchable: false,
        items: tuneMenuItems(this.api, list, fingerprint, blockIds),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// 2. The toolbar button and its own dropdown
// ---------------------------------------------------------------------------

function closeDropdown() {
  if (!openMenu) {
    return;
  }
  const { element, onDocMouseDown, onScroll, button } = openMenu;
  document.removeEventListener('mousedown', onDocMouseDown, true);
  window.removeEventListener('scroll', onScroll, true);
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
  if (button) {
    button.classList.remove('ce-text-preset-btn--active');
  }
  openMenu = null;
}

// Anchored to the button in FIXED coordinates and parented to <body>, not to
// the toolbar: EditorJS hides .ce-toolbar whenever the pointer leaves a block,
// which would take the menu with it, and .codex-editor is a stacking context
// that a menu drawn inside it cannot escape (see the z-index note in
// ../../css/index.scss).
function positionDropdown(element, button) {
  const rect = button.getBoundingClientRect();
  const size = element.getBoundingClientRect();
  const gap = 4;
  let top = rect.bottom + gap;
  if (top + size.height > window.innerHeight - 8 && rect.top - gap - size.height > 8) {
    top = rect.top - gap - size.height;
  }
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - size.width - 8));
  element.style.top = `${Math.max(8, top)}px`;
  element.style.left = `${left}px`;
}

/**
 * Our own menu for the toolbar button.
 *
 * @returns {{ element: HTMLElement, paint: (fingerprint: object) => void }}
 *   `paint` re-marks the active row for a corrected fingerprint; see
 *   repaintForLegacyAlignment.
 */
function buildDropdown(api, fingerprint, blockIds) {
  let current = fingerprint;
  const element = document.createElement('div');
  element.className = 'ce-text-preset-menu';

  const groundRow = document.createElement('button');
  groundRow.type = 'button';
  groundRow.className = 'ce-text-preset-menu__ground';

  const groundSwatch = document.createElement('span');
  groundSwatch.className = 'ce-text-preset-menu__ground-swatch';
  const groundLabelEl = document.createElement('span');

  const paintGround = () => {
    const dark = ground() === DARK_GROUND;
    groundSwatch.style.backgroundColor = dark ? '#1d202b' : '#ffffff';
    groundLabelEl.textContent = groundLabel();
    // Same reason as swatchIcon's backdrop: light swatches need a dark chip.
    element.classList.toggle('ce-text-preset-menu--dark', dark);
  };
  paintGround();
  groundRow.appendChild(groundSwatch);
  groundRow.appendChild(groundLabelEl);
  element.appendChild(groundRow);

  const separator = document.createElement('div');
  separator.className = 'ce-text-preset-menu__sep';
  element.appendChild(separator);

  const rows = [];
  presets().forEach((preset) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'ce-text-preset-menu__item';
    row.dataset.presetId = preset.id;

    const swatch = document.createElement('span');
    swatch.className = 'ce-text-preset-menu__swatch';
    if (isClearPreset(preset)) {
      swatch.classList.add('ce-text-preset-menu__swatch--none');
    }
    const label = document.createElement('span');
    // textContent, never innerHTML: the labels can come from a site's island.
    label.textContent = preset.label;
    row.appendChild(swatch);
    row.appendChild(label);

    // mousedown + preventDefault, like the format painter's brush: a click would
    // move focus out of the editor and drop the caret and the cross-selection.
    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDropdown();
      applyPreset(api, blockIds, preset);
    });
    element.appendChild(row);
    rows.push({ preset, row, swatch });
  });

  const paintRows = () => {
    rows.forEach(({ preset, row, swatch }) => {
      if (!isClearPreset(preset)) {
        swatch.style.backgroundColor = swatchColor(preset);
      }
      row.classList.toggle(
        'ce-text-preset-menu__item--active',
        matchesFingerprint(preset, ground(), current, document),
      );
    });
  };
  paintRows();

  groundRow.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleGround();
    paintGround();
    paintRows();
  });

  return {
    element,
    paint: (corrected) => {
      current = corrected;
      paintRows();
    },
  };
}

export function attachTextPresets(editor, holderEl) {
  if (!holderEl) {
    return;
  }
  ensureSnapshotListener();

  // Whether a preset has anything to say about this block's tool.
  const isStyleable = (block) => !!block && MENU_TOOLS.indexOf(block.name) !== -1;

  // The block the toolbar is currently pointing at. EditorJS moves the toolbar
  // to whichever block the pointer is over but exposes no API for "the block
  // the toolbar is on", so it is remembered from the same mouseover that syncs
  // the button — and it is the only thing that still knows which block the user
  // means once the pointer has left that block to reach the button.
  let toolbarBlockEl = null;
  // The block the button was last synced for; see the mouseover listener below.
  let lastBlockEl = null;

  const blockOfEl = (el) => {
    const blockEl = el && el.closest ? el.closest('.ce-block') : null;
    if (!blockEl) {
      return null;
    }
    try {
      // A remembered element can outlive its block (deleted, or the tool
      // re-rendered): getBlockByElement then gives nothing — or throws, on a
      // node it no longer recognises — and the next candidate is used.
      return editor.blocks.getBlockByElement(blockEl) || null;
    } catch (e) {
      return null;
    }
  };

  const firstBlockOf = (api) => {
    try {
      return api.blocks.getBlocksCount() > 0 ? api.blocks.getBlockByIndex(0) || null : null;
    } catch (e) {
      return null;
    }
  };

  // The block a hover or a click on the button is about, in the order the
  // editor reads as "the block I am looking at":
  //
  //   1. the block under the pointer, when the event came from inside one;
  //   2. the block the toolbar is on — the one the pointer opened it over and
  //      has just left in order to reach the button;
  //   3. the caret's block, for a caret moved by keyboard with no hover;
  //   4. with `allowFirst`, the first block.
  //
  // (3) alone used to decide the click, and that was the disappearing-button
  // bug: EditorJS has no current block until the user has placed a caret, so on
  // an editor that has only ever been hovered getCurrentBlockIndex() is -1, the
  // click read that as "unstyleable block" and hid the button the editor had
  // just pressed. Hover and click now resolve the block the same way, so the
  // two can no longer disagree about whether there is anything to style.
  //
  // (4) is for deciding whether to SHOW the button on an editor nobody has
  // touched yet, and for nothing else. Only the caller that paints the button
  // asks for it: guessing a block to show chrome for is harmless, guessing one
  // to rewrite is not, so the click never takes it — a click that resolves to
  // nothing re-syncs the button and opens no menu, rather than restyling
  // whatever happens to be at the top of the widget.
  const targetBlock = (fromEl, allowFirst) => blockOfEl(fromEl)
    || blockOfEl(toolbarBlockEl)
    || currentBlockOf(editor)
    || (allowFirst ? firstBlockOf(editor) : null);

  // The toolbar actions row is ONE row reused for every block, so the button's
  // state has to follow the block the toolbar is pointing at — see MENU_TOOLS
  // for why a table must not get a live-looking button. Hidden with an inline
  // style rather than a class: it beats the display rule in ./index.css with no
  // second rule to keep in step.
  //
  // This is the ONLY place the button is hidden.
  const syncButton = (button, fromEl) => {
    const styleable = isStyleable(targetBlock(fromEl, true));
    button.style.display = styleable ? '' : 'none';
    return styleable;
  };

  const openDropdown = (button, block) => {
    const redactor = redactorOf(holderEl);
    const blockIds = targetBlockIds(editor, redactor, block);
    if (!blockIds.length) {
      return;
    }
    const fingerprint = block ? fingerprintOfBlock(block) : null;
    const { element, paint } = buildDropdown(editor, fingerprint, blockIds);
    document.body.appendChild(element);
    positionDropdown(element, button);
    button.classList.add('ce-text-preset-btn--active');
    // Legacy alignment lands a microtask later; ignore it if this menu has
    // already been closed or replaced in the meantime.
    repaintForLegacyAlignment(block, (corrected) => {
      if (openMenu && openMenu.element === element) {
        paint(corrected);
      }
    });

    const onDocMouseDown = (e) => {
      if (element.contains(e.target) || button.contains(e.target)) {
        return;
      }
      closeDropdown();
    };
    const onScroll = () => closeDropdown();
    document.addEventListener('mousedown', onDocMouseDown, true);
    // Fixed position does not follow a scrolling page, so close rather than
    // leave the menu stranded beside the wrong block.
    window.addEventListener('scroll', onScroll, true);
    openMenu = { element, button, onDocMouseDown, onScroll };
  };

  const onButtonMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const wasOpen = !!openMenu;
    closeDropdown();
    // Re-checked here as well as on hover: a keyboard caret move can put the
    // toolbar on an unstyleable block without a mouseover ever firing. Resolved
    // as the hover does, minus the first-block guess — see targetBlock.
    const block = targetBlock(null, false);
    if (!isStyleable(block)) {
      // Hand the decision back to the one place that owns it and let the next
      // hover re-decide from scratch. Hiding the button here is what made it
      // vanish under the pointer, and the stale lastBlockEl then kept it hidden
      // until the pointer had visited some other block.
      lastBlockEl = null;
      syncButton(e.currentTarget, null);
      return;
    }
    if (!wasOpen) {
      openDropdown(e.currentTarget, block);
    }
  };

  const injectButton = () => {
    const actions = holderEl.querySelector('.ce-toolbar__actions');
    if (!actions) {
      return false;
    }
    if (actions.querySelector('.ce-text-preset-btn')) {
      return true;
    }
    const button = document.createElement('span');
    button.className = 'ce-text-preset-btn';
    button.title = 'Text presets — apply a named style (heading, intro, body, small print) to this block or to every selected block';
    button.innerHTML = PRESET_ICON;
    button.addEventListener('mousedown', onButtonMouseDown);
    actions.appendChild(button);
    syncButton(button, null);
    return true;
  };

  // One listener per editor, and only recomputed when the pointer crosses into
  // a different block: mouseover fires for every element inside one.
  holderEl.addEventListener('mouseover', (e) => {
    const blockEl = e.target && e.target.closest ? e.target.closest('.ce-block') : null;
    // Nothing outside a block re-decides this. The toolbar is a sibling of the
    // blocks, so the pointer leaves the block on its way to the button — and
    // re-deciding there would show the button again over the very table it was
    // just hidden for.
    if (!blockEl || blockEl === lastBlockEl) {
      return;
    }
    lastBlockEl = blockEl;
    const button = holderEl.querySelector('.ce-text-preset-btn');
    if (button) {
      syncButton(button, e.target);
    }
  });

  // The block the toolbar is on is remembered from pointer MOTION, not from
  // mouseover. Chrome re-fires mouseover under a stationary pointer whenever
  // the DOM beneath it changes, and EditorJS changes it on every keypress (it
  // closes the toolbar), so a mouseover-fed memory was restored a millisecond
  // after the keydown below cleared it — measured: one mouseover on the old
  // block after each keydown, and no mousemove at all. mousemove only fires
  // when the user really moves the mouse, which is the signal meant here.
  holderEl.addEventListener('mousemove', (e) => {
    const blockEl = e.target && e.target.closest ? e.target.closest('.ce-block') : null;
    if (blockEl) {
      toolbarBlockEl = blockEl;
    }
  });

  // A key pressed inside the editor moves the caret, and from then on the caret
  // is what the user means — not the block the pointer happened to rest on
  // earlier. Arrow down out of a hovered paragraph and the remembered element
  // would otherwise still outrank the caret in targetBlock and style the block
  // the user has just left. Forgetting it lets the caret win; the next real
  // pointer movement re-establishes the hover, and clearing lastBlockEl makes
  // the mouseover re-sync the button even if the pointer never left the block.
  holderEl.addEventListener('keydown', () => {
    toolbarBlockEl = null;
    lastBlockEl = null;
  }, true);

  // The toolbar actions row may not exist at init; retry via observer, exactly
  // as the format painter injects its brush.
  if (!injectButton()) {
    const observer = new MutationObserver(() => {
      if (injectButton()) {
        observer.disconnect();
      }
    });
    observer.observe(holderEl, { childList: true, subtree: true });
  }

  // One shared Esc handler closes whichever dropdown is open.
  if (!escListenerAttached) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openMenu) {
        closeDropdown();
      }
    });
    escListenerAttached = true;
  }
}
