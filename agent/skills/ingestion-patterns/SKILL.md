---
name: Patrones de Ingesta
description: Best practices for loading files into a chain — single file, folder globs, type detection, and union of many files. Use when the pipeline starts from CSV/Parquet/JSON/Excel files or a folder of files.
keywords: ingesta, cargar, importar, import, csv, parquet, json, excel, carpeta, folder, archivos, union, glob, fuente, source, leer
next: data-cleaning-pipeline
scope: engineering
---

# Patrones de Ingesta

Activa al inicio de un flujo cuando la fuente son archivos. Elige el patrón por la forma de los datos en disco.

## Patrones

- **Un archivo** → nodo **Import File**. Deja `auto_detect` para CSV; especifica el tipo si la extensión miente.
- **Muchos archivos del mismo esquema** (ventas_2023.csv, ventas_2024.csv…) → nodo **Import Folder** con patrón (`*.csv`) — usa `union_by_name=true` por debajo, así columnas en distinto orden no rompen la unión.
- **Datos remotos** → nodo **HTTP Fetch** (DuckDB lee la URL directo vía httpfs).
- **Tabla ya en la base** → nodo **Table Source** (no recarga, la referencia).

## Reglas

- **Nombra la tabla de ingesta de forma estable** (`raw_ventas`), no el default. Las fuentes son datos del usuario y viven en `main`.
- Para CSV problemáticos: ajusta `delimiter` y `skip rows` en la pestaña Advanced antes de pelear con la limpieza.
- Para Excel, indica la hoja si no es la primera.
- **No transformes en la ingesta.** Carga crudo; limpia en el siguiente nodo. Así el crudo queda inspeccionable si algo sale mal.
- Si vas a cargar y procesar repetidamente, parametriza la ruta con una variable `${input_path}`.

## Cierre

Tras ingestar, encadena [[data-cleaning-pipeline]] y, si hay varias fuentes, [[multi-source-merge]].
