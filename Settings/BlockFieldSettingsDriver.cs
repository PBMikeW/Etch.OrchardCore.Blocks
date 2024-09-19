using Etch.OrchardCore.Blocks.Fields;
using OrchardCore.ContentManagement.Metadata.Models;
using OrchardCore.ContentTypes.Editors;
using OrchardCore.DisplayManagement.Views;
using System.Threading.Tasks;
using System.Text.Json.Nodes;
using OrchardCore.ContentFields.Fields;

namespace Etch.OrchardCore.Blocks.Settings
{
    public class BlockFieldSettingsDriver : ContentPartFieldDefinitionDisplayDriver<BlockField>
    {
        public override IDisplayResult Edit(ContentPartFieldDefinition partFieldDefinition)
        {
            return Initialize<BlockFieldSettings>("BlockFieldSettings_Edit", model =>
            {
                var settings = partFieldDefinition.Settings.ToObject<BlockFieldSettings>();
                model.LinkableContentTypes = settings.LinkableContentTypes;
                model.Placeholder = settings.Placeholder;
            }).Location("Content");
        }

        public override async Task<IDisplayResult> UpdateAsync(ContentPartFieldDefinition model, UpdatePartFieldEditorContext context)
        {
            var settings = new BlockFieldSettings();

            if (await context.Updater.TryUpdateModelAsync(settings, Prefix))
            {
                context.Builder.WithSettings(settings);
            }

            return Edit(model);
        }
    }
}
