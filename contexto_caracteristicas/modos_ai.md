# Modos de IA: Assist y Deep Dive

AmoxSQL tiene **dos modos de IA** — mismo motor, distinta autonomía y alcance. Uno te acompaña mientras editas; el otro corre el análisis por ti.

## Assist — "Tu copiloto en el editor"

- **Dónde vive:** la barra lateral (Ctrl+L), **ligada al archivo abierto** (`.sql` / `.sqlnb`).
- **Qué hace:** genera, arregla o explica la query actual; propone y aplica un gráfico para el resultado; mejora el storytelling de la celda.
- **Cómo responde:** reactivo y **compacto pero conversacional** — abre con el hallazgo, teje los números en la frase, cierra con el siguiente paso. Tú conduces, él ayuda.
- **Úsalo cuando:** estás escribiendo SQL o ajustando un gráfico y quieres una mano.
- **Ejemplos:** *"Explica esta query"*, *"Grafica este resultado por región"*, *"¿Por qué devuelve 0 filas?"*.

## Deep Dive — "Tu analista autónomo"

- **Dónde vive:** una pestaña a pantalla completa, sobre **toda la base de datos local**.
- **Qué hace:** **planifica** los pasos (plan visible), **explora por su cuenta**, narra los hallazgos y puede **construir un notebook** `.sqlnb` con gráficos.
- **Cómo responde:** proactivo, **prosa primero** (análisis narrado); la tarjeta de resumen estructurado es un complemento colapsable, no la respuesta entera.
- **Úsalo cuando:** tienes una pregunta de negocio y quieres el análisis completo hecho por ti.
- **Ejemplos:** *"¿Por qué cayeron las ventas en Q3?"*, *"Encuentra los drivers de churn"*, *"Dame un overview de este dataset"*.

## ¿Por qué dos modos?

Uno **te acompaña mientras tú conduces**; el otro **conduce por ti**. Tenerlos separados evita que el modo rápido se vuelva pesado planificando, y que el modo profundo se quede corto. Regla práctica: **Assist mientras trabajas; Deep Dive cuando quieres trabajo hecho.**

Puedes **promover** una conversación de Assist a Deep Dive en cualquier momento con el botón ↗ del panel.

## Características compartidas

- **Citaciones inline:** los números en la prosa enlazan a la query que los produjo (clic → "Source Query").
- **Skills** (markdown en `agent/skills/`): marcos de razonamiento por dominio (EDA, series temporales, storytelling, etc.).
- **Contexto-como-código:** `.amoxsql/context/` (métricas, glosario, joins, ejemplos Q→SQL) y `RULES.md` se inyectan en el prompt.
- **Memoria** entre conversaciones y **descubrimiento dinámico de modelos** por proveedor.

## Dónde está documentado para el usuario

- **Settings → AI → Modes**: tabla "cuándo usar cada uno".
- **Botón "?"** en el header del panel de IA: guía corta in-app (`AiModesGuide`).
- **Empty-state** del panel: el modo + su tagline + ejemplos clicables.
- **Tour de primer uso** (una vez): presenta ambos modos.
- **Tooltip** del control que abre Deep Dive: explica qué cambia al pasar de un modo al otro.

## Referencias de código

- Prompt por modo: `server/ai/prompt/modes.js` (`buildAssistantModeSection`, `buildDivingModeSection`).
- Loop agéntico (Deep Dive): `server/ai/agenticLoop.js` (+ `ai/tools_planner.js` para `create_plan`/`update_plan`).
- Paneles: `client/src/components/ai/AiAssistantPanel.jsx`, `AiDivingPanel.jsx`.
- Guía + tour: `client/src/components/ai/AiModesGuide.jsx`.

Ver también: [sistema_ai.md](sistema_ai.md) (arquitectura del subsistema de IA).
