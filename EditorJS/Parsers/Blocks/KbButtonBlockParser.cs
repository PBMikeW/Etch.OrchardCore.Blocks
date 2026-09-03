using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class KbButtonBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            var shape = await context.ShapeFactory.New.Block__KbButton(
                new KbButtonBlockViewModel
                {
                    Url = block.Get("url"),
                    Label = block.Get("label"),
                    Style = block.Get("style"),
                    Alignment = block.Get("alignment"),
                    IconSvg = block.Get("iconSvg"),
                    IconPosition = block.Get("iconPosition"),
                    NewTab = block.Get<bool>("newTab", false),
                    Inline = block.Get<bool>("inline", false)
                }
            );

            // The button renders padding and anchor on its own wrapper so inline
            // buttons keep flowing side by side — the generic block wrapper in
            // BlockField/BlockBodyPart must not wrap it in a block-level div.
            shape.SelfPadded = true;

            return shape;
        }
    }
}
