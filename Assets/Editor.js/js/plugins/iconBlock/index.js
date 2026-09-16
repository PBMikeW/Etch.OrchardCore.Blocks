import { make } from '../utils/dom';
import { createHeroiconPicker } from '../utils/heroiconPicker';
import { makeIconSvg } from '../utils/heroiconsIndex';
import { ALIGNMENTS, JUSTIFY } from '../utils/alignmentIcons';
import './index.css';

// A standalone icon: one Heroicon on its own line, optionally linked. Icons
// were only available inside a button before this, so anything decorative (a
// tick beside a list, a phone beside a number) had to be an uploaded image.

// Rendered size. Kept in rem so an icon scales with the page's type scale, and
// duplicated in Views/Block-Icon.cshtml - the editor preview must match what
// the site renders.
const SIZES = [
  { value: 'sm', label: 'Small', css: '1.5rem' },
  { value: 'md', label: 'Medium', css: '2.5rem' },
  { value: 'lg', label: 'Large', css: '4rem' },
];

// The brand palette, the same hexes the text Color tool offers (see
// colorToolConfig.colorCollections in Assets/Editor.js/js/index.js), so an icon
// can be matched to the text beside it. '' inherits the surrounding colour,
// which is what most icons should do.
const COLORS = [
  { value: '', label: 'Text colour' },
  { value: '#002D6A', label: 'Blue' },
  { value: '#EF4123', label: 'Red' },
  { value: '#72808A', label: 'Grey' },
  { value: '#FFCD00', label: 'Yellow' },
  { value: '#FFF', label: 'White' },
  { value: '#000', label: 'Black' },
];

const sizeCss = (value) =>
  (SIZES.find((s) => s.value === value) || SIZES[1]).css;

const swatch = (fill) =>
  `<svg width="17" height="14" viewBox="0 0 17 14"><rect x="0.5" y="0.5" width="16" height="13" rx="3" fill="${fill || 'none'}" stroke="${fill === '#FFF' || !fill ? '#999' : fill}"/></svg>`;

const sizeGlyph = (px) =>
  `<svg width="17" height="14" viewBox="0 0 17 14"><rect x="${(17 - px) / 2}" y="${(14 - px) / 2}" width="${px}" height="${px}" rx="1" fill="currentColor"/></svg>`;

export default class IconBlock {
  static get toolbox() {
    return {
      title: 'Icon',
      icon: '<svg width="17" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.13 4.32 4.77.7c.46.06.64.63.31.95l-3.45 3.36.81 4.75c.08.46-.4.81-.81.59L12 15.92l-4.27 2.25c-.41.22-.89-.13-.81-.59l.81-4.75-3.45-3.36a.56.56 0 0 1 .31-.95l4.77-.7 2.13-4.32Z"/></svg>',
    };
  }

  constructor({ data, config }) {
    // Request.PathBase, so the icon sprite URL is right under a tenant prefix.
    this.tenantPath = (config && config.tenantPath) || '';

    this.data = {
      iconName: data.iconName || '',
      iconStyle: data.iconStyle || 'outline',
      size: data.size || 'md',
      color: data.color || '',
      alignment: data.alignment || 'left',
      linkUrl: data.linkUrl || '',
      linkNewTab: data.linkNewTab === true,
    };

    this.wrapper = null;
    this.previewArea = null;
    this.iconEl = null;
    this.popover = null;
    this.iconPicker = null;
    this._popoverOpen = false;
    this._boundOutsideClick = this._handleOutsideClick.bind(this);
  }

  render() {
    this.wrapper = make('div', 'icon-tool');

    this.previewArea = make('div', 'icon-tool__preview');
    this.iconEl = make('span', 'icon-tool__icon');
    this.previewArea.appendChild(this.iconEl);
    this.wrapper.appendChild(this.previewArea);

    this.popover = make('div', 'icon-tool__popover');
    this.popover.appendChild(this._createIconPicker());
    this.popover.appendChild(
      this._createField('Link URL (optional)', this.data.linkUrl, (value) => {
        this.data.linkUrl = value;
      })
    );
    this.popover.appendChild(
      this._createCheckboxRow('Open in new tab', this.data.linkNewTab, (checked) => {
        this.data.linkNewTab = checked;
      })
    );
    this.wrapper.appendChild(this.popover);

    // Click the block to open its settings, the way the button tool does.
    // Clicks inside the panel itself are excluded so the inputs stay usable.
    this.wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.icon-tool__popover')) return;
      if (this._popoverOpen) {
        this._hidePopover();
      } else {
        this._showPopover();
      }
    });

    this._applyIcon();
    this._applyAlignment();

    return this.wrapper;
  }

  renderSettings() {
    const sizeActions = SIZES.map((size, i) => ({
      icon: sizeGlyph(6 + i * 3),
      label: `${size.label} icon`,
      onActivate: () => {
        this.data.size = size.value;
        this._applyIcon();
      },
      closeOnActivate: true,
      isActive: this.data.size === size.value,
    }));

    const colorActions = COLORS.map((color) => ({
      icon: swatch(color.value),
      label: color.label,
      onActivate: () => {
        this.data.color = color.value;
        this._applyIcon();
      },
      closeOnActivate: true,
      isActive: this.data.color === color.value,
    }));

    const alignActions = ALIGNMENTS.map((alignment) => ({
      icon: alignment.icon,
      label: `Align ${alignment.label.toLowerCase()}`,
      onActivate: () => {
        this.data.alignment = alignment.value;
        this._applyAlignment();
      },
      closeOnActivate: true,
      isActive: this.data.alignment === alignment.value,
    }));

    return [...sizeActions, ...colorActions, ...alignActions];
  }

  save() {
    return {
      iconName: this.data.iconName,
      iconStyle: this.data.iconStyle,
      size: this.data.size,
      color: this.data.color,
      alignment: this.data.alignment,
      linkUrl: this.data.linkUrl,
      linkNewTab: this.data.linkNewTab,
    };
  }

  // Editor.js calls this when the block is removed or the editor is destroyed.
  // The picker keeps a document-level click listener that has to come off too.
  destroy() {
    this._hidePopover();

    if (this.iconPicker) {
      this.iconPicker.destroy();
      this.iconPicker = null;
    }
  }

  // ── Preview ─────────────────────────────────────

  _applyIcon() {
    if (!this.iconEl) return;

    this.iconEl.innerHTML = '';
    this.iconEl.style.color = this.data.color || '';

    if (!this.data.iconName) {
      // Nothing picked yet: say so rather than render an empty box the editor
      // cannot see or click accurately.
      this.iconEl.classList.add('icon-tool__icon--empty');
      this.iconEl.textContent = 'Choose an icon';
      return;
    }

    this.iconEl.classList.remove('icon-tool__icon--empty');

    const svg = makeIconSvg(this.tenantPath, this.data.iconStyle, this.data.iconName);
    const size = sizeCss(this.data.size);
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    this.iconEl.appendChild(svg);
  }

  _applyAlignment() {
    if (!this.previewArea) return;
    this.previewArea.style.justifyContent = JUSTIFY[this.data.alignment] || JUSTIFY.left;
  }

  // ── Popover toggle ──────────────────────────────

  _showPopover() {
    if (this._popoverOpen) return;
    this._popoverOpen = true;
    this.popover.classList.add('icon-tool__popover--open');
    // Defer so the click that opened it does not immediately close it again.
    setTimeout(() => {
      document.addEventListener('click', this._boundOutsideClick, true);
    }, 0);
  }

  _hidePopover() {
    if (!this._popoverOpen) return;
    this._popoverOpen = false;
    this.popover.classList.remove('icon-tool__popover--open');
    document.removeEventListener('click', this._boundOutsideClick, true);

    if (this.iconPicker) {
      this.iconPicker.close();
    }
  }

  _handleOutsideClick(e) {
    if (this.wrapper.contains(e.target)) return;
    this._hidePopover();
  }

  // ── Fields ──────────────────────────────────────

  _createField(labelText, value, onChange) {
    const row = make('div', 'icon-tool__field');
    const label = make('label');
    label.textContent = labelText;

    const input = make('input', null, { type: 'text', value });
    input.addEventListener('input', (e) => onChange(e.target.value));

    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  _createCheckboxRow(labelText, checked, onChange) {
    const row = make('div', 'icon-tool__checkbox-row');
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

  _createIconPicker() {
    const row = make('div', 'icon-tool__field');
    const label = make('label');
    label.textContent = 'Icon';
    row.appendChild(label);

    // Picking is one-way without this: every icon in the grid swaps one icon
    // for another, so an editor who added the block by mistake, or wants the
    // link without the glyph, had no way back to "no icon" short of deleting
    // the block. Handed to the picker as a control so it shares the row with
    // the search box, the way the button tool's position buttons do.
    const clearButton = make('button', 'heroicon-picker__control-btn', {
      type: 'button',
      title: 'No icon',
    });
    clearButton.textContent = '✕';
    clearButton.addEventListener('click', () => {
      if (this.iconPicker) {
        // clear() emits onChange with an empty name, so the preview and the
        // saved data follow the same path as a pick.
        this.iconPicker.clear();
      }
    });

    this.iconPicker = createHeroiconPicker({
      tenantPath: this.tenantPath,
      name: this.data.iconName,
      style: this.data.iconStyle,
      controls: [clearButton],
      onChange: ({ name, style }) => {
        this.data.iconName = name;
        this.data.iconStyle = style;
        this._applyIcon();
      },
    });

    row.appendChild(this.iconPicker.element);
    return row;
  }
}
