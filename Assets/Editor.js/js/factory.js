import Delimiter from '@editorjs/delimiter';
import Embed from '@editorjs/embed';
import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import Raw from '@editorjs/raw';
import Quote from '@editorjs/quote';
import Table from '@editorjs/table';
import EditorJS from '@editorjs/editorjs';
import AnchorTune from './plugins/anchorTuneWrapper';
import AlignmentTune from './plugins/alignmentTune';
import PaddingTune from './plugins/paddingTune';
import TextColor from 'editorjs-text-color-plugin';

import LinkTool from './plugins/link';
import FontSizeTool from './plugins/fontSize';
import RemoveFormat from './plugins/removeFormat';
import MediaLibrary from './plugins/mediaLibrary';
import IconBlock from './plugins/iconBlock';
import KbButton from './plugins/kbButton';
import Breadcrumb from './plugins/breadcrumb';
import { attachFormatPainter } from './plugins/formatPainter';
import TextPresetTune, { attachTextPresets } from './plugins/textPreset';
import { attachUndo, detachUndo, recordChange } from './plugins/crossWidgetUndo';
import { attachPopoverFlip } from './plugins/popoverFlip';
import { attachPopoverAnchor } from './plugins/popoverAnchor';
import withScopedActiveState from './plugins/utils/colorActiveState';
import withScopedSurround from './plugins/utils/colorSurroundScope';

/**
 * The block editor as a reusable factory.
 *
 * `createBlockEditor(holder, options)` builds one EditorJS instance with the
 * Blocks tool set and hands back a small handle. It is what
 * `initializeEditorJS` (the OrchardCore Blocks part/field editor) is built on,
 * and what other pages use through `window.EtchBlocks.create` (the course
 * studio, which owns its own state and media picker).
 *
 * The factory never writes a hidden input and never fires
 * `contentpreview:render`: it reports changes through `onChange` and the
 * caller decides what a change means.
 */

const DEFAULT_PLACEHOLDER = 'Enter your content here...';
const CHANGE_DEBOUNCE_MS = 300;
const UNDO_OFF = 'off';
const HOLDER_ID_PREFIX = 'etch-blocks-';

// textPreset first: "Style" is the most-used row of the settings popover, and
// the popover is already tall enough that anything below the padding inputs
// needs scrolling to reach.
const DEFAULT_TUNES = ['textPreset', 'alignmentTune', 'anchorTune', 'paddingTune'];

// The icon block lays its icon out with justify-content and offers its own
// left/centre/right in the block settings, which is what Block-Icon.cshtml
// renders. The editor-wide alignment tune writes text-align instead, so its
// four buttons sat above the real ones doing nothing. A tool's own `tunes`
// list replaces the editor-wide one (Editor.js reads it as the tool's
// enabledBlockTunes), so this is the global list minus that tune.
const ICON_TUNES = ['textPreset', 'anchorTune', 'paddingTune'];

let holderCounter = 0;

// Editor.js sometimes constructs inline tools without the registered config
// (seen opening the toolbox on @editorjs/editorjs 2.31.3: "Cannot read
// properties of undefined (reading 'colorCollections')"). Wrap the plugin so
// the constructor always receives its config, whatever the editor version does.
const withDefaultConfig = (ToolClass, defaults) =>
  class extends ToolClass {
    constructor(args = {}) {
      super({ ...args, config: args.config ?? defaults });
    }
  };

const colorToolConfig = {
  colorCollections: ['#F8F8F8', '#D1D1D1', '#72808A', '#FFCD00', '#EF4123', '#002D6A', '#FFF', '#000', '#99ABC3'],
  defaultColor: '#002D6A',
  type: 'text',
  customPicker: true,
};

const markerToolConfig = {
  defaultColor: '#FFBF00',
  type: 'marker',
  icon: `<svg fill="#000000" height="200px" width="200px" version="1.1" id="Icons" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 32 32" xml:space="preserve"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <g> <path d="M17.6,6L6.9,16.7c-0.2,0.2-0.3,0.4-0.3,0.6L6,23.9c0,0.3,0.1,0.6,0.3,0.8C6.5,24.9,6.7,25,7,25c0,0,0.1,0,0.1,0l6.6-0.6 c0.2,0,0.5-0.1,0.6-0.3L25,13.4L17.6,6z"></path> <path d="M26.4,12l1.4-1.4c1.2-1.2,1.1-3.1-0.1-4.3l-3-3c-0.6-0.6-1.3-0.9-2.2-0.9c-0.8,0-1.6,0.3-2.2,0.9L19,4.6L26.4,12z"></path> </g> <g> <path d="M28,29H4c-0.6,0-1-0.4-1-1s0.4-1,1-1h24c0.6,0,1,0.4,1,1S28.6,29,28,29z"></path> </g> </g></svg>`,
};

// Disable the A-button apply. editorjs routes an A-button click through
// surround() -> the plugin's wrap(), which does extractContents() +
// removeAllRanges() WITHOUT restoring the range, dropping the caret to the
// start of the block. Colour is applied via the swatch palette instead (its
// updateWrapper path re-adds the range and preserves the selection). No-op
// surround leaves the palette open on A-click but stops the caret jump.
// (Marker has no palette, so it keeps surround.)
//
// withScopedActiveState: the plugin lights its button from any ancestor
// <span>, so the font-size tool's <span class="fontsize-tool"> lit the
// highlighter. See ./plugins/utils/colorActiveState.
//
// withScopedSurround: and it *unwraps* any ancestor <span> before applying,
// which threw that font size away. Dead code here while surround() is a no-op,
// applied for the same reason the marker needs it. See
// ./plugins/utils/colorSurroundScope.
class ColorTool extends withScopedSurround(withScopedActiveState(withDefaultConfig(TextColor, colorToolConfig))) {
  surround() {
    // Deliberately empty: colour is applied from the swatch palette (see above).
  }
}

const MarkerTool = withScopedSurround(withScopedActiveState(withDefaultConfig(TextColor, markerToolConfig)));

/**
 * Flip the block-toolbar popovers upward when they would open off the bottom
 * of the viewport, and open the block-settings popover under the gear button
 * (or beside the block text for Ctrl/Cmd + "/"). Both are page-wide and
 * idempotent, so every editor can ask for them and they attach once.
 */
export function attachPageSingletons() {
  attachPopoverFlip();
  attachPopoverAnchor();
}

/**
 * The full Blocks tool map, keyed by the names saved into OutputData (and so
 * the names the server-side renderers and `tools.include`/`exclude` use).
 *
 * @param {object} context { instanceId, tenantPath, typeName, partName,
 *                         fieldName, pickMedia, mediaModalHost }
 */
export function buildBaseTools(context) {
  const { tenantPath } = context;

  return {
    alignmentTune: AlignmentTune,
    anchorTune: {
      class: AnchorTune,
    },
    paddingTune: PaddingTune,
    textPreset: TextPresetTune,
    breadcrumb: Breadcrumb,
    Color: {
      class: ColorTool,
      config: colorToolConfig,
    },
    Marker: {
      class: MarkerTool,
      config: markerToolConfig,
    },
    delimiter: Delimiter,
    embed: {
      class: Embed,
      config: {
        services: {
          'twitch-channel': true,
          'twitch-video': true,
          vimeo: true,
          youtube: true,
        },
      },
      inlineToolbar: true,
    },
    fontSize: FontSizeTool,
    // Last of the inline tools registered here, so its button renders at the
    // end of the inline toolbar (toolbar order is registration order).
    removeFormat: RemoveFormat,
    header: {
      class: Header,
      inlineToolbar: true,
    },
    icon: {
      class: IconBlock,
      config: {
        tenantPath,
      },
      tunes: ICON_TUNES,
    },
    image: {
      class: MediaLibrary,
      config: imageToolConfig(context),
    },
    kbButton: {
      class: KbButton,
      config: {
        // The icon picker previews icons from the sprite at
        // <tenantPath>/Etch.OrchardCore.Blocks/assets/heroicons.svg, the same
        // way the link tool builds its search URL.
        tenantPath,
      },
    },
    link: {
      class: LinkTool,
      config: {
        fieldName: context.fieldName,
        partName: context.partName,
        typeName: context.typeName,
        tenantPath,
      },
    },
    list: {
      class: List,
      inlineToolbar: true,
    },
    paragraph: {
      class: Paragraph,
      inlineToolbar: true,
      config: {
        preserveBlank: true,
      },
    },
    // With the inline toolbar the quote tool merges the inline tools'
    // sanitiser rules, so bold, links and colour survive save inside a quote
    // (without it every inline tag was stripped on save, which made text
    // presets a silent no-op on quotes).
    quote: {
      class: Quote,
      inlineToolbar: true,
    },
    raw: Raw,
    table: {
      class: Table,
      inlineToolbar: true,
      config: {
        rows: 2,
        cols: 3,
      },
    },
  };
}

// The media tool finds its modal by `id` (`<id>-ModalBody`) unless the caller
// names one, and skips the modal altogether when the caller brings a picker.
function imageToolConfig(context) {
  const config = { id: context.instanceId, tenantPath: context.tenantPath };
  if (context.mediaModalHost) {
    config.mediaModalHost = context.mediaModalHost;
  }
  if (typeof context.pickMedia === 'function') {
    config.pickMedia = context.pickMedia;
  }
  return config;
}

/**
 * Apply `tools.include` / `exclude` / `extra` to the base map. Include and
 * exclude match registered names (block tools, inline tools and tunes alike);
 * `extra` is added last, so it can also replace a built-in by name.
 */
export function filterTools(baseTools, toolOptions) {
  const { include, exclude, extra } = toolOptions || {};
  const allowed = Array.isArray(include) ? new Set(include) : null;
  const blocked = new Set(Array.isArray(exclude) ? exclude : []);
  const tools = {};

  Object.keys(baseTools).forEach((name) => {
    if ((allowed === null || allowed.has(name)) && !blocked.has(name)) {
      tools[name] = baseTools[name];
    }
  });

  return { ...tools, ...(extra || {}) };
}

// Tune lists name tools, so a tune that was filtered out has to leave them too
// or Editor.js warns about (and skips) an unknown tune.
function withAvailableTunes(tools) {
  const available = (name) => Object.hasOwn(tools, name);
  const icon = tools.icon;

  if (icon && icon.tunes === ICON_TUNES) {
    tools.icon = { ...icon, tunes: ICON_TUNES.filter(available) };
  }

  return { tools, tunes: DEFAULT_TUNES.filter(available) };
}

const logSaveError = (error) => {
  console.error('Blocks editor save failed', error);
};

/**
 * Calls `onChange` once a burst of changes has gone quiet. `push` hands over
 * data that is already saved; `pull` saves only when the wait is over, so an
 * editor that records nothing per change saves once per burst. A wait of 0
 * delivers straight away, which is what the hidden-input wrapper uses.
 *
 * Every delivery takes a turn number, and a save that resolves after a later
 * turn started is dropped, so an older save never lands over a newer one.
 * `flush(save)` cancels the wait and delivers a fresh save at once.
 */
function createChangeEmitter(onChange, waitMs) {
  let timer = null;
  let disposed = false;
  let turn = 0;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const deliver = (data) => {
    if (!disposed && data && typeof onChange === 'function') {
      onChange(data);
    }
  };

  const later = (run) => {
    cancel();
    turn += 1;
    if (waitMs <= 0) {
      run();
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      run();
    }, waitMs);
  };

  const deliverSaved = (save) => {
    const mine = turn;
    return save().then((data) => {
      if (mine === turn) {
        deliver(data);
      }
    });
  };

  return {
    push: (data) => later(() => deliver(data)),
    pull: (save) => later(() => {
      deliverSaved(save).catch(logSaveError);
    }),
    now: (data) => {
      cancel();
      turn += 1;
      deliver(data);
    },
    flush: (save) => {
      cancel();
      turn += 1;
      return disposed ? Promise.resolve() : deliverSaved(save);
    },
    dispose: () => {
      cancel();
      disposed = true;
    },
  };
}

function resolveHolder(holder) {
  const element = typeof holder === 'string' ? document.getElementById(holder) : holder;
  if (!element) {
    throw new Error('Blocks editor: holder element not found');
  }
  if (!element.id) {
    holderCounter += 1;
    element.id = `${HOLDER_ID_PREFIX}${holderCounter}`;
  }
  return element;
}

// Expose each editor instance so external code (block drag-and-drop, the link
// tool's anchor search, the media tool) can find it by holder id. Same shape
// as it always had: { editor, hiddenFieldId }.
function registerInstance(id, editor, hiddenFieldId) {
  if (!window.__editorJSInstances) {
    window.__editorJSInstances = {};
  }
  window.__editorJSInstances[id] = { editor, hiddenFieldId: hiddenFieldId || null };
}

function unregisterInstance(id, editor) {
  const registry = window.__editorJSInstances;
  if (registry && registry[id] && registry[id].editor === editor) {
    delete registry[id];
  }
}

// The options with their defaults filled in, so the rest reads them plainly.
function normaliseOptions(options) {
  const context = options.context || {};
  return {
    pageUndo: options.undo !== UNDO_OFF,
    waitMs: typeof options.debounceMs === 'number' ? options.debounceMs : CHANGE_DEBOUNCE_MS,
    placeholder: options.placeholder || DEFAULT_PLACEHOLDER,
    data: options.data || {},
    hiddenFieldId: context.hiddenFieldId,
    toolContext: {
      tenantPath: options.tenantPath || '',
      typeName: context.typeName || '',
      partName: context.partName || '',
      fieldName: context.fieldName || '',
      pickMedia: options.pickMedia,
      mediaModalHost: options.mediaModalHost,
    },
  };
}

/**
 * The EditorJS onChange. Off the undo timeline, it waits for the burst to end
 * and saves once. On it, the timeline needs every change with its events, so
 * it saves now and records from that same save; only the caller's callback
 * waits.
 */
function changeHandler(getEditor, pageUndo, emitter) {
  if (!pageUndo) {
    return () => emitter.pull(() => getEditor().save());
  }
  return (api, events) => {
    const editor = getEditor();
    editor
      .save()
      .then((outputData) => {
        emitter.push(outputData);
        recordChange(editor, outputData, events);
      })
      .catch(logSaveError);
  };
}

// Per-editor helpers that need the editor to be ready.
function attachEditorHelpers(editor, holderEl, pageUndo, emitter) {
  // Format painter: copy a block's type/heading-level and paint it onto others.
  // Text presets: apply a named style to this block or the whole selection.
  attachFormatPainter(editor, holderEl);
  attachTextPresets(editor, holderEl);

  if (pageUndo) {
    // Cross-widget undo: a single Ctrl+Z/Y timeline across all editor
    // instances. An undo re-renders the blocks, and EditorJS fires no
    // onChange for its own render, so it hands us the post-render data,
    // which goes to the caller straight away.
    attachUndo(editor, holderEl, emitter.now);
  }
}

function createHandle(editor, instanceId, pageUndo, emitter) {
  let destroyed = false;

  return {
    save: () => editor.save(),
    // A change still inside the debounce (or not yet reported by Editor.js,
    // which batches its own onChange) goes to `onChange` now, from one fresh
    // save. Resolves once it has been delivered; does nothing once destroyed.
    flush: () => (destroyed ? Promise.resolve() : emitter.flush(() => editor.save())),
    focus: () => {
      editor.focus();
    },
    readOnly: async (on) => {
      await editor.readOnly.toggle(!!on);
    },
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      emitter.dispose();
      if (pageUndo) {
        detachUndo(editor);
      }
      unregisterInstance(instanceId, editor);
      editor.destroy();
    },
  };
}

/**
 * Create a Blocks editor.
 *
 * @param {HTMLElement|string} holder Element (or its id) the editor renders into.
 * @param {object} options
 * @param {object|null} [options.data]       Initial OutputData.
 * @param {Function} [options.onChange]      (OutputData) => void, debounced 300 ms.
 * @param {string} options.tenantPath        Request.PathBase, for links, icons and media URLs.
 * @param {string} [options.placeholder]
 * @param {object} [options.tools]           { include?: string[], exclude?: string[], extra?: {} }
 * @param {string} [options.undo]            "page" (default): join the page-wide Ctrl+Z timeline.
 *                                           "off": never join it; blocks keep native undo.
 * @param {Function} [options.pickMedia]     (select: (paths: string[]) => void) => void; replaces
 *                                           the image tool's Bootstrap media modal.
 * @param {string} [options.mediaModalHost]  Id of the media modal (default `<holder id>-ModalBody`).
 * @param {object} [options.context]         For initializeEditorJS: { typeName, partName, fieldName,
 *                                           hiddenFieldId } (link search scope and registry entry).
 * @param {number} [options.debounceMs]      For initializeEditorJS: 0 writes the field per change.
 * @returns {Promise<{ save: Function, flush: Function, destroy: Function, focus: Function, readOnly: Function }>}
 *          Resolves once the editor is ready. The editor is registered in
 *          window.__editorJSInstances synchronously, before the promise settles.
 */
export async function createBlockEditor(holder, options = {}) {
  attachPageSingletons();

  const holderEl = resolveHolder(holder);
  const instanceId = holderEl.id;
  const settings = normaliseOptions(options);
  const emitter = createChangeEmitter(options.onChange, settings.waitMs);
  const baseTools = buildBaseTools({ ...settings.toolContext, instanceId });
  const { tools, tunes } = withAvailableTunes(filterTools(baseTools, options.tools));

  const editor = new EditorJS({
    holder: holderEl,
    placeholder: settings.placeholder,
    tools,
    tunes,
    data: settings.data,
    onChange: changeHandler(() => editor, settings.pageUndo, emitter),
  });

  registerInstance(instanceId, editor, settings.hiddenFieldId);

  try {
    await editor.isReady;
  } catch (error) {
    emitter.dispose();
    unregisterInstance(instanceId, editor);
    throw error;
  }

  attachEditorHelpers(editor, holderEl, settings.pageUndo, emitter);

  return createHandle(editor, instanceId, settings.pageUndo, emitter);
}
