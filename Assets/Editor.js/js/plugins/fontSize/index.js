
import './index.css';

export default class FontSizeTool {
  
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
      input: null,
    };
    
    this.selectedSpan = null;

    this.config = {
      min: 0.5,
      max: 10.0,
      step: 0.1,
      default: 1.0,
      unit: 'rem'
    };

    this.CSS = {
      button: 'ce-inline-tool',
      buttonActive: 'ce-inline-tool--active',
      actions: 'fontsize-actions',
      actionsActive: 'fontsize-actions--active',
      input: 'fontsize-input',
      btn: 'fontsize-btn',
      span: 'fontsize-tool'
    };
  }

  render() {
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.classList.add(this.CSS.button);

    this.button.innerHTML = `<svg fill="#000000" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M17,12 L17,17 L17.5,17 C17.7761424,17 18,17.2238576 18,17.5 C18,17.7761424 17.7761424,18 17.5,18 L15.5,18 C15.2238576,18 15,17.7761424 15,17.5 C15,17.2238576 15.2238576,17 15.5,17 L16,17 L16,12 L14,12 L14,12.5 C14,12.7761424 13.7761424,13 13.5,13 C13.2238576,13 13,12.7761424 13,12.5 L13,11.5 C13,11.2238576 13.2238576,11 13.5,11 L19.5,11 C19.7761424,11 20,11.2238576 20,11.5 L20,12.5 C20,12.7761424 19.7761424,13 19.5,13 C19.2238576,13 19,12.7761424 19,12.5 L19,12 L17,12 Z M10,6 L10,17 L11.5,17 C11.7761424,17 12,17.2238576 12,17.5 C12,17.7761424 11.7761424,18 11.5,18 L7.5,18 C7.22385763,18 7,17.7761424 7,17.5 C7,17.2238576 7.22385763,17 7.5,17 L9,17 L9,6 L5,6 L5,7.5 C5,7.77614237 4.77614237,8 4.5,8 C4.22385763,8 4,7.77614237 4,7.5 L4,5.5 C4,5.22385763 4.22385763,5 4.5,5 L14.5,5 C14.7761424,5 15,5.22385763 15,5.5 L15,7.5 C15,7.77614237 14.7761424,8 14.5,8 C14.2238576,8 14,7.77614237 14,7.5 L14,6 L10,6 Z"/>
</svg>`

    return this.button;
  }

  renderActions() {
    // Check if we have a cached action panel from a previous instance - Stops potential looping issues
    if (this.constructor.actionsElement) {
      this.nodes.actions = this.constructor.actionsElement;
      this.nodes.input = this.nodes.actions.querySelector(`.${this.CSS.input}`);

      const buttons = this.nodes.actions.querySelectorAll('button');
      buttons[0].onmousedown = (e) => { e.preventDefault(); this.updateFontSize(-1); };
      buttons[1].onmousedown = (e) => { e.preventDefault(); this.updateFontSize(1); };
      buttons[0].onclick = null;
      buttons[1].onclick = null;

      this.nodes.input.onchange = (e) => { this.setFontSize(e.target.value); };

      return this.nodes.actions;
    }

    this.nodes.actions = document.createElement('div');
    this.nodes.actions.classList.add(this.CSS.actions);

    // Decremant Button
    const minus = document.createElement('button');
    minus.classList.add(this.CSS.btn);
    minus.type = 'button';
    minus.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M5 12h14"/></svg>';
    minus.onmousedown = (e) => { e.preventDefault(); this.updateFontSize(-1); };

    // Display Input
    this.nodes.input = document.createElement('input');
    this.nodes.input.classList.add(this.CSS.input);
    this.nodes.input.value = this.config.default;
    this.nodes.input.onchange = (e) => { this.setFontSize(e.target.value); };

    // Increment Button
    const plus = document.createElement('button');
    plus.classList.add(this.CSS.btn);
    plus.type = 'button';
    plus.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4"><path d="M12 5v14M5 12h14"/></svg>';
    plus.onmousedown = (e) => { e.preventDefault(); this.updateFontSize(1); };

    this.nodes.actions.appendChild(minus);
    this.nodes.actions.appendChild(this.nodes.input);
    this.nodes.actions.appendChild(plus);

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
    span.style.fontSize = this.config.default + this.config.unit;
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

  
  findFontSizeSpan() {
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
    const span = this.findFontSizeSpan();
    if (!span) {
      if (this.nodes.input && document.activeElement === this.nodes.input && this.selectedSpan) {
        return true;
      }
    }

    if (span) {
      this.selectedSpan = span;
      this.button.classList.add(this.CSS.buttonActive);
      this.showActions();

      if (this.nodes.input && document.activeElement !== this.nodes.input) {
        const val = parseFloat(span.style.fontSize);
        this.nodes.input.value = !isNaN(val) ? val.toFixed(1) : this.config.default.toFixed(1);
      }
    } else {
      this.selectedSpan = null;
      this.button.classList.remove(this.CSS.buttonActive);
      this.hideActions();
    }

    return !!span;
  }

  setFontSize(value) {
    const span = this.selectedSpan || this.findFontSizeSpan();
    if (!span) return;

    let next = parseFloat(value);

    if (isNaN(next)) {
      const current = parseFloat(span.style.fontSize || this.config.default);
      this.nodes.input.value = current.toFixed(1);
      return;
    }

    this.applyFontSizeValue(span, next);
  }


  updateFontSize(direction) {
    const span = this.selectedSpan || this.findFontSizeSpan();
    if (!span) return;

    let current = parseFloat(this.nodes.input && this.nodes.input.value);

    if (isNaN(current)) {
      current = parseFloat(span.style.fontSize || this.config.default);
    }

    let next = current + (direction * this.config.step);

    this.applyFontSizeValue(span, next);
  }

  applyFontSizeValue(span, value) {
    // Clamp
    if (value < this.config.min) value = this.config.min;
    if (value > this.config.max) value = this.config.max;

    const newValue = value.toFixed(1);
    span.style.fontSize = newValue + this.config.unit;

    if (this.nodes.input) {
      this.nodes.input.value = newValue;
    }
  }
}
