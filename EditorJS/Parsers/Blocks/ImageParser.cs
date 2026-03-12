using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class ImageParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            return await context.ShapeFactory.New.Block__Image(
                new ImageBlockViewModel
                {
                    Alignment = block.Get("alignment", "center"),
                    Caption = block.Get("caption"),
                    Profile = block.Get("profile"),
                    Stretched = block.Get("stretched", false),
                    Url = GetMediaUrl(context, block),
                    LinkUrl = block.Get("linkUrl"),
                    LinkNewTab = block.Get("linkNewTab", false),
<<<<<<< Updated upstream
                    ImageAnchor = block.Get("anchor"),
=======
>>>>>>> Stashed changes
                }
            );
        }

        private string GetMediaUrl(BlockParserContext context, Block block)
        {
            var mediaPath = block.Get("mediaPath");

            if (string.IsNullOrEmpty(mediaPath))
            {
                return block.Get("url");
            }

            return context.MediaFileStore.MapPathToPublicUrl(mediaPath);
        }
    }
}