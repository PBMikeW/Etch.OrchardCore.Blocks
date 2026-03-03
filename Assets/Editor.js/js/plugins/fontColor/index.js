
import './index.css';

export default class FontColorTool {

  static get isInline() {
    return true;
  }

  static get sanitize() {
    return {
      span: {
        class: true,
        style: true
      },
      b: true,
      i: true,
      u: true,
      strong: true,
      em: true,
      a: true,
      font: true,
      mark: true
    };
  }

  constructor({ api }) {
    this.api = api;
    this.button = null;
    this.state = false;

    this.nodes = {
      actions: null,
      picker: null,
    };

    this.selectedSpan = null;

    this.config = {
      default: '#000000'
    };

    this.CSS = {
      button: 'ce-inline-tool',
      buttonActive: 'ce-inline-tool--active',
      actions: 'fontcolor-actions',
      actionsActive: 'fontcolor-actions--active',
      picker: 'fontcolor-picker',
      span: 'fontcolor-tool'
    };
  }

  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add(this.CSS.button);

    this.button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M11 2L5.5 16h2.25l1.12-3h6.25l1.13 3h2.25L13 2h-2zm-1.38 9L12 4.67 14.38 11H9.62z" fill="currentColor"/>
  <path d="M3 18h18v4H3z" fill="currentColor" class="fontcolor-indicator"/>
</svg>`;

    return this.button;
  }

  renderActions() {
    // Check if we have a cached action panel from a previous instance
    if (this.constructor.actionsElement) {
      this.nodes.actions = this.constructor.actionsElement;
      this.nodes.picker = this.nodes.actions.querySelector(`.${this.CSS.picker}`);

      this.nodes.picker.oninput = (e) => { this.applyColor(e.target.value); };

      return this.nodes.actions;
    }

    this.nodes.actions = document.createElement('div');
    this.nodes.actions.classList.add(this.CSS.actions);

    // Color picker input
    this.nodes.picker = document.createElement('input');
    this.nodes.picker.type = 'color';
    this.nodes.picker.classList.add(this.CSS.picker);
    this.nodes.picker.value = this.config.default;
    this.nodes.picker.title = 'Font color';
    this.nodes.picker.oninput = (e) => { this.applyColor(e.target.value); };

    this.nodes.actions.appendChild(this.nodes.picker);

    // Cache element to prevent looping issues
    this.constructor.actionsElement = this.nodes.actions;

    return this.nodes.actions;
  }

  surround(range) {
    if (!range) return;

    const termWrapper = this.api.selection.findParentTag('SPAN', this.CSS.span);

    if (termWrapper) {
      this.unwrap(termWrapper);
      this.hideActions();
    } else {
      this.wrap(range);
    }
  }

  showActions() {
    if (this.nodes.actions) {
      this.nodes.actions.classList.add(this.CSS.actionsActive);
    }
  }

  hideActions() {
    if (this.nodes.actions) {
      this.nodes.actions.classList.remove(this.CSS.actionsActive);
    }
  }

  wrap(range) {
    const span = document.createElement('span');
    span.classList.add(this.CSS.span);
    span.style.color = this.nodes.picker ? this.nodes.picker.value : this.config.default;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    this.api.selection.expandToTag(span);
    this.showActions();
  }

  unwrap(termWrapper) {
    this.api.selection.expandToTag(termWrapper);
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    const unwrappedContent = range.extractContents();
    termWrapper.parentNode.removeChild(termWrapper);
    range.insertNode(unwrappedContent);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  findFontColorSpan() {
    let span = this.api.selection.findParentTag('SPAN', this.CSS.span);

    // If not found, walk up the DOM tree manually to find span
    if (!span) {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        let node = selection.anchorNode;
        while (node && node !== document.body) {
          if (node.nodeType === Node.ELEMENT_NODE &&
            node.tagName === 'SPAN' &&
            node.classList.contains(this.CSS.span)) {
            span = node;
            break;
          }
          node = node.parentNode;
        }
      }
    }

    return span;
  }

  checkState() {
    const span = this.findFontColorSpan();
    if (!span) {
      if (this.nodes.picker && document.activeElement === this.nodes.picker && this.selectedSpan) {
        return true;
      }
    }

    if (span) {
      this.selectedSpan = span;
      this.button.classList.add(this.CSS.buttonActive);
      this.showActions();

      if (this.nodes.picker && document.activeElement !== this.nodes.picker) {
        this.nodes.picker.value = this.rgbToHex(span.style.color) || this.config.default;
      }

      // Update the indicator bar colour on the toolbar icon
      this.updateIndicator(this.nodes.picker ? this.nodes.picker.value : this.config.default);
    } else {
      this.selectedSpan = null;
      this.button.classList.remove(this.CSS.buttonActive);
      this.hideActions();
    }

    return !!span;
  }

  applyColor(color) {
    const span = this.selectedSpan || this.findFontColorSpan();
    if (!span) return;

    span.style.color = color;
    this.updateIndicator(color);
  }

  updateIndicator(color) {
    if (!this.button) return;
    const indicator = this.button.querySelector('.fontcolor-indicator');
    if (indicator) {
      indicator.setAttribute('fill', color);
    }
  }

  /**
   * Convert an rgb(r, g, b) string to a hex color value.
   */
  rgbToHex(rgb) {
    if (!rgb) return null;
    if (rgb.startsWith('#')) return rgb;

    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return null;

    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);

    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
}
