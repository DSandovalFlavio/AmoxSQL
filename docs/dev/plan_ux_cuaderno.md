# Plan — el cuaderno, usado por primera vez

Auditoría de diseño (UX y UI), de rendimiento y una prueba de usabilidad del cuaderno
(`.sqlnb`), hecha el 2026-11-18 sobre la 6.0.1 en curso (rama `claude/6-0-1-barra`). Sigue a
`plan_notebooks.md` (el rediseño, fases 0–6) y **no reabre sus decisiones**: la vista
implícita, el alto fijo como base del desplazamiento, «Refresh» por orden de dependencia y el
estado visual aparte se dan por buenos. Lo que aquí se mira es **qué encuentra alguien que
abre un cuaderno por primera vez**, y qué cuesta tenerlo abierto.

Cada punto se marca `[x]` hecho, `[~]` hecho con desviación (anotada aquí) y `[ ]` pendiente.

---

## Cómo se hizo

- **La prueba**: la app real (Vite + servidor con un `AMOXSQL_HOME` temporal, proyecto
  `tienda-electronica` de los ejemplos), ventana de 1440×900 con el explorador de archivos
  abierto, como lo usa una analista. Se hizo el recorrido de alguien que **no conoce los
  cuadernos**: crear uno, escribir una consulta, ejecutarla, leer la siguiente celda desde la
  anterior, equivocarse, escribir texto, hacer un gráfico, leerlo, usar un parámetro, cambiar
  de pestaña y volver. En cada paso se anotó qué esperaba y qué pasó.
- **El rendimiento**: tareas largas (`PerformanceObserver` de `longtask`), cuenta de pintados
  por componente y anchos medidos en el DOM. Con 10 celdas de 30 filas.
- **El código**: `cuaderno/*`, `SqlEditor.jsx`, `ResultsTable.jsx`, el estado por pestaña.

## Lo que ya se arregló en la 6.0.1

Salió de la queja que abrió esto («con 10 celdas la navegación va a tirones y al cambiar de
pestaña se pierden los resultados») y ya está en la rama:

- [x] Abrir o cerrar la barra lateral: **130–280 ms de bloqueo por clic → 0**. Los editores
      ya no miden el DOM (`automaticLayout` fuera; el tamaño llega del `ResizeObserver`), en
      el cuaderno sólo se reajusta el que se ve y al terminar, y las celdas lejos de la vista
      llevan `content-visibility: hidden` sin desmontarse (`useLejos`).
- [x] Escribir en una celda o abrir el panel Data ya no vuelve a pintar las diez
      (callbacks fijos, análisis por celda reutilizado si su SQL no cambió).
- [x] Cambiar de pestaña conserva celdas, resultados, ejecuciones, la vista de cada celda
      (tabla / gráfico) y el modo lectura (`memoriaDePestana.recordarCuaderno`).

---

## La prueba de usabilidad: lo que esperaba y lo que pasó

Escrita como la cuenta quien lo usa por primera vez.

| # | Paso | Lo que esperaba | Lo que pasó | Gravedad |
|---|---|---|---|---|
| U1 | Pantalla vacía → «SQL Notebook» | Un documento en blanco con su título | Dos títulos: **«Untitled»** arriba y una celda de texto **«New Notebook»** debajo. ¿Cuál es el nombre? | Media |
| U2 | Mirar el cuaderno nuevo | Que me diga qué es esto y qué lo hace distinto de un `.sql` | Una celda `SELECT 1;`. Nada explica que cada celda deja una vista con nombre, que es la gracia del formato | Alta |
| U3 | Barra derecha | Mi índice y mis cosas | «Also in the session: c1 … c10» — **vistas de otro cuaderno** que no hice yo | Media |
| U4 | El botón destacado de arriba | «Ejecutar todo» | **«Refresh 1»**. Refrescar ¿qué? Lo entendí al pasar el ratón | Media |
| U5 | Escribir una consulta normal | Verla entera | El editor mide **240 px** (el resultado 360 px, en una celda de 609). Una línea de 78 caracteres no se ve: hay que desplazarse en horizontal | **Alta** |
| U6 | Ctrl+Enter | Ejecuta | Ejecuta. Bien. Pero **la lista de autocompletado se queda abierta encima del resultado** | Media |
| U7 | Shift+Enter (lo que hacen todos los cuadernos) | Ejecuta y baja a la siguiente | **Mete un salto de línea** | Alta |
| U8 | Ctrl+Shift+Enter («Run all cells» en la ayuda de atajos) | Ejecuta todo | **Mete un salto de línea** y marca la celda como editada. El atajo anunciado no existe dentro del editor | **Alta (fallo)** |
| U9 | Añadir otra celda | Un botón cerca de donde estoy, o un atajo | «+ SQL / + Text» al final de la lista o en el hueco entre celdas (bien), sin atajo de teclado | Baja |
| U10 | `FROM paso_1` en la segunda celda | Que funcione | Funciona, y la primera celda ya se llama `paso_1`. Pero no lo habría sabido sin leer la documentación | Media |
| U11 | Un resultado de 4 filas | Una celda del tamaño de su resultado | La celda mide **520 px** siempre: ~250 px vacíos debajo de 4 filas | Media |
| U12 | Equivocarme en una columna | El error, y la línea marcada | El error dice **«LINE 2»** aunque escribí una sola línea (la celda envuelve el SQL en una vista). Nada se marca en el editor. «Candidate bindings: "categoria"» y no hay un clic para corregirlo; sólo «Fix with Assist» | Alta |
| U13 | Celda de texto, Escape para terminar | Que se muestre formateada | Escape no hace nada; sólo al pulsar fuera | Media |
| U14 | «Chart» en la primera celda | Un gráfico legible | Sale solo (bien), pero **al 35 % de zoom** en 360 px: no se leen las etiquetas; el carril de paneles de Story Flow y los tamaños (4:3, 16:9…) se apretujan | Alta |
| U15 | El gráfico | En el orden de mi `ORDER BY venta DESC` | **Ordenado alfabéticamente**: Auriculares, Cargadores, Electrodomésticos… | Media |
| U16 | «Reading» | Un documento limpio | Bien en general. Pero la celda que falló sale con **el error crudo del motor**, los pies de figura dicen **«paso_2»** y bajo el gráfico hay una barra de desplazamiento horizontal | Media |
| U17 | Un parámetro `{{anio}}` sin declarar | «A `anio` le falta un valor» | **«Parser Error: syntax error at or near "{"»**. La barra derecha sí ofrece «+ Declare anio», abajo del todo | Alta |
| U18 | Parámetros | Una sola forma | El cuaderno usa `{{anio}}` y la 6.0 trae variables de proyecto `$anio`, que también funcionan en las celdas. Dos sintaxis para lo mismo | Media (decisión) |
| U19 | Menú «…» de una celda | Duplicar, convertir a texto, limpiar el resultado | Assist, materializar, borrador, mover, borrar. No hay duplicar, convertir, insertar arriba/abajo, plegar ni limpiar el resultado | Media |
| U20 | Cambiar entre código / resultado / ambos | Ver las opciones | Un botón de icono que **rota** entre los tres modos; hay que adivinar el siguiente | Baja |
| U21 | Cambiar de pestaña y volver (cuaderno sin guardar) | Todo igual | El gráfico volvía a tabla. **Arreglado en la 6.0.1** | — |

**Lo que funciona bien y hay que conservar**: que la celda se bautice sola y la siguiente la
lea; el punto de estado (al día / editada / falló / nunca); el aviso «2 are missing» de la
barra; «Fix with Assist» junto al error; el índice que se mantiene solo; el modo lectura; que
el primer gráfico salga sin configurar nada.

---

## Análisis de diseño (UI)

1. **La celda parte el ancho en dos y el código pierde.** Con explorador y barra derecha
   abiertos, una celda mide ~610 px y el editor se queda con 240. Todo cuaderno que una
   analista conoce pone **el código arriba y el resultado debajo**; el lado a lado sólo
   compensa con más de ~1000 px de celda. Hoy el apilado sólo ocurre con la ventana por debajo
   de 1080 px (`Celda.jsx`, `window.innerWidth <= 1080`), es decir, depende de la ventana y
   no de la celda.
2. **El alto fijo de 520 px** sirvió para que el desplazamiento no salte (`useCerca.js`), y
   esa razón sigue en pie, pero el alto **se puede saber sin montar nada**: ya se calcula
   con la cuenta de filas en el modo lectura (`altoDeLectura`). Usar lo mismo al editar
   (con el editor apilado: líneas del SQL + filas, tope 520) conserva la promesa y quita los
   huecos.
3. **Tres jerarquías compiten arriba**: título del documento, acciones (Reading · Refresh ·
   Save · Word · Deck · Assist · ?) y la celda de texto «New Notebook». Una sola cabecera:
   el título, y la celda de texto inicial fuera.
4. **La barra derecha no se puede plegar** y ocupa ~250 px fijos; en un portátil es la
   diferencia entre una celda legible y una apretada.
5. **El gráfico dentro de la celda hereda el constructor entero de Story Flow** (carril de
   paneles, tamaños, zoom). En 360 px no cabe: el gráfico de una celda debería ocupar **el
   ancho de la celda** y dejar el constructor para «Take the whole tab».
6. **Controles sin texto**: modo de la celda (rota), «?» del tour, pin de vistas. Lucide
   está bien, pero los que cambian lo que se ve necesitan nombre o un grupo segmentado.

## Análisis de rendimiento (lo que queda)

| # | Medido | Por qué | Propuesta |
|---|---|---|---|
| R1 | Volver a la pestaña del cuaderno: **~210 ms** de tareas largas con 4 celdas (una con gráfico); con 10, repartido en turnos | El cuaderno se desmonta al salir y se monta al volver; cada panel de resultados cuesta 60–90 ms fijos (`plan_notebooks.md`, deuda) | Mantener montada la última pestaña pesada (cuaderno, Canvas) oculta con `content-visibility: hidden`: volver sería instantáneo. Coste: memoria de una pestaña |
| R2 | Panel de resultados: 60–90 ms fijos al montarlo | Se arma la barra, el buscador, el menú y los paneles aunque no se usen | Diferir la barra de herramientas hasta el primer `hover`/foco de la celda, y el menú Save/Share hasta abrirlo |
| R3 | Cada celda guarda **todas** sus filas en memoria (hasta el tope) | `resultados[id].data` | Guardar en el cuaderno las primeras 1 000 filas; la vista ya existe, así que «ver todo» la lee entera bajo demanda |
| R4 | Un cuaderno de 100+ celdas: nada se suelta nunca | Decisión consciente de `useCerca` | Con `content-visibility` ya no cuesta pintar; queda la memoria. Soltar el editor de una celda lejos más de N minutos (el modelo sigue en `memoriaDePestana`, la historia de deshacer no se pierde). Sólo cuando exista un cuaderno así |
| R5 | Gráfico en celda: se dibuja a tamaño de lienzo y se escala al 35 % | El lienzo de Story Flow tiene tamaños fijos | Con U14 resuelto (gráfico al ancho de la celda) se dibuja a su tamaño real |

---

## El plan

Ordenado por lo que más le cuesta a quien empieza. Cada fase se entrega sola.

### F0 — Fallos que se ven en el primer minuto (pequeña)

- [x] **Ctrl+Shift+Enter ejecuta todo** también con el foco en el editor (U8): la acción de
      Monaco en `SqlEditor` cuando hay `onRunAll`, o `atajosEnMonaco.js`. Prueba en
      `probarInteraccion.mjs`.
- [x] **Cerrar el autocompletado al ejecutar** (U6): `editor.trigger('', 'hideSuggestWidget')`
      en la acción de ejecutar.
- [x] **Escape termina la celda de texto** (U13), y Ctrl+Enter también: `CeldaTexto.jsx`.
- [x] **La línea del error es la de la celda** (U12): restar las líneas del envoltorio de
      `vistaDeCelda.js` al `LINE n` del mensaje, y marcar esa línea en Monaco
      (`setModelMarkers`).
- [x] **Parámetro sin valor, antes de ejecutar** (U17): si la celda usa `{{x}}` y `x` no está
      declarado, no se manda al motor; la celda dice «`anio` has no value» con un campo para
      darle uno ahí mismo.
- [x] **Plantilla del cuaderno nuevo** (U1): sin la celda «# New Notebook», con el foco en el
      título y en el formato actual (hoy se escribe con los marcadores antiguos `-- !CELL:`,
      `LayoutManager.jsx:1452`).
- [x] **Lectura sin errores crudos** (U16): una celda que falló se ve como «This step failed
      — Edit to see why», o no se ve.

### F1 — La celda que se lee (mediana)

- [x] **Código arriba, resultado abajo por defecto** (U5) cuando la celda mide menos de
      ~1000 px, medido en la celda (no en la ventana). El lado a lado sigue a mano con el
      control de modo y se recuerda por celda. **Decisión del autor**: ¿apilado siempre por
      defecto, o sólo bajo ese ancho?
- [x] **Alto por contenido** (U11): líneas del SQL + filas del resultado (cabecera 44, fila
      28, pie 21, ya medidas), con tope de 520 y mínimo de ~160. Se sigue sabiendo sin
      montar, así que el desplazamiento no salta.
- [ ] **Gráfico al ancho de la celda** (U14, R5) sin el constructor; «Edit chart» abre la
      celda en pantalla completa con Story Flow entero.
- [ ] **El gráfico respeta el `ORDER BY`** (U15) cuando el eje X es una categoría y los datos
      ya vienen ordenados por la medida (`deStoryFlow.js`, `columnas.js`). Afecta también a
      los `.sql`, así que se prueba en `probarGraficos.mjs`.
- [ ] **Barra derecha plegable** (UI 4), recordada por usuario.
- [ ] **Modo de la celda como grupo de tres** (U20): Code · Both · Result.

### F2 — Ejecutar como en un cuaderno (mediana)

- [x] **Shift+Enter**: ejecuta y pasa a la celda siguiente (crea una al final). **Alt+Enter**:
      ejecuta e inserta una debajo (U7). En `atajos.js` y en la ayuda.
- [ ] **«Refresh» pasa a «Run all»** con el número de pendientes (U4); el tooltip sigue
      explicando el orden por dependencias. Si se prefiere conservar «Refresh», al menos
      «Run what changed (2)».
- [x] **Menú de la celda completo** (U19): duplicar, convertir SQL ↔ texto, insertar arriba /
      abajo, limpiar el resultado, plegar el resultado.
- [ ] **«Run with what it needs»**: ejecutar una celda junto con las de arriba de las que
      depende y que no están al día (el grafo ya lo sabe: `queActualizar` limitado a sus
      ancestros).

### F3 — Los errores que ayudan (pequeña)

- [ ] **«Did you mean `categoria`?»** (U12): cuando el motor da «Candidate bindings», un clic
      reemplaza la palabra en la celda. Sin IA.
- [ ] **Una tabla o vista que no existe** apunta a la celda que la crea si está en el
      cuaderno («`paso_3` is created by cell 3, which has not run — Run it»).
- [ ] **Autocompletar `{{` con los parámetros** declarados, y hover con su valor.

### F4 — El primer uso (pequeña)

- [ ] **Cuaderno vacío que enseña** (U2, U10): bajo la primera celda, una línea discreta que
      desaparece tras la segunda ejecución: «Each cell leaves a view with its name. The next
      cell can read `FROM paso_1`.» Y el tour `notebooks` ofrecido con `ofrecerTour` la
      primera vez (nunca abierto solo).
- [ ] **Nombre sugerido** (U16): al ejecutar sin nombre, proponer uno desde la consulta
      (`ventas` + `GROUP BY categoria` → `ventas_por_categoria`) en vez de `paso_N`. En
      lectura, el pie de figura usa el comentario de la celda y, si sólo hay un nombre
      automático, no lo enseña.
- [x] **«Also in the session» plegado por defecto** (U3), con el número; sus vistas son de
      otros cuadernos.

### F5 — Rendimiento, segunda vuelta (mediana)

- [ ] **R1** la última pestaña pesada se queda montada y oculta. Medir antes y después la
      vuelta a la pestaña; criterio: sin tareas largas al volver.
- [ ] **R2** abaratar el montaje del panel de resultados (beneficia a los `.sql`).
- [ ] **R3** tope de filas guardadas por celda, con «ver todo» desde la vista.
- [ ] Un banco reproducible en `scripts/medirCuaderno.mjs` (10 y 50 celdas): barra lateral,
      cambio de pestaña, escribir, ejecutar todo. Que esta auditoría se pueda repetir.

### F6 — Teclado (opcional, para quien viene de otros cuadernos)

- [ ] Modo de comando: Escape sale del editor sin perder la celda seleccionada; ↑/↓ mueve la
      selección; Enter entra a editar; A/B insertan arriba/abajo; D D borra (con deshacer).

---

## Hecho en la 6.0.1 (2026-11-18)

F0 entera; de F1, el apilado (siempre por defecto: lo decidió el autor; lado a lado queda en el
menú de cada celda) y el alto por contenido; de F2, Shift/Alt+Enter y el menú (duplicar,
convertir, limpiar, lado a lado; faltan insertar arriba/abajo y plegar); de F4, la pista del
cuaderno sin ejecutar (en una línea fija, no en el tour) y «Also in the session» plegado.
Además, la celda nueva se centra con el cursor dentro, y tres fallos que salieron al probar:
los atajos de `SqlEditor` (`addCommand` sin contexto) respondían en el último editor creado,
«Fix with Assist» del cuaderno llamaba al `emitir` del documento en vez del de eventos, y
«Refresh» contaba celdas vacías. Suite: `scripts/probarErroresCelda.mjs`.

## Decisiones que son del autor

1. **Apilado o lado a lado por defecto** (F1). Mi recomendación: apilado bajo ~1000 px de
   celda, que es casi siempre con la barra lateral abierta.
2. **«Refresh» o «Run all»** (F2).
3. **Una sola sintaxis de parámetro** (U18). Ya estaba anotada como deuda en
   `plan_notebooks.md`; con las variables `$nombre` de la 6.0 la confusión es mayor. Lo
   mínimo: que la celda complete y explique las dos, y que la documentación diga cuándo usar
   cada una.
4. **Memoria contra velocidad** en R1 (cuántas pestañas pesadas se quedan montadas).

## Orden recomendado

F0 → F1 → F2 son las que cambian la primera impresión, y F0 se puede publicar en la 6.0.1
junto con lo ya hecho. F3 y F4 son pequeñas y van bien juntas. F5 y F6 cuando haga falta.
