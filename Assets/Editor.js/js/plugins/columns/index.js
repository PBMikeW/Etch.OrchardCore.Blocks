import { make } from '../utils/dom';
import EditorJS from '@editorjs/editorjs';
import './index.css';

export default class ColumnsBlock {
  static get toolbox() {
    return {
      title: 'Columns',
      icon: '<svg width="17" height="14" viewBox="0 0 17 14" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="5" height="14" rx="1" fill="currentColor"/><rect x="6" y="0" width="5" height="14" rx="1" fill="currentColor"/><rect x="12" y="0" width="5" height="14" rx="1" fill="currentColor"/></svg>',
    };
  }

  constructor({ data, config }) {
    this.config = config || {};
    this.tools = config.tools || {};

    this.data = {
      columnCount: data.columnCount || 2,
      columns: data.columns || [],
    };

    this.editors = [];
    this.wrapper = null;
    this.gridEl = null;
  }

  render() {
    this.wrapper = make('div', 'columns-tool');

    const controls = make('div', 'columns-tool__controls');
    const label = make('label');
    label.textContent = 'Columns:';

    const select = make('select');
    for (let i = 2; i <= 8; i++) {
      const option = make('option');
      option.value = i;
      option.textContent = i;
      if (i === this.data.columnCount) option.selected = true;
      select.appendChild(option);
    }

    select.addEventListener('change', (e) => {
      const newCount = parseInt(e.target.value, 10);
      this._setColumnCount(newCount);
    });

    controls.appendChild(label);
    controls.appendChild(select);

    this.gridEl = make('div', 'columns-tool__grid');
    this._buildGrid();

    this.wrapper.appendChild(controls);
    this.wrapper.appendChild(this.gridEl);

    return this.wrapper;
  }

  async save() {
    const columns = [];

    for (const editor of this.editors) {
      try {
        const outputData = await editor.save();
        columns.push({ blocks: outputData.blocks });
      } catch (e) {
        columns.push({ blocks: [] });
      }
    }

    return {
      columnCount: this.data.columnCount,
      columns,
    };
  }

  destroy() {
    this._destroyEditors();
  }

  _setColumnCount(count) {
    // Save current editors data first, then rebuild
    const savePromises = this.editors.map((editor) =>
      editor.save().catch(() => ({ blocks: [] }))
    );

    Promise.all(savePromises).then((savedData) => {
      this.data.columnCount = count;
      this.data.columns = savedData.map((d) => ({ blocks: d.blocks }));
      this._destroyEditors();
      this._buildGrid();
    });
  }

  _buildGrid() {
    this.gridEl.innerHTML = '';
    this.gridEl.style.gridTemplateColumns = `repeat(${this.data.columnCount}, 1fr)`;
    this.editors = [];

    for (let i = 0; i < this.data.columnCount; i++) {
      const colEl = make('div', 'columns-tool__column');
      const colLabel = make('div', 'columns-tool__column-label');
      colLabel.textContent = `Column ${i + 1}`;
      colEl.appendChild(colLabel);

      const editorHolder = make('div', 'columns-tool__editor');
      editorHolder.id = `columns-editor-${Date.now()}-${i}`;
      colEl.appendChild(editorHolder);

      colEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
      });

      colEl.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      this.gridEl.appendChild(colEl);

      const colData = this.data.columns[i] || { blocks: [] };

      const editor = new EditorJS({
        holder: editorHolder.id,
        tools: this.tools,
        data: {
          blocks: colData.blocks || [],
        },
        minHeight: 50,
      });

      this.editors.push(editor);
    }
  }

  _destroyEditors() {
    for (const editor of this.editors) {
      if (editor && typeof editor.destroy === 'function') {
        editor.destroy();
      }
    }
    this.editors = [];
  }
}
