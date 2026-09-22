import { make } from '../utils/dom';
import { isSvgAsset } from './asset';

/**
 * The media profile name the site renders a stored `profile` with: a mirror of
 * ImageParser.GetProfile (Etch.OrchardCore.Blocks,
 * EditorJS/Parsers/Blocks/ImageParser.cs).
 *
 * An object -- an earlier version of this plugin stored the whole profile --
 * gives its `name` when that is not blank, otherwise "NxN" from a positive
 * whole `previewSize`, otherwise nothing. A string is used as-is. Nothing else
 * (a missing profile included) can come out as an NxN name, so it gives
 * nothing.
 */
function siteProfileName(storedProfile) {
    if (storedProfile && typeof storedProfile === 'object' && !Array.isArray(storedProfile)) {
        const name = storedProfile.name === undefined || storedProfile.name === null
            ? ''
            : String(storedProfile.name);

        if (name.trim()) {
            return name;
        }

        const previewSize = Number(storedProfile.previewSize);

        return Number.isInteger(previewSize) && previewSize > 0
            ? `${previewSize}x${previewSize}`
            : '';
    }

    return typeof storedProfile === 'string' ? storedProfile : '';
}

const buttonIcon = `<svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
    <path d = "M3.15 13.628A7.749 7.749 0 0 0 10 17.75a7.74 7.74 0 0 0 6.305-3.242l-2.387-2.127-2.765 2.244-4.389-4.496-3.614 3.5zm-.787-2.303l4.446-4.371 4.52 4.63 2.534-2.057 3.533 2.797c.23-.734.354-1.514.354-2.324a7.75 7.75 0 1 0-15.387 1.325zM10 20C4.477 20 0 15.523 0 10S4.477 0 10 0s10 4.477 10 10-4.477 10-10 10z" />
</svg >`;

export default class Ui {
    constructor(api, onSelectFile) {
        this.api = api;
        this.onSelectFile = onSelectFile;
        this.nodes = {
            caption: make('div', ['cdx-input', 'media-library-item__caption'], {
                contentEditable: true,
            }),
            fileButton: this.createFileButton(),
            image: make('img', ['media-library-item__image']),
            imageWrapper: make('div', ['media-library-item__image']),
            item: make('div', ['media-library-item']),
            wrapper: make('div', ['cdx-block', 'media-library-tool']),
        };

        this.nodes.caption.dataset.placeholder = 'Caption...';

        this.nodes.imageWrapper.appendChild(this.nodes.image);
        this.nodes.item.appendChild(this.nodes.imageWrapper);
        this.nodes.item.appendChild(this.nodes.caption);
        this.nodes.wrapper.appendChild(this.nodes.item);

        this.nodes.wrapper.appendChild(this.nodes.fileButton);

        this.blockIndex = this.api.blocks.getCurrentBlockIndex() + 1;
    }

    createFileButton() {
        let button = make('div', [
            this.api.styles.button,
            'media-library-tool__select-file',
        ]);

        button.innerHTML = `${buttonIcon} Select an Image`;

        button.addEventListener('click', () => {
            this.onSelectFile();
        });

        return button;
    }

    applyAlignment(alignment) {
        this.nodes.wrapper.classList.remove('align--left', 'align--center', 'align--right');
        if (alignment) {
            this.nodes.wrapper.classList.add(`align--${alignment}`);
        }
    }

    getCaption() {
        return this.nodes.caption.innerHTML;
    }

    /**
     * Width, in px, that the site will cap this block's image at, or 0 for none.
     *
     * A mirror of the server, so it reads the stored `profile` and nothing else:
     * that is the only field the site looks at (profileObject is editor-only).
     * siteProfileName() turns it into a profile name exactly as
     * ImageParser.GetProfile does, and the name then goes through the same
     * ^(\d+)x(\d+)$ match PropertyBrokersWeb.Theme/Views/Block-Image.cshtml
     * applies, taking the width. Anything that does not come out as an NxN name
     * gives the site no number to cap with, so it caps nothing and neither does
     * this: it fails closed exactly like the site.
     */
    profileWidth(toolData) {
        const match = /^(\d+)x(\d+)$/.exec(siteProfileName(toolData.profile));

        return match ? Number(match[1]) : 0;
    }

    /**
     * Caps the preview at the chosen profile's width for an SVG, and clears the
     * cap for everything else.
     *
     * ImageSharp cannot resize a vector, so the `?width=N&height=N&rmode=min` the
     * tool puts on the preview URL is a no-op for an SVG and all seven profiles
     * would look identical here -- while the page shows them at seven different
     * sizes. The site gets there by serving the SVG raw under an inline
     * `max-width:min(<N>px, 100%)` (Block-Image.cshtml), so mirror that cap.
     *
     * The min() keeps the column clamp. An inline max-width replaces the
     * `max-width: 100%` index.css puts on `.media-library-item__image img`, so a
     * bare `<N>px` would let an SVG with a real width attribute (width="1200" on
     * the 1024x1024 profile) overflow a column narrower than N. The theme's
     * inline cap carries the same min() in place of img-fluid's 100%.
     *
     * Everything else clears it: a stretched SVG takes w-100 and no cap on the
     * site, a raster really is resized by the preview URL, and clearing is what
     * stops a stale cap outliving a swap from an SVG to a raster, a stretch, or a
     * profile change. No `height: auto` alongside it -- index.css never gives the
     * preview a fixed height, so it keeps its aspect ratio on its own.
     */
    applySizeCap(toolData) {
        const width = isSvgAsset(toolData) && toolData.stretched !== true
            ? this.profileWidth(toolData)
            : 0;

        this.nodes.image.style.maxWidth = width ? `min(${width}px, 100%)` : '';
    }

    render(toolData) {
        this.nodes.image.src = toolData.url;
        this.nodes.image.onload = () => {
            this.api.blocks.stretchBlock(this.blockIndex, !!toolData.stretched);
        };

        this.applySizeCap(toolData);

        this.nodes.caption.innerHTML = toolData.caption;
        this.applyAlignment(toolData.alignment);

        if (!toolData.url) {
            this.nodes.wrapper.classList.add('is-empty');
        } else {
            this.nodes.wrapper.classList.remove('is-empty');
        }

        return this.nodes.wrapper;
    }
}
