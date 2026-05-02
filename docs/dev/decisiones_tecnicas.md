# AmoxSQL — Registro de Decisiones Técnicas

> Formato ADR-ligero: **Qué · Por qué · Consecuencias**  
> Cada decisión tiene fecha para saber si sigue vigente.

---

## DT-01 · Express en `utilityProcess` de Electron

**Fecha:** 2024  
**Qué:** El servidor Express (DuckDB + API REST) corre en un `UtilityProcess` de Electron, no en el main thread ni en el renderer.

**Por qué:**
- DuckDB tiene bindings nativos que no pueden correr en el contexto del renderer (sandboxed).
- El main thread de Electron es para IPC y window management — bloquear con queries DuckDB causaría freezes de UI.
- El renderer habla con `http://localhost:3001` (HTTP puro), lo que facilita debugging independiente con curl/Postman.

**Consecuencias:**
- El renderer **no puede usar IPC** para queries de datos — siempre usa fetch a `:3001`.
- En producción, `main.js` spawna `server-worker.js`; en dev, el server corre directamente con nodemon.
- Para debuggear el server: abrir DevTools de Electron, ir a "More tools > Processes" o usar `--inspect` en el utilityProcess.
- Los errores del server se loguean en stdout del proceso padre (main.js).

---

## DT-02 · DuckDB Neo API (`@duckdb/node-api`)

**Fecha:** 2024  
**Qué:** Se usa `@duckdb/node-api` (API nativa "Neo"), no el driver clásico `duckdb` npm.

**Por qué:**
- La API Neo es la API oficial actual de DuckDB para Node.js.
- Soporte nativo para async/await sin callbacks.
- Mejor manejo de tipos (BigInt, Date, etc.) y mejor performance.
- El driver clásico está en modo mantenimiento.

**Consecuencias:**
- El `postinstall` hook corre `electron-builder install-app-deps` para recompilar el módulo nativo contra el ABI de Electron. Si DuckDB falla al cargar después de `npm install`, re-correr `npm run postinstall`.
- La API es: `DuckDBInstance.create(path)` → `instance.connect()` → `conn.run(sql)`.
- Los resultados se leen con `.getRows()` o iteración de chunks. Ver `DatabaseManager.js`.

---

## DT-03 · Sin Virtualización de Listas/Tablas

**Fecha:** 2024 · **Vigente:** Sí — no cambiar sin evidencia clara de mejora.  
**Qué:** `ResultsTable` usa paginación simple (`pageSize=50`, `currentPage`). No se usa `@tanstack/react-virtual` ni ningún otro virtualizador.

**Por qué:** Intentos previos con virtualización causaron regresiones de performance en esta app. El overhead de recálculo de posiciones con columnas redimensionables, filtros activos y búsqueda global superaba el beneficio de no renderizar filas fuera de viewport.

**Consecuencias:**
- El DOM contiene máximo `pageSize` filas renderizadas (50 por defecto).
- Para conjuntos grandes, el usuario navega por páginas.
- Si en el futuro se quiere revisar esta decisión: hacer benchmark antes/después con tablas de 10k+ filas **con columnas redimensionables y filtros activos simultáneos**.

---

## DT-04 · State Management: Context + localStorage (sin Redux/Zustand)

**Fecha:** 2024  
**Qué:** No hay librería de state management global. Se usa `React.useState` + `React.createContext` (solo para ToastProvider) + `localStorage`/`sessionStorage`.

**Por qué:**
- La app tiene un árbol de componentes relativamente plano. El prop drilling es manejable.
- Evitar dependencias innecesarias que compliquen el bundle de Electron.
- El estado persistente va a `localStorage`, no a Redux store — funciona entre reinicios sin lógica extra.

**localStorage keys activas:**
```
amoxsql-theme           → string (nombre de tema)
amoxsql-accent          → string (nombre de acento)
amoxsql-editor-layout   → JSON (layout del editor)
amoxsql-editor-settings → JSON (settings de Monaco)
amoxsql-sidebar-width   → number (px)
amoxsql-ui-zoom         → number (factor 0.5-2.0)
```

**sessionStorage keys:**
```
amoxsql-open-tabs → JSON (tabs abiertos en la sesión)
```

**Consecuencias:**
- No hay store global accesible desde cualquier componente. Para compartir estado entre componentes hermanos, levantarlo al ancestro común.
- Si en el futuro se necesita estado reactivo complejo (ej: notificaciones cross-componente), usar un Context dedicado, no Redux.

---

## DT-05 · Sin Breakpoints CSS / Sin Responsive Design

**Fecha:** 2024  
**Qué:** No hay `@media (max-width: ...)` en el CSS. El layout es 100% desktop.

**Por qué:** AmoxSQL es una aplicación de escritorio Electron. No hay caso de uso mobile ni tablet. El layout usa flexbox con paneles redimensionables que el usuario ajusta a su gusto.

**Consecuencias:**
- Si la ventana se hace muy pequeña, la UI puede verse comprimida — es comportamiento esperado.
- El zoom se maneja vía `webContents.setZoomFactor()` (Ctrl+/Ctrl-/Ctrl+0), no con responsive breakpoints.
- **No agregar breakpoints** para "por si acaso" — añaden complejidad sin beneficio.

---

## DT-06 · oklch como Espacio de Color Base

**Fecha:** 2024  
**Qué:** Todos los colores de la UI se definen con `oklch(lightness chroma hue)`, no con HSL, RGB ni HEX.

**Por qué:**
- oklch tiene uniformidad perceptual: dos colores con la misma `lightness` en oklch se perciben igual de brillantes. En HSL no es así (amarillo parece más brillante que azul con el mismo L).
- `color-mix(in oklch, ...)` permite derivar variantes (muted, subtle, hover) manteniendo el hue original sin desviaciones de color.
- Facilita crear temas dark/light coherentes ajustando solo `lightness`.

**Consecuencias:**
- Nuevos colores de UI **deben usar oklch**. Usar `oklch(L C H)` en las definiciones.
- Para variantes de un color: `color-mix(in oklch, var(--accent-primary) 15%, transparent)`.
- Monaco Editor tiene su propia paleta en hex (`MONACO_PALETTE` en `SqlEditor.jsx`) porque Monaco no acepta variables CSS — se resuelven en runtime con `cssVarToHex()`.
- Referencia de valores oklch para los temas en `client/src/index.css` líneas 1-200.

---

## DT-07 · SSE Stream para Respuestas AI (no WebSocket)

**Fecha:** 2024  
**Qué:** El streaming de respuestas del AI usa Server-Sent Events (SSE) con `res.write()` en Express, no WebSocket.

**Por qué:**
- SSE es unidireccional (server → client), que es exactamente lo que necesitamos para streaming de tokens.
- WebSocket agrega complejidad (handshake, reconnect, bidireccionalidad que no usamos).
- SSE funciona nativamente con `fetch` + `ReadableStream` en el browser/Electron renderer.
- La autenticación y el payload inicial van en el POST body antes de establecer el stream.

**Consecuencias:**
- El endpoint `/api/ai/chat/stream` es un POST que inmediatamente empieza a emitir chunks `data: ...\n\n`.
- El cliente usa `response.body.getReader()` para consumir el stream.
- Si hay un error durante el stream, se emite un evento `data: [ERROR]...` y se cierra.
- No hay reconexión automática — el usuario debe reenviar el mensaje si hay error de red.

---

## DT-08 · `amoxsql_ai` Schema Dentro del DuckDB del Usuario

**Fecha:** 2024  
**Qué:** Toda la persistencia del AI (conversaciones, mensajes, query cache, planes, memorias) vive en un schema `amoxsql_ai` dentro del mismo archivo `.duckdb` que el usuario tiene abierto.

**Por qué:**
- Un solo archivo = un solo backup. El usuario no necesita gestionar múltiples bases de datos.
- El AI puede queryear las tablas del usuario directamente desde el mismo contexto.
- No requiere SQLite ni un servidor separado.

**Consecuencias:**
- Los schemas internos (`amoxsql_ai`, `information_schema`, `pg_catalog`) se ocultan al usuario en el DatabaseExplorer. Ver `INTERNAL_SCHEMAS` en `server/index.js`.
- Al conectar a un nuevo `.duckdb`, `aiPersistence.initSchema()` crea el schema si no existe.
- En modo `readOnly: true`, el schema AI no se inicializa (no se puede escribir).
- El schema sobrevive entre sesiones — las conversaciones y memorias persisten.

---

## DT-09 · Query Cache Dual: In-Memory Map + DuckDB Persist

**Fecha:** 2024  
**Qué:** Los resultados de `execute_sql` se guardan en dos lugares: un `Map` en memoria (sesión actual) y la tabla `amoxsql_ai.query_cache` (persistente).

**Por qué:**
- El in-memory Map es O(1) lookup, ideal para la sesión actual.
- La context compaction del AI elimina mensajes viejos, pero puede necesitar referenciar un `queryId` de hace 10 iteraciones. La tabla DuckDB permite recuperarlo.
- Si el usuario reinicia la app, los queryIds siguen siendo válidos gracias a la persistencia.

**Consecuencias:**
- Todo `execute_sql` exitoso dispara `aiPersistence.saveQueryCache()` en fire-and-forget (no bloquea).
- `display_chart(queryId)` busca primero en Map, luego en DB si no está en memoria.
- El cache se poda automáticamente: máximo 100 entries por conversación.
- Los `queryId` tienen formato `qr_{timestamp}_{random6}`.

---

## DT-10 · Iconos Exclusivamente de `react-icons/lu` (Lucide)

**Fecha:** 2024  
**Qué:** Todos los iconos de la UI usan `react-icons/lu` (Lucide Icons). No se mezclan otras librerías (Heroicons, Phosphor, Material Icons).

**Por qué:**
- Consistencia visual: todos los iconos tienen el mismo estilo de trazo.
- Lucide cubre el 95%+ de casos de uso necesarios.
- Un solo import tree-shakeable.

**Consecuencias:**
- Antes de usar un ícono Lu\*, verificar que existe en esta versión del paquete. Los nombres cambian entre versiones (ej: `LuAlertTriangle` → `LuTriangleAlert`, `LuHelpCircle` → `LuCircleHelp`).
- Script de validación disponible en `docs/dev/README.md`.
- Si Lucide no tiene el ícono que necesitas, buscar el nombre equivalente — casi siempre existe con otro nombre.

---

## DT-11 · Sin Test Suite Automatizada

**Fecha:** 2024 · **Estado:** Deuda técnica reconocida.  
**Qué:** No hay `npm test`, no hay Jest, no hay Vitest, no hay Playwright.

**Por qué (histórico):** Velocidad de desarrollo en etapa temprana. El proyecto es pequeño y el dev principal conoce el codebase.

**Consecuencias:**
- Verificación es 100% manual: correr la app y ejercitar la UI path afectada.
- Existe `server/ai/testRunner.js` como skeleton para tests del agentic loop — no está en uso activo.
- Al tocar código crítico (agenticLoop, tools, DuckDB queries), documentar el caso de prueba manual en el commit message.
- No afirmar "todos los tests pasan" en commits — no existen.

---

## DT-12 · `BigInt.prototype.toJSON = toString`

**Fecha:** 2024  
**Qué:** En `server/index.js` se monkey-patches `BigInt.prototype.toJSON` para que `JSON.stringify` no lance error con valores BigInt de DuckDB.

```javascript
BigInt.prototype.toJSON = function () { return this.toString(); };
```

**Por qué:** DuckDB devuelve columnas `BIGINT`/`HUGEINT` como `BigInt` de JavaScript. `JSON.stringify` no sabe serializar BigInt por defecto y lanza `TypeError`. La solución más simple y global es el patch en el entry point del server.

**Consecuencias:**
- Los BigInt en las respuestas JSON llegan al cliente como **strings**, no como numbers.
- El cliente debe parsear esos strings si necesita aritmética. En la mayoría de casos (mostrar valores en tabla) funciona transparentemente.
- Aplica solo en el proceso del servidor. El renderer no tiene este patch.

---

## DT-13 · `INTERNAL_SCHEMAS` — Ocultar Schemas del Explorador

**Fecha:** 2024  
**Qué:** Varios schemas se ocultan automáticamente en el DatabaseExplorer y en los resultados de `list_tables` del AI.

```javascript
const INTERNAL_SCHEMAS = ['information_schema', 'pg_catalog', 'amoxsql_ai', 'amoxsql_chains'];
const INTERNAL_TABLES_MAIN = ['amox_query_history'];
```

**Por qué:** El usuario no necesita ver tablas de sistema ni las tablas internas de AmoxSQL. Mostrarlas causaría confusión y podría llevar a queries accidentales sobre datos de sistema.

**Consecuencias:**
- La función `userTablesWhereClause()` en `server/index.js` encapsula el filtrado — se usa en todos los endpoints que listan tablas.
- El AI nunca ve estas tablas en `list_tables` — no puede queryearlas accidentalmente.
- Si se agrega un nuevo schema interno de AmoxSQL, **agregar a `INTERNAL_SCHEMAS`**.
- Si el developer necesita inspeccionar `amoxsql_ai` para debugging: usar DBeaver o similar apuntando al mismo `.duckdb`.
