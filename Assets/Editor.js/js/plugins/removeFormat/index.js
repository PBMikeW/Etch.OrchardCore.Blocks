import { clearFormatting } from './clearFormatting';

/**
 * RemoveFormat — inline tool that strips inline formatting from the selection.
 *
 * Clears colour, highlight, font size (current `fontsize-tool` markup and the
 * legacy `editor-fs-*` classes), bold, italic, underline and anything else
 * pasted in as an inline wrapper, leaving the text and its line breaks. Links
 * are kept — only their own colour / size is removed — because losing an href
 * is not recoverable by retyping, and there is a separate link tool for that.
 *
 * All the DOM work lives in ./clearFormatting, which has no editor imports so
 * it can be unit tested outside the browser; this file is only the button, the
 * shortcut and the selection handover. See that module's header for why
 * execCommand and extractContents() are both unusable here.
 *
 * Registered last in `baseTools` (../../index.js) so it renders at the end of
 * the inline toolbar: the toolbar's order is tool registration order, and no
 * block tool overrides it with an `inlineToolbar` array.
 */

// Lucide "remove-formatting": a letterform with an X. Stroke-only so it takes
// the toolbar's currentColor in both the light and dark admin themes.
const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"/><path d="M5 20h6"/><path d="M13 4 8 20"/><path d="m15 15 5 5"/><path d="m20 15-5 5"/></svg>';

/**
 * Clear the formatting inside `range` and leave the selection over what was
 * cleared. Shared by the toolbar button and the keyboard shortcut below.
 *
 * @returns {boolean} whether anything was done, so the shortcut only claims
 *   the key when it acted.
 */
function clearRange(range) {
  if (!range || range.collapsed) return false;

  // The block's contenteditable element is the boundary for every split and
  // for the tree walk. commonAncestorContainer is a text node whenever the
  // selection sits inside one run, so step up to an element before closest().
  const anchor = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
  const root = anchor && anchor.closest('[contenteditable="true"]');
  if (!root) return false;

  const out = clearFormatting(range, root);

  // The lift rearranges the nodes the old selection pointed at, so restore it
  // from the fresh range clearFormatting hands back rather than trusting
  // api.selection.save(), whose marker does not survive the rearrangement.
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(out);

  return true;
}

// The block editable a node sits in, or null when it is not in one: a
// `.ce-block` contenteditable is block content, while the toolbox search and
// the tune inputs are editor chrome and keep their own shortcuts.
function blockEditableOf(node) {
  const el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
  const editable = el && el.closest('[contenteditable="true"]');
  return editable && editable.closest('.ce-block') ? editable : null;
}

/**
 * Editor.js registers `static shortcut` on `document`, but it de-registers
 * the binding against the redactor element rather than against the tool, so
 * on a page of several ContentBlock widgets each new editor tears the
 * previous registration down and the single handler left alive is the FIRST
 * toolbar's. Ctrl+Shift+X then only ever worked in widget one.
 *
 * So bind our own, exactly once for the bundle however many editors attach,
 * and read the live selection rather than a toolbar's saved range.
 */
let shortcutBound = false;

function onShortcutKeyDown(e) {
  if ((!e.ctrlKey && !e.metaKey) || !e.shiftKey || e.altKey) return;
  // e.code, not e.key: with Shift held e.key is already the shifted glyph,
  // which is not an x on every layout.
  if (e.code !== 'KeyX') return;
  if (!blockEditableOf(e.target)) return;

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return;
  if (!blockEditableOf(range.commonAncestorContainer)) return;
  if (!clearRange(range)) return;

  e.preventDefault();
}

function bindShortcut() {
  if (shortcutBound) return;
  shortcutBound = true;
  document.addEventListener('keydown', onShortcutKeyDown);
}

export default class RemoveFormat {
  static get isInline() {
    return true;
  }

  static get title() {
    return 'Remove formatting';
  }

  /**
   * The tool creates no markup of its own, so it contributes nothing to the
   * sanitiser config. (It must still answer: Editor.js merges every inline
   * tool's config when it sanitises a block on save.)
   */
  static get sanitize() {
    return {};
  }

  /**
   * Word's own shortcut for this is Ctrl+Space / Ctrl+\, but Editor.js's
   * shortcut parser only understands 0-9, A-Z and a short list of named keys,
   * so neither a backslash nor the space bar can be expressed. Ctrl+Shift+X is
   * the closest free binding. ("CMD" is Editor.js's platform-neutral spelling:
   * it is Ctrl on Windows.)
   */
  static get shortcut() {
    return 'CMD+SHIFT+X';
  }

  constructor({ api }) {
    this.api = api;
    this.button = null;
    bindShortcut();
  }

  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add('ce-inline-tool');
    this.button.innerHTML = ICON;

    return this.button;
  }

  surround(range) {
    clearRange(range);
  }

  /**
   * Nothing to be "active" in: clearing formatting is an action, not a state,
   * so the button never lights up.
   */
  checkState() {
    return false;
  }
}
