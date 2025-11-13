import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const srcDir = path.join(rootDir, 'src');
const includeFiles = ['index.html'];

const responsive = {
  sm: '@media (min-width: 640px)',
  md: '@media (min-width: 768px)',
  lg: '@media (min-width: 1024px)',
};

const pseudoVariants = {
  hover: ':hover',
  focus: ':focus',
  'focus-visible': ':focus-visible',
  disabled: ':disabled',
};

const spacing = {
  '0': '0rem',
  '0.5': '0.125rem',
  '1': '0.25rem',
  '1.5': '0.375rem',
  '2': '0.5rem',
  '2.5': '0.625rem',
  '3': '0.75rem',
  '4': '1rem',
  '5': '1.25rem',
  '6': '1.5rem',
  '8': '2rem',
  '10': '2.5rem',
};

const sizeScale = {
  3: '0.75rem',
  4: '1rem',
  8: '2rem',
  10: '2.5rem',
  14: '3.5rem',
  32: '8rem',
  72: '18rem',
};

const colors = {
  'emerald-50': '#ecfdf3',
  'emerald-100': '#d1fae5',
  'emerald-200': '#a7f3d0',
  'emerald-300': '#6ee7b7',
  'emerald-400': '#34d399',
  'emerald-500': '#10b981',
  'emerald-600': '#059669',
  'emerald-700': '#047857',
  'emerald-800': '#065f46',
  'emerald-900': '#064e3b',
  'slate-50': '#f8fafc',
  'slate-100': '#f1f5f9',
  'slate-200': '#e2e8f0',
  'slate-300': '#cbd5f5',
  'slate-400': '#94a3b8',
  'slate-500': '#64748b',
  'slate-600': '#475569',
  'slate-700': '#334155',
  'slate-800': '#1e293b',
  'slate-900': '#0f172a',
  'rose-50': '#fff1f2',
  'rose-100': '#ffe4e6',
  'rose-200': '#fecdd3',
  'rose-500': '#f43f5e',
  'rose-700': '#be123c',
  'rose-900': '#881337',
  'amber-50': '#fffbeb',
  'amber-100': '#fef3c7',
  'amber-900': '#78350f',
  white: '#ffffff',
};

const fontSizes = {
  'text-xs': { size: '0.75rem', lineHeight: '1rem' },
  'text-sm': { size: '0.875rem', lineHeight: '1.25rem' },
  'text-base': { size: '1rem', lineHeight: '1.5rem' },
  'text-lg': { size: '1.125rem', lineHeight: '1.75rem' },
  'text-xl': { size: '1.25rem', lineHeight: '1.75rem' },
  'text-2xl': { size: '1.5rem', lineHeight: '2rem' },
  'text-3xl': { size: '1.875rem', lineHeight: '2.25rem' },
};

const maxWidths = {
  'max-w-md': '28rem',
  'max-w-lg': '32rem',
  'max-w-5xl': '64rem',
  'max-w-6xl': '72rem',
};

const shadowMap = {
  'shadow-sm': '0 1px 2px 0 rgba(15,23,42,0.05)',
  'shadow-md': '0 4px 6px -1px rgba(15,23,42,0.1),0 2px 4px -2px rgba(15,23,42,0.1)',
  'shadow-lg': '0 10px 15px -3px rgba(15,23,42,0.1),0 4px 6px -4px rgba(15,23,42,0.05)',
  'shadow-xl': '0 20px 25px -5px rgba(15,23,42,0.1),0 8px 10px -6px rgba(15,23,42,0.1)',
  'shadow-2xl': '0 25px 50px -12px rgba(15,23,42,0.25)',
  'shadow-inner': 'inset 0 2px 4px 0 rgba(15,23,42,0.06)',
};

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function shouldScan(file) {
  return /(\.jsx|\.js|\.tsx|\.ts|\.html)$/.test(file);
}

function allowedToken(token) {
  if (!token) return false;
  if (token === 'className') return false;
  return token.includes('-') || token.includes(':') || token.startsWith('bg') || token.startsWith('text') || token.startsWith('flex') || token.startsWith('grid');
}

function collectClasses() {
  const set = new Set();
  const files = walk(srcDir).concat(includeFiles.map((file) => path.join(rootDir, file)));
  const patterns = [
    /className\s*=\s*"([^"]+)"/g,
    /className=\{`([^`]+)`\}/g,
    /className\s*=\s*'([^']+)'/g,
    /=\s*'([^']+)'/g,
  ];
  for (const file of files) {
    if (!shouldScan(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content))) {
        const chunk = match[1];
        if (!chunk || chunk.includes('${')) continue;
        chunk
          .replace(/\n/g, ' ')
          .split(/\s+/)
          .forEach((token) => {
            const cleaned = token.replace(/^["'`]/, '').replace(/["'`]$/, '');
            if (allowedToken(cleaned)) set.add(cleaned);
          });
      }
    }
  }
  return Array.from(set).sort();
}

function escapeClass(cls) {
  return cls.replace(/([!"#$%&'()*+,./:;<=>?@\[\]^`{|}~])/g, '\\$1');
}

function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function colorValue(token) {
  if (!token) return null;
  if (token.includes('/')) {
    const [base, percent] = token.split('/');
    const hex = colors[base] || '#ffffff';
    return rgba(hex, Number(percent) / 100);
  }
  return colors[token] || null;
}

function buildBaseRule(base) {
  switch (base) {
    case 'absolute':
    case 'fixed':
    case 'relative':
    case 'sticky':
      return `position:${base};`;
    case 'block':
      return 'display:block;';
    case 'flex':
      return 'display:flex;';
    case 'inline-flex':
      return 'display:inline-flex;';
    case 'grid':
      return 'display:grid;';
    case 'flex-col':
      return 'flex-direction:column;';
    case 'flex-row':
      return 'flex-direction:row;';
    case 'flex-wrap':
      return 'flex-wrap:wrap;';
    case 'flex-1':
      return 'flex:1 1 0%;';
    case 'flex-shrink-0':
      return 'flex-shrink:0;';
    case 'items-center':
      return 'align-items:center;';
    case 'items-start':
      return 'align-items:flex-start;';
    case 'items-end':
      return 'align-items:flex-end;';
    case 'justify-center':
      return 'justify-content:center;';
    case 'justify-between':
      return 'justify-content:space-between;';
    case 'justify-end':
      return 'justify-content:flex-end;';
    case 'align-top':
      return 'vertical-align:top;';
    case 'min-h-screen':
      return 'min-height:100vh;';
    case 'min-w-full':
      return 'min-width:100%;';
    case 'h-full':
      return 'height:100%;';
    case 'w-full':
      return 'width:100%;';
    case 'overflow-hidden':
      return 'overflow:hidden;';
    case 'overflow-x-auto':
      return 'overflow-x:auto;';
    case 'mx-auto':
      return 'margin-left:auto;margin-right:auto;';
    case 'cursor-not-allowed':
      return 'cursor:not-allowed;';
    case 'uppercase':
      return 'text-transform:uppercase;';
    case 'outline':
      return 'outline-style:solid;';
    case 'outline-none':
      return 'outline:2px solid transparent;';
    case 'outline-2':
      return 'outline-width:2px;';
    case 'outline-offset-2':
      return 'outline-offset:2px;';
    case 'text-left':
      return 'text-align:left;';
    case 'text-right':
      return 'text-align:right;';
    case 'text-center':
      return 'text-align:center;';
    case 'font-bold':
      return 'font-weight:700;';
    case 'font-black':
      return 'font-weight:900;';
    case 'font-semibold':
      return 'font-weight:600;';
    case 'font-mono':
      return "font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', monospace;";
    case 'tracking-tight':
      return 'letter-spacing:-0.02em;';
    case 'tracking-wide':
      return 'letter-spacing:0.05em;';
    case 'tracking-widest':
      return 'letter-spacing:0.1em;';
    case 'transition':
      return 'transition:all 200ms cubic-bezier(0.4,0,0.2,1);';
    case 'transition-all':
      return 'transition-property:all;';
    case 'backdrop-blur':
      return 'backdrop-filter:blur(16px);';
    case 'inset-0':
      return 'inset:0;';
    case 'inset-x-4':
      return 'left:1rem;right:1rem;';
    case 'top-0':
      return 'top:0;';
    case 'bottom-0':
      return 'bottom:0;';
    case 'left-4':
      return 'left:1rem;';
    case 'right-4':
      return 'right:1rem;';
  }
  if (fontSizes[base]) {
    const { size, lineHeight } = fontSizes[base];
    return `font-size:${size};line-height:${lineHeight};`;
  }
  if (maxWidths[base]) {
    return `max-width:${maxWidths[base]};`;
  }
  if (base.startsWith('text-')) {
    const color = colorValue(base.replace('text-', ''));
    return color ? `color:${color};` : null;
  }
  if (base.startsWith('bg-')) {
    const color = colorValue(base.replace('bg-', ''));
    if (!color) {
      if (base === 'bg-gradient-to-b') {
        return 'background-image:linear-gradient(to bottom,var(--tw-gradient-from,transparent),var(--tw-gradient-to,transparent));';
      }
      return null;
    }
    return `background-color:${color};`;
  }
  if (base.startsWith('from-')) {
    const color = colorValue(base.replace('from-', ''));
    return color ? `--tw-gradient-from:${color};--tw-gradient-to:${color}00;` : null;
  }
  if (base.startsWith('to-')) {
    const color = colorValue(base.replace('to-', ''));
    return color ? `--tw-gradient-to:${color};` : null;
  }
  if (base.startsWith('border-')) {
    const color = colorValue(base.replace('border-', ''));
    return color ? `border-color:${color};` : null;
  }
  if (base.startsWith('outline-')) {
    const color = colorValue(base.replace('outline-', ''));
    return color ? `outline-color:${color};` : null;
  }
  if (base === 'border') return 'border-width:1px;border-style:solid;';
  if (base === 'border-b') return 'border-bottom-width:1px;border-style:solid;';
  if (base === 'border-t') return 'border-top-width:1px;border-style:solid;';
  if (base === 'border-dashed') return 'border-style:dashed;';
  if (base.startsWith('divide-')) {
    const color = colorValue(base.replace('divide-', ''));
    return color ? `--tw-divide-color:${color};` : null;
  }
  if (base.startsWith('opacity-')) {
    const value = Number(base.split('-')[1]) / 100;
    return Number.isFinite(value) ? `opacity:${value};` : null;
  }
  const shadow = shadowMap[base];
  if (shadow) {
    return `--tw-shadow:${shadow};box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),${shadow};`;
  }
  if (base.startsWith('shadow-emerald')) {
    const color = colorValue(base.replace('shadow-', ''));
    return color ? `--tw-shadow-color:${color};` : null;
  }
  if (base.startsWith('ring-emerald')) {
    const color = colorValue(base.replace('ring-', ''));
    return color ? `--tw-ring-color:${color};` : null;
  }
  if (base === 'ring-2') {
    return '--tw-ring-offset-shadow:0 0 0 var(--tw-ring-offset-width,0px) var(--tw-ring-offset-color,#fff);--tw-ring-shadow:0 0 0 calc(2px + var(--tw-ring-offset-width,0px)) var(--tw-ring-color,rgba(16,185,129,0.4));box-shadow:var(--tw-ring-offset-shadow),var(--tw-ring-shadow),var(--tw-shadow,0 0 #0000);';
  }
  const paddingMatch = base.match(/^p([trblxy]?)-([\d.]+)$/);
  if (paddingMatch) {
    const dir = paddingMatch[1];
    const amount = spacing[paddingMatch[2]];
    if (!amount) return null;
    const map = {
      '': ['padding'],
      x: ['padding-left', 'padding-right'],
      y: ['padding-top', 'padding-bottom'],
      t: ['padding-top'],
      b: ['padding-bottom'],
      l: ['padding-left'],
      r: ['padding-right'],
    };
    const props = map[dir] || ['padding'];
    return props.map((prop) => `${prop}:${amount};`).join('');
  }
  const marginMatch = base.match(/^m([trblxy]?)-([\d.]+)$/);
  if (marginMatch) {
    const dir = marginMatch[1];
    const amount = spacing[marginMatch[2]];
    if (!amount) return null;
    const map = {
      '': ['margin'],
      x: ['margin-left', 'margin-right'],
      y: ['margin-top', 'margin-bottom'],
      t: ['margin-top'],
      b: ['margin-bottom'],
      l: ['margin-left'],
      r: ['margin-right'],
    };
    const props = map[dir] || ['margin'];
    return props.map((prop) => `${prop}:${amount};`).join('');
  }
  const gapMatch = base.match(/^gap-([\d.]+)$/);
  if (gapMatch) {
    const amount = spacing[gapMatch[1]];
    return amount ? `gap:${amount};` : null;
  }
  const widthMatch = base.match(/^w-(\d+)/);
  if (widthMatch) {
    const value = sizeScale[Number(widthMatch[1])];
    return value ? `width:${value};` : null;
  }
  const heightMatch = base.match(/^h-(\d+)/);
  if (heightMatch) {
    const value = sizeScale[Number(heightMatch[1])];
    return value ? `height:${value};` : null;
  }
  const roundedMatch = base.match(/^rounded(?:-([\w\[\]0-9]+))?$/);
  if (roundedMatch) {
    const key = roundedMatch[1] || 'base';
    const map = {
      base: '0.25rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      full: '9999px',
      '[30px]': '30px',
    };
    const value = map[key];
    return value ? `border-radius:${value};` : null;
  }
  const zMatch = base.match(/^z-(\d+)/);
  if (zMatch) {
    return `z-index:${zMatch[1]};`;
  }
  const gridColsMatch = base.match(/^grid-cols-(\[.+\]|\d+)/);
  if (gridColsMatch) {
    const token = gridColsMatch[1];
    if (token.startsWith('[')) {
      return `grid-template-columns:${token.slice(1, -1)};`;
    }
    return `grid-template-columns:repeat(${token},minmax(0,1fr));`;
  }
  const colSpanMatch = base.match(/^col-span-(\d+)/);
  if (colSpanMatch) {
    const span = Number(colSpanMatch[1]);
    return `grid-column:span ${span} / span ${span};`;
  }
  if (base === '-translate-y-0.5') {
    return 'transform:translateY(-0.125rem);';
  }
  return null;
}

function buildSpecialRule(cls) {
  if (cls.startsWith('space-y-')) {
    const amount = spacing[cls.replace('space-y-', '')];
    if (!amount) return null;
    return {
      selector: `.${escapeClass(cls)} > :not([hidden]) ~ :not([hidden])`,
      body: `margin-top:${amount};`,
    };
  }
  if (cls === 'divide-y') {
    return {
      selector: `.${escapeClass(cls)} > :not([hidden]) ~ :not([hidden])`,
      body: 'border-top-width:1px;border-color:var(--tw-divide-color,#e5e7eb);',
    };
  }
  return null;
}

function buildRule(cls) {
  const parts = cls.split(':');
  const base = parts.pop();
  const variants = parts;
  const special = buildSpecialRule(base === cls ? cls : base);
  let selector = `.${escapeClass(cls)}`;
  let body;
  if (special && base === cls) {
    selector = special.selector;
    body = special.body;
  } else {
    body = buildBaseRule(base);
  }
  if (!body) return null;
  let pseudo = '';
  const wrappers = [];
  for (const variant of variants) {
    if (responsive[variant]) {
      wrappers.push(responsive[variant]);
    } else if (pseudoVariants[variant]) {
      pseudo += pseudoVariants[variant];
    }
  }
  const rule = `${selector}${pseudo} { ${body} }`;
  if (wrappers.length === 0) return rule;
  return wrappers
    .reverse()
    .reduce((acc, wrapper) => `${wrapper} { ${acc} }`, rule);
}

function buildCss(classes) {
  const rules = [];
  rules.push(`:root { font-family:'Inter','Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,sans-serif; color:#0f172a; background-color:#ecfdf3; --tw-shadow:0 0 #0000; --tw-ring-offset-width:0px; --tw-ring-offset-color:#fff; --tw-ring-color:rgba(16,185,129,0.35); --tw-gradient-from:transparent; --tw-gradient-to:transparent; }`);
  rules.push('body { min-height:100vh; margin:0; background-image:radial-gradient(circle at top left, rgba(16,185,129,0.15), transparent 55%), radial-gradient(circle at bottom right, rgba(34,197,94,0.1), transparent 60%), linear-gradient(180deg,#f7fdf9 0%,#ffffff 100%); color:inherit; -webkit-font-smoothing:antialiased; }');
  for (const cls of classes) {
    const rule = buildRule(cls);
    if (rule) rules.push(rule);
  }
  return rules.join('\n');
}

const classes = collectClasses();
const css = buildCss(classes);
fs.writeFileSync(path.join(srcDir, 'tailwind-lite.css'), `${css}\n`);
console.log(`Generated tailwind-lite.css with ${classes.length} classes.`);
