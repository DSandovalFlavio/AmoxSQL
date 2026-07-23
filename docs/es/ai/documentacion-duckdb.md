# Documentación de DuckDB para la IA

**🌐 [English](../../en/ai/duckdb-docs.md) · Español**

> La IA lleva la documentación oficial de DuckDB en el bolsillo — empaquetada y sin conexión — para acertar la sintaxis específica que los modelos suelen fallar (EXCLUDE, QUALIFY, PIVOT, list comprehensions…).

## Qué es

DuckDB tiene features de SQL propias que no existen en otros dialectos, y los modelos —sobre todo los locales pequeños— a veces las inventan mal. AmoxSQL trae **un snapshot completo de la documentación SQL de DuckDB** (los ~126 temas de `docs/current/sql`) empaquetado con la app. Cuando la IA duda de una sintaxis, consulta ese doc **sin conexión** y trae la sección exacta con ejemplos antes de escribir el SQL.

Por ejemplo, si preguntas *"quiero usar EXCLUDE en un SELECT"*, la IA busca el doc de la Star Expression, lee la cláusula `EXCLUDE` con su ejemplo, y genera el SQL correcto a la primera — en vez de adivinar.

## Cómo funciona

- La IA tiene dos herramientas que llama por su cuenta cuando no está segura de la sintaxis:
  - **`lookup_duckdb_docs`** — consulta la documentación empaquetada (prosa + ejemplos). Devuelve la sección relevante **y el índice de secciones del archivo**, así que si la respuesta está en otra sección, la pide con precisión.
  - **`lookup_duckdb_function`** — pregunta al **motor DuckDB en vivo** (`duckdb_functions()`) la firma exacta de cualquier función: tipos de parámetros, tipo de retorno y ejemplos. Como viene del motor que ejecuta tus consultas, **siempre coincide con tu versión de DuckDB y es imposible de inventar**.
- Además, antes de mostrarte SQL con una feature DuckDB-específica, la IA lo **valida contra el motor** (sin ejecutarlo) — si no es válido, no te lo muestra: busca la sintaxis correcta y la corrige.
- Todo es **local**: la documentación viene empaquetada y el motor es el tuyo; no se envía tu consulta ni tus datos a ningún lado.
- Devuelve **solo la sección relevante** (no el manual entero), para no saturar el contexto de los modelos chicos.

> Nota: la herramienta la usan los modelos con *tool-calling* (tier medium o superior). Los modelos muy pequeños (prompt-only) no la llaman.

## Mantenerla al día

En **Ajustes → IA → Documentación de DuckDB (offline)** verás la **última fecha de actualización**, cuántos temas hay, y tres modos:

| Modo | Qué hace |
|---|---|
| **Solo base (offline)** | Nunca descarga nada. Usa siempre la copia empaquetada. 100% sin conexión. |
| **Manual** | Tú decides cuándo, con el botón **"Actualizar ahora"**. |
| **Automática** | AmoxSQL busca una versión más reciente cada cierto tiempo (configurable en días) al iniciar. |

- El botón **"Actualizar ahora"** descarga la última documentación desde el repositorio oficial de DuckDB y la guarda como tu copia actualizada (que tiene precedencia sobre la base).
- Si estás sin conexión, la actualización simplemente no ocurre y se sigue usando la copia que ya tienes — nunca te quedas sin documentación.

## Tips y gemas

- **Empieza sin tocar nada**: la copia base ya viene fresca; funciona sin conexión desde el primer día.
- **Modo automático para olvidarte**: si quieres que la doc esté siempre razonablemente al día sin pensar en ello, deja el modo Automática.
- **Modo solo-base para entornos aislados**: si trabajas en una máquina sin salida a internet o con políticas estrictas, "Solo base" garantiza cero llamadas de red.
- **Cuándo actualizar manualmente**: si DuckDB acaba de sacar una función nueva y quieres que la IA la conozca ya, pulsa "Actualizar ahora".

## Relacionado

- [La IA de AmoxSQL](introduction.md) · [Herramientas del agente](agent-tools.md)
- [Proveedores y modelos](providers-and-models.md) · [Rendimiento de la IA local](rendimiento-local.md)
- [Precisión y garantías](accuracy-and-guardrails.md)
