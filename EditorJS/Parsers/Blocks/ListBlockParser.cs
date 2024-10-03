using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Etch.OrchardCore.Blocks.ViewModels.Blocks;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    public class ListBlockParser : IBlockParser
    {
        public async Task<dynamic> RenderAsync(BlockParserContext context, Block block)
        {
            List<Object> itemList = (List<Object>)block.Data["items"];
            var items = itemList.Select(item => item?.ToString() ?? "").ToArray();
            return await context.ShapeFactory.New.Block__List(
                new ListBlockViewModel
                {
                    ListItems = block.Has("items") ? items : new string[0],
                    Style = block.Get("style")
                }
            );
        }
    }
}
