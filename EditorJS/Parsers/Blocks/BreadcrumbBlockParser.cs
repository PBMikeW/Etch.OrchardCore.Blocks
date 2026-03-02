using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class BreadcrumbBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var items = new List<BreadcrumbItem>();

            if (block.Has("items") && block.Data["items"] is JsonElement itemsEl)
            {
                foreach (var jItem in itemsEl.EnumerateArray())
                {
                    items.Add(new BreadcrumbItem
                    {
                        Label = jItem.TryGetProperty("label", out var label) ? label.GetString() ?? string.Empty : string.Empty,
                        Url = jItem.TryGetProperty("url", out var url) ? url.GetString() ?? string.Empty : string.Empty
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
