// icons.js — inline SVG icons (stroke-based, inherit currentColor).
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;

export const ICONS = {
  swap: svg('<path d="M4 9h13l-3-3M20 15H7l3 3"/>'),
  list: svg('<path d="M5 6h14M5 12h14M5 18h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  minus: svg('<path d="M5 12h14"/>'),
  reroll: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
  trash: svg('<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>'),
  edit: svg('<path d="M5 19h4L19 9l-4-4L5 15z"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
  search: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'),
};
