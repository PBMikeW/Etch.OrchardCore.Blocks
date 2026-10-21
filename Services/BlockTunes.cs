using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Etch.OrchardCore.Blocks.Services
{
    /// <summary>
    /// The anchor and alignment tunes as they may reach a view. The views write them into an
    /// <c>id</c> and a <c>style</c> attribute, and the theme overrides of those views write them
    /// unencoded, so BlocksParser hands a shape only a value that is safe there, for everyone's
    /// content: anything else is dropped (the block renders without an anchor or alignment).
    /// </summary>
    public static class BlockTunes
    {
        private static readonly HashSet<string> Alignments = new(StringComparer.Ordinal) { "left", "center", "right", "justify" };

        // What the editorjs-anchor tune keeps of what the editor types (it strips everything else).
        private static readonly Regex AnchorPattern = new("^[A-Za-z0-9_-]{1,200}$", RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));

        /// <summary>The anchor when it is a plain slug (letters, digits, '-' and '_'), otherwise null.</summary>
        public static string SafeAnchor(string anchor)
            => !string.IsNullOrEmpty(anchor) && AnchorPattern.IsMatch(anchor) ? anchor : null;

        /// <summary>The alignment when it is one the alignment tune offers (left, center, right, justify), otherwise null.</summary>
        public static string SafeAlignment(string alignment)
            => alignment != null && Alignments.Contains(alignment) ? alignment : null;
    }
}
