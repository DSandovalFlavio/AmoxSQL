# Auditoría de usabilidad — Data Flow (Chains)

**Fecha:** 2026-09-04
**Alcance:** interfaz del studio de chains (`client/src/components/chains/`) + los endpoints que la alimentan (`server/index.js`, `server/ChainExecutor.js`).
**Estado:** auditoría completa + plan de 6 fases. Mockup en [`mockup_dataflow_ux.html`](mockup_dataflow_ux.html).

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
