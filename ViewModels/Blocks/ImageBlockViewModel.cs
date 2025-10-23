namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class ImageBlockViewModel
    {
        public string Caption { get; set; }
        public string MediaPath { get; set; }
        public bool Stretched { get; set; }
        public string Profile { get; set; }
        public string Url { get; set; }
        public string LinkUrl { get; set; }

        public bool HasCaption
        {
            get { return !string.IsNullOrWhiteSpace(Caption); }
        }

        public bool HasLinkUrl
        {
            get { return !string.IsNullOrWhiteSpace(LinkUrl); }
        }
    }
}
