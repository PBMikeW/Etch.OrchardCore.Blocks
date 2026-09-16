using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using OrchardCore.ContentManagement.Metadata;
using OrchardCore.ContentManagement.Metadata.Settings;
using OrchardCore.Data.Migration;

namespace Etch.OrchardCore.Blocks
{
    // Local settings class matching OrchardCore.Flows.Models.FlowPartSettings shape.
    // WithSettings<T> serializes under typeof(T).Name so this must be named exactly "FlowPartSettings".
    public class FlowPartSettings
    {
        public string[] ContainedContentTypes { get; set; } = [];
    }

    public class Migrations : DataMigration
    {
        private readonly IContentDefinitionManager _contentDefinitionManager;
        private readonly ILogger<Migrations> _logger;

        public Migrations(IContentDefinitionManager contentDefinitionManager, ILogger<Migrations> logger)
        {
            _contentDefinitionManager = contentDefinitionManager;
            _logger = logger;
        }

        public async Task<int> CreateAsync()
        {
            await _contentDefinitionManager.AlterPartDefinitionAsync("BlockBodyPart", builder => builder
                .Attachable()
                .Reusable()
                .WithDisplayName("Block Body")
                .WithDescription("Provides rich text editor for curating content for body of content item.")
                .WithDefaultPosition("5")
            );

            // Skip to latest version on fresh installs
            return 6;
        }

        // Previously created Container content type - no longer needed but keeping
        // migration chain intact for existing databases already at version 2/3.
        public Task<int> UpdateFrom1Async() => Task.FromResult(2);

        public Task<int> UpdateFrom2Async() => Task.FromResult(3);

        public async Task<int> UpdateFrom3Async()
        {
            // Create the Container part with a "No padding" boolean field
            await _contentDefinitionManager.AlterPartDefinitionAsync("Container", part => part
                .WithField("Nopadding", field => field
                    .OfType("BooleanField")
                    .WithDisplayName("No padding")
                    .WithPosition("0")
                )
            );

            // Create the Container content type as a Widget with FlowPart
            await _contentDefinitionManager.AlterTypeDefinitionAsync("Container", type => type
                .Stereotype("Widget")
                .DisplayedAs("Container")
                .WithPart("Container", part => part
                    .WithPosition("0")
                )
                .WithPart("FlowPart", part => part
                    .WithDisplayName("Flow")
                    .WithDescription("Provides a customizable body for your content item where you can build a content structure with widgets.")
                    .WithPosition("1")
                    .WithSettings(new FlowPartSettings
                    {
                        ContainedContentTypes = new[] { "Container", "ContentBlock" }
                    })
                )
            );

            // Add Container to KnowledgeBaseArticle's FlowPart allowed types
            var kbaType = await _contentDefinitionManager.GetTypeDefinitionAsync("KnowledgeBaseArticle");
            if (kbaType != null)
            {
                var flowPart = kbaType.Parts.FirstOrDefault(p => p.PartDefinition.Name == "FlowPart");
                if (flowPart != null)
                {
                    var existing = flowPart.GetSettings<FlowPartSettings>();
                    var types = (existing.ContainedContentTypes ?? []).ToList();
                    if (!types.Contains("Container"))
                    {
                        types.Add("Container");
                    }
                    var updated = types.ToArray();

                    await _contentDefinitionManager.AlterTypeDefinitionAsync("KnowledgeBaseArticle", type => type
                        .WithPart("FlowPart", part => part
                            .WithSettings(new FlowPartSettings
                            {
                                ContainedContentTypes = updated
                            })
                        )
                    );
                }
            }

            return 4;
        }

        public async Task<int> UpdateFrom4Async()
        {
            // Give containers the same padding controls as ContentBlocks. The
            // ContentBlockStyling part (PaddingTop/Bottom/Left/Right predefined
            // lists) is a site-defined dynamic part shared with ContentBlock, so it
            // is attached by name, not created here. Attaching is idempotent. The
            // legacy Container.Nopadding field stays in place - themes fall back to
            // it until a page is resaved with explicit padding.
            await _contentDefinitionManager.AlterTypeDefinitionAsync("Container", type => type
                .WithPart("ContentBlockStyling", part => part
                    .WithPosition("2")
                )
            );

            return 5;
        }

        public async Task<int> UpdateFrom5Async()
        {
            // Give containers a background, so a Container dropped into a News
            // article can be a colour block or sit on an image. This reuses the
            // banners' BackgroundInfo part (BackgroundMedia = mobile/default
            // image, BackgroundMediaDesktop, UseOverlay, BackgroundContrast,
            // BackgroundColor predefined list) rather than inventing a second
            // set of fields, so the desktop/mobile semantics and the brand
            // palette stay shared with every other backgrounded type.
            //
            // BackgroundInfo is a site-defined dynamic part, like
            // ContentBlockStyling above, so it is attached by name and not
            // created here. Unlike the attach above this one is guarded:
            // WithPart on a name that has no part definition would silently
            // create an empty part, and a tenant that does not define
            // BackgroundInfo should get nothing rather than a hollow one.
            // Attaching is otherwise idempotent.
            var backgroundInfo = await _contentDefinitionManager.GetPartDefinitionAsync("BackgroundInfo");
            if (backgroundInfo == null)
            {
                _logger.LogInformation("Skipping BackgroundInfo attach to Container: this tenant has no BackgroundInfo part definition.");
                return 6;
            }

            await _contentDefinitionManager.AlterTypeDefinitionAsync("Container", type => type
                .WithPart("BackgroundInfo", part => part
                    .WithPosition("3")
                )
            );

            return 6;
        }
    }
}
