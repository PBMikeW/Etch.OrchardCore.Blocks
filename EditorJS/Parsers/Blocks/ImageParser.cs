using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using Newtonsoft.Json.Linq;
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
                    MediaPath = GetMediaPath(block),
                    Profile = GetProfile(block),
                    Stretched = block.Get("stretched", false),
                    Url = GetMediaUrl(context, block),
                    LinkUrl = block.Get("linkUrl"),
                    LinkNewTab = block.Get("linkNewTab", false),
                }
            );
        }

        /// <summary>
        /// Reads the media profile name from the block, accepting both shapes the
        /// media library plugin has stored over its lifetime.
        /// </summary>
        /// <remarks>
        /// The current plugin stores just the name, e.g. <c>"profile": "160x160"</c>.
        /// An earlier version stored the whole profile object, e.g.
        /// <c>"profile": { "name": "large", "icon": "&lt;svg…&gt;", "previewSize": 480 }</c>.
        /// Calling ToString() on that yields the JSON text, which is not a media
        /// profile, so the view fell through and served the unresized original.
        /// </remarks>
        private static string GetProfile(Block block)
        {
            if (!block.Has("profile"))
            {
                return string.Empty;
            }

            var value = block.Data["profile"];

            if (value is JObject profile)
            {
                var name = profile.Value<string>("name");

                if (!string.IsNullOrWhiteSpace(name))
                {
                    return name;
                }

                // No name to go on: the plugin's own profiles are all square and
                // named after their preview size, so "480" means the "480x480"
                // media profile.
                var previewSize = profile.Value<int?>("previewSize");

                return previewSize.HasValue && previewSize.Value > 0
                    ? $"{previewSize.Value}x{previewSize.Value}"
                    : string.Empty;
            }

            return value?.ToString() ?? string.Empty;
        }

        /// <summary>
        /// The block's raw media store path, normalized, or empty when the block has
        /// none (a legacy block that only ever stored a pasted <c>url</c>).
        /// </summary>
        /// <remarks>
        /// The view needs this alongside <c>Url</c>. Asking for a media profile URL
        /// means handing IMediaFileStore a raw asset path, and recovering one from the
        /// mapped public URL in <c>Url</c> is lossy: on Linux .NET reads a rooted path
        /// as an implicit file:/// URI, so the view's Uri round-trip re-escaped the
        /// literal '%' and every filename with a space 404'd. Handing the view the path
        /// the block actually stored removes the round-trip.
        /// </remarks>
        private static string GetMediaPath(Block block)
        {
            return MediaPathNormalizer.Normalize(block.Get("mediaPath"));
        }

        private string GetMediaUrl(BlockParserContext context, Block block)
        {
            var mediaPath = block.Get("mediaPath");

            if (string.IsNullOrEmpty(mediaPath))
            {
                return block.Get("url");
            }

            // MapPathToPublicUrl escapes every segment of the path it is handed, so a
            // stored path that is already escaped gets escaped a second time ("%20"
            // becomes "%2520") and the request 404s. See MediaPathNormalizer.
            return context.MediaFileStore.MapPathToPublicUrl(MediaPathNormalizer.Normalize(mediaPath));
        }
    }
}
