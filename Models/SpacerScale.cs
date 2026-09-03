using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.Models
{
    /// <summary>
    /// Bootstrap spacer scale used by the editor's padding/spacing controls.
    /// Must match SPACER_MAP in Assets/Editor.js/js/plugins/paddingTune/index.js.
    /// </summary>
    public static class SpacerScale
    {
        public static readonly IReadOnlyDictionary<string, string> Map = new Dictionary<string, string>
        {
            ["1"] = "0.25rem", ["2"] = "0.5rem", ["3"] = "1rem",
            ["4"] = "1.5rem", ["5"] = "3rem", ["6"] = "4rem",
            ["7"] = "5rem", ["8"] = "6rem", ["9"] = "7rem", ["10"] = "9rem"
        };
    }
}
