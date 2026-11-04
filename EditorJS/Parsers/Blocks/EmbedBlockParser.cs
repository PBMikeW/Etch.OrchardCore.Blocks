using System.Threading.Tasks;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.Services;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class EmbedBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            return await context.ShapeFactory.New.Block__Embed(
                new EmbedBlockViewModel
                {
                    Caption = block.Get("caption"),
                    Service = block.Get("service"),
                    // The view writes it into an iframe's src: only an https URL.
                    SourceUrl = EmbedSources.SafeSourceUrl(block.Get("embed"))
                }
            );
        }
    }
}
