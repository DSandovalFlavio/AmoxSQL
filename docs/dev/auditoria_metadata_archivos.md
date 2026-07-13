# Auditoría: rendimiento de inspección de metadata de archivos (Direct Query / Import)

**Fecha:** 2026-07-12
**Síntoma reportado:** al usar "Direct Query" sobre un Excel de ~80 MB, generar el scaffold SQL (query + comentarios con hojas, columnas y tipos) tarda ~30 segundos. También afecta "Copy Column Names", "Export for AI" y el modal "Import to Database" (que muestra spinner hasta tener la lista de hojas).

---

## 1. Flujo actual

```
Usuario → click derecho en .xlsx → "Direct Query"
  └─ LayoutManager.handleQueryFile (client/src/components/LayoutManager.jsx:833)
       └─ GET /api/files/inspect-columns (server/index.js:1055)
            ├─ [A] fs.readFile completo (80 MB a memoria)
            ├─ [B] xlsx.read(buf, {bookSheets:true})       ← SheetJS, solo para nombres de hojas
            ├─ [C] DESCRIBE read_xlsx(sheet=target)        ← DuckDB, hoja objetivo
            └─ [D] bucle secuencial: DESCRIBE read_xlsx(sheet=s) para CADA hoja
                   (la hoja objetivo se describe DOS veces — C está incluida en D)
```

El modal de import usa `/api/files/inspect-excel` (server/index.js:1029), que repite [A]+[B].

Consumidores de `inspect-columns`:
- `LayoutManager.jsx:833` — Direct Query (xlsx) y `:856` (csv/parquet/json)
- `FileExplorer.jsx:882` — Copy Column Names
- `ExportAiContextModal.jsx:65` — Export for AI

## 2. Causas raíz (confirmadas con benchmark y fuentes)

### C1 — SheetJS infla el archivo COMPLETO aunque solo pidas nombres de hojas (dominante)

`xlsx.read(buffer, {bookSheets:true})`: la opción `bookSheets` solo omite el parseo XML→celdas. La capa de contenedor ZIP de SheetJS (js-cfb) **infla eagerly todas las entradas del archivo** en `CFB.read` — para un xlsx de 80 MB comprimido eso son ~0.5–1.5 GB de XML descomprimidos en JS puro, en el hilo principal del server.

- Fuente: [js-cfb `parse_zip` → `parse_local_file` → `_inflateRawSync` por entrada](https://github.com/SheetJS/js-cfb/blob/master/cfb.js); [SheetJS issue #61](https://github.com/SheetJS/sheetjs/issues/61) ("ZIP/CFB is the stumbling block for large files").
- **Efecto secundario grave:** es CPU síncrono en el event loop del Express — mientras parsea, TODO el server se congela (AI SSE, queries, file explorer). El propio código lo reconoce (`index.js:1040`: "a worker_thread is the remaining follow-up").

### C2 — N+1 DESCRIBEs con trabajo duplicado

El endpoint describe la hoja objetivo y luego re-describe **todas** las hojas en un bucle secuencial (index.js:1077-1096). La hoja objetivo se paga dos veces. Cada `read_xlsx` reabre el zip.

Matiz importante: el bind de `read_xlsx` en DuckDB **se detiene temprano por diseño** (RangeSniffer/HeaderSniffer paran en la primera fila de datos; sharedStrings se resuelve solo hasta los IDs del header; el parseo completo ocurre en ejecución, no en bind). Fuente: [read_xlsx.cpp](https://github.com/duckdb/duckdb-excel/blob/main/src/excel/xlsx/read_xlsx.cpp), [worksheet_parser.hpp](https://github.com/duckdb/duckdb-excel/blob/main/src/excel/include/xlsx/parsers/worksheet_parser.hpp). Por eso el DESCRIBE es barato (ms) — el costo real vive en C1.

### C3 — Todo corre en el lane `main` de DuckDB

`inspect-columns` usa `dbManager.systemQuery()` sin opción de lane → lane `main` (DatabaseManager.js:316), la MISMA conexión que las queries del usuario. Si hay una query larga corriendo, la inspección se encola detrás. El lane `meta` existe exactamente para esto y ya lo usa `/api/db/describe` (index.js:747).

### C4 — Cero caché

Cada acción del menú contextual re-paga el costo completo. No existe caché de metadata de archivos; sí existe el patrón a copiar: caché por mtime en `ai/skills.js:4-6,134-139`.

## 3. Benchmarks (medidos en esta máquina, Electron ABI, DuckDB 1.5.0-r.1)

Archivo A: 55.4 MB, 1 hoja, 1M filas × 10 col (escrito por DuckDB — sin `<dimension>`, strings inline).
Archivo B: 41.5 MB, 3 hojas, 150k filas × 6 col c/u (escrito por SheetJS — con `<dimension>` y sharedStrings, como los xlsx reales de Excel).

| Operación | A (55 MB, 1 hoja) | B (41 MB, 3 hojas) |
|---|---|---|
| `fs.readFile` completo | 43 ms | — |
| `xlsx.read` bookSheets (SheetJS) | **2,994 ms** | **1,243–2,614 ms** |
| `DESCRIBE read_xlsx` (por hoja) | 749 ms | **4–6 ms** |
| `DESCRIBE` con `range='A1:J50'` | 746 ms (no ayuda) | — |
| `DESCRIBE` con `range='1:50'` | 1,943 ms (¡peor!) | — |
| **Nombres de hojas vía directorio central del zip** | **12 ms** | **2 ms** |
| **Total endpoint ACTUAL** (SheetJS + N+1 DESCRIBE) | 4,515 ms | 662–1,537 ms |
| **Total PROPUESTO** (zip + N DESCRIBE dedup) | — | **13 ms** |

Lecturas:
- El truco del zip (leer solo `xl/workbook.xml`: directorio central + inflar 1 entrada de ~2 KB) es **100–300× más rápido** que SheetJS y no bloquea el event loop de forma medible.
- El DESCRIBE es de milisegundos en archivos reales (con `<dimension>`); el peor caso medido (sin dimension, inline strings, 487 MB de XML) fue 750 ms — igualmente muy por debajo de SheetJS.
- `range` NO acelera el bind (ya es early-stopping); no usarlo.
- Los ~30 s del caso real = SheetJS sobre 80 MB (styles + sharedStrings reales) × 2 endpoints que lo llaman + N+1 DESCRIBEs + cola en lane main + GC de ~1 GB de strings.

## 4. Investigación de alternativas (web)

| Opción | Veredicto |
|---|---|
| **Leer `xl/workbook.xml` vía directorio central del zip (Node, ~50 líneas, cero deps)** | ✅ **Elegida.** 2–12 ms, validada en ambos archivos. `zlib.inflateRawSync` nativo. |
| Librerías zip (yauzl, node-stream-zip, unzipper, fflate) | Válidas pero innecesarias — ninguna está instalada y el lector manual ya está validado. fflate sería el fallback si apareciera un zip exótico. |
| SheetJS `bookSheets` | ❌ Infla todo el archivo (C1). Se mantiene SOLO como fallback si el parser de zip falla. |
| exceljs streaming WorkbookReader | ❌ Nombres de hoja no confiables ([exceljs #2663](https://github.com/exceljs/exceljs/issues/2663)); dependencia nueva. |
| Función DuckDB para listar hojas | ❌ No existe ([duckdb-excel #54](https://github.com/duckdb/duckdb-excel/issues/54) abierto sin respuesta). `st_read_meta` (spatial) lo hace pero arrastra GDAL. |
| Extensiones comunidad (`sheetreader`, `rusty_sheet`, calamine/WASM) | ❌ Aceleran la LECTURA completa, no la metadata (el bind ya es rápido). Dependencia/instalación extra sin ganancia aquí. |
| `range='1:100'` en read_xlsx | ❌ Medido: no mejora (y la sintaxis solo-filas es más lenta). El bind ya se detiene solo. |
| worker_thread para SheetJS | ❌ Innecesario al sacar SheetJS de la ruta. |
| Paralelizar DESCRIBEs (multi-conexión Neo) | ⚠️ Posible (conexiones distintas sí corren en paralelo — [docs de concurrencia](https://duckdb.org/docs/current/connect/concurrency)), pero con DESCRIBEs de 4-6 ms no vale la complejidad. Basta dedup + lane `meta`. |

CSV/JSON/Parquet ya son casi óptimos vía `DESCRIBE` (sniffer CSV muestrea 20,480 filas; Parquet es solo footer). El problema es exclusivo de xlsx.

## 5. Hallazgos secundarios

- **H1** — ImportExcelModal bloquea al usuario en `inspect-excel` (spinner "Processing Import...") antes de poder elegir hojas; con el fix abre al instante.
- **H2** — El archivo se lee 2 veces en el viaje de import (SheetJS para hojas + read_xlsx para importar); el fix elimina la primera.
- **H3** — `buildFileContext` (index.js:1979) hace `COUNT(*)` por archivo (scan completo) para contexto AI — fuera de alcance de esta auditoría, anotado como pendiente.
- **H4** — Los otros DESCRIBE del server (`file-schema`, `chains/schema/infer`, `attach_file`) no comparten lógica con `inspect-columns`; no se tocan.

## 6. Plan

Ver [plan_metadata_archivos.md](plan_metadata_archivos.md). Resumen: F1 lector zip de hojas (sin SheetJS) + F2 dedup DESCRIBEs y lane `meta` + F3 caché mtime + F4 verificación en app. Impacto esperado: **~30 s → <1 s frío (típicamente <100 ms), <5 ms cacheado**, y el server deja de congelarse durante la inspección.
