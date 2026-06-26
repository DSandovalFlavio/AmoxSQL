---
name: Combinar Fuentes
description: Decide between Merge (stack rows / UNION) and Join (match on a key) when a chain has multiple inputs, and set keys and join type correctly. Use when a pipeline combines two or more upstream tables.
keywords: merge, join, combinar, unir, union, cruzar, llave, key, fuentes, multiple, append, lookup, enriquecer
next: data-quality-gates
scope: engineering
---

# Combinar Fuentes

Activa cuando el flujo tiene 2+ entradas que hay que combinar. La primera pregunta: **¿apilar filas o cruzar por llave?**

## Merge vs Join

- **Merge Tables** = apilar filas (UNION ALL / UNION). Mismo esquema, más registros. Ej: ventas_norte + ventas_sur. Conecta varias fuentes a un Merge.
  - `UNION ALL` conserva duplicados (más rápido, default); `UNION` los elimina.
- **Join Tables** = cruzar por llave para enriquecer. Distinto esquema, mismas entidades. Ej: ventas + catálogo de productos.
  - Conecta **exactamente 2** entradas: la primera es la izquierda, la segunda la derecha.
  - Elige el tipo: **LEFT** (conserva todas las de la izquierda — el más común para enriquecer), INNER (solo coincidencias), RIGHT, FULL.
  - Define las columnas llave izquierda/derecha.

## Reglas

- **Antes de un join, valida la llave**: nulos o duplicados en la columna de cruce inflan o pierden filas. Pon un Assert (unique / no_nulls) sobre la llave.
- Para Merge, asegura que las columnas se llamen igual (usa Select Columns para renombrar antes si difieren).
- Tras un LEFT join, revisa cuántas filas quedaron sin match (nulos en columnas de la derecha) — suele revelar problemas de llave.
- Si necesitas varios lookups encadenados, encadena varios Join (uno por fuente).

## Cierre

Tras combinar, valida el resultado ([[data-quality-gates]]) y sigue con agregación o export.
