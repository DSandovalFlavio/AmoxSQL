# Pendiente — Rendimiento con múltiples visualizaciones (para sesión de optimización)

> Contexto para una **sesión dedicada a rendimiento**. En la sesión del 2026-07-04 (rama Report Flow) el usuario reportó que la interfaz se **traba y la escritura se pone muy lenta** cuando hay **varias visualizaciones montadas a la vez** (notebook con muchas celdas de gráfico, y Deep Dive con muchos gráficos). Se arreglaron dos *floods* de consola que **amplificaban** el problema, pero **la causa de fondo (costo de montar muchos gráficos) sigue pendiente**. Este doc separa lo ya resuelto de lo que falta y deja hipótesis priorizadas para investigar.

---

## 1. Ya resuelto en esta sesión (no re-investigar)

Ambos eran *floods* de consola. En **dev**, cada `console.error`/warning con stack es caro; se disparaban por keystroke / por render de streaming, y ESE ruido era el costo dominante percibido. Resueltos:

1. **SQL worker: error de autocompletado por cada tecla.**
   - Causa: el completion provider de Monaco es **global por lenguaje** pero estaba amarrado al **primer editor montado**. Cada celda SQL es su propio editor + su propio worker (con su propio AST). Al teclear en otra celda, respondía el provider de la primera con el worker equivocado → posición de cursor fuera del texto → `lines[i].length` sobre `undefined` → excepción + 2 errores por tecla.
   - Fix: provider global que **enruta por `model.uri`** a un `resolver` por instancia (mapa `window.__amoxSqlCompletionResolvers`), provider/hover de **por vida de la app** (ya no muere al desmontar la primera celda), y guardia de límites en el worker (`row/col` fuera de rango → devuelve vacío en silencio).
   - Archivos: [client/src/components/SqlEditor.jsx](../../client/src/components/SqlEditor.jsx), [client/src/workers/sqlLanguageWorker.js](../../client/src/workers/sqlLanguageWorker.js).

2. **Deep Dive: keys duplicadas de React.**
   - Causa: el inspector agrupa por paso del plan usando `step_id` como key; el agente revisita pasos / re-crea el plan → dos secciones con la misma key → warning por cada render de streaming.
   - Fix: la key incluye el ordinal de sección (`s1#3`) / el índice del paso.
   - Archivos: [client/src/components/ai/deepDiveTurns.js](../../client/src/components/ai/deepDiveTurns.js), [client/src/components/ai/AgentPlanPanel.jsx](../../client/src/components/ai/AgentPlanPanel.jsx).

> **Primer paso de la próxima sesión:** confirmar con la consola limpia **cuánta lentitud real queda** una vez quitado el ruido. El flood era el costo dominante; puede que la percepción mejore mucho. Medir antes de optimizar.

---

## 2. El problema de fondo que queda

**Síntoma:** con N gráficos montados simultáneamente, la UI se arrastra y **teclear** (en una celda de notebook, o en el chat/deck) se siente lento.

**Dónde se reproduce:**
- **Notebook** (`SqlNotebook` / `NotebookCell`) con varias celdas que renderizan gráfico (Story Flow / `DataVisualizer`).
- **Deep Dive** (`AiDivingPanel` / `DeepDiveInspector`) cuando un análisis genera muchos gráficos inline.
- **Report Flow – vista Present** (nueva): monta **todas** las slides a la vez; cada `amoxchart` es un `AmoxChartEmbed` → `DataVisualizer`. La vista **Design** ya monta solo la slide activa (bien), pero **Present** monta todo.

**Sospechosos (por probable impacto, a verificar con profiler — NO asumir):**

1. **Muchos `ResponsiveContainer` de Recharts montados a la vez.** Cada uno trae su `ResizeObserver` + relayout con debounce (~120ms). N gráficos = N observers + N re-render de SVG pesado. Recharts es caro por instancia.
2. **Re-render en cascada al teclear.** Si `NotebookCell` / los contenedores de gráfico no están correctamente memoizados (o reciben props con identidad nueva en cada render — objetos/arrays recreados), teclear en una celda re-renderiza a las hermanas y sus gráficos. **Verificar límites de `React.memo` y estabilidad de props** (config/data del chart).
3. **Streaming re-renderiza todo.** En Deep Dive, cada evento de stream re-renderiza el árbol; si los gráficos ya montados no están aislados/memoizados, re-renderizan por token. Considerar **throttling/batching** de los updates de streaming y **aislar** el subárbol de texto que se actualiza del subárbol de gráficos.
4. **Muchos editores Monaco.** Cada celda es una instancia completa de Monaco — caro en sí. Palanca grande: **montar Monaco perezoso por celda** (solo la celda enfocada/en edición tiene editor real; las demás muestran un `<pre>` resaltado de solo lectura hasta que se clican).

---

## 3. Direcciones a investigar (hipótesis, priorizadas)

> Regla del repo: **NO introducir virtualización de listas** (`@tanstack/react-virtual` u otras) — ya perjudicó antes; `ResultsTable` pagina. Las ideas de abajo son **montaje perezoso / bajo demanda**, que NO es windowing de listas.

1. **Perfilar primero** (React DevTools Profiler): ¿qué se re-renderiza al teclear una celda? ¿y en cada evento de streaming? Confirmar hipótesis 2 y 3 antes de tocar nada.
2. **Montaje perezoso de gráficos fuera de viewport** vía `IntersectionObserver`: renderizar un placeholder ligero (o el título) hasta que la celda/slide entra en pantalla; montar el `DataVisualizer` solo entonces. Aplica a notebook, Deep Dive y **Report Flow Present**. (No es virtualización de lista: es lazy-mount por visibilidad.)
3. **Memoización y estabilidad de props:** revisar `NotebookCell`, `DataVisualizer`, `ChartRenderer`, `ResultsTable`. Asegurar `React.memo` con props estables (memoizar `config`/`data`, callbacks con `useCallback`). Evitar recrear objetos de config por render.
4. **Costo de `ResponsiveContainer`:** evaluar fijar dimensiones (medir el contenedor una vez y pasar width/height explícitos) para evitar la churn de N `ResizeObserver`; o un observer compartido.
5. **Streaming:** batch/throttle de los `setState` durante el stream de AI; separar el área de texto que cambia del árbol de gráficos (memo boundary).
6. **Monaco perezoso por celda** (palanca grande para notebooks con muchas celdas).
7. **Report Flow Present específico:** aplicar el lazy-mount por slide (Design ya está bien). Considerar un modo "cargar gráficos" manual si el deck tiene muchos.

---

## 4. Notas de arranque para la próxima sesión

- Reproducir: abrir un `.sqlnb` con varias celdas de gráfico (o correr un Deep Dive que genere 5+ gráficos) y **teclear** en una celda; medir con Profiler.
- Empezar por **medir** (paso 1) — el flood ya se quitó, así que la línea base cambió.
- Ver también [plan_rendimiento_ui.md](plan_rendimiento_ui.md) por trabajo de rendimiento previo.
- Archivos foco: `client/src/components/SqlNotebook.jsx`, `NotebookCell.jsx`, `DataVisualizer/` (`ChartRenderer.jsx`, `useChartState.js`), `ResultsTable.jsx`, `ai/AiDivingPanel.jsx`, `ai/DeepDiveInspector.jsx`, `deck/AmoxChartEmbed.jsx`.
