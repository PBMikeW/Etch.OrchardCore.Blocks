﻿using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Etch.OrchardCore.Blocks.ViewModels;
using OrchardCore.ContentManagement.Display.ContentDisplay;
using OrchardCore.ContentManagement.Display.Models;
using OrchardCore.ContentManagement.Handlers;
using OrchardCore.DisplayManagement.Handlers;
using OrchardCore.DisplayManagement.ModelBinding;
using OrchardCore.DisplayManagement.Views;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.Drivers
{
    public class BlockBodyPartDisplay : ContentPartDisplayDriver<BlockBodyPart>
    {
        #region Dependencies

        private readonly IBlocksParser _blocksParser;

        #endregion

        #region Constructor

        public BlockBodyPartDisplay(IBlocksParser blocksParser)
        {
            _blocksParser = blocksParser;
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
            await context.Updater.TryUpdateModelAsync(part, Prefix, f => f.Data);
            return Edit(part, context);
        }
    }
}
