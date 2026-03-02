using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class ColumnsBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var columnCount = 2;
            if (block.Has("columnCount") && block.Data["columnCount"] is JsonElement countEl)
            {
                columnCount = countEl.GetInt32();
            }

            var columns = new List<ColumnsColumnViewModel>();

            if (block.Has("columns") && block.Data["columns"] is JsonElement columnsEl)
            {
                foreach (var jCol in columnsEl.EnumerateArray())
                {
                    var column = new ColumnsColumnViewModel();

                    if (jCol.TryGetProperty("blocks", out var blocksEl)
                        && blocksEl.ValueKind == JsonValueKind.Array
                        && blocksEl.GetArrayLength() > 0
                        && context.ParseBlocksAsync != null)
                    {
                        var editorBlocksJson = JsonSerializer.Serialize(new
                        {
                            time = 0,
                            version = "2.28.2",
                            blocks = blocksEl
                        });

                        column.Blocks = await context.ParseBlocksAsync(context, editorBlocksJson);
                    }

                    columns.Add(column);
                }
            }

            // Pad with empty columns if fewer columns than columnCount
            while (columns.Count < columnCount)
            {
                columns.Add(new ColumnsColumnViewModel());
            }

            return await context.ShapeFactory.New.Block__Columns(
                new ColumnsBlockViewModel
                {
                    ColumnCount = columnCount,
                    Columns = columns
                }
            );
        }
    }
}
