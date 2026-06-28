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

        public string GetAlignment()
        {
            if (Tunes == null || !Tunes.ContainsKey("alignmentTune"))
            {
                return null;
            }

            var alignmentTune = Tunes["alignmentTune"];
            if (alignmentTune is JObject jo && jo.TryGetValue("alignment", out var alignment))
            {
                var value = alignment.ToString();
                return string.IsNullOrWhiteSpace(value) ? null : value;
            }

            return null;
        }

        public (string PaddingTop, string PaddingBottom) GetPadding()
        {
            if (Tunes == null || !Tunes.ContainsKey("paddingTune"))
            {
                return (null, null);
            }

            var paddingTune = Tunes["paddingTune"];
            if (paddingTune is JObject jo)
            {
                var top = jo.TryGetValue("paddingTop", out var pt) ? pt.ToString() : null;
                var bottom = jo.TryGetValue("paddingBottom", out var pb) ? pb.ToString() : null;

                if (top == "0") top = null;
                if (bottom == "0") bottom = null;

                return (top, bottom);
            }

            return (null, null);
        }
    }
}
