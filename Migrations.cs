using System.Linq;
using System.Text.Json.Serialization;
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

    // Local settings classes matching the OrchardCore.ContentFields.Settings shapes,
    // for the same reason FlowPartSettings above is local: this module references the
    // OrchardCore framework libraries only, never another module's package, and
    // WithSettings<T> writes the object under typeof(T).Name with no compile-time link
    // to the reader. So the class names, the property names and the JSON attribute
    // names below have to match OrchardCore.ContentFields exactly - they are the
    // contract. Verified against OrchardCore 2.2.1
    // (src/OrchardCore.Modules/OrchardCore.ContentFields/Settings/).
    public class TextFieldSettings
    {
        public string Hint { get; set; }
        public bool Required { get; set; }
        public string DefaultValue { get; set; }
    }

    public class TextFieldPredefinedListEditorSettings
    {
        public ListValueOption[] Options { get; set; }
        public EditorOption Editor { get; set; }
        public string DefaultValue { get; set; }
    }

    // Serialized as a number - the content definition serializer has no string enum
    // converter - so the order of these members is part of the contract too: Dropdown
    // has to stay 1, which is what the site's own predefined lists already store.
    public enum EditorOption
    {
        Radio,
        Dropdown
    }

    // TextField-PredefinedList.Edit.cshtml reads these back through the real
    // ContentFields class, whose two properties carry [JsonPropertyName] with lower
    // case names.
    public class ListValueOption
    {
        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("value")]
        public string Value { get; set; }

        public ListValueOption()
        {
        }

        public ListValueOption(string name, string value)
        {
            Name = name;
            Value = value;
        }
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

            // Skip to latest version on fresh installs. Note what that means for every
            // UpdateFrom below: a fresh install runs none of them, so it gets neither the
            // Container type nor any of the parts they attach to it. On a new tenant the
            // Container type comes from the site's own content definition recipe instead,
            // and anything this module attaches to it - ContentBlockStyling,
            // BackgroundInfo, ContainerBackground - has to be in that recipe too or it will
            // be missing there until a later UpdateFrom adds it.
            return 7;
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
                // Warning, not information: this is a permanent skip. The migration
                // records version 6 either way, so if the tenant defines
                // BackgroundInfo later this step will never run again and containers
                // there will stay without a background until a new UpdateFrom6Async
                // attaches it.
                _logger.LogWarning("Skipping BackgroundInfo attach to Container permanently: this tenant has no BackgroundInfo part definition. The migration still records version 6, so defining the part later will not attach it - that would need a new UpdateFrom6Async.");
                return 6;
            }

            await _contentDefinitionManager.AlterTypeDefinitionAsync("Container", type => type
                .WithPart("BackgroundInfo", part => part
                    .WithPosition("3")
                )
            );

            return 6;
        }

        public async Task<int> UpdateFrom6Async()
        {
            // Width, corner and height options for containers, in a part this module owns.
            // The two attaches above reuse site-defined parts; this one deliberately does
            // not. BackgroundInfo is shared with every banner type on both sites, so putting
            // container-only fields in it would add "Background width" and "Rounded corners"
            // to every masthead, CTA banner and featured content banner as well. A separate,
            // module-owned part leaves the shared one untouched, and means this migration can
            // create it outright rather than guarding on the tenant having defined it.
            //
            // Not attachable: the part exists for the Container type and is attached below.
            // Keeping it out of the admin "Add parts" list stops it being bolted onto
            // unrelated types where no theme reads it.
            //
            // All three fields are TextFields with the PredefinedList editor - the same
            // editor and the same stored shape as the site's ContentBlockStyling padding
            // fields and the banners' LayoutOptions height field - so nothing new has to be
            // taught to the admin UI or to a recipe author. DefaultValue only preselects the
            // dropdown; the stored text stays empty until the item is saved, so the themes
            // have to treat empty and the default value alike. They do, which is why a
            // container that has never been resaved renders byte for byte as it does today.
            //
            // Height sits here rather than on ContentBlockStyling because it belongs with the
            // other two in the editor, even though - unlike Width and Corners, which only mean
            // anything once a background is set - it applies whether or not there is one.
            await _contentDefinitionManager.AlterPartDefinitionAsync("ContainerBackground", part => part
                .Attachable(false)
                .WithDisplayName("Container Background")
                .WithDescription("Width, corner and height options for a Container.")
                .WithField("Width", field => field
                    .OfType("TextField")
                    .WithDisplayName("Background width")
                    .WithEditor("PredefinedList")
                    .WithPosition("0")
                    .WithSettings(new TextFieldSettings
                    {
                        Hint = "Full width bleeds the background to the page edges; the content stays in its column."
                    })
                    .WithSettings(new TextFieldPredefinedListEditorSettings
                    {
                        Options =
                        [
                            new ListValueOption("Normal", "normal"),
                            new ListValueOption("Full width", "full")
                        ],
                        DefaultValue = "normal",
                        Editor = EditorOption.Dropdown
                    })
                )
                .WithField("Corners", field => field
                    .OfType("TextField")
                    .WithDisplayName("Rounded corners")
                    .WithEditor("PredefinedList")
                    .WithPosition("1")
                    .WithSettings(new TextFieldPredefinedListEditorSettings
                    {
                        Options =
                        [
                            new ListValueOption("None", "none"),
                            new ListValueOption("Small", "sm"),
                            new ListValueOption("Large", "lg")
                        ],
                        DefaultValue = "none",
                        Editor = EditorOption.Dropdown
                    })
                )
                .WithField("Height", field => field
                    .OfType("TextField")
                    .WithDisplayName("Minimum height")
                    .WithEditor("PredefinedList")
                    .WithPosition("2")
                    .WithSettings(new TextFieldPredefinedListEditorSettings
                    {
                        Options =
                        [
                            new ListValueOption("Content", "content"),
                            new ListValueOption("17vh", "17vh"),
                            new ListValueOption("35vh", "35vh"),
                            new ListValueOption("50vh", "50vh"),
                            new ListValueOption("Full screen", "100vh")
                        ],
                        DefaultValue = "content",
                        Editor = EditorOption.Dropdown
                    })
                )
            );

            // Position 4: after Container (0), FlowPart (1), ContentBlockStyling (2) and
            // BackgroundInfo (3). No guard here, unlike the BackgroundInfo attach above -
            // the part definition is created a few lines up, so it is always there.
            await _contentDefinitionManager.AlterTypeDefinitionAsync("Container", type => type
                .WithPart("ContainerBackground", part => part
                    .WithPosition("4")
                )
            );

            return 7;
        }
    }
}
