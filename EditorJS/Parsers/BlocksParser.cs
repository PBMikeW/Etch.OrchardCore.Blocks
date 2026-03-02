using Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.Fields;
using Etch.OrchardCore.Blocks.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using OrchardCore.ContentManagement;
using OrchardCore.DisplayManagement;
using OrchardCore.Liquid;
using OrchardCore.Media;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers
{
    public class BlocksParser : IBlocksParser
    {
        #region Properties

        private readonly IDictionary<string, IBlockParser> _parsers = new Dictionary<string, IBlockParser>
        {
            { "breadcrumb", new BreadcrumbBlockParser() },
            { "columns", new ColumnsBlockParser() },
            { "delimiter", new DelimiterBlockParser() },
            { "embed", new EmbedBlockParser() },
            { "header", new HeadingBlockParser() },
            { "image", new ImageParser() },
            { "kbButton", new KbButtonBlockParser() },
            { "list", new ListBlockParser() },
            { "paragraph", new ParagraphBlockParser() },
            { "quote", new QuoteBlockParser() },
            { "raw", new RawBlockParser() },
            { "table", new TableBlockParser() }
        };

        #endregion

        #region Dependencies

        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ILiquidTemplateManager _liquidTemplateManager;
        private readonly ILogger<BlocksParser> _logger;
        private readonly IMediaFileStore _mediaFileStore;
        private readonly IShapeFactory _shapeFactory;

        #endregion

        #region Constructor

        public BlocksParser(IHttpContextAccessor httpContextAccessor, ILiquidTemplateManager liquidTemplateManager, ILogger<BlocksParser> logger, IMediaFileStore mediaFileStore, IShapeFactory shapeFactory)
        {
            _httpContextAccessor = httpContextAccessor;
            _liquidTemplateManager = liquidTemplateManager;
            _logger = logger;
            _mediaFileStore = mediaFileStore;
            _shapeFactory = shapeFactory;
        }

        #endregion

        #region Implementation

        public async Task<IList<dynamic>> RenderAsync(BlockField field)
        {
            var context = CreateContext(field.ContentItem);
            return await RenderAsync(context, field.Data);
        }

        public async Task<IList<dynamic>> RenderAsync(BlockBodyPart part)
        {
            var context = CreateContext(part.ContentItem);
            return await RenderAsync(context, part.Data);
        }

        public async Task<IList<dynamic>> RenderAsync(string data, ContentItem contentItem)
        {
            var context = CreateContext(contentItem);
            return await RenderAsync(context, data);
        }

        #endregion

        #region Private Methods

        private BlockParserContext CreateContext(ContentItem contentItem)
        {
            var context = new BlockParserContext
            {
                ContentItem = contentItem,
                HttpContext = _httpContextAccessor.HttpContext,
                LiquidTemplateManager = _liquidTemplateManager,
                MediaFileStore = _mediaFileStore,
                ShapeFactory = _shapeFactory
            };

            context.ParseBlocksAsync = RenderAsync;

            return context;
        }

        public async Task<IList<dynamic>> RenderAsync(BlockParserContext context, string data)
        {
            var shapes = new List<dynamic>();
            if (data == null)
            {
                return shapes;
            }
            foreach (var block in JConvert.DeserializeObject<EditorBlocks>(data).Blocks)
            {
                if (!_parsers.ContainsKey(block.Type))
                {
                    continue;
                }

                try
                {
                    var shape = await _parsers[block.Type].RenderAsync(context, block);

                    var anchor = block.GetAnchor();
                    if (!string.IsNullOrEmpty(anchor))
                    {
                        shape.Anchor = anchor;
                    }

                    shapes.Add(shape);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Failed to render {block.Type} block.");
                }
            }

            return shapes;
        }

        #endregion
    }
}
