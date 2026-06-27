# Plan de implementación — Rendimiento de UI (cambio de pestaña/panel)

> Objetivo: que cambiar de panel/pestaña en el
> sidebar (Files↔DB, etc.) se sienta **instantáneo**, eliminando el re-render en cascada de React.
> Causa raíz: `activeSidebarTab` vive en `App.jsx`; al cambiar, re-renderiza todo el IDE (árbol JSX
> inline gigante) porque el área del editor y los paneles **no están aislados/memoizados** y reciben
> **props inline** que cambian de identidad en cada render.

**Regla de oro del plan:** medir con el **React DevTools Profiler** antes y después de cada fase.
No optimizar a ciegas; confirmar que el componente objetivo deja de re-renderizar.

**Alcance / límites:**
- NO tocar `ResultsTable` (paginada, va bien; virtualización vetada SOLO ahí).
- Virtualización permitida en otras listas/árboles, pero es **fase posterior y condicional** (P7) —
  el problema actual NO se arregla con virtualización.

---

## Fase 0 — Baseline (medición) · *obligatoria antes de tocar nada*
1. Abrir el IDE con un proyecto real (DB con varias tablas/esquemas).
2. React DevTools → Profiler → "Record" → click **Files→DB** → "Stop".
3. Anotar: qué componentes re-renderizan (flame graph) y el **commit duration** (ms). Repetir
   DB→Files, abrir/cerrar AI, abrir una pestaña de archivo.
4. **Entregable:** nota con el baseline (lista de componentes que re-renderizan + ms). Sirve de
   referencia para validar cada fase.

Esperado en baseline (hipótesis a confirmar): re-renderizan `LayoutManager`, `EditorPane`,
`DatabaseExplorer`, `ExtensionExplorer`, y posiblemente el área del editor entera.

---

## Fase 1 — Aislar el editor de la navegación (P1a + P2) · *núcleo, mayor impacto*

### 1.1 Estabilizar los props de `LayoutManager` (`client/src/App.jsx`)
- **`mergedEditorSettings`** (App.jsx:182): hoy es `const obj = {...}` → recreado cada render.
  Cambiar a `const mergedEditorSettings = useMemo(() => ({ ... }), [editorSettings, /* deps reales */])`.
  ⚠️ Revisar qué mezcla para poner las deps correctas (no omitir ninguna o habrá settings stale).
- Envolver en **`useCallback`** (con deps correctas, preferir functional updates `setX(prev => ...)`):
  - `onDbChange` → `useCallback(() => setRefreshDbTrigger(p => p + 1), [])`
  - `onRequestSaveAs` → `useCallback((content, tab) => { setPendingSaveContent(content); setPendingSaveTab(tab); setIsSaveModalOpen(true); }, [])`
  - `onQueryResult` → `useCallback(() => {}, [])` (estable)
  - `onToggleAi` → `useCallback(() => setShowAiSidebar(v => !v), [])`
  - `onTabsChange` → `useCallback((tabData) => { setTitleBarTabs(tabData); setActiveTabInfo(layoutRef.current?.getActiveTabInfo() || null); }, [])`
  - `onShowHistorySidebar` → `useCallback(() => { setSidebarCollapsed(false); setActiveSidebarTab('history'); }, [])`
- Verificar estabilidad de los demás (`theme`, `editorLayout`, `editorSettings`, `availableTables`,
  `projectPath`): son state/derivado → OK (no cambian al navegar el sidebar).

### 1.2 Memoizar `LayoutManager` (`client/src/components/LayoutManager.jsx`)
- Es `forwardRef` (línea 15). Patrón válido: `export default memo(LayoutManager)` (LayoutManager ya es
  `forwardRef(...)`). Importar `memo` de React. (línea 1074)

### 1.3 Memoizar `EditorPane` (`client/src/components/EditorPane.jsx`)
- `export default memo(EditorPane)` (línea 659). Auditar que `LayoutManager` le pasa callbacks estables
  (si LayoutManager re-renderiza internamente por su propio estado, EditorPane memoizado solo re-render
  si sus props cambian).

### 1.4 **Medir** (Profiler): el click Files→DB ya NO debe re-renderizar `LayoutManager`/`EditorPane`/Monaco.

### 1.5 Memoizar los paneles del sidebar + estabilizar sus props inline
Para cada panel keep-alive: `export default memo(Componente)` **y** estabilizar los props arrow inline
que recibe en App.jsx con `useCallback`.
- **`DatabaseExplorer`** (sin memo hoy): memo + estabilizar `onSelectQuery`, `onQualityCheck`,
  `onOpenErDiagram` (App.jsx:1047-1050). (`currentDb`, `onRefresh`, `onTablesLoaded=setAvailableTables`
  ya son estables.)
- **`ExtensionExplorer`** (sin memo): memo.
- **`DbtPanel`, `SnippetsPanel`, `QueryHistoryPanel`, `GitPanel`, `ConversationList`, `AnalysisVault`**:
  memo + estabilizar sus props inline (`onInsert`, `onSelect`, `onFileOpen`, `onOpenInEditor`, etc.).
- **`FileExplorer`** ya está memoizado (FileExplorer.jsx:1049) — verificar que App le pasa `useCallback`
  (handleFileClick/handleFileOpen ya lo son ✓).

### 1.6 **Medir** de nuevo: un cambio de pestaña no debe re-renderizar ningún panel salvo el cambio de
`className`/`display` de los wrappers (barato).

---

## Fase 2 — Lazy-on-visible: pausar trabajo en paneles ocultos (P3)
Patrón "visible-then-work": "vivo en DOM ≠ trabajando".
1. Derivar `isActive = activeSidebarTab === '<id>'` y pasarlo a cada panel.
2. **Auditar panel por panel** qué trabajo corre estando oculto y gatearlo:
   - Fetch al cambiar `currentDb`/`refreshDbTrigger` (DatabaseExplorer) → si está oculto, marcar
     "pendiente de refrescar" y ejecutar al volverse visible, no inmediatamente.
   - `setInterval`/timers, `ResizeObserver`, listeners globales, polling de IA/extensiones.
3. Patrón: `useEffect(() => { if (!isActive) return; /* trabajo */ }, [isActive, ...])`.

---

## Fase 3 — rAF-batch al redimensionar (P4) · *solo si Profiler/observación muestran jank*
Patrón medir-luego-mutar dentro de `requestAnimationFrame` para evitar layout thrashing.
- Localizar handlers de resize: arrastre de split en `LayoutManager`, rebuild de tema de Monaco,
  `ResizeObserver` del chart.
- Agrupar lecturas (getBoundingClientRect) y escrituras (estilos) en un `requestAnimationFrame`;
  usar `ResizeObserver` (ya entrega medidas batcheadas) y coalescer con rAF.

---

## Fase 4 — Diferir arranque no crítico al idle (P5)
Equivale a `runWhenWindowIdle` (`dom.ts:335-347`).
- Identificar trabajo no urgente en `startIdeSession`/mount (perfilado de esquema completo,
  subsistema IA, historiales) y envolverlo en `requestIdleCallback` (fallback `setTimeout`).
- Crítico primero: Monaco + primera query. Lo demás, en idle.

---

## Fase 5 — Virtualización donde aporte (P7) · *condicional, posterior*
- Solo si el Profiler señala un árbol/lista concreto como cuello (p. ej. árbol de esquema con cientos
  de tablas/columnas expandidas, File Explorer con carpetas enormes).
- Empezar por **`content-visibility: auto`** (CSS nativo, P6) — más barato. Si no basta, virtualizar
  **ese** componente. **Nunca `ResultsTable`.**

---

## Riesgos y mitigaciones
- **Stale closures** por deps mal puestas en `useCallback`/`useMemo` → usar functional updates
  (`setX(prev => ...)`) para minimizar deps; revisar cada dep.
- **`memo(forwardRef)`** → patrón soportado; cuidar que el `ref` siga funcionando (layoutRef).
- **Memoización rota por otros props inline** (objetos/arrays creados en el JSX) → revisar TODOS los
  props del componente memoizado, no solo los callbacks.
- **No memoizar de más** sin medir: cada memo añade comparación de props; el valor está en los
  componentes caros (editor, paneles), no en hojas triviales.

## Criterio de "hecho" por fase
Medir antes/después en el Profiler. "Hecho" = el componente objetivo deja de aparecer re-renderizado en
el flame graph al navegar, y el click se siente instantáneo.

## Estimación de impacto
- **Fase 1 concentra la mayor parte de la mejora** (el editor deja de reconciliar al navegar).
- Fase 2 elimina trabajo de fondo invisible. Fases 3-5 son afinado donde se mida jank real.

---

## Referencias
- Puntos AmoxSQL: App.jsx:111 (estado nav), App.jsx:182 (mergedEditorSettings), App.jsx:1235-1263
  (props LayoutManager), LayoutManager.jsx:15/1074 (forwardRef/export), EditorPane.jsx:659,
  DatabaseExplorer.jsx (sin memo).
