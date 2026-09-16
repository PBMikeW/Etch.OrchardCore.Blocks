using System;

namespace Etch.OrchardCore.Blocks.EditorJS.Parsers.Blocks
{
    /// <summary>
    /// Turns whatever an image block has stored under "mediaPath" back into the raw
    /// asset path that <c>IMediaFileStore.MapPathToPublicUrl</c> expects.
    /// </summary>
    /// <remarks>
    /// MapPathToPublicUrl percent-escapes every segment of the path it is given
    /// (IFileStore.NormalizeAndEscapePath -> Uri.EscapeDataString). A block whose
    /// stored path is already escaped - which is what you get by lifting the path
    /// out of a media library URL rather than taking the media item's own
    /// mediaPath - is therefore escaped a second time: "customer%20change%20mfa.png"
    /// becomes "customer%2520change%2520mfa.png" and the request 404s. The theme's
    /// Block-Image view undoes exactly one level of escaping before it asks for the
    /// media profile URL, so it cannot rescue a value that arrived with two.
    ///
    /// Paths with no escapes are unaffected either way, which is why only filenames
    /// containing a space (or any other character Uri.EscapeDataString touches) ever
    /// broke.
    /// </remarks>
    public static class MediaPathNormalizer
    {
        /// <summary>
        /// Decodes any segment of <paramref name="mediaPath"/> that is the escaped
        /// form of its decoded self, and leaves every other segment alone.
        /// </summary>
        /// <remarks>
        /// The round-trip test is what keeps this safe for raw paths. A segment is
        /// only decoded when re-escaping the decoded text reproduces the stored text
        /// byte for byte, so "customer%20change%20mfa.png" decodes to
        /// "customer change mfa.png" while "customer change mfa.png" and
        /// "50% off.png" are returned untouched.
        ///
        /// The one case it gets wrong is a file whose name genuinely contains the
        /// characters "%20": it is indistinguishable from the escaped form of the
        /// same name with a space, and this treats it as escaped. Media library
        /// uploads do not produce such names.
        /// </remarks>
        public static string Normalize(string mediaPath)
        {
            if (string.IsNullOrEmpty(mediaPath) || mediaPath.IndexOf('%') < 0)
            {
                return mediaPath;
            }

            var segments = mediaPath.Split('/');

            for (var i = 0; i < segments.Length; i++)
            {
                var segment = segments[i];

                if (segment.Length == 0 || segment.IndexOf('%') < 0)
                {
                    continue;
                }

                string decoded;

                try
                {
                    decoded = Uri.UnescapeDataString(segment);
                }
                catch (UriFormatException)
                {
                    continue;
                }

                if (decoded != segment && Uri.EscapeDataString(decoded) == segment)
                {
                    segments[i] = decoded;
                }
            }

            return string.Join("/", segments);
        }
    }
}
