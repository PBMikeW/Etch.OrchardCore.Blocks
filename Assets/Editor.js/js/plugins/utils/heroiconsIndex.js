import names, { version } from './heroiconsNames';

// The name list is regenerated from the heroicons package on every build (see
// scripts/generate-heroicons.js), so it lives in its own file and this one —
// which is hand-maintained — re-exports it alongside the sprite helpers. A
// regenerate then never has to reproduce this logic.

export const styles = ['outline', 'solid'];

// The sprite gives outline symbols an "o-" id and solid ones "s-", so a name
// plus a style is enough to address any of the 648 symbols.
export const stylePrefix = { outline: 'o', solid: 's' };

const SPRITE_PATH = '/Etch.OrchardCore.Blocks/assets/heroicons.svg';

/**
 * Absolute URL of the icon sprite for this tenant.
 *
 * The module's wwwroot is served at /Etch.OrchardCore.Blocks/…, but a
 * non-default tenant is mounted under a path prefix, which the editor is
 * handed as initializeEditorJS's first argument (Request.PathBase). The link
 * tool builds its URLs the same way.
 */
export function spriteUrl(tenantPath) {
  const base = (tenantPath || '').replace(/\/$/, '');

  // Version stamp, for the same reason the views run the sprite path through
  // IFileVersionProvider: the file is served from the module's wwwroot under a
  // stable name, so an icon set upgrade would otherwise keep painting from the
  // browser's cached copy until it expired. The query sits before the symbol
  // fragment - "…heroicons.svg?v=2.2.0#o-phone" - which is what <use> expects.
  return `${base}${SPRITE_PATH}?v=${encodeURIComponent(version)}`;
}

/**
 * href for a <use> element: the sprite URL plus the symbol's fragment id.
 */
export function symbolHref(tenantPath, style, name) {
  const prefix = stylePrefix[style] || stylePrefix.outline;
  return `${spriteUrl(tenantPath)}#${prefix}-${name}`;
}

/**
 * An <svg><use/></svg> referencing one sprite symbol.
 *
 * Built with createElementNS, not innerHTML: SVG children created through the
 * HTML parser land in the HTML namespace and render nothing.
 */
export function makeIconSvg(tenantPath, style, name, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  if (className) {
    svg.setAttribute('class', className);
  }

  // Decorative everywhere it is used — the button carries its own label, and
  // the icon block is illustration.
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

  // SVG2 href, matching what Block-KbButton.cshtml and Block-Icon.cshtml
  // render. Every browser that reaches the admin supports it; xlink:href is
  // only needed by IE, which cannot run the editor anyway.
  use.setAttribute('href', symbolHref(tenantPath, style, name));

  svg.appendChild(use);

  return svg;
}

export { names };

export default { names, styles, stylePrefix, spriteUrl, symbolHref, makeIconSvg };
