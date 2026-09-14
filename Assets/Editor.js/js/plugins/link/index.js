import './index.css';

const linkIcon = `<svg width="13" height="14" xmlns="http://www.w3.org/2000/svg">
	<path d="M8.567 13.629c.728.464 1.581.65 2.41.558l-.873.873A3.722 3.722 0 1 1 4.84 9.794L6.694 7.94a3.722 3.722 0 0 1 5.256-.008L10.484 9.4a5.209 5.209 0 0 1-.017.016 1.625 1.625 0 0 0-2.29.009l-1.854 1.854a1.626 1.626 0 0 0 2.244 2.35zm2.766-7.358a3.722 3.722 0 0 0-2.41-.558l.873-.873a3.722 3.722 0 1 1 5.264 5.266l-1.854 1.854a3.722 3.722 0 0 1-5.256.008L9.416 10.5a5.2 5.2 0 0 1 .017-.016 1.625 1.625 0 0 0 2.29-.009l1.854-1.854a1.626 1.626 0 0 0-2.244-2.35z" transform="translate(-3.667 -2.7)" />
</svg>
`;

const unlinkIcon = `<svg width="16" height="18" viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <path transform="rotate(-45 8.358 11.636)" d="M9.14 9.433c.008-.12-.087-.686-.112-.81a1.4 1.4 0 0 0-1.64-1.106l-3.977.772a1.4 1.4 0 0 0 .535 2.749l.935-.162s.019 1.093.592 2.223l-1.098.148A3.65 3.65 0 1 1 2.982 6.08l3.976-.773c1.979-.385 3.838.919 4.28 2.886.51 2.276-1.084 2.816-1.073 2.935.011.12-.394-1.59-1.026-1.696zm3.563-.875l2.105 3.439a3.65 3.65 0 0 1-6.19 3.868L6.47 12.431c-1.068-1.71-.964-2.295-.49-3.07.067-.107 1.16-1.466 1.48-.936-.12.036.9 1.33.789 1.398-.656.41-.28.76.13 1.415l2.145 3.435a1.4 1.4 0 0 0 2.375-1.484l-1.132-1.941c.42-.435 1.237-1.054.935-2.69zm1.88-2.256h3.4a1.125 1.125 0 0 1 0 2.25h-3.4a1.125 1.125 0 0 1 0-2.25zM11.849.038c.62 0 1.125.503 1.125 1.125v3.4a1.125 1.125 0 0 1-2.25 0v-3.4c0-.622.503-1.125 1.125-1.125z"/>
</svg>`;

const ENTER_KEY = 13;

export default class LinkTool {
    static get isInline() {
        return true;
    }

    static get sanitize() {
        return {
            a: {
                href: true,
                target: '_blank',
                rel: 'nofollow',
            },
        };
    }

    constructor({ api, config }) {
        this.state = false;

        this.nodes = {
            control: null,
            button: null,
            editor: null,
            input: null,
            list: null,
        };

        this.tag = 'a';
        this.class = 'cdx-link';

        this.api = api;
        this.config = config;
        this.inlineToolbar = api.inlineToolbar;
        this.notifier = api.notifier;
        this.toolbar = api.toolbar;
        this.CSS = {
            button: 'ce-inline-tool',
            buttonActive: 'ce-inline-tool--active',
            buttonModifier: 'ce-inline-tool--link',
            control: 'link-tool-control',
            editor: 'link-tool-editor',
            editorActive: 'link-tool-editor--active',
            input: 'ce-inline-tool-input',
            inputShowed: 'ce-inline-tool-input--showed',
            list: 'link-tool-editor__content-items',
        };
    }

    clear() {
        this.closeActions();
    }

    /**
     * The whole tool — icon button plus URL panel — is ONE element.
     *
     * It used to hand the panel back from `renderActions()`, and Editor.js
     * turns that into a NESTED POPOVER on the tool's inline-toolbar item,
     * opened automatically whenever `checkState()` returns true. That popover
     * (`.ce-popover--nested-level-1`, z-index 4) fills the band directly under
     * the toolbar, which is exactly where `editorjs-text-color-plugin` opens
     * its palette — and the palette's vendored `<xy-popover>` stops click
     * propagation, so Editor.js never got the click that would have closed the
     * nested popover. Measured in headless Chrome against these sources: open
     * the link panel, then the colour picker, and the palette opened UNDER the
     * still-open URL box — 5952 px² of overlap with `input.ce-inline-tool-input`
     * on top, so every swatch click landed in the URL box instead.
     *
     * The nested popover cost the content too. `PopoverInline.handleItemClick`
     * closes an open nested popover by calling
     * `nestedPopoverTriggerItem.handleClick()`, and for an inline tool that *is*
     * its activation — so clicking any other tool re-ran this tool's
     * `surround()` first. With a link half-typed that meant surround() wrapping
     * the selection in a SECOND blue placeholder span and overwriting
     * `this.placeholder`, so the close that followed unwrapped only the new one:
     * traced here, clicking Bold with the URL box open left
     * `<span style="background-color: rgb(168, 214, 255)">sentence</span>`
     * in the block, and it saved that way.
     *
     * Keeping the panel inside our own element means no children, no nested
     * popover, and neither failure — the same shape the font-size tool's
     * stepper uses (see ../fontSize/index.js).
     */
    render() {
        this.nodes.button = document.createElement('button');
        this.nodes.button.type = 'button';
        this.nodes.button.classList.add(this.CSS.button);
        this.nodes.button.innerHTML = linkIcon;

        this.nodes.control = document.createElement('div');
        this.nodes.control.classList.add(this.CSS.control);
        this.nodes.control.appendChild(this.nodes.button);
        this.nodes.control.appendChild(this.renderEditor());

        return this.nodes.control;
    }

    /**
     * The URL box and its results list. Deliberately NOT called
     * `renderActions`: that name is Editor.js's hook for a nested popover, and
     * this tool must not have one (see render()).
     *
     * The built panel is cached on the class and reused. Editor.js rebuilds the
     * inline toolbar on every selection change, and this panel is now in the
     * toolbar's markup from the moment it is built rather than only while a
     * nested popover is open — so a *fresh* <input> would be inserted into the
     * document on every rebuild, each insertion firing `selectionchange`, which
     * schedules the next rebuild, which builds the next input. The font-size
     * stepper measured that as a rebuild every ~200ms that never settles, and
     * the churn tore the colour palette out of the DOM mid-click. One element,
     * moved between toolbars, has none of that.
     */
    renderEditor() {
        if (this.constructor.editorElement) {
            this.nodes.editor = this.constructor.editorElement;
            this.nodes.input = this.nodes.editor.querySelector(`.${this.CSS.input}`);
            this.nodes.list = this.nodes.editor.querySelector(`.${this.CSS.list}`);

            // Rebind: the cached handlers close over the previous tool instance.
            this.bindEditor();

            return this.nodes.editor;
        }

        this.nodes.editor = document.createElement('div');
        this.nodes.editor.classList.add(this.CSS.editor);

        this.nodes.input = document.createElement('input');
        this.nodes.input.placeholder = 'Type link, search by title, or #anchor';
        this.nodes.input.classList.add(this.CSS.input);
        this.nodes.input.classList.add(this.CSS.inputShowed);

        this.nodes.list = document.createElement('ul');
        this.nodes.list.classList.add(this.CSS.list);

        this.nodes.editor.appendChild(this.nodes.input);
        this.nodes.editor.appendChild(this.nodes.list);

        this.bindEditor();

        this.constructor.editorElement = this.nodes.editor;

        return this.nodes.editor;
    }

    /**
     * Point the cached panel's handlers at this instance. Called on every
     * render because the panel outlives the tool instance that built it, and
     * assigned as `on*` properties rather than added as listeners so a rebuild
     * replaces the previous instance's handlers instead of stacking on them.
     */
    bindEditor() {
        this.nodes.input.onkeydown = event => {
            if (event.keyCode === ENTER_KEY) {
                this.enterPressed(event);
            }
        };

        this.nodes.input.onkeyup = event => {
            if (event.keyCode === ENTER_KEY) {
                return;
            }

            this.search(this.nodes.input.value);
        };

        // Editor.js activates a tool when anything inside the tool's element is
        // clicked (Popover.getTargetItem walks the composed path), and
        // activating this one toggles the link off or throws the URL box away.
        // The panel now lives inside that element, so its clicks stop here —
        // the same trick the colour plugin's own picker uses.
        this.nodes.editor.onclick = event => {
            event.stopPropagation();
        };
    }

    /**
     * Suggestions for what has been typed: anchors in the open editors for a
     * leading #, otherwise content items from the site.
     */
    search(value) {
        // When input starts with #, search for anchors in the current article
        if (value.startsWith('#')) {
            const query = value.substring(1).toLowerCase();

            this._displayAnchors(this._findAnchorsInEditors(query));

            return;
        }

        if (value.length > 2) {
            fetch(
                `${this.config.tenantPath}/Blocks/SearchContentItems?type=${this.config.typeName}&part=${this.config.partName}&field=${this.config.fieldName}&query=${value}`
            )
                .then(response => response.json())
                .then(contentItems => this.displayContentItems(contentItems));
        }
    }

    surround(range) {
        if (this.state) {
            this.removeLink();
            this.closeActions();
            this.inlineToolbar.close();
            return;
        }

        if (range) {
            const selectedText = range.extractContents();
            this.placeholder = document.createElement('span');
            this.placeholder.style.backgroundColor = '#a8d6ff';
            this.placeholder.appendChild(selectedText);
            range.insertNode(this.placeholder);
        }

        // A new link starts with an empty box. Emptying it here, on the way
        // in, rather than on close — see the note in closeActions().
        if (!this.inputOpened) {
            this.setInputValue('');
        }

        this.toggleActions();
    }

    /**
     * Put a value in the URL box, but only when it actually changes.
     *
     * The box is permanently part of the inline toolbar's markup now, and a
     * real write to an <input> that is in the document moves its caret, which
     * fires `selectionchange` — the event Editor.js rebuilds the inline
     * toolbar on. Writing the value the box already holds is silent.
     */
    setInputValue(value) {
        if (this.nodes.input.value === value) {
            return;
        }

        this.nodes.input.value = value;
    }

    checkState() {
        const anchorTag = this.api.selection.findParentTag('A');

        if (anchorTag) {
            this.nodes.button.classList.add(this.CSS.buttonActive);
            this.nodes.button.innerHTML = unlinkIcon;
            this.setInputValue(anchorTag.getAttribute('href') || '');
            this.state = anchorTag;
            this.openActions();
        } else {
            this.nodes.button.innerHTML = linkIcon;
            this.nodes.button.classList.remove(this.CSS.buttonActive);
        }
    }

    applyUrl(url) {
        if (!this.placeholder) {
            return;
        }

        let link = document.createElement('a');
        link.innerHTML = this.placeholder.innerText;
        link.href = url;

        this.placeholder.parentNode.replaceChild(link, this.placeholder);

        this.placeholder = null;
    }

    closeActions() {
        if (this.placeholder) {
            this.placeholder.parentNode.innerHTML = this.placeholder.parentNode.innerHTML.replace(
                this.placeholder.outerHTML,
                this.placeholder.innerText
            );
            this.placeholder = null;
        }

        if (this.nodes.editor) {
            this.nodes.editor.classList.remove(this.CSS.editorActive);
            // Drop any horizontal nudge keepEditorOnScreen() applied, so the
            // next toolbar starts from the anchored position.
            this.nodes.editor.style.left = '';
            // The URL box is deliberately left as it is. Emptying an <input>
            // that is in the document fires `selectionchange`, Editor.js
            // rebuilds the inline toolbar on that, and with the caret inside
            // an <a href> checkState() writes the href straight back in —
            // clear, refill, clear. Measured in headless Chrome against these
            // sources: a mousedown on the colour picker with the caret inside
            // an existing link produced 4 selectionchange / 3 rebuilds and
            // tore the palette out of the DOM mid-click, so the colour never
            // landed, and Escape reached a toolbar that had been rebuilt out
            // from under it (0 rebuilds with an empty href). Every open fills
            // the box (checkState() with the href, surround() with ''), so
            // nothing here needs to empty it.
            this.nodes.list.innerHTML = '';
        }

        this.stopWatchingOutside();

        this.inputOpened = false;
    }

    displayContentItems(contentItems) {
        this.nodes.list.innerHTML = '';

        contentItems.forEach(contentItem => {
            let button = document.createElement('button');
            button.innerText = contentItem.displayText;
            button.setAttribute('data-href', contentItem.url);

            let listItem = document.createElement('li');
            listItem.title = contentItem.displayText;
            listItem.appendChild(button);

            button.addEventListener('click', event => {
                this.selectContentItem(event);
            });

            this.nodes.list.appendChild(listItem);
        });
    }

    enterPressed(event) {
        let value = this.nodes.input.value || '';

        if (!value.trim()) {
            event.preventDefault();
            this.closeActions();
            return;
        }

        this.applyUrl(value);

        /**
         * Preventing events that will be able to happen
         */
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.inlineToolbar.close();
    }

    openActions(needFocus) {
        this.nodes.editor.classList.add(this.CSS.editorActive);

        // Measure now for the button-click path, where the toolbar is already
        // laid out, and again next frame for the checkState() path, which opens
        // the panel while the toolbar is still being built and not yet placed.
        this.keepEditorOnScreen();
        requestAnimationFrame(() => {
            if (this.nodes.editor.classList.contains(this.CSS.editorActive)) {
                this.keepEditorOnScreen();
            }
        });

        this.watchOutside();

        if (needFocus) {
            this.nodes.input.focus();
        }

        this.inputOpened = true;
    }

    /**
     * The panel hangs off the tool's own button, and that button can be at the
     * right-hand end of the toolbar: the inline toolbar is `width: max-content`,
     * so nothing pulls a 280px panel back on screen. Measure once it is showing
     * and slide it left by exactly the overshoot.
     */
    keepEditorOnScreen() {
        const margin = 8;

        this.nodes.editor.style.left = '';

        const rect = this.nodes.editor.getBoundingClientRect();

        // Not in the document yet (or hidden): nothing to measure.
        if (!rect.width) {
            return;
        }

        const overshoot = rect.right - (window.innerWidth - margin);

        if (overshoot > 0) {
            // Never past the left edge — a panel wider than the viewport keeps
            // its left end visible rather than losing both.
            this.nodes.editor.style.left = `${-Math.min(overshoot, rect.left - margin)}px`;
        }
    }

    /**
     * Close the panel when the next interaction is somewhere else.
     *
     * Without this the panel stays open over whatever the next tool shows: the
     * colour palette opens into the same band under the toolbar, and both would
     * be on screen at once. Editor.js cannot do it for us — the panel is no
     * longer one of its popovers.
     */
    watchOutside() {
        // One panel on the page means one listener; drop whatever a previous
        // tool instance left registered before adding this instance's.
        this.stopWatchingOutside();

        const handler = event => {
            const path = event.composedPath ? event.composedPath() : [event.target];

            if (this.nodes.control && path.includes(this.nodes.control)) {
                return;
            }

            this.closeActions();
        };

        // Capture phase, and mousedown: the colour plugin's vendored
        // <xy-popover> stops propagation on its own clicks, so a bubbling
        // listener would never hear the palette being opened.
        document.addEventListener('mousedown', handler, true);

        this.constructor.outsideListener = handler;
    }

    stopWatchingOutside() {
        const handler = this.constructor.outsideListener;

        if (!handler) {
            return;
        }

        document.removeEventListener('mousedown', handler, true);

        this.constructor.outsideListener = null;
    }

    removeLink() {
        if (!this.state) {
            return;
        }

        this.state.parentNode.innerHTML = this.state.parentNode.innerHTML.replace(
            this.state.outerHTML,
            this.state.innerText
        );

        this.state = null;
    }

    selectContentItem(event) {
        // The anchor suggestions put <strong>/<small> inside the button, and a
        // click landing on one of those has the attribute on its parent.
        const target = event.target.closest('[data-href]');

        if (!target) {
            return;
        }

        const itemUrl = target.getAttribute('data-href');

        this.applyUrl(itemUrl);
        this.closeActions();
        this.inlineToolbar.close();
    }

    toggleActions() {
        if (!this.inputOpened) {
            this.openActions(true);
        } else {
            this.closeActions(false);
        }
    }

    /**
     * Search all EditorJS instances on the page for blocks with anchor tunes.
     * Returns an array of { anchor, blockType, text } objects matching the query.
     */
    _findAnchorsInEditors(query) {
        const anchors = [];
        const instances = window.__editorJSInstances;
        if (!instances) return anchors;

        Object.keys(instances).forEach(holderId => {
            const entry = instances[holderId];
            if (!entry || !entry.hiddenFieldId) return;

            const hiddenField = document.getElementById(entry.hiddenFieldId);
            if (!hiddenField || !hiddenField.value) return;

            try {
                const data = JSON.parse(hiddenField.value);
                if (!data.blocks) return;

                data.blocks.forEach(block => {
                    const anchorValue = block.tunes?.anchorTune?.anchor;
                    if (!anchorValue) return;

                    if (!query || anchorValue.toLowerCase().includes(query)) {
                        anchors.push({
                            anchor: anchorValue,
                            blockType: block.type,
                            text: block.data?.text
                                ? block.data.text.replace(/<[^>]+>/g, '').substring(0, 50)
                                : block.type,
                        });
                    }
                });
            } catch (e) {
                // Skip invalid JSON
            }
        });

        return anchors;
    }

    /**
     * Display anchor suggestions in the list.
     */
    _displayAnchors(anchors) {
        this.nodes.list.innerHTML = '';

        if (anchors.length === 0) {
            const empty = document.createElement('li');
            empty.classList.add('link-tool-editor__empty');
            empty.textContent = 'No anchors found. Type # to search.';
            this.nodes.list.appendChild(empty);
            return;
        }

        const header = document.createElement('li');
        header.classList.add('link-tool-editor__header');
        header.textContent = 'Anchors in this article';
        this.nodes.list.appendChild(header);

        anchors.forEach(item => {
            const button = document.createElement('button');
            button.innerHTML = `<strong>#${item.anchor}</strong> <small>${item.text}</small>`;
            button.setAttribute('data-href', `#${item.anchor}`);

            const listItem = document.createElement('li');
            listItem.title = `#${item.anchor}`;
            listItem.appendChild(button);

            button.addEventListener('click', event => {
                this.selectContentItem(event);
            });

            this.nodes.list.appendChild(listItem);
        });
    }
}
