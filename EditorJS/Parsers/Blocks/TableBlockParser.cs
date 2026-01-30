using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class TableBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var content = block.Data["content"] as List<object>;
            var test2 = block.Data["content"].ToString();
            var contentArray = content.Select(item =>
                (item as List<object>)?.Select(subItem => subItem?.ToString() ?? string.Empty).ToArray()
                ?? new string[0]
            ).ToArray();
            //var content = block.Has("content") ? JsonSerializer.Deserialize<string[][]>(block.Data["content"].ToString()) : new string[0][];
            //var content = block.Has("content") ? (block.Data["content"] as JsonArray).ToObject<string[][]>() : new string[0][];
            return await context.ShapeFactory.New.Block__Table(
                new TableBlockViewModel
                {
                    WithHeadings = block.Get("withHeadings") == "True" ? true : false,
                    Content = contentArray
                }
            );
        }
    }
}
