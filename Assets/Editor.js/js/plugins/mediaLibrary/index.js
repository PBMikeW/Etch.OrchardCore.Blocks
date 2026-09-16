import bootstrap from 'bootstrap';
import $ from 'jquery';

import Ui from './ui';
import './index.css';
import { IconStretch, IconPicture } from '@codexteam/icons';

const selectors = {
  mediaApp: '#mediaApp',
  mediaFieldSelectButton: '.mediaFieldSelectButton',
  modalBody: '.modal-body',
};

export default class MediaLibraryTool {
  static get pasteConfig() {
    return {
      patterns: {
        image: /https?:\/\/\S+\.(gif|jpe?g|tiff|png)$/i,
      },
      tags: ['IMG'],
    };
  }

  static get toolbox() {
    return {
      title: 'Image',
      icon:
        '<svg width="17" height="15" viewBox="0 0 336 276" xmlns="http://www.w3.org/2000/svg"><path d="M291 150V79c0-19-15-34-34-34H79c-19 0-34 15-34 34v42l67-44 81 72 56-29 42 30zm0 52l-43-30-56 30-81-67-66 39v23c0 19 15 34 34 34h178c17 0 31-13 34-29zM79 0h178c44 0 79 35 79 79v118c0 44-35 79-79 79H79c-44 0-79-35-79-79V79C0 35 35 0 79 0z"/></svg>',
    };
  }

  constructor({ data, config, api }) {
    this.api = api;
    this.config = config || {};

        this.data = {
            // The media path is what the published site renders from:
            // ImageParser.GetMediaUrl() maps it through the media store and
            // only falls back to `url` — preview query string and all — when
            // it is missing. It has to survive a re-edit, and this constructor
            // rebuilds `this.data` from scratch, so a block opened and saved
            // again dropped the path and left the site on the fallback.
            mediaPath: data.mediaPath || '',
            url: data.url || '',
            baseUrl: data.baseUrl || data.url,
            caption: data.caption || '',
            stretched: data.stretched !== undefined ? data.stretched : false,
            alignment: data.alignment || 'center',
            profileObject: data.profileObject !== undefined ? data.profileObject : this.profiles[3],
            profile: data.profile !== undefined ? data.profile : this.profiles[3].name,
            linkUrl: data.linkUrl || '',
            linkNewTab: data.linkNewTab || false,
        };

        // Blocks saved before the preview URL was aligned with the site still
        // hold a `?width=N` max-width URL, so refresh the preview from the base
        // URL. Guarded on the saved profile actually being one this plugin
        // offers: only then is `?width=N&height=N&rmode=min` guaranteed to be
        // what the site renders. Legacy blocks that stored the whole profile
        // object are left alone.
        const savedProfile = this.profiles.find(item => item.name === this.data.profile);

        if (savedProfile && this.data.baseUrl) {
            this.data.url = this._previewUrl(this.data.baseUrl, savedProfile);
        }

    this.modalBodyElement = document.getElementById(
      `${config.id}-ModalBody`
    );

    // Natural size of the original asset, used by the profile picker to take
    // no-op profiles out of play. Null means "not known yet" -- before the
    // preview has loaded, and after a probe that failed -- and the picker reads
    // that as: no hint line, every profile selectable.
    this.originalSize = null;

    // The asset the measurement belongs to, or is in flight for. Keyed by URL so
    // an asset is measured at most once, and so a media swap mid-probe cannot
    // land a stale size on the new image.
    this.measuredUrl = '';
    this.previewListenerAttached = false;

    this.ui = new Ui(this.api, () => {
      this._openMediaLibrary();
    });
  }

  appendCallback() {
    this._openMediaLibrary();
  }

  onPaste(event) {
    switch (event.type) {
      case 'pattern':
        const src = event.detail.data;

                this._setMedia({
                    mediaPath: src,
                    url: src,
                });

                break;
            case 'tag':
                const imgTag = event.detail.data;

                this._setMedia({
                    mediaPath: imgTag.src,
                    url: imgTag.src,
                });

                break;
        }
    }

    render() {
        const element = this.ui.render(this.data);

        this._watchPreviewSize();

        return element;
    }

    renderSettings() {
        // -- Link settings section (URL + new tab checkbox) --
        const linkSection = document.createElement('div');
        linkSection.className = 'media-library-link-settings';

        const linkLabel = document.createElement('label');
        linkLabel.className = 'media-library-link-settings__label';
        linkLabel.textContent = 'Link URL';

        const linkInput = document.createElement('input');
        linkInput.className = 'media-library-link-settings__input';
        linkInput.type = 'url';
        linkInput.value = this.data.linkUrl || '';
        linkInput.placeholder = 'https://...';
        linkInput.addEventListener('input', (e) => {
            this.data.linkUrl = e.target.value;
        });
        // Prevent EditorJS from closing settings popover on Enter
        linkInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
        });

        const newTabLabel = document.createElement('label');
        newTabLabel.className = 'media-library-link-settings__checkbox';

        const newTabCheckbox = document.createElement('input');
        newTabCheckbox.type = 'checkbox';
        newTabCheckbox.checked = this.data.linkNewTab || false;
        newTabCheckbox.addEventListener('change', (e) => {
            this.data.linkNewTab = e.target.checked;
        });

        newTabLabel.appendChild(newTabCheckbox);
        newTabLabel.appendChild(document.createTextNode('Open in new tab'));

        linkSection.appendChild(linkLabel);
        linkSection.appendChild(linkInput);
        linkSection.appendChild(newTabLabel);

        // -- Action buttons (alignment, profile, stretch) --
        const alignments = [
            {
                name: 'left',
                icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="2" height="10"/><rect x="4" y="2" width="13" height="6" rx="1"/></svg>',
            },
            {
                name: 'center',
                icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="2" width="4" height="6" rx="1"/><rect x="6" y="0" width="5" height="10" rx="1"/><rect x="13" y="2" width="4" height="6" rx="1"/></svg>',
            },
            {
                name: 'right',
                icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="0" width="2" height="10"/><rect x="0" y="2" width="13" height="6" rx="1"/></svg>',
            },
        ];

        const alignmentActions = alignments.map(align => ({
            icon: align.icon,
            label: `Align ${align.name}`,
            onActivate: () => {
                this.data.alignment = align.name;
                this.ui.applyAlignment(this.data.alignment);
            },
            closeOnActivate: true,
            isActive: this.data.alignment === align.name,
        }));

        // -- Profile picker, capped at the original asset --
        // The site and this preview both resize with rmode=min, and ImageSharp
        // never upscales, so asking for a profile larger than the original's
        // SHORT side hands back the original pixels unchanged: the profile is a
        // no-op. Those profiles are shown but disabled, with the original's size
        // spelled out above the list so the ceiling is not a mystery.
        const ceiling = this.originalSize
            ? Math.min(this.originalSize.width, this.originalSize.height)
            : 0;

        const originalSizeItems = [];

        if (this.originalSize) {
            const originalSizeHint = document.createElement('div');

            originalSizeHint.className = 'media-library-original-size';
            // An entity rather than a literal multiplication sign keeps this
            // source ASCII; both numbers come from the image element, never from
            // anything a user typed.
            originalSizeHint.innerHTML = `Original: ${this.originalSize.width} &times; ${this.originalSize.height} px`;

            originalSizeItems.push({
                type: 'html',
                element: originalSizeHint,
            });
        }

        const profileActions = this.profiles.map(profile => {
            const isTooLarge = ceiling > 0 && profile.previewSize > ceiling;

            const action = {
                icon: profile.icon,
                label: `Profile: ${profile.name}`,
                onActivate: () => this.setProfile(profile),
                closeOnActivate: true,
                // A block already saved above the ceiling still shows as
                // selected: the ceiling guides the next pick, it is not a reason
                // to rewrite what is stored.
                isActive: this.currentProfile.name === profile.name,
                // Editor.js greys the item and Popover.handleItemClick returns
                // early on it, so onActivate can never fire.
                isDisabled: isTooLarge,
            };

            if (isTooLarge) {
                // `name` lands as data-item-name, which index.css keys off to
                // give the item its pointer back so this hint can appear.
                action.name = 'profile-too-large';
                action.hint = { title: 'Larger than the original image' };
            }

            return action;
        });

        const stretchedAction = {
            icon: IconStretch,
            label: 'Stretch image',
            onActivate: () => this._toggleTune('stretched'),
            closeOnActivate: true,
            isActive: this.data.stretched === true,
        };

        return [
            {
                type: 'html',
                element: linkSection,
            },
            { type: 'separator' },
            ...alignmentActions,
            ...originalSizeItems,
            ...profileActions,
            stretchedAction,
        ];
    }

    save() {
        this.data.caption = this.ui.getCaption();
        return this.data;
    }

    /**
     * Opens the Orchard Core media library.
     */
    _openMediaLibrary() {
        const self = this;

        $(selectors.mediaApp)
            .detach()
            .appendTo($(this.modalBodyElement).find(selectors.modalBody));

        $(selectors.mediaApp).show();

        const modal = new bootstrap.Modal($(this.modalBodyElement)[0]);
        modal.show();

        $(this.modalBodyElement)
            .find(selectors.mediaFieldSelectButton)
            .off('click')
            .on('click', async function () {
                if (window.mediaApp.selectedMedias.length) {
                    self._setMedia(window.mediaApp.selectedMedias[0]);
                }

                window.mediaApp.selectedMedias = [];

                modal.hide();
                return true;
            });
    }

    /**
     * Builds the `src` used for the editor preview.
     *
     * The published site renders this block through AssetProfileUrlAsync with
     * resizeMode Min (PropertyBrokersWeb.Theme/Views/Block-Image.cshtml), and
     * every profile this plugin offers is a square NxN media profile, so the
     * site asks the media middleware for `?width=N&height=N&rmode=min`.
     * Requesting the same thing here makes the preview the same pixels the
     * visitor gets; the old `?width=N` was a max-width resize, which produced a
     * noticeably smaller image for anything that is not portrait.
     *
     * Only the query string changes. The block still stores `mediaPath` (the
     * asset), `baseUrl` (the unresized URL) and `profile` (the profile name)
     * exactly as before, so the stored data stays backward compatible with
     * blocks saved by earlier versions. Nothing on the server reads this
     * query: ImageParser renders from `mediaPath` when it is there, and the
     * view (PropertyBrokersWeb.Theme/Views/Block-Image.cshtml) drops the query
     * with Split('?')[0] before asking for the profile URL — the parser itself
     * passes `url` through untouched, so a block that lost its `mediaPath`
     * would reach the view with this preview query still attached.
     */
    _previewUrl(url, profileObject) {
        const baseUrl = (url || '').split('?')[0];
        const previewSize = profileObject ? profileObject.previewSize : undefined;

        if (!baseUrl || !previewSize) {
            return url || '';
        }

        return `${baseUrl}?width=${previewSize}&height=${previewSize}&rmode=min`;
    }

    /**
     * Starts measuring the original asset behind the preview.
     *
     * Called after every render, because the preview <img> may already be
     * complete (cached src, or a re-render with an unchanged URL) and then no
     * load event is coming.
     */
    _watchPreviewSize() {
        const image = this.ui.nodes.image;

        if (!image) {
            return;
        }

        if (!this.previewListenerAttached) {
            this.previewListenerAttached = true;

            // The <img> element is reused for the life of the block, so one
            // listener covers every later profile change or media swap. A load
            // error simply never fires it, which leaves originalSize null.
            image.addEventListener('load', () => this._measureOriginal());
        }

        if (image.complete) {
            this._measureOriginal();
        }
    }

    /**
     * Works out the original asset's natural size.
     *
     * The preview is the cheap route: the media middleware resizes with
     * rmode=min, which lands the short side on the size we asked for and never
     * upscales, so a preview whose short side came back under that size cannot
     * have been resized -- it IS the original, measured for free. Only a preview
     * that really was downscaled costs a second request.
     */
    _measureOriginal() {
        const image = this.ui.nodes.image;
        const assetUrl = (this.data.baseUrl || this.data.url || '').split('?')[0];

        if (!image || !assetUrl || this.measuredUrl === assetUrl) {
            return;
        }

        const naturalWidth = image.naturalWidth;
        const naturalHeight = image.naturalHeight;

        // A broken preview reports 0x0; leave the size unknown and try again on
        // the next render rather than guessing.
        if (!naturalWidth || !naturalHeight) {
            return;
        }

        const requestedSize = this.currentProfile ? this.currentProfile.previewSize : 0;

        // The 1px allowance covers rounding in the resize: min mode aims the
        // short side at the requested size, it does not always hit it exactly.
        if (!requestedSize || Math.min(naturalWidth, naturalHeight) < requestedSize - 1) {
            this.measuredUrl = assetUrl;
            this.originalSize = { width: naturalWidth, height: naturalHeight };

            return;
        }

        this._probeOriginalSize(assetUrl);
    }

    /**
     * Loads the unresized asset off-screen purely to read its natural size.
     *
     * Claims measuredUrl up front so an asset is only ever probed once, and
     * discards a result that arrives after the block moved on to other media.
     */
    _probeOriginalSize(assetUrl) {
        this.measuredUrl = assetUrl;
        this.originalSize = null;

        const probe = new Image();

        probe.addEventListener('load', () => {
            if (this.measuredUrl !== assetUrl) {
                return;
            }

            this.originalSize = {
                width: probe.naturalWidth,
                height: probe.naturalHeight,
            };
        });

        // A failed probe leaves originalSize null, which the picker reads as
        // "unknown": no hint line, every profile selectable.
        probe.addEventListener('error', () => {
            if (this.measuredUrl !== assetUrl) {
                return;
            }

            this.originalSize = null;
        });

        probe.src = assetUrl;
    }

    /**
     * Updates block with selected media item.
     */
    _setMedia(media) {
        const url = this._previewUrl(media.url, this.data.profileObject);

        this.data = {
            caption: '',
            mediaPath: media.mediaPath,
            url: url,
            baseUrl: media.url,
            alignment: this.data.alignment || 'center',
            profileObject: this.data.profileObject,
            profile: this.data.profileObject.name,
            linkUrl: this.data.linkUrl || '',
            linkNewTab: this.data.linkNewTab || false,
        };

        // Different asset, so the measured size no longer describes it.
        this.originalSize = null;
        this.measuredUrl = '';

        this.ui.render(this.data);
        this._watchPreviewSize();
    }

    /**
     * Manually saves editor state to the hidden field.
     * Needed because custom HTML settings inputs are outside the editor
     * content area, so EditorJS's MutationObserver doesn't detect changes.
     */
    _persistToHiddenField() {
        const instance = window.__editorJSInstances?.[this.config.id];
        if (instance?.editor) {
            instance.editor.save().then((outputData) => {
                const hiddenField = document.getElementById(instance.hiddenFieldId);
                if (hiddenField) {
                    hiddenField.value = JSON.stringify(outputData);
                }
            });
        }
    }

    _toggleTune(tune) {
        this.data[tune] = !this.data[tune];

        if (tune === 'stretched') {
            const blockId = this.api.blocks.getCurrentBlockIndex();

            setTimeout(() => {
                this.api.blocks.stretchBlock(blockId, this.data[tune]);
            }, 0);
        }
    }

    get currentProfile() {
        // Blocks saved by an earlier version of this plugin stored the whole
        // profile object under `profile` instead of just its name.
        const profileName = this.data.profile && typeof this.data.profile === 'object'
            ? this.data.profile.name
            : this.data.profile;

        let profile = this.profiles.find(item => item.name === profileName);

        if (!profile) {
            profile = this.profiles[3];
        }

        return profile;
    }

    setProfile(profileObject) {
        const currentUrl = this.data.baseUrl !== undefined ? this.data.baseUrl : this.data.url;
        const url = this._previewUrl(currentUrl, profileObject);

        this.data = {
            ...this.data,
            url: url,
            profile: profileObject.name,
            profileObject: profileObject,
        };

        this.ui.render(this.data);

        // Same asset, so a size already measured stands; this only picks up a
        // measurement that could not be taken from the previous preview.
        this._watchPreviewSize();
    }

    get profiles() {
        return [
            { name: '50x50', icon: IconPicture, previewSize: 50 },
            { name: '75x75', icon: IconPicture, previewSize: 75 },
            { name: '100x100', icon: IconPicture, previewSize: 100 },
            { name: '160x160', icon: IconPicture, previewSize: 160 },
            { name: '240x240', icon: IconPicture, previewSize: 240 },
            { name: '480x480', icon: IconPicture, previewSize: 480 },
            { name: '1024x1024', icon: IconPicture, previewSize: 1024 },
        ];
    }
}
