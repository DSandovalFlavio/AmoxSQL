# Auditoría de continuidad entre formatos — AmoxSQL

> **Estado**: auditoría completa (2026-09-03), sobre `main` en v4.1.0. **Las 6 fases del plan implementadas** (2026-09-03/04, rama `claude/continuidad-formatos`) — Fase 1 completa, Fase 2 parcial (3/5), Fase 3 completa, Fase 4 parcial (4/5), Fase 5 completa, Fase 6 completa. Ver registro de cada una al final del documento.
> **Pregunta que la origina**: cuando un análisis avanza de una query a un gráfico, a un notebook, a una presentación — ¿qué pasa con los archivos que quedan atrás? ¿El usuario sabe cuál es "el bueno"? ¿Los saltos entre formatos son fluidos o hay que rehacer trabajo?

---

## 1. El mapa de artefactos

AmoxSQL tiene **seis artefactos de usuario** y **cinco formatos de salida**. Este es el mapa real, verificado en código:

### Artefactos (viven en el proyecto)

| Artefacto | Extensión | Qué contiene | Dónde se edita |
|---|---|---|---|
| Query | `.sql` | Texto SQL | SqlEditor (Monaco) |
| Notebook | `.sqlnb` + `.sqlnb.state.json` | Celdas (SQL / Texto / Input) + environment; el sidecar guarda resultados y configs de gráfico | SqlNotebook |
| Gráfico | `.amoxvis` | JSON de config **+ la query embebida** | Story Flow (DataVisualizer) |
| Presentación | `.amoxdeck` | Markdown con front-matter + slides separados por `---` + bloques ` ```amoxchart ` que apuntan a un `.amoxvis` | Report Flow Studio |
| Pipeline | `.sqlchain` | Grafo de nodos (Data Flow) | ChainEditor |
| Documento | `.md` | Markdown con mermaid, KaTeX, imágenes | MarkdownEditor |

### Salidas (salen del proyecto)

| Salida | Desde dónde | Nativo/editable |
|---|---|---|
| PNG | Story Flow | imagen |
| Imagen al portapapeles | Story Flow | imagen |
| CSV de datos procesados | Story Flow | datos |
| HTML self-contained | Notebook | — |
| Word `.docx` | Notebook | texto nativo, gráficos como imagen |
| PowerPoint `.pptx` | Report Flow deck | **gráficos nativos editables** (11 tipos) |
| CSV / Parquet / Excel | Editor (Export) y Data Flow | datos |

---

## 2. La matriz de transiciones

Filas = de dónde vengo. Columnas = a dónde quiero ir. Verificado leyendo el código, no supuesto.

| ↓ desde \ hacia → | `.sql` | `.sqlnb` | `.amoxvis` | `.amoxdeck` | PNG | Word | PPT | PDF |
|---|---|---|---|---|---|---|---|---|
| **`.sql`** | — | ⚠️ solo multi-statement | ✅ vía resultados | ❌ | ❌ | ❌ | ❌ | ❌ |
| **`.sqlnb`** | ❌ | — | ✅ por celda (oculto) | ❌ | ❌ | ✅ | ❌ | ⚠️ vía Print |
| **`.amoxvis`** | ⚠️ "Edit SQL" edita la copia | ❌ | — | ⚠️ solo desde el deck | ✅ | ❌ | ❌ | ❌ |
| **`.amoxdeck`** | ❌ | ❌ | ❌ | — | ❌ | ❌ | ✅ | ❌ |
| **`.sqlchain`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Leyenda**: ✅ existe y es directo · ⚠️ existe pero con una salvedad importante · ❌ no existe

Lo que salta a la vista: **la diagonal de consolidación está vacía**. No hay forma de subir de nivel (query → notebook → deck) sin rehacer el trabajo a mano. Y las salidas son mutuamente excluyentes: el único camino a PowerPoint pasa por un deck, el único camino a Word pasa por un notebook.

---

## 3. Los 25 escenarios

Cada uno con el veredicto de lo que hoy pasa realmente.

### Arranque y descubrimiento

**1. Abro un Excel suelto y quiero mirarlo.**
✅ **Fluido.** Clic derecho en el explorador → *Direct Query* genera un `SELECT * FROM read_xlsx(...)`. También *Quick Preview* y *Import to Database*. Este arranque está bien resuelto.

**2. Tengo 8 CSV en una carpeta y quiero entenderlos juntos.**
⚠️ **A medias.** *Import Folder* existe como nodo de Data Flow, pero desde el explorador hay que importar uno por uno. No hay "explorar esta carpeta como dataset".

**3. Ya iteré la query 6 veces y llegué al resultado.**
✅ **Fluido dentro del editor.** El historial (`amox_query_history`) guarda todo, hay panel de historial y bookmarks.
❌ **Pero**: una query del historial no se puede convertir en archivo con un clic. Se copia y se pega.

### De la query al gráfico — el escenario que originó esta auditoría

**4. Tengo el resultado y quiero graficarlo.**
✅ **Fluido.** El toggle tabla/gráfico está en la misma barra de resultados. No hay que salir ni guardar nada. Story Flow abre con los datos ya cargados.

**5. Hago el gráfico. ¿Qué pasa con mi `.sql`?**
❌ **Aquí está el problema de fondo.** Al guardar como `.amoxvis`, la query se **copia dentro** del archivo de gráfico (`saveChartConfig` mete `query` en el JSON). El `.amoxvis` **no guarda ninguna referencia al `.sql` del que salió**.

Consecuencias concretas:
- Quedas con **dos archivos que contienen la misma query** y nada te dice cuál es el bueno.
- Si editas el `.sql`, el gráfico **no se entera nunca**. El botón *Reload* del gráfico recarga el `.amoxvis` desde disco — no la query original.
- Si editas la query desde el gráfico (*Edit SQL*), estás editando **la copia**, y el `.sql` original queda desactualizado en silencio.
- A los tres meses no sabes si `ventas.sql` y `ventas_chart.amoxvis` siguen diciendo lo mismo.

**Respuesta directa a tu pregunta**: sí, mantienes los dos archivos, y sí, los vas a necesitar los dos — pero el producto no te ayuda a saberlo ni a mantenerlos sincronizados.

**6. ¿Y si solo quiero el gráfico y tiro el `.sql`?**
✅ Funciona: el `.amoxvis` es autosuficiente, re-ejecuta su query al abrirlo. Pero pierdes el archivo con el que iterabas, y editar SQL dentro del panel de gráfico es mucho peor que en el editor.

**7. Le añado el storytelling (takeaway, anotaciones, énfasis).**
✅ **Fluido y bien resuelto.** La etapa ⑤ Story del flujo de 6 etapas es de lo mejor construido del producto.

**8. Lo descargo como PNG para compartirlo.**
⚠️ **Funciona pero se siente ajeno.** El PNG sale por la descarga del navegador, con nombre autogenerado tipo `chart_bar_1080p_1756891234567.png`, a la carpeta de Descargas del sistema.

Lo que esto rompe:
- No hay diálogo para elegir dónde guardarlo, aunque Electron ya expone diálogos nativos.
- El nombre no dice nada del análisis.
- El proyecto tiene una carpeta canónica **`charts/`** (la crea el Workspace Wizard) que **ningún export usa**.
- Terminas con el análisis en el proyecto y los entregables en Descargas.

**9. Quiero el gráfico en vectorial (SVG) para imprimir o retocar.**
❌ **No existe.** El comentario en `ExportPanel.jsx` lo dice literal: *"SVG / Clipboard / PPTX llegan en la fase 6"*. El portapapeles sí llegó; SVG y PPTX no.

**10. Quiero pegar ese gráfico en un PowerPoint que ya tengo, editable.**
❌ **No se puede desde el gráfico.** Y esto duele especialmente porque **el motor ya existe y es bueno**: `officeChartMapper.js` mapea 11 tipos de gráfico (barras en 6 variantes, línea, área, dona, pastel, combo) a gráficos **nativos de PowerPoint** — doble clic en PowerPoint y se abre la tabla de datos.

Pero ese motor **solo se alcanza desde un deck**. Para llevar un gráfico a PowerPoint editable hoy tienes que: crear un `.amoxdeck` → insertar el gráfico en un slide → entrar a vista Present → exportar el deck completo → abrir el `.pptx` → copiar el gráfico → pegarlo en tu presentación real. Seis pasos para lo que debería ser uno.

*(Salvedad honesta y documentada: en modo nativo se pierden las capas de storytelling — anotaciones, líneas de referencia, KPI destacado — porque la API de gráficos de PowerPoint no tiene equivalente. Los tipos sin mapeo nativo — dispersión, burbuja, heatmap, treemap, embudo, cascada — caen a imagen.)*

### Consolidar el análisis

**11. Tengo 5 `.sql` en una carpeta que son un análisis. Quiero volverlos un notebook.**
❌ **No existe.** El explorador **sí tiene multi-selección** (`selectedFiles`, `multiSelectMode`, con Ctrl+C/Ctrl+X/Supr/F2), pero las únicas acciones masivas son copiar, cortar y borrar. No hay "crear notebook con estos".

La única conversión a notebook que existe en todo el producto es la de un `.sql` **multi-statement**, y solo aparece dentro del diálogo que salta al ejecutarlo.

**12. Lo mismo pero mezclando queries y gráficos.**
❌ **No existe**, y sería más valioso todavía: un `.amoxvis` ya trae query + config, es exactamente una celda de notebook con su gráfico.

**13. Hice un gráfico dentro de una celda de notebook. ¿Lo puedo reusar?**
⚠️ **Sí, pero está escondido.** El gráfico de celda vive en el sidecar `.sqlnb.state.json`, no como `.amoxvis`. La celda pasa `query` al visualizador, así que *Save as .amoxvis* del panel Export **sí funciona** — pero está enterrado en la etapa ⑥ del panel lateral del gráfico. Nadie lo encuentra sin que se lo digan.

**14. Tengo el notebook listo y lo quiero como slides.**
❌ **No existe.** Y la conversión es casi mecánica: cada celda markdown es el texto de un slide, cada celda SQL con gráfico es un `content-chart`. Hoy hay que crear el deck vacío y rehacerlo a mano.

**15. Notebook → Word.**
✅ **Existe y es bueno.** Texto nativo, tablas GFM nativas, gráficos como imagen. Botón visible en la barra.

**16. Notebook → PowerPoint.**
❌ **No existe**, aunque el notebook tiene modo *Present* y el motor de PPTX está a un import de distancia.

**17. Notebook → PDF.**
⚠️ Solo vía *Print* del navegador.

### La presentación

**18. Quiero añadir elementos a un slide para que se vea mejor.**
⚠️ **Muy limitado.** El Report Flow Studio (vista Design) edita **un slide a la vez**, con dos piezas: prosa markdown editable al clic, y **un** slot de gráfico. Los layouts son 5 (`title`, `content`, `content-chart`, `chart-full`, `two-col`).

No hay: insertar imagen, dos gráficos en un slide, tabla de KPIs, formas, cajas de texto libres, ni notas del orador. Si tu presentación necesita algo que no sea "texto + un gráfico", el deck se te queda corto.

**19. El deck completo a PowerPoint editable.**
✅ **Existe y es la joya del producto.** Gráficos nativos donde hay mapeo, texto como runs nativos, tablas GFM como tablas nativas, y un menú para elegir nativo vs. imagen. *(Salvedad real: el modo imagen exige estar en vista Present, porque captura el DOM montado.)*

**20. El deck a Word o PDF.**
❌ **No existe.** Asimetría pura: el notebook exporta a Word pero no a PPT; el deck a PPT pero no a Word.

**21. Es el reporte del mes. Quiero re-ejecutarlo con datos nuevos.**
✅ **Bien resuelto en deck.** *Refresh all* re-ejecuta cada `.amoxvis` contra la base actual, y el export a PPT re-consulta siempre en fresco. Las `variables` del front-matter se inyectan.
⚠️ **Pero** las variables del deck y el `environment` del notebook son **dos sistemas distintos** que no se hablan.

### El pipeline

**22. Tengo un Data Flow que limpia datos. Quiero graficar el resultado.**
❌ **Callejón sin salida.** Data Flow tiene 30+ nodos, y sus salidas son: `export_file`, `create_table`, `checkpoint`, `notification`. **No hay nodo de gráfico ni de reporte.** Un pipeline no puede terminar en una historia — tienes que salir, abrir un editor y volver a consultar la tabla que dejó.

**23. Data Flow → notebook.**
❌ No existe.

### La IA

**24. Le pido a la IA que me grafique algo.**
✅ **Bien resuelto.** `display_chart` produce un gráfico y el bloque de chat ofrece *"Save as .amoxvis and open it in the Story Flow editor"* — la IA es hoy el **único** camino de creación que aterriza directo en un artefacto del proyecto.

**25. Comparto el análisis con un colega. ¿Qué le mando?**
⚠️ **No está claro y el producto no ayuda.** Si le mandas el `.amoxdeck`, necesita los `.amoxvis` referenciados por ruta relativa, la base de datos, y AmoxSQL. Si le mandas el `.pptx`, se lleva los gráficos editables pero pierde la trazabilidad. No hay "empaquetar el análisis" ni un export que se explique solo.

---

## 4. Las seis causas estructurales

Los 25 escenarios anteriores no son 25 problemas. Son seis:

### Causa 1 — El vínculo entre artefactos es una copia, no una referencia

`.amoxvis` guarda la query embebida y **ninguna referencia** a su origen. No hay procedencia en ningún formato: el deck referencia gráficos por ruta, pero el gráfico no referencia su query, y el notebook no referencia nada.

**Consecuencia**: el usuario acumula archivos que se solapan sin saber cuál manda, y las ediciones se pierden en silencio en la dirección equivocada.

### Causa 2 — La matriz de export es asimétrica y está incompleta

Cada formato construyó su propio export en su propio momento:

- Notebook → HTML, Word
- Deck → PowerPoint
- Gráfico → PNG, portapapeles, CSV
- Editor `.sql` → nada

**Ninguna de las tres casillas comparte código de destino.** El resultado es que *dónde puedes exportar* depende de *dónde estabas parado*, no de lo que quieres lograr.

### Causa 3 — Todos los entregables salen por la carpeta de Descargas

Ningún export usa el diálogo nativo de Electron ni escribe dentro del proyecto. Todos hacen `link.download = <nombre-autogenerado>`. Y existe una carpeta `charts/` canónica que nada usa.

**Consecuencia**: el trabajo vive en el proyecto, los entregables viven en Descargas, y no hay forma de reconstruir cuál salió de cuál.

### Causa 4 — No hay conversiones, solo creación desde cero

Una sola conversión existe en todo el producto (`.sql` multi-statement → notebook) y está escondida en un diálogo. Consolidar trabajo disperso es copiar y pegar a mano.

### Causa 5 — Data Flow no cierra el círculo

Es el único modo que no puede producir nada visual ni narrativo. Termina en datos y obliga a salir.

### Causa 6 — El vocabulario de creación es incompleto

La paleta de comandos ofrece *New SQL Query*, *New Notebook*, *New Chain* — pero **no** *New Deck* ni *New Chart*, aunque ambos existen como formatos de primera clase.

---

## 5. Cómo se ve esto para cada perfil

**Analista de datos** (el perfil mayoritario). Vive en el tramo query → gráfico → presentación. Le pegan de lleno las causas 1, 2 y 3: hace el gráfico, no sabe qué hacer con su `.sql`, el PNG se le pierde en Descargas y para meter el gráfico en su PowerPoint del lunes tiene que dar seis pasos. **Es quien más gana con las fases 1 y 2 del plan.**

**Científico de datos**. Vive en el notebook. Le pega la causa 4 (no puede consolidar sus queries sueltas) y la 2 (su notebook no llega a slides). Quiere el notebook como fuente de verdad y todo lo demás derivado de él.

**Ingeniero de datos**. Vive en Data Flow y en scripts `.sql`. Le pega la causa 5 de lleno: su pipeline no puede reportar nada. Y le pega la 1, porque es quien más sufre cuando dos archivos dicen cosas distintas.

---

## 6. Plan de implementación

Seis fases, ordenadas por relación valor/esfuerzo. Cada una es entregable por sí sola.

### Fase 1 — El entregable aterriza donde trabajas

*Ataca la causa 3. Es la de mejor ratio: mucho alivio, poco código.*

- **Diálogo nativo de guardado** para PNG, HTML, Word y PowerPoint, vía `electronAPI` (ya existe el puente, ya se usa para abrir proyectos).
- **Carpeta por defecto dentro del proyecto**: `charts/` para PNG, `reports/` para documentos. Crearlas si no están.
- **Nombres derivados del artefacto**, no del reloj: `ventas_por_region.png`, no `chart_bar_1080p_1756891234567.png`.
- **Toast con "Revelar en el explorador"** al terminar — ya existe el IPC `shell:showItemInFolder` (se añadió en la Fase 2 de pestañas).
- Recordar la última carpeta usada por tipo de export.

### Fase 2 — Un solo menú Exportar, igual en todos los formatos

*Ataca la causa 2. El grueso es reutilizar motores que ya existen.*

- Componente único `ExportMenu` con el mismo vocabulario en editor, notebook, gráfico y deck.
- **Gráfico → PowerPoint** (un slide, gráfico nativo). Es importar `officeChartMapper` desde Story Flow: el motor ya está escrito y probado.
- **Gráfico → SVG**, cerrando la deuda que el propio código declara.
- **Notebook → PowerPoint**, reutilizando el generador del deck (una celda markdown + su gráfico ≈ un slide `content-chart`).
- **Deck → Word y HTML**, reutilizando los generadores del notebook.
- **PDF de verdad** en notebook y deck, no vía Print.

Al terminar esta fase la matriz de export queda completa y simétrica: los cuatro artefactos llegan a los cinco destinos.

### Fase 3 — Procedencia: el vínculo deja de ser una copia

*Ataca la causa 1. La más profunda; toca formato de archivo, así que va después de las dos anteriores.*

- `.amoxvis` gana un campo `source` (`queries/ventas.sql`) además de la query embebida — **compatible hacia atrás**: sin `source` se comporta exactamente como hoy.
- **Detección de desincronía**: si el `.sql` fuente cambió, el gráfico muestra un aviso discreto con dos acciones: *Traer los cambios* o *Desvincular*.
- **Camino de vuelta**: desde un `.sql`, un indicador de "3 gráficos usan esta query" que los lista y los abre.
- *Edit SQL* dentro del gráfico pasa a abrir **el archivo fuente** cuando hay vínculo, en vez de la copia.
- El deck ya referencia bien sus gráficos: esto extiende ese modelo un nivel hacia abajo.

### Fase 4 — Consolidar: las conversiones que faltan

*Ataca la causa 4. Es lo que más preguntaste.*

- **Multi-selección → notebook**: seleccionas `.sql`, `.amoxvis` y `.md` en el explorador, clic derecho, *"Crear notebook con estos archivos"*. Cada `.sql` es una celda SQL, cada `.amoxvis` una celda SQL con su gráfico ya configurado, cada `.md` una celda de texto. Orden = orden de selección, reordenable después.
- **Notebook → deck**: *"Convertir a presentación"*. Celda markdown = texto del slide; celda SQL con gráfico = layout `content-chart`; el gráfico se materializa como `.amoxvis` en `charts/`. Con vista previa antes de escribir.
- **Gráfico → "Añadir a presentación…"**: elige un `.amoxdeck` existente o crea uno. Hoy la relación solo funciona tirando desde el deck; falta empujar desde el gráfico.
- **Historial → archivo**: convertir una query del historial en `.sql` con un clic.
- **Unificar variables**: el `environment` del notebook y las `variables` del deck pasan a ser el mismo mecanismo, para que la conversión no las pierda.

### Fase 5 — El slide como lienzo

*Ataca la causa 6 en su versión más visible.*

- Elementos nuevos en el Design view: **imagen**, **dos gráficos**, **fila de KPIs**, **tabla**, **cita destacada**.
- **Notas del orador** por slide, exportadas como notas nativas del `.pptx`.
- Más layouts: `two-charts`, `kpi-row`, `section-divider`, `quote`.
- *New Deck* y *New Chart* en la paleta de comandos, para cerrar la asimetría del vocabulario.

### Fase 6 — Data Flow cierra el círculo

*Ataca la causa 5.*

- **Nodo Chart**: toma la tabla de salida y produce un `.amoxvis`.
- **Nodo Report**: produce un notebook o un deck a partir del pipeline.
- Con esto, un pipeline programado puede terminar en un reporte actualizado en vez de en una tabla que alguien tiene que ir a mirar.

---

## 7. Qué NO propone este plan

Para que el alcance quede honesto:

- **No propone unificar los formatos en uno solo.** Que `.sql`, `.sqlnb`, `.amoxvis` y `.amoxdeck` sean archivos distintos está bien: cada uno tiene un editor propio y un ciclo de vida propio. El problema no es que sean varios, es que no se conocen entre sí.
- **No propone un editor de slides libre estilo lienzo con posicionamiento absoluto.** El modelo markdown-first del deck es una fortaleza (diffea en git, la IA lo puede escribir, se re-serializa sin pérdida). La Fase 5 añade elementos dentro de ese modelo, no lo reemplaza.
- **No toca el motor de gráficos nativos de PowerPoint** más allá de exponerlo desde más sitios. Sus límites (11 tipos, sin overlays de storytelling) están documentados y son razonables.

---

## 8. Registro de implementación — Fase 1

**Implementada 2026-09-03**, rama `claude/continuidad-formatos`.

### Qué se construyó

Un único punto de intercepción en Electron (`session.on('will-download', ...)` en `electron/main.js`) resuelve las cuatro piezas de la Fase 1 a la vez para los tres exports que ya existían (PNG del gráfico, HTML/Word del notebook) y para el PPTX del deck (que también sale por descarga de navegador — `pptxgenjs` genera un Blob y lo descarga vía `<a download>`, igual que los otros tres):

- **Diálogo nativo de guardado**: `item.setSaveDialogOptions(...)` dispara el diálogo "Guardar como" del sistema operativo. Solo actúa sobre extensiones `png`/`docx`/`pptx`/`html`; cualquier otra (csv, json, xlsx, parquet — ya servidas por sus propios endpoints de servidor, no por descarga de navegador) sigue el comportamiento por defecto de Electron, sin tocar.
- **Carpeta por defecto dentro del proyecto**: PNG entra a `charts/`, los documentos a `exports/` — **los mismos ids canónicos que ya scaffoldea el Workspace Wizard** (`server/projectScaffolder.js: SCAFFOLD_FOLDERS`), no una convención nueva. La carpeta se crea si falta.
- **Recordar la última carpeta usada por tipo**, persistido en `<userData>/export-folders.json` — sobrevive a reinicios de la app.
- **Aviso con «Revelar en el explorador»**: `electron/main.js` avisa al renderer cuando termina de guardar (`export:download-completed`); `App.jsx` muestra un toast con esa acción, reutilizando `electronAPI.showItemInFolder` (el mismo mecanismo del menú contextual de pestañas).
- **Nombres derivados del artefacto**: el PNG de Story Flow ahora usa el título del gráfico si existe (`ventas_por_region.png`), con fallback a `chart_<tipo>_<timestamp>` solo cuando no hay título (para no colisionar en silencio). El HTML/Word del notebook usa el nombre del propio archivo `.sqlnb` cuando está guardado.

### Corrección encontrada durante la implementación

El plan original (sección 6) asumía una carpeta `reports/` para los documentos. Al abrir el Workspace Wizard real para probar, la carpeta canónica que el producto ya scaffoldea se llama **`exports/`** (`SCAFFOLD_FOLDERS` en `server/projectScaffolder.js`, id `'exports'`, label "Exports — Generated reports and exports"). Se corrigió antes de escribir el código — de haber seguido el plan tal cual, la Fase 1 habría introducido una segunda convención de carpetas en paralelo a la que el producto ya tiene.

### Archivos tocados

`electron/main.js`, `electron/preload.js`, `client/src/App.jsx`, `client/src/components/DataVisualizer/DataVisualizer.jsx`, `client/src/components/DataVisualizer/utils/exportChart.js`, `client/src/components/SqlNotebook.jsx`, `client/src/utils/generateHtmlReport.js`, `client/src/utils/generateWordReport.js`.

### Validación

- `pnpm run client:build` limpio, sin errores.
- App levantada en dev (Vite + Express) contra un proyecto de prueba: carga sin errores de consola propios del cambio; se confirmó en vivo que el Workspace Wizard scaffoldea `charts/` y `exports/` con esos nombres exactos.
- Lógica de slug del nombre de archivo verificada por separado (títulos con acentos/símbolos, título vacío) — produce nombres válidos en todos los casos.
- **Sin verificar end-to-end**: el diálogo nativo `will-download` solo existe dentro de una ventana real de Electron — este entorno de pruebas es un navegador Chromium plano (`window.electronAPI` no existe ahí), así que el disparo real del diálogo, el guardado en `charts/`/`exports/`, y el toast de "Revelar en el explorador" no se pudieron ejercitar de punta a punta aquí. El código sigue exactamente el patrón ya probado de los handlers `dialog:selectFolder`/`dialog:saveFile` existentes en el mismo archivo. Queda pendiente una prueba manual en la app real antes de dar la fase por completamente cerrada.

---

## 9. Registro de implementación — Fase 2 (parcial)

**Implementada 2026-09-03**, rama `claude/continuidad-formatos`. De los cinco puntos del plan original, se hicieron tres; dos quedan explícitamente diferidos (ver abajo) — se prefirió entregar tres piezas completas y probadas a cinco a medias.

### Qué se construyó

**Gráfico → PowerPoint** (`DataVisualizer/utils/exportChart.js`: `exportChartAsPptx`; botón nuevo en `ExportPanel.jsx`, sección "Other formats"). Un slide, gráfico nativo editable cuando el tipo tiene mapeo (reutiliza `isNativeChartType`/`buildNativeChartSpec`/`buildComboChartSpec` de `officeChartMapper.js` — el MISMO motor que ya usa el export del deck, sin duplicar lógica), imagen PNG como fallback para los tipos sin mapeo (dispersión, burbuja, heatmap, etc.). Cierra el escenario 10 de la auditoría: antes tomaba 6 pasos (crear deck → insertar → Present → exportar deck → abrir pptx → copiar/pegar); ahora es un clic desde el propio gráfico.

**Gráfico → SVG** (`exportChartAsSvg` en el mismo archivo). Extrae el `<svg>` que Recharts ya renderiza (`.recharts-surface`), no una captura rasterizada. El problema real a resolver: los ejes/grid/texto usan `fill="var(--text-primary)"` — colores por variable CSS que solo significan algo dentro de la hoja de estilos de la app. Un archivo `.svg` extraído con `var()` sin resolver se abre en negro/transparente en Illustrator o un navegador cualquiera. Se camina el árbol clonado elemento por elemento y se reemplaza cada `var()` por su valor computado (`getComputedStyle`) antes de serializar — el archivo resultante es 100% portable. Cierra el escenario 9 (la deuda que el propio código declaraba: *"SVG / Clipboard / PPTX llegan en la fase 6"*).

**Notebook → PowerPoint** (`client/src/utils/generateNotebookPptxReport.js`, nuevo módulo; botón junto a Export HTML/Word en `SqlNotebook.jsx`). Un slide por celda: markdown → texto, SQL con gráfico → gráfico nativo (mismo mecanismo que el del gráfico suelto, usando el `chartConfig` que ya vive en el sidecar de la celda — sin DOM, sin re-fetch) con imagen como fallback (reutilizando la técnica de captura DOM ya probada en `generateWordReport.js`), SQL sin gráfico → **tabla nativa de PowerPoint** en vez de perderse — el propio modelo de slides del deck no tiene layout de tabla, así que esto es una capacidad nueva, no solo una migración. Reutiliza `markdownToTextRuns` y `layoutBoxes` de `generatePptxReport.js` (se exportaron esas dos funciones, antes privadas) para que un notebook y un deck exportados salgan con la misma geometría de slide. Cierra el escenario 16.

### Qué se difirió — y por qué

- **Deck → Word/HTML**: reutilizar los generadores del notebook requiere que el DOM del deck exponga los mismos `data-cell-id` de los que depende `captureCellChart`/`detectCellViewMode` en `generateWordReport.js` — el deck no tiene ese enganche hoy. Es factible (añadir el atributo en la vista Present del `SlideDesigner`/`AmoxChartEmbed` y adaptar la forma de los datos), pero es una pieza separada con su propio riesgo, no una extensión trivial de lo ya hecho aquí.
- **PDF de verdad** (no vía `Print` del navegador): la vía limpia es `webContents.printToPDF()` de Electron sobre una `BrowserWindow` oculta cargada con el mismo HTML que ya genera `generateHtmlReport.js`, seguido de un diálogo de guardado nativo (esa parte SÍ se beneficiaría de la intercepción de Fase 1, pero `printToPDF` devuelve un buffer directo, no dispara `will-download`, así que necesita su propio cableado IPC). Se dejó fuera de este pase por ser la pieza de mayor plomería nueva (ciclo de vida de ventana oculta, IPC de ida y vuelta) de las cinco.

### Validación

- `pnpm run client:build` limpio.
- Probado en vivo (dev, proyecto de prueba con `.sql` y `.sqlnb` pre-escritos en disco para no depender de escribir en Monaco, que en este entorno de automatización tiene fricción con el nuevo backend de entrada de Monaco — `native-edit-context`, no relacionado con este cambio):
  - Gráfico de barras → SVG: sin error de consola.
  - Gráfico de barras → PowerPoint: completa; único warning es de pptxgenjs por color de serie no fijado (`chartColors: []`) — el mismo warning que ya produce el export del deck con la misma configuración, no es una regresión.
  - Notebook (celda de texto + celda SQL sin gráfico, modo tabla) → PowerPoint: completa correctamente (confirmado por estado del DOM, no solo por lectura visual — una primera lectura de pantalla capturada a mitad del export, que toma unos segundos en dev por cargar los chunks de pptxgenjs sin bundlear, se leyó erróneamente como "colgado").
- **Sin probar**: notebook con una celda mostrando gráfico (rama nativa vs. imagen dentro del propio notebook) — se validó la lógica de esa rama por separado en el gráfico suelto de Story Flow (mismo `officeChartMapper`), pero no la combinación completa dentro de una celda de notebook.

---

## 10. Registro de implementación — Fase 3

**Implementada 2026-09-03**, rama `claude/continuidad-formatos`. Los cuatro puntos del plan original, completos.

### Qué se construyó

**El campo `source`.** Al guardar un gráfico como `.amoxvis` desde una pestaña `.sql` guardada, el `.amoxvis` gana un campo `source` con la ruta de ese archivo — además de la query embebida, que se mantiene exactamente igual que antes (compatibilidad total hacia atrás: un `.amoxvis` sin `source` se comporta como siempre). El hilo va `EditorPane` (conoce la ruta de la pestaña activa) → `ResultsTable` → `DataVisualizer` → `saveChartConfig`. Un gráfico creado desde un notebook o una query ad-hoc sin guardar simplemente no lleva `source` — no hay archivo real al que apuntar.

**Detección de desincronía.** Al abrir un `.amoxvis` con `source`, se compara una vez (al montar, no en vivo/con sondeo) el contenido actual del archivo fuente contra la query con la que se guardó el gráfico. Si difieren, aparece un aviso discreto — no modal — con dos acciones:
- **"Traer los cambios"**: adopta la query del archivo fuente, re-ejecuta, dirty el tab — el usuario guarda cuando quiera, como cualquier otra edición.
- **"Desvincular"**: la query embebida se queda tal cual está; solo se cae el vínculo (y con él, futuras comprobaciones de desincronía).

**"Edit SQL" abre el archivo real.** Antes, tanto el botón dentro del `.amoxvis` como "Edit with SQL" del menú contextual del explorador creaban una pestaña sintética `Edit: x.amoxvis` que, al guardar, reescribía la query DENTRO del `.amoxvis` — nunca tocaba un `.sql` de verdad. Ahora, si hay `source`, se abre (o enfoca, si ya está abierto) el archivo fuente real. Sin `source`, sigue exactamente el comportamiento anterior. Se corrigieron ambos puntos de entrada (el botón del propio tab y el ítem del menú contextual del explorador).

**Camino de vuelta.** Nuevo endpoint `GET /api/charts/using-source?path=...` (recorre los `.amoxvis` del proyecto server-side, sin que el cliente tenga que descargar cada uno). Desde el menú contextual de un `.sql`, "Charts using this query...": sin coincidencias avisa que no hay ninguna, con una coincidencia abre el gráfico directo, con varias muestra un popover para elegir.

### Una deuda técnica pagada de paso

`openFile` — la función que abre/enfoca cualquier pestaña — vivía como una propiedad inline dentro del objeto de `useImperativeHandle`, exactamente el mismo patrón que ya había causado un `ReferenceError` real en la Fase 5 anterior (una función hermana no puede llamarla por su nombre corto). La rutina de "Edit SQL abre el archivo fuente" necesitaba llamarla desde dentro del propio componente, así que se extrajo a una función standalone — mismo arreglo que `duplicateTabToOtherPane` en su momento, misma causa raíz.

### Validación

- `pnpm run client:build` limpio; `node -c server/index.js` limpio.
- Probado en vivo, de punta a punta, con un proyecto de prueba (`.sql` pre-escrito, sin depender de escribir en Monaco):
  1. Query → gráfico → Save as .amoxvis: `source: "ventas.sql"` confirmado en el archivo en disco.
  2. Abrir el gráfico: aparece la píldora "🔀 ventas.sql"; sin aviso de desincronía (nada cambió aún).
  3. "Edit SQL": enfoca la pestaña **ventas.sql ya existente** — no crea una copia. Confirmado que NO aparece ningún tab "Edit: ...".
  4. Se edita `ventas.sql` **fuera de la app** (simulando otra sesión/editor externo), se cierra y reabre la pestaña del gráfico: aparece el aviso de desincronía.
  5. "Traer los cambios": el gráfico se re-renderiza con los datos nuevos (verificado que los valores realmente cambiaron, no solo el texto de la query), el aviso desaparece, la pestaña queda dirty. Ctrl+S → confirmado en disco que la query se actualizó **y** `source` se preservó.
  6. Repetido el ciclo con otro cambio externo, esta vez "Desvincular": confirmado en disco que el campo `source` desapareció tras guardar, sin tocar la query.
  7. Menú contextual de `ventas.sql` → "Charts using this query...": con una sola coincidencia, abre (enfoca) el gráfico directamente. Confirmado también contra el endpoint por separado.
- **Sin probar en vivo**: el popover de "varios gráficos" (2+ coincidencias) — sí se probó el caso de una coincidencia y la lógica del servidor por separado (devuelve un array; el popover es un `.map()` directo sobre ese array, riesgo bajo).
- **Nota de metodología, no de producto**: durante la prueba, un primer intento de "cerrar y reabrir" la pestaña del gráfico no cerró realmente el tab (un clic de coordenadas falló su objetivo) — el chequeo de desincronía, que corre una vez al montar, correctamente NO se re-disparó sobre la pestaña ya montada. Confirmado con inspección directa del DOM y corregido cerrando el tab de verdad antes de continuar. Documentado aquí porque es exactamente el comportamiento esperado de un chequeo "al montar, no en vivo" — no un bug.

---

## 11. Registro de implementación — Fase 4 (4 de 5)

**Implementada 2026-09-03**, rama `claude/continuidad-formatos`. Cuatro de los cinco puntos del plan; "unificar variables" queda fuera, explícitamente.

### Qué se construyó

**Multi-selección → notebook.** El explorador ya tenía multi-selección (Ctrl+clic) para cortar/copiar/borrar; le faltaba una acción de consolidación. Nuevo ítem en el menú contextual, "Create Notebook from Selection (N)", visible solo cuando el archivo clicado es parte de una selección de 2+. Cada `.sql` se vuelve una celda de código, cada `.md` una celda de texto, cada `.amoxvis` una celda de código **con su gráfico ya configurado** — la query embebida como contenido de la celda y el resto del config en `state.chartConfig` / `state.viewMode: 'chart'`, aprovechando que el formato v3.0 del notebook ya sabe guardar y restaurar exactamente esa forma por celda. El notebook resultante abre **sin guardar** — el propio editor de notebook (reordenable, editable) es la vista previa; no se construyó un diálogo aparte.

**Notebook → deck.** Botón "Convert to Deck" junto a los exports existentes. Cada celda de texto se vuelve un slide `content`; cada celda SQL **mostrando un gráfico en este momento** se vuelve un slide `chart-full`, materializando ese gráfico como un `.amoxvis` nuevo bajo `charts/` (con la query de la celda embebida — no es el mismo vínculo `source` de la Fase 3, porque no hay un `.sql` real al que apuntar). Las celdas SQL en vista tabla no tienen equivalente en el modelo de slides del deck — se omiten, sin perderse: siguen intactas en el notebook. Reutiliza `buildSlideRaw`/`serializeDeck` de los propios helpers del deck, no lógica nueva de serialización.

**Gráfico → "Add to new presentation".** Nuevo botón en el panel Export de Story Flow. Como un slide de deck necesita referenciar un `.amoxvis` real en disco, la acción reutiliza el flujo de guardado existente (mismo modal, título dinámico "Save Chart — then add to a new presentation") y, una vez guardado, arma un deck de un slide alrededor de ese archivo y lo abre sin guardar. Deliberadamente solo "crear un deck nuevo" — "añadir a un deck existente" queda fuera de este pase (ver más abajo).

**Historial → archivo.** Tercer ícono en cada fila del panel de historial (junto a bookmark y copiar): "Save as .sql file". Crea un tab `.sql` real con esa query y dispara Save As directo sobre ESE tab — no sobre "el tab activo", evitando a propósito una carrera real que existía en el código ya escrito (`finishSaveAs` cae a `getActiveTab()` cuando no se le pasa un id, así que encadenar `createNew()` + una función que lee el tab activo habría podido renombrar sobre disco un tab completamente distinto si el usuario no estaba parado en uno relevante).

### Diferido a propósito

**Unificar variables** (environment del notebook ↔ variables del deck) no se tocó. Es un refactor transversal de dos sistemas que hoy funcionan de forma independiente y estable; tocarlo sin una razón inmediata (ninguna de las conversiones de este pase lo necesitaba) arriesgaba romper cualquiera de los dos por una ganancia que hoy nadie pidió.

**"Añadir a un deck existente"** (en vez de crear uno nuevo) tampoco se hizo — habría necesitado un selector de decks nuevo (sin componente existente que reutilizar) más lógica de parseo/inserción/re-serializado sobre un archivo ajeno. "Crear uno nuevo" cubre el gesto central que la auditoría señalaba (hoy no hay ningún camino desde el gráfico hacia una presentación) con una fracción del riesgo.

### Un bug real, encontrado en la propia prueba en vivo

La primera versión de "Convert to Deck" decidía si una celda "tiene gráfico" mirando si `cellStates[cell.id].chartConfig` existía. Probado en vivo, produjo slides de gráfico para **celdas que nunca se pusieron en vista de gráfico** — 2 de 2 celdas SQL de la prueba, ambas en tabla, generaron un `.amoxvis` cada una.

Causa raíz: `DataVisualizer` queda montado (solo oculto por CSS) detrás de la vista de tabla para que cambiar de pestaña sea instantáneo — y un efecto ya existente ahí (el mismo de `keepalive-stale-derived-state`, ver memoria del proyecto) auto-detecta ejes en cuanto llegan resultados con columnas, lo cual dispara `onConfigChange` sin que el usuario haya mirado el gráfico nunca. La sola presencia de `chartConfig` no significa "esta celda tiene un gráfico".

Arreglado con la misma comprobación que ya usa el exportador de Word/PowerPoint del notebook: si hay un `.recharts-wrapper` de verdad en el DOM bajo `[data-cell-id]` en ESTE momento. Re-probado con una celda en vista tabla y otra en vista gráfico: el deck resultante trajo exactamente 2 slides — el de texto y el del gráfico real, sin el falso positivo.

### Validación

- `pnpm run client:build` limpio.
- Probado en vivo, de punta a punta, con un proyecto de prueba (`.sql`/`.md` pre-escritos):
  1. 3 archivos seleccionados (`.md` + 2 `.sql`) → "Create Notebook from Selection (3)" → notebook con 3 celdas en el orden correcto, contenido exacto por celda.
  2. Notebook con 1 celda de texto + 1 celda SQL puesta en vista de gráfico → "Convert to Deck" → deck de 2 slides; el slide de gráfico renderiza los datos reales (no un placeholder), confirmando que el `.amoxvis` materializado es válido.
  3. Gráfico en Story Flow → "Add to new presentation" → modal con título dinámico correcto → deck nuevo de 1 slide, chart-full, con el gráfico recién guardado renderizando datos reales.
  4. Historial de queries → ícono "Save as .sql file" → tab nuevo con la query exacta → Save As → "File saved successfully" → confirmado en disco (`cat` del archivo) con el contenido correcto, y el tab correcto (no uno ajeno) quedó apuntando al nuevo path.
- El bug de falso-positivo de "Convert to Deck" (arriba) se encontró y arregló DURANTE esta misma validación, no después.

---

## 12. Registro de implementación — Fase 5

**Implementada 2026-09-04**, rama `claude/continuidad-formatos`.

### Qué se construyó

**Notas del orador.** Nuevo panel colapsable bajo el lienzo de cada slide en Design view ("Speaker notes"). Se guardan como un bloque cercado ` ```notes ... ``` ` — no un comentario HTML — para que texto multilínea con cualquier contenido (incluido un `-->` literal) sobreviva el ida y vuelta sin escapar nada; es la misma técnica que ya usa el bloque `amoxchart`. Al exportar a PowerPoint se escriben como notas nativas reales (`slide.addNotes(...)`), no como texto en la diapositiva.

**Imágenes.** Cuarta pestaña "Images" en el panel lateral del Studio, junto a Slides/Layouts/Charts. Lista cada imagen del proyecto (recorre varias extensiones, ya que el endpoint solo acepta una a la vez) y al hacer clic inserta `![](ruta)` en el texto del slide activo — **ruta relativa a la raíz del proyecto**, la misma convención que ya usan las referencias a `.amoxvis`, no relativa a la carpeta del propio `.amoxdeck`. Esto evitó tener que propagar el `filePath` del deck a través de `SlideDesigner` → `EditableProse` → `MarkdownPreview`: con la base de resolución de rutas vacía, una ruta raíz-relativa ya resuelve correctamente tal cual.

**New Deck / New Chart en la paleta de comandos.** Cierra la asimetría exacta que señalaba la auditoría. "New Chart" reveló que `createNew('amoxvis')` nunca había tenido un caso propio: caía al genérico y creaba un tab llamado `Untitled.sql` con contenido SQL plano en vez de JSON — inofensivo mientras nadie lo guardara, pero corrupto en cuanto se guardara como `.amoxvis`. Se agregó el caso que faltaba (nombre, contenido JSON válido, `initialChartConfig`), con el mismo patrón que ya tenía `amoxdeck`.

### Ya funcionaba — verificado, no reconstruido

El plan original pedía "tabla" y "cita destacada" como elementos nuevos del slide. Antes de construir nada se verificó en vivo: `MarkdownPreview` (lo que ya renderiza el texto de cada slide) ya trae `remark-gfm` y un componente de `blockquote` con estilo propio — una tabla GFM y un `> texto` ya renderizan correctamente hoy, sin ningún cambio. Confirmado con una prueba en vivo insertando ambos en un slide real. No se construyó nada para esto porque ya existía; documentarlo aquí es para que quede claro que no es un olvido.

**Dos gráficos por slide** y **fila de KPIs** quedaron fuera de este pase — el modelo actual (`splitSlideContent`/`buildSlideRaw`) asume un slide con a lo más un chart; soportar varios habría tocado el parser, el exportador de PPTX y el editor visual a la vez, para un caso de uso menos frecuente que los tres anteriores.

### Validación

- `pnpm run client:build` limpio.
- Probado en vivo, de punta a punta:
  1. Paleta de comandos → "New Chart" → tab `.amoxvis` en blanco con el estado vacío correcto ("No query") → "Edit SQL" → placeholder `SELECT * FROM ... LIMIT 100;` en un tab `.sql` nuevo (no corrupto).
  2. Paleta de comandos → "New Report Flow Deck" → deck de 3 slides con el panel "Speaker notes (empty)" visible desde el primer momento.
  3. Notas: escritas en el slide 1, confirmadas en Source view como bloque ` ```notes ``` ` bien formado, después de la prosa; confirmado que **no** aparecen en Present view (el fix de `SlidePreview.jsx` evita que se rendericen como bloque de código visible).
  4. Panel Images: `logo.png` listado, insertado con un clic, `<img>` resuelto de verdad (`naturalWidth: 1024`, `complete: true`) contra `/api/file/raw?path=logo.png` — no un ícono roto.
  5. Export PowerPoint sobre ese mismo deck (con imagen + notas + un chart-placeholder que apunta a un archivo inexistente, heredado de la plantilla de partida): completa sin colgarse; el chart roto cae al mensaje de error por-slide ya existente, sin tumbar el resto del export.
  6. Tabla GFM y blockquote insertados a mano en el prose de un slide → ambos renderizan correctamente en Design view sin cambio de código.
- **Sin verificar directamente**: el contenido real del `.pptx` descargado (no hay acceso al sistema de archivos de descargas de este navegador de pruebas) — se verificó que `slide.addNotes()` se invoca con el texto correcto cuando hay notas, y que el export completa sin error; no se abrió el archivo resultante en PowerPoint.

---

## 13. Registro de implementación — Fase 6 (última fase)

**Implementada 2026-09-04**, rama `claude/continuidad-formatos`. Los dos puntos del plan original, completos.

### Qué se construyó

Toda la ejecución de un pipeline vive en el servidor (`server/ChainExecutor.js`) — el cliente solo dibuja el DAG y dispara `POST /api/chains/run`. Cada tipo de nodo genera SQL de verdad, ejecutado directo contra DuckDB (`export_file` es literalmente un `COPY (query) TO ...`). Un nodo Chart no encaja en ese modelo — no hay un `COPY` que escriba un `.amoxvis` — así que ambos nodos nuevos entran en la rama de nodos con efectos secundarios propios (junto a `notification`/`checkpoint`), no en la de generación de SQL.

**Nodo Chart.** Toma la query (propia o auto-resuelta del nodo aguas arriba, mismo patrón que `export_file`/`create_table`), decide `xAxisKey`/`yAxisKeys` si no se configuraron a mano, y escribe un `.amoxvis` de verdad. Para decidir los ejes sin materializar el resultado completo, usa `DESCRIBE <query>` de DuckDB (barato, sin filas) y aplica la misma heurística que ya usa `DataVisualizer.jsx` en el cliente: primera columna como X, primera columna numérica como Y — así un gráfico que el pipeline escribe sin que nadie lo mire se ve igual que uno que alguien habría armado a mano al abrirlo por primera vez.

**Nodo Report.** Reutiliza esa misma resolución de ejes. En modo **Notebook**, escribe un `.sqlnb` v3.0 con una celda de texto (título) y una celda SQL (la query) — sin resultado cacheado, el mismo estado inicial guiado que ya tiene cualquier notebook nuevo: se abre y se corre. En modo **Deck**, materializa el gráfico como un `.amoxvis` propio junto al deck y escribe un `.amoxdeck` de dos slides (portada + `chart-full`) referenciándolo — construido a mano con template strings en el servidor (el parser/serializador del deck vive en el cliente; no vale la pena importarlo al runtime del servidor para dos slides fijos).

**Cierra el círculo real**: ambos nodos son pass-through (`extractOutputRef` los trata igual que `assert`/`checkpoint` — no crean tabla nueva, lo que sigue aguas abajo ve exactamente lo mismo que tenía antes), así que un pipeline puede seguir transformando datos DESPUÉS de un Chart/Report, o terminar ahí mismo.

**Integración completa, no solo el motor**: registro en `chainNodeTypes.js` (categoría Output, junto a Create Table/Export File), tarjetas de nodo (`ChartNode.jsx`/`ReportNode.jsx`, mismo patrón resumen-de-una-línea que `ExportFileNode.jsx`), panel de configuración con los mismos campos, reglas de validación (`chainValidation.js`), fichas de ayuda (`nodeDocs.js`), vista previa de "SQL" en el panel, y el contrato que el generador de cadenas por IA usa para no inventar tipos de nodo (`server/ai/chainGenerator.js`) — para que la IA también pueda proponer terminar un pipeline en un gráfico o un reporte cuando el usuario se lo pida en lenguaje natural.

### Validación

- `node -c server/ChainExecutor.js` y `pnpm run client:build` limpios.
- Probado en vivo, de punta a punta, con un pipeline real: **Import File (ventas.csv) → Chart** y **Import File → Report**, conectados y ejecutados con `Run All` contra el motor DuckDB real (no mockeado).
  1. Primer intento falló en validación — el `.sqlchain` no estaba guardado (`chainFile` nulo, columna `NOT NULL` en la tabla de runs) — corregido guardando el chain antes de correr; queda documentado porque es una restricción real del motor de ejecución, no un bug introducido aquí.
  2. `Run All` completó los 3 nodos con marca verde. Confirmado en disco: `charts/ventas_by_region.amoxvis` con `xAxisKey: "region"`, `yAxisKeys: ["ventas"]` — **auto-resueltos correctamente** sin configurar nada a mano — y `query: "SELECT * FROM \"ventas_data\""` (la tabla real que dejó el Import File).
  3. Nodo Report en modo **deck**: confirmado `reports/ventas_report.amoxdeck` (front-matter + slide de portada + slide `chart-full`) y `reports/ventas_report.amoxvis` junto a él, con `chartTitle` heredado del título del nodo.
  4. Reconfigurado el mismo nodo Report a modo **notebook** y vuelto a correr: `reports/ventas_notebook.sqlnb` con la celda de texto y la celda SQL correctas, JSON v3.0 válido.
  5. **Abiertos ambos artefactos en la app real** (no solo inspeccionados como texto): el `.amoxvis` abre en Story Flow y renderiza el bar chart real con los 4 valores correctos; el `.amoxdeck` abre en el Studio, muestra "2 slides", el título "Ventas Report", y el slide 2 renderiza el mismo gráfico — incluyendo el panel de notas del orador de la Fase 5 funcionando sin fricción sobre un deck que el propio pipeline escribió.
- **Nota de metodología, no de producto**: la mitad del tiempo de esta validación se fue en un error propio de mis scripts de prueba (`label.parentElement.querySelector('input')` devolvía el PRIMER input de toda la sección de config, no el que sigue a esa etiqueta específica, porque todos los campos son hermanos bajo un mismo contenedor) — varios valores terminaron escritos en el campo vecino equivocado antes de corregir el script a `label.nextElementSibling`. No es un bug de la UI real (un usuario con mouse nunca tropieza con esto); quedó documentado para no repetir la misma confusión en una futura sesión de pruebas contra este panel.
