using Etch.OrchardCore.Blocks.Fields;
using Etch.OrchardCore.Blocks.Parsers;
using Etch.OrchardCore.Blocks.Services;
using Etch.OrchardCore.Blocks.ViewModels;
using OrchardCore.ContentManagement.Display.ContentDisplay;
using OrchardCore.ContentManagement.Display.Models;
using OrchardCore.ContentManagement.Metadata.Models;
using OrchardCore.DisplayManagement.ModelBinding;
using OrchardCore.DisplayManagement.Views;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Drivers
{
    public class BlockFieldDriver : ContentFieldDisplayDriver<BlockField>
    {
        #region Dependencies

        private readonly IBlocksParser _blocksParser;
        private readonly BlockEditGuard _blockEditGuard;

        #endregion

        #region Constructor

        public BlockFieldDriver(IBlocksParser blocksParser, BlockEditGuard blockEditGuard)
        {
            _blocksParser = blocksParser;
            _blockEditGuard = blockEditGuard;
        }

        #endregion

        public override async Task<IDisplayResult> DisplayAsync(BlockField field, BuildFieldDisplayContext fieldDisplayContext)
        {
            var blocks = await _blocksParser.RenderAsync(field);

            return Initialize<DisplayBlockFieldViewModel>(GetDisplayShapeType(fieldDisplayContext), model =>
            {
                model.Field = field;
                model.Part = fieldDisplayContext.ContentPart;
                model.PartFieldDefinition = fieldDisplayContext.PartFieldDefinition;
                model.Html = field.Html;
                model.Blocks = blocks;
            })
            .Location("Detail", "Content:5");
        }

        public override IDisplayResult Edit(BlockField field, BuildFieldEditorContext context)
        {
            return Initialize<EditBlockFieldViewModel>(GetEditorShapeType(context), model =>
            {
                model.Field = field;
                model.Part = context.ContentPart;
                model.PartFieldDefinition = context.PartFieldDefinition;
                model.Data = field.Data;
            });
        }

        public override async Task<IDisplayResult> UpdateAsync(BlockField field, IUpdateModel updater, UpdateFieldEditorContext context)
        {
            // The field as stored (a new item's is empty): what a save without the raw block
            // permission is judged against.
            var before = field.Data;

            await updater.TryUpdateModelAsync(field, Prefix, f => f.Data);

            var result = await _blockEditGuard.GuardAsync(before, field.Data, context.PartFieldDefinition?.DisplayName() ?? context.PartFieldDefinition?.Name);
            field.Data = result.Data;

            foreach (var error in result.Errors)
            {
                updater.ModelState.AddModelError(Prefix, error);
            }

            return Edit(field, context);
        }
    }
}
