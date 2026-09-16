namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class KbButtonBlockViewModel
    {
        public string Url { get; set; }
        public string Label { get; set; }
        public string Style { get; set; }
        public string Alignment { get; set; }
        public string IconName { get; set; }
        public string IconStyle { get; set; }
        public string IconSvg { get; set; }
        public string IconPosition { get; set; }
        public bool NewTab { get; set; }
        public bool Inline { get; set; }

        /// <summary>
        /// The button's destination, or empty when the editor typed something
        /// that cannot safely go in an href (see <see cref="BlockLinkUrl"/>).
        /// The view then renders the button without one, so it is inert rather
        /// than a script waiting for a click.
        /// </summary>
        public string SafeUrl => BlockLinkUrl.SafeLinkUrl(Url);

        public bool HasIcon => (!string.IsNullOrEmpty(IconName) || !string.IsNullOrEmpty(IconSvg)) && IconPosition != "none";
        public bool IsIconLeft => IconPosition == "left" || string.IsNullOrEmpty(IconPosition);

        /// <summary>
        /// Symbol id in wwwroot/assets/heroicons.svg: "o-" for outline, "s-" for solid.
        /// </summary>
        public string IconSymbolId => $"{(IconStyle == "solid" ? "s" : "o")}-{IconName}";

        /// <summary>
        /// Buttons saved before the sprite existed carry the icon's markup in
        /// their own data and have no name to look up, so they keep rendering
        /// that markup inline.
        /// </summary>
        public bool UseSprite => !string.IsNullOrEmpty(IconName);
    }
}
