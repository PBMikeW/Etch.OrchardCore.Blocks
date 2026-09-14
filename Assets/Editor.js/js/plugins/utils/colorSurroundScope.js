/**
 * withScopedSurround — keeps a text-colour tool's click on its own wrapper tag.
 *
 * editorjs-text-color-plugin's surround() starts by unwrapping *any* ancestor
 * <span>:
 *
 *   surround(range) {
 *     const span = this.api.selection.findParentTag('SPAN');
 *     if (span) this.unwrap(span);                       // <- this
 *     const own = this.api.selection.findParentTag(this.parentTag);
 *     own ? this.unwrap(own) : this.wrap(range);
 *   }
 *
 * (see its `surround` in node_modules/editorjs-text-color-plugin/dist/bundle.mjs)
 *
 * That step is a leftover for content whose colour was wrapped in a bare
 * <span style="color: …">; ours never is, because upgradeLegacyMarkup()
 * (./legacyMarkup) rewrites legacy colour to <font style="color"> — the same
 * reasoning as ./colorActiveState, which had to scope checkState() for it.
 *
 * The span it does find in our markup is the font-size tool's
 * <span class="fontsize-tool">, so highlighting sized text threw the size
 * away: `<span class="fontsize-tool" style="font-size: 1.4rem">sentence</span>`
 * came back as `<mark>sentence</mark>`, and removing a highlight from sized
 * text left plain text. Editing one inline property must never destroy
 * another's markup.
 *
 * Toggle only the tool's own wrapper — <mark> for the highlighter, <font> for
 * the text colour — and leave every other wrapper where it is. Wrappers nest,
 * so the size span simply stays around (or inside) the new one; each tool
 * finds its own by ancestor tag, so the order does not matter (see
 * ../formatPainter/inlineStyles.js).
 *
 * @param {Function} ToolClass - the colour plugin class (or a subclass of it).
 * @returns {Function} the same tool with a wrapper-scoped surround().
 */
export default function withScopedSurround(ToolClass) {
  return class extends ToolClass {
    surround(range) {
      if (!range) {
        return;
      }

      const wrapper = this.api.selection.findParentTag(this.parentTag);

      if (wrapper) {
        this.unwrap(wrapper);
      } else {
        this.wrap(range);
      }

      // The plugin's own flag: unwrap() removes the wrapper when the icon half
      // was clicked and only recolours it when the palette was. Reset it the
      // way the original surround() does, or the next palette pick would be
      // treated as an icon click.
      this.clickedOnLeft = false;
    }
  };
}
