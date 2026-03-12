import './index.css';

/**
 * AlignmentTune — Editor.js block tune for text alignment.
 *
 * Adds left / center / right alignment buttons to every block's
 * settings toolbar. Stores the value in block tunes as:
 *   { alignmentTune: { alignment: "left" | "center" | "right" } }
 *
 * Applies `text-align` to the block wrapper in the editor so the
 * preview matches the published page.
 */
export default class AlignmentTune {
  static get isTune() {
    return true;
  }

  constructor({ api, data, block }) {
    this.api = api;
    this.block = block;
    this.data = data || {};
    this.alignment = this.data.alignment || 'left';
  }

  render() {
    const wrapper = document.createElement('div');
    wrapper.classList.add('alignment-tune');

    const alignments = [
      {
        name: 'left',
        icon: '<svg width="16" height="11" viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0.5" x2="16" y2="0.5" stroke="currentColor" stroke-width="1.5"/><line x1="0" y1="4.5" x2="10" y2="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="0" y1="8.5" x2="13" y2="8.5" stroke="currentColor" stroke-width="1.5"/></svg>',
        label: 'Align left',
      },
      {
        name: 'center',
        icon: '<svg width="16" height="11" viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0.5" x2="16" y2="0.5" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="4.5" x2="13" y2="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="1.5" y1="8.5" x2="14.5" y2="8.5" stroke="currentColor" stroke-width="1.5"/></svg>',
        label: 'Align center',
      },
      {
        name: 'right',
        icon: '<svg width="16" height="11" viewBox="0 0 16 11" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0.5" x2="16" y2="0.5" stroke="currentColor" stroke-width="1.5"/><line x1="6" y1="4.5" x2="16" y2="4.5" stroke="currentColor" stroke-width="1.5"/><line x1="3" y1="8.5" x2="16" y2="8.5" stroke="currentColor" stroke-width="1.5"/></svg>',
        label: 'Align right',
      },
    ];

    alignments.forEach((align) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('alignment-tune__btn');
      btn.innerHTML = align.icon;
      btn.title = align.label;

      if (this.alignment === align.name) {
        btn.classList.add('alignment-tune__btn--active');
      }

      btn.addEventListener('click', () => {
        this.alignment = align.name;

        wrapper
          .querySelectorAll('.alignment-tune__btn')
          .forEach((b) => b.classList.remove('alignment-tune__btn--active'));
        btn.classList.add('alignment-tune__btn--active');

        this._applyAlignment();
      });

      wrapper.appendChild(btn);
    });

    return wrapper;
  }

  /**
   * Apply text-align to the block's content holder in the editor.
   */
  _applyAlignment() {
    if (!this.block?.holder) return;

    const content = this.block.holder.querySelector('.ce-block__content');
    if (content) {
      content.style.textAlign = this.alignment;
    }
  }

  /**
   * Called after block is rendered in the editor — apply initial alignment.
   */
  wrap(blockContent) {
    if (this.alignment && this.alignment !== 'left') {
      blockContent.style.textAlign = this.alignment;
    }
    return blockContent;
  }

  save() {
    if (!this.alignment || this.alignment === 'left') {
      return undefined;
    }
    return { alignment: this.alignment };
  }
}
