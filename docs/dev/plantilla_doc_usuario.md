# Plantilla de página de documentación de usuario

Guía de autoría para las páginas de `docs/es/` y `docs/en/`. Copiar la estructura,
no este archivo. Regla: **cada página ES tiene su gemela EN con el mismo slug/ruta**.

## Reglas de estilo
- **Tono:** claro, directo, orientado a la tarea. Segunda persona ("puedes…", "you can…").
- **Sin referencias a tecnologías ajenas** (regla del proyecto): solo el stack real,
  proveedores LLM, DuckDB y AmoxSQL.
- **Sin emojis en cuerpos de instrucciones** salvo el conmutador de idioma del encabezado.
  (La UI usa iconos Lucide; en docs, describe el icono por su nombre/acción, no un emoji.)
- **Rutas de código clicables** cuando aporten: `client/src/...` (para la versión de usuario,
  normalmente NO hace falta citar código — eso es para docs/dev).
- **Cross-links** al final (Relacionado / Related).
- **Capturas** desde `../../../images/` (rutas relativas correctas por profundidad de carpeta).

## Estructura estándar (secciones)

```markdown
# <Título de la feature>

<!-- Language switch line, always first -->
**🌐 [English](../../en/<ruta>) · Español**

> Una línea: qué resuelve esta feature (el "elevator pitch").

## Qué es
2–4 párrafos. Qué es, qué problema resuelve, dónde vive en la app.

## Cuándo usarlo
Escenarios concretos. Cuándo SÍ y cuándo otra feature encaja mejor (con link).

## Cómo usarlo
Paso a paso numerado, con el flujo real de clics/atajos. Sub-secciones por sub-tarea.
Incluir capturas donde ayuden.

## Referencia de opciones
Tabla(s) exhaustiva(s) de cada opción/campo/botón: nombre · qué hace · valores · default.

## Tips y gemas
Detalles poco obvios pero potentes (las "gemas" del inventario).

## Atajos / formatos relacionados
Atajos de teclado, formatos de archivo involucrados.

## Relacionado
Enlaces a páginas hermanas de la guía.
```

La gemela EN usa la misma estructura con encabezados traducidos y
`**🌐 English · [Español](../../es/<ruta>)**` como primera línea.
