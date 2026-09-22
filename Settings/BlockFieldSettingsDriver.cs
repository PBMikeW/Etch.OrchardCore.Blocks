using Etch.OrchardCore.Blocks.Fields;
using OrchardCore.ContentManagement.Metadata.Models;
using OrchardCore.ContentTypes.Editors;
using OrchardCore.DisplayManagement.Handlers;
using OrchardCore.DisplayManagement.Views;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Settings
{
    public class BlockFieldSettingsDriver : ContentPartFieldDefinitionDisplayDriver<BlockField>
    {
#if NET10_0_OR_GREATER
        public override IDisplayResult Edit(ContentPartFieldDefinition partFieldDefinition, BuildEditorContext context)
        {
#else
        public override IDisplayResult Edit(ContentPartFieldDefinition partFieldDefinition)
        {
#endif
            return Initialize<BlockFieldSettings>("BlockFieldSettings_Edit", settings =>
            {
                var existing = partFieldDefinition.GetSettings<BlockFieldSettings>();
                settings.LinkableContentTypes = existing.LinkableContentTypes;
                settings.Placeholder = existing.Placeholder;
            }).Location("Content");
        }

        public override async Task<IDisplayResult> UpdateAsync(ContentPartFieldDefinition model, UpdatePartFieldEditorContext context)
        {
            var settings = new BlockFieldSettings();

            if (await context.Updater.TryUpdateModelAsync(settings, Prefix))
            {
                context.Builder.WithSettings(settings);
            }

#if NET10_0_OR_GREATER
            return Edit(model, context);
#else
            return Edit(model);
#endif
        }
    }
}
