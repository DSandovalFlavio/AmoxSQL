# Plan de Profesionalización de AmoxSQL

> Roadmap multi-sesión para elevar el acabado de AmoxSQL en cuatro pilares:
> **Tutoriales/Onboarding · Motion · Estética/Consistencia · Rendimiento**.
> AmoxSQL es una app **de escritorio local** (Electron + DuckDB): el foco es la
> *percepción de calidad* (fluidez, pulido, cohesión), no optimizaciones web.

**Estado:** vivo · **Inicio:** 2026-06-26 · **Orden de ejecución:** Pilar A → B → C → D
(con interdependencias anotadas). Cada pilar se ejecuta por fases a lo largo de varias sesiones.

---

## Diagnóstico de partida (auditoría 2026-06-26)

| Pilar | Estado | Resumen |
|-------|--------|---------|
| **Rendimiento** | 🟢 Sano | App local ya fluida. Focos puntuales, nada sistémico. |
| **Animaciones** | 🟠 Hueco mayor | CSS puro (correcto), pero sin sistema de motion ni accesibilidad. |
| **Estética** | 🟡 Base excelente, deuda de consistencia | Tokens oklch + 9 temas sólidos; ~50 hardcodes dispersos. |
| **Tutoriales** | 🟡 Desigual | Tours buenos (Story/Data Flow, AI Modes) pero duplicados; faltan varios. |

---

## PILAR A — Tutoriales / Onboarding  *(en curso)*

**Objetivo:** onboarding cohesivo y completo, con una sola arquitectura de tours,
descubrible y replicable, que cubra todas las features potentes.

**Estado actual:**
- Tours existentes: `StoryFlowGuide.jsx`, `chains/DataFlowGuide.jsx`, `ai/AiModesGuide.jsx`.
  Son **carruseles custom casi idénticos** (markup duplicado ~120 líneas c/u), con
  persistencia en localStorage y evento `window.amox_replay_*` para re-jugar.
- Docs de nodos excelentes en `chains/nodeDocs.js` + `NodeDocView.jsx`.
- Welcome (`WelcomeScreen.jsx`) es funcional (selección workspace + DB), no "delightful".
- **Huecos sin onboarding:** SQL Notebooks, Deep Dive (tour dedicado), setup de
  contexto AI (`metrics.yml`/`joins.yml`…), Analysis Vault, Extensions.
- **Deuda técnica de los tours:** usan tokens legacy (`--panel-bg`, `--accent-color-user`)
  y valores hardcodeados (`rgba(0,0,0,0.55)`, `boxShadow`), sin `prefers-reduced-motion`.

### Fase A1 — Primitiva de Tour reutilizable  *(fundacional, primera)*
- Crear `client/src/components/onboarding/Tour.jsx`: un carrusel genérico
  (overlay + panel + barra de progreso + Back/Next/Skip + chip "New") que recibe
  `steps`, `title`, `icon`, `onClose`. Reemplaza el markup duplicado de los 3 tours.
- Crear `client/src/components/onboarding/GuideModal.jsx`: wrapper de modal genérico
  para las "reference guides" (lo que abre el botón "?").
- Refactorizar `StoryFlowTour`, `DataFlowTour`, `AiModesTour` para consumir la primitiva
  (mantener su *contenido* —stages/modes— intacto; solo cambia el render).
- Usar tokens correctos (`--surface-*`, `--accent-primary`, `--shadow-lg`, `--radius-*`).
  Anticipa Pilar B: usar `var(--ease-*)`/`var(--duration-*)` cuando existan.

### Fase A2 — Registro de tours + descubribilidad
- `client/src/components/onboarding/tourRegistry.js`: un registro central
  `{ id, label, icon, localStorageKey, replayEvent, component }` para todos los tours.
- Hub de ayuda único: entradas en Command Palette ("Replay tour: …") y un menú
  "Help / Tours" desde donde re-jugar cualquier guía. Hoy los replays están dispersos.
- Centralizar las localStorage keys (`amoxsql-storyflow-tour-seen`,
  `amox-ai-modes-tour-seen`, `amoxsql-dataflow-tour-seen`) bajo una convención única.

### Fase A3 — Tours nuevos (contenido)
Aprovechando A1, añadir guías + tours para los huecos, por prioridad:
1. **SQL Notebooks** (`.sqlnb`): tipos de celda, ejecución, environment, reportes.
2. **Deep Dive**: tour dedicado al abrirlo (qué preguntas funcionan, plan, narración).
3. **Setup de contexto AI**: cómo escribir `metrics.yml`/`joins.yml` con ejemplos inline.
4. **Analysis Vault**: qué es, para qué sirve, cómo se organiza.
5. **Extensions**: qué son, instalar, usar.

### Fase A4 — Pantalla de bienvenida + orientación global
- Pulir `WelcomeScreen.jsx`: jerarquía visual, recientes, animación de entrada (post-B).
- Onboarding global opcional de primer arranque (3-4 pasos) que oriente toda la app
  y enlace a los tours por feature.

---

## PILAR B — Motion System

**Objetivo:** un sistema de movimiento coherente que dé sensación premium y respete
accesibilidad. CSS puro (sin librerías — correcto para desktop).

**Estado actual:** solo `--transition-fast: 120ms` y `--transition-base: 200ms`; cero
curvas de easing centralizadas; `prefers-reduced-motion` casi ignorado (1 regla, sobre
un logo); WELCOME→IDE brusco; 7+ spinners duplicados; muchos cambios de estado sin
transición (tabs, resultados, árboles del explorer).

### Fase B1 — Tokens de motion
En `:root` (y respetados por todos los temas): escala de duración
(`--duration-instant/fast/base/slow`) y curvas (`--ease-out`, `--ease-in-out`,
`--ease-spring: cubic-bezier(0.16,1,0.3,1)`). Migrar valores hardcodeados a tokens.

### Fase B2 — Accesibilidad de movimiento (global)
Bloque global `@media (prefers-reduced-motion: reduce)` que neutralice/reduzca
animaciones y transiciones en toda la app, no solo el logo.

### Fase B3 — Consolidar spinners
Un único spinner/keyframe (`spin`) y clase utilitaria; retirar las 7 variantes
duplicadas (`ai-spin`, `ext-spin`, `dbt-spin`, `stg-spin`, `chain-spin`, `git-spin`, `nb-spin`).

### Fase B4 — Pulir transiciones clave
- WELCOME→IDE: fade/scale en el cambio de fase (`App.jsx`).
- Tab switching, aparición de resultados, expand/collapse de árboles (File/DB Explorer),
  show/hide de paneles (AI panel).

### Fase B5 — Micro-interacciones
Estados hover/active/focus consistentes en botones, chips y toolbar usando los tokens de B1.

---

## PILAR C — Estética / Consistencia

**Objetivo:** eliminar deuda de consistencia sin tocar la identidad visual.
Base ya excelente: sistema oklch, 9 temas, escala tipográfica/espaciado/radios en tokens, Lucide 100%.

### Fase C1 — Colores hardcodeados → tokens
~50 instancias (sobre todo `SettingsModal.jsx`: `#34a853`, `#000`, `#333`, `#dee2e6`;
`index.css` titlebar `#FFFFFF`). Excepción permitida: tema de Monaco (resuelto en runtime).

### Fase C2 — Sombras
Normalizar las 10+ variantes ad-hoc a `--shadow-sm/md/lg`; añadir tokens si falta algún nivel.

### Fase C3 — Radios y tipografía
Normalizar radios fuera de escala (2/3/5/10/16px) a `--radius-*`; font-sizes mágicos
(`0.9em`, `10.5px`, `12px`) a tokens de la escala (o crear alias si son intencionales).

### Fase C4 — Guía de estilos
Actualizar `docs/dev/guia_estilos.md` (aclarar que `--bg-surface` no existe → `--panel-bg`/`--surface-*`).
Valorar un check/lint que prohíba hex en componentes (excepto Monaco).

---

## PILAR D — Rendimiento puntual

**Objetivo:** cerrar los focos concretos detectados. App ya sana; no hay cascadas ni leaks.
**Prohibido** (decisión previa): virtualización de listas/tablas — `ResultsTable` pagina.

### Fase D1 — Keys estables en `ResultsTable`
`ResultsTable.jsx:603` usa `key={rowIndex}` → re-renders falsos al reordenar. Usar id estable.

### Fase D2 — Memoizar `SettingsModal`
`SettingsModal.jsx` (97KB) sin `memo` ni sub-componentes memoizados; cada cambio de tab
re-renderiza todo. Envolver y trocear sub-paneles.

### Fase D3 — Handlers inline en rutas calientes
`ResultsTable.jsx:388-463` y callbacks de `LayoutManager` en `App.jsx`: extraer a `useCallback`.

### Fase D4 — Caché de tema de Monaco
`SqlEditor.jsx:104-202`: `buildMonacoTheme()` recalcula leyendo CSS vars vía DOM temporal.
Cachear por (tema, accent).

---

## Notas de coordinación entre pilares
- **A depende parcialmente de B:** los tours nuevos (A) deben usar los tokens de motion (B)
  para entrada/salida. Como A va primero, A1 usa tokens de transición existentes y se
  refina cuando B1 aterrice.
- **A y C convergen:** al refactorizar tours en A1 ya se migran sus tokens legacy (adelanta C1).
- **B1 es prerequisito** de B2-B5 y de las animaciones de A4.

---

## Bitácora
- **2026-06-26** — Auditoría de los 4 pilares + redacción de este plan.
- **2026-06-26** — Implementación (sesión 1). Completado y verificado con `pnpm build`:
  - **B1** Tokens de motion (`--duration-*`, `--ease-out/in-out/spring`) en `:root`. `--transition-fast/base` recompuestos sobre los tokens → **todas** las transiciones existentes heredan el easing pulido. Nuevo `--transition-slow`.
  - **B2** Bloque global `@media (prefers-reduced-motion: reduce)` que neutraliza movimiento app-wide (spinners se ralentizan, no se congelan).
  - **B3** Consolidados 8 keyframes de spin duplicados (`ai/ext/stg/dbt/nb/chain/git-spin`, `spin-gallery`, duplicado de `spin`) en un único `@keyframes spin` + clase `.amox-spin`. Clases conservadas → JSX intacto.
  - **A1** Primitiva reutilizable `components/onboarding/Tour.jsx` (+ `GuideModal`) con `onboarding.css` (tokens + motion + teclado Esc/←/→). Los 3 tours existentes (Story Flow, Data Flow, AI Modes) ahora renderizan a través de ella; markup duplicado eliminado y tokens legacy migrados.
  - **A2** `tourRegistry.js` (catálogo central: id, branding, steps, storageKey) + `OnboardingHost.jsx` global con **cola** (tours no se pisan) que además puentea los eventos legacy de replay (arregla el bug de los botones de Settings). Entradas "Help & Tours" en el Command Palette para re-jugar cualquier tour.
  - **A3** 5 tours nuevos con contenido preciso: Notebooks, Deep Dive, AI Context, Analysis Vault, Extensions. First-run cableado en cada feature.
  - **A4** Tour global "Welcome to AmoxSQL" (primer arranque del IDE) + entrada escalonada de `WelcomeScreen`.
  - **B4** Fade de entrada del IDE (suaviza WELCOME→IDE), fade de aparición de resultados, fade al activar paneles del sidebar (9 paneles), fade de hijos revelados en el árbol de la BD, utilidades `.amox-fade-in/.amox-fade-rise/.tree-reveal`. (Decisión: el cambio de tab del editor se deja **instantáneo** a propósito — animar Monaco se sentiría lento.)
  - **B5** Anillo global `:focus-visible` accesible (token `--focus-ring`, `:where()` especificidad 0, solo teclado). Gran parte del resto de micro-interacciones ya quedó cubierta por B1 (todas las transiciones que usan `--transition-*` heredaron el easing).
- **Pilar B (Motion) COMPLETO.**
- **Pilar C (Estética).** Hallazgo: la mayoría de los ~50 "hardcodes" de la auditoría eran **legítimos** (definiciones de temas/acentos en el selector, fallbacks de tokens, blancos literales de botones de control de ventana estilo-OS) — reemplazarlos sería una regresión. Corregido el único hardcode de marca real: `#34a853` → `var(--color-success)` (3×) en SettingsModal. Actualizada `guia_estilos.md`: radios corregidos (estaban desfasados: decía sm=6px, real sm=4px), nueva sección **7. Sistema de Motion** + **7.1 Onboarding** documentando tokens, utilidades y la primitiva de Tour. C **COMPLETO** (con criterio, no a ciegas).
- **Pilar D (Rendimiento).**
  - **D4** Caché del tema de Monaco: `cssVarToHex` reutiliza un elemento sonda persistente (en vez de crear/borrar uno por variable) y los temas construidos se cachean por id (`getMonacoTheme`) → alternar entre temas ya vistos es instantáneo, sin ~18 reflows.
  - **D1/D2/D3 — evaluados y NO modificados a propósito** (decisión documentada): D1 `key={rowIndex}` en ResultsTable es **correcto** para una tabla paginada que se reemplaza por completo — claves por contenido provocarían movimientos de DOM en cada orden (peor); D2 memoizar SettingsModal no ayuda porque recibe props inline de App (memo nunca corta) y el problema real (re-render de sub-tabs) requeriría trocear un archivo de 2400 líneas; D3 (handlers inline) es barrido amplio de bajo retorno. CLAUDE.md advierte explícitamente contra sobre-optimizar como web; la app ya está sana.
- **PLAN COMPLETO** (sesión 1). Todo verificado con `pnpm build`. Pendiente recomendado: smoke test en vivo (`pnpm start`) del nuevo `OnboardingHost` y las animaciones.
