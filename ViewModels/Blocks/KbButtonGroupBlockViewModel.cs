using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    /// <summary>
    /// A run of consecutive inline KB buttons, rendered as one wrapping row so
    /// whole buttons wrap onto the next line (never their labels) with an even
    /// gap, and the row as a whole takes the first button's alignment.
    /// </summary>
    public class KbButtonGroupBlockViewModel
    {
        public string Alignment { get; set; }
        public IList<dynamic> Buttons { get; set; } = new List<dynamic>();
    }
}
