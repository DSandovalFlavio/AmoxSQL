# Auditoría de Skills del Agente de IA

Revisión de las skills de `agent/skills/` para evaluar si son demasiado **rígidas** (tablas de lookup que reemplazan el juicio) o están bien calibradas, y cómo reescribirlas para que el agente **razone y generalice** correctamente.

Detonante: el agente elegía sistemáticamente un gráfico de línea (con una tendencia sin sentido) para datos de 4 regiones × 2 años, porque la guía de visualización era un mapeo mecánico *"columna de fecha → línea"*.

## El criterio: grados de libertad, no "rígido = malo"

Anthropic lo plantea así ([Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)): **ajusta la especificidad a la fragilidad de la tarea.**

- **Puente angosto** (baja libertad): una sola forma segura → pasos exactos. Ej.: un protocolo de herramientas, un SQL canónico frágil.
- **Campo abierto** (alta libertad): muchos caminos válidos → principios y juicio. Ej.: elegir un gráfico, decidir qué explorar.

El bug de storytelling no fue "estar estructurado": fue usar un **lookup rígido para una decisión de alta libertad**. La cura no es convertir todo en prosa abierta — es **calibrar** cada skill.

## Veredicto por skill

| Skill | Tarea | Libertad correcta | Estado previo | Cambio aplicado |
|-------|-------|-------------------|---------------|-----------------|
| `data-storytelling` | elegir gráfico (juicio) | Alta | ❌ lookup rígido | Reescrita como marco de razonamiento (mensaje → intención → forma → prueba 5s → énfasis) + ejemplo resuelto |
| `eda-initial` | qué explorar | Media | ⚠️ workflow + lookup de gráfico | Mantiene workflow; **delega la elección de gráfico** al marco; añade razonamiento de qué queries elegir según el perfil |
| `time-series` | analizar evolución | Media | ⚠️ hardcodea `line` | **Delega visualización** al marco (pocos puntos = comparación); granularidad como heurística, no ley; guardarraíl de tendencia |
| `data-quality` | auditar integridad | Media (plantillas) | leve | Antepone razonamiento de **priorización por impacto downstream**; conserva plantillas SQL |
| `metric-investigation` | root-cause | Media-alta | ✅ ya era framework | Retoque: enmarca como **hipótesis**, no barrido; preguntar si el "cambio" es ambiguo |
| `sql-optimization` | query lenta | Media | ✅ bien diseñada | Retoque: "el plan es la radiografía" — fix dirigido por hipótesis |
| `cohort-comparison` | construir cohortes | **Baja** (SQL canónico) | ✅ correcta | +razonamiento sobre **qué define la cohorte**; el SQL frágil se deja como plantilla deliberada |
| `analysis-planning` | protocolo de planificación | **Baja** (secuencia obligatoria) | ✅ correcta | **Sin cambios** — es el "puente angosto"; rígida a propósito |

## Enfermedad transversal: la elección de gráfico duplicada

`eda-initial` y `time-series` **re-hardcodeaban** la decisión de gráfico — el mismo bug que storytelling. Regla establecida: **`data-storytelling` es la única fuente de verdad para elegir visualización**; las demás skills delegan en ella en vez de re-especificar.

## Por qué la guía del prompt no bastó (y qué se hizo)

MiniMax M2.7 (tier `cloud`) **sí recibía** la guía nueva y aun así repetía la línea. Lección: para modelos que ignoran el prompt, hace falta **enforcement en la capa del tool** (feedback loop de datos, patrón recomendado por Anthropic). Cambios fuera de las skills:

1. **Guardarraíles en `display_chart`** (`server/ai/tools.js`):
   - Bloquea `line`/`area` con ≤2 períodos → error accionable que obliga a re-llamar con `bar` + `split_by`.
   - Advierte con 3 puntos.
   - Descarta la `trend_line` sobre series partidas/múltiples (suma sin sentido) y lo reporta en `warnings`.
2. **Anti-alucinación / ambigüedad** (`server/ai/prompt/modes.js`, modo assistant):
   - Para graficar: **siempre** `execute_sql` primero y usar el `queryId` EXACTO; nunca inventar ids (`'current'`).
   - Ante ambigüedad (columna, métrica, período, comparación): **preguntar** en la respuesta, no inventar datos para forzar un resultado.
3. **Marco siempre presente** (`server/ai/prompt/context.js`): la tabla *"Chart Types Available"* pasó a ser *"Chart Selection — reason, don't look up"* con guardarraíles duros.
4. **Fix de render** (`ChartRenderer.jsx`): la tendencia se fusiona en el dataset (`__amoxTrend`) en vez de usar `data` propio — corrige el gráfico vacío en split-by.

## Buenas prácticas aplicadas (Anthropic)

- Descripciones en **tercera persona** con *qué hace + cuándo usarla*.
- **Concisión**: asumir que el modelo es capaz; solo añadir lo que no sabe.
- **Grados de libertad** calibrados por fragilidad.
- **Feedback loops** (validar → corregir → repetir) en la capa del tool.
- Cuerpo de cada skill < 500 líneas; terminología consistente.

## Pendiente / ideas futuras

- **Auto-activación de skills por intención**: hoy solo se cargan si el cliente pasa `activeSkillId`. `matchSkillByIntent` existe pero no está cableado al chat — cablearlo haría que storytelling/EDA se disparen solos al graficar/explorar.
- **Evaluaciones**: crear 3 escenarios por skill (Anthropic recomienda eval-driven) para medir antes/después.

Fuentes: [Equipping agents with Agent Skills — Anthropic](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) · [Skill authoring best practices — Claude Docs](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
