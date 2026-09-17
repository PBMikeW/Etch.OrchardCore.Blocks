import { make } from './dom';
import { makeIconSvg, names, styles } from './heroiconsIndex';
import './heroiconPicker.css';

// Searchable Heroicons picker, shared by the button tool and the icon block so
// both offer the same 324 icons, the same search and the same outline/solid
// toggle. Previews come from the sprite (<use href="…#o-name">), so opening the
// picker costs one cached request rather than 181 KB of inline SVG in the
// bundle.
//
// The grid is keyboard-workable: Escape closes it, ArrowDown drops into it from
// the search box, the arrows move between cells and Enter or Space picks. Only
// one cell is ever tabbable (roving tabindex), so 324 icons add one tab stop to
// the settings panel rather than 324.

const STYLE_LABELS = { outline: 'Outline', solid: 'Solid' };

/**
 * @param {object} options
 * @param {string} options.tenantPath  Request.PathBase, for the sprite URL.
 * @param {string} options.name        Currently selected icon name ('' if none).
 * @param {string} options.style       'outline' | 'solid'.
 * @param {Function} options.onChange  Called with ({ name, style }) on any pick.
 * @param {HTMLElement[]} [options.controls]  Extra buttons for the control row.
 * @param {string|Function} [options.emptyLabel]  What the selected-icon chip
 *        reads when nothing is picked. A function is re-read on every sync, so
 *        a tool whose block can hold an icon the picker knows nothing about
 *        (kbButton's legacy inline markup) can say so.
 * @returns {{ element: HTMLElement, close: Function, clear: Function, destroy: Function }}
 */
export function createHeroiconPicker({
  tenantPath,
  name = '',
  style = 'outline',
  onChange,
  controls = [],
  emptyLabel = 'No icon',
}) {
  const state = { name, style: styles.includes(style) ? style : 'outline' };

  const wrapper = make('div', 'heroicon-picker');
  const row = make('div', 'heroicon-picker__row');

  // ── Selected icon ───────────────────────────────
  // The row used to say nothing at all about what was picked: the search box is
  // emptied on every pick (see close) and seeding it with the icon's name
  // filtered the grid down to that one icon, so an editor chose an icon and the
  // field they had just typed into went blank again - only the button preview
  // moved. This chip is the field's value: swatch, name, and a way back to no
  // icon, leaving the search box free to search.
  const selected = make('div', 'heroicon-picker__selected');
  const selectedIcon = make('span', 'heroicon-picker__selected-icon');
  const selectedName = make('span', 'heroicon-picker__selected-name');

  const selectedClear = make('button', 'heroicon-picker__selected-clear', {
    type: 'button',
    title: 'Remove icon',
  });
  selectedClear.textContent = '×';
  selectedClear.addEventListener('click', e => {
    // Stopped here so the click neither reopens the grid nor reaches the
    // block's own "click anywhere to toggle the settings panel" handler.
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
  });

  selected.appendChild(selectedIcon);
  selected.appendChild(selectedName);
  selected.appendChild(selectedClear);
  row.appendChild(selected);

  const syncSelected = () => {
    selectedIcon.innerHTML = '';
    selected.classList.toggle('heroicon-picker__selected--empty', !state.name);
    selectedClear.hidden = !state.name;

    if (state.name) {
      selectedIcon.appendChild(makeIconSvg(tenantPath, state.style, state.name));
      selectedName.textContent = state.name;
      selected.title = `${state.name} (${STYLE_LABELS[state.style]})`;
    } else {
      selectedName.textContent =
        typeof emptyLabel === 'function' ? emptyLabel() : emptyLabel;
      selected.title = selectedName.textContent;
    }
  };

  // The block may already carry an icon: the chip is how reopening the panel
  // shows which one, which the row never did before.
  syncSelected();

  const search = make('input', 'heroicon-picker__search', {
    type: 'text',
    placeholder: 'Search icons...',
  });

  // Deliberately left empty. Seeding it with the current icon's name filtered
  // the grid down to that one icon every time the panel opened, so an editor
  // wanting a different icon had to clear the box first. The current icon is
  // marked in the full grid instead (see populate) and named in the chip beside
  // this box.
  row.appendChild(search);

  // ── Outline / solid toggle ──────────────────────
  const styleWrap = make('div', 'heroicon-picker__styles');
  const styleButtons = styles.map(value => {
    const button = make('button', 'heroicon-picker__style-btn', {
      type: 'button',
      title: `${STYLE_LABELS[value]} icons`,
    });
    button.textContent = STYLE_LABELS[value];
    button.addEventListener('click', () => {
      state.style = value;
      syncStyleButtons();
      // The chip's swatch is drawn in the picked weight, so it follows.
      syncSelected();
      populate(search.value);
      // Switching style re-picks the same icon in the other weight, so the
      // preview updates without making the editor search for it again.
      if (state.name) {
        emit();
      }
    });
    styleWrap.appendChild(button);
    return { value, button };
  });

  const syncStyleButtons = () => {
    styleButtons.forEach(({ value, button }) => {
      button.classList.toggle('active', state.style === value);
    });
  };
  syncStyleButtons();

  row.appendChild(styleWrap);
  controls.forEach(control => row.appendChild(control));
  wrapper.appendChild(row);

  // ── Results grid ────────────────────────────────
  const dropdown = make('div', 'heroicon-picker__dropdown');
  dropdown.style.display = 'none';
  wrapper.appendChild(dropdown);

  const emit = () => {
    if (typeof onChange === 'function') {
      onChange({ name: state.name, style: state.style });
    }
  };

  const isOpen = () => dropdown.style.display !== 'none';

  const cells = () =>
    Array.prototype.slice.call(
      dropdown.querySelectorAll('.heroicon-picker__cell')
    );

  // Roving tabindex: the cell the arrows are on is the only tabbable one, so
  // Tab moves past the whole grid in one press instead of 324.
  const setRovingCell = (cell, { focus = true } = {}) => {
    if (!cell) return;
    cells().forEach(other => {
      other.tabIndex = other === cell ? 0 : -1;
    });
    if (focus) {
      cell.focus();
    }
  };

  const currentCell = () =>
    dropdown.querySelector('.heroicon-picker__cell--current');

  // Never dropdown.firstChild: a search with no hits leaves the "No icons
  // found" message there, which must not become a focus target.
  const firstCell = () => dropdown.querySelector('.heroicon-picker__cell');

  const pick = iconName => {
    if (!iconName) return;
    state.name = iconName;
    syncSelected();
    close();
    emit();
  };

  /**
   * Back to "no icon". Reached from the chip's clear button and from the
   * returned clear(), so both land on the same state, highlight and onChange.
   */
  const clearSelection = () => {
    state.name = '';
    syncSelected();
    if (isOpen()) {
      populate(search.value);
    }
    emit();
  };

  // A mouse pick fires mousedown (which the grid handles, so the pick lands
  // before the input's blur) and then click. Remembering which cell the
  // mousedown claimed keeps that pair from picking twice.
  let pointerPicked = null;

  const populate = query => {
    dropdown.innerHTML = '';

    const q = (query || '').toLowerCase().trim();
    const filtered = q ? names.filter(n => n.includes(q)) : names;

    if (filtered.length === 0) {
      const empty = make('div', 'heroicon-picker__empty');
      empty.textContent = 'No icons found';
      dropdown.appendChild(empty);
      return;
    }

    filtered.forEach(iconName => {
      const cell = make('button', 'heroicon-picker__cell', {
        type: 'button',
        title: iconName,
      });
      cell.tabIndex = -1;
      cell.dataset.iconName = iconName;
      cell.appendChild(makeIconSvg(tenantPath, state.style, iconName));

      if (iconName === state.name) {
        cell.classList.add('heroicon-picker__cell--current');
        cell.setAttribute('aria-current', 'true');
      }

      // mousedown, not click alone: the search input still has focus, and
      // letting the blur land first would close the dropdown before the click
      // fires.
      cell.addEventListener('mousedown', e => {
        e.preventDefault();
        pointerPicked = cell;
        pick(iconName);
      });

      // Keyboard activation and any synthetic .click() never send a mousedown,
      // so the cell needs a real click handler too.
      cell.addEventListener('click', () => {
        if (pointerPicked === cell) {
          pointerPicked = null;
          return;
        }
        pick(iconName);
      });

      dropdown.appendChild(cell);
    });

    // Arrow keys start from the icon the block already has, and that cell is
    // the one the grid offers to Tab.
    setRovingCell(currentCell() || firstCell(), { focus: false });
  };

  const open = () => {
    populate(search.value);
    dropdown.style.display = '';

    // Bring the current icon into view rather than making the editor scroll
    // the full list looking for what is already picked.
    const current = currentCell();
    if (current && typeof current.scrollIntoView === 'function') {
      current.scrollIntoView({ block: 'nearest' });
    }
  };

  const close = () => {
    dropdown.style.display = 'none';

    // A query left in the box would silently filter the grid the next time the
    // panel opens — the same trap the pre-filled icon name used to set.
    if (search.value) {
      search.value = '';
    }
  };

  // Refocusing the search box must not reopen the grid that was just closed,
  // so the focus handler skips exactly one programmatic refocus.
  let suppressOpenOnFocus = false;

  const refocusSearch = () => {
    if (document.activeElement === search) return;
    suppressOpenOnFocus = true;
    search.focus();
  };

  search.addEventListener('focus', () => {
    if (suppressOpenOnFocus) {
      suppressOpenOnFocus = false;
      return;
    }
    open();
  });
  search.addEventListener('input', open);

  search.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!isOpen()) return;
      // Stopped here: an Escape that reaches the editor closes the whole block
      // settings panel, taking the rest of the fields with it.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      if (!isOpen()) {
        open();
      }
      setRovingCell(currentCell() || firstCell());
    }
  });

  // One delegated handler rather than four listeners on each of 324 cells.
  dropdown.addEventListener('keydown', e => {
    const cell = e.target.closest && e.target.closest('.heroicon-picker__cell');
    if (!cell) return;

    const all = cells();
    const index = all.indexOf(cell);

    // The grid is auto-fill, so its column count is whatever the panel's width
    // produced; read it back rather than assume one.
    const template = window.getComputedStyle(dropdown).gridTemplateColumns;
    const columns = Math.max(
      1,
      (template || '').trim().split(/\s+/).filter(Boolean).length
    );

    const moveTo = target => {
      e.preventDefault();
      e.stopPropagation();
      setRovingCell(all[Math.max(0, Math.min(all.length - 1, target))]);
    };

    switch (e.key) {
      case 'ArrowRight':
        moveTo(index + 1);
        break;
      case 'ArrowLeft':
        moveTo(index - 1);
        break;
      case 'ArrowDown':
        moveTo(index + columns);
        break;
      case 'ArrowUp':
        if (index < columns) {
          // Up from the top row goes back where the arrows came from.
          e.preventDefault();
          e.stopPropagation();
          refocusSearch();
        } else {
          moveTo(index - columns);
        }
        break;
      case 'Home':
        moveTo(0);
        break;
      case 'End':
        moveTo(all.length - 1);
        break;
      case 'Enter':
      case ' ':
      case 'Spacebar':
        // preventDefault takes the button's native activation with it, so the
        // pick happens once; an Enter left to bubble also splits the block.
        e.preventDefault();
        e.stopPropagation();
        pick(cell.dataset.iconName);
        refocusSearch();
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        refocusSearch();
        break;
      default:
        break;
    }
  });

  // Close on a click anywhere else on the page. Held as a named handler so the
  // tool's destroy() can take it off the document — the previous picker left
  // one listener per rendered button block behind.
  const onDocumentClick = e => {
    if (!wrapper.contains(e.target)) {
      close();
    }
  };
  document.addEventListener('click', onDocumentClick);

  return {
    element: wrapper,
    close,

    /**
     * Back to "no icon". The picker owns the selected name, the chip, the grid
     * highlight and the onChange contract, so the reset belongs here; its own
     * chip offers the editor the same thing.
     */
    clear: clearSelection,

    destroy() {
      document.removeEventListener('click', onDocumentClick);
    },
  };
}

export default createHeroiconPicker;
