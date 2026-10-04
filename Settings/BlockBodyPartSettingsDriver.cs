using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.ViewModels;
using OrchardCore.ContentManagement.Metadata.Models;
using OrchardCore.ContentTypes.Editors;
using OrchardCore.DisplayManagement.Handlers;
using OrchardCore.DisplayManagement.Views;
using System;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Settings
{
    public class BlockBodyPartSettingsDriver : ContentTypePartDefinitionDisplayDriver
    {
#if NET10_0_OR_GREATER
        public override IDisplayResult Edit(ContentTypePartDefinition model, BuildEditorContext context)
        {
#else
        public override IDisplayResult Edit(ContentTypePartDefinition model)
        {
#endif
            if (!string.Equals(nameof(BlockBodyPart), model.PartDefinition.Name, StringComparison.Ordinal))
            {
                return null;
            }

            return Initialize<BlockBodyPartSettingsViewModel>("BlockBodyPartSettings_Edit", settings =>
            {
                var blockBodyPartSettings = model.GetSettings<BlockBodyPartSettings>();

                settings.LinkableContentTypes = blockBodyPartSettings.LinkableContentTypes;
                settings.Placeholder = blockBodyPartSettings.Placeholder;
                settings.BlockBodyPartSettings = blockBodyPartSettings;
            }).Location("Content");
        }

        public override async Task<IDisplayResult> UpdateAsync(ContentTypePartDefinition model, UpdateTypePartEditorContext context)
        {
            if (!string.Equals(nameof(BlockBodyPart), model.PartDefinition.Name, StringComparison.Ordinal))
            {
                return null;
            }

            var settings = new BlockBodyPartSettings();

            await context.Updater.TryUpdateModelAsync(settings, Prefix);

            context.Builder.WithSettings(settings);

#if NET10_0_OR_GREATER
            return Edit(model, context);
#else
            return Edit(model);
#endif
        }
    }
}
