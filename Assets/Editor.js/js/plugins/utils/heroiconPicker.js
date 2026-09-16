import { make } from './dom';
import { makeIconSvg, names, styles } from './heroiconsIndex';
import './heroiconPicker.css';

// Searchable Heroicons picker, shared by the button tool and the icon block so
// both offer the same 324 icons, the same search and the same outline/solid
// toggle. Previews come from the sprite (<use href="…#o-name">), so opening the
// picker costs one cached request rather than 181 KB of inline SVG in the
// bundle.

const STYLE_LABELS = { outline: 'Outline', solid: 'Solid' };

/**
 * @param {object} options
 * @param {string} options.tenantPath  Request.PathBase, for the sprite URL.
 * @param {string} options.name        Currently selected icon name ('' if none).
 * @param {string} options.style       'outline' | 'solid'.
 * @param {Function} options.onChange  Called with ({ name, style }) on any pick.
 * @param {HTMLElement[]} [options.controls]  Extra buttons for the control row.
 * @returns {{ element: HTMLElement, close: Function, destroy: Function }}
 */
export function createHeroiconPicker({
  tenantPath,
  name = '',
  style = 'outline',
  onChange,
  controls = [],
}) {
  const state = { name, style: styles.includes(style) ? style : 'outline' };

  const wrapper = make('div', 'heroicon-picker');
  const row = make('div', 'heroicon-picker__row');

  const search = make('input', 'heroicon-picker__search', {
    type: 'text',
    placeholder: 'Search icons...',
  });
  search.value = state.name;
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
      cell.appendChild(makeIconSvg(tenantPath, state.style, iconName));

      // mousedown, not click: the search input still has focus, and letting the
      // blur land first would close the dropdown before the click fires.
      cell.addEventListener('mousedown', e => {
        e.preventDefault();
        state.name = iconName;
        search.value = iconName;
        close();
        emit();
      });

      dropdown.appendChild(cell);
    });
  };

  const open = () => {
    populate(search.value);
    dropdown.style.display = '';
  };

  const close = () => {
    dropdown.style.display = 'none';
  };

  search.addEventListener('focus', open);
  search.addEventListener('input', open);

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
    destroy() {
      document.removeEventListener('click', onDocumentClick);
    },
  };
}

export default createHeroiconPicker;
