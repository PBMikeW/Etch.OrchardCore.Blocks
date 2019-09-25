﻿using Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks;
using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.Parsers;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers
{
    public class BlocksParser : IBlocksParser
    {
        #region Properties

        private IDictionary<string, IBlockParser> _parsers = new Dictionary<string, IBlockParser>
        {
            { "delimiter", new DelimiterBlockParser() },
            { "embed", new EmbedBlockParser() },
            { "header", new HeadingBlockParser() },
            { "image", new ImageParser() },
            { "list", new ListBlockParser() },
            { "paragraph", new ParagraphBlockParser() },
            { "quote", new QuoteBlockParser() },
            { "raw", new RawBlockParser() }
        };

        #endregion

        #region Implementation

        public string ToHtml(string data)
        {
            var html = string.Empty;
            var blocks = JsonConvert.DeserializeObject<EditorBlocks>(data);

            foreach (var block in blocks.Blocks)
            {
                if (!_parsers.ContainsKey(block.Type))
                {
                    continue;
                }

                html += $"{_parsers[block.Type].Render(block)}{Environment.NewLine}{Environment.NewLine}";
            }

            return html;
        }

        #endregion
    }
}
