import './index.css';

/**
 * PaddingTune — Editor.js block tune for vertical padding.
 *
 * Adds padding-top / padding-bottom controls to every block's
 * settings toolbar. Stores the value in block tunes as:
 *   { paddingTune: { paddingTop: "3", paddingBottom: "3" } }
 *
 * Values map to the Bootstrap spacer scale (0-10) used elsewhere
 * in the project. Applies real CSS padding in the editor so the
 * preview matches the published page (WYSIWYG).
 */

export const SPACER_MAP = {
  '0': '0',
  '1': '0.25rem',
  '2': '0.5rem',
  '3': '1rem',
  '4': '1.5rem',
  '5': '3rem',
  '6': '4rem',
  '7': '5rem',
  '8': '6rem',
  '9': '7rem',
  '10': '9rem',
};

const OPTIONS = Object.keys(SPACER_MAP);

export default class PaddingTune {
  static get isTune() {
    return true;
  }

  constructor({ api, data, block }) {
    this.api = api;
    this.block = block;
    this.data = data || {};
    this.paddingTop = this.data.paddingTop || '0';
    this.paddingBottom = this.data.paddingBottom || '0';
    this.paddingLeft = this.data.paddingLeft || '0';
    this.paddingRight = this.data.paddingRight || '0';
  }

  render() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('padding-tune');

    const rows = [
      ['Top', 'paddingTop'],
      ['Bottom', 'paddingBottom'],
      ['Left', 'paddingLeft'],
      ['Right', 'paddingRight'],
    ];

    rows.forEach(([label, key]) => {
      wrapper.appendChild(this._createRow(label, this[key], (val) => {
        this[key] = val;
        this._applyPadding();
      }));
    });

    return wrapper;
  }

  _createRow(label, value, onChange) {
    const row = document.createElement('div');
    row.classList.add('padding-tune__row');

    const labelEl = document.createElement('span');
    labelEl.classList.add('padding-tune__label');
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const select = document.createElement('select');
    select.classList.add('padding-tune__select');

    OPTIONS.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === value) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      onChange(select.value);
    });

    row.appendChild(select);
    return row;
  }

  _applyPadding() {
    if (!this.block?.holder) return;

    const content = this.block.holder.querySelector('.ce-block__content');
    if (content) {
      content.style.paddingTop = SPACER_MAP[this.paddingTop] || '0';
      content.style.paddingBottom = SPACER_MAP[this.paddingBottom] || '0';
      content.style.paddingLeft = SPACER_MAP[this.paddingLeft] || '';
      content.style.paddingRight = SPACER_MAP[this.paddingRight] || '';
    }
  }

  wrap(blockContent) {
    ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'].forEach((key) => {
      if (this[key] && this[key] !== '0') {
        blockContent.style[key] = SPACER_MAP[this[key]] || '0';
      }
    });
    return blockContent;
  }

  save() {
    const zero = (v) => !v || v === '0';
    if (zero(this.paddingTop) && zero(this.paddingBottom) &&
        zero(this.paddingLeft) && zero(this.paddingRight)) {
      return undefined;
    }
    return {
      paddingTop: this.paddingTop,
      paddingBottom: this.paddingBottom,
      paddingLeft: this.paddingLeft,
      paddingRight: this.paddingRight,
    };
  }
}
