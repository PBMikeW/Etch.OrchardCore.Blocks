using System.Linq;
using System.Threading.Tasks;
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

        public Migrations(IContentDefinitionManager contentDefinitionManager)
        {
            _contentDefinitionManager = contentDefinitionManager;
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
            return 4;
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
    }
}
