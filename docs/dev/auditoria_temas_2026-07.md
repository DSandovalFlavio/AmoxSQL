# Auditoría del Sistema de Temas — 2026-07-05

> Auditoría multi-agente del theming completo de AmoxSQL (10 temas, acentos, Monaco, CSS + JSX),
> motivada por 5 quejas del usuario: (1) colores hardcodeados que no reaccionan al tema,
> (2) el editor Monaco no sigue el tema de la app, (3) falta estructura semántica UX/UI del color,
> (4) los temas light no siguen el patrón de los dark (letras ilegibles, profundidad confusa,
> bordes inconsistentes), (5) temas casi duplicados.
>
> Referencia canónica: **amox-design-bible** (repo separado) — la estandarización se alinea con
> ella, no inventa un estándar paralelo. Todos los ratios de contraste son WCAG 2.x calculados;
> lightness en OKLab.

---

## 1. Resumen ejecutivo

El contrato semántico de tokens **sí existe** (`index.css:15-44`: 4 superficies, 4 textos, 3
bordes, estados, feedback derivado) y coincide con la biblia de diseño. Lo que está roto:

| # | Causa dominante | Queja que explica |
|---|-----------------|-------------------|
| 1 | **~35 tokens fantasma (~120 usos)** — variables que ningún tema define: paneles sin fondo/borde HOY en todos los temas (chains), hovers muertos, botones transparentes | (1) y parte de (4) |
| 2 | **Monaco tiene 2 slots globales de tema para 10 temas de app**, poblados con "fotos" de tokens tomadas en momentos dispersos; solo SqlEditor re-sincroniza y las celdas del notebook ni reciben la prop | (2) |
| 3 | **Falta la capa de MODO (dark/light)**: 22 tokens dark se cuelan en ivory/mist/snow (nodos negros, info-text 2.2:1, iconos/scrollbars invisibles); doble vocabulario legacy/v2 (700+ usos legacy); bug de cascada que anula acentos según el ORDEN del archivo | (3) |
| 4 | **Light descalibrado**: ivory/mist con `text-tertiary` a 2.5-3.0:1 (el nivel MÁS usado: 625 usos) y bordes más débiles que los dark; snow al revés (bordes opacos 2-4× más duros, hover/active opacos, jerarquía aplanada) | (4) |
| 5 | **Casi-duplicados cuantificados**: onyx≈carbon (ΔL medio 0.007) e ivory≈mist (0.006) | (5) |

---

## 2. Bugs activos HOY (tokens fantasma + gap de clase light)

Lo más urgente no es estético — es funcionalidad rota en TODOS los temas:

- **CSS de chains** (index.css ~13750-14500): validación, template gallery, preview e history
  escritos contra `--surface-1/2/3`, `--border`, `--radius` **que no existen** → paneles sin
  fondo y sin borde (un shorthand `border: 1px solid var(--border)` inválido resetea el borde).
- **`--sidebar-item-hover-bg`** (15 usos, paneles AI/History/Audit): hovers muertos.
- **`--button-bg-primary/secondary`** (7 usos): botones Open/Cancel de 6 modales transparentes.
- **`--surface-primary/default/secondary/elevated`, `--bg-base/secondary/tertiary`,
  `--surface-hover`, `--accent-secondary`, `--error/--success/--warning`** y más: ~20 nombres
  fantasma extra en EditorPane, ai-edit-proposal, SkillsPanel, StoryPanel, ErDiagram, SqlBlock,
  modales. Inventario completo con file:line en el reporte del agente (sección 4 del barrido).
- **Gap estructural**: `App.jsx:240-247` nunca añade la clase `light-theme` a ivory/mist/snow →
  toda regla `.light-theme .foo` (scrollbar claro :8390, codicons de Monaco :8488) **no aplica
  en 3 de los 4 temas light** → scrollbars invisibles e iconos dark en el autocompletado.
- **Fallbacks disfrazados**: `var(--accent-warning, #d2a106)` y familia (`--error-color`,
  `--git-*`, `--color-danger`…) — el fallback aplica SIEMPRE; hardcode con esmoquin.

## 3. Monaco — causa raíz

Monaco solo registra `duckdb-dark`/`duckdb-light` (2 slots **globales**) y su contenido es una
foto de los CSS vars del momento en que algún editor montó:

1. `buildMonacoTheme(isDark)` lee siempre los tokens del tema VIVO; en `beforeMount` se definen
   AMBOS slots con ellos → el slot del modo contrario queda **envenenado** (montar en onyx deja
   `duckdb-light` con superficies oscuras). SqlEditor.jsx:183-207, 377-378.
2. El único re-sync vive en SqlEditor (`[props.theme]`, :1137-1148): si el tab activo es
   notebook/markdown/deck, **nadie** re-fotografía los tokens → "se mantiene aunque cambie".
   Cambio dark→dark (onyx→nord) ni siquiera cambia el string del tema → no pasa nada.
3. `NotebookCell` monta SqlEditor **sin prop theme** (:509-513) → celdas congeladas en el tema
   del mount; con `LazyVisible`, una celda montada post-cambio "repara" el global a mitad de
   scroll — el comportamiento aleatorio percibido.
4. `_monacoThemeCache` (key = themeId, sin acento, sin invalidación) → acento viejo para
   siempre; el effect ni siquiera tiene `accent` en deps.
5. `MONACO_PALETTE` es una segunda fuente de verdad hex desincronizada del CSS real.
6. 5 copias de la lista `['light','ivory','mist','snow']` (SqlEditor ×2, MarkdownEditor,
   DeckEditor, MarkdownPreview) — tercera fuente de verdad de "qué es light".

**Rediseño acordado**: módulo único `client/src/monacoTheme.js` (cssVarToHex + buildMonacoTheme
+ `isLightTheme()` + `syncMonacoTheme(theme, accent)`); UN tema Monaco `'amox'` para toda la
app; App.jsx lo re-sincroniza en el MISMO effect que aplica la clase al body (y en el de
acento); los editores solo hacen `ensureMonacoTheme()` idempotente; cache eliminado (18
getComputedStyle por cambio de tema — costo nulo); MONACO_PALETTE reducido a fallback mínimo.

## 4. Estructura — lo que falta y lo que sobra

- **Doble vocabulario vivo**: `--text-tertiary` (360) vs `--text-muted` (265), `--text-primary`
  (317) vs `--text-active` (99), `--border-default` (205) vs `--border-color` (141),
  `--accent-primary` (575) vs `--accent-color-user` (62), `--surface-inset` (138) vs
  `--input-bg` (44)… Dos componentes vecinos nombran el mismo rol distinto; cuando un tema
  olvida sincronizar un alias, divergen.
- **Bug de cascada de acentos** (especificidad igual → gana el último en el archivo):
  - Acentos vibrantes definidos ANTES de nord/islands → **en Nord/Islands elegir acento no hace
    nada**.
  - Acentos sobrios (sage…copper) ANTES de los 4 temas light → **ignorados en silencio en
    light** (el picker los ofrece igual); y si aplicaran, dan 1.84-3.08:1 de contraste.
  - La biblia lo resuelve con un bloque derivador único `[class*="accent-"]` DESPUÉS de los
    temas (styleguide/tokens.css:159-163).
- **Elevación sin regla declarada**: dark = +L (base→raised +0.025..+0.045 ✓ consistente);
  light = −L + overlay blanco con sombra (patrón legítimo, también en la biblia) pero **no
  escrito** y Snow lo viola 3× (−0.072).
- **Higiene**: tokens muertos (`--type-*`, `--titlebar-bg/text`, `--bg-color`, `--sidebar-bg`…),
  `update_css.cjs` (script generador huérfano que apunta a otra máquina — pero conserva el Snow
  ORIGINAL suave como referencia), `guia_estilos.md` desactualizada (falta islands, ejemplo de
  carbon con valores que no existen), 11 sombras negras hardcodeadas que puentean `--shadow-*`
  (solo 22 usos de los tokens de sombra en 16k líneas).

## 5. Light vs dark — cuantificado

Contraste de `text-tertiary` (el nivel más usado de la app) sobre base/raised/inset:

| Tema | tt/base | tt/raised | tt/inset | Veredicto |
|---|---|---|---|---|
| Dark (obsidian/onyx/carbon/graphite) | 3.1–3.3 | 3.1–3.3 | 3.1–3.3 | consistente = "armonía" |
| Nord | 3.08 | 2.72 | 3.24 | aceptable |
| **Islands** | **2.19** | **2.05** | **2.30** | peor dark; fuera de patrón |
| Light (.light-theme) | 4.71 | 4.64 | 4.53 | el único light bien calibrado |
| **Ivory** | **3.01** | **2.78** | **2.63** | "letras que casi no se ven" |
| **Mist** | **2.93** | **2.72** | **2.46** | ídem |
| **Snow** | 7.56 | 6.10 | 5.13 | jerarquía aplanada (17.7/10.3/7.6) |

Bordes (contraste borde vs base): dark subtle/default/strong = 1.12-1.22 / 1.25-1.38 /
1.53-1.77. **Ivory/Mist**: todo su rango (1.14→1.41) cabe dentro del escalón subtle→default de
dark ("casi sin bordes"). **Snow**: 1.47 / 2.54 / **4.83**, y encima opacos (`#d1d5db/#9ca3af`),
con `--hover-bg`/`--active-bg` opacos que pintan losas grises ("bordes durísimos").

Además en ivory/mist/snow (por herencia dark): `--feedback-info-text` a 2.2-2.5:1, nodos de
ER/linaje casi negros, iconos de archivo a ~2:1.

## 6. Matriz de similitud y recomendación de consolidación

| Par | ΔL medio (8 tokens) | Recomendación |
|---|---|---|
| **onyx vs carbon** | **0.0072** | Clones — eliminar uno o rediseñar carbon con matiz azul real |
| carbon vs graphite | 0.0164 | Muy cercanos — graphite necesita temperatura cálida real |
| obsidian vs onyx | 0.0276 | Onyx = "obsidian +0.05L"; sobra si carbon vive |
| nord vs islands | 0.0464 | Distintos de verdad — conservar (islands necesita recalibrar contraste) |
| **ivory vs mist** | **0.0063** | Clones estructurales que difieren solo en temperatura (cálido/frío) — conservar ambos como par canónico, corregidos |
| snow vs todos | 0.047–0.068 | Outlier roto — reconstruir sobre el patrón ivory/mist o eliminar |

La biblia "bendice" 4 temas (default, graphite, nord, light) — la lista de 10 está inflada.
**Decisión final del usuario** al terminar las correcciones (regla acordada: presentar los
temas ya corregidos para elegir cuáles se quedan).

## 7. Estándar canónico propuesto (alineado a la biblia)

1. **Cuatro capas en este orden en el archivo**: `:root` (contrato) → **capa de MODO**
   (`.mode-light` que App añade junto a la clase del tema: feedback, syntax base, icons, nodes,
   sombras suaves, scrollbar, codicons, button-text) → **capa de TEMA** (solo superficies,
   textos, bordes, hover/active, titlebar; opcional syntax para nord/islands) → **acentos al
   final** (cada `.accent-*` fija solo `--accent-primary`; un bloque derivador único
   `[class*="accent-"]` calcula muted/subtle/focus-ring).
2. **Elevación con norma**: dark +L [0.025, 0.045] base→raised; light −L [0.015, 0.03] +
   overlay blanco con `--shadow-md` suave. "Nunca flotar algo sobre un contenedor más oscuro".
3. **Pisos de contraste verificables** (script en CI futuro): primary ≥10:1, secondary ≥5.5:1,
   tertiary ≥4:1 sobre base/raised/inset, disabled 1.8-2.6 (prohibido para contenido).
4. **Bordes siempre alpha**, mismos rangos en ambos modos: subtle 1.10-1.22, default 1.25-1.40,
   strong 1.50-1.80.
5. **Reglas light explícitas**: sombras α ≤ 0.15, hover/active como lavados alfa, acentos de
   texto con L ≤ 0.55, texto sobre acento solo si ≥4.5:1 (`--button-text-color` SIEMPRE).
6. **Un solo vocabulario**: migrar aliases legacy → v2 y borrarlos.

## 8. Plan de corrección por fases

### Fase 0 — Bugs activos (funcionalidad rota hoy, independiente de estética) · **HECHA (commit `c68cd64`)**
> Capa de modo (`mode-light`/`mode-dark` en body vía nuevo `client/src/theme.js`), scrollbars y
> codicons de Monaco arreglados para los 4 temas light, 0 tokens fantasma residuales en toda la app,
> token `--overlay-bg` consolidando ~29 scrims. Build OK.
1. Tokens fantasma: mapear los ~35 nombres a los tokens reales (migrar usos; NO crear aliases
   nuevos salvo `--overlay-bg`). Prioridad: CSS de chains (`--surface-1/2/3`, `--border`,
   `--radius`), `--sidebar-item-hover-bg`, `--button-bg-*`, EditorPane/ai-edit-proposal.
2. `App.jsx`: añadir la capa de modo (clase `mode-light`/`mode-dark` junto al tema) y migrar
   las reglas `.light-theme .foo` genéricas (scrollbar, codicons) a `.mode-light .foo`.
3. Fallbacks disfrazados (`--accent-warning`, `--error-color`, `--git-*`): migrar al token real.
4. Nuevo token `--overlay-bg` y reemplazo de las ~28 copias de `rgba(0,0,0,0.6)`.

### Fase 1 — Estructura (capa de modo completa + acentos)
1. Mover a `.mode-light`/`.mode-dark` todo lo copiado/olvidado por tema: `--feedback-*` (incl.
   info), `--icon-*`, `--node-*`, sombras, `--button-text-color`.
2. Reordenar acentos al FINAL + bloque derivador único `[class*="accent-"]` (patrón biblia).
   Deshabilitar en el picker los acentos sin rampa light cuando el tema es light (o darles rampa).
3. `isLightTheme()` como única fuente de verdad (módulo compartido), usada por App/editores/CSS.

### Fase 2 — Monaco
Implementar el rediseño de §3: `monacoTheme.js`, tema único `'amox'`, sync desde App (tema +
acento), sin cache, MONACO_PALETTE mínimo, NotebookCell sin prop theme, borrar las 5 listas.

### Fase 3 — Hardcodes (inventario del barrido)
1. **Chains**: `chainNodeTypes.js` guarda solo hue/accent por categoría; bg/border derivados con
   `color-mix(... var(--surface-overlay))` → nodos legibles en ambos modos. Estados, logs,
   validación, SQL preview → tokens semánticos. Edges/minimap/dots del canvas resueltos de vars.
2. Semánticos JSX/CSS: `#4ade80/#ef4444/#f59e0b/...` → `--feedback-*`/`--color-*`; `color:#fff` y
   `color:#000` sobre acento → `--button-text-color`; sombras → `--shadow-*`.
3. MarkdownEditor.css: paleta hljs/alerts con variante por modo. DatabaseExplorer: tokens
   `--dtype-*`. QueryPlan heatmap → semánticos. Exports html2canvas según tema activo.

### Fase 4 — Calibración light (+ islands)
1. Ivory/Mist: subir `text-tertiary` a ≥4:1 (≈`#7d7060` / `#6b7488`) y bordes al rango canónico.
2. Snow: reconstruir sobre el patrón ivory/mist (la versión ORIGINAL suave está en
   `update_css.cjs` como referencia); bordes alpha, hover/active como lavados, raised −0.02.
3. Islands: recalibrar secondary/tertiary al piso dark (hoy 4.28/2.19).
4. Verificación: script de contraste (Node) que valide los pisos de §7.3 sobre los 10 temas.

### Fase 5 — Consolidación y limpieza
1. **Presentar al usuario los temas corregidos** → decide cuáles eliminar/fusionar
   (candidatos: onyx≈carbon; evaluar onyx vs graphite; snow si no convence reconstruido).
2. Migración de aliases legacy (700+ usos) → vocabulario v2, borrar aliases.
3. Borrar tokens muertos y `update_css.cjs`; actualizar `guia_estilos.md` al estándar de §7;
   subir a la amox-design-bible lo que le falta (capa de modo, norma cuantitativa).

---

## 9. Metodología

3 agentes en paralelo sobre `claude/theme-audit` (main `c11121b`): barrido de hardcodes/tokens
fantasma (client/src completo), integración Monaco (flujo tema→editor), y arquitectura
(tokens, contrastes WCAG calculados, matriz de similitud OKLab, alineación con la
amox-design-bible). Evidencia file:line verificada; ratios calculados, no estimados.
