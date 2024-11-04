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
      profileObject: data.profile !== undefined ? data.profile : this.profiles[3],
      profile: data.profile !== undefined ? data.profile.name : this.profiles[3].name,
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
    const settings = [
      {
        name: 'stretched',
        icon: IconStretch,
        text: 'Stretch image',
      },
    ];
    let profiles = this.profiles.map(profile => ({
      icon: profile.icon,
      label: this.api.i18n.t(`Profile: ${profile.name.charAt(0).toUpperCase() + profile.name.slice(1)}`),
      onActivate: () => this.setProfile(profile),
      closeOnActivate: true,
      isActive: this.currentProfile.name === profile.name,
    }));

    let settingsActions = settings.map(setting => ({
      icon: setting.icon,
      label: setting.text,
      onActivate: () => this._toggleTune(setting.name),
      closeOnActivate: true,
      isActive: this.data[setting.name] === true,
    }));

    return [...profiles, ...settingsActions];
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
    // Strip any existing query parameters
    let baseUrl = url.split('?')[0];

    // Add new width parameter
    url = baseUrl + '?width=' + this.data.profileObject.previewSize;

    this.data = {
      caption: '',
      mediaPath: media.mediaPath,
      url:url,   
      baseUrl: media.url,
      profileObject: this.data.profile,
      profile: this.data.profile.name
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
    let profile = this.profiles.find(levelItem => levelItem.name === this.data.profileObject.name);

    if (!profile) {
      profile = this.profiles[2];
    }

    return profile;
  }

  setProfile(profileObject) {
    // Strip any existing query parameters
    let currentUrl = this.data.baseUrl !== undefined ? this.data.baseUrl : this.data.url;
    let baseUrl = currentUrl.split('?')[0];

    let url = baseUrl + '?width=' + profileObject.previewSize;

    this.data = {
      ...this.data,
      caption: this.data.caption,
      mediaPath: this.data.mediaPath,
      baseUrl: this.data.baseUrl,
      url: url,
      profile: profileObject.Name,
      profileObject: profileObject
    };
    this.ui.render(this.data);
  }

  get profiles() {
    const availableProfiles = [
      {
        name: 'tiny',
        icon: IconPicture,
        previewSize: 50
      },
      {
        name: 'extrasmall',
        icon: IconPicture,
        previewSize: 100
      },
      {
        name: 'small',
        icon: IconPicture,
        previewSize: 160
      },
      {
        name: 'medium',
        icon: IconPicture,
        previewSize: 240
      },
      {
        name: 'large',
        icon: IconPicture,
        previewSize: 480
      },
      {
        name: 'huge',
        icon: IconPicture,
        previewSize: 1024
      },
    ];
    return availableProfiles;
  }
}
