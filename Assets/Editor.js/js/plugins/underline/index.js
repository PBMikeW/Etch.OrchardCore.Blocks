import './index.css';

const underlineIcon = `<svg width="14" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 3v7a6 6 0 0 0 12 0V3" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <line x1="5" y1="21" x2="19" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" class="underline-indicator"/>
</svg>`;

export default class Underline {
    static get isInline() {
        return true;
    }

    static get title() {
        return 'Underline';
    }

    static get sanitize() {
        return {
            u: {
                style: true,
            },
        };
    }

    static get shortcut() {
        return 'CMD+U';
    }

    constructor({ api }) {
        this.api = api;
        this.button = null;
        this.tag = 'U';
        this.selectedWrapper = null;

        this.nodes = {
            actions: null,
            picker: null,
            reset: null,
        };

        this.CSS = {
            button: 'ce-inline-tool',
            buttonActive: 'ce-inline-tool--active',
            actions: 'underline-actions',
            actionsActive: 'underline-actions--active',
            picker: 'underline-picker',
            reset: 'underline-reset',
        };
    }

    render() {
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.classList.add(this.CSS.button);
        this.button.innerHTML = underlineIcon;

        return this.button;
    }

    renderActions() {
        if (this.constructor.actionsElement) {
            this.nodes.actions = this.constructor.actionsElement;
            this.nodes.picker = this.nodes.actions.querySelector(`.${this.CSS.picker}`);
            this.nodes.reset = this.nodes.actions.querySelector(`.${this.CSS.reset}`);

            this.nodes.picker.oninput = (e) => { this.applyColor(e.target.value); };
            this.nodes.reset.onclick = () => { this.applyColor(null); };

            return this.nodes.actions;
        }

        this.nodes.actions = document.createElement('div');
        this.nodes.actions.classList.add(this.CSS.actions);

        this.nodes.picker = document.createElement('input');
        this.nodes.picker.type = 'color';
        this.nodes.picker.classList.add(this.CSS.picker);
        this.nodes.picker.title = 'Underline color';
        this.nodes.picker.oninput = (e) => { this.applyColor(e.target.value); };

        this.nodes.reset = document.createElement('button');
        this.nodes.reset.type = 'button';
        this.nodes.reset.classList.add(this.CSS.reset);
        this.nodes.reset.title = 'Match text color';
        this.nodes.reset.textContent = 'Auto';
        this.nodes.reset.onclick = () => { this.applyColor(null); };

        this.nodes.actions.appendChild(this.nodes.picker);
        this.nodes.actions.appendChild(this.nodes.reset);

        this.constructor.actionsElement = this.nodes.actions;

        return this.nodes.actions;
    }

    surround(range) {
        if (!range) {
            return;
        }

        const termWrapper = this.api.selection.findParentTag(this.tag);

        if (termWrapper) {
            this.unwrap(termWrapper);
            this.hideActions();
        } else {
            this.wrap(range);
        }
    }

    wrap(range) {
        const wrapper = document.createElement(this.tag);
        const content = range.extractContents();

        // When the selection is exactly one inline element (e.g. a colour
        // span), nest the underline inside it so the line inherits the text
        // colour; an underline outside the span paints in the parent's colour.
        const soleElement =
            content.childNodes.length === 1 &&
            content.firstChild.nodeType === Node.ELEMENT_NODE
                ? content.firstChild
                : null;

        if (soleElement) {
            while (soleElement.firstChild) {
                wrapper.appendChild(soleElement.firstChild);
            }
            soleElement.appendChild(wrapper);
            range.insertNode(content);
        } else {
            wrapper.appendChild(content);
            range.insertNode(wrapper);
        }

        this.selectedWrapper = wrapper;
        this.api.selection.expandToTag(wrapper);
        this.showActions();
    }

    unwrap(termWrapper) {
        this.api.selection.expandToTag(termWrapper);

        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const unwrappedContent = range.extractContents();

        termWrapper.parentNode.removeChild(termWrapper);

        range.insertNode(unwrappedContent);

        selection.removeAllRanges();
        selection.addRange(range);

        this.selectedWrapper = null;
    }

    checkState() {
        const termWrapper = this.findUnderlineTag();

        if (!termWrapper && this.nodes.picker &&
            document.activeElement === this.nodes.picker && this.selectedWrapper) {
            return true;
        }

        if (termWrapper) {
            this.selectedWrapper = termWrapper;
            this.button.classList.add(this.CSS.buttonActive);
            this.showActions();

            if (this.nodes.picker && document.activeElement !== this.nodes.picker) {
                const current = this.rgbToHex(termWrapper.style.textDecorationColor);
                this.nodes.picker.value = current || '#000000';
            }
        } else {
            this.selectedWrapper = null;
            this.button.classList.remove(this.CSS.buttonActive);
            this.hideActions();
        }

        return !!termWrapper;
    }

    findUnderlineTag() {
        let wrapper = this.api.selection.findParentTag(this.tag);

        if (!wrapper) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                let node = selection.anchorNode;
                while (node && node !== document.body) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === this.tag) {
                        wrapper = node;
                        break;
                    }
                    node = node.parentNode;
                }
            }
        }

        return wrapper;
    }

    applyColor(color) {
        const wrapper = this.selectedWrapper || this.findUnderlineTag();
        if (!wrapper) {
            return;
        }

        if (color) {
            wrapper.style.textDecorationColor = color;
        } else {
            wrapper.style.removeProperty('text-decoration-color');
            if (!wrapper.getAttribute('style')) {
                wrapper.removeAttribute('style');
            }
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
