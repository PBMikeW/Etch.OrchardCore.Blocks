using Microsoft.AspNetCore.Http;
using OrchardCore.ContentManagement;
using OrchardCore.DisplayManagement;
using OrchardCore.Liquid;
using OrchardCore.Media;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class BlockParserContext
    {
        public ContentItem ContentItem { get; set; }
        public HttpContext HttpContext { get; set; }
        public ILiquidTemplateManager LiquidTemplateManager { get; set; }
        public IMediaFileStore MediaFileStore { get; set; }
        public IShapeFactory ShapeFactory { get; set; }
        public Func<BlockParserContext, string, Task<IList<dynamic>>> ParseBlocksAsync { get; set; }
    }
}
