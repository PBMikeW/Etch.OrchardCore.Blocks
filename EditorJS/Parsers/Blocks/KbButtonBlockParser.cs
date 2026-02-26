using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class KbButtonBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            return await context.ShapeFactory.New.Block__KbButton(
                new KbButtonBlockViewModel
                {
                    Url = block.Get("url"),
                    Label = block.Get("label"),
                    Style = block.Get("style"),
                    Alignment = block.Get("alignment")
                }
            );
        }
    }
}
