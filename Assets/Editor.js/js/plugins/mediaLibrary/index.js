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
            url: data.url || '',
            baseUrl: data.baseUrl || data.url,
            caption: data.caption || '',
            stretched: data.stretched !== undefined ? data.stretched : false,
            alignment: data.alignment || 'center',
            profileObject: data.profileObject !== undefined ? data.profileObject : this.profiles[3],
            profile: data.profile !== undefined ? data.profile : this.profiles[3].name,
        };

        this.modalBodyElement = document.getElementById(
            `${config.id}-ModalBody`
        );

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
        return this.ui.render(this.data);
    }

    renderSettings() {
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

        const profileActions = this.profiles.map(profile => ({
            icon: profile.icon,
            label: `Profile: ${profile.name}`,
            onActivate: () => this.setProfile(profile),
            closeOnActivate: true,
            isActive: this.currentProfile.name === profile.name,
        }));

        const stretchedAction = {
            icon: IconStretch,
            label: 'Stretch image',
            onActivate: () => this._toggleTune('stretched'),
            closeOnActivate: true,
            isActive: this.data.stretched === true,
        };

        return [...alignmentActions, ...profileActions, stretchedAction];
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
     * Updates block with selected media item.
     */
    _setMedia(media) {
        let url = media.url;
        let baseUrl = url.split('?')[0];

        url = baseUrl + '?width=' + this.data.profileObject.previewSize;

        this.data = {
            caption: '',
            mediaPath: media.mediaPath,
            url: url,
            baseUrl: media.url,
            alignment: this.data.alignment || 'center',
            profileObject: this.data.profileObject,
            profile: this.data.profileObject.name,
        };

        this.ui.render(this.data);
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
        let profile = this.profiles.find(item => item.name === this.data.profile);

        if (!profile) {
            profile = this.profiles[3];
        }

        return profile;
    }

    setProfile(profileObject) {
        let currentUrl = this.data.baseUrl !== undefined ? this.data.baseUrl : this.data.url;
        let baseUrl = currentUrl.split('?')[0];

        let url = baseUrl + '?width=' + profileObject.previewSize;

        this.data = {
            ...this.data,
            url: url,
            profile: profileObject.name,
            profileObject: profileObject,
        };

        this.ui.render(this.data);
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
