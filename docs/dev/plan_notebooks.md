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

- [ ] **`cuadernoFile.js`** — el archivo: front-matter más celdas en markdown, como el deck
      y el diagrama. Lee el formato nuevo **y los tres viejos** (JSON v3, v2 y los
      marcadores `-- !CELL:`), que ya están escritos en `notebookParser.js`.
- [ ] **Serializador estable.** Son archivos versionados: un guardado que reordena o
      reformatea convierte cada commit en ruido. Mismo requisito que en AmoxDiagram.
- [ ] **`celdaSql.js`** — lo que se deduce de la consulta de una celda, sin ejecutarla:
      - `envolvible` — ¿es **un único `SELECT`/`WITH`**? Es la condición de la fase 2.
      - `comentario` — el bloque de `--` del principio, que será la descripción.
      - `lee` — los nombres que aparecen en `FROM`/`JOIN`. **Es el grafo de dependencias.**
      - `escribe` — ¿hay `CREATE`/`INSERT`/`COPY`/`DROP`? La celda tiene que poder avisar de
        que toca el disco: hoy un `SELECT` y un `CREATE TABLE` se ven exactamente igual.
      - `vistaPropia` — ¿ya trae su propio `CREATE … VIEW`? Entonces no se envuelve.
- [ ] Pruebas desde Node (`scripts/probarCuaderno.mjs`, `scripts/probarCeldaSql.mjs`): ida y
      vuelta del formato, los tres formatos viejos, y los casos raros de SQL — comentarios
      dentro de cadenas, `WITH` encadenados, `FROM` con subconsulta, `UNION`, punto y coma
      dentro de una cadena, celda vacía, celda que es sólo un comentario.

**Criterio de terminado:** un `.sqlnb` de los de hoy se abre, se guarda en el formato nuevo
y se vuelve a abrir sin perder nada; y dada la consulta de una celda, se sabe si deja vista,
qué lee y si escribe.

### La decisión de migración, y su riesgo

El formato nuevo **reutiliza la extensión `.sqlnb`**: el lector entiende los cuatro
formatos y el guardado escribe el nuevo. La alternativa —extensión nueva— obligaría a
mantener dos editores vivos, que es peor.

**El riesgo hay que decirlo:** el primer guardado reescribe el archivo. Se avisa una vez,
con la salida de siempre —guardar una copia antes—, y los resultados no corren peligro
porque viven en el `.state.json` aparte.

---

## Fase 1 — La celda

- [ ] Celda de **280 px fijos**: cabecera de 36 y cuerpo de 244. El desglose está en el
      contrato visual; en corto, son doce líneas de SQL y ocho filas de resultado — lo justo
      para **reconocer** un paso al pasar.
- [ ] **Editor a la izquierda, resultado a la derecha**, con tirador de 7 px y el reparto
      recordado **por celda**, no por documento.
- [ ] **Mando de tres posiciones**: código y resultado / sólo código / sólo resultado. Se
      recuerda, y con él se recuerda si el resultado estaba en tabla o en gráfico.
- [ ] Cabecera: punto de estado, nombre, descripción, y los mandos.
- [ ] Celda de **texto**: se ajusta al contenido con **280 de tope**. Un encabezado suelto no
      reserva 280 px de vacío; un texto largo no empuja el cuaderno fuera de la pantalla.
- [ ] **Se monta el `SqlEditor` del `.sql`** y el `MarkdownEditor` de los documentos.
      Ninguno de los dos se construye aquí: hacerlo sería rehacer peor lo que ya está.

**Criterio de terminado:** un cuaderno con seis celdas se recorre, todas miden lo mismo, y
el mando de tres posiciones funciona y se recuerda al cerrar y abrir.

---

## Fase 2 — La vista implícita

La fase que justifica el formato.

- [ ] Al ejecutar una celda envolvible, se manda **en una sola llamada**:
      `CREATE OR REPLACE TEMP VIEW <nombre> AS (…)`, el `COMMENT ON VIEW` con la
      descripción, y el `SELECT` que trae las filas.
- [ ] **Nombre por omisión** y renombrado en el sitio desde la cabecera.
- [ ] **La descripción sale del comentario de arriba** de la consulta, y va al motor.
- [ ] Los tres bordes, cada uno con su salida:
      - **No envolvible** → se ejecuta tal cual y la celda dice **«no deja vista»**, sin
        drama y sin error.
      - **Ya trae su `CREATE … VIEW`** → se respeta, y el nombre de la celda pasa a ser ése.
      - **El nombre choca** con algo del esquema → se avisa **antes** de ejecutar. Tapar una
        tabla real en silencio sería peor que fallar.
- [ ] Interruptor de **materializar** (tabla temporal en vez de vista).
- [ ] La celda avisa si **escribe** en la base — el dato ya lo da la fase 0.

**Criterio de terminado:** se escribe un `SELECT` con un comentario encima, se ejecuta, y la
siguiente celda puede escribir `FROM <nombre>` sin que nadie haya escrito un `CREATE`.

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
- **El `.state.json` y los 500 resultados guardados.** La separación es correcta y no se
  toca, pero con celdas que ahora tienen nombre conviene revisar si la clave sigue siendo la
  del identificador de celda o pasa a ser el nombre.
- **Aserciones con veredicto** (preguntas 52-54 de la auditoría). Es lo único que el
  ingeniero de datos pide de aquí que no cubre otra herramienta, y hoy no existe —lo que
  parecía una aserción resultó ser el campo del valor de un parámetro. Candidata clara para
  después.
- **El explorador de esquema y las vistas del cuaderno.** Ahora habrá objetos temporales con
  descripción; mirar si el explorador debería enseñarlos aparte de las tablas reales.
