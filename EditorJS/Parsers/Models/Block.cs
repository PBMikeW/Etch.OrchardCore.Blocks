using System.Collections.Generic;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Models
{
    public class Block
    {
        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("data")]
        public IDictionary<string, object> Data { get; set; }

        [JsonPropertyName("tunes")]
        public IDictionary<string, object> Tunes { get; set; }

        public T Get<T>(string property, T defaultValue)
        {
            if (!Has(property))
                return defaultValue;

            var value = Data[property];

            if (value is JsonElement je)
                return je.Deserialize<T>();

            return (T)value;
        }

        public string Get(string property)
        {
            return Has(property) ? Data[property]?.ToString() : string.Empty;
        }

        public bool Has(string property)
        {
            return Data.ContainsKey(property);
        }

        public string GetAnchor()
        {
            if (Tunes == null || !Tunes.ContainsKey("anchorTune"))
            {
                return null;
            }

            var anchorTune = Tunes["anchorTune"];
            if (anchorTune is JsonElement je && je.ValueKind == JsonValueKind.Object
                && je.TryGetProperty("anchor", out var anchor))
            {
                var value = anchor.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }

            return null;
        }
    }
}
