using Etch.OrchardCore.Blocks.EditorJS.Parsers.Models;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>A raw HTML block found in an Editor.js document: its block id (may be empty) and its HTML.</summary>
    public sealed record RawBlock(string Id, string Html);

    /// <summary>
    /// Finds the raw HTML blocks in an Editor.js document (a BlockField's or BlockBodyPart's
    /// <c>Data</c>), and the ones a save adds or changes.
    /// <para>The document is read the way <c>BlocksParser</c> reads it to render the page
    /// (Newtonsoft into <see cref="EditorBlocks"/>, columns re-read the same way), so this sees
    /// every raw block the page would render. It errs wide: a block type or a <c>columns</c> /
    /// <c>blocks</c> key is matched ignoring case, although the renderer matches them exactly.</para>
    /// </summary>
    public static class RawBlocks
    {
        public const string RawType = "raw";

        private const string ColumnsType = "columns";
        private const string ColumnsKey = "columns";
        private const string BlocksKey = "blocks";
        private const string HtmlKey = "html";

        /// <summary>
        /// The raw blocks in <paramref name="data"/>, nested ones (inside columns) included, in
        /// document order. Null or blank data has none. Throws when the data can't be read.
        /// </summary>
        public static IReadOnlyList<RawBlock> Read(string data)
        {
            var found = new List<RawBlock>();

            if (string.IsNullOrWhiteSpace(data))
            {
                return found;
            }

            var document = JsonConvert.DeserializeObject<EditorBlocks>(data);
            Collect(document?.Blocks, found);

            return found;
        }

        /// <summary>
        /// The raw blocks in <paramref name="after"/> that <paramref name="before"/> didn't have.
        /// A raw block is unchanged when <paramref name="before"/> held a raw block with the same id
        /// and the same HTML. A block whose id <paramref name="before"/>'s raw blocks don't have
        /// (content saved before Editor.js gave blocks ids, or a raw block moved into or out of
        /// columns) is unchanged when <paramref name="before"/> held a raw block with the same HTML.
        /// A raw block that was removed is not reported: removing one is always allowed.
        /// <para>Throws when <paramref name="after"/> can't be read. When <paramref name="before"/>
        /// can't be read it is taken to have no raw blocks, so every raw block in
        /// <paramref name="after"/> counts as new.</para>
        /// </summary>
        public static IReadOnlyList<RawBlock> FindNewOrChanged(string before, string after)
        {
            var current = Read(after);
            if (current.Count == 0)
            {
                return current;
            }

            IReadOnlyList<RawBlock> stored;
            try
            {
                stored = Read(before);
            }
            catch (Exception)
            {
                stored = [];
            }

            var storedById = new Dictionary<string, List<string>>(StringComparer.Ordinal);
            foreach (var block in stored.Where(b => !string.IsNullOrEmpty(b.Id)))
            {
                if (!storedById.TryGetValue(block.Id, out var htmls))
                {
                    storedById[block.Id] = htmls = [];
                }

                htmls.Add(block.Html);
            }

            var storedHtml = new HashSet<string>(stored.Select(b => b.Html), StringComparer.Ordinal);

            return current
                .Where(block => !string.IsNullOrEmpty(block.Id) && storedById.TryGetValue(block.Id, out var htmls)
                    ? !htmls.Contains(block.Html, StringComparer.Ordinal)
                    : !storedHtml.Contains(block.Html))
                .ToList();
        }

        private static void Collect(IEnumerable<Block> blocks, List<RawBlock> found)
        {
            if (blocks == null)
            {
                return;
            }

            foreach (var block in blocks)
            {
                if (block == null)
                {
                    continue;
                }

                if (string.Equals(block.Type, RawType, StringComparison.OrdinalIgnoreCase))
                {
                    // What RawBlockParser renders: Block.Get("html"), which is the value's
                    // ToString(), so a non-string value counts by its JSON text.
                    found.Add(new RawBlock(block.Id ?? string.Empty, block.Data != null ? block.Get(HtmlKey) ?? string.Empty : string.Empty));
                }
                else if (string.Equals(block.Type, ColumnsType, StringComparison.OrdinalIgnoreCase) && block.Data != null)
                {
                    foreach (var columns in block.Data.Where(d => string.Equals(d.Key, ColumnsKey, StringComparison.OrdinalIgnoreCase)).Select(d => d.Value).OfType<JArray>())
                    {
                        foreach (var column in columns.OfType<JObject>())
                        {
                            foreach (var nested in column.Properties().Where(p => string.Equals(p.Name, BlocksKey, StringComparison.OrdinalIgnoreCase)).Select(p => p.Value).OfType<JArray>())
                            {
                                // ColumnsBlockParser re-reads each column's blocks as a document of its own.
                                var document = JsonConvert.DeserializeObject<EditorBlocks>(JsonConvert.SerializeObject(new { blocks = nested }));
                                Collect(document?.Blocks, found);
                            }
                        }
                    }
                }
            }
        }
    }
}
