# Plan — Report Flow Studio (edición estructurada de `.amoxdeck`)

> Rediseño de la **experiencia de edición** de los decks de Report Flow. Hoy el `DeckEditor` es solo Edit (Monaco markdown) / Present. Este plan lo convierte en un **estudio con panel lateral dentro de la pestaña** — mismo patrón que Data Flow (`.sqlchain`) y Story Flow (`.amoxvis`) — para (a) **no saturar el sidebar global**, (b) enseñar los **layouts con previsualización**, y (c) hacer **trivial insertar un gráfico** en una slide. Extiende `plan_export_office_decks.md` (§4.2, Fase 5). Fecha: 2026-07-04.

---

## 1. Diagnóstico (qué falla hoy)

Al abrir un `.amoxdeck` el usuario solo tiene un editor markdown crudo + vista Present. Problemas concretos observados:

1. **La visualización en `content-chart` se ve angosta.** Causa raíz: `.deck-slide-card` tenía `max-width: 1100px` y `content-chart` reparte `1fr 1fr` (50/50). Un gráfico de barras horizontales con 8 categorías queda con ~500px reales. *(Ya mitigado: card a 1440px y split `0.85fr / 1.15fr` a favor del gráfico — commit en curso.)*
2. **No hay forma de descubrir los layouts.** Están documentados solo en el markdown de ejemplo; el usuario no sabe que existen `chart-full` (ideal para barras anchas), `two-col`, etc. No aprende a usarlos.
3. **Insertar un gráfico es manual y frágil.** Hay que escribir a mano el bloque ` ```amoxchart / src: charts/x.amoxvis ``` ` y acertar la ruta relativa exacta al `.amoxvis`. Un typo = chart roto.
4. **No hay navegación entre slides** ni forma de reordenar sin editar el markdown a mano.

**Restricción del usuario (explícita):** *no* meter otro ícono en el activity-bar global. La solución debe vivir **dentro de la pestaña del deck**, como el panel "NODES" de Data Flow y el panel "STORY FLOW" de `.amoxvis`.

---

## 2. Patrón de referencia (ya existe en el código)

Ambos editores montan su panel **en la pestaña**, no en el sidebar global:

| Editor | Shell | Panel in-tab | Inserción |
|---|---|---|---|
| **Data Flow** (`chains/ChainEditor.jsx`) | `.chain-editor` (col) → `ChainToolbar` + `.chain-editor-body` (row) | `.chain-palette` (200px, colapsable a 36px vía `paletteCollapsed` + `.chain-palette-collapsed`). Datos: `NODE_CATEGORIES` (categoría→tipos) en `chainNodeTypes.js`. | Drag-and-drop (`dataTransfer` MIME) al canvas. |
| **Story Flow** (`DataVisualizer.jsx`) | flex row: sidebar 320px (`--panel-bg`) + main `flex:1` (`--chart-bg`) | Header "Story Flow" + control segmentado `.seg.seg--fill` (array `TABS` de `{key,icon,title,hint}`) + switch `{activeTab === 'x' && <Panel/>}`. Paneles en `DataVisualizer/panels/`. | Cada panel muta el estado (`useChartState`). |

**Reutilizamos:** las clases `.seg` / `.seg-item` / `.seg-item--active` (index.css ~2159) y los tokens `--panel-bg` / `--chart-bg`; el patrón colapsable de ChainEditor.

---

## 3. Diseño — "Report Flow Studio"

Reestructurar `DeckEditor.jsx` a un shell de tres partes (toolbar arriba + cuerpo de dos columnas):

```
┌─ deck-studio ───────────────────────────────────────────────────────────┐
│ [Report Flow · New Deck]  3 slides      Refresh all │ Export PPT ▾ │ Edit │ Present │ Save ▾ │ Assist │  ← toolbar (igual que hoy)
├──────────────────────┬───────────────────────────────────────────────────┤
│ deck-side-panel      │ deck-main                                          │
│ (240px, colapsable)  │  Edit (Monaco markdown)  ó  Present (slide cards)  │
│                      │                                                    │
│ ┌ seg tabs ────────┐ │   ← contenido ACTUAL, solo movido a la derecha     │
│ │ [▤ Slides][▦ Lay-│ │                                                    │
│ │  outs][▧ Charts] │ │                                                    │
│ └──────────────────┘ │                                                    │
│  (panel activo)      │                                                    │
└──────────────────────┴───────────────────────────────────────────────────┘
```

El panel lateral tiene 3 pestañas (control segmentado `.seg.seg--fill`, íconos Lucide):

### Tab 1 — **Slides** (outline + navegación)
- Lista de slides parseadas: nº + **badge de layout** + primer heading como título.
- Click → en Present hace scroll a la slide; en Edit mueve el cursor de Monaco a la línea de esa slide.
- Botones **↑ / ↓** para reordenar (swap de chunks + re-serialize) y **⌫** para borrar.
- Botón **"+ Add slide"** al pie → inserta una slide nueva (layout `content`).

### Tab 2 — **Layouts** (galería con previsualización) ⭐ *lo que pediste*
- Los 5 layouts como tarjetas, cada una con un **mini-preview esquemático** (SVG/CSS inline), nombre y una línea de "cuándo usar":

  | Layout | Preview (esquema) | Cuándo usar |
  |---|---|---|
  | `title` | barra centrada grande + subtítulo | Portada / secciones |
  | `content` | líneas de texto alineadas izq | Texto, bullets, tablas |
  | `content-chart` | bloque texto + caja gráfico al lado | Narrativa + 1 gráfico |
  | `chart-full` | caja gráfico grande | **Gráfico que necesita ancho** (barras con muchas categorías) |
  | `two-col` | dos cajas lado a lado | Comparar dos cosas |

- Click en una tarjeta → **inserta una slide nueva con la plantilla de ese layout** (directiva `<!-- layout: X -->` + markdown placeholder) en el cursor (Edit) o al final (Present).
- Resuelve el problema del gráfico angosto: el usuario **ve** que `chart-full` existe y lo elige para barras anchas.

### Tab 3 — **Charts** (insertar gráfico en 1 clic) ⭐ *lo que pediste*
- Lista de **todos los `.amoxvis` del proyecto** (endpoint recursivo nuevo, §4).
- Cada fila: ícono + nombre + carpeta; opcional: `chartTitle` leído del `.amoxvis`.
- Click → inserta el bloque ` ```amoxchart / src: <ruta> ``` ` con la **ruta correcta** (adiós typos), en la slide activa / cursor.
- Botón **"Refresh list"**.

*(Opcional futuro — Tab 4 "Variables": editar las `variables:` del front-matter como filas clave/valor, que alimentan la sustitución `{{var}}` al refrescar. Fuera del alcance del primer corte.)*

### Mecánica de inserción (compartida)
- Guardar el `editor` de Monaco en un `editorRef` (hoy `handleEditorMount` solo registra Ctrl+S).
- `insertSnippet(text, { newSlide })`:
  - Si Monaco está montado → `editor.executeEdits('deck-insert', [{ range: selection, text }])` y foco.
  - Si no (vista Present) → append a `content` (con `\n\n---\n\n` si `newSlide`) y `onChange(next)`.

---

## 4. Backend — enumerar `.amoxvis` recursivamente

No existe endpoint de "archivos por extensión, recursivo" (solo `/api/files?path=` por carpeta y `/api/folders` que recorre solo carpetas). Añadir uno, reutilizando patrones existentes:

- **`GET /api/files/find-by-extension?ext=.amoxvis`** en `server/index.js`.
- Walker recursivo estilo `getDirectories()` (index.js ~2980) pero devolviendo **archivos** que matchean, excluyendo `node_modules`/`.git`.
- **Guard anti-traversal** idéntico al de `/api/file?binary=1` (index.js ~2769): `path.resolve` + comparación de prefijo normalizado con `ROOT_DIR`.
- Respuesta: `[{ name, path }]` (ruta relativa a ROOT_DIR, forward slashes).
- Cliente: helper `fetchProjectCharts()` que llama una vez y cachea; el Tab Charts lo consume.

---

## 5. Archivos a crear / modificar

**Crear:**
- `client/src/components/deck/DeckSidePanel.jsx` — shell del panel: seg tabs + switch.
- `client/src/components/deck/panels/SlidesPanel.jsx` — outline + reordenar/borrar/add.
- `client/src/components/deck/panels/LayoutsPanel.jsx` — galería de layouts con previews SVG.
- `client/src/components/deck/panels/ChartsPanel.jsx` — lista de `.amoxvis` + insertar.
- `client/src/components/deck/deckLayoutPreviews.jsx` — los 5 mini-previews esquemáticos (SVG/CSS puro, sin deps).
- `client/src/utils/deckTemplates.js` — `DECK_LAYOUT_TEMPLATES` (markdown starter por layout) + helper de inserción de slide.

**Modificar:**
- `client/src/components/deck/DeckEditor.jsx` — nuevo shell `deck-studio` (toolbar + body de 2 columnas), `editorRef`, `insertSnippet`, estado `activePanel` + `sidePanelCollapsed`, montar `DeckSidePanel`.
- `client/src/components/deck/deck.css` — clases `.deck-studio`, `.deck-studio-body`, `.deck-side-panel` (+ colapsado), `.deck-main`, y estilos de las 3 pestañas/tarjetas/previews. Quitar dependencia de `.mde-wrap/.mde-card` para el layout del cuerpo (mantener toolbar).
- `client/src/utils/deckParser.js` — `parseDeck` devuelve además `startLine` por slide (para saltar el cursor) y expone `serializeDeck(frontMatter, slides)` para reordenar/borrar.
- `server/index.js` — endpoint `GET /api/files/find-by-extension`.

**Ya hecho (fix rápido):** `.deck-slide-card` `max-width: 1440px`; `content-chart` split `0.85fr / 1.15fr`.

---

## 6. Plan por fases

**Fase S1 — Shell del estudio (base):**
- Reestructurar `DeckEditor` a `deck-studio` + `deck-studio-body` (panel izq colapsable + main). Panel vacío con las 3 seg-tabs. `editorRef` + `insertSnippet`. Persistir `activePanel`/collapse en localStorage.
- Entrega: layout nuevo funcionando, sin saturar sidebar global; Edit/Present intactos a la derecha.

**Fase S2 — Layouts (galería con previews):**
- `deckLayoutPreviews.jsx` + `LayoutsPanel` + `DECK_LAYOUT_TEMPLATES`. Click inserta slide.
- Entrega: el usuario descubre y aplica layouts (incl. `chart-full` para gráficos anchos).

**Fase S3 — Charts (insertar en 1 clic):**
- Endpoint `find-by-extension` + `fetchProjectCharts()` + `ChartsPanel`. Click inserta bloque `amoxchart` con ruta correcta.
- Entrega: añadir un gráfico a una slide sin escribir rutas a mano.

**Fase S4 — Slides (outline + reordenar):**
- `startLine` en parser + `serializeDeck` + `SlidesPanel` (navegar/↑↓/borrar/add).
- Entrega: navegación y reordenamiento sin tocar el markdown.

**Fase S5 (opcional) — Pulido:**
- Tab Variables; empty-states; hint de "usa chart-full para barras anchas"; drag-reorder de slides.

---

## 7. Caveats / decisiones

- **Markdown sigue siendo la fuente de verdad.** El panel es azúcar de edición: todo lo que inserta/reordena se refleja en el markdown (editable a mano y por la AI). No introducimos un modelo de datos paralelo.
- **Inserción en Present:** append al final (no hay cursor). Aceptable; el caso principal de autoría es Edit.
- **`startLine` para saltar el cursor:** el parser hoy descarta offsets; hay que devolverlos. Riesgo bajo (el split ya recorre líneas).
- **No virtualizar** la lista de charts/slides (convención del repo); decks reales tienen pocas slides y proyectos pocas `.amoxvis`.
- **Sin emojis; íconos Lucide.** Previews de layout como SVG/CSS propio (sin libs).
