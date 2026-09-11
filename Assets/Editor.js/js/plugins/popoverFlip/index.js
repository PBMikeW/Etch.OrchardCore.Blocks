/**
 * Flip the block-toolbar popovers upward when they would run off the bottom of
 * the viewport.
 *
 * Editor.js already has a direction decision, but it does not work for us.
 * `Popover.shouldOpenBottom` compares the room above the popover against the
 * editor's own *scope element* (`.codex-editor__redactor`), not against the
 * viewport:
 *
 *   const r = container.getBoundingClientRect(), s = scope.getBoundingClientRect();
 *   return (r.top - size.height) < s.top || (r.top + size.height) <= Math.min(window.innerHeight, s.bottom);
 *
 * Every ContentBlock widget is its own small editor, so the scope element is
 * only one or two blocks tall. `r.top - height < s.top` is therefore always
 * true — there is never "room above" inside a short editor — and the popover
 * always opens downward, straight off the bottom of the screen when the widget
 * sits low on a long admin page.
 *
 * The height it measures is wrong here too: `Popover.size` clones the popover
 * and appends the clone to `document.body`, outside any `.flow-grid
 * .widget-editor` ancestor, so a `--max-height` override scoped to the editor
 * is invisible to the measurement. That is why the taller-popover override
 * lives at global scope in ../../css/index.scss. Open-top positioning is then
 * pure CSS off the height that clone reported:
 *
 *   .ce-popover--open-top .ce-popover__container {
 *     --popover-top: calc(-1 * (var(--offset-from-target) + var(--popover-height)));
 *   }
 *
 * so any disagreement between the clone and the box on screen puts a flipped
 * popover in the wrong place. With the global rule in place the two agree
 * today (both 428px on a paragraph at 1366x600), but the clone is measured
 * outside the editor's own ancestors, so the two can diverge again the moment
 * anything scoped affects the popover. We therefore re-state
 * `--popover-height` from the container we are about to move.
 *
 * This is a post-open correction rather than a patch of Editor.js because the
 * fork carries @editorjs/editorjs as an unmodified npm dependency: subclassing
 * `Popover` is not possible (the toolbar constructs it internally, and the
 * class is not exported), and forking the library would mean re-applying the
 * patch on every upgrade. Reading the popover's rect after it opens and
 * correcting one class plus one custom property touches only Editor.js's
 * rendered DOM, which is how the other plugins here (formatPainter, crossWidgetUndo)
 * extend the editor as well.
 *
 * Horizontal placement is NOT touched: `--popover-left` is anchored by the
 * admin theme (flowpart-wysiwyg.scss), which knows where the block text
 * starts, and nothing here writes to it.
 *
 * One scroll wrinkle has to be undone as well. `Popover.show()` focuses the
 * popover's search field, and the admin theme sets `scroll-behavior: smooth` on
 * <html>, so the browser starts a ~400ms animated scroll to bring that field
 * into view — aimed at where the popover was, i.e. off the bottom of the
 * screen. We flip one frame later, but the scroll keeps running to its original
 * target and drags the now-flipped popover off the TOP instead (measured: a
 * 323px scroll, popover top ending at -204 in a 600px viewport). When a flip
 * has put the popover fully on screen that scroll is both unnecessary and
 * wrong, so the scroll position from the click that opened it is restored.
 */

// Editor.js class and custom-property names (2.31.6).
const OPENED = 'ce-popover--opened';
const OPEN_TOP = 'ce-popover--open-top';
const NESTED = 'ce-popover--nested';
const INLINE = 'ce-popover--inline';
const HEIGHT_VAR = '--popover-height';

// Keep this much clear space between the popover and the viewport edge, so a
// flipped popover does not sit flush against the top of the window.
const MARGIN = 8;

let attached = false;
let frame = 0;
const pendingRoots = new Set();
// Where the page was when the popover was asked to open, so the browser's
// scroll-the-search-field-into-view can be undone if a flip made it pointless.
let pendingScroll = null;
// Popover elements we have already wired for nested-submenu opens.
const watched = new WeakSet();

/**
 * Measure the container's untransformed box with the popover forced to one
 * direction.
 *
 * The `--opened` rule runs a 100ms `panelShowing` keyframe animation that
 * translates and scales the container, and we run one frame after the click —
 * while that animation is at ~0%, i.e. translateY(-8px) scale(.9). That would
 * skew every rect we read, so the caller suppresses the animation for the
 * duration of the probing (see correctOne).
 */
function probe(popover, container, top) {
  popover.classList.toggle(OPEN_TOP, top);
  const r = container.getBoundingClientRect();
  const vh = window.innerHeight;
  return {
    top: r.top,
    bottom: r.bottom,
    fits: r.top >= MARGIN && r.bottom <= vh - MARGIN,
    // How much of the popover would actually be on screen. Used only when it
    // fits neither way, to pick the less bad side.
    visible: Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)),
  };
}

/**
 * Correct one opened popover's vertical direction against the viewport.
 *
 * Both directions are measured rather than predicted: open-top position is a
 * calc() over several custom properties, one of which (`--item-height`) is
 * itself an unresolved calc() that `getPropertyValue` hands back as a string,
 * and the nested submenus add `--trigger-item-top` on top of that. Toggling
 * the class and reading the rect is exact, works for root and nested popovers
 * alike, and costs two forced layouts inside a single animation frame — no
 * paint happens in between, so nothing flickers.
 */
function correctOne(popover) {
  const container = popover.querySelector(':scope > .ce-popover__container');

  if (!container) {
    return { flipped: false, fits: false };
  }

  // What Editor.js decided. Its choice is kept whenever it actually works, so
  // this only ever corrects a popover that is off screen.
  const wasTop = popover.classList.contains(OPEN_TOP);

  // offsetHeight is layout height: unaffected by the entry animation's
  // transform, unlike the rect.
  popover.style.setProperty(HEIGHT_VAR, container.offsetHeight + 'px');

  const savedAnimation = container.style.animation;
  container.style.animation = 'none';
  const down = probe(popover, container, false);
  const up = probe(popover, container, true);
  container.style.animation = savedAnimation;

  let top;

  if (wasTop ? up.fits : down.fits) {
    top = wasTop; // Editor.js's direction is fine — leave it.
  } else if (wasTop ? down.fits : up.fits) {
    top = !wasTop; // The other direction fits: flip.
  } else {
    top = up.visible > down.visible; // Fits neither way: the roomier side wins.
  }

  popover.classList.toggle(OPEN_TOP, top);

  return { flipped: top !== wasTop, fits: top ? up.fits : down.fits };
}

/**
 * The "Convert to" submenu is a second popover appended inside the parent
 * popover when its item is hovered or clicked, and it runs the same broken
 * direction check. Listen on the parent element itself (once) rather than on
 * document, so hovering anywhere else in the admin costs nothing.
 */
function watchForNested(popover) {
  if (watched.has(popover)) {
    return;
  }

  watched.add(popover);

  const onNestedOpen = () => scheduleFix(popover.closest('.codex-editor'));

  popover.addEventListener('mouseover', onNestedOpen);
  popover.addEventListener('click', onNestedOpen);
}

function fixIn(root) {
  let undoScroll = false;

  // Document order, so a parent popover is corrected before the submenu nested
  // inside it — the submenu is positioned relative to the parent, so the
  // parent has to be in its final place first.
  root.querySelectorAll('.' + OPENED).forEach((popover) => {
    // The inline (text selection) toolbar's popover is positioned by Editor.js
    // in JS against the selection, not by these classes — leave it alone.
    if (popover.classList.contains(INLINE) || popover.closest('.ce-inline-toolbar')) {
      return;
    }

    if (!popover.classList.contains(NESTED)) {
      watchForNested(popover);
    }

    const result = correctOne(popover);

    // Only worth undoing the browser's scroll if the flip actually rescued the
    // popover; if it still does not fit, whatever scrolling is under way can
    // only help.
    if (result.flipped && result.fits) {
      undoScroll = true;
    }
  });

  return undoScroll;
}

/**
 * Editor.js opens the popover synchronously inside its own click handler, so
 * one frame later it is open and laid out. Coalesce to a single frame: a hover
 * over the popover fires a stream of mouseover events.
 */
function scheduleFix(root) {
  if (!root) {
    return;
  }

  pendingRoots.add(root);

  if (pendingScroll === null) {
    // Recorded here, in the event handler, so it is the position before
    // Editor.js opened anything and before the browser began scrolling.
    pendingScroll = { left: window.scrollX, top: window.scrollY };
  }

  if (frame) {
    return;
  }

  frame = requestAnimationFrame(() => {
    frame = 0;
    const roots = Array.from(pendingRoots);
    const scroll = pendingScroll;
    pendingRoots.clear();
    pendingScroll = null;

    const undoScroll = roots.map(fixIn).some(Boolean);

    // Unconditional when a flip rescued the popover: the smooth scroll may not
    // have moved the page yet by this frame, and issuing our own scroll is what
    // supersedes it. 'instant' so it does not animate in turn.
    if (undoScroll && scroll) {
      window.scrollTo({ left: scroll.left, top: scroll.top, behavior: 'instant' });
    }
  });
}

/**
 * Register the correction once per page. Safe to call from any number of
 * editor instances — the listeners are delegated on document and find the
 * editor from the event.
 */
export function attachPopoverFlip() {
  if (attached) {
    return;
  }

  attached = true;

  // Capture phase so we are queued before Editor.js's own handler runs; the
  // work itself happens a frame later either way.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;

      if (!target || !target.closest) {
        return;
      }

      if (target.closest('.ce-toolbar__settings-btn, .ce-toolbar__plus')) {
        scheduleFix(target.closest('.codex-editor'));
      }
    },
    true
  );

  // The keyboard can open and reshape these popovers too. In 2.31.6 that is
  // "/" in an empty block (opens the toolbox) and Ctrl/Cmd+"/" (opens the block
  // settings) — Tab does NOT open the toolbox in this version, it moves the
  // caret. Anything typed while a popover is already open can change its height
  // (the toolbox search filters the list) or open a submenu (Enter on "Convert
  // to"), so re-check on every key then.
  document.addEventListener(
    'keydown',
    (e) => {
      const target = e.target;

      if (!target || !target.closest) {
        return;
      }

      const editor = target.closest('.codex-editor');

      if (!editor) {
        return;
      }

      if (e.key === '/' || e.code === 'Slash' || editor.querySelector('.' + OPENED)) {
        scheduleFix(editor);
      }
    },
    true
  );
}
