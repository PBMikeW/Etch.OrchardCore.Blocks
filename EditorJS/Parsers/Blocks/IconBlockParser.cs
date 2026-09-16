using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class IconBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            return await context.ShapeFactory.New.Block__Icon(
                new IconBlockViewModel
                {
                    IconName = block.Get("iconName"),
                    IconStyle = block.Get("iconStyle"),
                    Size = block.Get("size"),
                    Color = block.Get("color"),
                    Alignment = block.Get("alignment"),
                    LinkUrl = block.Get("linkUrl"),
                    LinkNewTab = block.Get<bool>("linkNewTab", false)
                }
            );
        }
    }
}
