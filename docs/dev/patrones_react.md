# AmoxSQL — Patrones y Convenciones React

> Patrones establecidos en el codebase. Seguirlos garantiza consistencia y evita regresiones de performance.  
> Stack: React 19.2 + Vite 7.2. Sin Redux/Zustand. Sin SSR.

---

## 1. State Management

### 1.1 La Regla General

No hay store global. El estado sigue esta jerarquía:

```
localStorage / sessionStorage
    ↓ (estado persistente entre sesiones)
useState en App.jsx o componente raíz
    ↓ (props drilling hacia abajo)
useState local en el componente
    ↓ (estado efímero, no compartido)
useRef (estado que no dispara re-render)
```

No agregar Redux, Zustand, Jotai ni ningún state manager global. Si el prop drilling se vuelve incómodo, crear un `Context` dedicado para ese slice de estado.

### 1.2 Estado Persistente con localStorage

Inicializar desde localStorage en el `useState` para que sobreviva reinicios:

```javascript
// ✅ Patrón correcto — inicializa desde localStorage
const [theme, setTheme] = useState(
  () => localStorage.getItem('amoxsql-theme') || 'dark'
);

// Persistir al cambiar
useEffect(() => {
  localStorage.setItem('amoxsql-theme', theme);
}, [theme]);
```

**Keys activas documentadas en [`decisiones_tecnicas.md`](decisiones_tecnicas.md) DT-04.**

### 1.3 Estado de Sesión con sessionStorage

Para estado que debe resetearse al cerrar la ventana pero persistir durante la sesión:

```javascript
// Tabs abiertos — se restauran si el usuario navega pero no si cierra la app
const [openTabs, setOpenTabs] = useState(() => {
  try {
    return JSON.parse(sessionStorage.getItem('amoxsql-open-tabs')) || [];
  } catch { return []; }
});
```

---

## 2. Fases de la Aplicación

`App.jsx` gestiona fases de alto nivel con render condicional:

```javascript
// Las únicas fases actualmente
const PHASE = { WELCOME: 'WELCOME', IDE: 'IDE' };

const [appPhase, setAppPhase] = useState(PHASE.WELCOME);

// En render:
if (appPhase === PHASE.WELCOME) {
  return <WelcomeScreen onOpenProject={handleOpenProject} />;
}
// Si no → IDE phase
return <div className="app-container">...</div>;
```

**Para agregar una fase nueva:** agregar la constante en `PHASE`, agregar la condición en el render de `App.jsx`, y asegurarse de que la transición sea explícita (el usuario debe hacer algo para avanzar, no auto-avanzar por timeout).

---

## 3. Lazy Loading de Componentes Pesados

Los modales y paneles que no se necesitan en el arranque inicial se cargan con `React.lazy()`. Esto evita que el bundle inicial bloquee el main thread de V8 al arrancar Electron.

### 3.1 Patrón

```javascript
// App.jsx — al nivel de módulo (fuera del componente)
const SettingsModal     = lazy(() => import('./components/SettingsModal'));
const DataQualityModal  = lazy(() => import('./components/DataQualityModal'));
const SchemaDiffModal   = lazy(() => import('./components/SchemaDiffModal'));
const ExecutionChainModal = lazy(() => import('./components/ExecutionChainModal'));

// En el JSX del componente:
<Suspense fallback={null}>
  {isSettingsOpen && <SettingsModal isOpen={true} onClose={...} />}
</Suspense>
```

`fallback={null}` es intencional — los modales son aditivos (aparecen sobre el contenido existente), no necesitan placeholder.

### 3.2 Cuándo Hacer un Componente Lazy

- Si el componente pesa más de ~50KB (JSX + lógica)
- Si solo se muestra en respuesta a acción del usuario (modal, panel opcional)
- Si importa librerías pesadas que no se usan en el arranque inicial

**Componentes que NO deben ser lazy:** todo lo que está visible inmediatamente al abrir la app (ActivityBar, FileExplorer, LayoutManager, SqlEditor).

---

## 4. Keep-Alive de Paneles del Sidebar

Los paneles del sidebar (FileExplorer, DatabaseExplorer, DbtPanel, etc.) se montan **una sola vez** y se muestran/ocultan con `display`. Esto evita que cada cambio de tab dispare remount + refetch de datos.

### 4.1 Patrón

```javascript
// App.jsx
const [activeSidebarTab, setActiveSidebarTab] = useState('files');
const [visitedSidebarTabs, setVisitedSidebarTabs] = useState(() => new Set(['files']));

// Marcar tab como visitada (esto dispara el mount)
useEffect(() => {
  setVisitedSidebarTabs(prev =>
    prev.has(activeSidebarTab) ? prev : new Set(prev).add(activeSidebarTab)
  );
}, [activeSidebarTab]);

// En el render — montar solo si fue visitada, mostrar solo si está activa
{visitedSidebarTabs.has('files') && (
  <div style={{ display: activeSidebarTab === 'files' ? 'flex' : 'none', ... }}>
    <FileExplorer ... />
  </div>
)}
```

### 4.2 Cuándo NO usar Keep-Alive

Si el panel necesita datos frescos cada vez que se abre (ej: un feed de tiempo real), el remount puede ser deseable. En ese caso, renderizar condicionalmente sin el patrón `visitedTabs`.

---

## 5. forwardRef + useImperativeHandle

`LayoutManager` necesita que `App.jsx` lo controle de forma imperativa (abrir archivo, correr query, crear tab). El patrón es:

```javascript
// LayoutManager.jsx
const LayoutManager = forwardRef(({ ...props }, ref) => {
  useImperativeHandle(ref, () => ({
    handleTriggerRun: () => { /* ... */ },
    createNew: (type) => { /* ... */ },
    openFile: (path, content, type) => { /* ... */ },
    getActiveTabInfo: () => { /* ... */ },
    closeTab: (tabId) => { /* ... */ },
  }), []); // dep array vacío — los métodos son estables

  return <div>...</div>;
});

// App.jsx
const layoutRef = useRef(null);

// Uso
layoutRef.current?.openFile(path, content, 'sql');
```

### 5.1 Cuándo Usar

- Cuando un componente padre necesita disparar acciones en un hijo **sin pasar props hacia arriba** (callback hell).
- Cuando el componente hijo tiene estado propio que gestiona internamente y solo expone operaciones específicas.

### 5.2 Cuándo NO Usar

- Si el estado puede subir al padre via lifting state up.
- Si hay 1-2 callbacks simples — props directas son más claras.

---

## 6. useDeferredValue para Búsqueda No Bloqueante

Cuando hay inputs de búsqueda o filtro que disparan recálculos costosos, usar `useDeferredValue` para no bloquear la UI mientras el usuario escribe.

```javascript
// ResultsTable.jsx
const [globalSearch, setGlobalSearch] = useState('');
const deferredGlobalSearch = useDeferredValue(globalSearch);

// El input responde instantáneamente
<input value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} />

// El filtrado usa el valor diferido — se actualiza cuando el browser tiene tiempo
const filteredRows = useMemo(() => {
  return rows.filter(row => matchesSearch(row, deferredGlobalSearch));
}, [rows, deferredGlobalSearch]);
```

### 6.1 Cuándo Aplicar

- Filtros sobre listas de >100 items
- Búsquedas que disparan re-renders de tablas grandes
- Cualquier cálculo en `useMemo` que dependa de input del usuario y tarde >16ms

---

## 7. Refs para Evitar Stale Closures

Cuando un callback asíncrono necesita acceder al state más reciente (no el del momento en que se creó el closure), usar un ref sincronizado:

```javascript
// SqlNotebook.jsx — patrón para callbacks asíncronos que necesitan state fresco
const [cellStates, setCellStates] = useState({});
const cellStatesRef = useRef({});

// Mantener ref en sync
useEffect(() => {
  cellStatesRef.current = cellStates;
}, [cellStates]);

// En el callback asíncrono, leer de ref (no de state)
const handleCellRun = useCallback(async (cellId) => {
  // ✅ Lee el estado actual, no el del closure
  const currentStates = cellStatesRef.current;
  // ...
}, []); // dep array vacío — el callback es estable
```

### 7.1 El Problema que Resuelve

```javascript
// ❌ Sin ref — stale closure
const handleRun = useCallback(async () => {
  await runQuery();
  // cellStates aquí es el valor del momento en que se creó el callback
  // si cellStates cambió mientras corría el query, esto es stale
  console.log(cellStates);
}, []); // ← dep vacío, closure captura el valor inicial
```

### 7.2 Cuándo Aplicar

- Callbacks que se pasan a `addEventListener`
- Handlers de eventos asíncronos (run query, save file)
- Cualquier función con dep array vacío `[]` que necesita state actualizado

---

## 8. requestAnimationFrame para Operaciones de Alta Frecuencia

Para operaciones que se disparan en `mousemove` u otros eventos de alta frecuencia, usar RAF para no sobrecargar el hilo principal:

```javascript
// ResultsTable.jsx — resize de columnas
const resizeRafRef = useRef(null);

useEffect(() => {
  const handleMouseMove = (e) => {
    if (!resizeState.isResizing) return;
    const delta = e.clientX - resizeState.startX;
    const newWidth = Math.max(50, resizeState.startWidth + delta);

    // Cancelar el frame anterior si no se procesó
    if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);

    // Programar la actualización de state en el próximo frame
    resizeRafRef.current = requestAnimationFrame(() => {
      setColumnWidths(prev => ({ ...prev, [resizeState.column]: newWidth }));
    });
  };

  if (resizeState.isResizing) {
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
    };
  }
}, [resizeState]);
```

### 8.1 Cuándo Aplicar

- `onMouseMove` con actualización de estado (resize, drag)
- Canvas o SVG que se actualiza continuamente
- Animaciones que no pueden usar CSS transitions

---

## 9. Patrones de Componentes

### 9.1 Estructura General de un Componente Grande

```javascript
// 1. Imports (React, librerías, componentes, iconos)
import { useState, useEffect, useRef, memo } from 'react';
import { LuSearch } from 'react-icons/lu';
import SubComponent from './SubComponent';

// 2. Constantes fuera del componente (no se recrean en cada render)
const DEFAULT_PAGE_SIZE = 50;
const MAX_COLUMNS = 20;

// 3. Componente (con memo si recibe props que cambian poco)
const MyComponent = memo(({ data, onAction }) => {
  // 3a. State (todos los useState juntos arriba)
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');

  // 3b. Refs
  const containerRef = useRef(null);

  // 3c. Valores derivados (useMemo)
  const filteredData = useMemo(() => /* ... */, [data, filter]);

  // 3d. Effects (después de la lógica)
  useEffect(() => { /* ... */ }, []);

  // 3e. Handlers (useCallback solo si se pasan como props a hijos)
  const handleFilter = (e) => setFilter(e.target.value);

  // 3f. Render
  return <div ref={containerRef}>...</div>;
});

export default MyComponent;
```

### 9.2 memo — Cuándo Usarlo

Wrappear con `memo` cuando:
- El componente es "puro" (mismo output para mismo input)
- Sus props cambian con poca frecuencia comparado con re-renders del padre
- El componente es costoso de renderizar (tablas, editores, gráficos)

**Componentes que siempre deben ser memo:** `ResultsTable`, `DataVisualizer`, `ChatMessage`, `NotebookCell`.

### 9.3 Inicialización Lazy de useState

Para inicializaciones costosas (leer localStorage, parsear JSON grande), usar la forma de función:

```javascript
// ✅ La función solo se ejecuta una vez (en el mount)
const [settings, setSettings] = useState(() => {
  try {
    return JSON.parse(localStorage.getItem('amoxsql-editor-settings')) || {};
  } catch {
    return {};
  }
});

// ❌ Esto ejecuta JSON.parse en cada render
const [settings, setSettings] = useState(
  JSON.parse(localStorage.getItem('amoxsql-editor-settings')) || {}
);
```

---

## 10. Paginación (en lugar de Virtualización)

`ResultsTable` implementa paginación simple. No usar virtualización. Ver [decisiones_tecnicas.md DT-03](decisiones_tecnicas.md).

```javascript
// Patrón de paginación
const [currentPage, setCurrentPage] = useState(1);
const [pageSize] = useState(50); // page size fijo

const paginatedRows = useMemo(() => {
  const start = (currentPage - 1) * pageSize;
  return filteredRows.slice(start, start + pageSize);
}, [filteredRows, currentPage, pageSize]);

const totalPages = Math.ceil(filteredRows.length / pageSize);
```

El estado de `currentPage` debe resetearse a 1 cuando cambian los filtros:

```javascript
useEffect(() => {
  setCurrentPage(1);
}, [deferredGlobalSearch, deferredColumnFilters]);
```
