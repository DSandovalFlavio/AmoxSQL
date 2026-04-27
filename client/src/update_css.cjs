const fs = require('fs');
const path = 'c:\\Users\\flavi\\Documents\\Proyectos\\antigravity_projects\\AmoxSQL\\client\\src\\index.css';
let css = fs.readFileSync(path, 'utf8');

const snowTheme = `
/* ═══════════════════════════════════════════════
   LIGHT THEME: SNOW
   Clean, crisp, high-contrast light theme.
   ═══════════════════════════════════════════════ */
.theme-snow {
  --surface-base:    #ffffff;
  --surface-raised:  #f9fafb;
  --surface-overlay: #ffffff;
  --surface-inset:   #f3f4f6;

  --border-subtle:  #e5e7eb;
  --border-default: #d1d5db;
  --border-strong:  #9ca3af;

  --text-primary:   #111827;
  --text-secondary: #374151;
  --text-tertiary:  #6b7280;
  --text-disabled:  #9ca3af;

  --accent-primary: #2563eb;
  --accent-muted:   rgba(37, 99, 235, 0.15);
  --accent-subtle:  rgba(37, 99, 235, 0.06);
  --focus-ring:     rgba(37, 99, 235, 0.3);
  --accent-color-user: var(--accent-primary);
  --accent-color-user-transparent: var(--accent-subtle);

  --hover-bg:   #f3f4f6;
  --active-bg:  #e5e7eb;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  --titlebar-bg: #f9fafb;
  --titlebar-text: #4b5563;

  --feedback-success:        #059669;
  --feedback-success-bg:     #d1fae5;
  --feedback-success-border: #a7f3d0;
  --feedback-success-text:   #047857;
  --feedback-error:          #dc2626;
  --feedback-error-bg:       #fee2e2;
  --feedback-error-border:   #fecaca;
  --feedback-error-text:     #b91c1c;
  --feedback-warning:        #d97706;
  --feedback-warning-bg:     #fef3c7;
  --feedback-warning-border: #fde68a;
  --feedback-warning-text:   #b45309;
  --color-destructive:       #dc2626;
  --color-destructive-bg:    #fee2e2;
  --color-destructive-text:  #b91c1c;

  --syntax-keyword:   #2563eb;
  --syntax-string:    #059669;
  --syntax-number:    #d97706;
  --syntax-function:  #7c3aed;
  --syntax-comment:   #9ca3af;
  --syntax-type:      #0891b2;
  --syntax-operator:  #4b5563;
  --syntax-variable:  #111827;
  --syntax-constant:  #059669;

  --type-integer:  #2563eb;
  --type-float:    #0891b2;
  --type-text:     #d97706;
  --type-datetime: #7c3aed;
  --type-boolean:  #059669;
  --type-default:  #4b5563;

  --bg-color: var(--surface-base);
  --sidebar-bg: var(--surface-raised);
  --editor-bg: var(--surface-base);
  --text-color: var(--text-secondary);
  --text-active: var(--text-primary);
  --text-muted: var(--text-tertiary);
  --sidebar-item-active-bg: var(--active-bg);
  --border-color: var(--border-default);
  --header-bg: var(--surface-raised);
  --input-bg: var(--surface-inset);
  --button-text-color: #ffffff;
  --sidebar-item-active-text: var(--accent-primary);
  --panel-bg: var(--surface-raised);
  --panel-section-bg: var(--surface-inset);
  --chart-bg: var(--surface-base);
  --grid-color: rgba(0, 0, 0, 0.05);
  --tooltip-bg: var(--surface-overlay);
  --table-header-bg: #f3f4f6;
  --table-row-hover: #f9fafb;
}

/* ═══════════════════════════════════════════════
   LIGHT THEME ACCENT PRESETS`;

css = css.replace(/\/\* ═══════════════════════════════════════════════\r?\n\s*LIGHT THEME ACCENT PRESETS/g, snowTheme);
css = css.replace(/\.theme-mist\.accent-([A-Za-z0-9-]+)\s*\{/g, '.theme-mist.accent-$1,\n.theme-snow.accent-$1 {');

fs.writeFileSync(path, css, 'utf8');
console.log('index.css updated successfully.');
