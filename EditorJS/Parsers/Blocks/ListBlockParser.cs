using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Text.Json;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class ListBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var items = new string[0];

            if (block.Has("items") && block.Data["items"] is JsonElement itemsEl)
            {
                items = itemsEl.Deserialize<string[]>();
            }

            return await context.ShapeFactory.New.Block__List(
                new ListBlockViewModel
                {
                    ListItems = items,
                    Style = block.Get("style")
                }
            );
        }
    }
}
