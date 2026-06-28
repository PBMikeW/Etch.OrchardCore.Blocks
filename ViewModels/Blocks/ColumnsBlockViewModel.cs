using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class ColumnsBlockViewModel
    {
        public int ColumnCount { get; set; }
        public IList<ColumnsColumnViewModel> Columns { get; set; } = new List<ColumnsColumnViewModel>();
    }

    public class ColumnsColumnViewModel
    {
        public IList<dynamic> Blocks { get; set; } = new List<dynamic>();
    }
}
