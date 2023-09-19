using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using Newtonsoft.Json.Linq;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class TableBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var content = block.Has("content") ? (block.Data["content"] as JArray).ToObject<string[][]>() : new string[0][];
            return await context.ShapeFactory.New.Block__Table(
                new TableBlockViewModel
                {
                    WithHeadings = block.Get("withHeadings") == "True" ? true : false,
                    Content = content
                }
            );
        }
    }
}
