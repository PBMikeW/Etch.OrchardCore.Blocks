/**
 * withScopedActiveState — keeps a text-colour tool's toolbar button lit only
 * for the markup that tool owns.
 *
 * editorjs-text-color-plugin decides its active state from *any* ancestor
 * <span>: checkState() looks up findParentTag('SPAN') and hands it to
 * handleLegacyWrapper(), which returns that span as the hit when the tool is a
 * marker and, for the text colour, evaluates `fontTag & spanTag` — a bitwise
 * AND of two elements, which is always 0 (see its checkState/handleLegacyWrapper
 * in node_modules/editorjs-text-color-plugin/dist/bundle.mjs). That test is a
 * leftover for content whose colour was wrapped in a <span>; ours never is,
 * because upgradeLegacyMarkup() (./legacyMarkup) rewrites legacy colour to
 * <font style="color"> and legacy sizes to <span class="fontsize-tool">.
 *
 * The upshot was that the marker lit inside any span and the text colour went
 * dark inside one. The reported symptom: the font-size tool wraps the selection
 * in <span class="fontsize-tool">, and Editor.js re-runs every inline tool's
 * checkState() after any tool click (InlineToolbar.toolClicked), so clicking the
 * font-size button lit the highlighter button. Pasted markup carrying a bare
 * <span style> lit it with no click at all.
 *
 * Match only the tool's own wrapper tag — the same tag its surround()/wrap()
 * toggles — so the button says what a click on it would do.
 *
 * @param {Function} ToolClass - the colour plugin class (or a subclass of it).
 * @returns {Function} the same tool with a wrapper-scoped checkState().
 */
export default function withScopedActiveState(ToolClass) {
  return class extends ToolClass {
    checkState() {
      const wrapper = this.api.selection.findParentTag(this.parentTag);
      // A <mark> is a highlight by existing at all. A <font> is only coloured
      // text when it carries a colour: pasted markup can bring <font face="…">,
      // and legacy <font color> that we could not parse keeps an empty style.
      const active = !!wrapper
        && (this.pluginType === 'marker' || !!wrapper.style.color);

      // The plugin's button is the toolbar item itself (an HTML-type popover
      // item), so nothing else toggles the active class for it.
      if (this.button) {
        this.button.classList.toggle(this.iconClasses.active, active);
      }

      return active;
    }
  };
}
