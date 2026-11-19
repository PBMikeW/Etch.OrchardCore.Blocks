// Assertions for the Blocks editor factory (../Assets/Editor.js/js/factory.js), the initializeEditorJS wrapper
// (../Assets/Editor.js/js/index.js) and the media tool's pickMedia path.
//
// The package has no JS test runner and no jsdom, so this is a standalone node script. Run it from the repo root:
//
//   node Etch.OrchardCore.Blocks/scripts/factory.check.mjs
//
// It loads the real factory, wrapper, cross-widget undo, popover helpers, legacy markup upgrade and media tool as
// ES modules through node's module hooks, and swaps everything else for stubs: EditorJS becomes a fake that records
// its config and lets the check fire onChange, the other plugins become an empty class, styles become nothing. The
// DOM is a minimal fake (an EventTarget document and plain element objects). It proves the wiring, not EditorJS.

import assert from "node:assert/strict";
import { register } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const jsRoot = pathToFileURL(resolve(scriptsDir, "..", "Assets", "Editor.js", "js")).href + "/";

// ---------------------------------------------------------------------------------------------------------------
// Module hooks: real modules under test, stubs for the rest.
// ---------------------------------------------------------------------------------------------------------------

const hooks = String.raw`
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

let jsRoot = "";
export async function initialize(data) { jsRoot = data.jsRoot; }

const REAL = new Set([
  "factory.js",
  "index.js",
  "plugins/crossWidgetUndo/index.js",
  "plugins/popoverFlip/index.js",
  "plugins/popoverAnchor/index.js",
  "plugins/utils/legacyMarkup.js",
  "plugins/utils/colorActiveState.js",
  "plugins/utils/colorSurroundScope.js",
  "plugins/mediaLibrary/index.js",
  "plugins/mediaLibrary/asset.js",
]);
const SPECIAL = { "plugins/mediaLibrary/ui.js": "ui" };

const STUBS = {
  css: "export default {};",
  editorjs: "export default globalThis.__FakeEditorJS;",
  generic: [
    "export default class Stub { constructor(args) { this.args = args; } }",
    "const calls = () => (globalThis.__stubCalls = globalThis.__stubCalls || []);",
    "export function attachFormatPainter() { calls().push('attachFormatPainter'); }",
    "export function attachTextPresets() { calls().push('attachTextPresets'); }",
    "export const IconStretch = '';",
    "export const IconPicture = '';",
  ].join("\n"),
  ui: [
    "export default class Ui {",
    "  constructor(api, onSelect) { this.nodes = { image: null }; this.onSelect = onSelect; }",
    "  render(data) { this.rendered = data; return {}; }",
    "  getCaption() { return ''; }",
    "  applyAlignment() {}",
    "  applySizeCap() {}",
    "}",
  ].join("\n"),
};

const stub = (name) => ({ url: "stub:" + name, shortCircuit: true });

function isFile(url) {
  const path = fileURLToPath(url);
  return existsSync(path) && statSync(path).isFile();
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("stub:")) {
    return { url: specifier, shortCircuit: true };
  }
  if (/\.s?css$/.test(specifier)) {
    return stub("css");
  }
  if (specifier === "@editorjs/editorjs") {
    return stub("editorjs");
  }
  const parent = context.parentURL || "";
  if (!parent.startsWith(jsRoot)) {
    return next(specifier, context);
  }
  if (!specifier.startsWith(".")) {
    return stub("generic");
  }
  const base = new URL(specifier, parent).href;
  const url = [base, base + ".js", base + "/index.js"].find(isFile);
  const rel = url ? url.slice(jsRoot.length) : "";
  if (SPECIAL[rel]) {
    return stub(SPECIAL[rel]);
  }
  if (REAL.has(rel)) {
    return { url, shortCircuit: true };
  }
  return stub("generic");
}

export async function load(url, context, next) {
  if (url.startsWith("stub:")) {
    return { format: "module", source: STUBS[url.slice(5)], shortCircuit: true };
  }
  if (url.startsWith(jsRoot)) {
    return { format: "module", source: await readFile(fileURLToPath(url), "utf8"), shortCircuit: true };
  }
  return next(url, context);
}
`;

register("data:text/javascript," + encodeURIComponent(hooks), { data: { jsRoot } });

// ---------------------------------------------------------------------------------------------------------------
// Fake DOM.
// ---------------------------------------------------------------------------------------------------------------

class FakeElement {
  constructor(id = "", { closestMap = {} } = {}) {
    this.id = id;
    this.nodeType = 1;
    this.tagName = "DIV";
    this.value = "";
    this.isContentEditable = false;
    this.closestMap = closestMap;
    this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
  closest(selector) {
    return this.closestMap[selector] || null;
  }
  contains() {
    return false;
  }
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
  }
}

const elements = new Map();
const documentListeners = [];

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = new FakeElement("body");
    this.activeElement = null;
  }
  addEventListener(type, fn, options) {
    documentListeners.push({ type, fn, options });
    super.addEventListener(type, fn, options);
  }
  getElementById(id) {
    return elements.get(id) || null;
  }
  contains() {
    return true;
  }
  createElement(tag) {
    return new FakeElement(tag);
  }
}

globalThis.window = globalThis;
globalThis.document = new FakeDocument();
globalThis.getSelection = () => null;

function addElement(id, options) {
  const element = new FakeElement(id, options);
  elements.set(id, element);
  return element;
}

// ---------------------------------------------------------------------------------------------------------------
// Fake EditorJS: records its config, saves whatever the check last set, lets the check fire onChange.
// ---------------------------------------------------------------------------------------------------------------

class FakeEditorJS {
  static instances = [];

  constructor(config) {
    this.config = config;
    this.blocksData = (config.data && config.data.blocks) || [];
    this.destroyed = false;
    this.readOnlyState = false;
    this.saveCount = 0;
    this.isReady = Promise.resolve();
    this.readOnly = {
      toggle: async (state) => {
        this.readOnlyState = state;
        return state;
      },
    };
    this.blocks = {
      getCurrentBlockIndex: () => -1,
      getBlockByIndex: () => null,
      getBlockByElement: () => null,
      getBlocksCount: () => this.blocksData.length,
      render: async (data) => {
        this.blocksData = data.blocks;
      },
      clear: async () => {
        this.blocksData = [];
      },
    };
    FakeEditorJS.instances.push(this);
  }

  async save() {
    this.saveCount += 1;
    return { time: 1, blocks: this.blocksData, version: "fake" };
  }

  focus() {
    this.focused = true;
    return true;
  }

  destroy() {
    this.destroyed = true;
  }

  // Simulate the user changing the content.
  change(text) {
    this.blocksData = [{ id: "b1", type: "paragraph", data: { text } }];
    this.config.onChange({}, [{ type: "block-changed", detail: { index: 0 } }]);
  }
}

globalThis.__FakeEditorJS = FakeEditorJS;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const listenersNamed = (name) => documentListeners.filter((l) => l.fn.name === name);
const registry = () => window.__editorJSInstances || {};

// ---------------------------------------------------------------------------------------------------------------
// Checks.
// ---------------------------------------------------------------------------------------------------------------

const { createBlockEditor } = await import(jsRoot + "factory.js");
let passed = 0;

async function check(name, run) {
  await run();
  passed += 1;
  console.log("ok - " + name);
}

const lastEditor = () => FakeEditorJS.instances[FakeEditorJS.instances.length - 1];

// Runs first: crossWidgetUndo's page listeners are module state, so once a "page" editor attaches they stay.
await check('undo "off" registers no undo timeline and no page keydown handler', async () => {
  const holder = addElement("studio-a");
  const handle = await createBlockEditor(holder, { tenantPath: "/t", undo: "off" });
  await sleep(10);
  assert.equal(listenersNamed("onGlobalKeyDown").length, 0, "no crossWidgetUndo keydown listener");
  assert.equal(documentListeners.filter((l) => l.type === "pb:undo:undo").length, 0, "no pb:undo:undo listener");
  assert.deepEqual(globalThis.__stubCalls, ["attachFormatPainter", "attachTextPresets"]);
  handle.destroy();
});

await check("onChange is debounced 300 ms and gets the saved data of the last change", async () => {
  const calls = [];
  const handle = await createBlockEditor(addElement("studio-b"), {
    tenantPath: "/t",
    undo: "off",
    onChange: (data) => calls.push(data),
  });
  const editor = lastEditor();
  editor.change("one");
  await sleep(50);
  editor.change("two");
  await sleep(50);
  editor.change("three");
  await sleep(150);
  assert.equal(calls.length, 0, "nothing before the quiet period");
  await sleep(250);
  assert.equal(calls.length, 1, "one call per burst");
  assert.equal(calls[0].blocks[0].data.text, "three");
  assert.equal(editor.saveCount, 1, "undo off saves once per burst");
  handle.destroy();
});

await check("flush() cancels the debounce and delivers one fresh save at once", async () => {
  const calls = [];
  const handle = await createBlockEditor(addElement("studio-flush"), {
    tenantPath: "/t",
    undo: "off",
    onChange: (data) => calls.push(data),
  });
  const editor = lastEditor();
  editor.change("typed");
  await sleep(50);
  // Typing Editor.js hasn't reported yet: flush saves afresh rather than waiting for its onChange.
  editor.blocksData = [{ id: "b1", type: "paragraph", data: { text: "typed more" } }];
  await handle.flush();
  assert.equal(calls.length, 1, "delivered before flush resolved");
  assert.equal(calls[0].blocks[0].data.text, "typed more", "a fresh save, not the one the change queued");
  await sleep(400);
  assert.equal(calls.length, 1, "the cancelled debounce never fires");

  await handle.flush();
  assert.equal(calls.length, 2, "flush with nothing pending still delivers the content once");

  handle.destroy();
  await handle.flush();
  assert.equal(calls.length, 2, "nothing after destroy");
});

await check("a save still in flight when a newer change arrives is dropped", async () => {
  const calls = [];
  const handle = await createBlockEditor(addElement("studio-order"), {
    tenantPath: "/t",
    undo: "off",
    onChange: (data) => calls.push(data),
  });
  const editor = lastEditor();
  let release;
  const realSave = editor.save.bind(editor);
  editor.save = () => {
    const snapshot = realSave();
    return new Promise((done) => {
      release = () => done(snapshot);
    });
  };
  editor.change("old");
  await sleep(320);
  editor.save = realSave;
  editor.change("new");
  release();
  await sleep(10);
  assert.equal(calls.length, 0, "the old save was dropped");
  await sleep(320);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].blocks[0].data.text, "new");
  handle.destroy();
});

await check("create -> save -> destroy leaves __editorJSInstances empty and drops a pending change", async () => {
  const calls = [];
  const holder = addElement("");
  const handle = await createBlockEditor(holder, {
    tenantPath: "/t",
    undo: "off",
    data: { blocks: [{ id: "x", type: "paragraph", data: { text: "hello" } }] },
    onChange: (data) => calls.push(data),
  });
  const editor = lastEditor();
  assert.match(holder.id, /^etch-blocks-\d+$/, "a holder without an id gets one");
  assert.deepEqual(registry()[holder.id], { editor, hiddenFieldId: null });
  const saved = await handle.save();
  assert.equal(saved.blocks[0].data.text, "hello");
  handle.focus();
  assert.equal(editor.focused, true);
  await handle.readOnly(true);
  assert.equal(editor.readOnlyState, true);
  editor.change("pending");
  handle.destroy();
  handle.destroy();
  await sleep(400);
  assert.equal(calls.length, 0, "the pending debounce was cleared");
  assert.equal(editor.destroyed, true);
  assert.deepEqual(Object.keys(registry()), [], "registry empty");
});

await check('undo "page" joins the timeline; destroy takes it off again', async () => {
  const states = [];
  document.addEventListener("pb:undo:state", (e) => states.push(e.detail));
  const handle = await createBlockEditor(addElement("page-a"), { tenantPath: "/t", undo: "page" });
  const editor = lastEditor();
  await sleep(10);
  assert.equal(listenersNamed("onGlobalKeyDown").length, 1, "page keydown handler attached once");
  editor.change("typed");
  await sleep(10);
  assert.deepEqual(states[states.length - 1], { canUndo: true, canRedo: false });
  handle.destroy();
  await sleep(10);
  assert.deepEqual(states[states.length - 1], { canUndo: false, canRedo: false }, "its history is gone");
  assert.deepEqual(Object.keys(registry()), [], "registry empty");
});

await check("tools.exclude / include / extra filter the tool map and the tune lists", async () => {
  const pickMedia = () => {};
  class Activity {}
  const excluded = await createBlockEditor(addElement("tools-a"), {
    tenantPath: "/t",
    undo: "off",
    pickMedia,
    tools: { exclude: ["raw", "embed", "breadcrumb", "anchorTune"], extra: { activity: { class: Activity } } },
  });
  const config = lastEditor().config;
  const names = Object.keys(config.tools);
  for (const gone of ["raw", "embed", "breadcrumb", "anchorTune"]) {
    assert.ok(!names.includes(gone), gone + " excluded");
  }
  assert.equal(config.tools.activity.class, Activity, "extra added");
  assert.deepEqual(config.tunes, ["textPreset", "alignmentTune", "paddingTune"]);
  assert.deepEqual(config.tools.icon.tunes, ["textPreset", "paddingTune"]);
  assert.equal(config.tools.image.config.pickMedia, pickMedia, "pickMedia reaches the image tool");
  assert.equal(config.placeholder, "Enter your content here...");
  excluded.destroy();

  const included = await createBlockEditor(addElement("tools-b"), {
    tenantPath: "/t",
    undo: "off",
    placeholder: "Write here",
    tools: { include: ["paragraph", "header", "textPreset"] },
  });
  const narrow = lastEditor().config;
  assert.deepEqual(Object.keys(narrow.tools).sort(), ["header", "paragraph", "textPreset"]);
  assert.deepEqual(narrow.tunes, ["textPreset"]);
  assert.equal(narrow.placeholder, "Write here");
  included.destroy();

  const all = await createBlockEditor(addElement("tools-c"), { tenantPath: "/t", undo: "off" });
  console.log("   registered tool names: " + Object.keys(lastEditor().config.tools).join(", "));
  all.destroy();
});

await check("initializeEditorJS writes the hidden input, fires contentpreview:render and keeps its registry shape", async () => {
  await import(jsRoot + "index.js");
  assert.equal(window.EtchBlocks.create, createBlockEditor, "window.EtchBlocks.create exposed");
  assert.equal(typeof window.initializeEditorJS, "function");

  let submitted = 0;
  const form = new FakeElement("form");
  form.submit = () => {
    submitted += 1;
  };
  const hidden = addElement("Part_Data", { closestMap: { form } });
  hidden.value = JSON.stringify({ blocks: [{ type: "paragraph", data: { text: "Saved" } }] });
  addElement("Part");
  let previews = 0;
  document.addEventListener("contentpreview:render", () => {
    previews += 1;
  });

  window.initializeEditorJS("/tenant", "Part", "Part_Data", "Article", "BlockBodyPart", "", "");
  const editor = lastEditor();
  assert.deepEqual(registry().Part, { editor, hiddenFieldId: "Part_Data" }, "registered synchronously");
  assert.equal(editor.config.data.blocks[0].data.text, "Saved");
  assert.equal(editor.config.tools.image.config.id, "Part", "media tool keeps the <id>-ModalBody modal");
  assert.equal(editor.config.tools.image.config.pickMedia, undefined);
  assert.equal(editor.config.tools.link.config.typeName, "Article");
  assert.equal(editor.config.tools.link.config.partName, "BlockBodyPart");
  assert.equal(form.listeners.submit.length, 1, "submit hook attached");
  await sleep(10);

  editor.change("Edited");
  await sleep(0);
  assert.equal(JSON.parse(hidden.value).blocks[0].data.text, "Edited", "hidden input written straight away");
  assert.equal(previews, 1, "contentpreview:render fired");

  form.listeners.submit[0]({});
  await sleep(10);
  assert.equal(submitted, 1, "form re-submitted after save");
  assert.equal(form.listeners.submit.length, 0, "submit hook removed");
});

await check('a "page" editor leaves Ctrl+Z inside an undo "off" editor to the browser', async () => {
  const [onGlobalKeyDown] = listenersNamed("onGlobalKeyDown").map((l) => l.fn);
  const keyEvent = (target) => {
    const event = { ctrlKey: true, key: "y", target, prevented: false, stopPropagation() {} };
    event.preventDefault = () => {
      event.prevented = true;
    };
    return event;
  };
  const studioNode = new FakeElement("", { closestMap: { ".codex-editor": {}, ".ce-block": {} } });
  const inStudio = keyEvent(studioNode);
  onGlobalKeyDown(inStudio);
  assert.equal(inStudio.prevented, false, "unmanaged editor keeps native undo");

  const onPage = keyEvent(new FakeElement(""));
  onGlobalKeyDown(onPage);
  assert.equal(onPage.prevented, true, "the page timeline still claims the key elsewhere");
});

await check("pickMedia replaces the media modal and select(paths) sets the image", async () => {
  const { default: MediaLibraryTool } = await import(jsRoot + "plugins/mediaLibrary/index.js");
  let opened = 0;
  const tool = new MediaLibraryTool({
    data: {},
    api: {},
    config: {
      id: "x",
      tenantPath: "/t",
      pickMedia: (select) => {
        opened += 1;
        select(["Training/a b.jpg"]);
      },
    },
  });
  tool.appendCallback();
  assert.equal(opened, 1);
  assert.equal(tool.data.mediaPath, "Training/a b.jpg");
  assert.equal(tool.data.baseUrl, "/t/media/Training/a%20b.jpg");
  assert.match(tool.data.url, /^\/t\/media\/Training\/a%20b\.jpg\?width=160&height=160&rmode=min$/);

  tool.config.pickMedia = (select) => select([{ mediaPath: "x/y.png", url: "https://cdn/x/y.png" }]);
  tool._openMediaLibrary();
  assert.equal(tool.data.baseUrl, "https://cdn/x/y.png", "an object pick keeps its own url");

  tool.config.pickMedia = (select) => select([]);
  tool._openMediaLibrary();
  assert.equal(tool.data.mediaPath, "x/y.png", "an empty pick changes nothing");
});

await check("raw HTML tool is locked without ManageRawBlocks (allowRawBlocks: false), full otherwise", async () => {
  const { LockedRaw } = await import(jsRoot + "factory.js");
  const Raw = Object.getPrototypeOf(LockedRaw);

  const open = await createBlockEditor(addElement("raw-default"), { tenantPath: "/t", undo: "off" });
  assert.equal(lastEditor().config.tools.raw, Raw, "factory default keeps the full raw tool");
  open.destroy();

  const locked = await createBlockEditor(addElement("raw-locked"), { tenantPath: "/t", undo: "off", allowRawBlocks: false });
  assert.equal(lastEditor().config.tools.raw, LockedRaw, "factory locks raw when asked");
  locked.destroy();

  const excluded = await createBlockEditor(addElement("raw-excluded"), {
    tenantPath: "/t",
    undo: "off",
    allowRawBlocks: false,
    tools: { exclude: ["raw"] },
  });
  assert.ok(!("raw" in lastEditor().config.tools), "tools.exclude still drops raw");
  excluded.destroy();

  assert.equal(LockedRaw.toolbox, undefined, "locked raw has no toolbox entry");
  assert.equal(new LockedRaw({ data: { html: "<b>x</b>" } }).args.readOnly, true, "locked raw renders read-only");

  addElement("RawField_Data");
  addElement("RawField");
  window.initializeEditorJS("/tenant", "RawField", "RawField_Data", "Article", "BlockBodyPart", "", "", {
    allowRawBlocks: false,
  });
  assert.equal(lastEditor().config.tools.raw, LockedRaw, "initializeEditorJS honours { allowRawBlocks: false }");

  addElement("RawOld_Data");
  addElement("RawOld");
  window.initializeEditorJS("/tenant", "RawOld", "RawOld_Data", "Article", "BlockBodyPart", "", "");
  assert.equal(lastEditor().config.tools.raw, Raw, "older callers with no options keep the full raw tool");
});

console.log(`\n${passed} checks passed`);
