# Auditoría de rendimiento de UI — AmoxSQL vs VS Code

> Objetivo: entender por qué cambiar de pestaña/panel en AmoxSQL se siente lento, usando
> **VS Code como referente** de "UI instantánea", y derivar acciones concretas (no optimizar
> a ciegas). Foco: rendimiento de la **interfaz** (abrir menús, cambiar de vista/panel, abrir
> cosas), NO el motor del editor de texto.
>
> Método: se clonó VS Code (`microsoft/vscode`, shallow) en `_refs/vscode/` (excluido de git) y
> se analizó el **código real**. Referencias `archivo:línea` apuntan a `_refs/vscode/src/vs/`.

---

## 1. Cómo VS Code logra el cambio de vista instantáneo

El núcleo está en `CompositePart` (base de sidebar/panel/auxiliary bar). Cinco ideas:

1. **El DOM de una vista se construye UNA sola vez y se retiene.** `composite.create(container)` se
   invoca una vez en toda la sesión (`composite.ts:106-108`); el contenedor se guarda en
   `mapCompositeToCompositeContainer` (`compositePart.ts:72`). Cambiar de viewlet = `appendChild`
   de un subárbol ya construido + `setVisible(true)` (`compositePart.ts:234-257`). **No se reconstruye DOM.**

2. **Ocultar = sacar del DOM, NO destruir.** `hideActiveComposite()` hace `setVisible(false)` +
   `container.remove()`, pero conserva el nodo en el mapa (`compositePart.ts:374-403`). La vista oculta
   sigue viva en memoria, lista para re-montarse al instante. `dispose()` solo ocurre al desregistrar
   la vista o cerrar la ventana — **nunca al navegar**.

3. **Creación perezosa.** La instancia y su DOM solo nacen la primera vez que abres esa vista
   (`compositePart.ts:181-205`). Lo que no has abierto, no existe.

4. **Trabajo perezoso gobernado por visibilidad.** Una vista pesada NO trabaja mientras está oculta.
   El Explorer de archivos carga el árbol solo al hacerse visible:
   `onDidChangeBodyVisibility(visible => { if (visible) this.setTreeInput() })` (`explorerView.ts:325-334`).
   `setVisible` propaga hacia abajo **solo** a las vistas cuya visibilidad cambió (`viewPane.ts:419-435`).

5. **Sin virtual-DOM = sin re-render en cascada.** VS Code usa DOM imperativo + "Parts". `setVisible`
   solo togglea un booleano (`composite.ts:132-136`); el trabajo real lo decide cada vista reaccionando
   al evento. No existe "el padre cambió, re-renderizo todo el subárbol".

**Extras de responsividad:**
- **rAF-batching read/write** para evitar layout thrashing: `measure()` = prioridad alta, `modify()` =
  prioridad baja, en una única cola por `requestAnimationFrame` (`dom.ts:464-506`). Todas las lecturas
  del DOM antes que todas las escrituras.
- **Diferir al idle** lo no crítico: `runWhenWindowIdle`/`WindowIdleValue` (`dom.ts:335-347`).
- **Virtualización** de listas/árboles: solo el rango visible, reciclando nodos (`listView.ts`, `rowCache.ts`),
  con `contain: strict` + `translate3d` para aislar el scroll de la composición global.

---

## 2. Diagnóstico de AmoxSQL — por qué se siente lento

**Lo que YA está bien (estilo VS Code):**
- Los paneles del sidebar son **keep-alive**: se montan en la primera visita y se ocultan con
  `display:none/flex` (App.jsx, bloque de paneles `visitedSidebarTabs`). Equivale a retener el DOM. ✓
- `SqlEditor` (Monaco) y `FileExplorer` están envueltos en `React.memo`. ✓

**La causa real de la lentitud (anti-patrón React):**
1. **Estado de navegación en el componente raíz.** `activeSidebarTab` vive en `App.jsx` (línea 111).
   Cambiarlo re-renderiza **todo** el JSX del IDE, que es un único árbol inline gigante en `App`
   (líneas ~908-1372).
2. **El área del editor NO está aislada ni memoizada.** `LayoutManager`, `EditorPane`,
   `DatabaseExplorer`, `ExtensionExplorer` **no** usan `React.memo`. Al re-renderizar `App`, se
   re-renderizan también.
3. **Props inestables rompen cualquier memoización.** `LayoutManager` (App.jsx:1235) recibe múltiples
   **arrow-functions inline** (`onDbChange`, `onRequestSaveAs`, `onQueryResult={() => {}}`, `onToggleAi`,
   `onTabsChange`, `onShowHistorySidebar`) y objetos recreados (`mergedEditorSettings`). Cada render de
   `App` les da identidad nueva → aunque memoizáramos `LayoutManager`, **igual re-renderizaría**.

**Resultado:** un clic en Files→DB no es un "toggle de display" barato (como en VS Code), sino un
re-render de todo el árbol del IDE, incluida la reconciliación de toda el área del editor. Monaco en sí
no se re-monta (está memoizado), pero el trabajo de reconciliación alrededor es notable.

**Posible segundo factor a verificar:** ¿algún panel oculto sigue "trabajando" (timers, observers,
fetch) mientras está en `display:none`? VS Code lo evita con el patrón lazy-on-visible. Hay que
auditar panel por panel si hay trabajo que pausar.

---

## 3. Recomendaciones (priorizadas, respetando las reglas del repo)

> **Regla del repo (matizada por el autor):** la prohibición de virtualización aplica **solo a la
> tabla de resultados de una query** (`ResultsTable`), donde `@tanstack/react-virtual` hizo la app
> exageradamente lenta — ahí se **pagina** y la tabla está bien así. **En el resto de la app la
> virtualización SÍ está permitida** si aporta (igual que VS Code, que es también una app de escritorio,
> la usa en todos sus árboles/listas). Es decir: no es "no virtualizar", es "no virtualizar la tabla de
> resultados con esa librería".
>
> Importante: la lentitud al cambiar de pestaña **no se arregla con virtualización** — es un problema de
> re-render (P1/P2/P3). La virtualización es una herramienta aparte para listas/árboles grandes (ver P7).

**P1 — Aislar el estado de navegación del área del editor (mayor impacto).**
Que cambiar `activeSidebarTab` NO re-renderice el editor. Dos vías:
- (a) **Memoización + props estables:** envolver `LayoutManager` en `React.memo` y **estabilizar todos
  sus props** con `useCallback`/`useMemo` (las 6 arrow inline + `mergedEditorSettings`). Es la vía de
  menor riesgo y alto impacto.
- (b) **Aislar el subtree del sidebar:** extraer el sidebar (activity bar + paneles + su `activeSidebarTab`)
  a un componente propio que posea ese estado, para que `App` no re-renderice por navegar. Más limpio,
  más refactor.
Recomendado: empezar por (a); considerar (b) después.

**P2 — Memoizar los paneles pesados.** `DatabaseExplorer`, `ExtensionExplorer`, `LayoutManager`,
`EditorPane` → `React.memo`. Junto con P1 (props estables), un cambio de pestaña deja de re-renderizar
lo que no cambió.

**P3 — Lazy-on-visible: pausar trabajo en paneles ocultos.** Pasar a cada panel una prop `isVisible` y
hacer que su trabajo caro (fetch, suscripciones, animaciones, observers) corra solo cuando
`isVisible === true`. Equivale a `onDidChangeBodyVisibility` (`explorerView.ts:325`). "Vivo en DOM ≠ trabajando".

**P4 — rAF-batch de medidas/escrituras al redimensionar paneles.** Si redimensionar splits o recalcular
el tema de Monaco causa jank, agrupar lecturas y escrituras del DOM en un `requestAnimationFrame`
(equivalente a `measure`/`modify`, `dom.ts:464-506`). Usar `ResizeObserver` (ya entrega medidas batcheadas).

**P5 — Diferir trabajo no crítico de arranque al idle.** `requestIdleCallback` (con fallback `setTimeout`)
para precargas no urgentes (perfilado de esquema, subsistema IA, historiales). Monaco + primera query primero.

**P6 (CSS nativo, bajo esfuerzo) — `content-visibility: auto`** en secciones/paneles largos para que el
navegador omita render de lo fuera de viewport sin código de virtualización. Buena primera opción cuando
una lista crece pero no es enorme. Medir antes de adoptar.

**P7 (virtualización donde aporte — AHORA permitido fuera de `ResultsTable`).** VS Code virtualiza TODOS
sus árboles/listas (`listView.ts`) y por eso un árbol de 100k nodos mantiene ~30-50 filas en el DOM. En
AmoxSQL tiene sentido **si** alguna lista/árbol se vuelve grande:
- **Árbol de esquema de BD** (`DatabaseExplorer`) — con cientos de tablas/columnas expandidas, virtualizar
  el árbol reduce el nº de nodos y abarata tanto el render inicial como los re-renders.
- **File Explorer** con carpetas muy grandes; listas largas de snippets/historial/extensiones.
- **NO** en `ResultsTable` (ahí se paginó por la mala experiencia previa con `@tanstack/react-virtual`).
Recomendación: medir primero; si una lista concreta es el cuello de botella, virtualizarla (o empezar por
P6 `content-visibility` que es más barato). No virtualizar "por si acaso".

**Lo que NO conviene trasladar:** el sistema "Part/Composite" completo (es la alternativa de VS Code a
tener framework; React ya da el árbol) y el reciclaje manual de nodos DOM (en React lo gestiona el
reconciliador vía `key`; una librería de virtual-list ya lo hace por ti).

---

## 4. Plan de implementación sugerido
1. **P1(a) + P2** juntos (memoización + estabilización de props) — medir antes/después con el React DevTools Profiler (grabar un clic Files→DB).
2. **P3** panel por panel (auditar qué trabaja oculto).
3. **P4/P5** según dónde se observe jank real (no especular).
4. Reevaluar si hace falta **P1(b)** (aislar el sidebar) tras medir.

> Nota de método (lección de la sesión): medir con el Profiler antes de cada cambio para no optimizar a
> ciegas y confirmar el impacto real.

---

### Apéndice — referencias VS Code
- Cache + retención DOM: `compositePart.ts:72,181-205,234-257,374-403`
- create-una-vez / setVisible barato: `composite.ts:106-108,132-136`
- lazy-on-visible: `viewPane.ts:419-435`, `explorerView.ts:325-334`
- rAF batching (measure/modify): `dom.ts:464-506`; idle: `dom.ts:335-347`
- virtualización: `listView.ts:908-950,418-423`, `rowCache.ts:31-92`, `rangeMap.ts:158-191`

### Lado AmoxSQL
- Estado de navegación en raíz: `client/src/App.jsx:111`
- IDE como árbol inline gigante: `client/src/App.jsx:~908-1372`
- Props inline a LayoutManager: `client/src/App.jsx:1235-1263`
- Sin memo: `DatabaseExplorer.jsx`, `LayoutManager.jsx`, `EditorPane.jsx`, `ExtensionExplorer.jsx`
- Con memo (referencia): `FileExplorer.jsx:1049`, `SqlEditor.jsx:1040`
