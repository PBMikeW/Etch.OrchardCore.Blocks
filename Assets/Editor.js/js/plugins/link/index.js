import './index.css';
import {
    FORMAT_TAGS,
    isSpentWrapper,
    isStyleWrapper,
    splitAround,
    stripPresentation,
    unwrap,
} from '../removeFormat/clearFormatting';

const linkIcon = `<svg width="13" height="14" xmlns="http://www.w3.org/2000/svg">
	<path d="M8.567 13.629c.728.464 1.581.65 2.41.558l-.873.873A3.722 3.722 0 1 1 4.84 9.794L6.694 7.94a3.722 3.722 0 0 1 5.256-.008L10.484 9.4a5.209 5.209 0 0 1-.017.016 1.625 1.625 0 0 0-2.29.009l-1.854 1.854a1.626 1.626 0 0 0 2.244 2.35zm2.766-7.358a3.722 3.722 0 0 0-2.41-.558l.873-.873a3.722 3.722 0 1 1 5.264 5.266l-1.854 1.854a3.722 3.722 0 0 1-5.256.008L9.416 10.5a5.2 5.2 0 0 1 .017-.016 1.625 1.625 0 0 0 2.29-.009l1.854-1.854a1.626 1.626 0 0 0-2.244-2.35z" transform="translate(-3.667 -2.7)" />
</svg>
`;

const unlinkIcon = `<svg width="16" height="18" viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <path transform="rotate(-45 8.358 11.636)" d="M9.14 9.433c.008-.12-.087-.686-.112-.81a1.4 1.4 0 0 0-1.64-1.106l-3.977.772a1.4 1.4 0 0 0 .535 2.749l.935-.162s.019 1.093.592 2.223l-1.098.148A3.65 3.65 0 1 1 2.982 6.08l3.976-.773c1.979-.385 3.838.919 4.28 2.886.51 2.276-1.084 2.816-1.073 2.935.011.12-.394-1.59-1.026-1.696zm3.563-.875l2.105 3.439a3.65 3.65 0 0 1-6.19 3.868L6.47 12.431c-1.068-1.71-.964-2.295-.49-3.07.067-.107 1.16-1.466 1.48-.936-.12.036.9 1.33.789 1.398-.656.41-.28.76.13 1.415l2.145 3.435a1.4 1.4 0 0 0 2.375-1.484l-1.132-1.941c.42-.435 1.237-1.054.935-2.69zm1.88-2.256h3.4a1.125 1.125 0 0 1 0 2.25h-3.4a1.125 1.125 0 0 1 0-2.25zM11.849.038c.62 0 1.125.503 1.125 1.125v3.4a1.125 1.125 0 0 1-2.25 0v-3.4c0-.622.503-1.125 1.125-1.125z"/>
</svg>`;

const ENTER_KEY = 13;

/**
 * Drop the inline wrappers around `node` that are left holding nothing.
 *
 * `range.extractContents()` in surround() splits a wrapper at each end of the
 * selection and leaves the emptied clone behind — linking a bold run from its
 * first letter leaves a `<b></b>` in front of it — and it leaves zero-length
 * text nodes at the boundaries, which then get cloned into shells of their own
 * when a styling wrapper is split around the new link. Both are invisible in
 * the editor and both save, so they are swept from the block here.
 *
 * Same rule the remove-formatting tool applies (isSpentWrapper), so nothing
 * with text, a line break, a link or an image inside it is ever touched.
 */
function dropSpentWrappers(node) {
    const scope = node && node.closest
        ? node.closest('[contenteditable="true"]') || node
        : node;

    if (!scope || !scope.querySelectorAll) {
        return;
    }

    // Zero-length text nodes first: they read as a previous/next sibling and
    // are what turns a split into an empty wrapper in the first place.
    scope.normalize();

    Array.from(scope.querySelectorAll(FORMAT_TAGS.join(','))).forEach(el => {
        if (el.parentNode && isSpentWrapper(el)) {
            unwrap(el);
        }
    });
}

export default class LinkTool {
    static get isInline() {
        return true;
    }

    /**
     * NOT where a link's styling is decided.
     *
     * Editor.js merges every inline tool's `sanitize` config before it saves a
     * block, and the font-size tool's config (../fontSize/index.js) already
     * lists `a: true`, `font: true`, `mark: true` and `span: { class, style }`
     * — so the sanitiser keeps colour, highlight and size both inside an <a>
     * and around it, and would keep them whatever this config said. Measured
     * against these sources: a run styled and then linked saved as
     * `<font ...><mark ...><a href="/about-us">linked words</a></mark></font>`,
     * with the sanitiser passing all of it through untouched.
     *
     * The reset that makes a new link look like a link is therefore done in
     * the DOM, in applyUrl() -> resetStyling(), not here.
     */
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
        // Correcting an existing link: only the href changes. checkState() put
        // the anchor in `this.state` and its href in the box, and there is no
        // placeholder because surround() never ran. This used to return here
        // and do nothing at all — the URL box accepted a new address, Enter
        // closed the toolbar, and the link still pointed at the old one.
        //
        // Nothing else is touched: the styling an editor applied *after* the
        // link was made is theirs, and a reset belongs to creating a link, not
        // to fixing its address.
        if (!this.placeholder) {
            if (this.state) {
                this.state.setAttribute('href', url);
            }

            return;
        }

        const link = document.createElement('a');
        link.href = url;

        // The nodes, not the text. `link.innerHTML = placeholder.innerText`
        // flattened everything inside the selection: bold and italic were
        // thrown away (and their emptied <b></b> / <i></i> shells left behind
        // in the block, where they saved), and a <br> came back as a literal
        // newline, so a line break inside the linked run was lost.
        while (this.placeholder.firstChild) {
            link.appendChild(this.placeholder.firstChild);
        }

        const parent = this.placeholder.parentNode;

        parent.replaceChild(link, this.placeholder);
        this.placeholder = null;

        this.resetStyling(link);

        dropSpentWrappers(link);
    }

    /**
     * A new link starts from the site's own link look.
     *
     * Colour, highlight and size are cleared off the run that has just become
     * a link — both the wrappers inside it and the ones around it — so the
     * editor can see at a glance that the link is there. Owner's call, and the
     * reason for it is the editing that follows: a link that still looks
     * exactly like the styled text it was made from reads as "did that work?",
     * and the answer is to re-select precisely those letters again. Restyling
     * is the easy half — colour, size and highlight all apply to text inside
     * an existing <a> — so the reset costs an editor one click to undo and
     * saves them a fiddly re-selection when it is what they wanted.
     *
     * Bold, italic and line breaks are NOT styling in that sense: they are
     * part of what the author wrote, so they come through the link untouched.
     * See STYLE_TAGS in ../removeFormat/clearFormatting.js for the split.
     *
     * Wrappers *around* the link are split rather than dropped, so text either
     * side of the new link keeps its own styling: linking three words out of a
     * highlighted sentence leaves the rest of the sentence highlighted.
     */
    resetStyling(link) {
        // Inside: unwrap, keeping the children (a <b> inside a <font> stays).
        Array.from(link.querySelectorAll('font, mark, span')).forEach(el => {
            if (el.parentNode && isStyleWrapper(el)) {
                unwrap(el);
            }
        });

        // The <a> itself: keep href / target / rel, drop any colour, face or
        // size it carries (a link made inside remove-formatted markup, or one
        // an editor had already styled and is now re-linking).
        stripPresentation(link);

        // Outside: split each styling wrapper around the link, stepping over
        // an element we keep (a <b> holding nothing but this link) so a colour
        // further out is still split.
        const root = link.closest('[contenteditable="true"]');

        if (!root) {
            return;
        }

        // The boundaries extractContents() left behind are zero-length text
        // nodes, and splitAround() clones a wrapper whenever the link has a
        // sibling — so without this every split leaves an empty shell either
        // side of the new link.
        root.normalize();

        let node = link;

        for (;;) {
            const parent = node.parentNode;

            if (!parent || parent === root) {
                return;
            }

            if (isStyleWrapper(parent)) {
                splitAround(node, parent);
                continue;
            }

            if (parent.childNodes.length === 1) {
                node = parent;
                continue;
            }

            return;
        }
    }

    closeActions() {
        // Cancelling a half-made link puts the text back exactly as it was.
        // This used to rebuild the parent from a string —
        // `parent.innerHTML = parent.innerHTML.replace(outerHTML, innerText)`
        // — which threw away every tag inside the selection on the way past:
        // opening the panel over bold text and clicking away left
        // `<b></b>bold and ital<i></i>`, and it saved that way. Unwrapping the
        // node moves the children out as they are.
        if (this.placeholder) {
            const parent = this.placeholder.parentNode;

            if (parent) {
                unwrap(this.placeholder);
                dropSpentWrappers(parent);
            }

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

        // Unwrap the anchor and keep what is inside it. The same string
        // rebuild as in closeActions() used to run here, so unlinking threw
        // away the colour, size and highlight the editor had applied to the
        // link — work that is not recoverable by retyping the text. Making a
        // link resets styling (see resetStyling); taking one away does not.
        const parent = this.state.parentNode;

        if (parent) {
            unwrap(this.state);
            dropSpentWrappers(parent);
        }

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
