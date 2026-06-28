namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class KbButtonBlockViewModel
    {
        public string Url { get; set; }
        public string Label { get; set; }
        public string Style { get; set; }
        public string Alignment { get; set; }
        public string IconSvg { get; set; }
        public string IconPosition { get; set; }
        public bool NewTab { get; set; }

        public bool HasIcon => !string.IsNullOrEmpty(IconSvg) && IconPosition != "none";
        public bool IsIconLeft => IconPosition == "left" || string.IsNullOrEmpty(IconPosition);
    }
}
