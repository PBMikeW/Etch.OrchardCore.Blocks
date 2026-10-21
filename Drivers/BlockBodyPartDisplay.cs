using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Etch.OrchardCore.Blocks.Services;
using Etch.OrchardCore.Blocks.ViewModels;
using OrchardCore.ContentManagement.Display.ContentDisplay;
using OrchardCore.ContentManagement.Display.Models;

using OrchardCore.DisplayManagement.Views;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Drivers
{
    public class BlockBodyPartDisplay : ContentPartDisplayDriver<BlockBodyPart>
    {
        #region Dependencies

        private readonly IBlocksParser _blocksParser;
        private readonly BlockEditGuard _blockEditGuard;

        #endregion

        #region Constructor

        public BlockBodyPartDisplay(IBlocksParser blocksParser, BlockEditGuard blockEditGuard)
        {
            _blocksParser = blocksParser;
            _blockEditGuard = blockEditGuard;
        }

        #endregion

        public override async Task<IDisplayResult> DisplayAsync(BlockBodyPart part, BuildPartDisplayContext context)
        {
            var blocks = await _blocksParser.RenderAsync(part);

            return Initialize<DisplayBlockBodyPartViewModel>("BlockBodyPart", model =>
            {
                model.Part = part;
                model.TypePartDefinition = context.TypePartDefinition;
                model.Blocks = blocks;
            })
            .Location("Detail", "Content:5");
        }

        public override IDisplayResult Edit(BlockBodyPart part, BuildPartEditorContext context)
        {
            return Initialize<EditBlockBodyPartViewModel>(GetEditorShapeType(context), model =>
            {
                model.Part = part;
                model.TypePartDefinition = context.TypePartDefinition;
                model.Data = part.Data;
            });
        }

        public override async Task<IDisplayResult> UpdateAsync(BlockBodyPart part, UpdatePartEditorContext context)
        {
            // The part as stored (a new item's is empty): what a save without the raw block
            // permission is judged against.
            var before = part.Data;

            await context.Updater.TryUpdateModelAsync(part, Prefix, f => f.Data);

            var result = await _blockEditGuard.GuardAsync(before, part.Data, null);
            part.Data = result.Data;

            foreach (var error in result.Errors)
            {
                context.Updater.ModelState.AddModelError(Prefix, error);
            }

            return Edit(part, context);
        }
    }
}
