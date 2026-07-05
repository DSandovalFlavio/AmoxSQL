# AmoxSQL — Guía de Estilos CSS

> Esta guía describe el sistema de diseño de AmoxSQL. Seguirla garantiza que cualquier nuevo componente sea visualmente consistente con el resto de la app.  
> Archivo de referencia: `client/src/index.css`

---

## 1. Sistema de Tokens CSS (oklch)

Todos los colores se definen con **oklch** (perceptualmente uniforme). Las variables CSS son la única fuente de verdad de color — nunca hardcodear hex/rgb en componentes.

### 1.1 Superficies (elevación)

```css
/* De menor a mayor elevación (dark default) */
--surface-base:    oklch(0.145 0.006 270);   /* ≈ #111214 — fondo de app */
--surface-raised:  oklch(0.175 0.008 270);   /* ≈ #191B1F — cards, sidebar */
--surface-overlay: oklch(0.195 0.008 270);   /* ≈ #1F2125 — tooltips, dropdowns */
--surface-inset:   oklch(0.160 0.007 270);   /* ≈ #17181C — inputs, wells */
```

Usar la superficie correcta según la capa visual:
- **`--surface-base`**: fondo general de la ventana
- **`--surface-raised`**: componentes que "flotan" sobre el fondo (paneles, cards)
- **`--surface-overlay`**: elementos que aparecen sobre otros elementos (dropdowns, tooltips, modales)
- **`--surface-inset`**: áreas que visualmente "se hunden" (inputs, code blocks, wells)

### 1.2 Bordes

```css
--border-subtle:  rgba(255, 255, 255, 0.06);  /* divisores muy sutiles */
--border-default: rgba(255, 255, 255, 0.10);  /* bordes de inputs, cards */
--border-strong:  rgba(255, 255, 255, 0.16);  /* bordes enfatizados */
```

Los bordes son rgba para que funcionen sobre cualquier superficie.

### 1.3 Texto

```css
--text-primary:   rgba(255, 255, 255, 0.92);  /* texto principal */
--text-secondary: rgba(255, 255, 255, 0.56);  /* texto secundario, labels */
--text-muted:     rgba(255, 255, 255, 0.36);  /* texto desactivado, placeholders */
--text-disabled:  rgba(255, 255, 255, 0.20);  /* texto completamente inactivo */
```

En temas light, los valores cambian a rgba(0,0,0,...). **Siempre usar las variables**, nunca asumir dark/light.

### 1.4 Accent Colors

El color de acento se controla con `--accent-primary`. Las variantes se derivan automáticamente:

```css
--accent-primary: oklch(0.905 0.155 195);  /* cyan — valor cambia según acento */
--accent-muted:   color-mix(in oklch, var(--accent-primary) 18%, transparent);
--accent-subtle:  color-mix(in oklch, var(--accent-primary) 8%, transparent);
```

Para usar el acento en un componente:
```css
/* Fondo activo */
background: var(--accent-muted);

/* Borde activo */
border-color: color-mix(in oklch, var(--accent-primary) 40%, transparent);

/* Texto de acento */
color: var(--accent-primary);
```

---

## 2. Sistema de Theming

### 2.1 Temas Disponibles (10)

| ID | Nombre UI | Tipo | Identidad |
|----|-----------|------|-----------|
| `dark` (default) | Obsidian | Dark | Frío neutro profundo (referencia) |
| `onyx` | Onyx | Dark | Negro puro (el más profundo) |
| `carbon` | Carbon | Dark | Matiz azul-gris genuino |
| `graphite` | Graphite | Dark | Gris lápiz, cálido y más claro |
| `nord` | Nord Dark | Dark | Polar night (paleta propia) |
| `islands` | Dark Islands | Dark | Paleta propia (síntaxis cálida) |
| `light` | Light | Light | Neutro frío (referencia light) |
| `ivory` | Ivory | Light | Papel cálido |
| `mist` | Mist | Light | Azul-gris frío |
| `snow` | Snow | Light | Blanco puro, alto brillo |

### 2.2 Cómo se Aplican (arquitectura post-auditoría 2026-07)

`App.jsx` aplica **dos clases** en `<body>` vía `client/src/theme.js` (fuente única de
`isLightTheme`/`themeClassFor`/`modeClassFor` — no dupliques la lista de temas light):

```javascript
// App.jsx (simplificado)
const themeClass = themeClassFor(theme);      // 'light-theme' | 'theme-x' | null (obsidian)
if (themeClass) document.body.classList.add(themeClass);
document.body.classList.add(modeClassFor(theme)); // 'mode-light' | 'mode-dark'
```

**Capas de override en `index.css` (en este orden):**
1. `:root` — contrato completo de tokens (valores dark por defecto).
2. `.mode-light` — todo lo que depende SOLO de light-vs-dark y aplica a los 4 temas
   light: `--feedback-info*`, `--node-*`, `--icon-*`, chrome del suggest de Monaco.
   **Regla:** si escribes CSS que necesita variante light, usa `.mode-light .foo`,
   NUNCA `.light-theme .foo` (esa clase solo la lleva el tema "Light", no ivory/mist/snow).
3. `.theme-*` / `.light-theme` — cada tema toca solo: superficies, textos, bordes,
   hover/active, sombras, titlebar (y opcionalmente syntax/feedback si tiene paleta
   propia, como Nord/Islands).
4. Acentos — cada `.accent-*` fija `--accent-primary` y derivadas. El acento propio de
   Nord/Islands vive en `.theme-nord:not([class*="accent-"])` para que el acento
   elegido por el usuario SIEMPRE gane.

**Al agregar un tema nuevo:** clase `.theme-{nombre}` que sobrescriba solo superficies/
texto/bordes/estados; añadirlo a `theme.js` (LIGHT_THEMES si es light) y al picker de
SettingsModal; correr `node scripts/checkThemeContrast.cjs --all` — debe pasar los pisos
(texto: primary ≥10:1, secondary ≥5.5:1, tertiary ≥4:1 en light / ≥3:1 en dark; bordes
subtle 1.08-1.30, default 1.20-1.55, strong 1.45-2.10 vs base). Bordes SIEMPRE con alpha,
nunca opacos; en light: sombras suaves (α ≤ 0.15) y hover/active como lavados alfa.

### 2.3 Acentos (13)

Los acentos son independientes del tema y se aplican también en `<body>`:

```javascript
// App.jsx
if (accentColor !== 'cyan') {
  document.body.classList.add(`accent-${accentColor}`);
}
```

Acentos disponibles:

| ID | Color visual |
|----|-------------|
| `cyan` (default) | Cyan/turquoise |
| `amox-2` ... `amox-10` | Gradiente cyan → cobalt |
| `linear` | Linear Blue |
| `sage` | Verde salvia |
| `amber` | Ámbar |
| `rose` | Rosa |
| `lavender` | Lavanda |
| `steel` | Azul acero |
| `copper` | Cobre |

Cada acento solo sobrescribe `--accent-primary`:

```css
.accent-linear { --accent-primary: oklch(0.53 0.14 277); }
.accent-sage   { --accent-primary: oklch(0.72 0.10 155); }
.accent-amber  { --accent-primary: oklch(0.78 0.12 75);  }
```

Las derivadas (`--accent-muted`, `--accent-subtle`) se recalculan automáticamente.

---

## 3. Convenciones de Clases CSS

### 3.1 Prefijos Establecidos

| Prefijo | Scope | Ejemplos |
|---------|-------|---------|
| `stg-` | Settings Modal y sus tabs | `stg-row`, `stg-card`, `stg-btn`, `stg-label` |
| `stg-ctx-` | Settings > AI Context tab | `stg-ctx-hero`, `stg-ctx-status-card` |
| `ai-` | Componentes del chat AI | `ai-narrative`, `ai-plan-step`, `ai-message` |
| `wtb-` | Window Title Bar | `wtb-dropdown`, `wtb-btn` |

### 3.2 Regla para Features Nuevas

Antes de empezar a escribir CSS para una feature nueva, definir un prefijo corto y único:
- **Corto:** 2-4 caracteres + guión (`nb-` para notebook cell UI, `pr-` para profiler)
- **Único:** que no colisione con prefijos existentes
- **Consistente:** todos los elementos del feature comparten el mismo prefijo

```css
/* ✅ Bien: prefijado, consistente */
.nb-cell { ... }
.nb-cell-header { ... }
.nb-cell-body { ... }
.nb-cell--active { ... }

/* ❌ Mal: sin prefijo, colisiones posibles */
.cell { ... }
.cell-header { ... }
.active { ... }
```

### 3.3 Modificadores BEM-Lite

Para estados y variantes, usar doble guión:

```css
.stg-btn           { /* base */ }
.stg-btn--primary  { /* variante de color */ }
.stg-btn--sm       { /* variante de tamaño */ }
.stg-btn--disabled { /* estado */ }
```

---

## 4. DO's y DON'Ts

### ✅ DO — Siempre hacer esto

**Usar variables CSS para todos los colores:**
```css
/* ✅ */
color: var(--text-primary);
background: var(--surface-raised);
border: 1px solid var(--border-default);
```

**Derivar variantes con `color-mix(in oklch, ...)`:**
```css
/* ✅ Hover state del accent */
background: color-mix(in oklch, var(--accent-primary) 15%, transparent);

/* ✅ Borde sutil del accent */
border-color: color-mix(in oklch, var(--accent-primary) 35%, transparent);
```

**Usar oklch para nuevos colores semánticos (status, alertas):**
```css
/* ✅ Color de éxito */
--color-success: oklch(0.72 0.18 145);  /* verde */
--color-warning: oklch(0.80 0.15 75);   /* ámbar */
--color-error:   oklch(0.60 0.22 25);   /* rojo */
```

**Prefixar clases con el nombre del componente/feature:**
```css
/* ✅ */
.ctx-file-dot { ... }
.ctx-file-name { ... }
```

**Usar `transition` solo en propiedades que lo necesitan:**
```css
/* ✅ */
transition: background 0.12s, border-color 0.12s;
```

---

### ❌ DON'T — Nunca hacer esto

**Hardcodear colores hex/rgb en componentes UI:**
```css
/* ❌ */
color: #ffffff;
background: #1a1b1e;
border: 1px solid rgba(255, 255, 255, 0.1);

/* ✅ En su lugar */
color: var(--text-primary);
background: var(--surface-raised);
border: 1px solid var(--border-default);
```

**Excepción:** La paleta de Monaco Editor en `SqlEditor.jsx` usa hex porque Monaco no acepta variables CSS. Ese es el único lugar permitido.

---

**Usar `@media` breakpoints:**
```css
/* ❌ AmoxSQL es desktop-only */
@media (max-width: 768px) { ... }

/* ✅ Usar flexbox con min-width/max-width en px absolutos si necesitas límites */
.sidebar { min-width: 200px; max-width: 480px; }
```

---

**Introducir virtualización de listas o tablas:**
```javascript
// ❌ NUNCA
import { useVirtualizer } from '@tanstack/react-virtual';

// ✅ Usar paginación (ver ResultsTable.jsx)
const [currentPage, setCurrentPage] = useState(1);
const [pageSize] = useState(50);
```

---

**Asumir que un ícono Lu\* existe sin verificar:**
```javascript
// ❌ Puede no existir en esta versión de react-icons
import { LuHelpCircle } from 'react-icons/lu';  // ← no existe

// ✅ Verificar primero con el script de validación (ver docs/dev/README.md)
import { LuCircleHelp } from 'react-icons/lu';  // ← correcto
```

---

**Usar `transition: all`:**
```css
/* ❌ Anima propiedades que no lo necesitan, causa repaints innecesarios */
transition: all 0.2s;

/* ✅ Solo las propiedades específicas */
transition: background 0.15s, opacity 0.15s;
```

---

## 5. Monaco Editor Theming

Monaco no acepta variables CSS, así que se resuelven en runtime. Desde la auditoría
2026-07, TODO el theming de Monaco vive en **`client/src/monacoTheme.js`** (fuente única
— SqlEditor/MarkdownEditor/DeckEditor ya no definen temas propios):

- Hay **UN solo tema Monaco** llamado `amox`, reconstruido siempre desde las CSS vars
  vivas del tema + acento activos (`buildAmoxMonacoTheme` → `cssVarToHex` con un probe
  en `document.body`).
- **`App.jsx` lo re-sincroniza** llamando `syncMonacoTheme()` en los MISMOS effects que
  aplican las clases de tema y acento al body. `setTheme` de Monaco es global: un tema
  de app ⇒ un tema de Monaco, en todos los editores montados a la vez.
- Los editores solo hacen `registerMonaco(monaco)` en su `beforeMount` y usan
  `theme={MONACO_THEME_NAME}` en el `<Editor>`.
- El `FALLBACK` hex del módulo es SOLO para el primer paint si una var no resuelve —
  no es fuente de verdad; los colores reales salen siempre de `index.css`.

### 5.2 Cuándo Actualizar

Al agregar un tema nuevo NO hay que tocar `monacoTheme.js`: el editor toma los tokens
(`--surface-*`, `--syntax-*`, `--accent-primary`) automáticamente. Si el editor se ve
mal en un tema, el bug está en los tokens de ese tema en `index.css`, no en Monaco.

---

## 6. Variables de Espaciado y Radio

```css
--radius-sm:   4px;
--radius-md:   6px;
--radius-lg:   8px;
--radius-xl:   12px;
--radius-full: 9999px;
```

Usar estas variables para border-radius. No inventar nuevos valores de radio.

Para espaciado hay una escala `--space-1`…`--space-12` (múltiplos de 4px: 4, 8, 12, 16, 20, 24, 32, 40, 48). Usarla; si no, múltiplos de 4px.

---

## 7. Sistema de Motion (animaciones)

AmoxSQL es app de escritorio: **sin librerías de animación**, solo CSS, snappy por defecto.
Toda duración/curva sale de tokens en `:root` — **no hardcodear `200ms ease`**.

```css
/* Curvas */
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);   /* enter/reveal */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* move/morph */
--ease-spring: cubic-bezier(0.16, 1, 0.3, 1);    /* paneles, overshoot suave */

/* Duraciones */
--duration-instant: 80ms;   --duration-fast: 120ms;
--duration-base:    200ms;  --duration-slow: 320ms;

/* Transiciones compuestas (úsalas en hover/focus) */
--transition-fast: var(--duration-fast) var(--ease-out);
--transition-base: var(--duration-base) var(--ease-out);
--transition-slow: var(--duration-slow) var(--ease-spring);
```

**Reglas:**
- Para una transición nueva: `transition: background var(--transition-fast);` — nunca `120ms ease` a mano.
- Spinners: clase `.amox-spin` o `animation: spin <dur> linear infinite` (keyframe `spin` único, definido una vez).
- Entradas reusables: `.amox-fade-in`, `.amox-fade-rise`, `.tree-reveal`.
- **Accesibilidad:** el bloque global `@media (prefers-reduced-motion: reduce)` ya neutraliza el movimiento app-wide — no hace falta repetirlo por componente.
- Foco de teclado: hay un anillo global `:focus-visible` (token `--focus-ring`). No re-inventar outlines salvo necesidad real.

### 7.1 Onboarding / Tours

Todo tour o guía "?" usa la **primitiva única** `components/onboarding/`:
- `Tour.jsx` — carrusel (overlay + pasos + progreso + teclado). No crear carruseles a mano.
- `GuideModal.jsx` — modal de la guía de referencia.
- `tourRegistry.js` — catálogo central. **Para un tour nuevo:** crea el contenido en `onboarding/content/`, regístralo en `tourRegistry.js`, y dispáralo en first-run con `openTour('<id>')`. El `OnboardingHost` global (en `App.jsx`) lo renderiza y persiste el "visto"; aparece solo en el Command Palette ("Help & Tours").

---

## 7.2 Patrón canónico de paneles del sidebar

Todos los paneles del sidebar izquierdo (Files, DB Schema, Extensions, DBT,
Snippets, History, Vault, Git, Conversations…) comparten una cabecera estándar.
**No reinventar** tamaños/paddings por panel — reutilizar estas clases:

```text
.sidebar-header        cabecera: padding 8px 14px, título uppercase --text-xs,
                       weight semibold, color --text-tertiary, flex space-between
.fe-header-actions     contenedor de acciones (gap 2px) a la derecha
.fe-header-btn         botón de acción de icono: 24×24, radius --radius-sm,
                       hover bg --hover-bg
.fe-search             wrapper relativo de búsqueda (dentro de una sección con
                       padding 8px 14px y border-bottom)
.fe-search-icon        icono de búsqueda (absolute, left 8px)
.fe-search-input       input: padding 5px 8px 5px 26px, --text-xs, radius --radius-md,
                       border --border-subtle, bg --surface-inset
```

Convenciones:
- Icono del título: **14px**. Icono dentro de botón de acción: **13px**.
- Si un panel tiene clases propias por razones históricas (`db-*`, `vault-*`,
  `git-*`, `dbt-*`), sus valores deben **igualar** a los de arriba (ya alineados).
- Sub-navegación opcional (DBT/History) va en una fila aparte bajo la cabecera.
- **Contenido scrollable**: el contenedor de lista lleva `padding: 6px 0` para que el
  primer elemento no quede pegado a la línea del buscador (igual en todos los paneles:
  `file-list`, `db-tree`, `vault-list`, `ai-conv-list`, History, Snippets).

### 7.3 Control segmentado (tabs y filtros)

**Un solo lenguaje**, estilo Linear: fondo sutil en el activo, radio pequeño.
**Nunca píldoras 999px** para tabs/filtros (el radio completo se reserva a badges,
contadores y avatars).

```text
.seg-wrap          padding 8px 14px 0 (envoltorio)
.seg               track: fondo --surface-inset, radio --radius-lg, padding 3px
.seg--fill         items con flex:1 (p.ej. 2 tabs a ancho igual)
.seg-item          tab: --text-xs, radio --radius-sm; activo = .seg-item--active
.seg-item--active  fondo --accent-muted + texto --accent-primary
.seg-chips         fila de filtros (gap 6px, wrap)
.seg-chip          filtro: borde --border-subtle, radio --radius-md (NO píldora)
.seg-chip--active  fondo --accent-muted + borde/texto acento
```
Tabs exclusivas (History, DBT) → `.seg`. Filtros independientes (Extensions) → `.seg-chip`.

### 7.4 Cuándo va una línea divisoria

**Solo el header** lleva `border-bottom` (separa el chrome del panel del contenido).
La búsqueda, filtros, stats y tabs **NO** llevan borde propio — se separan con
espacio y etiquetas de sección (`FOLDERS`, `YESTERDAY`). Esto mantiene los paneles
limpios (referencia: Deep Dive / Conversations).

**La búsqueda va SIEMPRE justo bajo el header** (antes que tabs/filtros). Orden
canónico: header → búsqueda → tabs/filtros → contenido. Sección de búsqueda con
`padding: 14px 14px 8px` para que el hueco con el divisor de arriba iguale al de
abajo (el contenido aporta sus 6px de `padding-top`).

### 7.5 Filas de lista y sus opciones

Referencia: **File Explorer**. Fila: `padding 6px 8px; margin 1px 6px; radius --radius-md`.
**Label primario del item: `--text-base` (13px)** en todos los paneles (Files, DB,
Conversations, Vault, Extensions). Texto secundario (contadores, tipos, fechas,
columnas anidadas, previews) puede ser menor — eso es jerarquía, no inconsistencia.
Las opciones de cada objeto se exponen con un **kebab (3 puntos) SIEMPRE visible**
(`LuEllipsisVertical`) que abre un menú contextual (clases globales `.context-menu-item`),
no iconos ocultos tras el hover. Indicadores de estado (p.ej. estrella) van siempre visibles.

### 7.6 Cabecera de modal canónica

Referencia: **el modal de Settings** (proporciones que gustan). Para que los
modales centrales/full-screen no se vean "con zoom", su cabecera usa:

```text
.amox-modal-header   altura fija 48px, padding 0 16px 0 20px, border-bottom
.amox-modal-title    --text-md (14px) semibold, icono 16px, con ellipsis
.amox-modal-close    botón 6px + radio --radius-sm, icono X de 18px, hover bg
```

Reglas: título a **--text-md** (no 18px+), icono del título **16px**, X **18px**
dentro de un botón con hover (NO una X suelta de 24px). Diálogos compactos (p. ej.
Execution Chain) no usan la barra de 48px pero sí `.amox-modal-close`.
**Una sola cabecera por modal** (ojo con dobles títulos como tenía Chart Gallery).

---

## 8. Scrollbars Personalizadas

AmoxSQL tiene scrollbars personalizadas en toda la app:

```css
/* index.css — aplicado globalmente */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--border-strong); }
```

Los contenedores con scroll deben tener `overflow: auto` o `overflow-y: auto` — las scrollbars se aplican automáticamente.
