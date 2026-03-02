import { make } from '../utils/dom';
import HEROICONS from './heroicons-data';
import './index.css';

const ALIGNMENTS = [
  {
    value: 'left',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="2" height="10"/><rect x="4" y="2" width="13" height="6" rx="1"/></svg>',
    label: 'Left',
  },
  {
    value: 'center',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="2" width="4" height="6" rx="1"/><rect x="6" y="0" width="5" height="10" rx="1"/><rect x="13" y="2" width="4" height="6" rx="1"/></svg>',
    label: 'Centre',
  },
  {
    value: 'right',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="0" width="2" height="10"/><rect x="0" y="2" width="13" height="6" rx="1"/></svg>',
    label: 'Right',
  },
];

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

export default class KbButton {
  static get toolbox() {
    return {
      title: 'KB Button',
      icon: '<svg width="17" height="14" viewBox="0 0 17 14" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="16" height="13" rx="3" stroke="currentColor" fill="none"/><text x="8.5" y="10" text-anchor="middle" font-size="8" fill="currentColor">btn</text></svg>',
    };
  }

  constructor({ data, api }) {
    this.api = api;

    this.data = {
      url: data.url || '',
      label: data.label || '',
      style: data.style || 'stdbluebutton',
      alignment: data.alignment || 'left',
      iconName: data.iconName || '',
      iconSvg: data.iconSvg || '',
      iconPosition: data.iconPosition || 'left',
      newTab: data.newTab === true,
    };

    this.wrapper = null;
    this.btnEl = null;
    this.labelEl = null;
    this.iconEl = null;
    this.wysiwygArea = null;
    this.popover = null;
    this.iconDropdown = null;
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
    const newTabRow = make('div', 'kb-button-tool__checkbox-row');
    const checkbox = make('input', null, { type: 'checkbox' });
    checkbox.checked = this.data.newTab;
    checkbox.addEventListener('change', (e) => {
      this.data.newTab = e.target.checked;
    });
    const checkLabel = make('label');
    checkLabel.textContent = 'Open in new tab';
    checkLabel.addEventListener('click', () => checkbox.click());
    newTabRow.appendChild(checkbox);
    newTabRow.appendChild(checkLabel);
    this.popover.appendChild(newTabRow);

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
      iconSvg: this.data.iconSvg,
      iconPosition: this.data.iconPosition,
      newTab: this.data.newTab,
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
    if (this.iconDropdown) {
      this.iconDropdown.style.display = 'none';
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

    // Click the button (not the label) → toggle popover
    this.btnEl.addEventListener('click', (e) => {
      // Don't toggle when user is editing the label text
      if (e.target === this.labelEl) return;
      if (this._popoverOpen) {
        this._hidePopover();
      } else {
        this._showPopover();
      }
    });

    // Also show popover when label is focused (so settings are accessible)
    this.labelEl.addEventListener('focus', () => {
      this._showPopover();
    });

    this._updateButtonIcon();
    this._applyAlignment();

    this.wysiwygArea.appendChild(this.btnEl);
  }

  _updateButtonIcon() {
    if (!this.btnEl || !this.iconEl || !this.labelEl) return;

    this.btnEl.innerHTML = '';
    this.iconEl.innerHTML = '';

    const hasIcon = this.data.iconSvg && this.data.iconPosition !== 'none';

    if (hasIcon) {
      this.iconEl.innerHTML = this.data.iconSvg;
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

  // ── Icon picker ─────────────────────────────────

  _createIconPicker() {
    const row = make('div', 'kb-button-tool__field');
    const label = make('label');
    label.textContent = 'Icon';
    row.appendChild(label);

    const pickerWrap = make('div', 'kb-button-tool__icon-picker');

    const searchInput = make('input', 'kb-button-tool__icon-search', {
      type: 'text',
      placeholder: 'Search icons...',
    });
    searchInput.value = this.data.iconName || '';
    pickerWrap.appendChild(searchInput);

    // Position toggle buttons
    const posWrap = make('div', 'kb-button-tool__icon-pos');

    const posLeft = make('button', ['kb-button-tool__icon-pos-btn'], { type: 'button', title: 'Icon left' });
    posLeft.innerHTML = '←';
    const posRight = make('button', ['kb-button-tool__icon-pos-btn'], { type: 'button', title: 'Icon right' });
    posRight.innerHTML = '→';
    const posNone = make('button', ['kb-button-tool__icon-pos-btn'], { type: 'button', title: 'No icon' });
    posNone.innerHTML = '✕';

    const updatePosActive = () => {
      posLeft.classList.toggle('active', this.data.iconPosition === 'left');
      posRight.classList.toggle('active', this.data.iconPosition === 'right');
      posNone.classList.toggle('active', this.data.iconPosition === 'none');
    };
    updatePosActive();

    posLeft.addEventListener('click', () => {
      this.data.iconPosition = 'left';
      updatePosActive();
      this._updateButtonIcon();
    });
    posRight.addEventListener('click', () => {
      this.data.iconPosition = 'right';
      updatePosActive();
      this._updateButtonIcon();
    });
    posNone.addEventListener('click', () => {
      this.data.iconPosition = 'none';
      updatePosActive();
      this._updateButtonIcon();
    });

    posWrap.appendChild(posLeft);
    posWrap.appendChild(posRight);
    posWrap.appendChild(posNone);
    pickerWrap.appendChild(posWrap);

    // Dropdown grid
    this.iconDropdown = make('div', 'kb-button-tool__icon-dropdown');
    this.iconDropdown.style.display = 'none';
    pickerWrap.appendChild(this.iconDropdown);

    searchInput.addEventListener('focus', () => {
      this._populateIconDropdown(searchInput.value);
      this.iconDropdown.style.display = '';
    });

    searchInput.addEventListener('input', () => {
      this._populateIconDropdown(searchInput.value);
      this.iconDropdown.style.display = '';
    });

    // Hide icon dropdown when clicking outside the picker (but stay in popover)
    document.addEventListener('click', (e) => {
      if (!pickerWrap.contains(e.target)) {
        this.iconDropdown.style.display = 'none';
      }
    });

    this._onIconSelect = (icon) => {
      this.data.iconName = icon.name;
      this.data.iconSvg = icon.svg;
      searchInput.value = icon.name;
      this.iconDropdown.style.display = 'none';

      if (this.data.iconPosition === 'none') {
        this.data.iconPosition = 'left';
        updatePosActive();
      }
      this._updateButtonIcon();
    };

    row.appendChild(pickerWrap);
    return row;
  }

  _populateIconDropdown(query) {
    if (!this.iconDropdown) return;
    this.iconDropdown.innerHTML = '';

    const q = (query || '').toLowerCase().trim();
    const filtered = q
      ? HEROICONS.filter(ic => ic.name.includes(q))
      : HEROICONS;

    if (filtered.length === 0) {
      const empty = make('div', 'kb-button-tool__icon-empty');
      empty.textContent = 'No icons found';
      this.iconDropdown.appendChild(empty);
      return;
    }

    filtered.forEach(icon => {
      const cell = make('button', 'kb-button-tool__icon-cell', { type: 'button', title: icon.name });
      cell.innerHTML = icon.svg;
      cell.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this._onIconSelect(icon);
      });
      this.iconDropdown.appendChild(cell);
    });
  }
}
