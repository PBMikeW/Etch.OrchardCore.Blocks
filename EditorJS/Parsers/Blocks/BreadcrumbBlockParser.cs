using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class BreadcrumbBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var items = new List<BreadcrumbItem>();

            if (block.Has("items") && block.Data["items"] is JArray jItems)
            {
                foreach (var jItem in jItems)
                {
                    items.Add(new BreadcrumbItem
                    {
                        Label = jItem["label"]?.ToString() ?? string.Empty,
                        Url = jItem["url"]?.ToString() ?? string.Empty
                    });
                }
            }

            return await context.ShapeFactory.New.Block__Breadcrumb(
                new BreadcrumbBlockViewModel
                {
                    Mode = block.Get("mode"),
                    Items = items
                }
            );
        }
    }
}
