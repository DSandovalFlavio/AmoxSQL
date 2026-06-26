---
name: Estrategia de Salida
description: Choose the right sink format, compression, and destination for a chain's output, and decide between exporting a file vs creating a table. Use at the end of a pipeline when deciding how to persist results.
keywords: export, exportar, salida, sink, parquet, csv, excel, compresión, formato, guardar, output, destino, persistir, create table
scope: engineering
---

# Estrategia de Salida

Activa al cerrar el flujo. La salida depende de quién consume el resultado.

## Elegir el sink

- **Export File** — escribe a disco. Elige formato por el consumidor:
  - **Parquet** — para volver a procesar o cargas grandes: columnar, comprimido, conserva tipos. Default `snappy`; `zstd` para máxima compresión. **Preferido para datos intermedios/grandes.**
  - **CSV** — para humanos u herramientas simples; pierde tipos, pesa más.
  - **Excel** — solo si un humano lo abrirá en hoja de cálculo.
  - **JSON** — para APIs o estructuras anidadas.
- **Create Table** — deja el resultado como tabla en la base para seguir usándolo en otros chains o en el editor SQL. No escribe archivo.

## Reglas

- Parametriza la ruta de salida con una variable (`${output_dir}/ventas.parquet`) para reutilizar el flujo.
- Antes del export, usa **Select Columns** para quedarte solo con las columnas finales y renombrarlas a nombres de negocio.
- Pon un **Assert not_empty** justo antes: nunca exportes un archivo vacío silenciosamente.
- Si el resultado alimenta otro chain, prefiere **Create Table** o Parquet sobre CSV (conserva tipos).
- Para entregas recurrentes, Parquet + ruta con variable hace el flujo repetible.

## Cierre

Con el sink definido, el flujo está completo. Repasa que cada transformación tenga su puerta de calidad ([[data-quality-gates]]) y que las rutas usen variables.
