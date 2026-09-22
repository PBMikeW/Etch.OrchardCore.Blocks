/**
 * Is this path a vector asset?
 *
 * The extension decides it, with any query string dropped first: the editor's
 * preview URL carries a `?width=...` resizer query, which the site strips the
 * same way.
 */
function isSvgPath(source) {
    return (source || '').split('?')[0].toLowerCase().endsWith('.svg');
}

/**
 * Is the media behind an image block a vector?
 *
 * Prefers the media path the site renders from (ImageParser.GetMediaUrl maps
 * that through the media store) and falls back to the asset URL, so this reads
 * the same asset the published page does.
 *
 * Shared so the tool (index.js, which skips the "larger than the original"
 * ceiling for a vector) and the preview (ui.js, which caps a vector at the
 * profile width) can never drift apart on what counts as an SVG.
 */
export function isSvgAsset(blockData) {
    const data = blockData || {};

    return isSvgPath(data.mediaPath || data.baseUrl || data.url || '');
}
