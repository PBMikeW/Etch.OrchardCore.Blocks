/**
 * Text presets: the named styles, and how each one maps onto inline markup.
 *
 * WHY presets, and why they come in pairs. A census of 1,576 blocks on the 30
 * newest production pages found that colour is the only inline style editors
 * really use, and that 95% of the time it is applied to a WHOLE block. Over
 * half of every colour application was "make this white, the widget sits on a
 * dark banner" — done one block at a time, across widgets averaging five
 * blocks. The same census found the highlight tool and the font-size tool with
 * zero usage, and editors mixing #FFF with #F8F8F8, and navy with black, for
 * the same job. So the useful unit is not "a colour" but "a role on a ground":
 * a named preset with a Light-ground and a Dark-ground variant, applied to one
 * block or to a whole selection in one gesture.
 *
 * Bold is deliberately not part of any preset: the census shows bold is real
 * inline emphasis (38% of paragraphs, usually a phrase rather than the whole
 * block), so presets never add or remove it.
 *
 * Each preset is data, not code:
 *   { id, label, block: 'header' | 'paragraph', level?,
 *     light: { color }, dark: { color }, fontSize?, alignment? }
 * plus the `none` entry, which owns no colour or size and only clears.
 * Colours are values from the colour tool's own palette in ../../index.js, so
 * a preset writes exactly what the swatch picker would have written and the
 * picker still recognises the result afterwards.
 *
 * A site can replace the whole table with a JSON data island (see
 * readPresets), the same mechanism the legacy heading scale uses, so the two
 * sites sharing this fork can ship different vocabularies without a code
 * change.
 *
 * No imports, by design: this module is pure data plus string/DOM helpers over
 * a document you pass in, so its unit tests run a byte-identical copy of this
 * file under jsdom.
 */

export const PRESET_ISLAND_ID = 'blocks-text-presets';

export const LIGHT_GROUND = 'light';
export const DARK_GROUND = 'dark';

// The id of the entry that clears rather than applies.
export const CLEAR_ID = 'none';

// Palette values from the colour tool config in ../../index.js.
const NAVY = '#002D6A';
const WHITE = '#FFF';
const GREY = '#72808A';
const RED = '#EF4123';

const BLOCKS = ['header', 'paragraph'];
const ALIGNMENTS = ['left', 'center', 'right', 'justify'];

// The clearing entry, kept separately so an overriding island that forgets it
// still gets it: without "None" there is no way back out of a preset.
const CLEAR_PRESET = { id: CLEAR_ID, label: 'None' };

/**
 * The shipped table. Levels and colours follow what the census actually found
 * in production: h2 navy or white for section headings, h3 grey for muted
 * sub-headings, h4 white for the stat tiles on dark landing-page banners.
 */
export const DEFAULT_PRESETS = [
  {
    id: 'section-heading',
    label: 'Section heading',
    block: 'header',
    level: 2,
    light: { color: NAVY },
    dark: { color: WHITE },
  },
  {
    id: 'page-title',
    label: 'Page title',
    block: 'header',
    level: 1,
    light: { color: NAVY },
    dark: { color: WHITE },
  },
  {
    id: 'sub-heading',
    label: 'Sub-heading (muted)',
    block: 'header',
    level: 3,
    // Grey reads on both grounds, so both variants carry the same colour.
    light: { color: GREY },
    dark: { color: GREY },
  },
  {
    id: 'stat-label',
    label: 'Stat / tile label',
    block: 'header',
    level: 4,
    light: { color: NAVY },
    dark: { color: WHITE },
    alignment: 'center',
  },
  {
    id: 'intro',
    label: 'Intro',
    block: 'paragraph',
    fontSize: '1.2rem',
    light: { color: NAVY },
    dark: { color: WHITE },
  },
  {
    id: 'body',
    label: 'Body',
    block: 'paragraph',
    light: { color: NAVY },
    dark: { color: WHITE },
  },
  {
    id: 'accent',
    label: 'Accent label',
    block: 'paragraph',
    light: { color: RED },
    dark: { color: RED },
  },
  {
    id: 'small-print',
    label: 'Small print',
    block: 'paragraph',
    fontSize: '0.8rem',
    light: { color: GREY },
    dark: { color: WHITE },
  },
  CLEAR_PRESET,
];

export function isClearPreset(preset) {
  return !!preset && preset.id === CLEAR_ID;
}

// One colour written two ways ('#FFF', 'rgb(255, 255, 255)') is one colour.
// The browser's own parser is the only normaliser that agrees with what
// extractWholeBlockStyles reads back off a block.
function normaliseColor(value, doc) {
  if (!value) {
    return '';
  }
  const probe = doc.createElement('span');
  probe.style.color = value;
  return probe.style.color || String(value).toLowerCase();
}

// Sizes compare as written: both sides come from this table or from the size
// tool, and both write rem.
function normaliseSize(value) {
  return value ? String(value).trim().toLowerCase() : '';
}

/**
 * What applying `preset` on `ground` means, independent of any block.
 *
 * @returns {null|{ id, clear, tool?, level?, styles, alignment? }}
 *   `styles` is in the shape ../formatPainter/inlineStyles.js applies.
 */
export function resolve(preset, ground) {
  if (!preset) {
    return null;
  }
  if (isClearPreset(preset)) {
    return { id: preset.id, clear: true, styles: {} };
  }
  const variant = (ground === DARK_GROUND ? preset.dark : preset.light) || {};
  const styles = {};
  if (variant.color) {
    styles.color = variant.color;
  }
  if (preset.fontSize) {
    styles.fontSize = preset.fontSize;
  }
  return {
    id: preset.id,
    clear: false,
    tool: preset.block,
    level: preset.block === 'header' ? preset.level || 2 : undefined,
    styles,
    alignment: preset.alignment,
  };
}

/**
 * The alignment a block's saved tunes describe, from either key.
 *
 * Content saved by earlier editor versions stores the alignment under
 * `anyTune` — still the majority of the alignment tunes on production pages —
 * while current content uses `alignmentTune`. The tune saves nothing for its
 * default, so absent means left either way.
 */
export function alignmentOfTunes(tunes) {
  const tune = tunes && (tunes.alignmentTune || tunes.anyTune);
  return (tune && tune.alignment) || 'left';
}

/**
 * Does a block already look like this preset on this ground?
 *
 * The fingerprint is everything a preset owns: block type, heading level, the
 * whole-block colour and size (from extractWholeBlockStyles) and the alignment
 * tune. Properties the preset does not own are not compared — a preset with no
 * alignment matches a block at any alignment, because applying it would leave
 * the block's own alignment alone.
 *
 * @param {object} fingerprint { tool, level?, color?, backgroundColor?, fontSize?, alignment? }
 */
export function matchesFingerprint(preset, ground, fingerprint, doc = document) {
  const plan = resolve(preset, ground);
  if (!plan || !fingerprint) {
    return false;
  }
  if (plan.clear) {
    // "None" is active exactly when there is nothing left for it to clear.
    return !fingerprint.color && !fingerprint.backgroundColor && !fingerprint.fontSize;
  }
  if (fingerprint.tool !== plan.tool) {
    return false;
  }
  if (plan.tool === 'header' && (fingerprint.level || 2) !== plan.level) {
    return false;
  }
  if (normaliseColor(fingerprint.color, doc) !== normaliseColor(plan.styles.color, doc)) {
    return false;
  }
  if (normaliseSize(fingerprint.fontSize) !== normaliseSize(plan.styles.fontSize)) {
    return false;
  }
  if (plan.alignment && (fingerprint.alignment || 'left') !== plan.alignment) {
    return false;
  }
  return true;
}

function variantOf(raw) {
  const variant = {};
  if (raw && typeof raw.color === 'string' && raw.color) {
    variant.color = raw.color;
  }
  return variant;
}

// One island entry -> a preset, or null when it is not usable. Anything the
// site gets wrong is dropped rather than half-applied: a preset that writes a
// colour nobody chose is worse than a preset that is missing.
function sanitisePreset(raw) {
  if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.label !== 'string' || !raw.label) {
    return null;
  }
  if (raw.id === CLEAR_ID) {
    return { id: CLEAR_ID, label: raw.label };
  }
  if (BLOCKS.indexOf(raw.block) === -1) {
    return null;
  }
  const preset = { id: raw.id, label: raw.label, block: raw.block };
  if (raw.block === 'header') {
    const level = Math.round(Number(raw.level));
    preset.level = level >= 1 && level <= 6 ? level : 2;
  }
  preset.light = variantOf(raw.light);
  preset.dark = variantOf(raw.dark);
  if (typeof raw.fontSize === 'string' && raw.fontSize) {
    preset.fontSize = raw.fontSize;
  }
  if (ALIGNMENTS.indexOf(raw.alignment) !== -1) {
    preset.alignment = raw.alignment;
  }
  return preset;
}

/**
 * The preset table for this page: the site's own if it publishes one, else the
 * table above.
 *   <script type="application/json" id="blocks-text-presets">[ … ]</script>
 * Read exactly like the legacy heading scale island in ../utils/legacyMarkup.js.
 * An absent, unparseable or wholly invalid island falls back to the default
 * table, so a typo in a theme cannot leave editors with no presets at all.
 */
export function readPresets(doc = document) {
  const island = doc.getElementById(PRESET_ISLAND_ID);
  if (!island) {
    return DEFAULT_PRESETS;
  }
  try {
    const parsed = JSON.parse(island.textContent || '');
    if (!Array.isArray(parsed)) {
      return DEFAULT_PRESETS;
    }
    const presets = parsed.map(sanitisePreset).filter(Boolean);
    if (!presets.length) {
      return DEFAULT_PRESETS;
    }
    if (!presets.some(isClearPreset)) {
      presets.push(CLEAR_PRESET);
    }
    return presets;
  } catch (e) {
    return DEFAULT_PRESETS;
  }
}
