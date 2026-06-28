using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class TableBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var content = new string[0][];

            if (block.Has("content") && block.Data["content"] is JArray contentArr)
            {
                var rows = new List<string[]>();
                foreach (var row in contentArr)
                {
                    rows.Add(row.ToObject<string[]>());
                }
                content = rows.ToArray();
            }

            return await context.ShapeFactory.New.Block__Table(
                new TableBlockViewModel
                {
                    WithHeadings = block.Get<bool>("withHeadings", false),
                    Content = content
                }
            );
        }
    }
}
