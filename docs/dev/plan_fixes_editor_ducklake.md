# Plan de implementación — DuckLake real + fixes del editor

Rama de trabajo actual: `claude/latest-repo-version-089cd1` (ya con `origin/main` mergeado, incluye el commit `6072cd3 suport ducklake`).

Cuatro frentes independientes. Se pueden implementar todos en esta rama.

---

## 1. DuckLake — que realmente funcione

### Diagnóstico
El commit `6072cd3` solo reconoce la extensión `.ducklake` en listados/filtros, pero **la conexión nunca usa el prefijo `ducklake:`**. Hoy `DatabaseManager.connect()` hace:

```js
await this.query(`ATTACH '${fullPath}' AS ${this.alias} ${attachMode}`);
```

Para un `.ducklake` eso lo abre como una base DuckDB normal, no como lakehouse. Además hay 2 bugs cosméticos (`name` vs `f.name`, y `'ducklake'` sin punto).

### Cambios

**a) `server/DatabaseManager.js` — `connect()` (~línea 208-228)**
- Detectar si `fullPath` termina en `.ducklake`.
- Si es DuckLake:
  - `INSTALL ducklake` (best-effort, try/catch — offline puede fallar; el autoload cubre el caso con red).
  - `ATTACH 'ducklake:${fullPath}' AS ${alias} (DATA_PATH '${fullPath}.files'${readOnly ? ', READ_ONLY' : ''})`.
  - Recordar la extensión con `this.rememberExtension('ducklake')` para que sobreviva reconexiones.
- Si no, la ruta de siempre (`ATTACH '${fullPath}' AS ...`).
- Extraer un helper `_buildAttachSql(fullPath, alias, opts)` para no duplicar.

**b) `server/DatabaseManager.js` — `_initHistory()`**
- En DuckLake, crear `amoxsql_ai.query_history` escribe schemas de AmoxSQL dentro del lakehouse. Envolver en try/catch más tolerante y, si falla por ser DuckLake, degradar a "sin history" sin romper la conexión. (El history es best-effort; no debe abortar el attach.)
- Verificar que `close()` (DETACH vía `PRAGMA database_list`) suelta un lago limpio — debería, porque el alias sigue siendo `user_db`; solo confirmar en prueba manual.

**c) Bug fixes cosméticos**
- `client/src/components/FileExplorer.jsx:149` — `!name.endsWith('.ducklake')` → `!f.name.endsWith('.ducklake')`.
- `server/ai/tools.js:753` — `'ducklake'` → `'.ducklake'` en `binaryExts`.

**d) Detección de tipo al abrir desde el selector de DB**
- Confirmar que el flujo WelcomeScreen → `/api/db/connect` → `connect()` pasa la ruta `.ducklake` tal cual (sí lo hace). Nada extra salvo lo de (a).

### Riesgos
- `INSTALL ducklake` sin internet en la primera vez: se maneja con try/catch; si falla, el attach fallará con un mensaje claro. Documentar que DuckLake requiere descargar la extensión una vez.
- No tocamos migración de datos: crear un `.ducklake` nuevo lo inicializa vacío (comportamiento correcto de DuckLake).

---

## 2. Imágenes en Markdown (SVG sí sirve; el problema es la ruta)

### Diagnóstico
`MarkdownPreview` renderiza `<img src={src}>` con el `src` crudo del markdown (p. ej. `./assets/foo.png`). El preview corre en el renderer (Vite/`file://`), **no** relativo a la carpeta del `.md` en disco, así que la ruta relativa nunca resuelve. Pasa igual con PNG y SVG — **SVG está bien como formato**; el bloqueo es la resolución de ruta. Además `MarkdownEditor` no recibe ni propaga la ruta del archivo abierto.

### Cambios

**a) `server/index.js` — nuevo endpoint de bytes crudos**
- `GET /api/file/raw?path=...` → `res.sendFile(resolvedPath)` (content-type correcto automático, incl. `image/svg+xml`), confinado al project root (mismo patrón que `write-binary`). Necesario porque `<img src>` requiere una URL que devuelva bytes, no el JSON base64 que ya existe.

**b) Propagar la ruta del archivo hasta el preview**
- `EditorPane.jsx` → pasa `filePath={activeTab.path}` a `MarkdownEditor`.
- `MarkdownEditor.jsx` → acepta `filePath` y lo pasa a `MarkdownPreview`.
- `MarkdownPreview.jsx` → acepta `filePath`; deriva `baseDir = dirname(filePath)`.

**c) `MarkdownPreview.jsx` — reescribir `src` de imágenes**
- En el componente `img`/`ZoomableImage`, si `src` es relativo (no empieza por `http`, `data:`, `blob:`, ni `/`):
  - Resolver `resolved = normalizePath(baseDir + '/' + src)` (relativo al project root).
  - `finalSrc = ${API_BASE}/api/file/raw?path=${encodeURIComponent(resolved)}`.
- URLs absolutas/externas y `data:`/`blob:` se dejan intactas.

### Notas
- El paste/drop de imágenes ya guarda en `assets/` e inserta `![image](./assets/...)`; con este fix esas imágenes por fin se verán en preview.
- Confirmar en prueba: PNG, SVG y una imagen en subcarpeta.

---

## 3. Diagrama en pantalla completa — no se puede desplazar (pan)

### Diagnóstico (`MarkdownPreview.jsx` → `FullscreenViewer`)
El pan existe (pointer events sobre `.mde-fs-stage`) pero se rompe porque:
1. **Sin `setPointerCapture`** — al mover rápido o salir del stage, los `pointermove` dejan de llegar.
2. **`<img>` y el `<svg>` de mermaid son arrastrables/seleccionables por defecto** — al hacer mousedown se dispara el drag nativo (imagen fantasma) o selección de texto en vez de nuestro pan.
3. **Zoom siempre al centro** — `transform-origin: center center` + la rueda no ajusta `pos`, por eso "solo hace zoom hacia el centro".

### Cambios (`FullscreenViewer`)

**a) Arreglar el pan**
- `onPointerDown`: `e.preventDefault()` + `e.currentTarget.setPointerCapture(e.pointerId)` + guardar `pointerId`.
- `onPointerMove`: solo mover si el drag está activo.
- `onPointerUp`: `releasePointerCapture` + limpiar.
- CSS: en `.mde-fs-content img, .mde-fs-content svg` añadir `user-select: none; -webkit-user-drag: none; pointer-events: none;` (el stage captura el gesto, no los hijos). Poner `draggable={false}` en el `<img>`.

**b) Zoom anclado al cursor**
- En `onWheel`, calcular la posición del cursor relativa al centro del stage y ajustar `pos` para que el punto bajo el mouse quede fijo tras escalar. (Fórmula: `pos' = cursor - (cursor - pos) * (newScale/oldScale)`.)
- Los botones +/- del toolbar siguen escalando desde el centro (aceptable).

### Alcance
- Este visor es compartido por mermaid **y** por imágenes, así que ambos ganan pan correcto y zoom al cursor.

---

## 4. Ejecutar UNA sola query de un script (sin volverlo notebook)

### Diagnóstico
- `Ctrl+Enter` (`SqlEditor.jsx:309`) ya corre la selección si hay selección; si no, corre **todo** el modelo.
- El botón "Run" (`EditorPane.jsx:589`) corre `activeTab.content` completo (el script runner, que muestra el resumen + resultado de la última statement).
- No existe "ejecutar la statement bajo el cursor" sin seleccionar. Ya tenemos `splitSqlStatements()` con `startLine`, así que podemos ubicar la statement que contiene el cursor.

### Cambios

**a) `SqlEditor.jsx` — "run statement at cursor"** (DECISIÓN TOMADA)
- Nueva función `runStatementAtCursor(editor)`:
  - `splitSqlStatements(model.getValue())`; encontrar la statement cuyo rango de líneas contiene `editor.getPosition().lineNumber` (usando `startLine` de cada una y el `startLine` de la siguiente como fin).
  - Ejecutar solo esa (`props.onRunQuery(stmt.raw)`).
- `Ctrl+Enter` **NO cambia** — sigue corriendo la selección si hay, si no todo el script.
- Añadir `Ctrl+Alt+Enter` → **corre la statement bajo el cursor**.
- **Sin botón nuevo en la interfaz** (decisión del usuario — sería de más). Solo el atajo.

**b) Feedback**
- Si el script tiene 1 sola statement, "run statement" y "run script" son equivalentes.

---

## Orden sugerido de implementación
1. Bugs cosméticos DuckLake (2 líneas) — trivial.
2. DuckLake connect real + history tolerante.
3. Endpoint `/api/file/raw` + propagación de ruta + reescritura de `img`.
4. Fix pan + zoom-al-cursor del FullscreenViewer.
5. Run statement at cursor.

## Registro de implementación (2026-07-27)

Los 4 frentes quedaron implementados en la rama `claude/latest-repo-version-089cd1`.

1. **DuckLake** — `DatabaseManager.connect()` detecta `.ducklake`, hace `INSTALL/LOAD ducklake` y attacha con `ATTACH 'ducklake:<path>' AS user_db (DATA_PATH '<path>.files')` vía el nuevo helper `_buildAttachSql()`. Se agregó el flag `this.isDuckLake` (reseteado en constructor/`_initSystem`/`close`). El history y la persistencia de IA/chains se saltan en modo DuckLake para no ensuciar el lakehouse. Se ocultan las ~29 tablas del catálogo de metadatos `__ducklake_metadata_*` tanto en `userTablesWhereClause()` (todos los endpoints de schema) como en el tool `list_tables` de la IA. Bugs cosméticos corregidos (`f.name`, `.ducklake` con punto). **Probado E2E con node**: attach + CREATE/INSERT/SELECT correcto, `.files` creado, y el filtro deja solo las tablas lógicas.
2. **Imágenes markdown** — nuevo `GET /api/file/raw` (sirve bytes con content-type); `filePath` propagado EditorPane → MarkdownEditor → MarkdownPreview; `resolveAssetSrc()` reescribe rutas relativas al endpoint. SVG y PNG funcionan.
3. **Pan/zoom del fullscreen** — `FullscreenViewer` con `setPointerCapture`, hijos con `pointer-events:none`/`-webkit-user-drag:none`, y zoom anclado al cursor.
4. **Run statement bajo cursor** — `Ctrl+Alt+Enter` en `SqlEditor` usando `splitSqlStatements` + línea del cursor. Sin botón nuevo. Documentado en el modal de shortcuts.

Validado: `node --check` server OK, `pnpm build` client OK, pruebas E2E de DuckLake con node.

## Verificación (manual — no hay tests)
- DuckLake: crear `lago.ducklake`, hacer `CREATE TABLE`, insertar, cerrar y reabrir; confirmar que ve la tabla lógica (no las tablas internas `ducklake_*`).
- Markdown: referenciar un PNG y un SVG (relativo y en subcarpeta) → se ven en preview.
- Diagrama: abrir mermaid/imagen en fullscreen → arrastrar para desplazar; rueda hace zoom donde está el mouse.
- Run: script con 3 queries, cursor en la 2ª, Ctrl+Enter → corre solo la 2ª.
