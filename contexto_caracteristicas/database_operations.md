# Operaciones de Base de Datos (DuckDB)

## DatabaseManager

### Archivo: `server/DatabaseManager.js` (284 lineas)

### Patron Singleton
```javascript
module.exports = new DatabaseManager(); // Linea 283
```
- Una instancia global
- Una conexion + opcionalmente database file adjunto

### Propiedades de Instancia (lineas 6-10)
```javascript
this.instance     // DuckDBInstance (Neo API)
this.connection   // Conexion activa
this.attachedPath // Path a .duckdb file (o null para :memory:)
this.alias        // 'user_db' (schema name)
```

### Inicializacion (`_initSystem`, lineas 22-33)
```javascript
await DuckDBInstance.create(':memory:')
await instance.connect()
```

### Metodos de Query

| Metodo | Lineas | Retorna | Uso |
|--------|--------|---------|-----|
| `query(sql)` | 185-207 | `[{row objects}]` | Queries normales (se logean) |
| `queryWithMetadata(sql)` | 209-234 | `{ rows, types }` | Queries con info de tipos de columna |
| `systemQuery(sql)` | 181-183 | `[{row objects}]` | Queries internas (prefijo `-- AMOX_SYSTEM`, no se logean) |

### Ciclo de Conexion

**connect(dbPath, rootDir, options)** (lineas 84-133):
```
1. Resuelve path relativo via rootDir
2. Si ya hay attached → reinitializeSystem() (clean slate)
3. ATTACH '{fullPath}' AS user_db {readOnly?}
4. USE user_db
5. Inicializa history table si no es read-only
```

**close()** (lineas 236-276):
```
1. USE memory (para desattach seguro)
2. PRAGMA database_list
3. DETACH ALL non-memory databases
4. Clear attachedPath
```

**reinitializeSystem()** (lineas 57-82):
```
1. close()
2. Wait 200ms (Windows filesystem)
3. Nullify instance/connection
4. _initSystem() (nuevo instance)
```

### Query History (lineas 135-175)

**_initHistory()** (lineas 135-146):
- Crea tabla `amox_query_history` (query TEXT, executed_at TIMESTAMP)
- Auto-prune: elimina registros > 30 dias
- Solo en databases read-write

**_logQuery()** (lineas 148-175):
- Fire-and-forget INSERT
- **Filtros** (no se logean):
  - PRAGMA, EXPLAIN, SUMMARIZE, DESCRIBE, SHOW
  - CREATE/DELETE en tablas AMOX_*
  - Queries a information_schema
  - Queries a schemas amoxsql_ai / amoxsql_chains
- Escapa comillas simples en SQL

---

## Endpoints de Base de Datos (server/index.js)

### Conexion y Management

| Endpoint | Metodo | Lineas | Funcion |
|----------|--------|--------|---------|
| `/api/db/connect` | POST | 105-132 | Attach .duckdb, init AI/chain schemas |
| `/api/db/close` | POST | — | Detach, reset a :memory: |
| `/api/db/location` | GET | — | Path actual (o ':memory:') |

### Schema e Introspeccion

| Endpoint | Metodo | Lineas | Funcion |
|----------|--------|--------|---------|
| `/api/db/tables` | GET | 149-168 | Todas las tablas + columnas |
| `/api/db/er-schema` | GET | 171-220 | Schema con PK/FK/constraints |
| `/api/db/file-schema` | GET | 222-235 | Introspeccionar CSV/JSON/Parquet via DESCRIBE |
| `/api/db/table-details` | POST | 253-301 | Schema + rowcount + preview + DDL + SUMMARIZE |
| `/api/db/history` | GET | 237-251 | Ultimas 1000 queries del historial |
| `/api/db/extensions` | GET | — | Lista extensiones DuckDB |
| `/api/db/extensions/install` | POST | — | Instalar + cargar extension |

### Ejecucion de Queries

**POST /api/query** (lineas 1460-1488):
```javascript
// Body: { query }
const result = await dbManager.queryWithMetadata(query);
// Retorna: { data, types, executionTime, rowCount }

// Invalidacion de cache (lineas 1471-1476):
if (upperQuery.startsWith('CREATE') || 'DROP' || 'ALTER' || 'INSERT' || 'DELETE' || 'UPDATE') {
    invalidateTableContextCache();
}
```

### Importacion de Datos

**POST /api/db/import** (lineas 303-342):
```sql
CREATE OR REPLACE TABLE "{tableName}" AS SELECT * FROM '{filePath}'
```
- Soporta glob patterns (*.csv, *.parquet)
- Opcion `cleanColumns`: renombra cols (trim whitespace, _ por espacios)
- Ejecuta `dbManager.checkpoint()` para flush WAL

**GET /api/files/inspect-excel** — lista sheet names:
- **Ruta rápida** (`server/xlsxMeta.js`): lee el directorio central del ZIP e infla solo `xl/workbook.xml` (~ms), sin parsear el libro completo. Fallback a la librería `xlsx` (SheetJS) si el archivo es exótico (ZIP64, layout inesperado).
- **Por qué:** `xlsx.read(buf, {bookSheets:true})` inflaba TODO el archivo (cientos de MB de XML en el hilo del server) solo para los nombres. Ver `docs/dev/auditoria_metadata_archivos.md`.

**GET /api/files/inspect-columns** — columnas + tipos (y hojas para Excel):
- Nombres de hoja vía `xlsxMeta.getSheetNames` (ruta ZIP rápida); tipos vía `DESCRIBE SELECT * FROM read_xlsx(..., sheet=s)` por hoja (el bind de read_xlsx se detiene temprano, ~ms/hoja).
- Corre en el lane `meta` de DuckDB (no se encola detrás de queries del usuario) y cachea el resultado por `mtime` (Map LRU en `xlsxMeta.js`).
- Consumidores: Direct Query (`LayoutManager.handleQueryFile`), Copy Column Names (`FileExplorer`), Export for AI (`ExportAiContextModal`).

**POST /api/db/import-excel** (lineas 392-453):
- **MERGE**: `UNION ALL BY NAME` de todos los sheets
- **INDIVIDUAL**: Tabla separada por sheet
- Usa `read_xlsx('file', sheet='...')`
- Instala extension `spatial` (requerida para read_xlsx)

### Exportacion de Datos

**POST /api/export-data** — export local vía `COPY (query) TO file`:
- **csv** → `(HEADER, DELIMITER ',')`; **parquet** → `(FORMAT PARQUET)`.
- **xlsx** → `.xlsx` REAL vía la extensión `excel` (`COPY ... WITH (FORMAT xlsx, HEADER true)`). Requiere `LOAD excel` explícito — la función COPY TO xlsx **no** autocarga (a diferencia de read_xlsx). Excel limita una hoja a 1,048,576 filas; si se supera, se devuelve un error accionable (usar CSV/Parquet).
- Nota histórica: antes de v3.8.2, el modo xlsx escribía CSV dentro del `.xlsx` → el archivo no abría en Excel.
- Retorna: path + row count.

Dónde vive el export (desde v3.8.3):
- **Toolbar del editor** (`EditorPane.jsx`, botón "Export" después de Save): abre `ExportDataModal` con la **query actual del editor** (variables resueltas vía `resolveVariables`). Re-ejecuta la query completa a archivo/nube (`/api/export-data`, `/api/export/cloud`). Export ligado a la query, no a los resultados mostrados → siempre usa el texto actual (no la última query ejecutada).
- **Toolbar de resultados** (`ResultsTable.jsx`, botón "Download"): **solo** las filas cargadas en la tabla — CSV/JSON/portapapeles vía Web Worker en cliente (instantáneo, en memoria) + **Metadata for AI** (`ExportAiContextModal`).
- **FileExplorer** (3 puntitos en un `.sql`): "Export results…" lee el archivo (`GET /api/file`) y abre `ExportDataModal` con esa query.

Export a la nube (`/api/export/cloud`): solo CSV/JSON/Parquet (NO xlsx); valida el formato y rechaza el resto (evita escribir Parquet bajo una extensión equivocada).

**POST /api/export/cloud** (lineas 490-528):
- S3: access key, secret, region, endpoint
- GCS: S3-compatible interface
- Formato: parquet, csv, json
- Usa extension httpfs

### Profiling

**POST /api/profile** (lineas 1490-1642):
```
1. DuckDB SUMMARIZE → stats core por columna
2. Global: row count, duplicate rows
3. Avanzado: SKEWNESS, KURTOSIS, zeros, text length stats
4. Correlaciones: CORR() para todos los pares numericos
5. Histogramas: 5 bins numerico, top 5 texto
6. Retorna: { profile, visuals, advanced, global, correlations, executionTime }
```

---

## API de Archivos (server/index.js)

| Endpoint | Metodo | Funcion |
|----------|--------|---------|
| `/api/files` | GET | Listar directorio (dirs primero) |
| `/api/file` | GET | Leer contenido (query: path) |
| `/api/file` | POST | Escribir contenido (body: path + content) |
| `/api/file/rename` | POST | Renombrar (body: oldPath, newPath) |
| `/api/file/delete` | POST | Eliminar recursivo (body: path, isDirectory) |
| `/api/folders` | GET | Listar carpetas recursivo (excluye node_modules, .git) |
| `/api/folder` | POST | Crear carpeta recursiva |

---

## API de Proyecto

| Endpoint | Metodo | Funcion |
|----------|--------|---------|
| `/api/project/path` | GET | Retorna ROOT_DIR actual |
| `/api/project/open` | POST | Cambia ROOT_DIR, reinicializa DB |
| `/api/project/scan-dbs` | GET | Lista archivos .duckdb/.db/.wal |

---

## Notas Importantes

- **DuckDB Neo API**: Usa `@duckdb/node-api` (no el binding legacy)
- **BigInt handling**: `getRowObjectsJson()` convierte BigInt a string automaticamente
- **WAL**: `checkpoint()` forza flush a disco despues de imports
- **Read-only mode**: Deshabilita history tracking y escritura
- **Cache de contexto AI**: TTL 5min, invalidado en DDL/DML
- **Extensions**: Se instalan bajo demanda (ej: spatial para Excel)
