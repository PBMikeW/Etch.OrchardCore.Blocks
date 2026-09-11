/**
 * Remove-formatting: the pure DOM half of the inline tool.
 *
 * Strategy — "leaf lift". Never extract and reinsert a fragment: a list block's
 * editable root is the <ul> itself and its items are block-level, so
 * range.extractContents() + insertNode() shreds the <li> structure (measured:
 * one selection across two bullets came back as four bullets, one of them
 * empty). Instead each wholly selected leaf — a text node or a <br> — is lifted
 * out of its inline-formatting ancestors one level at a time, splitting each
 * ancestor around it so text either side of the selection keeps its formatting.
 * Nothing is ever detached from the block, so list structure survives.
 *
 * Why not document.execCommand('removeFormat'): it is inconsistent and does not
 * do the job. Measured in Chrome 152 against the real editor markup, it leaves
 * <mark style=""> and <span class="fontsize-tool" style=""> shells behind,
 * ignores the legacy editor-fs-* size classes entirely, and on a partial
 * selection inside a highlight it invents a third <mark style=""> around the
 * cleared run. Its sibling 'unlink' also destroys links we want to keep.
 *
 * Pitfalls this module is built around, each of which cost a rewrite:
 *
 *   - Boundary normalisation is mandatory. A boundary sitting inside a text
 *     node compares as AFTER the identical position expressed at the parent
 *     level, so a wholly selected <a> reads as only partly selected and is
 *     mangled. splitBoundaries() then liftRangeBoundaries() move both ends out
 *     to the outermost position that means the same place, before anything is
 *     inspected.
 *   - Snapshot before mutating. Splitting a wrapper moves nodes, which shifts
 *     the live range's offsets under us; every question the range can answer
 *     (which leaves, which covered elements, which links) is asked once, up
 *     front, and the answers are used from arrays afterwards.
 *   - api.selection.save() is not protection. It stores a marker inside the
 *     very DOM we are about to rearrange and does not survive the lift. The
 *     caller restores the selection from the fresh Range this module returns.
 *
 * Product decision: a wrapper that only partly overlaps the selection keeps its
 * formatting on the part that was NOT selected — the split leaves that text in
 * its original wrapper. Clearing half a highlight clears exactly half.
 *
 * No editor imports, and the document is taken from the nodes themselves, so
 * this module runs under jsdom for unit tests as well as in the browser.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
// NodeFilter.SHOW_ELEMENT and NodeFilter.SHOW_TEXT, spelled out as numbers so
// the helpers run under jsdom, which has no global NodeFilter.
const SHOW_ELEMENT = 1;
const SHOW_ELEMENT_AND_TEXT = 1 | 4;

// Elements that exist only to carry inline formatting.
//   FONT  colour tool          <font style="color: …">        (+ legacy <font color>)
//   MARK  highlight tool       <mark style="background-color: …">
//   SPAN  font-size tool       <span class="fontsize-tool" style="font-size: …">
//                              (+ legacy <span class="editor-fs-1point2">, pasted <span style>)
//   B/STRONG/I/EM  core bold + italic and pasted equivalents
//   U/S/STRIKE/SUB/SUP/SMALL/BIG/TT  native Ctrl+U and pasted markup
export const FORMAT_TAGS = [
  'FONT', 'MARK', 'SPAN',
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'SMALL', 'BIG', 'TT',
];

// A SPAN is only a formatting wrapper when it carries presentation: an inline
// style, or nothing but size classes. A span with any other class is editor or
// theme furniture (the cdx-* chrome, a tool's own markup) and is left alone.
const SIZE_CLASS = /^(fontsize-tool|editor-fs-[\w-]+)$/;

export function isFormatWrapper(node) {
  if (!node || node.nodeType !== ELEMENT_NODE) return false;
  if (FORMAT_TAGS.indexOf(node.tagName) === -1) return false;
  if (node.tagName !== 'SPAN') return true;
  if (node.getAttribute('style')) return true;
  const classes = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  return classes.length > 0 && classes.every((c) => SIZE_CLASS.test(c));
}

function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

// Presentational attributes stripped from an element we keep (currently <a>):
// the link keeps its href and loses the colour / face / size it was given.
export function stripPresentation(el) {
  el.removeAttribute('style');
  el.removeAttribute('color');
  el.removeAttribute('face');
  el.removeAttribute('size');
  if (el.getAttribute('class')) {
    (el.getAttribute('class') || '').split(/\s+/).filter((c) => SIZE_CLASS.test(c))
      .forEach((c) => el.classList.remove(c));
    if (!el.getAttribute('class')) el.removeAttribute('class');
  }
}

/**
 * Split `wrapper` around `node` so the content either side keeps its
 * formatting, then put `node` where the wrapper was:
 *   <font c>ab<X/>ef</font>  ->  <font c>ab</font><X/><font c>ef</font>
 */
function splitAround(node, wrapper) {
  const parent = wrapper.parentNode;
  if (node.previousSibling) {
    const before = wrapper.cloneNode(false);
    while (wrapper.firstChild && wrapper.firstChild !== node) before.appendChild(wrapper.firstChild);
    parent.insertBefore(before, wrapper);
  }
  if (node.nextSibling) {
    const after = wrapper.cloneNode(false);
    while (node.nextSibling) after.appendChild(node.nextSibling);
    parent.insertBefore(after, wrapper.nextSibling);
  }
  parent.replaceChild(node, wrapper);
}

/**
 * Lift one selected leaf out of every formatting ancestor up to `root`,
 * stepping over a non-formatting element (a wholly selected <a>) so a wrapper
 * *around* a link is split too.
 *
 * @param covered  elements wholly inside the selection, snapshotted before any
 *                 mutation — the live range's offsets shift as we split.
 */
export function liftOutOfWrappers(node, root, covered) {
  let current = node;
  for (;;) {
    const parent = current.parentNode;
    if (!parent || parent === root) return node;
    if (isFormatWrapper(parent)) { splitAround(current, parent); continue; }
    if (covered && covered.indexOf(parent) !== -1) { current = parent; continue; }
    return node;
  }
}

// Split the range's boundary text nodes so the range starts and ends between
// nodes. Offsets stay valid because splitText keeps the head node identity.
export function splitBoundaries(range) {
  const { endContainer, endOffset, startContainer, startOffset } = range;
  if (endContainer.nodeType === TEXT_NODE && endOffset > 0 && endOffset < endContainer.data.length) {
    endContainer.splitText(endOffset);
    range.setEnd(endContainer, endContainer.data.length);
  }
  if (startContainer.nodeType === TEXT_NODE && startOffset > 0 && startOffset < startContainer.data.length) {
    const tail = startContainer.splitText(startOffset);
    range.setStart(tail, 0);
  }
}

/**
 * Move the range's boundaries to the outermost position that means the same
 * place, e.g. (text "link", 0) inside <font><a>link</a> -> (blockRoot, 0).
 * Without this a boundary sitting inside a text node compares as *after* the
 * identical position expressed at the parent level, and a wholly selected
 * element reads as only partly selected.
 */
export function liftRangeBoundaries(range, root) {
  let node = range.startContainer;
  let offset = range.startOffset;
  while (node !== root && node.parentNode && offset === 0) {
    offset = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
    node = node.parentNode;
  }
  range.setStart(node, offset);

  node = range.endContainer;
  offset = range.endOffset;
  for (;;) {
    if (node === root || !node.parentNode) break;
    const length = node.nodeType === TEXT_NODE ? node.data.length : node.childNodes.length;
    if (offset !== length) break;
    offset = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
    node = node.parentNode;
  }
  range.setEnd(node, offset);
  return range;
}

function isFullyInside(range, node) {
  const nodeRange = node.ownerDocument.createRange();
  // A text node's own boundaries are (node, 0)-(node, length); an element's are
  // its position in its parent. Comparing like with like is what makes the
  // "the range covers all of this node" test come out right.
  if (node.nodeType === TEXT_NODE) nodeRange.selectNodeContents(node);
  else nodeRange.selectNode(node);
  return range.compareBoundaryPoints(nodeRange.START_TO_START, nodeRange) <= 0
      && range.compareBoundaryPoints(nodeRange.END_TO_END, nodeRange) >= 0;
}

/**
 * The selection's leaves: every wholly selected text node and <br>. Elements
 * are not leaves — a wholly selected <a> is stepped over during the lift.
 */
export function selectedLeaves(range, root) {
  const walker = root.ownerDocument.createTreeWalker(root, SHOW_ELEMENT_AND_TEXT);
  const leaves = [];
  let node;
  while ((node = walker.nextNode())) {
    const isText = node.nodeType === TEXT_NODE && node.data.length > 0;
    const isBr = node.nodeType === ELEMENT_NODE && node.tagName === 'BR';
    if (!isText && !isBr) continue;
    if (isFullyInside(range, node)) leaves.push(node);
  }
  return leaves;
}

// Every element wholly inside the selection, in document order.
export function coveredElements(range, root) {
  const walker = root.ownerDocument.createTreeWalker(root, SHOW_ELEMENT);
  const out = [];
  let node;
  while ((node = walker.nextNode())) {
    if (isFullyInside(range, node)) out.push(node);
  }
  return out;
}

// Does the range touch any part of the node? (Range.intersectsNode is not
// universally implemented, so compare boundaries.)
function intersects(range, node) {
  const nodeRange = node.ownerDocument.createRange();
  nodeRange.selectNode(node);
  return range.compareBoundaryPoints(nodeRange.START_TO_END, nodeRange) > 0
      && range.compareBoundaryPoints(nodeRange.END_TO_START, nodeRange) < 0;
}

// Wrappers left holding nothing that renders (no text, no <br>, no <a>, no img).
function isSpentWrapper(el) {
  if (!isFormatWrapper(el)) return false;
  if (el.textContent && el.textContent.length) return false;
  return !el.querySelector('br, img, a, input, hr');
}

/**
 * Clear inline formatting across a live Range inside `root` (the block's
 * contenteditable element). Mutates the DOM and returns a Range covering the
 * same text, so the caller can restore the selection the user made.
 */
export function clearFormatting(range, root) {
  if (!range || range.collapsed) return range;
  splitBoundaries(range);
  liftRangeBoundaries(range, root);

  // Everything the range has to tell us is read here, before the first
  // mutation: splitting wrappers shifts the live range's offsets.
  const leaves = selectedLeaves(range, root);
  if (!leaves.length) return range;
  const covered = coveredElements(range, root);
  const links = Array.from(root.querySelectorAll('a')).filter((a) => intersects(range, a));

  const first = leaves[0];
  const last = leaves[leaves.length - 1];

  leaves.forEach((leaf) => liftOutOfWrappers(leaf, root, covered));
  // Wrappers the lift stepped over or never reached: one wholly inside a link,
  // or one holding only an image.
  covered.forEach((el) => {
    if (el.parentNode && isFormatWrapper(el)) unwrap(el);
  });
  // A link keeps its href and loses its own colour / size, whether it is wholly
  // or only partly selected.
  links.forEach(stripPresentation);
  // Wrappers the lift emptied out.
  Array.from(root.querySelectorAll(FORMAT_TAGS.join(','))).forEach((el) => {
    if (el.parentNode && isSpentWrapper(el)) unwrap(el);
  });

  const out = root.ownerDocument.createRange();
  out.setStartBefore(first);
  out.setEndAfter(last);
  return out;
}
