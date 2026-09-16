using System;
using System.Collections.Generic;
using System.Linq;

namespace Etch.OrchardCore.Blocks.ViewModels.Blocks
{
    /// <summary>
    /// A link URL typed into a block's settings is written straight into an
    /// href, so "javascript:…" saved by anyone who can edit content runs for
    /// every visitor of the page — HTML encoding does not stop it, because the
    /// value is legal HTML, just not a legal destination. Every block that
    /// renders a link (the icon block, the button) puts the editor's value
    /// through here first.
    /// </summary>
    public static class BlockLinkUrl
    {
        /// <summary>
        /// Schemes an editor may link to. Anything else — javascript:, data:,
        /// vbscript:, an unknown app handler — is dropped rather than escaped:
        /// there is no encoding that makes them safe in an href, and a block
        /// that renders without a link is the better failure.
        /// </summary>
        private static readonly HashSet<string> AllowedSchemes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "http",
            "https",
            "mailto",
            "tel"
        };

        private static readonly char[] PathStartCharacters = { '/', '?', '#' };

        /// <summary>
        /// The URL when it is safe to put in an href, otherwise an empty
        /// string — which the views read as "render no anchor".
        /// </summary>
        public static string SafeLinkUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return string.Empty;
            }

            // Browsers ignore tabs, newlines and other control characters while
            // working out a URL's scheme, so "java&#9;script:alert(1)" runs as
            // script. Strip them (and the surrounding whitespace) before
            // deciding, or this reads a scheme the browser never will.
            var cleaned = new string(url.Where(c => !char.IsControl(c)).ToArray()).Trim();

            if (cleaned.Length == 0)
            {
                return string.Empty;
            }

            var colon = cleaned.IndexOf(':');

            // No colon at all — a relative URL ("/contact", "./x", "#anchor",
            // "?page=2", "contact/us"). It cannot name a protocol.
            if (colon < 0)
            {
                return cleaned;
            }

            var beforeColon = cleaned.Substring(0, colon);

            // A colon that only shows up after the path, query or fragment has
            // started ("/a/b:c", "?x=1:2") is part of the path, not a scheme.
            if (beforeColon.IndexOfAny(PathStartCharacters) >= 0)
            {
                return cleaned;
            }

            // A scheme is a letter followed by letters, digits, '+', '-' or '.'
            // (RFC 3986). Anything else in front of the colon is not a scheme
            // to a browser either — "java script:x" is a relative path.
            if (!IsSchemeToken(beforeColon))
            {
                return cleaned;
            }

            return AllowedSchemes.Contains(beforeColon) ? cleaned : string.Empty;
        }

        private static bool IsSchemeToken(string value)
        {
            if (value.Length == 0 || !IsAsciiLetter(value[0]))
            {
                return false;
            }

            return value.All(c => IsAsciiLetter(c) || (c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.');
        }

        private static bool IsAsciiLetter(char c)
        {
            return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
        }
    }
}
