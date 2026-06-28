import './index.css';

/**
 * Format Painter for EditorJS.
 *
 * Adds a paintbrush button to the block toolbar actions row (next to the
 * "+", move and settings buttons). First click copies the current block's
 * format (block type + heading level) and enters "painting" mode; while
 * painting, clicking a block — or drag-selecting several — applies that
 * format to them. Esc, or clicking the brush again, exits painting mode.
 *
 * State (the copied format + painting flag) is module-scoped and therefore
 * shared across EVERY editor instance on the page. Each ContentBlock widget
 * is a separate EditorJS instance, so this lets you copy a format in one
 * ContentBlock and paint it onto blocks in another.
 *
 * EditorJS exposes no public API for adding a button to the toolbar actions
 * row, so the button is injected into `.ce-toolbar__actions` directly. This
 * touches only EditorJS's rendered DOM, not the library itself.
 *
 * MVP scope: block type + heading level only. Inline styles (font size /
 * colour / marker) are intentionally out of scope.
 */

const BRUSH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5 4 4"/><path d="M18 2l4 4-8.5 8.5a2 2 0 0 1-1 .55L9 16l.95-3.5a2 2 0 0 1 .55-1L18 2z"/><path d="M9 16c-2 0-3 1-3 3 0 1-1 2-3 2 1-1 1-2 1-3 0-2 1-3 3-3"/></svg>`;

// Shared across all editor instances on the page.
let copied = null; // { tool, level }
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
    copied = {
      tool: saved.tool,
      level: saved.data ? saved.data.level : undefined,
    };
    return true;
  };

  const applyTo = async (blockApis) => {
    if (!copied || !blockApis.length) {
      return;
    }
    const wantsLevel = copied.tool === 'header' && copied.level;
    for (const block of blockApis) {
      try {
        if (block.name === copied.tool) {
          // Same block type already — only the heading level may differ.
          if (wantsLevel) {
            await editor.blocks.update(block.id, { level: copied.level });
          }
        } else {
          await editor.blocks.convert(
            block.id,
            copied.tool,
            wantsLevel ? { level: copied.level } : {},
          );
        }
      } catch (e) {
        // Tools without a conversionConfig can't be converted; skip them
        // rather than aborting the whole paint operation.
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
    button.title = "Format painter — copy this block's format, then click blocks to apply (Esc to stop)";
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
