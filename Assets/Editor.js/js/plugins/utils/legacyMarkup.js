/**
 * Upgrade legacy inline markup to what the current inline tools write.
 *
 * Content saved by earlier versions of the editor carries two conventions the
 * current tools neither produce nor recognise:
 *
 *   colour     <font color="#002d6a">            -> <font style="color: rgb(0, 45, 106)">
 *   font size  <span class="editor-fs-1point2">  -> <span class="fontsize-tool" style="font-size: …">
 *
 * The size classes are defined in the site themes as a multiplier of the
 * block's base size: `.editor-fs-1point2 { font-size: 1.2rem }` for body text.
 * The web theme also scales them inside headings (`h2 .editor-fs-1point2
 * { font-size: 2.5rem * 1.2 }`, styles.scss $heading-sizes); the portal theme
 * does not. Each site's AdminTheme therefore publishes its heading bases as a
 * JSON data island, read by readLegacyHeadingScale(); without one every block
 * has a base of 1rem. The upgrade writes the size the class resolved to for
 * the block it sits in, so nothing changes visually; the font-size picker can
 * then read and edit it, and the admin editor, which has no CSS for the
 * classes, shows the size at last. Classes outside the range the themes define
 * render as no size at all, so they are left alone.
 *
 * Pure string -> string helpers over a throwaway DOM; pass the document
 * explicitly to unit test outside the browser.
 */

export const HEADING_SCALE_ISLAND_ID = 'blocks-legacy-heading-scale';

const LEGACY_SIZE_MULTIPLIERS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4];
const LEGACY_SIZE_CLASS = /^editor-fs-(\d+)point(\d+)$/;
const SIZE_TOOL_CLASS = 'fontsize-tool';

/**
 * Heading base sizes in rem, keyed by level, from the site's data island:
 *   <script type="application/json" id="blocks-legacy-heading-scale">{"1":3,"2":2.5,…}</script>
 * Empty when the site publishes none (every level then has a 1rem base).
 */
export function readLegacyHeadingScale(doc = document) {
  const island = doc.getElementById(HEADING_SCALE_ISLAND_ID);
  if (!island) {
    return {};
  }
  try {
    const parsed = JSON.parse(island.textContent || '{}');
    const scale = {};
    Object.keys(parsed).forEach((level) => {
      const value = Number(parsed[level]);
      if (/^[1-6]$/.test(level) && value > 0) {
        scale[level] = value;
      }
    });
    return scale;
  } catch (e) {
    return {};
  }
}

// Base font size, in rem, of text directly inside a block rendered as `tag`.
function baseRem(blockTag, scale) {
  const match = /^h([1-6])$/i.exec(blockTag || '');
  return (match && scale[match[1]]) || 1;
}

// The size a legacy class resolves to inside a block, e.g. 'editor-fs-1point2'
// in an h2 on the web site -> '3rem'. Null for classes the themes do not define.
export function legacySizeToRem(className, blockTag, scale = {}) {
  const match = LEGACY_SIZE_CLASS.exec(className);
  if (!match) {
    return null;
  }
  const multiplier = Number(`${match[1]}.${match[2]}`);
  if (LEGACY_SIZE_MULTIPLIERS.indexOf(multiplier) === -1) {
    return null;
  }
  const rem = Math.round(multiplier * baseRem(blockTag, scale) * 1000) / 1000;
  return `${rem}rem`;
}

function normaliseColor(value, doc) {
  const probe = doc.createElement('span');
  probe.style.color = value;
  return probe.style.color || value;
}

/**
 * Rewrite legacy colour and size markup in one block's HTML. Returns the input
 * unchanged (same string) when there is nothing to upgrade.
 *
 * @param {string} html
 * @param {string} blockTag  'p', 'li' or 'h1'..'h6': decides what a size class meant
 * @param {Document} doc
 */
export function upgradeLegacyMarkup(html, blockTag, doc = document) {
  if (!html || !/<font\b[^>]*\scolor=|editor-fs-/i.test(html)) {
    return html;
  }
  const scale = readLegacyHeadingScale(doc);
  const root = doc.createElement('div');
  root.innerHTML = html;

  Array.from(root.querySelectorAll('font[color]')).forEach((font) => {
    if (!font.style.color) {
      font.style.color = normaliseColor(font.getAttribute('color'), doc);
    }
    font.removeAttribute('color');
  });

  Array.from(root.querySelectorAll('[class*="editor-fs-"]')).forEach((el) => {
    const legacy = Array.from(el.classList).filter((c) => LEGACY_SIZE_CLASS.test(c));
    // With several classes at equal specificity the last one defined wins in
    // CSS; the themes define them in ascending order, so take the largest.
    const rem = legacy
      .map((c) => legacySizeToRem(c, blockTag, scale))
      .filter(Boolean)
      .sort((a, b) => parseFloat(a) - parseFloat(b))
      .pop();
    if (!rem) {
      return;
    }
    legacy.forEach((c) => el.classList.remove(c));
    if (!el.style.fontSize) {
      el.style.fontSize = rem;
    }
    if (el.tagName === 'SPAN') {
      el.classList.add(SIZE_TOOL_CLASS);
    }
    if (!el.getAttribute('class')) {
      el.removeAttribute('class');
    }
  });

  return root.innerHTML;
}

// Editor.js block -> the tag its text renders in.
export function blockTagOf(block) {
  if (block.type === 'header') {
    return `h${(block.data && block.data.level) || 2}`;
  }
  return block.type === 'list' ? 'li' : 'p';
}

/**
 * Upgrade every text-bearing block of an Editor.js OutputData. Returns
 * { data, changed }; `data` is the same object, mutated only when needed.
 */
export function upgradeLegacyBlocks(data, doc = document) {
  let changed = false;
  if (!data || !Array.isArray(data.blocks)) {
    return { data, changed };
  }
  data.blocks.forEach((block) => {
    if (!block || !block.data) {
      return;
    }
    const tag = blockTagOf(block);
    if ((block.type === 'paragraph' || block.type === 'header') && typeof block.data.text === 'string') {
      const text = upgradeLegacyMarkup(block.data.text, tag, doc);
      if (text !== block.data.text) {
        block.data.text = text;
        changed = true;
      }
    } else if (block.type === 'list' && Array.isArray(block.data.items)) {
      block.data.items = block.data.items.map((item) => {
        if (typeof item !== 'string') {
          return item;
        }
        const text = upgradeLegacyMarkup(item, tag, doc);
        if (text !== item) {
          changed = true;
        }
        return text;
      });
    }
  });
  return { data, changed };
}
