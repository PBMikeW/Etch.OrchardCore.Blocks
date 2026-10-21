using Microsoft.Extensions.Options;
using OrchardCore.Infrastructure.Html;

namespace Etch.OrchardCore.Blocks.Tests;

internal static class Sanitizers
{
    /// <summary>
    /// OrchardCore's IHtmlSanitizerService as a tenant gets it (OrchardCoreBuilderExtensions.AddHtmlSanitizer:
    /// Ganss HtmlSanitizer defaults, plus the class attribute, minus form) on a tenant with the Blocks feature, which
    /// adds mailto and tel (BlockTextSanitizer.AllowLinkSchemes).
    /// </summary>
    public static IHtmlSanitizerService OrchardCore()
    {
        var options = new HtmlSanitizerOptions();
        options.Configure.Add(sanitizer =>
        {
            sanitizer.AllowedAttributes.Add("class");
            sanitizer.AllowedTags.Remove("form");
        });
        options.Configure.Add(Services.BlockTextSanitizer.AllowLinkSchemes);

        return new HtmlSanitizerService(Options.Create(options));
    }
}
