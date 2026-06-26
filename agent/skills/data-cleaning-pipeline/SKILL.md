---
name: Limpieza en Pipeline
description: Sequence cleaning steps in a chain — trim/case/replace, null handling, deduplication, and type casting — in the right order. Use when raw ingested data needs cleaning before joins or aggregation.
keywords: limpieza, limpiar, clean, trim, nulos, null, duplicados, dedup, cast, tipos, normalizar, estandarizar, formato, reemplazar
next: data-quality-gates
scope: engineering
---

# Limpieza en Pipeline

Activa después de la ingesta, antes de joins/agregaciones. El **orden importa**: limpiar texto antes de deduplicar, tipar antes de calcular.

## Orden recomendado de nodos

1. **Clean / Replace** — normaliza texto: trim, lower/upper, replace, regex, rellenar nulos, anular vacíos. Estandariza categorías ANTES de agrupar (si "Norte" y "norte " son distintos, fragmentan los grupos).
2. **Type Cast** — convierte columnas a su tipo real (fechas, números). Usa `TRY_CAST` (el nodo ya lo hace): valores inválidos → NULL en vez de romper.
3. **Deduplicate** — quita duplicados. Si hay clave de negocio, dedup por esas columnas (keep first/last); si no, dedup de filas exactas.
4. **Filter** — descarta filas fuera de alcance (fechas futuras, montos imposibles) una vez tipadas.

## Reglas

- **Tipar antes de filtrar por rango**: `amount > 100` sobre texto no compara como número.
- Deduplica **después** de normalizar texto, o duplicados "casi iguales" se escapan.
- No borres columnas todavía; eso es trabajo de Select Columns más adelante, cerca del sink.
- Si una limpieza es compleja y única, un nodo **SQL Query** puntual es válido — pero prefiere los nodos visuales para que el flujo sea legible.

## Cierre

Tras limpiar, pon una puerta de calidad ([[data-quality-gates]]) antes de seguir con joins o agregaciones.
