using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class TableBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var content = new string[0][];

            if (block.Has("content") && block.Data["content"] is JsonElement contentEl)
            {
                var rows = new List<string[]>();
                foreach (var row in contentEl.EnumerateArray())
                {
                    var cells = new List<string>();
                    foreach (var cell in row.EnumerateArray())
                    {
                        cells.Add(cell.GetString() ?? string.Empty);
                    }
                    rows.Add(cells.ToArray());
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
