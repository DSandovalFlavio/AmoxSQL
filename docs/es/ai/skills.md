# Skills de la IA

**🌐 [English](../../en/ai/skills.md) · Español**

> Playbooks de análisis reutilizables: cada Skill le da a la IA una metodología especializada (cómo hacer una EDA, cómo investigar una caída de métrica, cómo diseñar un pipeline) para que no improvise el enfoque cada vez.

<!-- 📷 CAPTURE: docs/images/ai/skills-panel.png — Panel de Skills con la lista de skills built-in, cada una con nombre, descripción y chips de keywords; una expandida mostrando su contenido -->

## Qué es

Una **Skill** es un archivo Markdown con instrucciones especializadas que guían a la IA para un tipo de tarea concreto. En lugar de dejar que el agente decida sobre la marcha cómo abordar "explora este dataset" o "por qué cayó el revenue", una Skill le entrega un método probado: qué revisar, en qué orden y con qué criterio.

AmoxSQL trae un **conjunto built-in de 14 skills** y puedes añadir las tuyas dentro del proyecto. La IA elige la más relevante **automáticamente** según lo que escribes (en [Deep Dive](deep-dive.md)), o puedes fijar una a mano. Solo hay una skill activa por conversación.

Las skills se consultan en el **panel de Skills** de la sección de IA: una lista de solo lectura donde cada entrada muestra su nombre, descripción y keywords, y puedes expandirla para leer su contenido completo.

## Cuándo usarlo

- Cuando quieres que un análisis siga una **metodología consistente** (una EDA siempre igual de rigurosa, una investigación de causa raíz bien estructurada).
- Cuando tu equipo repite un **flujo de trabajo** y quieres codificarlo una vez en vez de re-explicarlo en cada chat.
- Deja que la **auto-activación** trabaje por ti la mayoría de las veces; fija una skill a mano solo cuando quieras forzar un enfoque distinto al que la IA elegiría.

## Cómo usarlo

### Dejar que se active sola
1. Abre **Deep Dive** y escribe tu pregunta con normalidad.
2. La IA compara tu mensaje con las keywords y la descripción de cada skill y activa la de mejor coincidencia. Por ejemplo, "por qué bajaron las ventas" activa *Investigación de Métricas*; "dame un overview de esta tabla" activa *EDA — Exploración Inicial*.
3. La skill activa se refleja en la conversación; el resto del flujo (plan, tools, narración) sigue igual.

### Elegir una a mano
1. En el selector de skill de la conversación, elige la que quieras usar.
2. Esa skill queda fija para la conversación y anula la auto-activación.

### Crear una skill de proyecto
1. Crea la carpeta `agent/skills/<id>/` en la raíz de tu proyecto.
2. Dentro, crea `SKILL.md` con front-matter YAML y el cuerpo en Markdown:

```markdown
---
name: Explorar Primero
description: Fuerza inspección cuidadosa del esquema antes de escribir SQL
keywords: explorar, esquema, describe, columnas, verificar
scope: analysis
next: data-storytelling
---

# Explorar Primero

Antes de escribir SQL sobre cualquier tabla que no hayas perfilado:
1. `list_tables` — confirma el nombre exacto de la tabla.
2. `describe_table` — obtén columnas y tipos exactos.
3. `SELECT * FROM <tabla> LIMIT 5` — ve valores reales.
4. Solo entonces escribe tu query analítica.
```

3. Guarda el archivo. El panel de Skills recarga las skills del proyecto (usa el botón de refrescar si hace falta).

Una skill de proyecto **anula** a la built-in que tenga el mismo `id`, así que puedes personalizar una built-in copiando su `id`.

## Referencia

### Skills built-in — ámbito de análisis

| ID | Nombre | Para qué |
|---|---|---|
| `eda-initial` | EDA — Exploración Inicial | Primer vistazo a un dataset: estructura, calidad y distribuciones clave |
| `data-quality` | Calidad de Datos | Nulos, duplicados, outliers y problemas de integridad, priorizados por impacto |
| `sql-optimization` | Optimización SQL | Diagnostica y arregla queries lentas con `EXPLAIN` y trucos de DuckDB |
| `time-series` | Series Temporales | Tendencias, estacionalidad, anomalías y comparación de períodos |
| `cohort-comparison` | Análisis de Cohortes | Retención de grupos definidos por un evento inicial a lo largo del tiempo |
| `metric-investigation` | Investigación de Métricas | Causa raíz: qué dimensión explica un salto o caída de una métrica |
| `data-storytelling` | Data Storytelling | Convertir resultados en una narrativa visual clara y convincente |
| `analysis-planning` | Análisis con Plan de Pasos | Análisis multi-paso con progreso visible (activa `create_plan`) |

### Skills built-in — ámbito de ingeniería

Guían la construcción de pipelines y **también alimentan el generador de [Data Flow](../data-flow/data-flow.md)**.

| ID | Nombre | Para qué |
|---|---|---|
| `pipeline-design` | Diseño de Pipeline | Descompone un objetivo en un flujo source → transform → sink |
| `ingestion-patterns` | Patrones de Ingesta | Cargar archivos: archivo único, globs de carpeta, unión de muchos |
| `data-cleaning-pipeline` | Limpieza en Pipeline | Secuenciar limpieza (trim/nulos/dedup/cast) en el orden correcto |
| `multi-source-merge` | Combinar Fuentes | Decidir entre apilar filas (UNION) o cruzar por llave (JOIN) |
| `data-quality-gates` | Puertas de Calidad | Nodos de aserción que detienen el flujo si los datos están mal |
| `export-strategy` | Estrategia de Salida | Elegir formato, compresión y destino de la salida del flujo |

### Campos del front-matter (`SKILL.md`)

| Campo | Qué hace |
|---|---|
| `name` | Nombre visible en la UI |
| `description` | Descripción de una línea; se usa en la UI y en la coincidencia por intención |
| `keywords` | Lista separada por comas; puntúa la auto-activación |
| `scope` | `analysis` (por defecto) o `engineering` — agrupa la skill por caso de uso |
| `next` | IDs de skills a sugerir cuando esta termina |

## Tips y gemas

- **La coincidencia usa keywords y la descripción.** Rellenar bien `keywords` (en español e inglés) mejora mucho la auto-activación de tus skills propias.
- **`next` encadena flujos.** Muchas skills built-in apuntan a `data-storytelling` como paso final para cerrar con una visualización.
- **Versiona `agent/skills/` en tu repo** para que tu equipo comparta los mismos playbooks automáticamente.
- **El panel es de solo lectura:** se edita el `SKILL.md`, no la UI. Es un archivo de texto a propósito, para poder revisarlo en control de versiones.

## Relacionado

- [Deep Dive](deep-dive.md) · [Herramientas del agente](agent-tools.md) · [Contexto como código](context-as-code.md)
- [Precisión y salvaguardas](accuracy-and-guardrails.md) · [Data Flow](../data-flow/data-flow.md)
