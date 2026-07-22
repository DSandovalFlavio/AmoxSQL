# Plan: Scripts SQL multi-statement + fix de extensiones

> **Estado**: propuesto (2026-07-21) · **Iniciativa**: ejecución de archivos `.sql` con varios statements y reparación del sistema de extensiones DuckDB.

## Contexto y problema

AmoxSQL hoy impone "una sola query por archivo/bloque `.sql`". La guardia vive **solo en el cliente** (`LayoutManager.executeQuery`, `client/src/components/LayoutManager.jsx:294-310`): strip de comentarios por regex + `split(';')` ingenuo; si hay >1 statement se abre un diálogo que solo ofrece "Convertir a SQL Notebook" o cancelar. El server (`/api/query`) no valida nada.

Esto choca con tres casos de uso reales que hoy no tienen salida:

- **Caso A — Setup + query**: `INSTALL ext; LOAD ext; SELECT ...`. Lo que importa es la tabla del último SELECT; lo anterior es preparación.
- **Caso B — Script de flujo (DML/DDL)**: N statements que crean/actualizan tablas en orden. Lo que importa es *qué pasó* (ok/error, filas afectadas, duración), no tablas.
- **Caso C — Exploración con varias SELECT**: aquí el notebook sí es el destino correcto y la recomendación debe mantenerse.

El disparador original (caso A) existe porque **el panel de extensiones tiene bugs reales** que impiden instalar/activar — si eso se arregla, gran parte de la fricción desaparece de raíz.

### Principio de diseño (no negociable)

**"Una query → una tabla" se mantiene.** Nunca N tablas por pestaña. Los scripts obtienen un tipo de output propio (bitácora de ejecución), y la tabla solo aparece cuando el resultado es tabular (SELECT). La decisión de render es **por tipo de resultado, no por cantidad de statements**: un único `UPDATE` también muestra resumen (hoy muestra una tabla semi-vacía con `Count`).

## Hallazgos de la auditoría (con evidencia)

### Restricción multi-query
- Guardia y diálogo: `client/src/components/LayoutManager.jsx:294-310`. Conversión a notebook: `:305-308` (una celda por statement, **pierde comentarios** porque parte del texto ya strippeado).
- Splitter ingenuo: `split(';')` rompe con `;` dentro de strings; no hay `splitSqlStatements()` compartido en el codebase.
- Ctrl+Enter ejecuta selección-o-todo (`SqlEditor.jsx:293-308`); el botón Run manda siempre todo el archivo (`EditorPane.jsx:579`).
- El server ejecuta lo que reciba: `queryWithMetadata` → `connection.run(sql)` (`server/DatabaseManager.js:357`) devuelve solo el último resultset. `applyRowLimit` (`server/_sqlUtils.js:15-27`) envolvería mal un multi-statement que empiece por SELECT.
- Las celdas del notebook pasan por el **mismo** `executeQuery` → una celda con 2 statements ofrece crear otro notebook (bug latente).
- No existe "no volver a preguntar": `DialogProvider.confirmAsync` (`client/src/components/dialogs/DialogProvider.jsx:36-48`) no soporta checkbox ni supresión.

### Extensiones (bugs confirmados)
- **P1 — LOAD se pierde en cada reconexión**: `LOAD` es por conexión; `reinitializeSystem()` (`server/DatabaseManager.js:107-137`) destruye la instancia DuckDB al abrir/cambiar/cerrar BD y **no re-carga nada** (`connect()` `:159-191` solo hace ATTACH+USE). Disparadores: `server/index.js:488`, `:69`, `:517`, `:5115`.
- **P2 — Reintento community muerto**: en `server/index.js:988-998`, un `HTTP 404` del repo oficial se clasifica como `platformUnavailable` y nunca se llega a `canRetryFromCommunity` → extensiones solo-community escritas en el buscador fallan con mensaje engañoso ("no disponible para tu plataforma") sin intentar `INSTALL ... FROM community`.
- **P5 — Sin persistencia**: nada en `~/.amoxsql/config.json` recuerda qué extensiones deben quedar activas; al reabrir todo vuelve a "installed, not loaded".
- UI: `client/src/components/ExtensionExplorer.jsx` (install `:86-123`, load `:125-146`); endpoints `server/index.js:961-1023`.

### Piezas reutilizables
- Chains ya clasifica resultados: `detectResultType` (`server/ChainExecutor.js:226-266`) + `RESULT_TYPE_LABELS` ("Table Created", "Rows Inserted"…, `client/src/components/chains/chainNodeTypes.js:419-433`). El notebook NO lo usa: una celda DML muestra "Success" con tabla vacía (`NotebookCell.jsx:519-548`).
- Conversión `.sql`→chain sería trivial (N nodos `sql_inline` + edges lineales + `computeAutoLayout`), pero el encaje conceptual es débil para scripts imperativos → **backlog, no en este plan**.

---

## Fase 1 — Reparar extensiones (raíz, riesgo bajo)

**Objetivo**: instalar/activar funciona, y lo activado sobrevive reconexiones y reinicios de la app.

1. **Re-LOAD automático tras reconexión** (`server/DatabaseManager.js`)
   - Mantener en `DatabaseManager` un set `loadedExtensions` (alimentado por los endpoints de install/load).
   - Tras `_initSystem()` / `reinitializeSystem()` / `connect()`, re-ejecutar `LOAD <ext>` por cada extensión del set (con try/catch por extensión: un fallo no debe romper la conexión; loguear el error).
2. **Fix clasificación 404 + reintento community** (`server/index.js:972-1004`)
   - Si `INSTALL <name>` falla (404 o "not found"), reintentar `INSTALL <name> FROM community` automáticamente en el server antes de responder error.
   - Solo si **ambos** fallan con 404, responder `platformUnavailable`. Ajustar mensajes del cliente (`ExtensionExplorer.jsx:99-112`).
3. **Persistencia en config** (`~/.amoxsql/config.json`, clave p.ej. `extensions.autoload: []`)
   - Al hacer LOAD exitoso desde la UI, añadir a la lista; ofrecer toggle "activar al iniciar" en `ExtensionExplorer` (o hacerlo automático: lo que cargas queda persistido, con acción para quitarlo).
   - Al arrancar el server, poblar `loadedExtensions` desde config y cargarlas (después del init de DuckDB).
4. **Verificación manual** (no hay tests): instalar `spatial` (core) y una community; abrir un `.duckdb`; comprobar con `SELECT * FROM duckdb_extensions()` que siguen `loaded=true`; reiniciar la app y re-comprobar.

**Entregable**: PR propio. Con esto, el caso A casi desaparece en la práctica.

## Fase 2 — Splitter robusto + "Ejecutar como script"

**Objetivo**: un `.sql` multi-statement se puede ejecutar en secuencia con una bitácora de resultados, manteniendo "una tabla máximo".

1. **`splitSqlStatements()` compartido** (`client/src/utils/sqlSplitter.js`)
   - Máquina de estados: comillas simples/dobles, dollar-quotes (`$$...$$`), comentarios `--` y `/* */`; split solo en `;` a nivel top.
   - Devuelve por statement: `{ sql, leadingComments, startLine }` (offsets para mapear errores a líneas del editor y para preservar comentarios en conversiones).
   - Reemplaza el `split(';')` de `LayoutManager.jsx:295` y cualquier otro punto que parta por `;`.
2. **`resultType` en la respuesta de `/api/query`** (`server/index.js:~3179`)
   - Extraer la clasificación de `ChainExecutor.detectResultType` a un helper compartido (`server/_sqlUtils.js` o módulo nuevo) y añadir `resultType` + `rowsAffected` (leyendo la columna `Count` de DuckDB en DML) al JSON de respuesta.
   - Reutilizar `RESULT_TYPE_LABELS` en el cliente (mover a un módulo compartido fuera de `chains/` si hace falta).
3. **Diálogo de 3 opciones + recordar** (`LayoutManager.jsx`, `DialogProvider.jsx`)
   - Opciones: **Ejecutar como script** / **Convertir a SQL Notebook** (sigue siendo la recomendada para análisis) / **Cancelar**.
   - Checkbox "Recordar para este archivo" → persistir `{ [path]: 'script' | 'notebook' }` en localStorage (`amoxsql-sql-file-prefs`). Extender `DialogProvider` para soportar opciones múltiples + checkbox (o componente de diálogo dedicado).
   - Ofrecer cambiar la preferencia después (p.ej. entrada en el menú contextual del tab o icono en la barra del editor cuando hay preferencia guardada).
4. **Ejecución secuencial en el cliente** (`LayoutManager.executeQuery`)
   - Loop statement-a-statement contra el `/api/query` existente (reutiliza abort, row limit, historial, errores). Stop-on-error con marcador de línea en el editor (`errorMarker` ya existe).
   - Acumular log: `{ index, sqlPreview, resultType, rowsAffected, ms, status, error }` por paso. Estado en el tab (`updateTab`) como `scriptRun` junto a `results`.
   - Cancelable con el mismo `AbortController` (cancelar aborta el paso en curso y detiene el resto).
5. **UI de bitácora** (`EditorPane.jsx` + componente nuevo `ScriptRunSummary.jsx`)
   - **Regla de render por tipo de resultado** (aplica igual con 1 o con 20 statements):
     - Último statement devuelve filas (SELECT/WITH…) → `ResultsTable` de siempre + bitácora colapsable encima.
     - Ningún resultado tabular (todo DML/DDL) → solo la bitácora: lista de pasos con icono Lucide de estado, etiqueta (`Table Created`, `Rows Updated: N`…), duración; totales al pie (X pasos, Y ok, tiempo total).
     - Un único DML también usa la tarjeta de resumen (mejora sobre la tabla `Count` actual). 
   - Sin emojis; iconos Lucide; tokens CSS del tema.
6. **Verificación manual**: script de 3 DML (crear/insert/update) → solo bitácora; script DML+SELECT final → tabla + log; `;` dentro de un string no parte; error en el paso 2 detiene el 3 y marca la línea; cancelar a mitad funciona; "recordar" evita el diálogo en la siguiente ejecución de ese archivo.

**Entregable**: PR propio (puede partirse en 2: splitter+API / diálogo+ejecución+UI).

## Fase 3 — Mejoras de notebook (cierra el círculo)

1. **Render DML en celdas** (`NotebookCell.jsx`): usar `resultType`/`rowsAffected` de la Fase 2.2 para mostrar "Table Created" / "N rows updated" en vez de tabla vacía.
2. **Conversión `.sql` → notebook con el splitter nuevo**: preservar comentarios (adjuntos a su celda; opcional: bloques de comentario largos → celdas markdown).
3. **Celda con varios statements**: en vez del diálogo absurdo (crear otro notebook desde un notebook), ejecutar la celda como mini-script con la misma mecánica de la Fase 2.4 y mostrar la bitácora compacta en la celda.

**Entregable**: PR propio.

## Fuera de alcance (backlog → `docs/dev/pendientes.md`)

- Conversión `.sql` → Data Flow (mecánica trivial con nodos `sql_inline`, pero encaje conceptual débil para scripts imperativos; reconsiderar si aparece demanda real de pipelines escritos en `.sql`).
- Endpoint batch en server para scripts (el loop cliente reutiliza toda la infraestructura existente; solo reconsiderar si aparecen scripts de cientos de statements donde el round-trip por statement pese).
- "Query bajo el cursor" en Ctrl+Enter (hoy: selección-o-todo). Mejora de editor independiente de esta iniciativa.

## Riesgos y decisiones

- **Splitter**: es la pieza con más superficie de error (dollar-quotes, comentarios anidados). Mitigación: casos de prueba manuales documentados en el PR; ante duda, el splitter debe ser conservador (mejor no partir que partir mal).
- **Historial de queries**: la ejecución como script genera N entradas en `amox_query_history` (una por statement). Aceptado: es fiel a lo ejecutado.
- **Row limit**: al ejecutar por statement individual, `applyRowLimit` funciona correctamente por paso (hoy rompería en multi-statement).
- **Preferencia por ruta en localStorage**: se pierde si el archivo se renombra/mueve. Aceptado para v1; alternativa futura: directiva en el propio archivo (p.ej. `-- @amox:run script`) que viaja con él.

## Orden recomendado

Fase 1 → Fase 2 → Fase 3, cada una en su rama/PR desde `main` (mergeables por separado). La Fase 1 es independiente y de valor inmediato; la 2 depende del splitter; la 3 reutiliza piezas de la 2.
