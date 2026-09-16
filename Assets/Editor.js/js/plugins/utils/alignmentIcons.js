// Alignment actions for a tool's block-settings popover. Shared so the button
// tool and the icon block offer the same three choices with the same glyphs.

export const ALIGNMENTS = [
  {
    value: 'left',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="2" height="10"/><rect x="4" y="2" width="13" height="6" rx="1"/></svg>',
    label: 'Left',
  },
  {
    value: 'center',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="2" width="4" height="6" rx="1"/><rect x="6" y="0" width="5" height="10" rx="1"/><rect x="13" y="2" width="4" height="6" rx="1"/></svg>',
    label: 'Centre',
  },
  {
    value: 'right',
    icon: '<svg width="17" height="10" viewBox="0 0 17 10" xmlns="http://www.w3.org/2000/svg"><rect x="15" y="0" width="2" height="10"/><rect x="0" y="2" width="13" height="6" rx="1"/></svg>',
    label: 'Right',
  },
];

// CSS justify-content for each alignment, for tools that lay their content out
// with flex. The server-side views map the same three values the same way.
export const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' };

export default ALIGNMENTS;
