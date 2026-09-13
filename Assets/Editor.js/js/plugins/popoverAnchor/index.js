/**
 * Where the block-settings popover opens.
 *
 * Two placements, picked by how the popover was asked to open:
 *
 *   Gear button (pointer) — Editor.js's own placement: the menu hangs under
 *   the button that was clicked, right-aligned to it
 *   (`ce-popover--open-left`). The cursor and the eye are already on the
 *   button, and a menu that appears somewhere else reads as a different
 *   control having answered.
 *
 *   Ctrl/Cmd + "/" (keyboard) — beside the block text, at the start of the
 *   toolbar strip. The shortcut has no button to hang under; the block being
 *   edited is what the user is looking at, and its text edge is the only
 *   anchor that means anything.
 *
 * The placement itself is CSS, in the admin theme (flowpart-wysiwyg.scss):
 * that is the layer which knows where the block text starts once the toolbar
 * strip has been stretched to the editor's full width and the buttons packed
 * to its right, and it is what writes `--popover-left` (plus the matching
 * rightward nesting formula for "Convert to", which from the left edge would
 * otherwise run off-screen). All this module does is tell that CSS which of
 * the two opens it is looking at, by adding `ce-popover--pb-at-text` to the
 * settings popover for keyboard opens only.
 *
 * Timing. Both handlers are capture phase, so they run before Editor.js's own
 * and the class is settled before Editor.js acts on the same event.
 *
 * The set cannot be synchronous: the popover does not exist yet. In 2.31.6
 * `BlockSettings.close()` destroys its popover (`popover.destroy()`,
 * `getElement().remove()`, `popover = null`) and `open()` builds a fresh one,
 * and `open()` is async — it awaits the tunes list before appending the
 * element and calling `show()`. So we look for the opened popover on the next
 * animation frame, and keep looking for a few frames in case that await ever
 * costs more than one (measured: present on the first frame today, with the
 * tools this fork registers). rAF callbacks run before the frame is painted,
 * so the popover is never painted at the button and then moved.
 *
 * Because every open builds a new element, a class left over from a previous
 * open cannot survive by itself, so clearing on a pointer open is not what
 * keeps the two placements apart. It is still done, for two reasons: it
 * cancels a keyboard mark that is still pending when the gear is clicked in
 * the same handful of frames, and it keeps "a pointer open is never at-text"
 * true by construction rather than by depending on that destroy-on-close —
 * Editor.js's other popovers are not built that way (the toolbox's element
 * stays in the DOM between opens), and nothing stops BlockSettings from
 * changing to match on an upgrade.
 *
 * Vertical placement is not touched. plugins/popoverFlip corrects the open
 * direction against the viewport a frame after these same opens; it writes
 * only `ce-popover--open-top` and `--popover-height`, never removing a class
 * it did not add, and this module writes only a class the CSS reads for
 * `--popover-left`. The two cannot contend, so their order does not matter.
 */

// Our marker class, read by the admin theme's `--popover-left` rules.
const AT_TEXT = 'ce-popover--pb-at-text';

// Editor.js class name (2.31.6).
const OPENED = 'ce-popover--opened';

// The block-settings popover of one editor: Editor.js appends it as a direct
// child of the toolbar's `.ce-settings` wrapper. The toolbox ("+" and "/") and
// the inline toolbar are separate popovers elsewhere in the toolbar and are
// deliberately not matched — neither is anchored by those CSS rules.
const SETTINGS_POPOVER = '.ce-settings > .ce-popover';

// How many frames to wait for an async `BlockSettings.open()` to append its
// popover before giving up. A keystroke Editor.js decided to ignore (it drops
// the shortcut when several blocks are selected) has to stop costing frames.
const MAX_FRAMES = 5;

let attached = false;
let frame = 0;
// Editors whose keyboard open we are still waiting on -> frames left to wait.
const pending = new Map();

function settingsPopoverIn(editor) {
  return editor ? editor.querySelector(SETTINGS_POPOVER) : null;
}

/**
 * Mark the settings popover of an editor that has just been sent the keyboard
 * shortcut, once Editor.js has opened it.
 *
 * Coalesced to one frame at a time: a held shortcut repeats, and the retry is
 * per editor, not per keystroke.
 */
function markAtText(editor) {
  pending.set(editor, MAX_FRAMES);

  if (frame) {
    return;
  }

  frame = requestAnimationFrame(function step() {
    frame = 0;

    pending.forEach((framesLeft, el) => {
      const popover = settingsPopoverIn(el);

      if (popover && popover.classList.contains(OPENED)) {
        popover.classList.add(AT_TEXT);
        pending.delete(el);
      } else if (framesLeft <= 1) {
        pending.delete(el);
      } else {
        pending.set(el, framesLeft - 1);
      }
    });

    if (pending.size) {
      frame = requestAnimationFrame(step);
    }
  });
}

/**
 * Put an editor's settings popover back to Editor.js's own placement, and drop
 * any keyboard mark still waiting to be applied to it.
 */
function clearAtText(editor) {
  pending.delete(editor);

  const popover = settingsPopoverIn(editor);

  if (popover) {
    popover.classList.remove(AT_TEXT);
  }
}

/**
 * Register the two placements once per page. Safe to call from any number of
 * editor instances — the listeners are delegated on document and find the
 * editor from the event.
 */
export function attachPopoverAnchor() {
  if (attached) {
    return;
  }

  attached = true;

  document.addEventListener(
    'keydown',
    (e) => {
      // Ctrl/Cmd + "/" as Editor.js 2.31.6 matches it, by physical key
      // (`code`), with `key` kept as a fallback for layouts that put "/"
      // somewhere else. Alt and Shift are excluded so that only the bare
      // chord counts; Editor.js does not check them, so Ctrl+Shift+"/" still
      // opens the settings — just at the button, like a click, which is a
      // sane place for a chord nobody documents.
      if (!e.ctrlKey && !e.metaKey) {
        return;
      }

      if (e.altKey || e.shiftKey) {
        return;
      }

      if (e.code !== 'Slash' && e.key !== '/') {
        return;
      }

      const target = e.target;

      if (!target || !target.closest) {
        return;
      }

      const editor = target.closest('.codex-editor');

      if (editor) {
        markAtText(editor);
      }
    },
    true
  );

  // Any pointer open goes back under the button. Both events are listened for
  // because Editor.js opens the popover on click, while mousedown is the first
  // chance to cancel a pending keyboard mark; removing a class that is not
  // there costs nothing.
  const onPointer = (e) => {
    const target = e.target;

    if (!target || !target.closest) {
      return;
    }

    const btn = target.closest('.ce-toolbar__settings-btn');

    if (btn) {
      clearAtText(btn.closest('.codex-editor'));
    }
  };

  document.addEventListener('mousedown', onPointer, true);
  document.addEventListener('click', onPointer, true);
}
