using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class ColumnsBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var columnCount = block.Get<int>("columnCount", 2);

            var columns = new List<ColumnsColumnViewModel>();

            if (block.Has("columns") && block.Data["columns"] is JArray columnsArr)
            {
                foreach (var jCol in columnsArr)
                {
                    var column = new ColumnsColumnViewModel();

                    var blocksToken = jCol["blocks"];
                    if (blocksToken is JArray blocksArr
                        && blocksArr.Count > 0
                        && context.ParseBlocksAsync != null)
                    {
                        var editorBlocksJson = JsonConvert.SerializeObject(new
                        {
                            time = 0,
                            version = "2.28.2",
                            blocks = blocksArr
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
