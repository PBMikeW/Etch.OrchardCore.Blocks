/**
 * Whole-block inline styles for the format painter.
 *
 * The editor's inline tools each write one CSS property onto their own wrapper:
 *   colour     -> <font style="color: ...">                            (editorjs-text-color-plugin, type "text")
 *   highlight  -> <mark style="background-color: ...">                 (editorjs-text-color-plugin, type "marker")
 *   font size  -> <span class="fontsize-tool" style="font-size: ...">  (plugins/fontSize)
 *
 * A property counts as a *block* style only when every non-blank text node in
 * the block inherits the same value for it — "the whole block is that colour".
 * Painting strips that property from the target's own wrappers and re-wraps the
 * whole text in the same markup the tool itself produces, so the tool's picker
 * still recognises and edits it afterwards.
 *
 * Content saved by earlier editor versions uses <font color="#hex"> and
 * editor-fs-* size classes instead (see ../utils/legacyMarkup.js). Both helpers
 * upgrade that markup first, so a legacy block copies and paints like a
 * current one, and a painted target comes out in current markup.
 *
 * Pure string -> string helpers over a throwaway DOM; no editor dependency, so
 * they can be unit-tested outside the browser (pass the document explicitly).
 */

import { upgradeLegacyMarkup } from '../utils/legacyMarkup';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

// Outermost first: mark > font > span. Each tool only looks for its own
// ancestor tag, so any order works for editing.
const WRAPPERS = [
  { prop: 'backgroundColor', tag: 'mark' },
  { prop: 'color', tag: 'font' },
  { prop: 'fontSize', tag: 'span', className: 'fontsize-tool' },
];

// Tags that exist only to carry an inline style; once styleless they go.
const WRAPPER_TAGS = ['FONT', 'MARK', 'SPAN'];

function parse(html, doc) {
  const root = doc.createElement('div');
  root.innerHTML = html || '';
  return root;
}

function collectTextNodes(node, out) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === TEXT_NODE) {
      if (child.data.trim()) {
        out.push(child);
      }
    } else if (child.nodeType === ELEMENT_NODE) {
      collectTextNodes(child, out);
    }
  });
  return out;
}

// Inline value of `prop` in effect on a text node: the nearest ancestor below
// root that sets it inline. '' when nothing does.
function effectiveValue(textNode, prop, root) {
  let el = textNode.parentNode;
  while (el && el !== root) {
    if (el.style && el.style[prop]) {
      return el.style[prop];
    }
    el = el.parentNode;
  }
  return '';
}

/**
 * Styles shared by every text node across the given HTML fragments (a block's
 * text, or one fragment per list item).
 *
 * @param {string[]} htmlFragments
 * @param {Document} doc
 * @param {string} blockTag  tag the block's text renders in ('p', 'li', 'h1'..'h6');
 *                           decides what a legacy size class resolved to
 * @returns {{ color?: string, backgroundColor?: string, fontSize?: string }}
 */
export function extractWholeBlockStyles(htmlFragments, doc = document, blockTag = 'p') {
  const nodes = [];
  htmlFragments.forEach((html) => {
    const root = parse(upgradeLegacyMarkup(html, blockTag, doc), doc);
    collectTextNodes(root, []).forEach((node) => nodes.push({ node, root }));
  });

  const styles = {};
  if (!nodes.length) {
    return styles;
  }
  WRAPPERS.forEach(({ prop }) => {
    const first = effectiveValue(nodes[0].node, prop, nodes[0].root);
    if (first && nodes.every(({ node, root }) => effectiveValue(node, prop, root) === first)) {
      styles[prop] = first;
    }
  });
  return styles;
}

function unwrap(el) {
  const parent = el.parentNode;
  while (el.firstChild) {
    parent.insertBefore(el.firstChild, el);
  }
  parent.removeChild(el);
}

// A wrapper is disposable once it carries no inline style and nothing but the
// font-size tool's class.
function isBareWrapper(el) {
  if (!WRAPPER_TAGS.includes(el.tagName) || el.getAttribute('style')) {
    return false;
  }
  return Array.from(el.attributes).every(
    (attr) => attr.name === 'style' || (attr.name === 'class' && attr.value.split(/\s+/).includes('fontsize-tool')),
  );
}

// Remove `prop` from every element that sets it, dropping wrappers left empty.
// Links are left alone: an inline colour on <a> is a separate editorial choice,
// and the theme's link colour beats the painted wrapper anyway.
function stripProperty(root, prop) {
  Array.from(root.querySelectorAll('*')).forEach((el) => {
    if (el.tagName === 'A') {
      return;
    }
    const hadInline = !!el.style[prop];
    // Legacy <font color="..."> attribute: not a style, but it would win over
    // the painted colour's wrapper.
    const hadAttr = prop === 'color' && el.tagName === 'FONT' && el.hasAttribute('color');
    // A <mark> with no inline background still renders the browser's default
    // highlight, so it has to go when a highlight is painted.
    const uaHighlight = prop === 'backgroundColor' && el.tagName === 'MARK';
    if (!hadInline && !hadAttr && !uaHighlight) {
      return;
    }
    if (hadInline) {
      el.style[prop] = '';
      if (!el.getAttribute('style')) {
        el.removeAttribute('style');
      }
    }
    if (hadAttr) {
      el.removeAttribute('color');
    }
    if (isBareWrapper(el)) {
      unwrap(el);
    }
  });
}

/**
 * Re-wrap a block's text so every character carries the given styles, exactly
 * as the inline tools would have written them. Properties absent from `styles`
 * are left untouched; blank content is returned as-is (no empty wrappers).
 * Legacy markup in the target is upgraded on the way, whatever is painted.
 *
 * @param {string} html
 * @param {{ color?: string, backgroundColor?: string, fontSize?: string }} styles
 * @param {Document} doc
 * @param {string} blockTag  see extractWholeBlockStyles
 * @returns {string}
 */
export function applyWholeBlockStyles(html, styles, doc = document, blockTag = 'p') {
  const upgraded = upgradeLegacyMarkup(html, blockTag, doc) || '';
  const wrappers = WRAPPERS.filter(({ prop }) => styles[prop]);
  if (!wrappers.length) {
    return upgraded;
  }
  const root = parse(upgraded, doc);
  if (!collectTextNodes(root, []).length) {
    return upgraded;
  }

  wrappers.forEach(({ prop }) => stripProperty(root, prop));

  let outer = null;
  let inner = null;
  wrappers.forEach(({ prop, tag, className }) => {
    const el = doc.createElement(tag);
    if (className) {
      el.className = className;
    }
    el.style[prop] = styles[prop];
    if (inner) {
      inner.appendChild(el);
    } else {
      outer = el;
    }
    inner = el;
  });
  while (root.firstChild) {
    inner.appendChild(root.firstChild);
  }
  root.appendChild(outer);
  return root.innerHTML;
}
