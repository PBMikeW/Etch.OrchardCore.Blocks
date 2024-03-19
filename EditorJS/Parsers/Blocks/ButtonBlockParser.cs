using System.Threading.Tasks;
using Azure.Core;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks;

public class ButtonBlockParser : IBlockParser
{
    public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
    {
        var url = block.Has("url") ? block.Get("url") : string.Empty;
        var buttonText = block.Has("label") ? block.Get("label") : "Click Here";
        var buttonClass = block.Get("colorStyle");

        return await context.ShapeFactory.New.Block__Button(
            new ButtonBlockViewModel
            {
                Label = buttonText,
                Url = url,
                ButtonClass = buttonClass
            }
        );
    }
}