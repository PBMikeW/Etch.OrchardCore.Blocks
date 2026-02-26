using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    public class BreadcrumbBlockViewModel
    {
        public string Mode { get; set; }
        public IList<BreadcrumbItem> Items { get; set; } = new List<BreadcrumbItem>();
    }

    public class BreadcrumbItem
    {
        public string Label { get; set; }
        public string Url { get; set; }
    }
}
