namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class ImageBlockViewModel
    {
        public string Alignment { get; set; } = "center";

        /// <summary>
        /// The image's alt text as the editor typed it (plain text, written into the
        /// alt attribute encoded). Empty on blocks saved before the editor offered it:
        /// views then fall back to the caption's text, and to alt="" without one.
        /// </summary>
        public string Alt { get; set; }
        public string Caption { get; set; }
        public string MediaPath { get; set; }
        public string Profile { get; set; }
        public bool Stretched { get; set; }
        public string Url { get; set; }
        public string LinkUrl { get; set; }
        public bool LinkNewTab { get; set; }

        public bool HasAlt => !string.IsNullOrWhiteSpace(Alt);
        public bool HasCaption => !string.IsNullOrWhiteSpace(Caption);
        public bool HasLink => !string.IsNullOrWhiteSpace(LinkUrl);
    }
}
