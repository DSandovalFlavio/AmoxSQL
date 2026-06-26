---
name: Diseño de Pipeline
description: Descompone un objetivo de procesamiento en un flujo de nodos Chains (source → transform → sink). Use when the user wants to build a data pipeline / chain, or describes an end-to-end "load X, clean it, summarize, export" goal.
keywords: pipeline, flujo, chain, etl, elt, diseñar, construir, build, orquestar, pasos, steps, ingeniería, procesar, flujo de datos, automatizar
next: ingestion-patterns
scope: engineering
---

# Diseño de Pipeline

Activa cuando el objetivo es **construir un flujo de procesamiento** en Chains, no analizar datos ad-hoc. Piensa como ingeniero de datos: entradas → transformaciones → salidas, con puntos de validación.

## Cómo descomponer

1. **Identifica las salidas primero** (¿qué tabla/archivo final se necesita?). El sink define el flujo hacia atrás.
2. **Mapea las fuentes**: archivos (Import File / Import Folder), tablas existentes (Table Source), o URLs (HTTP Fetch).
3. **Ordena las transformaciones** entre fuente y sink: limpieza → tipado → join/merge → filtro → agregación → orden.
4. **Inserta puertas de calidad** (Assert / Schema Validation) en los puntos donde un error corrompería todo lo de abajo.
5. **Cierra con el sink**: Export File (CSV/Parquet/Excel) o Create Table.

## Reglas de diseño

- Un nodo, una responsabilidad. Prefiere varios nodos claros a un SQL inline gigante.
- Pon la **limpieza y el tipado cerca de la fuente**, antes de joins y agregaciones.
- Usa **variables** (`${nombre}`) para rutas y umbrales reutilizables, no valores hardcodeados.
- Valida (Assert) **después de ingestar** y **antes de exportar**.
- Nombra los nodos por lo que producen ("Ventas limpias 2025"), no por su tipo.

## Cierre

Propón el flujo como lista ordenada de nodos con sus conexiones, y explica dónde van las puertas de calidad. Si el usuario confirma, constrúyelo nodo por nodo. Sugiere [[ingestion-patterns]] para la carga y [[data-quality-gates]] para las validaciones.
