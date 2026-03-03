using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System.Collections.Generic;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Models
{
    public class Block
    {
        [JsonProperty("type")]
        public string Type { get; set; }

        [JsonProperty("data")]
        public IDictionary<string, object> Data { get; set; }

        [JsonProperty("tunes")]
        public IDictionary<string, object> Tunes { get; set; }

        public T Get<T>(string property, T defaultValue)
        {
            if (!Has(property))
                return defaultValue;

            var value = Data[property];

            if (value is JToken jt)
                return jt.ToObject<T>();

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
            if (anchorTune is JObject jo && jo.TryGetValue("anchor", out var anchor))
            {
                var value = anchor.ToString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }

            return null;
        }
    }
}
