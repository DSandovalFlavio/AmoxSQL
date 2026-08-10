# Plan — Rendimiento con resultados MUY anchos (miles de columnas)

> **Estado: Fase 0 y Fase 1 IMPLEMENTADAS (2026-07-30)**, rama `claude/wide-results-perf`.
> Ver "Registro de implementación" al final del documento. Fase 2 (Data Profiler) y
> Fase 3/4 (transporte + contexto IA) siguen pendientes.

Caso real que lo destapó: un Excel de ~350 MB con **más de 2700 columnas**. Con `LIMIT 1000`
en la query, la app se traba en una Dell Precision 3581 (i9-13900H, 32 GB). El hardware
descarta la máquina: el problema es de diseño — todo el pipeline asume "muchas filas,
pocas columnas" y aquí pasa lo contrario.

> **Restricción del repo**: CLAUDE.md prohíbe introducir virtualización de listas/tablas
> (`@tanstack/react-virtual` y similares) porque intentos previos empeoraron el
> rendimiento. Este plan **respeta esa regla** y resuelve por *ventaneo de columnas*
> (paginación + selección), no por virtualización. Ver "Decisión pendiente" al final.

---

## Diagnóstico (medido sobre el código, no estimado)

Con 2700 columnas y `LIMIT 1000`:

| # | Punto | Qué pasa | Magnitud |
|---|-------|----------|----------|
| 1 | [`/api/query`](../../server/index.js) `server/index.js:3541-3580` | `applyRowLimit` limita **filas**; no existe ninguna guarda de **columnas**. El JSON de respuesta lleva todas las celdas | 1000 × 2700 = **2.7 M valores** → parse JSON bloquea el hilo del renderer |
| 2 | [`ResultsTable`](../../client/src/components/ResultsTable.jsx) `ResultsTable.jsx:611-617` | Se pinta un `<td>` por celda de la página, y **cada uno** calcula su `title` con `String()`/`JSON.stringify()` | 50 filas × 2700 = **135 000 celdas + 135 000 conversiones a string** por render |
| 3 | `ResultsTable.jsx:595-605` | La fila de filtros crea un `<input>` controlado por columna | **2700 inputs** montados |
| 4 | [`/api/profile`](../../server/index.js) `server/index.js:3707-3715` | Matriz de correlaciones **O(n²)** sobre columnas numéricas, todo en **un solo SELECT** | con ~2000 numéricas → **~2 000 000 de `CORR()`** en una query (texto SQL de cientos de MB) |
| 5 | `server/index.js:3669-3703` | 4-6 agregados por columna, también en un solo SELECT | **~13 000 expresiones** agregadas |
| 6 | `server/index.js:3758` | `Promise.all` con **una query por columna**, cada una escaneando la subconsulta completa | **2700 queries** disparadas a la vez sobre el mismo carril |
| 7 | [`useAiChat`](../../client/src/components/ai/useAiChat.js) | El contexto vivo manda `rows.slice(0, 500)` con todas las columnas al prompt y a `query_cache` | 500 × 2700 = **1.35 M valores** serializados |

**Orden de culpabilidad para el síntoma que viste** (editor trabado al abrir): 1 → 2 → 3.
Los puntos 4-6 son bombas que explotan si además abres el Data Profiler; el 7 si usas la IA.

---

## Principio de diseño

Introducir un **presupuesto de celdas** (`CELL_BUDGET`) como concepto transversal: la UI
nunca monta más de ~15 000 celdas a la vez, y el servidor nunca genera queries cuyo tamaño
crezca con n². Cuando el resultado excede el presupuesto, la app **no se degrada en
silencio**: lo dice y ofrece controles.

---

## Fase 0 — Guardas (impide el cuelgue) · *prioridad máxima, bajo riesgo*

Objetivo: que un resultado ancho **nunca** congele la app, aunque la experiencia sea parcial.

1. **`pageSize` adaptativo** en `ResultsTable`: derivar el tamaño de página del número de
   columnas en vez de fijarlo en 50.
   `pageSize = clamp(round(CELL_BUDGET / columns.length), 5, 100)`
   → con 2700 columnas: 5 filas por página (13 500 celdas) en lugar de 135 000.
2. **Aviso de resultado ancho**: si `columns.length > WIDE_THRESHOLD` (~150), mostrar una
   barra: *"Resultado muy ancho: 2700 columnas. Se muestran las primeras N; usa el selector
   de columnas."* Con enlace al selector de la Fase 1.
3. **Filtros solo bajo demanda**: no montar la fila de filtros cuando hay más de
   `WIDE_THRESHOLD` columnas salvo que el usuario la active explícitamente, y aun así solo
   para las columnas visibles.

**Entregable**: la app deja de trabarse; se ve poco pero responde.

---

## Fase 1 — `ResultsTable`: ventaneo de columnas · *el arreglo visible*

1. **Quitar el `title` por celda** (`ResultsTable.jsx:614`). Es el costo oculto más caro:
   135 000 `JSON.stringify`/`String` por render. Sustituir por tooltip bajo demanda
   (`onMouseEnter` que calcula el texto en ese momento, o mostrar el valor completo en el
   panel de detalle al hacer clic). **Este cambio solo ya da una mejora grande y no cambia
   la UX de forma perceptible.**
2. **Ventana de columnas** (sin virtualización): mostrar como máximo `MAX_VISIBLE_COLS`
   (~60) y añadir en la barra de resultados:
   - Paginador horizontal: `Columnas 1-60 de 2700` con ‹ ›.
   - **Selector de columnas** con buscador y checkboxes, para fijar las que interesan.
     Persistir la selección por pestaña (mismo mecanismo que `viewMode`/`chartConfig`).
3. **Filtros y orden** operan solo sobre columnas visibles/seleccionadas.
4. **Export sin recorte**: el export (CSV/Parquet/Excel) debe seguir usando **todas** las
   columnas, no solo las visibles. Verificar `runExportWorker`.

**Entregable**: navegable de verdad con miles de columnas.

---

## Fase 2 — `/api/profile`: matar la explosión cuadrática · *el riesgo más serio*

1. **Correlaciones acotadas**: seleccionar como máximo `MAX_CORR_COLS` (~25-30) columnas
   numéricas (criterio: mayor varianza / cardinalidad, descartando constantes) →
   máximo ~435 pares en vez de 2 000 000. Informar en la respuesta que se acotó
   (`correlationsLimited: true`) y mostrarlo en la UI.
2. **Agregados por lotes**: partir `advancedSelects` en bloques de ~200 columnas y ejecutar
   los bloques con concurrencia limitada, en vez de un SELECT gigante.
3. **Visuales por lotes con límite de concurrencia**: hoy es `Promise.all` de 2700 queries
   (`server/index.js:3758`). Cambiar a:
   - agrupar varias columnas de texto por query (`UNION ALL` de sus top-5), y
   - un limitador de concurrencia (~8 en vuelo) para el resto.
4. **Perfilado parcial por defecto** cuando `columns > WIDE_THRESHOLD`: perfilar las
   primeras N columnas (o las seleccionadas en la tabla) y ofrecer *"perfilar el resto"*.

**Entregable**: el profiler responde en tablas anchas en vez de colgar el motor.

---

## Fase 3 — Transporte (opcional, si tras 0-2 sigue pesado)

- Guarda de columnas en `/api/query`: parámetro `maxColumns` con recorte y bandera
  `columnsTruncated` para que la UI lo comunique. Ojo: cambia el contrato del endpoint;
  hacerlo opt-in desde el cliente.
- Alternativa más eficiente sin recortar: enviar el resultado en formato **columnar**
  (`{ columns: [...], values: [[...]] }`) en vez de un objeto por fila — elimina la
  repetición de 2700 claves × 1000 filas del JSON. Es el cambio con mejor relación
  peso/beneficio, pero toca a todos los consumidores del resultado.

---

## Fase 4 — Contexto de IA

- Acotar el contexto vivo a `MAX_CTX_COLS` (~40 columnas) y `~50` filas, indicando en el
  prompt que el resultado fue recortado y cuántas columnas hay en total. Hoy manda 500
  filas completas (punto 7), lo que además puede reventar la ventana del modelo.

---

## Verificación

No hay tests en el repo, así que se valida ejercitando la app:

1. **Repro sintético** (rápido, sin depender del Excel de 350 MB):
   `CREATE TABLE wide AS SELECT * FROM (SELECT 1) , ...` — o más simple, generar con
   `SELECT {2700 columnas} FROM range(1000)` vía un script. Medir:
   - tiempo hasta que la tabla responde al scroll,
   - tiempo del Data Profiler,
   - memoria del renderer.
2. **Caso real**: el Excel de 2700 columnas en la Precision.
3. **No regresión**: un resultado normal (10-30 columnas) debe verse y comportarse igual
   que hoy — `pageSize` 50, filtros completos, sin banners.

---

## Decisión pendiente

La solución de libro para el eje horizontal sería **virtualizar columnas** (renderizar solo
las visibles y reciclar nodos), que resolvería el problema sin cambiar la UX. CLAUDE.md lo
prohíbe por malas experiencias previas — pero esa prohibición nació de intentos de
virtualizar **filas** en `ResultsTable`. Este plan asume que la regla se mantiene y resuelve
por ventaneo/paginación de columnas, que es más simple y predecible.

**A confirmar**: ¿mantenemos la prohibición también para el eje de columnas, o se evalúa
virtualización horizontal como Fase 5 si el ventaneo no basta?

---

## Registro de implementación (2026-07-30)

Fase 0 y Fase 1 implementadas en `client/src/components/ResultsTable.jsx` + estilos en
`client/src/index.css`. Rama `claude/wide-results-perf` (desde `main` tras mergear los
PR #91 y #92).

**Fase 0 — Guardas:**
- `pageSize` adaptativo por `CELL_BUDGET` (15 000 celdas) al recibir un resultado nuevo:
  `clamp(floor(CELL_BUDGET / colCount), 5, 50)`. Para tablas normales (≤300 columnas)
  sigue resolviendo a 50 (sin cambio de comportamiento); para 2700 columnas da 5.
- Opciones del `<select>` de tamaño de página acotadas por `maxSafePageSize` (calculado
  sobre las columnas *visibles*, no el total) — nunca se ofrece un tamaño que reviente
  el presupuesto.
- Banner "Resultado muy ancho" cuando `columns.length > WIDE_THRESHOLD` (150), con enlace
  directo al selector de columnas.
- La fila de filtros solo renderiza inputs para las columnas visibles (ya no 2700).

**Fase 1 — `ResultsTable`:**
- **Tooltip por celda pasó de eager a lazy**: antes cada `<td>` computaba
  `JSON.stringify`/`String()` en cada render (135 000 conversiones con 50×2700). Ahora se
  computa una sola vez, en `onMouseEnter`, solo para la celda bajo el cursor.
- **Ventaneo de columnas**: con >150 columnas se renderizan como máximo `MAX_VISIBLE_COLS`
  (60) por vez, con paginador horizontal (‹ 1/45 ›).
- **Selector de columnas** (buscador + checkboxes) que permite fijar columnas específicas,
  anulando el ventaneo automático. El primer toggle "siembra" la selección desde la
  ventana visible, así desmarcar una columna conserva las demás 59.
- Export (CSV/JSON/clipboard) y "Copy all column names" siguen usando la lista **completa**
  de columnas — no se tocó `data`/`sortedData`, solo qué nombres de columna se renderizan
  en el DOM.

**Validado en navegador** (Vite + server standalone en `localhost:3001`, tabla real de
2700 columnas × 1000 filas generada con `CREATE TABLE ... SELECT ... FROM range(1000)`):
- 2700 cols → banner correcto, 60 columnas renderizadas (no 2700), `pageSize` inicial 5,
  opciones de página `[5, 50, 100]` (500/1000 ocultas), 300 celdas en el DOM en vez de
  2.7M.
- Paginador de columnas (`c0-c59` → `c60-c119`), selector con buscador y checkboxes,
  botón "Reset" — todos correctos.
- Tooltip: sin `title` en el DOM hasta el primer hover; al simular el hover aparece con
  el valor real de la celda.
- Fila de filtros: 60 inputs (no 2700) con la tabla ancha.
- **Tabla normal (5 columnas)**: cero regresión — sin banner, sin botón de selector,
  `pageSize` 50 por defecto, opciones `[50, 100, 500, 1000]` idénticas a antes.
- Sin errores de consola en ningún caso.

Pendiente (fuera de alcance de hoy): Fase 2 (correlaciones O(n²) y queries de perfil por
columna en `/api/profile`), Fase 3 (payload columnar), Fase 4 (contexto de IA acotado).
