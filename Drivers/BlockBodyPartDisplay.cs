using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Etch.OrchardCore.Blocks.Services;
using Etch.OrchardCore.Blocks.ViewModels;
using Microsoft.Extensions.Localization;
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
        private readonly RawBlockEditGuard _rawBlockEditGuard;

        protected readonly IStringLocalizer S;

        #endregion

        #region Constructor

        public BlockBodyPartDisplay(IBlocksParser blocksParser, RawBlockEditGuard rawBlockEditGuard, IStringLocalizer<BlockBodyPartDisplay> localizer)
        {
            _blocksParser = blocksParser;
            _rawBlockEditGuard = rawBlockEditGuard;
            S = localizer;
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

            if (!await _rawBlockEditGuard.CanSaveAsync(before, part.Data))
            {
                context.Updater.ModelState.AddModelError(Prefix, S["Only users with the \"Add or edit raw HTML blocks\" permission can add a raw HTML block or change one. Remove the new or edited raw HTML block, or put its HTML back as it was, and save again. Raw HTML blocks that are already on the page can stay as they are, or be removed."]);
            }

            return Edit(part, context);
        }
    }
}
