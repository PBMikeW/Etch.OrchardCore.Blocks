using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>What <see cref="BlockTextSanitizer.Sanitize"/> made of a save.</summary>
    /// <param name="Data">The posted data, or the data with its new and changed blocks sanitised (<paramref name="Changed"/>).</param>
    /// <param name="Changed">Sanitising changed something, so <paramref name="Data"/> is not what was posted.</param>
    /// <param name="Refusals">What sanitising can't fix (an embed from an unsupported source, a new inline SVG icon).</param>
    /// <param name="Unreadable">The posted data can't be read (left to <see cref="RawBlockEditGuard"/>, which refuses it).</param>
    public sealed record BlockSanitizeResult(string Data, bool Changed, IReadOnlyList<BlockRefusal> Refusals, bool Unreadable = false);

    public enum BlockRefusal
    {
        EmbedSource,
        InlineSvgIcon,
    }

    /// <summary>
    /// Sanitises the block content a save adds or changes. The block views write a block's text
    /// properties unencoded (Html.Raw), and the editor's own sanitiser runs in the browser, so a
    /// hand-made save could store any markup in a paragraph. For a save by someone without
    /// ManageRawBlocks, every block that is new or changed has the HTML in its text properties run
    /// through <see cref="BlockHtmlSanitizer"/> (a sanitiser as narrow as the editor's inline
    /// tools): paragraph and heading text, list items, quote text and caption, image
    /// and embed captions, and table cells. An embed may only load one of the supported services
    /// (<see cref="EmbedSources"/>), and a button may only keep the inline SVG icon it already had.
    /// <para>A block is unchanged when the stored content had a block of the same type with the
    /// same data (wherever it was, so a block moved into columns is unchanged): it is left exactly
    /// as it is, whatever it holds, so content written before this keeps saving as it was. Removing
    /// a block is always allowed.</para>
    /// <para>The document is read as BlocksParser reads it to render (Newtonsoft into
    /// <see cref="EditorBlocks"/>, so key names match ignoring case and the last duplicate wins,
    /// columns re-read the same way) and, when something was sanitised, written back from that
    /// reading, so what is stored is what the page renders.</para>
    /// </summary>
    public static class BlockTextSanitizer
    {
        private static readonly JsonSerializerSettings ReadSettings = new() { DateParseHandling = DateParseHandling.None };

        private static readonly JsonSerializerSettings WriteSettings = new() { NullValueHandling = NullValueHandling.Ignore };

        /// <summary>The text properties each block type's parser hands its view to render unencoded.</summary>
        private static readonly Dictionary<string, string[]> TextKeys = new(StringComparer.Ordinal)
        {
            ["paragraph"] = ["text"],
            ["header"] = ["text"],
            ["quote"] = ["text", "caption"],
            ["image"] = ["caption"],
            ["embed"] = ["caption"],
        };

        public static BlockSanitizeResult Sanitize(string before, string after, Func<string, string> sanitizeHtml)
        {
            ArgumentNullException.ThrowIfNull(sanitizeHtml);

            if (string.IsNullOrWhiteSpace(after))
            {
                return new BlockSanitizeResult(after, false, []);
            }

            EditorBlocks document;
            try
            {
                document = JsonConvert.DeserializeObject<EditorBlocks>(after, ReadSettings);
            }
            catch (Exception)
            {
                return new BlockSanitizeResult(after, false, [], Unreadable: true);
            }

            if (document?.Blocks == null)
            {
                return new BlockSanitizeResult(after, false, []);
            }

            var state = new State(Stored(before), sanitizeHtml);
            Process(document.Blocks, state);

            return state.Changed
                ? new BlockSanitizeResult(JsonConvert.SerializeObject(document, WriteSettings), true, state.Refusals.Distinct().ToList())
                : new BlockSanitizeResult(after, false, state.Refusals.Distinct().ToList());
        }

        private sealed class State(StoredBlocks stored, Func<string, string> sanitizeHtml)
        {
            public StoredBlocks Stored { get; } = stored;

            public Func<string, string> SanitizeHtml { get; } = sanitizeHtml;

            public bool Changed { get; set; }

            public List<BlockRefusal> Refusals { get; } = [];
        }

        private sealed class StoredBlocks
        {
            /// <summary>Type + data of every stored block, nested ones included.</summary>
            public HashSet<string> Blocks { get; } = new(StringComparer.Ordinal);

            /// <summary>Every inline SVG icon a stored button had.</summary>
            public HashSet<string> IconSvgs { get; } = new(StringComparer.Ordinal);
        }

        private static StoredBlocks Stored(string before)
        {
            var stored = new StoredBlocks();

            if (string.IsNullOrWhiteSpace(before))
            {
                return stored;
            }

            try
            {
                var document = JsonConvert.DeserializeObject<EditorBlocks>(before, ReadSettings);
                CollectStored(document?.Blocks, stored);
            }
            catch (Exception)
            {
                // Unreadable stored content: nothing counts as unchanged.
            }

            return stored;
        }

        private static void CollectStored(IEnumerable<Block> blocks, StoredBlocks stored)
        {
            foreach (var block in blocks ?? [])
            {
                if (block == null)
                {
                    continue;
                }

                stored.Blocks.Add(Key(block));

                if (block.Data == null)
                {
                    continue;
                }

                if (block.Type == "kbButton" && Text(block, "iconSvg") is { Length: > 0 } svg)
                {
                    stored.IconSvgs.Add(svg);
                }

                foreach (var nested in NestedBlocks(block))
                {
                    CollectStored(nested.Blocks, stored);
                }
            }
        }

        private static string Key(Block block) => block.Type + "\0" + JsonConvert.SerializeObject(block.Data, WriteSettings);

        private static void Process(IList<Block> blocks, State state)
        {
            foreach (var block in blocks)
            {
                if (block?.Data == null || block.Type == null || state.Stored.Blocks.Contains(Key(block)))
                {
                    continue;
                }

                if (TextKeys.TryGetValue(block.Type, out var keys))
                {
                    foreach (var key in keys)
                    {
                        SanitizeValue(block.Data, key, state);
                    }
                }

                switch (block.Type)
                {
                    case "list" when block.Data.TryGetValue("items", out var items) && items is JArray itemArray:
                        SanitizeArray(itemArray, state);
                        break;

                    case "table" when block.Data.TryGetValue("content", out var content) && content is JArray rows:
                        foreach (var row in rows.OfType<JArray>())
                        {
                            SanitizeArray(row, state);
                        }

                        break;

                    case "embed" when !EmbedSources.IsAllowed(Text(block, "service"), Text(block, "embed")):
                        state.Refusals.Add(BlockRefusal.EmbedSource);
                        break;

                    case "kbButton" when Text(block, "iconSvg") is { Length: > 0 } svg && !state.Stored.IconSvgs.Contains(svg):
                        state.Refusals.Add(BlockRefusal.InlineSvgIcon);
                        break;

                    case "columns":
                        foreach (var nested in NestedBlocks(block))
                        {
                            var changedBefore = state.Changed;
                            state.Changed = false;

                            Process(nested.Blocks, state);

                            if (state.Changed)
                            {
                                nested.Column["blocks"] = JArray.FromObject(nested.Blocks, JsonSerializer.Create(WriteSettings));
                            }

                            state.Changed |= changedBefore;
                        }

                        break;
                }
            }
        }

        /// <summary>
        /// A column's blocks, read as ColumnsBlockParser reads them (<c>data.columns[].blocks</c>,
        /// re-read as a document of their own), with the column to write them back to.
        /// </summary>
        private static IEnumerable<(JObject Column, IList<Block> Blocks)> NestedBlocks(Block block)
        {
            if (block.Type != "columns" || !block.Data.TryGetValue("columns", out var columns) || columns is not JArray columnArray)
            {
                yield break;
            }

            foreach (var column in columnArray.OfType<JObject>())
            {
                if (column["blocks"] is JArray nested)
                {
                    var blocks = JsonConvert.DeserializeObject<EditorBlocks>(JsonConvert.SerializeObject(new { blocks = nested }), ReadSettings)?.Blocks;
                    if (blocks != null)
                    {
                        yield return (column, blocks);
                    }
                }
            }
        }

        /// <summary>
        /// Sanitises one text property. A value that isn't a string is what Block.Get renders by
        /// its JSON text, so it is replaced by that text, sanitised.
        /// </summary>
        private static void SanitizeValue(IDictionary<string, object> data, string key, State state)
        {
            if (!data.TryGetValue(key, out var value) || value == null || (value is JValue { Type: JTokenType.Null }))
            {
                return;
            }

            var text = value as string ?? value.ToString();
            var clean = state.SanitizeHtml(text);

            if (value is not string || !string.Equals(clean, text, StringComparison.Ordinal))
            {
                data[key] = clean;
                state.Changed = true;
            }
        }

        private static void SanitizeArray(JArray array, State state)
        {
            for (var i = 0; i < array.Count; i++)
            {
                switch (array[i])
                {
                    case JValue { Type: JTokenType.String } value:
                        var text = (string)value;
                        var clean = state.SanitizeHtml(text);
                        if (!string.Equals(clean, text, StringComparison.Ordinal))
                        {
                            array[i] = clean;
                            state.Changed = true;
                        }

                        break;

                    // A nested list item ({ content, items }) or anything else a parser would
                    // render by its JSON text: keep only the sanitised text.
                    case JObject or JArray:
                        array[i] = state.SanitizeHtml(array[i].ToString(Formatting.None));
                        state.Changed = true;
                        break;
                }
            }
        }

        private static string Text(Block block, string key)
            => block.Data != null && block.Data.TryGetValue(key, out var value) && value != null ? value as string ?? value.ToString() : null;
    }
}
