# Plan — el cuaderno, repensado

Este documento es **el plan y la bitácora a la vez**. Cada punto se marca `[x]` cuando está
hecho, `[~]` cuando está hecho con desviación —y entonces la desviación se escribe aquí
mismo— y `[ ]` mientras esté pendiente.

Sale de `auditoria_notebooks.md` (70 preguntas por perfil) y de
`mockup_notebooks.html` (el contrato visual, con las medidas).

## La frase

> **Cada celda deja algo con nombre, y tú no escribes el `CREATE`.**

Todo lo demás es consecuencia. Si al final de todo esto sigue habiendo que escribir
`CREATE OR REPLACE TEMP VIEW` a mano, no hemos hecho nada: eso es exactamente lo que impide
hoy que la única característica diferencial del formato se use.

---

## Los cuatro hallazgos que ordenan el plan

### 1. El equivalente al dataframe ya existe y la interfaz no lo cuenta

AmoxSQL mantiene **una conexión viva** (`DatabaseManager.js:31`), así que el estado de
sesión se acumula entre celdas. Medido: una vista temporal creada en una celda sobrevive,
se lee en la siguiente y se encadena en una tercera. **`ventas_limpias` es el dataframe** —
sólo que nadie lo sabe porque hay que escribir cinco líneas de ceremonia para tenerlo.

### 2. Lo que hace falta ya está en el motor, y se comprobó antes de diseñar

| Se probó | Resultado |
|---|---|
| Envolver un `SELECT` en `CREATE OR REPLACE TEMP VIEW` + leerlo, **en una llamada** | funciona |
| `COMMENT ON VIEW` y volver a leerlo con `duckdb_views()` | **funciona** |
| Envolver algo que no sea `SELECT` (`CREATE TABLE`, `COPY`…) | **falla** — hay que condicionarlo |
| Listar sólo las del usuario | `WHERE temporary AND NOT internal` |

El del comentario es el que más vale: **la descripción de un paso no se queda en nuestro
archivo, vive en la base**, y el explorador de esquema la ve.

### 3. El desplazamiento vertical no sobraba

La primera versión de este rediseño lo quitaba entero —«un paso a la vez»— y eso era
absolutista. En pleno análisis hace falta echar la vista atrás a ver qué clasificó aquel
`CASE` o qué filtró aquel `WHERE`. **La lista se queda**; lo que se arregla es que las
celdas midan lo mismo y que haya una vía de escape a pantalla completa.

### 4. Una vista es perezosa, y eso cambia el significado del estado

Una vista no guarda datos: leerla reejecuta su cadena. Casi siempre da igual en este motor,
pero con una tabla grande de por medio se nota. De ahí el interruptor de **materializar**
(tabla temporal), que no es sólo rendimiento: **una vista nunca puede quedarse vieja**
porque siempre refleja el origen; una materializada sí, y por eso se marca.

---

## El orden, y por qué

1. **El formato y lo que se deduce de una celda** (fase 0). Puro, probado desde Node, y de
   él dependen tres fases posteriores.
2. **La celda** (fase 1). Es donde todo se vuelve visible; sin ella lo demás no se ve.
3. **La vista implícita** (fase 2). La característica diferencial.
4. **La barra derecha** (fase 3). Hace visible lo que la 2 construye.
5. **El grafo y Actualizar** (fase 4). Necesita nombres, o sea la 2.
6. **Pantalla completa** (fase 5). Barata una vez existe la celda.
7. **La limpieza** (fase 6). Quitar lo que ha quedado duplicado.

---

## Fase 0 — El formato y el análisis de la celda

Sin esto las demás no tienen dónde apoyarse. **Todo en esta fase es puro y se ejercita
desde Node**, que es lo que permite que la lógica que no puede fallar no dependa de abrir
la aplicación.

- [x] **`cuadernoFile.js`** — el archivo: front-matter más celdas en markdown, como el deck
      y el diagrama. Lee el formato nuevo **y los tres viejos** (JSON v3, v2 y los
      marcadores `-- !CELL:`).
- [x] **Serializador estable.** Leer y volver a escribir sin tocar nada devuelve el mismo
      texto, y una segunda vuelta tampoco lo mueve.
- [x] **`celdaSql.js`** — `envolvible`, `comentario`, `lee`, `escribe`, `vistaPropia`.
- [x] Pruebas desde Node: **70** en `probarCeldaSql.mjs` y **42** en `probarCuaderno.mjs`.

**Criterio cumplido:** la plantilla exacta que la aplicación crea hoy —la de los marcadores,
`LayoutManager.jsx:1144`— se abre, se convierte al formato nuevo, y releerla devuelve lo
mismo. Y de una consulta realista salen su descripción, lo que lee y que no escribe.

### Lo que se decidió por el camino

**`escribe` no es un sí o un no, son tres valores:** `no`, `sesion` y `disco`. La pregunta
63 de la auditoría era «¿avisa si un paso escribe en la base?», pero **no es lo mismo una
tabla temporal que una real**: la primera se va al cerrar y la segunda se queda. Con un
booleano, la celda tendría que avisar igual de las dos, y un aviso que sale siempre deja de
leerse.

**Lo que no se reconoce se trata como si escribiera.** Es la suposición que no hace daño:
callarse un `CREATE` sería peor que avisar de más sobre un `SELECT` raro.

**Las celdas de «Input» desaparecen al convertir.** Eran un parámetro disfrazado de celda:
al leer un `.sqlnb` viejo suben al front-matter como parámetros de verdad y dejan de ocupar
sitio en el cuerpo. Es la única conversión que **cambia la forma** del documento, y es a
mejor.

**Un archivo que no se entiende se abre como texto**, no se rechaza. Perder el archivo de
alguien por no reconocer su forma sería el peor fallo posible de esta fase.

### La dirección del error no es simétrica, y el código se inclina a propósito

En `lee` —que es el grafo de dependencias— los dos fallos posibles no valen lo mismo:

- **Inventarse una dependencia** marca algo como desactualizado sin serlo: se recalcula de
  más. Molesto e inofensivo.
- **Perderse una dependencia** deja un número viejo con pinta de nuevo, y ese número acaba
  en un informe. **Ése sí hace daño.**

Por eso, ante la duda, se añade el nombre en vez de descartarlo, y sólo se quitan los tres
casos de los que hay certeza: subconsultas, llamadas a función y los nombres definidos en el
`WITH` de la propia consulta.

### El fallo que las pruebas no cazaron

Con las 63 comprobaciones en verde, pasé por el lector una consulta **realista** —de las que
escribe alguien aquí— y salió mal:

```sql
SELECT region, sum(costo) FROM 'Data/dataset.csv' JOIN campanas c ON c.id = id
```

`lee` devolvía `["JOIN", "campanas"]`. Al enmascarar, el literal `'Data/dataset.csv'` deja
un hueco de espacios, y el escáner se saltaba el hueco y se tragaba la palabra siguiente
como si fuera una tabla.

Lo que falla aquí no es el código: **son mis pruebas.** Había cubierto comillas escapadas,
cadenas con dólar y comentarios dentro de literales —los casos raros que se me ocurrieron—
y me había saltado **el caso más común de esta aplicación**, que es consultar un CSV
directamente. Arreglado con una lista de palabras que nunca son un nombre de tabla, y
añadidas las siete comprobaciones que faltaban.

**La lección, que ya salió en el plan de archivos:** escribir la prueba y escribir el código
es el mismo acto mental, así que los dos comparten los mismos puntos ciegos. Lo que los
rompe es meter una entrada que no ha inventado uno mismo.

### Lo que no se hizo, y por qué

**Las dependencias de archivo no entran en el grafo.** `FROM 'ventas.csv'` es una
dependencia real, pero de un archivo, no de un paso — y el grafo de esta fase existe para
saber qué celda depende de qué celda. Queda anotado: con el vigilante de archivos que se
construyó en la iniciativa anterior, **marcar una celda como desactualizada porque cambió el
CSV que lee es una continuación natural**, y las dos piezas ya existen.

---

## Fase 1 — La celda

- [x] Celda de **280 px fijos**: cabecera de 36 y cuerpo de 244. El desglose está en el
      contrato visual; en corto, son doce líneas de SQL y ocho filas de resultado — lo justo
      para **reconocer** un paso al pasar.
- [x] **Editor a la izquierda, resultado a la derecha**, con tirador de 7 px y el reparto
      recordado **por celda**, no por documento.
- [x] **Mando de tres posiciones**: código y resultado / sólo código / sólo resultado. Se
      recuerda, y con él se recuerda si el resultado estaba en tabla o en gráfico.
- [x] Cabecera: punto de estado, nombre, descripción, y los mandos.
- [x] Celda de **texto**: se ajusta al contenido con **280 de tope**. Un encabezado suelto no
      reserva 280 px de vacío; un texto largo no empuja el cuaderno fuera de la pantalla.
- [~] **Se monta el `SqlEditor` del `.sql`**; del lado del texto va **lo mínimo** y no el
      `MarkdownEditor` entero. Ver «Lo que se desvió» más abajo.

**Criterio de terminado:** un cuaderno con seis celdas se recorre, todas miden lo mismo, y
el mando de tres posiciones funciona y se recuerda al cerrar y abrir.

### Bitácora

`client/src/components/cuaderno/`: `CuadernoEditor.jsx` (el contenedor), `Celda.jsx`,
`CeldaTexto.jsx`, `claves.js`, `modos.js` y `cuaderno.css`. `EditorPane.jsx` monta el
cuaderno nuevo en la rama de `.sqlnb`; el componente anterior sigue en el árbol hasta la
fase 6.

Medido en la aplicación con un `.sqlnb` del formato viejo: las celdas de código miden
**exactamente 280**, la de texto 172 —se ajusta, por debajo del tope—, el mando pasa de tres
columnas a una y la altura no se mueve, y al ponerle nombre a una celda el archivo se
reescribió en el formato nuevo.

### Lo que se desvió, y por qué

**El editor de markdown completo no cabe en una celda.** Trae tres columnas, índice, modo
concentración y su propia barra; dentro de 280 px se vería el cromo y no el texto. En la
celda va lo mínimo —leer o escribir— y el editor entero se monta en la pantalla completa
(fase 5), que es donde hay sitio. Es la misma idea que el resto del rediseño: en la lista se
reconoce, y para trabajar de verdad se pide espacio.

Sí se trae **su hoja de estilos**, para que el markdown se vea igual en todo el producto.
Sin ella salía una almohadilla suelta delante de cada encabezado: es el ancla del título,
que allí se oculta hasta pasar el ratón con una regla que la celda no cargaba.

### El estado se guardaba con una clave que se inventaba en cada apertura

El primer `.state.json` que escribió el cuaderno quedó así:

```json
{ "celdas": { "cmu485aadd": { "vista": "chart", "grafico": { ... } } } }
```

Ese identificador **no está en el archivo**: se genera al leerlo, así que cambia cada vez
que se abre. Guardar el estado bajo él equivale a no guardarlo — el gráfico que alguien
configuró hoy aparecería mañana como una tabla, sin error y sin nada que relacionar con la
causa. Y la promesa de guardar «por identidad, no por posición» era justo lo que el plan le
reprochaba a la notebook anterior.

La clave pasó a ser **el nombre de la celda**, y la posición sólo mientras no tenga uno.
Pero entonces añadir, borrar, mover y renombrar corren las posiciones, así que toda
modificación del documento **reclava** el mapa: `claves.js` lo hace en una función pura, y
`emitir` la llama en el único sitio por el que pasan los cuatro casos, en lugar de un parche
por operación. `scripts/probarClavesCuaderno.mjs` los cubre con 18 comprobaciones, incluida
la que describe el fallo de siempre: mover una celda una fila hacia arriba no debe darle el
gráfico de su vecina.

### Guardar el estado borraba del disco el trabajo de la notebook anterior

El endpoint `/api/notebook-state` **reescribe el archivo entero**, no fusiona. El cuaderno
guarda lo suyo bajo `celdas`, pero el mismo archivo lleva el `cells` de la notebook de
siempre, con sus gráficos ya configurados: escribir sin conservarlo los habría borrado, y
quien abriera su cuaderno de siempre habría perdido ese trabajo por el mero hecho de
abrirlo. Un comentario en el código llegó a afirmar que los dos formatos «pueden convivir»,
lo cual era falso tal y como estaba escrito.

Ahora el editor se queda con lo que no es suyo al leer y lo devuelve intacto al escribir.
Comprobado contra el servidor en marcha: tras guardar, el `cells` sigue en el archivo, letra
por letra.

### Lo que no se pudo comprobar con las manos

El acceso a la pantalla estaba denegado al cerrar la fase, así que «se recuerda al cerrar y
abrir» se comprobó por sus tres tramos —el `GET` y el `POST` contra el servidor vivo, las
claves que el editor calcula para ese archivo, y la lectura `estados[claves[c.id]]` del
render— y no haciendo clic. **Es una comprobación más floja**: en esta misma iniciativa ya
hubo funciones que compilaban, pasaban el linter y no se veían.

---

## Fase 2 — La vista implícita

La fase que justifica el formato.

- [x] Al ejecutar una celda envolvible, se manda **en una sola llamada**:
      `CREATE OR REPLACE TEMP VIEW <nombre> AS (…)`, el `COMMENT ON VIEW` con la
      descripción, y el `SELECT` que trae las filas.
- [x] **Nombre por omisión** y renombrado en el sitio desde la cabecera.
- [x] **La descripción sale del comentario de arriba** de la consulta, y va al motor.
- [x] Los tres bordes, cada uno con su salida:
      - **No envolvible** → se ejecuta tal cual y la celda dice **«no deja vista»**, sin
        drama y sin error.
      - **Ya trae su `CREATE … VIEW`** → se respeta, y el nombre de la celda pasa a ser ése.
      - **El nombre choca** con algo del esquema → se avisa **antes** de ejecutar. Tapar una
        tabla real en silencio sería peor que fallar.
- [x] Interruptor de **materializar** (tabla temporal en vez de vista).
- [x] La celda avisa si **escribe** en la base — el dato ya lo da la fase 0.

**Criterio de terminado:** se escribe un `SELECT` con un comentario encima, se ejecuta, y la
siguiente celda puede escribir `FROM <nombre>` sin que nadie haya escrito un `CREATE`.

### Bitácora

`client/src/utils/vistaDeCelda.js` compone lo que se manda —puro, con 40 pruebas en
`scripts/probarVistaDeCelda.mjs`—, y el servidor recibe dos rutas nuevas:
`POST /api/cuaderno/celda` y `GET /api/cuaderno/vistas`. La cabecera de la celda gana el
distintivo de lo que deja, el interruptor de materializar y el aviso de escritura.

El criterio se comprobó contra el servidor en marcha, con tres celdas encadenadas y sin un
solo `CREATE` escrito a mano: la segunda leyó `FROM ventas_limpias`, la tercera leyó
`FROM por_region`, y `duckdb_views()` devolvió las tres con su descripción puesta.

### Lo que se midió antes de diseñar

Todo lo de abajo se comprobó contra el motor, en una base desechable, antes de escribir el
código — no se supuso:

| Lo que se preguntó | Lo que contestó |
|---|---|
| ¿Tres sentencias en una llamada devuelven las filas de la última? | Sí |
| ¿`COMMENT ON VIEW` vale en una vista temporal y se lee? | Sí, por `duckdb_views()` |
| ¿Y en una tabla temporal? | Sí, con `COMMENT ON TABLE` y `duckdb_tables()` |
| ¿Citar siempre el nombre da problemas al leerlo sin comillas? | No; `"select"` también vale |
| ¿Los objetos temporales se ven entre vías? | **No**, son por conexión |
| Si una sentencia falla, ¿se deshacen las anteriores? | **No**, no hay transacción |

### Lo que se mandaba en una pieza, y por qué van en dos

La idea inicial era mandar las tres sentencias juntas. **No se puede**, y el motivo es el
límite de filas: `applyRowLimit` sólo recorta un texto que *empiece* por `SELECT` o `WITH`,
y ese texto habría empezado por `CREATE`. Habría pasado de largo sin recortar nada, y una
celda se habría traído la tabla entera al navegador sin que nadie lo pidiera.

Así que van dos piezas en una sola llamada: `preparacion` deja la vista y `lector` —que sí
empieza por `SELECT`— trae las filas ya recortadas. En una llamada y no en dos porque entre
dos cabría una cancelación, y la celda quedaría con la vista creada y sin filas que enseñar.

Ésta es la clase de detalle que no aparece leyendo el plan: apareció leyendo
`applyRowLimit`.

### El aviso de nombre tapado es más necesario de lo que el plan suponía

El plan decía «tapar una tabla real en silencio sería peor que fallar». Medido, resulta ser
peor de lo que sugería: una vista temporal llamada `ventas` tapa a la tabla `ventas` **y
también a `main.ventas`**. Sólo se escapa escribiendo el catálogo entero
(`memory.main.ventas`), que no lo escribe nadie.

Es decir: alguien que ejecute una celda llamada `ventas` deja, durante toda la sesión, a
cualquier consulta que diga `FROM ventas` leyendo el resultado de su celda en lugar de sus
datos. Sin error, sin aviso, y con el nombre calificado dando el mismo resultado equivocado.

Por eso el aviso llega **antes de ejecutar nada** —el servidor mira el catálogo y devuelve
`{tapado}` sin tocar la sesión— y el texto dice exactamente qué va a pasar y que nada se
borra.

### Los nombres se escriben en el documento al bautizarlos

Una celda sin nombre que se ejecuta recibe el primer `paso_N` libre, **y se escribe en el
archivo**. Podría haberse quedado en memoria, y era más discreto; pero a partir de ese
momento la vista existe de verdad en la sesión y la celda de abajo puede escribir
`FROM paso_2`. Un nombre que sólo viviera en la memoria sería una vista fantasma: real en el
motor, invisible en el documento, y perdida al reabrir.

Se busca el hueco más bajo y no se cuenta celdas, para que **el nombre no dependa de la
posición**: uno que cambiara al reordenar rompería el `FROM paso_3` de la celda de abajo.

### Lo que se adelantó de la fase 3, y por qué

`GET /api/cuaderno/vistas` y el listado de vistas vivas son material de la fase 3, pero la
cabecera de la celda los necesitaba ya: el distintivo de «deja una vista» sólo dice la
verdad si puede distinguir una vista **escrita** de una vista **viva**. Una vista existe
porque alguien ejecutó la celda, no porque esté en el documento, y pintarlas igual sería
prometer algo que la celda de abajo no podría leer. La barra que las lista sigue siendo
fase 3.

### Lo que no se pudo comprobar con las manos

Igual que en la fase 1, el acceso a la pantalla estaba denegado, así que lo de arriba se
comprobó por HTTP contra un servidor levantado aparte —nunca contra la instancia del
usuario, que tenía tomado el 3001— y no haciendo clic. Queda sin ver con los ojos: el
diálogo del nombre tapado, los distintivos de la cabecera y el interruptor de materializar.

---

## Fase 3 — La barra derecha

- [ ] **A la derecha**, 260 px fijos. El cuaderno se lee de izquierda a derecha; lo que se
      consulta de reojo va al margen que no interrumpe.
- [ ] **Índice**, construido de los `#`, `##` y `###` de las celdas de texto. Se mantiene
      solo: nadie sostiene un índice a mano.
- [ ] **Vistas vivas**, leídas **del motor** (`duckdb_views()` con
      `temporary AND NOT internal`), con su descripción, y marcando las materializadas.
- [ ] Lo que el cuaderno espera y **no está** —porque la sesión murió— se dice ahí, en vez de
      dejar que lo descubras al fallar una celda de en medio.
- [ ] **Parámetros** en su zona, y la palabra «Input» desaparece.

**Criterio de terminado:** al reabrir el cuaderno al día siguiente, la barra dice qué vistas
faltan antes de que nada falle.

---

## Fase 4 — El grafo y «Actualizar»

- [ ] Dependencias **deducidas** del `lee` de la fase 0: si una celda lee `ventas_limpias`,
      depende de la que la crea, **esté donde esté en el documento**.
- [ ] Marcar lo **desactualizado** en cascada, en la cabecera de la celda y en la barra.
- [ ] **Un botón: «Actualizar»**, que ejecuta lo desactualizado en orden de dependencia y
      **dice cuántos y en qué orden antes de empezar**.
- [ ] Se retiran *ejecutar todo*, *arriba* y *abajo*: los tres suponían que el orden de la
      pantalla es el de dependencia.
- [ ] Pruebas desde Node del grafo y del orden: **es la parte que al fallar no da un error,
      deja un número viejo con pinta de nuevo.**

**Criterio de terminado:** cambiar una celda de la que cuelgan tres marca las tres, y
«Actualizar» ejecuta esas tres y ninguna más.

---

## Fase 5 — Pantalla completa

- [ ] La celda ocupa la pestaña entera, sin desplazamiento, con **el mismo mando de tres
      posiciones**.
- [ ] «Sólo resultado» en pantalla completa es un gráfico del tamaño de la pantalla, con
      sitio para configurarlo — el estado en el que se afina una figura antes de mandarla al
      deck.
- [ ] Vale igual para las celdas de texto: ahí es donde se escribe la prosa larga.
- [ ] Se vuelve al cuaderno **por donde se estaba**.

---

## Fase 6 — La limpieza, y la documentación

- [ ] Se retiran el **modo Report** y el **export a HTML**. Duplican al deck, que lo hace
      mejor y ya tiene el puente.
- [ ] **El export a Word se queda.** Un deck se *proyecta*; un documento de Word *circula* —
      se comenta, se firma, se adjunta. El expediente de un análisis acaba muchas veces ahí.
- [ ] Documentación de usuario en `docs/es|en/editor/`, con su fila en el índice.
- [ ] Repasar `contexto_caracteristicas/` y `CLAUDE.md`: el formato cambia y ahí está
      descrito el viejo.

---

## Lo que este plan deja fuera, y por qué

- **Ejecutar otro lenguaje dentro.** El día que haga falta es otro producto, no una fase.
- **Competir con las chains.** Una tubería de producción es un grafo que corre sin nadie
  delante; esto es un análisis que alguien lee. Que no se pisen es una decisión, no un hueco.
- **Programar la ejecución.** Lo mismo.
- **Citar una cifra de una celda dentro del texto** (`{por_categoria.total}`), que se
  recalcule con ella. **Es buena y se queda anotada**, no descartada: es una función entera
  —referencias, resolución, qué pasa cuando la celda falla— y meterla aquí engordaría el
  plan sin que ninguna de las seis fases la necesite. Va después, sobre lo que quede hecho.
- **Un cuaderno de propósito general.** Es exactamente lo que se está quitando.

## Deuda que queda anotada

- **El nombre.** Si esto acaba siendo celdas que dejan vistas con nombre y saben cuándo
  están sucias, «notebook» describe la forma que estamos quitando. El producto ya tiene una
  convención —Data Flow, Story Flow, Report Flow— y **la decisión se toma con los cuatro
  nombres juntos delante**, no dentro de una fase.
- ~~**El `.state.json` y la clave del estado.**~~ Resuelto en la fase 1: la clave es el
  nombre, y la posición sólo mientras no haya nombre. Lo que sigue en pie es revisar los 500
  resultados guardados, que es un asunto distinto.
- **Aserciones con veredicto** (preguntas 52-54 de la auditoría). Es lo único que el
  ingeniero de datos pide de aquí que no cubre otra herramienta, y hoy no existe —lo que
  parecía una aserción resultó ser el campo del valor de un parámetro. Candidata clara para
  después.
- **El explorador de esquema y las vistas del cuaderno.** Ahora hay objetos temporales con
  descripción; mirar si el explorador debería enseñarlos aparte de las tablas reales.
- **El asistente no ve las vistas del cuaderno.** Medido en la fase 2: los objetos
  temporales son **por conexión**, y el asistente corre por una vía distinta de la del
  cuaderno. Así que alguien puede pedirle que mire `ventas_limpias` y recibir un «no existe»
  que es cierto desde donde él mira y falso desde donde mira la persona. No se arregla
  dentro de este plan —toca la separación de vías, que existe por buenos motivos— pero es
  una confusión garantizada en cuanto las dos funciones se usen juntas.
- **Una celda que falla a medias deja lo anterior hecho.** También medido: no hay
  transacción, así que si la vista se crea y el `SELECT` falla, la vista queda. Hoy es
  inofensivo —la vista es la que se pidió— pero conviene tenerlo presente al llegar al grafo
  de la fase 4, donde «existe» y «está al día» dejan de ser lo mismo.
