import { make } from '../utils/dom';
import './index.css';

export default class Breadcrumb {
  static get toolbox() {
    return {
      title: 'Breadcrumb',
      icon: '<svg width="17" height="12" viewBox="0 0 17 12" xmlns="http://www.w3.org/2000/svg"><path d="M0 1h5l2 5-2 5H0l2-5L0 1zm8 0h5l2 5-2 5H8l2-5-2-5z" fill="currentColor"/></svg>',
    };
  }

  constructor({ data }) {
    this.data = {
      mode: data.mode || 'manual',
      items: data.items && data.items.length
        ? data.items.map((item) => ({ label: item.label || '', url: item.url || '' }))
        : [{ label: '', url: '' }],
    };

    this.wrapper = null;
    this.listEl = null;
    this.previewEl = null;
  }

  render() {
    this.wrapper = make('div', 'breadcrumb-tool');

    this.listEl = make('div', 'breadcrumb-tool__items');
    this.data.items.forEach((item, index) => {
      this.listEl.appendChild(this._createItemRow(item, index));
    });

    const addBtn = make('button', 'breadcrumb-tool__add');
    addBtn.type = 'button';
    addBtn.textContent = '+ Add item';
    addBtn.addEventListener('click', () => {
      const newItem = { label: '', url: '' };
      this.data.items.push(newItem);
      this.listEl.appendChild(this._createItemRow(newItem, this.data.items.length - 1));
      this._updatePreview();
    });

    this.previewEl = make('div', 'breadcrumb-tool__preview');
    this._updatePreview();

    this.wrapper.appendChild(this.listEl);
    this.wrapper.appendChild(addBtn);
    this.wrapper.appendChild(this.previewEl);

    return this.wrapper;
  }

  save() {
    return {
      mode: this.data.mode,
      items: this.data.items.filter((item) => item.label || item.url),
    };
  }

  _createItemRow(item, index) {
    const row = make('div', 'breadcrumb-tool__item');

    const labelInput = make('input', null, {
      type: 'text',
      value: item.label,
      placeholder: 'Label',
    });
    labelInput.addEventListener('input', (e) => {
      this.data.items[index].label = e.target.value;
      this._updatePreview();
    });

    const urlInput = make('input', null, {
      type: 'text',
      value: item.url,
      placeholder: 'URL',
    });
    urlInput.addEventListener('input', (e) => {
      this.data.items[index].url = e.target.value;
    });

    const removeBtn = make('button', 'breadcrumb-tool__item-remove');
    removeBtn.type = 'button';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => {
      if (this.data.items.length <= 1) return;
      this.data.items.splice(index, 1);
      this._rebuildList();
      this._updatePreview();
    });

    row.appendChild(labelInput);
    row.appendChild(urlInput);
    row.appendChild(removeBtn);
    return row;
  }

  _rebuildList() {
    this.listEl.innerHTML = '';
    this.data.items.forEach((item, index) => {
      this.listEl.appendChild(this._createItemRow(item, index));
    });
  }

  _updatePreview() {
    if (!this.previewEl) return;
    const labels = this.data.items
      .map((item) => item.label || '...')
      .join(' / ');
    this.previewEl.textContent = labels;
  }
}
