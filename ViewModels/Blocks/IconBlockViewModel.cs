using System;
using System.Collections.Generic;
using System.Linq;

namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class IconBlockViewModel
    {
        public string IconName { get; set; }
        public string IconStyle { get; set; }
        public string Size { get; set; }
        public string Color { get; set; }
        public string Alignment { get; set; }
        public string LinkUrl { get; set; }
        public bool LinkNewTab { get; set; }

        /// <summary>
        /// Rendered size per named option. In rem so an icon scales with the
        /// page's type scale; the editor preview uses the same three values
        /// (SIZES in Assets/Editor.js/js/plugins/iconBlock/index.js).
        /// </summary>
        public static readonly IDictionary<string, string> SizeMap = new Dictionary<string, string>
        {
            { "sm", "1.5rem" },
            { "md", "2.5rem" },
            { "lg", "4rem" }
        };

        /// <summary>
        /// The colours the editor's picker offers — the brand hexes the text
        /// Color tool uses. The colour lands in a style attribute, so it is
        /// checked against this list rather than written through: an icon can
        /// only ever be one of these, or (empty) the surrounding text colour.
        /// </summary>
        public static readonly IReadOnlyCollection<string> Palette = new[]
        {
            "#002D6A",
            "#EF4123",
            "#72808A",
            "#FFCD00",
            "#FFF",
            "#000"
        };

        public bool HasIcon => !string.IsNullOrEmpty(IconName);
        public bool HasLink => !string.IsNullOrEmpty(LinkUrl);

        public string SafeColor => Color != null && Palette.Contains(Color, StringComparer.OrdinalIgnoreCase) ? Color : null;

        public string SizeKey => SizeMap.ContainsKey(Size ?? string.Empty) ? Size : "md";
        public string SizeCss => SizeMap[SizeKey];

        public string AlignmentKey => Alignment == "center" || Alignment == "right" ? Alignment : "left";
        public string Justify => AlignmentKey == "center" ? "center" : AlignmentKey == "right" ? "flex-end" : "flex-start";

        /// <summary>
        /// Symbol id in wwwroot/assets/heroicons.svg: "o-" for outline, "s-" for solid.
        /// </summary>
        public string IconSymbolId => $"{(IconStyle == "solid" ? "s" : "o")}-{IconName}";
    }
}
