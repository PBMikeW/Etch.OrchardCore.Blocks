using AngleSharp.Dom;
using Ganss.Xss;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// The sanitiser for block text (<see cref="BlockTextSanitizer"/>): its own instance, not the tenant's
    /// IHtmlSanitizerService, so it can be as narrow as the editor's inline tools and nothing else on the tenant changes.
    /// <list type="bullet">
    /// <item>Tags: what the inline tools write - b, i, u, strong, em, br, a (link), font (colour), mark (highlight),
    /// span (font size). Anything else is removed with its content (script, style, iframe, form and its controls, img,
    /// div ...).</item>
    /// <item>Attributes: href, target, rel, class (only <c>fontsize-tool</c>), color (legacy <c>&lt;font color&gt;</c>),
    /// style. href may be http, https, mailto, tel or relative.</item>
    /// <item>style is kept only when every declaration is color, background-color, font-size or text-align with a plain
    /// value (a colour, a size, an alignment): anything else (position, z-index, background, url(), expression ...) drops
    /// the whole attribute. A kept style is left exactly as written, so text the editor saved comes back unchanged and a
    /// styled block isn't rewritten on every save.</item>
    /// <item>A link that opens a new tab gets <c>rel="noopener noreferrer"</c> (added to any rel it has).</item>
    /// </list>
    /// </summary>
    public sealed class BlockHtmlSanitizer
    {
        public static readonly IReadOnlySet<string> Tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "a", "b", "br", "em", "font", "i", "mark", "span", "strong", "u",
        };

        public static readonly IReadOnlySet<string> Attributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "href", "target", "rel", "class", "color",
        };

        public static readonly IReadOnlySet<string> CssProperties = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "color", "background-color", "font-size", "text-align",
        };

        public static readonly IReadOnlySet<string> Schemes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "http", "https", "mailto", "tel",
        };

        public static readonly IReadOnlySet<string> CssClasses = new HashSet<string>(StringComparer.Ordinal)
        {
            "fontsize-tool",
        };

        public static BlockHtmlSanitizer Instance { get; } = new();

        private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(1);

        /// <summary>Where a safe style waits while its element is sanitised.</summary>
        private const string KeptStyle = "data-pb-block-kept-style";

        private static readonly Regex Colour = new(
            @"^(#[0-9a-f]{3,8}|[a-z]{1,30}|(rgb|rgba|hsl|hsla)\([0-9\s.,%]{1,60}\))$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        private static readonly Regex FontSize = new(
            @"^([0-9]{1,4}(\.[0-9]{1,4})?(px|pt|em|rem|%)|[a-z-]{1,20})$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        private static readonly Regex TextAlign = new(
            "^(left|center|right|justify|start|end)$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        private readonly HtmlSanitizer _sanitizer;

        private BlockHtmlSanitizer()
        {
            _sanitizer = new HtmlSanitizer(new HtmlSanitizerOptions
            {
                AllowedTags = new HashSet<string>(Tags, StringComparer.OrdinalIgnoreCase),
                AllowedAttributes = new HashSet<string>(Attributes, StringComparer.OrdinalIgnoreCase),
                AllowedCssProperties = new HashSet<string>(CssProperties, StringComparer.OrdinalIgnoreCase),
                AllowedCssClasses = new HashSet<string>(CssClasses, StringComparer.Ordinal),
                AllowedSchemes = new HashSet<string>(Schemes, StringComparer.OrdinalIgnoreCase),
                UriAttributes = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "href" },
            });

            // style isn't an allowed attribute, so the sanitiser removes it; when it is allowed (or a removal is
            // cancelled) the sanitiser re-serialises it (rgb() as rgba(..., 1), trailing semicolons dropped), so a
            // styled block would look changed on every save. A safe style is set aside on a placeholder attribute
            // while the element is sanitised and put back, exactly as written, afterwards.
            _sanitizer.RemovingAttribute += (_, e) =>
            {
                if (e.Reason == RemoveReason.NotAllowedAttribute
                    && string.Equals(e.Attribute.Name, "style", StringComparison.OrdinalIgnoreCase)
                    && IsSafeStyle(e.Attribute.Value))
                {
                    e.Tag.SetAttribute(KeptStyle, e.Attribute.Value);
                }
            };

            _sanitizer.PostProcessNode += (_, e) =>
            {
                if (e.Node is IElement styled && styled.GetAttribute(KeptStyle) is { } style)
                {
                    styled.RemoveAttribute(KeptStyle);

                    // Checked again: only ever a value this sanitiser set aside (a placeholder in the input is a
                    // data- attribute, which the sanitiser removes), but the attribute name is guessable.
                    if (IsSafeStyle(style))
                    {
                        styled.SetAttribute("style", style);
                    }
                }

                if (e.Node is IElement element
                    && string.Equals(element.LocalName, "a", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(element.GetAttribute("target")?.Trim(), "_blank", StringComparison.OrdinalIgnoreCase))
                {
                    var rel = (element.GetAttribute("rel") ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
                    var missing = new[] { "noopener", "noreferrer" }.Where(token => !rel.Contains(token, StringComparer.OrdinalIgnoreCase)).ToList();
                    if (missing.Count > 0)
                    {
                        element.SetAttribute("rel", string.Join(' ', rel.Concat(missing)));
                    }
                }
            };
        }

        public string Sanitize(string html) => _sanitizer.Sanitize(html ?? string.Empty);

        /// <summary>
        /// Whether every declaration in <paramref name="style"/> is one of <see cref="CssProperties"/> with a plain value
        /// (empty declarations, as from a trailing semicolon, are fine).
        /// </summary>
        public static bool IsSafeStyle(string style)
        {
            if (string.IsNullOrWhiteSpace(style) || style.Length > 500 || style.Contains("/*", StringComparison.Ordinal) || style.Contains('\\'))
            {
                return false;
            }

            foreach (var declaration in style.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(declaration))
                {
                    continue;
                }

                var colon = declaration.IndexOf(':');
                if (colon <= 0)
                {
                    return false;
                }

                var property = declaration[..colon].Trim().ToLowerInvariant();
                var value = declaration[(colon + 1)..].Trim();

                var safe = property switch
                {
                    "color" or "background-color" => Colour.IsMatch(value),
                    "font-size" => FontSize.IsMatch(value),
                    "text-align" => TextAlign.IsMatch(value),
                    _ => false,
                };

                if (!safe)
                {
                    return false;
                }
            }

            return true;
        }
    }
}
