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

- [x] **A la derecha**, 260 px fijos. El cuaderno se lee de izquierda a derecha; lo que se
      consulta de reojo va al margen que no interrumpe.
- [x] **Índice**, construido de los `#`, `##` y `###` de las celdas de texto. Se mantiene
      solo: nadie sostiene un índice a mano.
- [x] **Vistas vivas**, leídas **del motor** (`duckdb_views()` con
      `temporary AND NOT internal`), con su descripción, y marcando las materializadas.
- [x] Lo que el cuaderno espera y **no está** —porque la sesión murió— se dice ahí, en vez de
      dejar que lo descubras al fallar una celda de en medio.
- [x] **Parámetros** en su zona, y la palabra «Input» desaparece.

**Criterio de terminado:** al reabrir el cuaderno al día siguiente, la barra dice qué vistas
faltan antes de que nada falle.

### Bitácora

`Barra.jsx` pinta las tres secciones y `vistasVivas.js` hace las cuentas, puro y con 30
pruebas en `scripts/probarVistasVivas.mjs`.

El criterio se comprobó contra el motor con un cuaderno de dos celdas con nombre y un
parámetro. Antes de ejecutar nada, la barra decía **«Vistas 0/2 — faltan 2»** con las dos
tachadas; después de ejecutarlas, «2/2» con la descripción que cada una tiene puesta *en el
catálogo*; y una vista creada desde fuera apareció en su propia sección. El parámetro entró
en la consulta y filtró la fila de agosto, que es como se sabe que entró de verdad.

### La barra dice dos verdades y antes sólo se contaba una

El documento dice qué celdas hay; **el motor dice qué se puede consultar**. Son dos cosas
distintas y nadie las comparaba. Al reabrir un cuaderno al día siguiente el documento está
intacto y la sesión vacía, y la única manera de enterarse era ejecutar una celda de en medio
y verla fallar con un «no existe» sobre una vista que el documento enseña con toda
naturalidad.

Por eso una vista declarada y no viva sale **tachada y apagada**, y el aviso va arriba de la
lista y no dentro de cada fila: se trata de enterarse de un vistazo, no de investigar.

También salen las vistas que **no** son del cuaderno. La sesión es una sola, y una vista
creada desde un `.sql` se consulta desde aquí igual de bien; esconderla haría creer que el
cuaderno es un mundo cerrado, que es justo lo que no es.

### El error que casi rompe todos los cuadernos guardados

Se escribió la sustitución de parámetros con la sintaxis `${'{'}nombre}` de las variables del
editor de consultas, por parecer «la del producto». **No lo es, para esto.** Los cuadernos
que existen y los tableros de Report Flow usan `{{nombre}}`, con una función de sustitución
compartida (`injectEnvironmentVariables`), y el cambio no habría dado ningún error: el
marcador se habría quedado sin sustituir y la consulta se habría ejecutado con él dentro.

Salió al abrir un cuaderno del formato viejo y mirar qué parámetros detectaba —ninguno—. No
lo cazó ninguna prueba porque las pruebas estaban escritas contra la convención equivocada:
comprobaban que el código hacía lo que yo creía, no lo que el producto ya hacía.

Ahora se reutiliza la función compartida tal cual, y hay una prueba que fija que la otra
convención **no** se sustituye, para que nadie la reintroduzca por simetría.

Con ella viene su trato, que la barra explica porque es fuente de confusión: **un texto entra
entrecomillado y un número tal cual**. Se escribe `f >= {{desde}}`, no `f >= '{{desde}}'`. Se
midió contra el motor que eso basta para lo normal —`LIMIT '2'`, `x > '5'` y
`fecha >= '2026-09-01'` funcionan— y que sólo se queda corto cuando el parámetro querría
nombrar una tabla; limitación heredada y compartida con los tableros, no de esta fase.

### Dos «fallos» que eran de la prueba

Al probar la lectura de un cuaderno viejo parecía que se perdían el valor de una celda Input
y el nombre de una celda de código. Ninguna de las dos cosas: el formato guarda el parámetro
en `metadata.varName` —que el lector ya leía— y **las celdas de código nunca tuvieron
nombre**. El archivo de prueba se había inventado los dos campos.

Merece quedar escrito porque el reflejo fue ir a arreglar el lector. Con un archivo fiel al
real, la celda Input se convierte en parámetro de cabecera, los dos parámetros salen en la
barra, y la palabra «Input» desaparece sin que haya que quitarla de ningún sitio.

### Lo que no se pudo comprobar con las manos

Como en las dos fases anteriores, sin acceso a la pantalla. Lo de arriba se comprobó por HTTP
contra un servidor levantado aparte. Queda sin ver: la barra pintada, el aviso de lo que
falta, y los campos de parámetros.

---

## Fase 4 — El grafo y «Actualizar»

- [x] Dependencias **deducidas** del `lee` de la fase 0: si una celda lee `ventas_limpias`,
      depende de la que la crea, **esté donde esté en el documento**.
- [x] Marcar lo **desactualizado** en cascada, en la cabecera de la celda y en la barra.
- [x] **Un botón: «Actualizar»**, que ejecuta lo desactualizado en orden de dependencia y
      **dice cuántos y en qué orden antes de empezar**.
- [~] Se retiran *ejecutar todo*, *arriba* y *abajo*. En el cuaderno nuevo **no había nada
      que retirar**: nunca llegaron a existir, y «Actualizar» ocupa su sitio. Siguen en el
      componente anterior, que se va en la fase 6.
- [x] Pruebas desde Node del grafo y del orden: **es la parte que al fallar no da un error,
      deja un número viejo con pinta de nuevo.** Son 47.

**Criterio de terminado:** cambiar una celda de la que cuelgan tres marca las tres, y
«Actualizar» ejecuta esas tres y ninguna más.

### Bitácora

`grafo.js` hace las cuentas —puro, con 47 comprobaciones en
`scripts/probarGrafoCuaderno.mjs`— y el resto es enseñarlas: el punto de la celda pasa de
dos estados a cinco, la barra avisa de lo que está puesto pero viejo, y la barra de
herramientas gana «Actualizar» con el número de celdas pendientes.

El criterio se comprobó contra el motor con cinco celdas encadenadas. Editar la de la que
cuelgan tres las marcó **a las tres y sólo a ellas** —la quinta, sin relación, siguió al
día— y «Actualizar» ejecutó cuatro en orden de dependencia. El resultado cambió de
`{n: 100, s: 50}` a `{n: 100, s: null}`, que es como se sabe que se ejecutó de verdad y no
que el código parecía correcto.

### Qué significa «desactualizado» cuando una vista es perezosa

Hubo que definirlo antes de escribir nada, porque no es lo obvio. Una vista **no guarda
datos**: leerla vuelve a ejecutar su cadena, así que si cambian los datos de origen ya da el
resultado nuevo sin que nadie la toque. En ese sentido una vista no se queda vieja nunca.

Lo que sí se queda viejo son dos cosas:

1. **La definición puesta en la sesión**, congelada al ejecutar. Se edita el SQL, no se
   vuelve a ejecutar, y la vista viva sigue siendo la de antes — la celda de abajo está
   leyendo algo que ya no es lo que el documento enseña.
2. **El resultado que se ve en pantalla**, que es del último `SELECT`.

Lo segundo es lo que hace daño y es lo que se marca. Por eso el punto de la celda pasó de
deducirse del resultado —había resultado o no lo había— a mirar la frescura: una celda
ejecutada ayer y editada hoy tenía su resultado ahí, **tan verde como el de al lado**.

### Cambiar un parámetro desactualiza sin tocar una letra

Es el caso que más fácil se cuela, y el primer diseño lo dejaba pasar: se compara el texto
de la celda con el que se ejecutó, y cambiar `desde` de septiembre a agosto no cambia una
sola letra de ninguna celda. Todas seguirían «al día» enseñando las cifras de septiembre.

Se arregló comparando la consulta **ya resuelta**, no la escrita. Comprobado en vivo: cambiar
el parámetro marcó la celda como editada y las tres de debajo como desfasadas, y tras
«Actualizar» el resumen pasó de 100 a 170 porque entró agosto.

### Dos huecos que las pruebas no vieron porque yo las escribí

**Al reabrir el cuaderno, «Actualizar» no habría hecho nada.** Todas las celdas están «sin
ejecutar», que no es lo mismo que desactualizada, así que el botón quedaba apagado justo en
el caso más común del mundo. Ahora una celda sin ejecutar entra si **su vista no está viva**;
si lo está —porque la puso otra cosa— se deja en paz.

**Y volver a ejecutar un `INSERT` duplica filas.** Aquí el código se inclina al revés que en
el marcado: marcar de más cuesta una ejecución, ejecutar de más no se deshace cerrando el
proyecto. Una celda que escribe en disco se marca como desfasada —para que se vea— pero se
**aparta** de «Actualizar», y el diálogo la nombra y dice por qué. Comprobado: con un
`INSERT` entre dos celdas, «Actualizar» propone `base, hija` y aparta la del medio.

### Lo que el código se inclina a marcar de más, a propósito

Si una celda tiene padre en el cuaderno y ese padre no se ha ejecutado en esta sesión, la
hija se marca aunque parezca al día. Puede ser falsa alarma —la vista podría venir de un
`.sql`— pero entonces la hija leyó algo que **no es lo que su celda madre dice que es**.
Inventarse una dependencia cuesta una ejecución; perderla cuesta una cifra mala que nadie
revisa.

Los ciclos no se ordenan, así que no se esconden: las celdas atrapadas salen al final del
orden y la cabecera las marca «en bucle».

### Un cambio en el diálogo compartido

El mensaje de `confirmAsync` se pintaba en un `<p>` sin `white-space`, así que la lista del
orden de ejecución habría salido en un párrafo corrido. Se le puso `pre-line`: los mensajes
de una sola línea no cambian.

### Lo que no se pudo comprobar con las manos

Como en las tres fases anteriores. Queda sin ver: el punto ámbar, los distintivos «editada»
y «desfasada», el aviso de la barra y el diálogo con la lista ordenada.

---

## Fase 5 — Pantalla completa

- [x] La celda ocupa la pestaña entera, sin desplazamiento, con **el mismo mando de tres
      posiciones**.
- [x] «Sólo resultado» en pantalla completa es un gráfico del tamaño de la pantalla, con
      sitio para configurarlo — el estado en el que se afina una figura antes de mandarla a
      un tablero.
- [x] Vale igual para las celdas de texto: ahí es donde se escribe la prosa larga. Y el mando
      de tres posiciones llega también a la celda de texto **en la lista**, que antes tenía
      un interruptor de dos.
- [x] Se vuelve al cuaderno **por donde se estaba**.

**Criterio de terminado** (no lo traía el plan; se fija aquí): desde una celda de en medio se
abre la pantalla completa, se trabaja, y al cerrar el cuaderno está por donde se dejó.

### Bitácora

`PantallaCompleta.jsx` monta la celda sola; el botón de ampliar está en las dos clases de
celda y la barra derecha se queda, porque el índice y las vistas vivas siguen siendo útiles
mientras se trabaja de cerca. `Escape` cierra, y el índice de la barra también: pulsar en un
encabezado devuelve al cuaderno y baja hasta él.

La celda de texto de la lista pasa de un interruptor de dos posiciones a **el mismo mando de
tres** que una de SQL. No es una analogía forzada: en una de SQL son «lo que escribo», «lo
que sale» y «las dos cosas», y en una de texto también.

### Esta fase sí se miró con los ojos, y por eso aparecieron tres cosas

Las cuatro fases anteriores se comprobaron por HTTP, sin ver nada. Ésta es puramente visual,
así que se montó un **banco de pruebas aparte** —una página de Vite en un puerto propio que
monta los componentes con props inventadas, sin tocar ningún servidor— y se miró. No se
apuntó a la aplicación del usuario: sin Electron, la API del cliente cae al 3001, que es
justo donde vive su instancia.

Salieron tres fallos, y **ninguno de los tres da error ni lo caza una prueba**:

**El texto compuesto se pintaba en media celda.** `MarkdownPreview` trae de serie la
maquetación de una página —860 px centrados con márgenes automáticos— que en un documento es
lo correcto y dentro de una celda dejaba **177 px muertos a cada lado**. Medido en el
navegador: la caja empezaba en x=202 dentro de un contenedor que empezaba en x=11. Se arregla
con `widthMode="full"` en la celda; en la pantalla completa se deja la página, que ahí sí se
quiere.

Esto venía **desde la fase 1** y se entregó tres veces sin verlo.

**El reparto por omisión no era mitad y mitad.** El estilo decía
`var(--cdn-reparto, 1fr) 7px minmax(0,1fr)` y el componente ponía `0.5fr`: contra `1fr` eso
es un tercio y dos tercios, no la mitad. Medido: 421 px contra 843. Ahora van dos variables,
`--cdn-izq` y `--cdn-der`, y el reparto de 0.5 da 632,5 y 632,5.

También venía de la fase 1.

**En pantalla completa, «sólo el código» dejaba media pantalla en blanco.** La regla de una
sola columna es `.cdn-cuerpo--solo`, y `.cdn-pc-cuerpo` está más abajo en el archivo: con la
misma especificidad ganaba la de tres columnas. Se arregla apuntando a las dos clases juntas.
Medido antes y después: 632+7+632 → 1272 de una pieza.

### Lo que se prometió en la fase 1 y no se hace

Allí se escribió que aquí se montaría **el editor de documentos del producto**. Mirado de
cerca, ese editor está atado a *un archivo*: pide los cambios de git de ese archivo, busca
sus retroenlaces y escribe su nombre en la barra. Con la ruta del cuaderno etiquetaría la
celda con el nombre del cuaderno entero; sin ella pone «documento sin guardar», que es una
mentira en pantalla.

Lo que hacía falta para escribir prosa larga era **sitio**, y eso está: fuente y texto
compuesto, lado a lado, en toda la pantalla. El comentario de la fase 1 se corrigió para que
el código no siga prometiendo algo que no va a llegar.

### Lo que sigue sin comprobarse

El banco de pruebas monta los componentes sueltos. **No se ha visto la pantalla completa
dentro de la aplicación**: ni el paso de la lista a la celda ampliada, ni la vuelta por donde
se estaba, ni «sólo resultado» con un gráfico de verdad dentro. Eso necesita la aplicación en
marcha, que sigue sin poder verse.

---

## Fase 6 — La limpieza, y la documentación

- [x] Se retiran el **modo Report** y el **export a HTML**. Duplican al deck, que lo hace
      mejor y ya tiene el puente. Con ellos se van `SqlNotebook.jsx`, `NotebookCell.jsx`,
      `generateHtmlReport.js`, `generateNotebookPptxReport.js` y `notebookParser.js`.
- [x] **El export a Word se queda**, y con él el puente al tablero. Un deck se *proyecta*; un
      documento de Word *circula* — se comenta, se firma, se adjunta.
- [~] Documentación de usuario **reescrita en su sitio**, `docs/es|en/notebooks/`, no movida a
      `editor/`: 35 archivos enlazan a esas rutas y moverlas no aportaba nada. Las dos filas
      del índice se renombraron.
- [x] Repasados `contexto_caracteristicas/notebook_sql.md` y `formatos_archivo.md`,
      `CLAUDE.md` y `docs/dev/mapa_aplicacion.md`. También el recorrido de bienvenida, que
      hablaba de celdas «Input», de «ejecutar todo» y del export a HTML.

**Criterio de terminado** (no lo traía el plan; se fija aquí): no queda ninguna referencia al
componente anterior en el código, y lo que la documentación describe es lo que hay.

### Bitácora

Se retiran cinco archivos y se conservan dos salidas: Word y el puente al tablero.
`exportar.js` hace la traducción —puro, con 13 comprobaciones— y `CuadernoEditor` gana los
dos botones.

**El export a PowerPoint del cuaderno también se fue, y eso el plan no lo decía.** Vivía sólo
dentro del modo Informe, así que desaparecía con él de todos modos; y el razonamiento del
plan para quedarse con Word —«un tablero se proyecta, un documento circula»— apunta al
tablero justamente para el caso de proyectar. Queda dicho por si la decisión se quiere del
revés: reponerlo es volver a exponer el módulo, no reescribirlo.

### Lo que se descubrió al mover el export a Word

El exportador captura las figuras **del DOM vivo**, y eso lo ata a la forma de la interfaz.
Tres cosas salieron de mirarlo de cerca, y ninguna la habría contado una prueba:

**Buscaba una clase que ya no existe.** `.nb-results-height--report` era del componente
retirado; sin encontrarla, la captura caía en una cadena de alternativas que da con «algún»
ancestro. Se apuntó a la caja de verdad.

**Pero apuntar a la caja del resultado era malo dos veces.** Esa caja incluye la barra de
«Tabla / Gráfico / Perfil», que habría acabado dentro del documento de Word; y la figura se
dibuja a su propio tamaño —757×429 dentro de una caja de 686×242— así que capturar la caja la
recortaba por los dos lados. Ahora se captura el envoltorio de la figura, que no puede
recortar.

**Y sobraba la mitad del código.** El apaño de fijar el alto para que Recharts redibujara ya
no hacía falta, y con él se fue el parámetro `cellStates` del exportador, que había dejado de
usarse.

Comprobado de verdad, no por deducción: se generó un `.docx` desde el navegador con una celda
del cuaderno nuevo y se abrió el zip. Dentro hay un `word/media/*.png` de **1514×858**, que es
exactamente la figura a escala 2. Sin recortar.

### Un fallo que compilaba y habría reventado al pulsar

Se escribió `toast.showToast(...)`. La API real es `toast.error(...)` / `toast.info(...)`.
Ni el linter ni la compilación dicen nada de un método inventado sobre un objeto: sólo
revienta al hacer clic. Salió al ir a comprobar la forma del proveedor antes de darlo por
bueno.

### Dos cosas que no eran del plan y había que hacer igual

**El recorrido de la primera vez.** Lo lanzaba el componente retirado, así que se quedaba sin
quien lo abriera; y sus cuatro pasos describían celdas «Input», «ejecutar todo» y el export a
HTML. Reescrito y enganchado al cuaderno nuevo.

**El diálogo de exportar.** `confirmAsync` es binario y aquí hacían falta tres salidas: con el
código, sin él, y no exportar. Con una pregunta de sí o no, pulsar Escape habría contado como
«sin el código» y el documento habría salido igual.

### Lo que no se pudo comprobar con las manos

El banco de pruebas monta los componentes sueltos, así que **dentro de la aplicación no se ha
visto nada de esta fase**: ni los dos botones, ni el diálogo de exportar, ni el aviso de las
celdas plegadas, ni el tablero abriéndose en una pestaña nueva. Lo que sí está comprobado es
lo que más callado falla: que el `.docx` sale con su figura entera.

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
- **El producto arrastra dos convenciones de variable.** `{{nombre}}` en cuadernos y
  tableros, con entrecomillado automático; `${'{'}nombre}` en las variables del editor de
  consultas, en crudo. El cuaderno se queda con la suya —cambiarla rompería en silencio los
  archivos guardados— pero unificarlas es una decisión que se toma con las tres funciones
  delante, no dentro de una fase.
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
