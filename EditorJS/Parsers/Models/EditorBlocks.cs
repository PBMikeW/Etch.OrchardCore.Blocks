using System.Text.Json.Nodes;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Models
{
    public class EditorBlocks
    {
        [JsonPropertyName("time")]
        public long Time { get; set; }

        [JsonPropertyName("version")]
        public string Version { get; set; }

        [JsonPropertyName("blocks")]
        public IList<Block> Blocks { get; set; }
    }
}
