using System;
using System.Collections.Generic;
using System.Linq;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// What an embed block may load. The embed view puts the block's <c>embed</c> URL straight into
    /// an iframe's <c>src</c>, so the URL decides what runs on the page.
    /// </summary>
    public static class EmbedSources
    {
        /// <summary>
        /// The services the admin's embed tool is configured with (Assets/Editor.js/js/index.js) and
        /// the hosts their player URLs use. A save by someone without ManageRawBlocks may only add
        /// or change an embed to one of these.
        /// </summary>
        public static readonly IReadOnlyDictionary<string, string[]> Services = new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["youtube"] = ["www.youtube.com", "youtube.com", "www.youtube-nocookie.com"],
            ["vimeo"] = ["player.vimeo.com"],
            ["twitch-channel"] = ["player.twitch.tv"],
            ["twitch-video"] = ["player.twitch.tv"],
        };

        /// <summary>
        /// The URL when it is an absolute https URL (no control characters, no credentials),
        /// otherwise null. Applied when rendering, for everyone's content: it stops a
        /// <c>javascript:</c> or <c>data:</c> iframe without touching what an https embed shows.
        /// </summary>
        public static string SafeSourceUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url) || url.Any(char.IsControl))
            {
                return null;
            }

            var trimmed = url.Trim();

            return Uri.TryCreate(trimmed, UriKind.Absolute, out var uri)
                && uri.Scheme == Uri.UriSchemeHttps
                && string.IsNullOrEmpty(uri.UserInfo)
                ? trimmed
                : null;
        }

        /// <summary>Whether <paramref name="service"/> is a supported service and <paramref name="url"/> an https URL on one of its hosts.</summary>
        public static bool IsAllowed(string service, string url)
        {
            if (service == null || !Services.TryGetValue(service, out var hosts))
            {
                return false;
            }

            var safe = SafeSourceUrl(url);

            return safe != null
                && Uri.TryCreate(safe, UriKind.Absolute, out var uri)
                && uri.IsDefaultPort
                && hosts.Contains(uri.Host, StringComparer.OrdinalIgnoreCase);
        }
    }
}
