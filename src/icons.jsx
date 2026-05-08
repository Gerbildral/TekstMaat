// Lightweight inline SVG icon set — minimal, line-based.
// Usage: <Icon name="play" />

const _ICONS = {
  play:    'M8 5l11 7-11 7V5z',
  pause:   'M6 5h4v14H6zM14 5h4v14h-4z',
  stop:    'M6 6h12v12H6z',
  prev:    'M19 5L9 12l10 7V5zM5 5h2v14H5z',
  next:    'M5 5l10 7-10 7V5zM17 5h2v14h-2z',
  speed:   'M12 4a8 8 0 100 16 8 8 0 000-16zm0 2a6 6 0 11-5.656 8H8a4 4 0 108-1.5L12 12V6z',
  bookmark:'M6 4h12v17l-6-4-6 4V4z',
  upload:  'M12 3l5 5h-3v8h-4V8H7l5-5zM5 19h14v2H5z',
  search:  'M10 4a6 6 0 104.47 10.03l4.25 4.25 1.41-1.41-4.25-4.25A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z',
  plus:    'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4z',
  check:   'M9 16.2l-3.5-3.6L4 14l5 5 11-11-1.4-1.4z',
  filter:  'M3 5h18v2l-7 7v6l-4-2v-4L3 7V5z',
  lang:    'M12 3a9 9 0 100 18 9 9 0 000-18zm0 2a7 7 0 015 2H7a7 7 0 015-2zm-6 5h12a7 7 0 010 4H6a7 7 0 010-4zm1 6h10a7 7 0 01-10 0z',
  user:    'M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0H5z',
  users:   'M9 11a4 4 0 100-8 4 4 0 000 8zm6 0a3 3 0 100-6 3 3 0 000 6zm-9 8a6 6 0 0112 0H6zm12 0a5 5 0 015-5v5h-5z',
  doc:     'M6 2h9l5 5v15H6V2zm9 0v6h6',
  book:    'M4 4h7a3 3 0 013 3v13a3 3 0 00-3-3H4V4zm9 3a3 3 0 013-3h5v13h-5a3 3 0 00-3 3V7z',
  settings:'M12 8a4 4 0 100 8 4 4 0 000-8zm0-6l1.5 2.5L16 5l1 2.5 2.5 1L18 11l1.5 2.5L17 14.5l-1 2.5-2.5-1L12 18l-1.5-2L8 17l-1-2.5L4.5 13.5 6 11 4.5 8.5 7 7l1-2.5L10.5 4z',
  chart:   'M4 20V8h3v12H4zm6 0V4h3v16h-3zm6 0v-7h3v7h-3z',
  link:    'M9.5 14.5l5-5M8 7H5a4 4 0 100 8h3M16 7h3a4 4 0 010 8h-3',
  shield:  'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z',
  bell:    'M12 2a6 6 0 016 6v3l2 4H4l2-4V8a6 6 0 016-6zm-2 17a2 2 0 004 0h-4z',
  home:    'M12 3l9 8h-2v9h-5v-6h-4v6H5v-9H3l9-8z',
  highlighter:'M14 3l7 7-9 9-3 1-1 3-3-3 1-3 1-3 9-9zM3 21h6',
  ruler:   'M3 7h18v6H3z M6 7v3 M9 7v4 M12 7v3 M15 7v4 M18 7v3',
  ear:     'M9 4a6 6 0 016 6c0 2-1 3-2 4s-2 2-2 4a3 3 0 01-6 0M7 10a2 2 0 014 0',
  arrowRight:'M5 12h14m-5-5l5 5-5 5',
  arrowLeft:'M19 12H5m5-5l-5 5 5 5',
  download:'M12 3v12m0 0l-4-4m4 4l4-4M5 19h14',
  more:    'M5 12a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zm5.5 0a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z',
  clock:   'M12 4a8 8 0 100 16 8 8 0 000-16zm.5 4v4.5l3 2-1 1.5-3.5-2.5V8z',
  fileText:'M6 2h9l5 5v15H6V2zm9 0v6h6M9 13h7M9 17h7M9 9h3',
  spark:   'M12 2l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  pencil:  'M3 21l1-5 11-11 4 4-11 11-5 1zM14 6l4 4',
  refresh: 'M21 12a9 9 0 11-3-6.7M21 4v5h-5',
  external:'M14 4h6v6m0-6L10 14M10 4H4v16h16v-6',
  cog:     'M12 8a4 4 0 100 8 4 4 0 000-8zm9 4l-2 1 1 2-2 2-2-1-1 2h-3l-1-2-2 1-2-2 1-2-2-1v-3l2-1-1-2 2-2 2 1 1-2h3l1 2 2-1 2 2-1 2 2 1z',
  graduation: 'M12 3l10 5-10 5L2 8l10-5zM6 11v5l6 3 6-3v-5',
  layers:  'M12 3l9 5-9 5-9-5 9-5zM3 14l9 5 9-5M3 19l9 5 9-5',
  globe:   'M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c3 3 4.5 6 4.5 9S15 18 12 21M12 3c-3 3-4.5 6-4.5 9s1.5 6 4.5 9M3 12h18',
  calendar:'M5 5h14v15H5V5zm0 5h14M9 3v4M15 3v4',
  bolt:    'M13 2L3 14h7l-1 8 10-12h-7l1-8z',
  text:    'M5 5h14v3H5zm2 6h10v2H7zm0 5h7v2H7z',
  save:    'M5 3h11l4 4v14H5V3zm3 0v6h7V3M8 14h8v6H8z'
};

function Icon({ name, size = 16, stroke = 1.6, className = '', style }) {
  const d = _ICONS[name];
  if (!d) return null;
  const isStroke = ['lang','search','user','users','book','settings','chart','link','shield','bell','home','highlighter','ruler','ear','arrowRight','arrowLeft','download','clock','fileText','refresh','external','cog','graduation','layers','globe','calendar','bolt','text','save','pencil'].includes(name);
  return (
    <svg
      className={'ico ' + className}
      width={size} height={size}
      viewBox="0 0 24 24"
      fill={isStroke ? 'none' : 'currentColor'}
      stroke={isStroke ? 'currentColor' : 'none'}
      strokeWidth={isStroke ? stroke : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

window.Icon = Icon;
