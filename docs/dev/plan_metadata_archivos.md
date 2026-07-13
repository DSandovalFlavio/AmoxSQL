# Plan de implementación: inspección de metadata de archivos rápida

**Auditoría base:** [auditoria_metadata_archivos.md](auditoria_metadata_archivos.md)
**Objetivo:** "Direct Query" / "Copy Column Names" / "Export for AI" / modal de import sobre un xlsx de 80 MB deben responder en <1 s en frío (típicamente <100 ms) y <5 ms cacheado, sin congelar el server.

**Estado:** ✅ IMPLEMENTADO (2026-07-12). F1–F4 hechas. Medido a través del server HTTP real:
inspect-columns multi-hoja **frío 102 ms / cacheado 3.6 ms**; inspect-excel 3.2 ms; CSV 10 ms
(antes ~30 s en el archivo real de 80 MB). Archivo nuevo: `server/xlsxMeta.js`.

---

## F1 — Lector de nombres de hojas sin SheetJS (la ganancia grande)

**Nuevo archivo `server/xlsxMeta.js`:**
- `getSheetNames(filePath)` — lee el directorio central del zip (tail del archivo, firma EOCD `0x06054b50`), localiza `xl/workbook.xml`, infla SOLO esa entrada (`zlib.inflateRawSync`) y extrae los `<sheet name="..."/>` en orden de pestañas. Validado en benchmark: 2–12 ms vs 1.2–3 s de SheetJS.
- Manejo de bordes: entrada `stored` (método 0) sin comprimir; EOCD con comentario (buscar en los últimos 64 KB + 22 bytes); si algo falla (zip exótico, ZIP64) → **fallback silencioso a SheetJS** (comportamiento actual) con `console.warn`.
- Decodificar entidades XML en nombres de hoja (`&amp;`, `&quot;`, etc.).

**Cambios:**
- `/api/files/inspect-excel` (index.js:1029): usar `getSheetNames`; eliminar `fs.readFile` completo + `xlsx.read`.
- `/api/files/inspect-columns` (index.js:1068-1071): ídem.
- `xlsx` (SheetJS) queda importado solo para el fallback y otros usos existentes.

## F2 — DESCRIBEs sin duplicados y fuera del lane main

En `/api/files/inspect-columns`:
- Eliminar el DESCRIBE separado de la hoja objetivo: el bucle sobre todas las hojas ya la incluye; `columns` = `sheetsWithColumns[targetSheet]`. (N+1 → N.)
- Pasar `{ lane: 'meta' }` a todos los `systemQuery` del endpoint (y en `/api/db/file-schema` por consistencia) para no encolarse detrás de queries de usuario. El facade ya existe (DatabaseManager.js:89-100).
- Mantener el bucle secuencial: a 4-6 ms por hoja no se justifica pool de conexiones.
- NO usar `range` (medido: no mejora el bind y la variante solo-filas es más lenta).

## F3 — Caché por mtime

- En `server/xlsxMeta.js` (o módulo propio): `Map` con clave `fullPath` → `{ mtimeMs, size, payload }`, validado con `fs.stat` en cada hit (patrón de `ai/skills.js:134-139`). Cap LRU ~50 entradas (delete + re-set).
- Aplica al resultado completo de `inspect-columns` (sheets + sheetsWithColumns + columns) y de `inspect-excel` (sheets).
- Beneficio directo: el viaje Direct Query → Import → Export for AI sobre el mismo archivo paga el costo una sola vez.

## F4 — Verificación

1. Re-correr `bench_inspect.js` / `bench_multisheet.js` (scratchpad) contra el endpoint modificado (curl con `console.time`): objetivo <1 s frío / <5 ms cacheado con los archivos sintéticos.
2. En la app (dev): Direct Query sobre xlsx multi-hoja grande, Copy Column Names, Export for AI, modal Import (la lista de hojas debe aparecer al instante), y un csv/parquet para confirmar que la rama no-Excel no cambió.
3. Confirmar que el server NO se congela durante la inspección (probar tecleo en editor + AI sidebar en paralelo).
4. Fallback: corromper un xlsx de prueba (truncar) → debe degradar a SheetJS/error limpio, no crash.

## Fuera de alcance (anotado en auditoría)

- `buildFileContext` con `COUNT(*)` por archivo (contexto AI) — pendiente aparte.
- Paralelizar DESCRIBEs con pool de conexiones Neo — innecesario a 4-6 ms/hoja.
- worker_thread para SheetJS — innecesario al sacarlo de la ruta caliente.

## Estimación de impacto

| Escenario (xlsx 80 MB, ~5 hojas) | Antes | Después |
|---|---|---|
| Direct Query (frío) | ~30 s | ~50–300 ms |
| Direct Query (repetido) | ~30 s | <5 ms |
| Modal Import (lista de hojas) | ~10–30 s spinner | instantáneo |
| Server congelado durante parse | sí (event loop) | no |
