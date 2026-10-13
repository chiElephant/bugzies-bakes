import { useState } from 'react';

/** Image that falls back to a soft tinted placeholder when missing. */
export function Photo({ src, alt, className = '', placeholderClass = '' }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`photo-ph ${placeholderClass} ${className}`} role="img" aria-label={alt}>
        <Icon name="whisk" size={40} />
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} loading="lazy" onError={() => setBroken(true)} />;
}

export function Stepper({ value, onChange, min = 0, max = 500, label = 'Quantity' }) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <input
        type="number" inputMode="numeric" aria-label={label} value={value} min={min} max={max}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
      />
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Wavy edge between sections. `flip` draws it along the bottom. */
export function Wave({ color, flip = false, variant = 0 }) {
  const paths = [
    'M0,32 C180,0 320,56 520,30 C720,4 880,52 1060,28 C1180,12 1260,20 1440,34 L1440,60 L0,60 Z',
    'M0,22 C160,50 340,6 560,26 C760,44 940,8 1140,26 C1260,36 1350,30 1440,18 L1440,60 L0,60 Z',
  ];
  return (
    <svg className="wave" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true"
      style={flip ? { transform: 'scaleY(-1)' } : undefined}>
      <path d={paths[variant % paths.length]} fill={color} />
    </svg>
  );
}

export function Blob({ color, style, variant = 0 }) {
  const d = [
    'M421,296Q389,342,346,383Q303,424,240,437Q177,450,131,404Q85,358,62,299Q39,240,63,183Q87,126,138,91Q189,56,252,54Q315,52,368,92Q421,132,437,186Q453,240,421,296Z',
    'M404,302Q388,364,330,394Q272,424,206,418Q140,412,96,360Q52,308,58,240Q64,172,108,120Q152,68,222,64Q292,60,346,104Q400,148,410,194Q420,240,404,302Z',
    'M432,286Q378,332,350,384Q322,436,254,424Q186,412,134,376Q82,340,70,272Q58,204,96,148Q134,92,198,74Q262,56,320,88Q378,120,432,180Q486,240,432,286Z',
  ][variant % 3];
  return (
    <svg className="blob" viewBox="0 0 500 500" style={style} aria-hidden="true">
      <path d={d} fill={color} />
    </svg>
  );
}

/** Little "burst" dashes like in the mockup's logo and headings. */
export function Bursts({ side = 'left', style }) {
  const s = side === 'left' ? 1 : -1;
  return (
    <svg viewBox="0 0 40 60" width="40" height="60" style={{ transform: `scaleX(${s})`, ...style }} aria-hidden="true">
      <g strokeLinecap="round" strokeWidth="5" fill="none">
        <path d="M8 8 L22 18" stroke="#F7C34B" />
        <path d="M4 30 H24" stroke="#EE7F8E" />
        <path d="M8 52 L22 42" stroke="#4DB39C" />
      </g>
    </svg>
  );
}

export function HeartDoodle({ size = 40, style, color = 'currentColor' }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={style} aria-hidden="true" className="heart-doodle">
      <path d="M24 40 C10 30 6 22 8 15 C10 8 19 7 24 16 C29 7 38 8 40 15 C42 22 38 30 24 40 Z"
        fill="none" stroke={color} strokeWidth="3.4" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M24 40 C12 31 9 23 11 17" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  cart: <><path d="M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20.5" r="1.3" /><circle cx="17.5" cy="20.5" r="1.3" /></>,
  menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  leaf: <><path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15" /><path d="M5 19c3-4 6-7 10-9" /></>,
  heart: <path d="M12 20s-7.5-4.6-9-9.4C1.9 7 4.2 4 7.4 4c2 0 3.6 1.2 4.6 2.8C13 5.2 14.6 4 16.6 4 19.8 4 22.1 7 21 10.6 19.5 15.4 12 20 12 20z" />,
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></>,
  smile: <><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1.8 2 5.2 2 7 0" /><path d="M9 9.5h.01" /><path d="M15 9.5h.01" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 7 8 6 8-6" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17 7h.01" /></>,
  facebook: <path d="M14 8.5h2.5V5H14c-2.2 0-3.5 1.5-3.5 3.8V11H8v3.5h2.5V21H14v-6.5h2.6L17 11h-3V9.2c0-.5.3-.7.7-.7z" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  truck: <><path d="M2.5 6.5h11v9h-11z" /><path d="M13.5 9.5h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></>,
  bag: <><path d="M5 8h14l-1 12H6z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>,
  whisk: <><path d="M14 10 21 3" /><path d="M14 10c-3-3-8-4-10-2s-1 7 2 10 8 4 10 2 1-7-2-10z" /><path d="M14 10c-2 0-5 1-6 3" /><path d="M14 10c0 2-1 5-3 6" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  tag: <><path d="M3.5 12.5V4.5h8l9 9-8 8z" /><circle cx="8" cy="9" r="1.4" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  trash: <><path d="M4 7h16" /><path d="M9.5 7V4.5h5V7" /><path d="M6 7l1 13h10l1-13" /></>,
  edit: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  cookie: <><circle cx="12" cy="12" r="9" /><path d="M9 9h.01" /><path d="M14.5 8.5h.01" /><path d="M15 14h.01" /><path d="M9.5 15h.01" /><path d="M12 12h.01" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 17l-5-5 5-5" /><path d="M5 12h11" /></>,
  external: <><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
};

export function Icon({ name, size = 24, stroke = 2, style, className }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={style} className={className}>
      {ICONS[name]}
    </svg>
  );
}

export function Logo({ name = "Bugzie's Bakes", size = 'md' }) {
  const [first, ...rest] = name.split(' ');
  const second = rest.join(' ');
  const h = size === 'lg' ? 120 : 54;
  return (
    <svg viewBox="0 0 220 110" height={h} role="img" aria-label={name}>
      <g strokeLinecap="round" strokeWidth="5" fill="none">
        <path d="M14 46 L26 52" stroke="#F7C34B" /><path d="M10 64 H24" stroke="#EE7F8E" /><path d="M14 82 L26 76" stroke="#4DB39C" />
        <path d="M206 46 L194 52" stroke="#4DB39C" /><path d="M210 64 H196" stroke="#EE7F8E" /><path d="M206 82 L194 76" stroke="#F7C34B" />
      </g>
      <g fontFamily="'Baloo 2', Nunito, sans-serif" fontWeight="800" fill="#4A2A1F" textAnchor="middle">
        <text x="104" y="48" fontSize="44" transform="rotate(-6 104 40)">{first}</text>
        <text x="118" y="96" fontSize="44" transform="rotate(-3 118 84)">{second}</text>
      </g>
    </svg>
  );
}
