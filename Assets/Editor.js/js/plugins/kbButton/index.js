import { make } from '../utils/dom';
import { createHeroiconPicker } from '../utils/heroiconPicker';
import { makeIconSvg } from '../utils/heroiconsIndex';
import { ALIGNMENTS } from '../utils/alignmentIcons';
import './index.css';

const STYLES = [
  { value: 'stdbluebutton', label: 'Blue' },
  { value: 'stdwhitebutton', label: 'White' },
  { value: 'stdredbutton', label: 'Red' },
  { value: 'stdgreybutton', label: 'Grey' },
  { value: 'stdblueclearbutton', label: 'Blue clear' },
  { value: 'stdclearbutton', label: 'Clear' },
];

const STYLE_ICONS = {
  stdbluebutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="#002D6A" stroke="#002D6A"/></svg>',
  stdwhitebutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="#FFF" stroke="#002D6A"/></svg>',
  stdredbutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="#EF4123" stroke="#EF4123"/></svg>',
  stdgreybutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="#EBEBEB" stroke="#DEDEDE"/></svg>',
  stdblueclearbutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="none" stroke="#002D6A"/></svg>',
  stdclearbutton: '<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="none" stroke="#999"/></svg>',
};

const ICON_POSITIONS = [
  { value: 'left', glyph: '←', title: 'Icon left' },
  { value: 'right', glyph: '→', title: 'Icon right' },
  { value: 'none', glyph: '✕', title: 'No icon' },
];

export default class KbButton {
  static get toolbox() {
    return {
      title: 'Button',
      icon: '<svg width="17" height="14" viewBox="0 0 17 14" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="16" height="13" rx="3" stroke="currentColor" fill="none"/><text x="8.5" y="10" text-anchor="middle" font-size="8" fill="currentColor">btn</text></svg>',
    };
  }

  constructor({ data, api, config }) {
    this.api = api;
    // Request.PathBase, so the icon sprite URL is right under a tenant prefix.
    this.tenantPath = (config && config.tenantPath) || '';

    this.data = {
      url: data.url || '',
      label: data.label || '',
      style: data.style || 'stdbluebutton',
      alignment: data.alignment || 'left',
      iconName: data.iconName || '',
      iconStyle: data.iconStyle || 'outline',
      // Content saved before the sprite existed carries the icon's markup
      // inline. Kept so those buttons keep rendering; cleared as soon as the
      // editor picks a new icon, which stores iconName + iconStyle instead.
      iconSvg: data.iconSvg || '',
      iconPosition: data.iconPosition || 'left',
      newTab: data.newTab === true,
      inline: data.inline === true,
    };

    this.wrapper = null;
    this.btnEl = null;
    this.labelEl = null;
    this.iconEl = null;
    this.wysiwygArea = null;
    this.popover = null;
    this.iconPicker = null;
    this._popoverOpen = false;
    this._boundOutsideClick = this._handleOutsideClick.bind(this);
  }

  render() {
    this.wrapper = make('div', 'kb-button-tool');

    // WYSIWYG button area (always visible)
    this.wysiwygArea = make('div', 'kb-button-tool__wysiwyg');
    this._buildWysiwygButton();
    this.wrapper.appendChild(this.wysiwygArea);

    // Popover (hidden by default)
    this.popover = make('div', 'kb-button-tool__popover');

    // URL field
    const urlField = this._createField('URL', 'text', this.data.url, (val) => {
      this.data.url = val;
    });
    this.popover.appendChild(urlField);

    // Icon picker row
    const iconRow = this._createIconPicker();
    this.popover.appendChild(iconRow);

    // New tab checkbox
    this.popover.appendChild(this._createCheckboxRow('Open in new tab', this.data.newTab, (checked) => {
      this.data.newTab = checked;
    }));

    // Inline checkbox — adjacent inline buttons flow side by side.
    // Spacing between them comes from the block's padding tune (Left/Right).
    this.popover.appendChild(this._createCheckboxRow('Inline (side by side)', this.data.inline, (checked) => {
      this.data.inline = checked;
      this._applyInline();
    }));

    this.wrapper.appendChild(this.popover);

    return this.wrapper;
  }

  renderSettings() {
    const styleActions = STYLES.map(s => ({
      icon: STYLE_ICONS[s.value] || '',
      label: s.label,
      onActivate: () => {
        this.data.style = s.value;
        this._applyStyle();
      },
      closeOnActivate: true,
      isActive: this.data.style === s.value,
    }));

    const alignActions = ALIGNMENTS.map(a => ({
      icon: a.icon,
      label: `Align ${a.label.toLowerCase()}`,
      onActivate: () => {
        this.data.alignment = a.value;
        this._applyAlignment();
      },
      closeOnActivate: true,
      isActive: this.data.alignment === a.value,
    }));

    return [...styleActions, ...alignActions];
  }

  save() {
    if (this.labelEl) {
      this.data.label = this.labelEl.textContent.trim();
    }

    return {
      url: this.data.url,
      label: this.data.label,
      style: this.data.style,
      alignment: this.data.alignment,
      iconName: this.data.iconName,
      iconStyle: this.data.iconStyle,
      iconSvg: this.data.iconSvg,
      iconPosition: this.data.iconPosition,
      newTab: this.data.newTab,
      inline: this.data.inline,
    };
  }

  // ── Popover toggle ──────────────────────────────

  _showPopover() {
    if (this._popoverOpen) return;
    this._popoverOpen = true;
    this.popover.classList.add('kb-button-tool__popover--open');
    // Defer so the current click doesn't immediately close it
    setTimeout(() => {
      document.addEventListener('click', this._boundOutsideClick, true);
    }, 0);
  }

  _hidePopover() {
    if (!this._popoverOpen) return;
    this._popoverOpen = false;
    this.popover.classList.remove('kb-button-tool__popover--open');
    document.removeEventListener('click', this._boundOutsideClick, true);
    // Also hide icon dropdown
    if (this.iconPicker) {
      this.iconPicker.close();
    }
  }

  // Editor.js calls this when the block is removed or the editor is destroyed.
  // The picker keeps a document-level click listener, which has to come off
  // with the block - the old inline picker left one behind per rendered button.
  destroy() {
    // _showPopover registers a second, capture-phase document listener, so a
    // block deleted with its panel open leaked that one even though the
    // picker's came off. _hidePopover is a no-op when the panel is shut.
    this._hidePopover();

    if (this.iconPicker) {
      this.iconPicker.destroy();
      this.iconPicker = null;
    }
  }

  _handleOutsideClick(e) {
    // Keep open if click is inside the popover or the button
    if (this.popover.contains(e.target) || this.btnEl.contains(e.target)) {
      return;
    }
    this._hidePopover();
  }

  // ── WYSIWYG button ──────────────────────────────

  _buildWysiwygButton() {
    this.wysiwygArea.innerHTML = '';

    this.btnEl = make('span', ['kb-button-tool__btn', this.data.style]);

    this.iconEl = make('span', 'kb-button-tool__btn-icon');
    this.labelEl = make('span', 'kb-button-tool__btn-label');
    this.labelEl.contentEditable = 'true';
    this.labelEl.setAttribute('data-placeholder', 'Button text');
    this.labelEl.textContent = this.data.label;

    this.labelEl.addEventListener('input', () => {
      this.data.label = this.labelEl.textContent.trim();
    });

    this.labelEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
      }
    });

    // Click anywhere in the block area → toggle popover.
    // Clicks inside the popover or icon dropdown are excluded so inputs stay usable.
    this.wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.kb-button-tool__popover')) return;
      if (e.target.closest('.heroicon-picker')) return;
      if (this._popoverOpen) {
        this._hidePopover();
      } else {
        this._showPopover();
      }
    });

    this._updateButtonIcon();
    this._applyAlignment();
    this._applyInline();

    this.wysiwygArea.appendChild(this.btnEl);
  }

  _hasIcon() {
    return (
      Boolean(this.data.iconName || this.data.iconSvg) &&
      this.data.iconPosition !== 'none'
    );
  }

  _updateButtonIcon() {
    if (!this.btnEl || !this.iconEl || !this.labelEl) return;

    this.btnEl.innerHTML = '';
    this.iconEl.innerHTML = '';

    const hasIcon = this._hasIcon();

    if (hasIcon) {
      if (this.data.iconName) {
        this.iconEl.appendChild(
          makeIconSvg(this.tenantPath, this.data.iconStyle, this.data.iconName)
        );
      } else {
        // Legacy content: the icon's markup is in the block's own data.
        this.iconEl.innerHTML = this.data.iconSvg;
      }
      this.iconEl.className = 'kb-button-tool__btn-icon';

      if (this.data.iconPosition === 'right') {
        this.iconEl.classList.add('kb-button-tool__btn-icon--right');
        this.btnEl.appendChild(this.labelEl);
        this.btnEl.appendChild(this.iconEl);
      } else {
        this.iconEl.classList.add('kb-button-tool__btn-icon--left');
        this.btnEl.appendChild(this.iconEl);
        this.btnEl.appendChild(this.labelEl);
      }
    } else {
      this.btnEl.appendChild(this.labelEl);
    }
  }

  _applyStyle() {
    if (!this.btnEl) return;
    STYLES.forEach(s => this.btnEl.classList.remove(s.value));
    this.btnEl.classList.add(this.data.style);
  }

  _applyAlignment() {
    if (!this.wysiwygArea) return;
    const map = { left: 'flex-start', center: 'center', right: 'flex-end' };
    this.wysiwygArea.style.justifyContent = map[this.data.alignment] || 'flex-start';
  }

  _applyInline() {
    if (!this.wrapper) return;
    this.wrapper.classList.toggle('kb-button-tool--inline', this.data.inline === true);
  }

  _createCheckboxRow(labelText, checked, onChange) {
    const row = make('div', 'kb-button-tool__checkbox-row');
    const checkbox = make('input', null, { type: 'checkbox' });
    checkbox.checked = checked;
    checkbox.addEventListener('change', (e) => onChange(e.target.checked));
    const label = make('label');
    label.textContent = labelText;
    label.addEventListener('click', () => checkbox.click());
    row.appendChild(checkbox);
    row.appendChild(label);
    return row;
  }

  // ── Fields ──────────────────────────────────────

  _createField(labelText, type, value, onChange) {
    const row = make('div', 'kb-button-tool__field');
    const label = make('label');
    label.textContent = labelText;

    const input = make('input', null, { type, value });
    input.addEventListener('input', (e) => onChange(e.target.value));

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  // ── Icon picker ─────────────────────

  _createIconPicker() {
    const row = make('div', 'kb-button-tool__field');
    const label = make('label');
    label.textContent = 'Icon';
    row.appendChild(label);

    // Where the icon sits relative to the label. Handed to the picker as an
    // extra control so it shares a row with the search box and the
    // outline/solid toggle instead of taking a second line.
    const posWrap = make('div', 'kb-button-tool__icon-pos');

    const updatePosActive = () => {
      posButtons.forEach(({ value, button }) => {
        button.classList.toggle('active', this.data.iconPosition === value);
      });
    };

    const posButtons = ICON_POSITIONS.map((position) => {
      const button = make('button', 'kb-button-tool__icon-pos-btn', {
        type: 'button',
        title: position.title,
      });
      button.textContent = position.glyph;
      button.addEventListener('click', () => {
        this.data.iconPosition = position.value;
        updatePosActive();
        this._updateButtonIcon();
      });
      posWrap.appendChild(button);
      return { value: position.value, button };
    });

    updatePosActive();

    this.iconPicker = createHeroiconPicker({
      tenantPath: this.tenantPath,
      name: this.data.iconName,
      style: this.data.iconStyle,
      controls: [posWrap],
      // A button saved before the sprite existed has markup but no name, so
      // "No icon" would contradict the preview beside it.
      emptyLabel: () => (this.data.iconSvg ? 'Custom icon' : 'No icon'),
      onChange: ({ name, style }) => {
        this.data.iconName = name;
        this.data.iconStyle = style;

        // The sprite supplies the markup now, so inline SVG carried over from
        // older content is stale - drop it rather than render the old icon.
        this.data.iconSvg = '';

        // Picking an icon while the position is "none" means the editor wants
        // to see it; clearing the icon is not a reason to move it.
        if (name && this.data.iconPosition === 'none') {
          this.data.iconPosition = 'left';
          updatePosActive();
        }

        this._updateButtonIcon();
      },
    });

    row.appendChild(this.iconPicker.element);
    return row;
  }
}
