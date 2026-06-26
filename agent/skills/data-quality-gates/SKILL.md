---
name: Puertas de Calidad
description: Place Assert and Schema Validation nodes as gates that halt a chain when data is wrong, so bad data never reaches the output. Use when the pipeline must guarantee correctness before exporting or loading downstream.
keywords: assert, validación, validar, calidad, gate, puerta, schema, esquema, detener, halt, garantía, integridad, checks, contrato
next: export-strategy
scope: engineering
---

# Puertas de Calidad

Activa cuando el flujo debe **garantizar** que los datos son correctos antes de producir su salida. Una puerta detiene el chain si la condición falla — mejor fallar fuerte que exportar basura.

## Nodos de puerta

- **Assert** — corta el chain si falla. Tipos:
  - `not_empty` — la tabla tiene filas (detecta ingestas/joins vacíos).
  - `row_count_gt` — al menos N filas (detecta cargas truncadas).
  - `no_nulls` en una columna — clave/métrica sin nulos.
  - `unique` en una columna — sin duplicados en la PK.
  - `custom_query` — cualquier regla SQL (devuelve ≥1 fila = pasa).
- **Schema Validation** — verifica que existan las columnas esperadas y (opcional) sus tipos; modo estricto falla ante columnas inesperadas. Útil como **contrato** sobre fuentes externas que pueden cambiar.

## Dónde colocarlas

1. **Justo después de ingestar** — Schema Validation: ¿el archivo trae las columnas que esperamos?
2. **Antes de un join** — Assert unique/no_nulls sobre la llave.
3. **Antes del sink** — Assert not_empty / row_count_gt: no exportes un archivo vacío.

## Reglas

- Una puerta que nunca falla no aporta — afina umbrales a lo que de verdad rompería aguas abajo.
- Mensajes claros: el nombre del nodo debe decir qué garantiza ("Llave de cliente única").
- No abuses: 2-3 puertas en los puntos críticos valen más que un assert por nodo.

## Cierre

Con las puertas puestas, define la salida con [[export-strategy]].
