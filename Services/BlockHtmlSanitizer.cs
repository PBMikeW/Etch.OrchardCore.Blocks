using AngleSharp.Dom;
using Ganss.Xss;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;
using System.Text.RegularExpressions;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// The sanitiser for block text: the block editors' (<see cref="BlockTextSanitizer"/>), and PropertyBrokersWeb's MCP
    /// and AI-editor writes of block content. Its own instance, not the tenant's IHtmlSanitizerService, so it can be as
    /// narrow as the editor's inline tools and nothing else on the tenant changes.
    /// <list type="bullet">
    /// <item>Tags: what the inline tools write - b, i, u, strong, em, br, a (link), font (colour), mark (highlight),
    /// span (font size). Any other element is removed and its children kept, each sanitised the same way, so text
    /// wrapped in a p or div survives as text; script, style, svg, math, template, noscript, iframe, object, textarea
    /// and select are removed with everything in them.</item>
    /// <item>Attributes: href, target (only <c>_blank</c>), rel, class (only <c>fontsize-tool</c>), color (legacy
    /// <c>&lt;font color&gt;</c>), style. href may be http, https, mailto, tel or relative.</item>
    /// <item>style keeps only its color, background-color, font-size and text-align declarations, each with a plain value
    /// (a colour, a size, an alignment); every other declaration (position, z-index, background, url(), expression ...)
    /// is dropped. A style that needs nothing dropped is kept exactly as written, so text the editor saved comes back
    /// unchanged and a styled block isn't rewritten on every save.</item>
    /// <item>A link that opens a new tab gets <c>rel="noopener noreferrer"</c> (added to any rel it has).</item>
    /// </list>
    /// </summary>
    public sealed class BlockHtmlSanitizer
    {
        public static readonly IReadOnlySet<string> Tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "a", "b", "br", "em", "font", "i", "mark", "span", "strong", "u",
        };

        /// <summary>Elements removed together with their content (everything else disallowed keeps its children).</summary>
        public static readonly IReadOnlySet<string> RemovedWithContent = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "script", "style", "svg", "math", "template", "noscript", "iframe", "object", "textarea", "select",
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

        private static readonly Regex Colour = new(
            @"^(#[0-9a-f]{3,8}|[a-z]{1,30}|(rgb|rgba|hsl|hsla)\([0-9\s.,%]{1,60}\))$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        private static readonly Regex FontSize = new(
            @"^([0-9]{1,4}(\.[0-9]{1,4})?(px|pt|em|rem|%)|[a-z-]{1,20})$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        private static readonly Regex TextAlign = new(
            "^(left|center|right|justify|start|end)$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, RegexTimeout);

        /// <summary>
        /// The style each element keeps, set aside while the sanitiser works on the element (it would otherwise remove the
        /// attribute, or re-serialise it) and put back afterwards. Keyed by the parsed element itself, so nothing in the
        /// input can name or reach an entry.
        /// </summary>
        private readonly ConditionalWeakTable<IElement, string> _keptStyles = new();

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
            })
            {
                KeepChildNodes = true,
            };

            _sanitizer.RemovingTag += (_, e) =>
            {
                if (RemovedWithContent.Contains(e.Tag.LocalName))
                {
                    foreach (var child in e.Tag.ChildNodes.ToList())
                    {
                        child.RemoveFromParent();
                    }
                }
            };

            _sanitizer.RemovingAttribute += (_, e) =>
            {
                if (e.Reason == RemoveReason.NotAllowedAttribute
                    && string.Equals(e.Attribute.Name, "style", StringComparison.OrdinalIgnoreCase)
                    && FilterStyle(e.Attribute.Value) is { } kept)
                {
                    _keptStyles.AddOrUpdate(e.Tag, kept);
                }
            };

            _sanitizer.PostProcessNode += (_, e) =>
            {
                if (e.Node is not IElement element)
                {
                    return;
                }

                if (_keptStyles.TryGetValue(element, out var style))
                {
                    _keptStyles.Remove(element);
                    element.SetAttribute("style", style);
                }

                if (element.GetAttribute("target") is { } target)
                {
                    if (!string.Equals(target.Trim(), "_blank", StringComparison.OrdinalIgnoreCase))
                    {
                        // Only new-tab links: a named target can be a window another page opened, and gets no noopener.
                        element.RemoveAttribute("target");
                    }
                    else
                    {
                        var rel = (element.GetAttribute("rel") ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries).ToList();
                        var missing = new[] { "noopener", "noreferrer" }.Where(token => !rel.Contains(token, StringComparer.OrdinalIgnoreCase)).ToList();
                        if (missing.Count > 0)
                        {
                            element.SetAttribute("rel", string.Join(' ', rel.Concat(missing)));
                        }
                    }
                }
            };
        }

        public string Sanitize(string html) => _sanitizer.Sanitize(html ?? string.Empty);

        /// <summary>Whether <paramref name="style"/> is kept exactly as written (every declaration allowed).</summary>
        public static bool IsSafeStyle(string style) => FilterStyle(style) is { } kept && ReferenceEquals(kept, style);

        /// <summary>
        /// The style with only its allowed declarations: <paramref name="style"/> itself when all of them are, the allowed
        /// ones rewritten as <c>name: value;</c> (as the browser writes them) when some aren't, and null when none are, or
        /// the style holds a comment, an escape or is overlong (which can't be split into declarations safely).
        /// </summary>
        public static string FilterStyle(string style)
        {
            if (string.IsNullOrWhiteSpace(style) || style.Length > 500 || style.Contains("/*", StringComparison.Ordinal) || style.Contains('\\'))
            {
                return null;
            }

            var kept = new List<string>();
            var droppedAny = false;

            foreach (var declaration in style.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(declaration))
                {
                    continue;
                }

                var colon = declaration.IndexOf(':');
                var property = colon > 0 ? declaration[..colon].Trim().ToLowerInvariant() : null;
                var value = colon > 0 ? declaration[(colon + 1)..].Trim() : null;

                var safe = property switch
                {
                    "color" or "background-color" => Colour.IsMatch(value),
                    "font-size" => FontSize.IsMatch(value),
                    "text-align" => TextAlign.IsMatch(value),
                    _ => false,
                };

                if (safe)
                {
                    kept.Add($"{property}: {value};");
                }
                else
                {
                    droppedAny = true;
                }
            }

            if (kept.Count == 0)
            {
                return null;
            }

            return droppedAny ? string.Join(' ', kept) : style;
        }
    }
}
