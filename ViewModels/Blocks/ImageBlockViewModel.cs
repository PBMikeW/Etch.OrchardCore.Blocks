namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class ImageBlockViewModel
    {
        public string Alignment { get; set; } = "center";
        public string Caption { get; set; }
        public string MediaPath { get; set; }
        public bool Stretched { get; set; }
        public string Url { get; set; }
        public string LinkUrl { get; set; }
        public bool LinkNewTab { get; set; }
        public string ImageAnchor { get; set; }

        public bool HasCaption
        {
            get { return !string.IsNullOrWhiteSpace(Caption); }
        }

        public bool HasLink
        {
            get { return !string.IsNullOrWhiteSpace(LinkUrl); }
        }

        public bool HasImageAnchor
        {
            get { return !string.IsNullOrWhiteSpace(ImageAnchor); }
        }
    }
}
