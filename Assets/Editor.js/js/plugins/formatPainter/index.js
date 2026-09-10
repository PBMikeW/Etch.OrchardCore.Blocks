import './index.css';
import { extractWholeBlockStyles, applyWholeBlockStyles } from './inlineStyles';
import { blockTagOf } from '../utils/legacyMarkup';

/**
 * Format Painter for EditorJS.
 *
 * Adds a paintbrush button to the block toolbar actions row (next to the
 * "+", move and settings buttons). First click copies the current block's
 * format and enters "painting" mode; while painting, clicking a block — or
 * drag-selecting several — applies that format to them. Esc, or clicking the
 * brush again, exits painting mode.
 *
 * What is copied:
 *   - block type, heading level and list style (ordered / unordered)
 *   - the alignment tune
 *   - whole-block inline styles: colour, highlight and font size, each only
 *     when every non-blank text node in the source block carries the same
 *     value (see ./inlineStyles). A partially coloured block copies no
 *     colour, and a style the source lacks leaves the target's own untouched.
 *     Legacy <font color> and editor-fs-* markup counts, and painted text
 *     always comes out in the current tools' markup.
 * Not copied: bold / italic / links, and the padding and anchor tunes (layout
 * and uniqueness respectively — the target keeps its own).
 *
 * Only paragraph, header, list and quote blocks can be copied from. Targets
 * that cannot be converted (tables, images, embeds, …) are skipped. Quote
 * targets take type and alignment only: the quote tool has no inline toolbar,
 * so its sanitiser strips inline wrappers on save anyway.
 *
 * State (the copied format + painting flag) is module-scoped and therefore
 * shared across EVERY editor instance on the page. Each ContentBlock widget
 * is a separate EditorJS instance, so this lets you copy a format in one
 * ContentBlock and paint it onto blocks in another.
 *
 * EditorJS exposes no public API for adding a button to the toolbar actions
 * row, so the button is injected into `.ce-toolbar__actions` directly. This
 * touches only EditorJS's rendered DOM, not the library itself.
 */

const BRUSH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 4 4"/><path d="M18 2l4 4-8.5 8.5a2 2 0 0 1-1 .55L9 16l.95-3.5a2 2 0 0 1 .55-1L18 2z"/><path d="M9 16c-2 0-3 1-3 3 0 1-1 2-3 2 1-1 1-2 1-3 0-2 1-3 3-3"/></svg>`;

// Tool names as registered in ../../index.js (shared by the web and portal
// sites). Tools whose format can be copied:
const TEXT_TOOLS = ['paragraph', 'header', 'list', 'quote'];
// Tools whose saved text keeps inline markup (quote's sanitiser strips it):
const STYLABLE_TOOLS = ['paragraph', 'header', 'list'];

// Shared across all editor instances on the page.
let copied = null; // { tool, level, listStyle, alignment, styles }
let painting = false;
const instances = []; // { editor, holderEl, button }
let keyListenerAttached = false;

function syncVisuals() {
  instances.forEach(({ holderEl, button }) => {
    if (button) {
      button.classList.toggle('ce-format-painter-btn--active', painting);
    }
    holderEl.classList.toggle('ce-format-painting', painting);
  });
}

function setPainting(on) {
  painting = on;
  if (!on) {
    copied = null;
  }
  syncVisuals();
}

// The HTML fragments of a saved block that can carry inline styles.
function textFragments(saved) {
  const data = saved.data || {};
  if (!STYLABLE_TOOLS.includes(saved.tool)) {
    return [];
  }
  return saved.tool === 'list' ? data.items || [] : [data.text || ''];
}

// What EditorJS's own conversion exports for a block, but unsanitised.
// blocks.convert() cleans the exported string against the *new* tool's
// sanitize config, whose keys are field names (text, level, …) rather than
// tags, so every inline tag — colour, bold, links — and every <br> is
// stripped. Handing the raw text back as a data override keeps the target's
// formatting through the type change; the real field-level sanitiser still
// runs on save.
// Mirrors conversionConfig.export of @editorjs/paragraph 2.11, header 2.8,
// list 1.10 and quote 2.7 (a tool's exporter is not reachable through the
// public API); re-check when those packages are upgraded.
function rawExport(saved) {
  const tool = saved.tool;
  const data = saved.data || {};
  if (tool === 'paragraph' || tool === 'header') {
    return data.text || '';
  }
  if (tool === 'list') {
    return (data.items || []).join('. ');
  }
  if (tool === 'quote') {
    return data.caption ? `${data.text} — ${data.caption}` : data.text || '';
  }
  return undefined;
}

// The alignment tune saves nothing for the default, so absent means left.
function alignmentOf(tunes) {
  const tune = tunes && tunes.alignmentTune;
  return (tune && tune.alignment) || 'left';
}

export function attachFormatPainter(editor, holderEl) {
  if (!holderEl) {
    return;
  }

  const instance = { editor, holderEl, button: null };
  instances.push(instance);

  const getRedactor = () => holderEl.querySelector('.codex-editor__redactor');

  // Map a `.ce-block` element to its EditorJS BlockAPI (so we have id + name).
  // getBlockByElement() resolves the block that contains the element, which is
  // more robust than counting sibling indices.
  const blockElToApi = (blockEl) => editor.blocks.getBlockByElement(blockEl) || null;

  const copyCurrentFormat = async () => {
    const index = editor.blocks.getCurrentBlockIndex();
    if (index < 0) {
      return false;
    }
    const block = editor.blocks.getBlockByIndex(index);
    if (!block) {
      return false;
    }
    const saved = await block.save();
    if (!saved || !TEXT_TOOLS.includes(saved.tool)) {
      return false;
    }
    const data = saved.data || {};
    copied = {
      tool: saved.tool,
      level: saved.tool === 'header' ? data.level : undefined,
      listStyle: saved.tool === 'list' ? data.style : undefined,
      alignment: alignmentOf(saved.tunes),
      styles: extractWholeBlockStyles(textFragments(saved), document, blockTagOf({ type: saved.tool, data })),
    };
    return true;
  };

  // Data overrides for blocks.convert(): the copied heading level / list style
  // plus the target's own raw text (see rawExport).
  const conversionOverrides = (saved) => {
    const overrides = {};
    const raw = rawExport(saved);
    if (copied.tool === 'header' && copied.level) {
      overrides.level = copied.level;
    }
    if (copied.tool === 'list') {
      if (copied.listStyle) {
        overrides.style = copied.listStyle;
      }
      if (raw !== undefined) {
        overrides.items = [raw];
      }
    } else if (raw !== undefined && copied.tool === 'quote') {
      // Quote has no inline toolbar, so its saved text keeps only <br>. Clean
      // to that up front so the editor shows what will actually be saved, but
      // keep the line breaks a stock convert() would drop.
      overrides.text = editor.sanitizer.clean(raw, { br: true });
    } else if (raw !== undefined) {
      overrides.text = raw;
    }
    return overrides;
  };

  // Partial data update for a block that already has the copied type.
  const paintedData = (saved) => {
    const data = saved.data || {};
    const update = {};
    if (saved.tool === 'header' && copied.level && data.level !== copied.level) {
      update.level = copied.level;
    }
    if (saved.tool === 'list' && copied.listStyle && data.style !== copied.listStyle) {
      update.style = copied.listStyle;
    }
    if (Object.keys(copied.styles).length && STYLABLE_TOOLS.includes(saved.tool)) {
      const tag = blockTagOf({ type: saved.tool, data });
      if (saved.tool === 'list') {
        const items = data.items || [];
        const painted = items.map((item) => applyWholeBlockStyles(item, copied.styles, document, tag));
        if (painted.some((item, i) => item !== items[i])) {
          update.items = painted;
        }
      } else {
        const text = applyWholeBlockStyles(data.text || '', copied.styles, document, tag);
        if (text !== data.text) {
          update.text = text;
        }
      }
    }
    return update;
  };

  const paintBlock = async (block) => {
    let target = block;
    let saved = await block.save();
    if (!saved) {
      return;
    }
    // The target keeps its own anchor / padding; only alignment is painted.
    // Captured before conversion because blocks.convert() drops tunes data.
    const tunes = { ...saved.tunes };
    const converted = block.name !== copied.tool;
    if (converted) {
      const overrides = conversionOverrides(saved);
      try {
        target = await editor.blocks.convert(block.id, copied.tool, overrides);
      } catch (e) {
        // Tools without a conversionConfig (table, image, embed, …) can't be
        // converted; skip them rather than aborting the whole paint operation.
        return;
      }
      saved = await target.save();
      if (!saved) {
        return;
      }
    }
    const data = paintedData(saved);
    const alignmentChanged = alignmentOf(tunes) !== copied.alignment;
    if (!converted && !Object.keys(data).length && !alignmentChanged) {
      return;
    }
    tunes.alignmentTune = copied.alignment === 'left' ? undefined : { alignment: copied.alignment };
    await editor.blocks.update(target.id, data, tunes);
  };

  const applyTo = async (blockApis) => {
    if (!copied || !blockApis.length) {
      return;
    }
    for (const block of blockApis) {
      try {
        await paintBlock(block);
      } catch (e) {
        console.warn(`Format painter: could not paint ${block.name} block`, e);
      }
    }
  };

  const onBrushClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (painting) {
      setPainting(false);
      return;
    }
    if (await copyCurrentFormat()) {
      setPainting(true);
    }
  };

  // While painting, a mouseup inside the editor paints the target block(s).
  // mouseup (not click) lets drag-selection of multiple blocks complete first.
  const onEditorMouseUp = (e) => {
    if (!painting || !copied) {
      return;
    }
    // Ignore interactions with the toolbar / brush itself.
    if (e.target.closest && e.target.closest('.ce-toolbar')) {
      return;
    }
    const redactor = getRedactor();
    if (!redactor) {
      return;
    }

    // Prefer any cross-selected blocks; otherwise the single clicked block.
    let targetEls = Array.from(redactor.querySelectorAll('.ce-block--selected'));
    if (!targetEls.length) {
      const blockEl = e.target.closest && e.target.closest('.ce-block');
      if (blockEl) {
        targetEls = [blockEl];
      }
    }

    const apis = targetEls.map(blockElToApi).filter(Boolean);
    if (apis.length) {
      applyTo(apis);
    }
  };

  const injectButton = () => {
    const actions = holderEl.querySelector('.ce-toolbar__actions');
    if (!actions) {
      return false;
    }
    if (actions.querySelector('.ce-format-painter-btn')) {
      return true;
    }
    const button = document.createElement('span');
    button.className = 'ce-format-painter-btn';
    button.title = "Format painter — copy this block's format (type, alignment, whole-block colour / highlight / size), then click blocks to apply (Esc to stop)";
    button.innerHTML = BRUSH_ICON;
    // mousedown (not click) + preventDefault so the editor doesn't lose the
    // current block/caret selection when the brush is pressed.
    button.addEventListener('mousedown', onBrushClick);
    actions.appendChild(button);
    instance.button = button;
    if (painting) {
      button.classList.add('ce-format-painter-btn--active');
    }
    return true;
  };

  // The toolbar actions element may not exist at init; retry via observer.
  if (!injectButton()) {
    const observer = new MutationObserver(() => {
      if (injectButton()) {
        observer.disconnect();
      }
    });
    observer.observe(holderEl, { childList: true, subtree: true });
  }

  holderEl.addEventListener('mouseup', onEditorMouseUp, true);

  // One shared keydown listener handles Esc for all instances.
  if (!keyListenerAttached) {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && painting) {
        setPainting(false);
      }
    });
    keyListenerAttached = true;
  }
}
