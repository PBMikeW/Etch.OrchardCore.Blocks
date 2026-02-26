import { make } from '../utils/dom';
import './index.css';

const ALIGNMENTS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Centre' },
  { value: 'right', label: 'Right' },
];

const STYLES = [
  { value: 'stdbluebutton', label: 'Blue' },
  { value: 'stdwhitebutton', label: 'White' },
  { value: 'stdredbutton', label: 'Red' },
  { value: 'stdgreybutton', label: 'Grey' },
  { value: 'stdblueclearbutton', label: 'Blue clear' },
  { value: 'stdclearbutton', label: 'Clear' },
];

export default class KbButton {
  static get toolbox() {
    return {
      title: 'KB Button',
      icon: '<svg width="17" height="14" viewBox="0 0 17 14" xmlns="http://www.w3.org/2000/svg"><rect x="0.5" y="0.5" width="16" height="13" rx="3" stroke="currentColor" fill="none"/><text x="8.5" y="10" text-anchor="middle" font-size="8" fill="currentColor">btn</text></svg>',
    };
  }

  constructor({ data }) {
    this.data = {
      url: data.url || '',
      label: data.label || '',
      style: data.style || 'stdbluebutton',
      alignment: data.alignment || 'left',
    };

    this.wrapper = null;
    this.previewEl = null;
  }

  render() {
    this.wrapper = make('div', 'kb-button-tool');

    const labelField = this._createField('Label', 'text', this.data.label, (val) => {
      this.data.label = val;
      this._updatePreview();
    });

    const urlField = this._createField('URL', 'text', this.data.url, (val) => {
      this.data.url = val;
    });

    const styleField = this._createSelectField('Style', STYLES, this.data.style, (val) => {
      this.data.style = val;
      this._updatePreview();
    });

    const alignField = this._createSelectField('Align', ALIGNMENTS, this.data.alignment, (val) => {
      this.data.alignment = val;
      this._updatePreview();
    });

    this.previewEl = make('div', 'kb-button-tool__preview');
    this._updatePreview();

    this.wrapper.appendChild(labelField);
    this.wrapper.appendChild(urlField);
    this.wrapper.appendChild(styleField);
    this.wrapper.appendChild(alignField);
    this.wrapper.appendChild(this.previewEl);

    return this.wrapper;
  }

  save() {
    return {
      url: this.data.url,
      label: this.data.label,
      style: this.data.style,
      alignment: this.data.alignment,
    };
  }

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

  _createSelectField(labelText, options, value, onChange) {
    const row = make('div', 'kb-button-tool__field');
    const label = make('label');
    label.textContent = labelText;

    const select = make('select');
    options.forEach((opt) => {
      const option = make('option');
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === value) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', (e) => onChange(e.target.value));

    row.appendChild(label);
    row.appendChild(select);
    return row;
  }

  _updatePreview() {
    if (!this.previewEl) return;
    const label = this.data.label || 'Button';
    this.previewEl.style.textAlign = this.data.alignment || 'left';
    this.previewEl.innerHTML = `<a class="${this.data.style}" style="pointer-events:none">${label}</a>`;
  }
}
