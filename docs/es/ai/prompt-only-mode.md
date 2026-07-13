# Modo prompt-only

**🌐 [English](../../en/ai/prompt-only-mode.md) · Español**

> El modo que hace útiles a los modelos locales pequeños: escriben SQL en texto, AmoxSQL lo intercepta, lo ejecuta con las mismas guardas y les pide que resuman.

<!-- 📷 CAPTURE: docs/images/ai/prompt-only-badge.png — El selector de modelo mostrando un modelo de tier low y la señal de que la conversación corre en modo prompt-only. -->

## Qué es

Los modelos de lenguaje muy pequeños (menos de ~3B de parámetros) no saben usar herramientas de forma fiable. En lugar de dejarlos fuera, AmoxSQL les ofrece un camino alternativo: el **modo prompt-only**. Es una estrategia de **dos pasadas** que convierte a un modelo de 1-2B en un analista real, aunque modesto.

Este modo se activa **automáticamente** cuando el modelo elegido es de [tier low](providers-and-models.md). No hay nada que configurar: si tu modelo es pequeño, AmoxSQL cambia de estrategia por ti.

## Cuándo aplica

- Corres un modelo local pequeño por hardware limitado o por rapidez.
- Quieres privacidad total con el modelo más ligero que te dé resultados decentes.
- Para tool-calling completo, gráficos y notebooks, elige un modelo de tier medium o superior (ver [Proveedores y modelos](providers-and-models.md)).

## Cómo funciona

El modo prompt-only sustituye el bucle de herramientas por dos pasadas coordinadas:

1. **Pasada 1 — el modelo escribe SQL.** AmoxSQL le da el esquema de tus tablas y archivos con **nombres virtuales** fáciles de referenciar, y el modelo responde con SQL embebido en bloques de texto.
2. **Intercepción.** AmoxSQL extrae el SQL, reemplaza los nombres virtuales por las referencias reales (rutas de archivo, nombres de tabla) y corrige errores comunes.
3. **Ejecución con guardas.** El SQL corregido se ejecuta sobre DuckDB con los **mismos límites** que el modo normal (tope de filas, timeout).
4. **Pasada 2 — el modelo resume.** AmoxSQL le devuelve el resultado y le pide una explicación en lenguaje natural.

Así el modelo pequeño nunca tiene que "llamar" a una herramienta: solo escribe SQL y lee resultados, que es lo que sí sabe hacer.

## Cómo saber que estás en él

- El **selector de modelo** marca el modelo como tier **low**.
- No verás bloques de tool calls encadenadas ni gráficos generados por la IA (esas capacidades son de tier medium+).
- Las respuestas son más simples: SQL + un resumen, sin plan visible ni NarrativeCard.

## Referencia

### Prompt-only vs. modo con herramientas

| Aspecto | Prompt-only (low) | Con herramientas (medium+) |
|---|---|---|
| Tool-calling | No | Sí |
| Estrategia | 2 pasadas (SQL → resumen) | Bucle de herramientas |
| Gráficos generados por IA | No | Sí |
| Notebooks | No | Sí |
| Plan visible / NarrativeCard | No | Sí (Deep Dive) |
| Guardas de SQL | Sí (mismos límites) | Sí |
| Ideal para | Modelos 1-2B locales | Modelos medianos, grandes y de nube |

### Qué pasa por dentro

| Paso | Acción |
|---|---|
| Mapeo virtual | Cada tabla/archivo recibe un nombre simple que el modelo referencia |
| Extracción | Se sacan los bloques ` ```sql ` (o SELECT sueltos) del texto |
| Reescritura | Los nombres virtuales → referencias reales de DuckDB |
| Ejecución | Sobre DuckDB, con tope de filas y timeout |
| Resumen | El modelo explica el resultado en la segunda pasada |

## Tips y gemas

- **No hay que activarlo:** el tier del modelo decide; elige un modelo pequeño y ya estás en prompt-only.
- **Sube de modelo para desbloquear:** si quieres gráficos, notebooks o el plan de Deep Dive, pasa a un modelo medium+.
- **Las guardas siguen ahí:** aunque sea un modelo diminuto, el SQL se ejecuta con los mismos límites de seguridad.
- **Arrastra contexto igual:** los archivos y tablas que sueltes se mapean a nombres virtuales para el modelo.

## Relacionado

- [Proveedores y modelos](providers-and-models.md) · [Herramientas del agente](agent-tools.md)
- [La IA de AmoxSQL](introduction.md) · [Asistente del editor](editor-assistant.md)
