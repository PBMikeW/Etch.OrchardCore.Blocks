using Microsoft.Extensions.Localization;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>What a block editor's save may store, and why it can't.</summary>
    /// <param name="Data">The data to store: the posted data, or with its new and changed blocks sanitised.</param>
    /// <param name="Errors">Why the save is refused (none: it may be saved).</param>
    public sealed record BlockEditResult(string Data, IReadOnlyList<string> Errors);

    /// <summary>
    /// The block editors' (BlockFieldDriver, BlockBodyPartDisplay) server-side check of a save, for
    /// a user without <see cref="Permissions.ManageRawBlocks"/>:
    /// <list type="bullet">
    /// <item>no raw HTML block may be added or have its HTML changed (<see cref="RawBlockEditGuard"/>);</item>
    /// <item>new and changed blocks have their text sanitised, embeds come only from the supported
    /// services, and a button keeps only the inline SVG icon it had (<see cref="BlockTextSanitizer"/>).</item>
    /// </list>
    /// Blocks left as they were are kept exactly, and removing blocks is allowed. A user with the
    /// permission saves what they posted. The editor's own sanitising runs in the browser; this is
    /// what holds for a hand-made request.
    /// </summary>
    public class BlockEditGuard
    {
        private readonly RawBlockEditGuard _rawBlockEditGuard;

        protected readonly IStringLocalizer S;

        public BlockEditGuard(RawBlockEditGuard rawBlockEditGuard, IStringLocalizer<BlockEditGuard> localizer)
        {
            _rawBlockEditGuard = rawBlockEditGuard;
            S = localizer;
        }

        /// <param name="before">The stored data (empty for a new item).</param>
        /// <param name="after">The posted data.</param>
        /// <param name="fieldName">Names the field in the errors (null for a Block Body part).</param>
        public async Task<BlockEditResult> GuardAsync(string before, string after, string fieldName)
        {
            if (string.Equals(before ?? string.Empty, after ?? string.Empty, StringComparison.Ordinal))
            {
                return new BlockEditResult(after, []);
            }

            var errors = new List<string>();

            if (!await _rawBlockEditGuard.CanSaveAsync(before, after))
            {
                errors.Add(Message(fieldName, S["only users with the \"Add or edit raw HTML blocks\" permission can add a raw HTML block or change one. Remove the new or edited raw HTML block, or put its HTML back as it was, and save again. Raw HTML blocks that are already on the page can stay as they are, or be removed."]));
            }

            var sanitized = BlockTextSanitizer.Sanitize(before, after, BlockHtmlSanitizer.Instance.Sanitize);

            // Unreadable data is refused above (it counts as adding a raw block) unless the user
            // holds the permission; nothing here can make it safer.
            if (sanitized.Unreadable || (!sanitized.Changed && sanitized.Refusals.Count == 0))
            {
                return new BlockEditResult(after, errors);
            }

            if (await _rawBlockEditGuard.CanManageRawBlocksAsync())
            {
                return new BlockEditResult(after, errors);
            }

            foreach (var refusal in sanitized.Refusals)
            {
                errors.Add(Message(fieldName, refusal switch
                {
                    BlockRefusal.EmbedSource => S["an embed can only show a YouTube, Vimeo or Twitch video or channel, from its https player address. Embed it with the editor's embed tool, or remove it."].Value,
                    BlockRefusal.InlineSvgIcon => S["a button can only keep the inline SVG icon it already had. Choose an icon from the button's icon picker instead."].Value,
                    _ => throw new ArgumentOutOfRangeException(nameof(refusal), refusal, null),
                }));
            }

            return new BlockEditResult(sanitized.Data, errors);
        }

        private static string Message(string fieldName, string text)
            => string.IsNullOrEmpty(fieldName) ? char.ToUpperInvariant(text[0]) + text[1..] : fieldName + ": " + text;
    }
}
