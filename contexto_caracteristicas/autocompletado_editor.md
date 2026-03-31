# Sistema de Autocompletado y Recomendaciones del Editor SQL

## Arquitectura General

El sistema usa una **arquitectura de 3 capas**:

1. **Frontend (Monaco Editor)** - Muestra sugerencias e interactua con el usuario
2. **Web Worker (Tree-sitter)** - Analiza el AST SQL y determina el contexto
3. **Backend (Express.js)** - Provee informacion de schema y catalogo de funciones

**No usa IA/LLM** para completions inline. Es 100% basado en schema + AST.

---

## Archivos Clave

| Archivo | Responsabilidad |
|---------|----------------|
| `client/src/components/SqlEditor.jsx` (lineas 538-862) | Provider de completions, cache de schema, hover provider |
| `client/src/utils/sqlWorkerBridge.js` | Puente de comunicacion main thread <-> worker |
| `client/src/workers/sqlLanguageWorker.js` | Motor de completions: analisis AST, logica contextual |
| `client/src/workers/treeSitterUtils.js` | Utilidades AST: clausulas, aliases, dot-access, scoping |
| `server/index.js` (lineas 149-235, 1782-1883) | Endpoints de schema y catalogo de funciones |
| `server/DatabaseManager.js` | Queries a DuckDB (information_schema) |

---

## Flujo de Datos Completo

### 1. Inicializacion del Cache de Schema

Cuando el editor se monta (`SqlEditor.jsx:556-576`):

```
SqlEditor mount
  -> fetch GET /api/db/tables
  -> Respuesta: [{ name, type, columns: [{column_name, data_type}] }]
  -> Construye window.__amoxSqlSchemaCache = { tables: {...}, allColumns: [...] }
  -> workerBridge.updateSchema(cache) -> postMessage al worker
```

**Cache global** (`window.__amoxSqlSchemaCache`):
```javascript
{
  tables: {
    'users': [{ name: 'id', type: 'INTEGER' }, { name: 'email', type: 'VARCHAR' }],
    'orders': [{ name: 'id', type: 'INTEGER' }, { name: 'user_id', type: 'INTEGER' }],
    'data.csv': [{ name: 'col1', type: 'VARCHAR' }]  // archivos detectados
  },
  allColumns: ['id', 'email', 'user_id', 'col1']  // fallback global
}
```

### 2. Deteccion Dinamica de Archivos

Cuando el usuario escribe en el editor (`SqlEditor.jsx:593-635`):

```
onDidChangeModelContent (cada cambio de texto)
  -> Debounce 300ms
  -> Regex scan: /['"]([^'"]+\.(csv|parquet|json|xlsx))['"]/gi
  -> Para cada archivo NO cacheado:
     -> fetch GET /api/db/file-schema?path=...
     -> DuckDB ejecuta: DESCRIBE SELECT * FROM 'archivo.csv'
     -> Agrega columnas al cache global
     -> Re-sincroniza con worker
```

### 3. Flujo de Completions (usuario escribe)

```
Usuario escribe "SELECT u."
  -> Trigger char '.' activa completionProvider (SqlEditor.jsx:638-793)
  -> Si esta dentro de comillas: completions de rutas de archivos
     -> fetch GET /api/files/list -> retorna directorios/archivos
  -> Si NO esta en comillas: SQL context autocomplete
     -> workerBridge.getCompletions(line, column, triggerChar)
     -> Worker analiza con tree-sitter:
        1. isCleanStart()? -> Solo keywords raiz [SELECT, WITH, CREATE...]
        2. isJinjaContext()? -> Items de DBT (ref, source, modelos)
        3. findEnclosingStatement() -> Limita scope (no contamina subqueries)
        4. determineClause() -> SELECT|FROM|WHERE|JOIN|GROUP BY|ORDER BY|HAVING...
        5. extractTablesAndAliases() -> {u: 'users', referencedTables: Set['users']}
        6. isDotAccess()? -> Columnas de la tabla resuelta
        7. Filtrado contextual por clausula
     -> Worker retorna: { suggestions: [...], clause: 'SELECT' }
  -> Main thread agrega (SqlEditor.jsx:700-790):
     -> Smart Snippets (LEFT JOIN, CTE, SUM_COL, etc.)
     -> Funciones DuckDB (lazy-load desde /api/functions/catalog)
     -> Items DBT/Jinja (ref, source, config, var, env_var)
  -> Monaco renderiza popup de sugerencias
```

---

## Tipos de Completion Items

| Tipo | Kind | Fuente | sortText |
|------|------|--------|----------|
| **Columnas (dot-access)** | 3 (Field) | Schema cache, tabla resuelta | `0_` (max prioridad) |
| **Tablas** | 7 (Class) | Schema cache | `0_` |
| **Aliases** | 4 (Variable) | Extraccion AST | `1_a_` |
| **Columnas (scope)** | 3 (Field) | Tablas referenciadas en query | `1_b_` |
| **Keywords** | 14 (Constant) | Lista contextual por clausula | `4_` |
| **Funciones** | 5 (Function) | `/api/functions/catalog` | `5_` |
| **Snippets** | 27 (Snippet) | Hard-coded en SqlEditor | `6_` |
| **Items DBT** | 27 (Snippet) | Templates Jinja hard-coded | `6_` |
| **Archivos** | 9/2 (Module/File) | `/api/files/list` | N/A |
| **Modelos DBT** | 9 (Module) | `/api/dbt/manifest` | N/A |

---

## Trigger Characters

```javascript
triggerCharacters: ['.', '/', "'", '"', '{']
```

| Char | Funcion |
|------|---------|
| `.` | Dot-access: `tabla.columna` o `alias.columna` |
| `/` | Rutas de archivos dentro de strings |
| `'` | Rutas de archivos o identificadores |
| `"` | Identificadores quoted |
| `{` | Variables Jinja/DBT: `{{ ref('...') }}` |

---

## Logica Contextual por Clausula

### Que se muestra segun donde esta el cursor:

| Clausula | Tablas | Columnas | Funciones | Keywords |
|----------|--------|----------|-----------|----------|
| **ROOT** (inicio) | No | No | No | SELECT, WITH, CREATE, INSERT, DROP... |
| **FROM / JOIN** | Si | No | table, macro | ON, LEFT JOIN, INNER JOIN... |
| **SELECT** | No | Si (con scope) | scalar, aggregate, window, macro | FROM, AS, CASE, DISTINCT... |
| **WHERE** | No | Si (con scope) | scalar, macro (NO aggregates) | AND, OR, IN, BETWEEN, LIKE... |
| **GROUP BY** | No | Si (con scope) | No | HAVING, ORDER BY... |
| **ORDER BY** | No | Si (con scope) | scalar, aggregate, window | ASC, DESC, NULLS FIRST... |
| **HAVING** | No | Si (con scope) | aggregate, scalar, macro | AND, OR... |
| **LIMIT** | No | No | No | OFFSET |
| **CTE** | No | No | No | SELECT, AS |

---

## Heuristicas Inteligentes

### Scope Isolation (Aislamiento de Scope)
- `findEnclosingStatement()` usa tree-sitter para encontrar los limites del statement actual
- Previene que columnas de un scope padre contaminen subqueries
- Solo recorre el arbol del statement especifico

### Prevencion de Columnas Ambiguas
- Si hay **multiples tablas** referenciadas: auto-prefija columnas con alias
- Ejemplo: `SELECT u.id, o.id` en vez de `SELECT id, id`
- Previene errores "Ambiguous Column Name" en runtime

### Auto-Quoting de Identificadores
- Identifica automaticamente si un identificador necesita comillas
- Se quotea si tiene: espacios, acentos, caracteres especiales, empieza con digito, es palabra reservada SQL
- Ejemplo: `user name` -> `"user name"`, `select` -> `"select"`

### Fallback Global
- Si la deteccion de scope falla (nodos ERROR durante escritura rapida):
  - Usa `allColumns` (todas las columnas de todas las tablas)
  - Previene "sin sugerencias" cuando el AST tiene errores parciales

---

## Hover Provider

Registrado en `SqlEditor.jsx:825-862`:

- Detecta la palabra bajo el cursor
- Busca en `window.__duckdbFunctionCatalog`
- Muestra: **Firma** + **Categoria** + **Descripcion** + **Tabla de parametros**

---

## Endpoints del Backend

| Endpoint | Metodo | Proposito | Ubicacion |
|----------|--------|-----------|-----------|
| `/api/db/tables` | GET | Todas las tablas + columnas | server/index.js:149-168 |
| `/api/db/file-schema` | GET | Introspeccionar CSV/JSON/Parquet/XLSX | server/index.js:222-235 |
| `/api/files/list` | GET | Listado de archivos para path suggestions | server/index.js:68-101 |
| `/api/functions/catalog` | GET | Funciones DuckDB (cache + docs curadas) | server/index.js:1822-1883 |
| `/api/functions/refresh` | POST | Refrescar cache de funciones via DuckDB | server/index.js:1782-1820 |
| `/api/dbt/manifest` | GET | Modelos/sources DBT de manifest.json | server/index.js:1693-1730 |

### Detalle de `/api/db/tables`
```sql
-- Obtiene tablas
SELECT table_name, table_type FROM information_schema.tables WHERE table_schema='main'
-- Para cada tabla, obtiene columnas
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '...' AND table_schema = 'main'
```
- Excluye `amox_query_history` del listado

### Detalle de `/api/db/file-schema`
```sql
DESCRIBE SELECT * FROM 'ruta/al/archivo.csv'
```
- Acepta rutas relativas (las resuelve contra ROOT_DIR) o absolutas

### Detalle de `/api/functions/catalog`
- Cache en disco: `.amox/duckdb-functions-cache.json`
- Se obtiene via: `SELECT DISTINCT function_name, function_type, ... FROM duckdb_functions()`
- Se mezcla con documentacion curada (descripciones, categorias) en el merge

---

## Variables Globales

| Variable | Tipo | Proposito |
|----------|------|-----------|
| `window.__amoxSqlSchemaCache` | Object | Cache de schema: tablas + columnas |
| `window.__duckdbFunctionCatalog` | Array | Lista de funciones (lazy-loaded) |
| `window.__monacoSqlProviderRegistered` | Boolean | Previene registro duplicado del provider |

---

## Monaco Language Registration

### Tokenizer Monarch (`SqlEditor.jsx:254-339`)
- Lenguaje custom SQL con keywords especificos de DuckDB
- Keywords: SELECT, FROM, WHERE, JOIN, LATERAL, UNNEST, PIVOT, QUALIFY, etc.
- Type Keywords: INT, BIGINT, VARCHAR, BOOLEAN, JSON, MAP, LIST, STRUCT, ARRAY
- Operadores: `=`, `<>`, `!=`, `::`, `->>`, `->`, `||`
- Estados del tokenizer: root, string, quotedIdentifier, comment, jinjaVariable, jinjaTag, jinjaComment

### Tema Custom (`SqlEditor.jsx:103-201`)
- Temas dark y light
- Mapea CSS design tokens a colores Monaco
- Soporte especial para sintaxis Jinja: jinja.variable, jinja.tag, jinja.comment

---

## Dependencias

| Paquete | Version | Uso |
|---------|---------|-----|
| `@monaco-editor/react` | 4.7.0 | Wrapper de Monaco Editor |
| `web-tree-sitter` | 0.26.7 | Runtime WASM de tree-sitter |
| `@derekstride/tree-sitter-sql` | 0.3.11 | Gramatica SQL para tree-sitter |
| `sql-formatter` | 15.7.1 | Formateo de SQL (Ctrl+Shift+F) |

---

## Diagrama de Flujo Resumido

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   DuckDB     │───>│  Express API    │───>│  window.__cache  │
│ (schema)     │    │  /api/db/tables │    │  (global cache)  │
└──────────────┘    │  /api/db/file-  │    └────────┬─────────┘
                    │   schema        │             │
                    │  /api/functions/│    postMessage (updateSchema)
                    │   catalog       │             │
                    └─────────────────┘             ▼
                                          ┌──────────────────┐
  ┌──────────────┐                        │  SQL Worker       │
  │ Monaco Editor│──── getCompletions ───>│  (tree-sitter)   │
  │ (UI)         │<─── suggestions[] ─────│  AST analysis    │
  └──────┬───────┘                        └──────────────────┘
         │
         │ + Snippets, Functions, DBT items (main thread)
         ▼
  ┌──────────────┐
  │  Popup de    │
  │  Sugerencias │
  └──────────────┘
```
