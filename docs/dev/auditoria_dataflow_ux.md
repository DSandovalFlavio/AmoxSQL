# Auditoría de usabilidad — Data Flow (Chains)

**Fecha:** 2026-09-04
**Alcance:** interfaz del studio de chains (`client/src/components/chains/`) + los endpoints que la alimentan (`server/index.js`, `server/ChainExecutor.js`).
**Estado:** auditoría completa + plan de 6 fases. Mockup en [`mockup_dataflow_ux.html`](mockup_dataflow_ux.html). **Fases 0-3 implementadas** (servidor + interfaz) — ver §7 y §8.

> Recordatorio de naming: el studio se llama **Data Flow**; los archivos siguen siendo `.sqlchain` y el código interno sigue diciendo "chain". Este documento usa "Data Flow" para la interfaz y "chain" para el modelo de datos.

---

## 1. Resumen ejecutivo

Data Flow tiene un motor sólido y una interfaz que no lo acompaña. El ejecutor compila a SQL, infiere esquemas, transmite logs por SSE, valida en vivo y detecta ciclos. Pero la capa visual trata al nodo como una **etiqueta** en vez de como un **espacio de trabajo**: el nodo no tiene ni un botón. Todas las acciones viven lejos de donde está la atención del usuario, y los datos solo aparecen después de ejecutar, dentro de un modal.

El resultado es exactamente lo que se describe al usarlo: *"cada que añado un nodo tengo que ir hasta arriba"*, *"se siente raro que tengas que ejecutar todo el chain para obtener los menús"*, *"vas a ciegas"*.

Seis causas raíz explican casi todos los síntomas:

| # | Causa raíz | Síntoma que produce |
|---|---|---|
| **C1** | El nodo no tiene agencia — cero controles propios | Hay que ir al toolbar o al drawer para todo |
| **C2** | Las acciones viven en un toolbar que opera sobre una selección implícita | "Ejecutar hasta aquí" existe pero está arriba y no dice a qué nodo aplica |
| **C3** | El feedback es modal y posterior al hecho | Solo ves datos después de correr, y tapando el canvas |
| **C4** | La inferencia de esquema depende de tablas materializadas | Los desplegables de columnas están vacíos hasta que corres todo |
| **C5** | Cada ejecución borra todo el estado anterior | Una corrida parcial pierde lo ya logrado |
| **C6** | Crear un nodo no está asistido | Cae suelto donde soltaste el mouse, sin conectar, y el auto-layout reacomoda todo |

La propuesta de rediseño planteada (config flotante desde el nodo + pantalla partida con la tabla siempre visible) **es correcta y ataca C1, C2 y C3 de raíz**. Este documento la valida, propone dos refinamientos importantes, y añade el hallazgo técnico que la hace mucho más potente de lo planteado: **se puede previsualizar cada nodo sin ejecutar nada**, porque el compilador de SQL ya existe.

---

## 2. Lo que ya está bien (y no hay que romper)

Antes de la crítica, el inventario honesto de lo que funciona:

- **Validación en vivo, por nodo, sin ejecutar.** `validateChain` corre en cada cambio y pinta errores/advertencias en el nodo. Es la única señal pre-ejecución que hoy existe, y es buena.
- **Streaming de logs por SSE con fallback a polling.** `useChainExecution` maneja bien el ciclo de vida.
- **Detección de ciclos al conectar**, con mensaje claro.
- **Arrastrar desde el explorador de BD o de archivos crea el nodo correcto.** Soltar un `.csv` crea un `import_file` con `fileType` y `tableName` ya resueltos; soltar una tabla crea un `table_ref`. Esto es genuinamente bueno y poco común.
- **Galería de plantillas al abrir un chain vacío**, generación por IA, y documentación por tipo de nodo en popover (`NodeDocView`).
- **Nombres de tabla deterministas** (`staticOutputRef` → `__chain_*`), que es lo que hace posible previsualizar la salida de un nodo ya corrido.
- **Compilación a SQL** (`compileToSql`) — la base sobre la que se construye todo el plan de abajo.

---

## 3. Hallazgos detallados

Severidad: **A** = rompe el flujo de trabajo · **B** = fricción constante · **C** = pulido.

### 3.1 El nodo (C1)

`nodes/BaseChainNode.jsx` renderiza: badge de tipo, etiqueta, descripción, resumen de config, estado, badge de resultado, y un ojo de preview. Nada más.

| # | Hallazgo | Sev. |
|---|---|---|
| H1 | **No hay control de ejecución en el nodo.** Ni "hasta aquí", ni "desde aquí", ni "solo este". | A |
| H2 | **No hay botón de configuración.** El usuario debe descubrir que hacer clic selecciona y eso abre un drawer a la derecha. No hay ninguna señal visual de que el nodo sea configurable. | A |
| H3 | **No se puede ver el SQL del nodo.** El SQL solo existe en dos lugares: el evento `node_sql` dentro del stream de logs durante una corrida, y el "Compilar a SQL" del toolbar que descarga el chain **entero** como archivo. No hay forma de preguntar "¿qué SQL genera *este* nodo?". | A |
| H4 | **No hay menú contextual.** Clic derecho no hace nada en todo el canvas. | B |
| H5 | **No hay eliminar, duplicar, deshabilitar ni renombrar en el nodo.** Eliminar solo existe dentro del panel de configuración. Duplicar y deshabilitar no existen en absoluto. | B |
| H6 | **El ojo de preview solo aparece si `status === 'success' && resultSummary?.table`.** Antes de correr no hay ni siquiera el afford*ance*: el usuario no sabe que la previsualización existe. | A |
| H7 | El nodo no muestra ni conteo de filas ni esquema hasta después de correr. | B |

### 3.2 Las acciones y su ubicación (C2)

| # | Hallazgo | Sev. |
|---|---|---|
| H8 | **"From Here" / "To Here" viven en el toolbar superior** y solo aparecen cuando hay un nodo seleccionado. El recorrido es: clic en el nodo (abajo, al centro) → subir la vista al toolbar → encontrar el botón. En un canvas con scroll el nodo puede quedar fuera de vista mientras se busca el botón. | A |
| H9 | **Los botones no nombran su objetivo.** Dicen "From Here"/"To Here" sin decir *here* = cuál nodo. Con dos nodos parecidos es adivinanza. | B |
| H10 | **Aparecen y desaparecen**, lo que mueve el resto del toolbar (layout shift) cada vez que se selecciona o deselecciona un nodo. | C |
| H11 | El toolbar mezcla tres jerarquías sin separación clara: identidad/guardar, ejecución, y 7 herramientas (Layout, Variables, Export, SQL, Import, Logs, History) todas al mismo peso visual. | C |

### 3.3 La ceguera durante la construcción (C3)

| # | Hallazgo | Sev. |
|---|---|---|
| H12 | **Los datos solo existen dentro de un modal** (`ChainDataPreview`), que tapa el canvas. Es imposible ver el nodo y su resultado a la vez, y por lo tanto imposible comparar la entrada con la salida. | A |
| H13 | **La pestaña "Preview" del panel de configuración muestra la tabla dentro de una columna de 300 px por defecto.** Una tabla de datos en 300 px de ancho no es utilizable. | A |
| H14 | El panel de logs arranca colapsado y solo se abre al ejecutar. El SQL que se generó queda enterrado ahí dentro, mezclado con el resto del stream. | B |
| H15 | **No hay marca de "obsoleto".** Si cambias la configuración de un nodo después de correr, el nodo sigue mostrando el badge verde y el conteo de filas de la corrida anterior. La interfaz miente. | A |

### 3.4 Los desplegables vacíos (C4) — el hallazgo más costoso

Este merece explicación técnica porque es la queja número uno y tiene una causa muy concreta.

`POST /api/chains/schema/infer` (`server/index.js:5451`) hace esto:

1. Busca **una sola** arista entrante: `const parentId = parentEdges[0].source`. Solo mira un nivel arriba, y solo el primer padre.
2. Si el padre es `import_file`, hace `DESCRIBE SELECT * FROM read_csv(...) LIMIT 0` sobre el archivo — **esto sí funciona sin ejecutar**.
3. **Para cualquier otro tipo de padre**, resuelve su tabla física (`staticOutputRef` → `__chain_*`) y hace `DESCRIBE` sobre ella. Esa tabla **solo existe si ese nodo ya corrió**.

De ahí sale el comportamiento exacto que se reporta: importas un CSV y el siguiente nodo sí ve columnas; pero en cuanto encadenas un segundo transform (filter → group_aggregate), el segundo ya no ve nada hasta que ejecutes.

| # | Hallazgo | Sev. |
|---|---|---|
| H16 | **La inferencia de esquema exige materialización previa** para todo nodo derivado. Obliga a "ejecutar todo" como precondición para poder configurar. | A |
| H17 | Solo se consulta el primer padre. En `join_tables` (2 padres) y `merge_tables` (N padres) las columnas del segundo lado nunca se sugieren — y esto está **documentado como limitación** en el propio panel (`ChainNodeConfigPanel.jsx:1103`) en vez de resuelto. | B |
| H18 | El mensaje al usuario dice *"No upstream columns detected yet. Connect a data source, or run the chain"* — o sea, la interfaz sabe que la solución es "corre todo" y se lo pide al usuario. | B |

### 3.5 El estado se borra (C5)

| # | Hallazgo | Sev. |
|---|---|---|
| H19 | `startRun` hace `setNodeStatuses({})` y `setLogs([])` en **toda** corrida, incluidas las parciales. Ejecutar "hasta el nodo 3" borra el estado visual de los nodos 4–8 que ya habías corrido. Construir incrementalmente pierde contexto en cada paso. | A |

### 3.6 Añadir y conectar nodos (C6)

| # | Hallazgo | Sev. |
|---|---|---|
| H20 | **El nodo nuevo cae sin conectar.** `onDrop` lo coloca en `clientX - bounds.left - 100` y ya. Aunque tuvieras un nodo seleccionado, no se conecta con nada. El usuario debe arrastrar el handle manualmente cada vez. | A |
| H21 | **No hay forma de añadir un nodo *desde* un nodo.** No existe el "+" en el handle de salida, que es el gesto esperado en cualquier editor de flujo. | A |
| H22 | **El auto-layout es todo-o-nada y manual.** `handleAutoLayout` recalcula posiciones de **todos** los nodos y las aplica de golpe, destruyendo cualquier arreglo manual. No es deshacible. En la práctica el usuario aprende a no tocarlo. | B |
| H23 | Nodos soltados cerca uno del otro pueden quedar encimados; no hay snapping ni detección de colisión. | B |
| H24 | No se puede insertar un nodo **sobre una arista** (soltarlo encima para que se intercale). | C |
| H25 | La paleta es una lista plana de 34 tipos en 8 categorías, sin búsqueda. Encontrar `window_functions` requiere recorrer visualmente. | B |

---

## 4. Validación del rediseño propuesto

La propuesta original, tal como se planteó:

> *"que la configuración de cada nodo sea una ventanita que se abra cuando le des clic en el botón de configuración del nodo […] la mitad de la pantalla será donde se añade el chain y la otra mitad del lado derecho se ve siempre la tabla resultante al terminar de configurar cada nodo […] si pone ejecutar hasta aquí puede ver hasta ese punto"*

**Veredicto: la dirección es correcta.** Ataca directamente C1 (botón de configuración *en el nodo*), C2 (acción donde está la atención) y C3 (la tabla deja de ser un modal y pasa a ser superficie permanente). Es el cambio de mayor valor por unidad de trabajo de todo el documento.

Tres refinamientos, uno de ellos importante.

### 4.1 Refinamiento — ventana flotante → popover anclado al nodo

El instinto es correcto: **la configuración pertenece al nodo, no a un cajón lejano**. Pero una ventana flotante libre tiene dos costos:

- El usuario tiene que posicionarla, y va a taparle el canvas — reintroduciendo justo el problema del modal que el rediseño quiere eliminar.
- Al hacer pan/zoom del canvas, la ventana queda desincronizada del nodo al que pertenece, rompiendo la asociación visual.

**Propuesta:** un **popover anclado al nodo** — se abre a su costado, se voltea solo si no cabe, y se mueve con el canvas. Mismo modelo mental ("esto es de este nodo"), sin el costo de administrar una ventana.

Para los tipos de nodo con configuración pesada (`sql_inline`, `group_aggregate`, `clean`, `window_functions`, `date_ops`, `ai_enrich`) el popover lleva un botón **Expandir**, que mueve la configuración al panel derecho a altura completa. Ahí sí cabe un editor de SQL o una lista de 8 agregaciones.

### 4.2 Refinamiento mayor — previsualizar **sin ejecutar**

Esta es la parte que hace al rediseño mucho mejor de lo planteado, y sale de un hallazgo del código.

El planteamiento original es *"al terminar de configurar cada nodo se ve la tabla"* apoyado en "ejecutar hasta aquí". Eso funciona, pero sigue exigiendo una ejecución explícita y materializa tablas en la base.

**Existe un camino mejor, y la infraestructura ya está construida.** `ChainExecutor.buildNodeSql(node, sources, ...)` genera el SQL de un nodo a partir de las consultas de sus padres, y `compileToSql` ya recorre el DAG en orden topológico. Hoy, al compilar, cada padre se referencia como **tabla física** (`__chain_*`) — por eso hace falta haber corrido.

Si en cambio el padre se **inserta como subconsulta**, recursivamente, cualquier nodo se compila a **un solo SELECT**:

```sql
SELECT categoria, SUM(monto) AS total
FROM (
  SELECT * FROM (
    SELECT * FROM read_csv('data/ventas.csv', auto_detect=true)
  ) WHERE fecha >= '2026-01-01'
)
GROUP BY categoria
```

Con eso se obtienen tres cosas de un solo mecanismo:

1. **Preview en vivo** — `SELECT * FROM (<compilado>) LIMIT 200`. Sin correr el chain, sin materializar nada, y actualizable mientras se edita la configuración.
2. **Columnas en vivo** — `DESCRIBE <compilado>`. **Esto resuelve H16 por completo**: los desplegables se llenan al instante, sin ejecutar, a cualquier profundidad de la cadena. También resuelve H17, porque el compilado ya incorpora *todos* los padres, no solo el primero.
3. **"Ver el SQL de este nodo"** — el compilado mismo. Resuelve H3 gratis.

DuckDB es local y columnar; un `LIMIT` sobre una subconsulta con *projection pushdown* es cuestión de milisegundos en la mayoría de los casos.

**Límites honestos de este mecanismo** (hay que diseñar el fallback, no esconderlo):

- **Nodos que no son SELECT** no se pueden anidar: `create_table`, `export_file`, `notification`, `checkpoint`, `assert`, `chart`, `report`, `rename_table`, y `sql_inline` cuyo cuerpo no empiece con `SELECT`/`WITH`. Para esos: usar la tabla materializada si existe (lo que hoy hace `preview-node`), y si no, ofrecer "Ejecutar hasta aquí".
- **`ai_enrich`** invoca un LLM por fila. Nunca debe previsualizarse automáticamente; debe requerir clic explícito y correr con un tope de filas bajo.
- **`http_fetch`** hace red. Igual: opt-in explícito, nunca automático al escribir.
- **Agregaciones sobre fuentes grandes**: `LIMIT` no atraviesa un `GROUP BY`, así que previsualizar un agregado escanea la fuente completa. Mitigación: presupuesto de preview (`USING SAMPLE` sobre la fuente) marcando el resultado como **aproximado**, o caché por hash de configuración.

### 4.3 Refinamiento — el panel derecho no debe ser solo la tabla

Con el panel derecho permanente, conviene que absorba todo lo que hoy está disperso. Cuatro pestañas:

| Pestaña | Contenido | Qué hallazgo resuelve |
|---|---|---|
| **Datos** | La tabla resultante (en vivo o materializada, siempre etiquetado cuál) | H12, H13 |
| **Esquema** | Columnas de entrada y de salida, con tipos | H7, H16 |
| **SQL** | El SQL compilado de ese nodo, copiable | H3, H14 |
| **Log** | Solo las líneas de la última corrida **de ese nodo** | H14 |

### 4.4 Lo que hay que añadir más allá de lo propuesto

Tres cosas que el rediseño necesita para no mentir ni frustrar:

- **Marcado de obsolescencia (H15).** Con una tabla siempre visible, es indispensable saber si lo que muestra corresponde a la configuración actual. Hash de config por nodo; al cambiar, se marcan ese nodo y todos sus descendientes como obsoletos.
- **Preservar estado entre corridas parciales (H19).** Si "ejecutar hasta aquí" borra lo demás, la construcción incremental pierde su propio historial.
- **Añadir y conectar asistido (H20, H21).** Es la otra mitad de la pregunta original ("cómo se van añadiendo y conectando"). El "+" en el handle de salida es el gesto que falta.

---

## 5. Plan de implementación

Seis fases. Las fases 1, 4 y 5 son independientes entre sí y se pueden hacer en cualquier orden; **la 2 y la 3 dependen de la 0**.

### Fase 0 — Cimiento: compilar sin materializar *(servidor)*

Sin esto, el panel derecho solo puede mostrar resultados de corridas y el rediseño queda a medias.

- `ChainExecutor.compileNodeQuery(chainDef, nodeId, { chainFile, vars, projectPath })` → `{ sql, inlinable, reason }`. Recorre los padres recursivamente insertándolos como subconsulta en vez de como tabla física. Reutiliza `buildNodeSql` tal cual; lo único nuevo es el `refQuery` que inlinea.
- `POST /api/chains/node-sql` → el SQL compilado del nodo (pestaña SQL).
- `POST /api/chains/node-preview` → intenta, en orden: (a) SELECT compilado con `LIMIT`; (b) tabla materializada (lo que ya hace `preview-node`); (c) no disponible. Devuelve `{ source: 'live' | 'materialized' | 'none', columns, rows, totalRows, approximate }`.
- `POST /api/chains/node-schema` → `DESCRIBE` sobre el compilado, con fallback a `schema/infer`. **Sustituye la ruta que exige materialización.**
- Salvaguardas: timeout de sentencia, tope de filas, y lista de tipos excluidos del preview automático (`ai_enrich`, `http_fetch`).

*Validación:* cadena de 4 transforms sobre un CSV sin haber ejecutado nunca — los 4 nodos deben devolver columnas y filas.

### Fase 1 — El nodo se vuelve accionable

- Barra de acciones sobre el nodo, visible al pasar el mouse o al seleccionarlo (no permanente, para no ensuciar el canvas): **Configurar · Ejecutar hasta aquí · Ejecutar desde aquí · Ver datos · ⋯**
- Menú `⋯` y menú contextual (clic derecho) con: Ejecutar solo este · Ver SQL · Duplicar · Deshabilitar · Renombrar · Documentación · Eliminar.
- El toolbar conserva "Ejecutar todo" y pierde "From Here"/"To Here" (que dejan de tener sentido arriba). Elimina H10 de paso.

*Resuelve:* H1–H5, H8, H9, H10.

### Fase 2 — La pantalla se parte

- `ChainEditor` pasa a dos columnas redimensionables: canvas (~60 %) | inspector (~40 %), con el ancho persistido en `localStorage`.
- Inspector con las 4 pestañas de §4.3, siguiendo la selección, con opción de **fijar** un nodo para comparar mientras se navega.
- Preview en vivo con *debounce* sobre cambios de configuración (~350 ms), etiquetando siempre si es en vivo, materializado o aproximado.
- `ChainDataPreview` (el modal) sobrevive solo como "abrir en grande".

*Resuelve:* H6, H7, H12, H13, H14.

### Fase 3 — Configuración anclada al nodo

- El contenido de `ChainNodeConfigPanel` se monta en un popover anclado al nodo, con reposicionamiento automático y seguimiento de pan/zoom.
- Botón **Expandir** → mueve la configuración al inspector a altura completa (para los tipos pesados).
- Se retira el drawer derecho de configuración, que queda absorbido.

*Resuelve:* H2, y el problema de ancho de H13 para configuraciones grandes.

### Fase 4 — Añadir y conectar sin fricción

- **"+" en el handle de salida** → menú de tipos sugeridos (filtrados por lo que tiene sentido después de ese nodo) → crea, conecta, coloca a la derecha y abre su configuración.
- Soltar desde la paleta **con un nodo seleccionado** → auto-conecta y auto-coloca a su derecha.
- **Layout incremental**: colocar solo el nodo nuevo respetando lo ya acomodado. El botón "Layout" pasa a llamarse **Ordenar todo** y se vuelve deshacible.
- **Insertar sobre arista**: soltar un nodo encima de una conexión lo intercala.
- Búsqueda en la paleta.

*Resuelve:* H20–H25.

### Fase 5 — Estado honesto

- Hash de configuración por nodo → marca de **obsoleto** en el nodo y en todos sus descendientes al editar.
- `startRun` deja de limpiar el estado global: en modo parcial preserva los estados de nodos no involucrados.
- Filtrado de logs por nodo (alimenta la pestaña Log del inspector).

*Resuelve:* H15, H19.

### No objetivos (explícitos)

- No se reescribe `ChainExecutor.executeNode` ni la semántica de ejecución.
- No cambia el formato `.sqlchain` — el plan es puramente de interfaz + endpoints de lectura.
- No se toca el generador de chains por IA.
- No se introduce virtualización de listas/tablas (regla del proyecto).

---

## 6. Mockup

[`mockup_dataflow_ux.html`](mockup_dataflow_ux.html) — HTML autocontenido, abrible en cualquier navegador. Usa los tokens reales del tema oscuro de AmoxSQL y los colores reales de los tipos de nodo. Es interactivo: se puede seleccionar nodos, cambiar de pestaña en el inspector y abrir el popover de configuración, para poder juzgar el flujo antes de escribir código de producción.

---

## 7. Registro de implementación — Fase 0

**Qué se construyó** (todo en `server/ChainExecutor.js` y `server/index.js`; cero cambios de frontend, tal como estaba acotada la fase):

- **`ChainExecutor.compileNodeQuery(chainDef, nodeId, opts)`** — compila la consulta que produce la salida de UN nodo, sin ejecutar ni materializar nada. Recorre los ancestros del nodo y, para cada uno que sea "SELECT-shaped" (`SELECT_SHAPED_TYPES`: fuentes locales, `sql_inline`/`sql_file` cuando el cuerpo es un SELECT/WITH, y todos los transforms de una sola entrada o de N entradas), lo convierte en una **CTE con nombre** (`WITH cte_x AS (...)`) en vez de una subconsulta anidada.
- **`ChainExecutor.inlineNodeBody`** + **`bareSelectBody`** — le quitan a `buildNodeSql` (ya existente) el envoltorio `CREATE OR REPLACE TABLE "x" AS ` para dejar el `SELECT` puro reutilizable dentro de una CTE. Cero duplicación de las ~40 ramas de `buildNodeSql`: se reutiliza tal cual.
- **Punto de corte explícito**: un nodo que no puede ser SELECT-shaped (sink, `http_fetch`/`bucket_read`/`gsheet_read`/`ai_enrich` — red o LLM — o `clean`, que solo resuelve contra el esquema en vivo) usa su **tabla física de la última corrida** en vez de intentar inlinearlo, y ahí se corta la cadena de CTEs. Nunca se dispara una llamada de red o de LLM automáticamente por escribir en un campo.
- **`POST /api/chains/node-sql`** (nuevo) — el SQL compilado de un nodo.
- **`POST /api/chains/schema/infer`** (reescrito, misma URL) — antes resolvía columnas leyendo la tabla física del PRIMER padre (por eso los menús salían vacíos hasta ejecutar todo). Ahora compila y hace `DESCRIBE` sobre **cada** padre — en vivo, sin ejecutar, a cualquier profundidad — con fallback a la tabla materializada cuando el padre no es inlinable.
- **`POST /api/chains/preview-node`** (reescrito, misma URL) — intenta primero el compilado en vivo (`SELECT * FROM (compilado) LIMIT n`); si el nodo no es inlinable, cae a su tabla materializada, igual que antes. Contrato de respuesta extendido de forma aditiva con `source: 'live' | 'materialized'` — no rompe a los consumidores actuales.

**Por qué CTEs y no subconsultas anidadas** (pregunta que hizo el usuario antes de arrancar la fase, y que cambió el diseño): con subconsultas anidadas, un nodo con *fan-out* — dos hijos que comparten el mismo padre — duplica el SQL completo del padre una vez por cada hijo, y eso se compone con la profundidad (un DAG de 4 niveles con fan-out en cada nivel crece exponencial en el tamaño del texto). Con CTEs, cada ancestro se resuelve **una sola vez** (memoizado por `nodeId`) sin importar cuántos descendientes lo referencian — el texto compilado crece lineal en el número de ancestros, no en el número de rutas. Verificado en pruebas (§ Validación): una cadena con un nodo compartido por dos hijos que a su vez confluyen en un `join_tables` produce el CTE del ancestro compartido **exactamente una vez**.

**Poda de CTEs no usadas**: un nodo puede ser de un tipo potencialmente inlinable pero fallar en la práctica (`join_tables` con menos de 2 orígenes conectados, `sql_inline` cuyo cuerpo no es un SELECT). Antes de saber que fallaría ya se habían recorrido sus padres. Dos medidas para que el SQL final nunca muestre CTEs muertas: (1) un nodo cuyo tipo *nunca* puede ser SELECT-shaped corta la recursión antes de tocar a sus padres; (2) al final, una pasada de alcance (`needed`/`stack`) desde la CTE raíz elimina cualquier CTE que quedó sin referenciar.

**Diferido a propósito**: sin cambios de frontend — la Fase 1-3 son las que conectan esto a la interfaz (barra de acciones del nodo, panel derecho permanente, popover de configuración). Este cimiento ya deja los tres endpoints funcionando y probados; conectarlos es trabajo de UI puro.

**Bug real encontrado y corregido en el camino**: los operadores `>`, `>=`, `<`, `<=` y `BETWEEN` del nodo Filter interpolaban el valor **sin comillas** — `fecha >= 2026-01-01` se parseaba como aritmética (`2026 - 1 - 1`) en vez de una comparación de fecha, no solo en el compilador nuevo sino también en `executeNode` (el camino de ejecución real, `ChainExecutor.js` línea ~1408 antes del fix). Cualquier chain existente que filtrara una columna de fecha o de texto con un operador de comparación producía SQL roto o un resultado silenciosamente incorrecto. Corregido con `filterValueLiteral()`: deja el valor sin comillas solo si es un número puro, lo cita en cualquier otro caso (DuckDB castea implícitamente un string citado a `DATE`/`TIMESTAMP` en una comparación). Aplicado en los dos lugares que construían la cláusula `WHERE` (`buildNodeSql` y `executeNode`).

**Validación** (servidor standalone en un proyecto descartable, sin abrir la app real, puerto y proyecto verificados antes de arrancar):

- Cadena de 4 nodos (`import_file → filter → group_aggregate → sort`) **jamás ejecutada**: `schema/infer`, `node-sql` y `preview-node` devolvieron columnas y filas correctas para los 3 nodos derivados, a cualquier profundidad. `preview-node` en el filtro: 6 de 8 filas (fecha ≥ 2026-01-01), agregado: 5 categorías con sumas correctas, orden: descendente por `total_sales` correcto.
- **Fan-out real**: un nodo (`import_file`) alimentando a dos hijos (`filter` con distinta condición cada uno) que confluyen en un `join_tables` — el CTE del padre compartido aparece **1 sola vez** en el SQL compilado.
- **`join_tables` con columnas distintas por lado** (`add_column` distinto en cada rama) — `schema/infer` sobre el nodo de join devuelve las columnas de **ambos** lados (`left_flag` y `right_flag` presentes), no solo del primer padre — corrige H17 de la auditoría.
- **Nodo aislado, nunca conectado, nunca ejecutado**: los 3 endpoints degradan con gracia (`columns: []`, `available: false` con mensaje claro) — no hay excepción sin capturar.
- **Nodo no-inlinable (`clean`) nunca ejecutado, con un nodo `sort` después**: `node-sql` del `sort` corta correctamente en `clean` (referencia su tabla física hipotética) y — tras el fix de poda — el SQL final **no** incluye la CTE del import que quedó huérfana.
- **Ejecución real de la misma cadena de 4 nodos** (vía `/api/chains/run`, no solo compilar): completó con éxito, y el conteo de filas en cada paso (8 → 6 → 5 → 5) coincide exactamente con lo que había predicho el preview en vivo antes de correr — la propiedad más importante: lo que se previsualiza es lo que se ejecuta.
- Verificado que el arreglo del filtro no rompe la ejecución real (antes del fix, la cadena de arriba fallaba al ejecutarse de verdad, no solo al previsualizar).

---

## 8. Registro de implementación — Fases 1-3

**Qué se construyó** (todo en `client/src/components/chains/`; sin cambios de formato `.sqlchain` salvo el campo aditivo `disabled` en cada nodo):

- **`nodes/BaseChainNode.jsx`** — barra de acciones flotante sobre el nodo, visible al pasar el mouse o al seleccionarlo: *Configurar · Hasta aquí · Desde aquí · Ver datos · ⋯*. Clic derecho en cualquier parte del nodo, o doble clic, abren el mismo menú/popover — sin afectar el gesto de arrastrar. Estado deshabilitado: el nodo se atenúa (opacidad 0.5) con una insignia de pausa.
- **`NodeActionMenu.jsx`** (nuevo) — el menú "⋯" y el menú de clic derecho son el mismo componente: *Ejecutar solo este nodo · Ver SQL · Duplicar · Deshabilitar/Habilitar · Renombrar · Documentación · Eliminar*. Se cierra con clic afuera, Escape o scroll.
- **`ChainNodeConfigPopover.jsx`** (nuevo) — la configuración del nodo ahora es un popover anclado al nodo en vez de un cajón fijo a la derecha. Se ancla leyendo el `getBoundingClientRect()` del propio elemento DOM del nodo (`.react-flow__node[data-id]`) — sigue al nodo en pan/zoom/arrastre sin matemática de coordenadas, porque react-flow ya mantiene ese elemento sincronizado cada frame; `useViewport()` solo fuerza el re-render en pan/zoom, ya que una lectura del DOM en el cuerpo del render no se suscribe sola. Se abre debajo del nodo, se voltea arriba si no cabe, y tiene un botón **Expandir** (300px → 440px) para los tipos con más campos.
- **`ChainInspector.jsx`** (nuevo) — el panel derecho ahora es **permanente**, no condicionado a tener un nodo seleccionado. Cuatro pestañas — Datos · Esquema · SQL · Log — todas alimentadas por los tres endpoints de Fase 0, con debounce de 350 ms sobre cambios de nodo/config/conexiones. Un nodo se puede **fijar** para seguir viéndolo mientras se selecciona otro. El tab Log filtra `execution.logs` por `nodeId` — nada nuevo del lado del servidor, Fase 0 ya lo dejó todo listo.
- **`ChainNodeConfigPanel.jsx`** (recortado) — perdió sus pestañas internas (schema/preview/validación/info — ahora viven en el Inspector o en el badge de validación del propio nodo) y el botón "Delete Node" (ahora en la barra de acciones y en el menú). Lo que queda es solo los campos: nombre, descripción, configuración específica del tipo, y el `SqlPreview` local (el fragmento SQL de *este* nodo únicamente, sin red — complementa al SQL compilado completo del Inspector).
- **`ChainToolbar.jsx`** — se retiraron "From Here"/"To Here" (H8, H9, H10 de la auditoría): esas acciones ahora viven en la barra del propio nodo.
- **`ChainEditor.jsx`** — la pieza de integración: estado nuevo para el popover de configuración, el nodo fijado del Inspector, el menú contextual, y el modal de documentación disparado desde un nodo. Un solo callback estable (`onActionCallback` → `nodeActionRef`) se reparte a todos los nodos vía `data.onAction`, siguiendo el mismo patrón de ref-estable que ya usaba `onPreview` (evita que el memo de `nodesWithValidation` se invalide por cambiar las dependencias del handler en cada render).
- **Nodo "Deshabilitar"** — implementado de verdad, no solo visual: `server/ChainExecutor.js`'s `run()` salta la ejecución real de un nodo deshabilitado y pasa su entrada sin cambios al siguiente (marcado `status: 'success'`, no `'skipped'`, para que no arrastre en cascada a los nodos de abajo); `compileNodeQuery`'s `resolve()` hace lo mismo en el compilado en vivo, para que el preview y la ejecución real siempre digan lo mismo. Nuevo modo `only_node` en `run()` para "Ejecutar solo este nodo": corre un único nodo contra lo que sus padres ya tengan materializado, sin volver a correr nada río arriba.

**Diferido a propósito**: el plan original decía que el botón "Expandir" del popover "mueve la configuración al inspector". Se implementó distinto — el popover simplemente crece (300px → 440px) en vez de trasladarse a una quinta pestaña del Inspector. Mismo objetivo (más espacio para los tipos de nodo con muchos campos), sin duplicar la superficie de edición entre dos sitios ni añadir una pestaña "Config" que competiría con Datos/Esquema/SQL/Log. Ajuste deliberado documentado aquí, no un recorte de alcance.

**Tres bugs reales encontrados y corregidos durante la validación** (ninguno estaba en el plan — todos surgieron de probar la interfaz de verdad, no el código en abstracto):

1. **El log de ejecución salía vacío siempre.** `useChainExecution.js`'s `startRun` solo llena `logs` a través de eventos SSE (`node_start`/`node_sql`/`node_complete`), pero `POST /api/chains/run` ejecuta la cadena **completa antes de responder** — para cualquier chain que corra más rápido de lo que tarda la respuesta HTTP en volver (prácticamente siempre, con DuckDB local), el cliente nunca llega a abrir la conexión SSE a tiempo para oír esos eventos. El panel de log inferior (`ChainLogPanel`, ya existente, sin tocar) y el nuevo tab Log del Inspector mostraban "No hay logs" incluso después de una corrida exitosa con nodos verdes. Corregido reconstruyendo las mismas líneas de log a partir de `node_runs` (que sí persiste SQL ejecutado, duración, resultado y error) la primera vez que `pollStatus` ve un nodo en estado terminal — con un `Set` para no duplicar si SSE sí alcanza a loguear ese nodo en una corrida más lenta.
2. **Duplicar un nodo lo creaba pero no lo seleccionaba** (y Deshabilitar podía silenciosamente no aplicarse). Ambos handlers llamaban `setSelectedNode`/`updateNode` **dentro** del callback de `setNodes(updater)`. React 18 StrictMode invoca ese `updater` dos veces en desarrollo para detectar reducers impuros — cada invocación disparaba el efecto secundario con un `copy` distinto (id generado con `Date.now()+random`), y el `selectedNode` terminaba apuntando a un nodo que no era el que React realmente había confirmado en el array `nodes`. Corregido leyendo `nodes` del cierre exterior del componente y moviendo `setSelectedNode`/`updateNode` a sentencias hermanas, fuera del updater — el mismo patrón que ya usaba (correctamente) el código preexistente de arrastrar-y-soltar desde la paleta.
3. **El Inspector no se refrescaba al deshabilitar/habilitar un nodo.** Su efecto de carga dependía de `JSON.stringify(config)`, y deshabilitar solo cambia `data.disabled`, no `config` — así que Datos/Esquema/SQL seguían mostrando el estado de antes de deshabilitar hasta que algo más disparara un refetch. Corregido incluyendo `disabled` en la firma de dependencias del efecto.

**Validación** (mismo método que Fase 0: servidor standalone en un proyecto descartable — nunca la app real del usuario — cadena de 4 nodos escrita a mano en el disco y abierta en la interfaz real vía navegador, con Vite dev + un override de puerto solo-para-pruebas en `api.js`, revertido al terminar):

- Seleccionar un nodo (sin ejecutar nada) → la barra de acciones aparece, y el Inspector muestra de inmediato datos, esquema y SQL en vivo — confirmado con capturas de pantalla y lectura de accesibilidad, no solo inspección de código.
- "Configurar" abre el popover anclado exactamente debajo del nodo seleccionado, con los campos reales del tipo (autocompletar de columnas incluido); "Expandir" lo ensancha sin perder el ancla.
- Las 4 pestañas del Inspector (Datos/Esquema/SQL/Log) se probaron una por una, tanto antes de correr (todo en vivo) como después de un `Run All` real — los números coinciden exactamente entre el preview en vivo y la ejecución real, incluida la vista Log por-nodo tras el fix del bug #1.
- Las 7 acciones del menú "⋯"/clic derecho probadas una por una: Ver SQL cambia el tab del Inspector; Duplicar crea la copia seleccionada y correctamente marcada con error de validación (sin conectar, tal como se espera); Deshabilitar atenúa el nodo, y tanto el SQL compilado como los datos del Inspector cambian a la salida "passthrough" (sin la cláusula del nodo) — confirmado también en un nodo **río abajo** del deshabilitado, y en una ejecución real donde el log muestra al nodo agregador leyendo directo de la tabla importada, saltándose el filtro; Renombrar actualiza la etiqueta del nodo y el título del Inspector; Documentación abre el mismo modal que ya usaba la paleta; Eliminar limpia el nodo y sus aristas.
- Clic derecho sobre el nodo abre el mismo menú que "⋯", en la posición del cursor, sin activar el menú contextual nativo del navegador.

**No verificado en este pase** (queda para cuando se implemente Fase 4, que es la que trabaja directamente sobre el canvas): el reposicionamiento del popover durante un arrastre activo del nodo (se probó con el nodo quieto), y el comportamiento con dos o más popovers/menús abiertos a la vez (la implementación solo permite uno de cada, por diseño, pero no se forzó el caso límite).

---

## 9. Registro de implementación — Fases 4-5

**Qué se construyó** (todo en `client/src/components/chains/`; sin cambios de formato `.sqlchain`):

- **`chainUtils.js`** — `computeIncrementalPosition(sourceNode, allNodes)`: coloca un nodo nuevo a la derecha del nodo origen, con separación fija y una comprobación de colisión que empuja hacia abajo (fila por fila) si ya hay algo ocupando esa posición. Deliberadamente distinto de `computeAutoLayout` (que reordena el lienzo completo) — Fase 4 pide que añadir un nodo nunca reacomode lo que el usuario ya organizó a mano.
- **`nodes/BaseChainNode.jsx`** — botón "+" en el handle de salida (visible junto con la barra de acciones, mismo criterio de hover/selección). `aria-label` explícito (`Add a step after {label}`) porque el icono solo no alcanza para ser localizable ni accesible.
- **`NodeTypePicker.jsx`** (nuevo) — popover de selección de tipo anclado al punto del clic, con buscador con foco automático, agrupado por categoría (excluye "Fuentes de datos", porque un nodo nuevo desde el "+" siempre parte de algo que ya existe) y cierre por clic afuera/Escape/scroll — mismo patrón que `NodeActionMenu.jsx`.
- **`ChainEditor.jsx`** — `onDrop` reescrito por completo: usa `useReactFlow().screenToFlowPosition()` en vez de la aproximación anterior (`clientX - bounds.left - 100`, que ignoraba el pan/zoom activo) para ubicar el punto de soltado en coordenadas de lienzo reales; calcula la distancia del punto a cada arista existente (segmento entre los centros de sus dos nodos) y, si cae lo bastante cerca de alguna, la nueva conexión **reemplaza** esa arista por dos (origen→nuevo, nuevo→destino) en vez de dejar el nodo sin conectar; si no cae sobre ninguna arista y hay un nodo seleccionado, se auto-conecta desde ese nodo con `computeIncrementalPosition`. El botón "+" del nodo sigue el mismo camino de auto-conectar+posicionar, y además abre la configuración del nodo nuevo automáticamente. "Ordenar todo" (antes "Layout") ahora captura las posiciones previas antes de reflotar el lienzo completo y ofrece **Deshacer** vía la acción del toast existente de `ToastProvider` — sin historial multi-paso, solo el último reordenamiento.
- **`ChainNodePalette.jsx`** — buscador que filtra las categorías/tipos por etiqueta o descripción (34 tipos en 9 categorías ya no se recorren solo por scroll).
- **`ChainToolbar.jsx`** — el botón "Layout" pasa a llamarse "Ordenar todo".
- **`useChainExecution.js`** — `pollStatus` deja de reemplazar `nodeStatuses` entero (`setNodeStatuses(statuses)`) y pasa a **fusionar** (`setNodeStatuses(prev => ({...prev, ...statuses}))`), porque el `/status` de una corrida parcial solo devuelve `node_runs` de los nodos dentro de su alcance — un reemplazo total borraba instantáneamente el estado (éxito/fallo) de todo nodo fuera de ese alcance en cuanto llegaba la primera respuesta. `startRun` solo limpia `nodeStatuses` a blanco cuando `mode === 'full'`.
- **`ChainEditor.jsx`** — marca de **obsoleto**: `lastRunSnapshots[nodeId] = { configStr, seq }` registra la config vigente y un número de secuencia de corrida en el momento en que ese nodo llegó a un estado terminal; `staleNodeIds` marca un nodo si (a) su config actual difiere de esa foto, o (b) el `seq` de su padre directo es mayor que el suyo propio (ver bug #2 abajo), y propaga ambas señales río abajo por BFS sobre las aristas. `BaseChainNode.jsx` pinta el borde en ámbar y una insignia "outdated" en el badge de resultado cuando el nodo está obsoleto **y** tiene un resultado terminal que mostrar (un nodo `pending`/`skipped` no tiene un resultado que pueda estar desactualizado, así que no se le pinta encima de su estado normal).

**Dos bugs reales encontrados y corregidos durante la validación** (ninguno estaba en el plan):

1. **El badge "outdated" no se limpiaba nunca al re-ejecutar un nodo ya exitoso.** La primera versión marcaba la foto de config solo en una *transición* de estado (`ns.status !== prevStatus`, y el nuevo valor siendo `success`/`failed`). Re-ejecutar un nodo que ya estaba en `success` produce exactamente el mismo valor de estado (`success` → `success`) — no hay transición que observar, así que la foto nunca se actualizaba y el nodo quedaba marcado "outdated" para siempre, incluso justo después de correr con su configuración actual. Corregido: en vez de mirar si el *valor* del estado cambió, se marca la foto de cualquier nodo que esté **dentro del alcance de la corrida** que acaba de reportar un estado terminal para él — sin importar si el valor es el mismo que antes. El alcance se calcula del lado del cliente (`computeRunScope`, réplica de la semántica `from_node`/`to_node`/`only_node` del servidor) porque el servidor no lo expone explícitamente en la respuesta.
2. **Tras corregir el bug #1, un nodo descendiente dejaba de verse obsoleto solo porque su padre había vuelto a ser consistente con su propia config — aunque el descendiente nunca se hubiera vuelto a ejecutar contra la salida *nueva* del padre.** Escenario real: se edita el nodo A (queda obsoleto, y B, su hijo, también por propagación); se ejecuta "Solo este nodo" sobre A (que no re-ejecuta a B a propósito, es su función); A vuelve a estar fresco — pero B sigue mostrando el resultado de la corrida *anterior* de A, no de la que acaba de terminar. Con la sola señal de "¿mi config actual difiere de mi última foto?", B ya no calificaba como obsoleto porque ni su config ni la de A (ahora fresca) habían cambiado, y la propagación BFS partía de un conjunto vacío. Corregido añadiendo un número de secuencia monótono por corrida (`runSeqCounterRef`, incrementado una vez por invocación de `startRun`, no por nodo): un nodo también se marca obsoleto si el `seq` de su padre directo es mayor que el suyo propio — es decir, "mi padre terminó una corrida más reciente que la mía", una señal independiente de si la config del padre está actualmente a la deriva. Una corrida "Ordenar todo"/"Desde aquí" que toca a ambos en una sola invocación les asigna el mismo `seq`, así que no se disparan falsos positivos entre nodos que corrieron juntos.

**Validación** (mismo método que Fases 0 y 1-3: proyecto descartable con servidor standalone, Vite dev + override de puerto en `api.js` revertido al terminar; toda interacción vía DOM/eventos reales — clics de React genuinos, `DataTransfer`/`DragEvent` sintéticos para arrastrar-y-soltar, o el gesto de arrastre real del ratón para mover nodos — nunca simulando el resultado):

- **"+" del nodo** → abre el selector de tipos (28 tipos listados, categoría "Fuentes" correctamente excluida) → elegir un tipo crea el nodo, lo conecta desde el nodo origen, lo posiciona a su derecha respetando colisión, y abre su configuración automáticamente — confirmado con el conteo de nodos/aristas antes/después y las coordenadas reales del DOM.
- **Soltar desde la paleta con un nodo seleccionado** → confirmado que se auto-conecta desde el nodo seleccionado (no desde cualquier otro) y que el nudge de colisión empuja el nodo nuevo a la fila de abajo cuando la posición calculada cae encima de un nodo existente.
- **Soltar sobre una arista existente** → confirmado que la arista original desaparece y se reemplaza por dos (origen→nuevo, nuevo→destino), con el nodo nuevo posicionado en el punto de soltado — no en la posición incremental que usaría si no hubiera arista debajo.
- **"Ordenar todo" + Deshacer** → confirmado con un nodo movido a mano primero: "Ordenar todo" lo reubica según el layout jerárquico, y "Deshacer" restaura exactamente la posición manual anterior (no la posición pre-layout genérica), en un flujo atómico para evitar el auto-cierre del toast entre pasos.
- **Búsqueda de la paleta** — confirmado visualmente (capturas), ya en la validación de la sesión donde se implementó.
- **Insignia "outdated" + propagación** — confirmado que editar la config de un nodo con resultado exitoso lo marca obsoleto a él y a todo lo alcanzable río abajo (nunca río arriba); que un nodo `pending`/`skipped` no muestra la insignia aunque esté en el conjunto obsoleto (no tiene un resultado que desmentir); y, tras el fix del bug #2, que re-ejecutar solo el nodo padre dejarlo fresco a él pero mantiene obsoleto al hijo hasta que una corrida que lo alcance ("Ordenar todo"/"Desde aquí"/completa) lo incluya.
- **Preservación de estado en corridas parciales** — confirmado que ejecutar "Solo este nodo" sobre un nodo no borra el badge de éxito/fallo de nodos fuera de su alcance (antes del fix, el primer `poll` de la corrida parcial los volvía a "pending" instantáneamente).

**Hallazgo de metodología, no de la app**: durante la validación, los clics vía coordenada/ref sobre "Más acciones" (`NodeActionMenu`) y el "+" (`NodeTypePicker`) parecían no abrir nada, mientras "Configurar" sí abría con el mismo método. La causa no era un bug de la aplicación: ambos popovers cierran al detectar un `mousedown` de captura fuera de sí mismos (comportamiento correcto e intencional — "Configurar" no tiene ese cierre porque solo se cierra con su botón X), y el tiempo real transcurrido entre el clic (una llamada de herramienta) y la comprobación posterior (otra llamada de herramienta separada) era suficiente para que ese cierre automático ya hubiera ocurrido. Confirmado ejecutando clic + verificación dentro del mismo script atómico. Sirve como nota metodológica para sesiones futuras: nunca inferir "no abrió" de dos llamadas de herramienta separadas cuando el componente en cuestión tiene cierre por clic-afuera.
