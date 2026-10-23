# Plan 5.15.0 · El lienzo

> Escrito leyendo `main` en `d1e2083` (5.14.0). **No se publica**: como las anteriores,
> es una etapa interna. La **6.0** queda para cuando el motor pase a DuckDB 2.0 (con su
> cliente para Node); el lienzo deja de ser «la 6.0» y es la 5.15.
>
> Mockup: [`mockup_lienzo.html`](mockup_lienzo.html).

## 1. Qué es y para quién

Un **lienzo infinito para analizar**: cajas con fuentes, consultas, tablas, gráficos,
cifras y notas, conectadas entre sí, donde una consulta alimenta a la siguiente y se ve
el camino entero de un vistazo. Es el sitio para **pensar** un análisis —explorar,
probar dos caminos, dejar una nota al lado del número que la motiva— antes de que sea
un cuaderno que se entrega o un proceso que corre solo.

| Hoy | Qué le falta |
|---|---|
| El **cuaderno** | Es lineal: un análisis con dos ramas («por tienda» y «por canal» desde la misma base) se lee de arriba abajo y la rama se pierde |
| **Data Flow** | Está hecho para que algo corra solo y entregue un archivo; sus nodos son operaciones, no resultados: no se ve el número al lado del paso |
| **Report Flow** | Es para contar lo que ya se sabe, no para averiguarlo |

El lienzo no sustituye a ninguno: **toma prestado su motor y les entrega lo que sale de
él** (un marco → diapositivas; el lienzo → un cuaderno; una rama → un proceso).

**Sin asistente en esta versión** (decisión del autor): el formato y la interfaz dejan
el hueco, pero no se construye.

## 2. Lo que se aprendió mirando herramientas parecidas

Se revisaron cuatro herramientas públicas de lienzo y de cuadernos reactivos. Lo que
hacen bien y cómo se adapta a AmoxSQL (local, un usuario, archivos que entran y salen):

| Lo que hacen | Cómo lo adaptamos |
|---|---|
| Cada celda SQL es una **expresión de tabla** que otras celdas leen por su nombre; las flechas del lienzo **se dibujan solas** a partir de lo que cada consulta lee (un grafo de dependencias) | Igual que el cuaderno de la 5.x: **cada tarjeta deja una vista temporal con su nombre** y las conexiones salen de lo que cada consulta lee (`celdaSql.js` + `grafo.js`). No hay flechas a mano que puedan mentir |
| **Reactividad**: al cambiar una celda, lo de abajo se recalcula o se marca como desactualizado | Lo del cuaderno: se marca **desactualizado** (el punto de cuatro estados) y **Refresh** recorre el grafo. Con DuckDB local, recalcular una rama es barato; se recalcula a mano, no a cada tecla |
| Un **motor local** dentro del lienzo para leer CSV y los resultados de otras celdas sin cargar el servidor | Para nosotros **todo** es local: el motor es el de AmoxSQL, con las fuentes con nombre, los Excel del cliente y las bases del proyecto |
| Notas adhesivas, texto, **marcos** que agrupan, comentarios | Notas, texto y marcos. Un marco es también la unidad de **presentar** y de **exportar** (cada marco, una diapositiva) |
| Celdas de **control** (un filtro, una fecha) que alimentan a otras | **Controles** del lienzo con los parámetros `{{nombre}}` que ya comparten el cuaderno y el deck |
| Celdas **visuales sin código** (gráfico, cifra) sobre el resultado de otra | La tarjeta **Chart** usa la configuración de Story Flow (`.amoxvis`); la tarjeta **Number** es una cifra con su variación |
| Las conexiones llevan una **etiqueta** que dice qué transformación hay entre dos cajas («by device») | La etiqueta se **deduce** de la consulta de abajo: `GROUP BY dispositivo` → «by device», un `WHERE` → «where …», un `JOIN` → «+ metas». Se puede escribir otra |
| Vista de **grafo** aparte del lienzo, y presentar | El lienzo **es** el grafo; **Present** recorre los marcos |

Lo que **no** se adapta: la colaboración en vivo y los permisos (AmoxSQL es de una
persona, y el lienzo es un archivo del proyecto que viaja con git o en el `.amoxproject`),
el cómputo en la nube y, por ahora, el asistente.

## 3. Lo que el código ya da

| Pieza | Dónde | Qué aprovecha |
|---|---|---|
| Lienzo con nodos y aristas | `@xyflow/react` 12, ya usado por Data Flow (`chains/ChainCanvas.jsx`) | Zoom, desplazamiento, minimapa, selección, arrastre. Sin dependencia nueva |
| Una consulta deja su vista | `/api/cuaderno/celda`, `utils/vistaDeCelda.js` | Ejecutar una tarjeta = ejecutar una celda: vista `TEMP` con su nombre y descripción, y sus filas con el límite |
| Qué lee y qué escribe una consulta | `utils/celdaSql.js` | Las conexiones, y el aviso de una tarjeta que **escribe** |
| Dependencias y desactualización | `cuaderno/grafo.js` | El punto de estado, **Refresh** en orden, los ciclos |
| Vistas vivas de la sesión | `/api/cuaderno/vistas`, `vistasVivas.js` | Saber qué tarjetas siguen vivas al volver |
| Gráficos | `DataVisualizer/` (Story Flow), `.amoxvis` | La tarjeta Chart |
| Parámetros `{{x}}` | cuaderno y deck | Los controles |
| Lienzo de nodos que lee y escribe JSON | Data Flow (`.sqlchain`), `diffDeProcesos.js` | El formato del lienzo y su diff legible (Dec-54) |
| Diapositivas desde un cuaderno | `cuaderno/exportar.js → planDeTablero` | Un marco → un deck de Report Flow |
| Fuentes con nombre | `fuentes."x"`, `FuentesExplorador` | La tarjeta Source y arrastrar desde el explorador |

## 4. Las decisiones que fija este plan

**Dec-54 · El lienzo es un archivo `.amoxcanvas` en JSON** (decisión del autor). Un
lienzo es posiciones, tamaños, marcos, conexiones con etiqueta y la foto de cada tarjeta:
estructura, no prosa, y es lo que el lienzo de nodos ya lee y escribe. Para que siga
siendo revisable en git:

- **Orden fijo** de las claves y de las tarjetas (por id), con sangría: guardar sin cambiar nada no cambia el archivo.
- **El SQL va en líneas** (`"sql": ["SELECT *", "FROM fuentes.\"ventas\"", "WHERE estado <> 'devuelto'"]`): cambiar una línea de una consulta es un diff de una línea, y no hay `
` escapados.
- **El diff legible de la 5.14 se extiende al lienzo** (tarjetas añadidas, quitadas, SQL cambiado; mover no cuenta; la foto tampoco).

```json
{
  "formato": "amoxcanvas", "version": 1,
  "titulo": "Ventas de octubre",
  "parametros": { "desde": "2026-10-01", "hasta": "2026-10-31" },
  "tarjetas": [
    { "id": "ventas_limpias", "tipo": "query", "x": 420, "y": 80, "w": 360, "h": 260,
      "marco": "trafico", "modo": "ambos",
      "sql": ["SELECT * FROM fuentes.\"ventas\"", "WHERE estado <> 'devuelto'"],
      "foto": { "cuando": "2026-10-22T09:14:00Z", "filas": 1187, "columnas": ["…"], "muestra": [["…"]] } }
  ],
  "etiquetas": { "ventas→ventas_limpias": "sin devoluciones" },
  "vista": { "x": 0, "y": 0, "zoom": 0.8 }
}
```

Todo vive en el mismo archivo, también el zoom y la foto (Dec-58): no hay `.state.json` aparte.

**Dec-55 · Conectar es referenciar.** Una tarjeta de datos deja una vista con su nombre;
la de abajo la lee por ese nombre. **Las flechas no se dibujan, se deducen**: no puede
haber una flecha que diga algo distinto de lo que hace la consulta. Arrastrar desde el
borde de una tarjeta a un hueco crea una consulta nueva `SELECT * FROM <nombre>` ya
conectada; soltar sobre otra tarjeta añade la referencia a su consulta. Renombrar una
tarjeta reescribe a las que la leen (con confirmación y lista de lo que cambia).

**Dec-56 · Siete tipos de tarjeta, y nada más.**

| Tarjeta | Qué es | Deja vista |
|---|---|---|
| **Source** | Una fuente con nombre, un archivo, una tabla de la base o de otro proyecto (J1) | Sí |
| **Query** | SQL; se ve el código, el resultado o los dos (como la celda) | Sí |
| **Chart** | Un gráfico de Story Flow sobre otra tarjeta | No |
| **Number** | Una cifra (y su variación frente a un periodo o a otra tarjeta) | No |
| **Note** | Una nota adhesiva | — |
| **Text** | Un título o un párrafo en markdown | — |
| **Frame** | Un marco que agrupa, con título; se presenta y se exporta | — |

Las transformaciones sin código de Data Flow (filtrar, agrupar, unir) **no** entran como
tipos: en el lienzo se escribe SQL, con el completado de siempre. Lo que sí se ofrece es
un menú al arrastrar una conexión (**Filter… · Group by… · Join with…**) que **escribe
el SQL** de la consulta nueva, editable.

**Dec-57 · La etiqueta de una conexión se deduce.** Del SQL de la tarjeta de abajo:
`GROUP BY` → «by <columnas>», `WHERE` → «where <condición corta>», `JOIN x` → «+ x»,
`UNION` → «+ rows of x». Se puede escribir otra y queda en `etiquetas` del archivo.

**Dec-58 · Nada corre al abrir: la foto va dentro del JSON** (decisión del autor). Cada
tarjeta guarda en `foto` lo que enseñaba: las primeras **50 filas** de una tabla, los
puntos de un gráfico (hasta 2.000), la cifra, y cuándo se tomó. El lienzo abre al
instante con esa foto, marcada «as of <fecha>», y **Refresh all** (o **Refresh** de una
rama) vuelve a poner las vistas y recalcula. Los topes mantienen el archivo pequeño (un
lienzo de veinte tarjetas, del orden de cientos de KB). Coste aceptado: refrescar cambia
la foto y git lo ve; el diff legible la ignora, y quien no quiera versionarla puede
**Clear snapshots** antes de un commit.

**Dec-59 · Controles = parámetros.** Una barra de controles del lienzo (fecha, lista,
texto) da valor a los `{{parametro}}` de las consultas; cambiar uno marca desactualizado
todo lo que lo usa y **Refresh** lo recalcula.

**Dec-60 · Lo que sale del lienzo.**

- **Present**: recorre los marcos en orden, uno por pantalla.
- **Marco → Report Flow**: cada marco, una diapositiva (sus gráficos como `amoxchart`
  con su `.amoxvis` escrito al lado, sus notas como texto).
- **Lienzo → cuaderno**: las tarjetas en orden de dependencias, las notas como texto.
- **Rama → Data Flow**: las consultas de una rama, como pasos SQL de un proceso que ya
  puede programarse. Es el puente de «lo pensé» a «que corra solo».
- **Tarjeta → .sql**.

**Dec-61 · Tamaño.** Las tablas de una tarjeta muestran 50 filas y paginan (nunca
virtualización de listas). El lienzo pinta todas las tarjetas; si una prueba con 60
tarjetas se traba, se medirá dibujar sólo las visibles **antes** de adoptarlo.

## 5. Las fases

### Fase 0 · El formato y el motor (Dec-54, Dec-55)
- `client/src/utils/lienzoFile.js`: leer y escribir `.amoxcanvas` en JSON con orden fijo y el SQL en líneas (ida y vuelta idéntica), con la foto y sus topes.
- `client/src/components/lienzo/grafoLienzo.js`: aristas deducidas (reusa `celdaSql` y `grafo.js`), etiquetas (Dec-57), ciclos.
- El servidor no cambia: una tarjeta se ejecuta con `/api/cuaderno/celda`.
- Prueba: `probarLienzo.mjs` (formato, aristas, etiquetas, renombrar).

### Fase 1 · El lienzo (Dec-55, Dec-56 sin Chart ni Number)
- `LienzoEditor.jsx` sobre `@xyflow/react`: Source, Query, Note, Text y Frame; crear arrastrando desde el borde y desde el explorador (fuentes y tablas); el punto de estado, **Run** y **Refresh**; renombrar con propagación; minimapa, zoom, buscar (`Ctrl+F` salta a la tarjeta).
- Seleccionar una tarjeta resalta lo que lee y lo que la lee.
- Archivo nuevo **Canvas** en el explorador de archivos y en la paleta.

### Fase 2 · Ver (Dec-56 completa, Dec-57, Dec-58, Dec-59)
- Chart (configuración de Story Flow en un panel lateral) y Number.
- Etiquetas de las conexiones; controles de parámetros.
- La foto al abrir (dentro del `.amoxcanvas`), «as of» y **Clear snapshots**.

### Fase 3 · Sacar (Dec-60)
- Present; marco → Report Flow; lienzo → cuaderno; rama → Data Flow; tarjeta → `.sql`.
- El diff legible de la 5.14 entiende un `.amoxcanvas` (tarjetas añadidas, quitadas, SQL cambiado, movidas no cuentan).

### Fase 4 · Cerrar → **5.15.0** (sin publicar)
- Recorrido real con un lienzo de cliente (fuente Excel → limpia → dos ramas → gráfico, cifra y notas → un marco a Report Flow → una rama a Data Flow programada).
- Prueba de tamaño (60 tarjetas), todas las `probar*.mjs`, docs ES/EN, versión, CHANGELOG, `pnpm dist`.

## 6. Riesgos

| Riesgo | Qué lo cubre |
|---|---|
| Una flecha que no dice la verdad | Las flechas se deducen del SQL (Dec-55); no hay flechas a mano |
| Un número viejo con cara de nuevo | La foto lleva «as of» y el punto de estado; Refresh por ramas (Dec-58) |
| Un lienzo grande se traba | Tablas paginadas a 50 filas, foto al abrir, y una prueba de 60 tarjetas antes de cerrar (Dec-61) |
| Se solapa con el cuaderno | Comparten motor y formato; el lienzo se convierte en cuaderno cuando el análisis se vuelve lineal (Dec-60) |
| Nombres de vista que chocan entre el lienzo y un cuaderno abiertos a la vez | Las vistas son de la sesión, como hoy entre dos cuadernos; el lienzo avisa si una vista suya la redefine otro documento |

## 7. Decisiones del autor (respondidas el 2026-10-22)

1. **El nombre:** **Canvas**, archivo `.amoxcanvas`.
2. **El formato y la foto:** **JSON**, con todo dentro, la foto incluida (Dec-54, Dec-58).
3. **Transformaciones sin código:** de momento, el menú que escribe el SQL (Dec-56). Una forma visual de transformar que por detrás sea código llegará después como **otro tipo de tarjeta**; el formato deja sitio (`tipo` abierto) y no se rehace nada.

## 8. Lo que queda fuera de la 5.15

- El asistente dentro del lienzo (la caja de «pregúntale a tus datos»).
- Comentarios con hilo, colaboración en vivo, varias personas en el mismo lienzo.
- Python.
- Dibujo libre y formas (flechas a mano, rectángulos): sólo notas, texto y marcos.

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-22 | — | Plan escrito leyendo `main` en `d1e2083`. La 6.0 pasa a ser la subida a DuckDB 2.0; el lienzo es la 5.15. Decisiones Dec-54 a Dec-61; tres preguntas para el autor (§7). Mockup en `mockup_lienzo.html` |
| 2026-10-22 | — | **Respuestas del autor (§7):** Canvas; JSON con la foto dentro (Dec-54 y Dec-58 reescritas: orden fijo, SQL en líneas, topes, el diff legible ignora la foto); el menú que escribe SQL basta, la transformación visual llegará como otro tipo de tarjeta |
| 2026-10-22 | 0 | **Fase 0 hecha**, `probarLienzo.mjs` **50/50**. `client/src/utils/lienzoFile.js`: leer y escribir `.amoxcanvas` (JSON con orden fijo, tarjetas por id, SQL en líneas, posiciones redondeadas, ida y vuelta idéntica byte a byte; la foto con sus topes de 50 filas y 2.000 puntos; **Clear snapshots**; un tipo desconocido se conserva entero; un archivo roto o de una versión más nueva **lanza** en vez de abrirse vacío). `client/src/components/lienzo/grafoLienzo.js`: el SQL de cada tarjeta (una Source lee una fuente con nombre, una tabla —también de otro proyecto— o un archivo), las flechas deducidas con el análisis y el grafo del cuaderno, las de Chart/Number por `desde`, las etiquetas (`by …`, `where …`, `+ x`, `+ rows of x`; la escrita a mano gana), el linaje, el orden de Refresh (todo o una rama) y los ciclos, renombrar (reescribe sólo lecturas: después de FROM/JOIN y como calificador; nunca un texto, un comentario ni una columna homónima; lo que no se reescribe solo se dice) y la consulta nueva al soltar una conexión. **Dos reglas nuevas, de lo que salió al escribirlo:** una Source que lee una tabla se llama `<tabla>_src` (la vista `ventas` que leyera la tabla `ventas` se leería a sí misma) y una tarjeta del lienzo **sólo lee** (lo que escribe va en un cuaderno o un `.sql`). Por el motor, con home temporal: tres tarjetas dejan sus vistas en orden con `/api/cuaderno/celda` y la última lee a las de arriba. El servidor no cambia |
| 2026-10-22 | 1 | **Fase 1 hecha.** `client/src/components/lienzo/LienzoEditor.jsx` sobre el lienzo de nodos de Data Flow, `Tarjetas.jsx` (Source, Query, Note, Text, Frame; un tipo desconocido se pinta como «de un AmoxSQL más nuevo» y se conserva) y `lienzo.css` (sólo tokens del tema). El archivo es la verdad: mover, redimensionar, editar y crear vuelven al `.amoxcanvas` (con pausa de 250 ms); **moverse por el lienzo no lo ensucia** (el encuadre se guarda con el siguiente cambio). Cada tarjeta de datos se ejecuta con `/api/cuaderno/celda` (con el aviso de nombre que tapa una tabla, como el cuaderno), el punto de estado y **Refresh all** son los del cuaderno (`frescura` + `ordenDeRefresco`; se para en el primer fallo y lo dice), y al ir bien guarda su foto. **El editor de SQL sólo se monta en la tarjeta que se edita** (doble clic); las demás pintan el SQL con color. Arrastrar desde el borde a un hueco abre **Filter… / Group by… / Join with… / Empty query** y la consulta nueva nace conectada; renombrar (doble clic en el nombre) reescribe las que la leen tras confirmar con la lista; un marco arrastra lo que tiene dentro (se decide por el centro de cada tarjeta al soltar); Supr borra; **Ctrl+F** busca por nombre, SQL o texto; soltar una fuente, una tabla (también de otro proyecto) o un archivo de datos desde los exploradores crea una Source. Tipo `.amoxcanvas` registrado en los nueve sitios (tipos de archivo, pestañas nuevas, tarjeta de la pantalla vacía, explorador —abrir, icono, grupo, botón—, menú «+», paleta, guardar como, búsqueda del proyecto). **Hallazgos del recorrido:** los menús se cerraban al salir el ratón (ahora con un clic fuera); el nombre era parte del asa de arrastre y el doble clic no llegaba (ahora no lo es); la foto ocupaba una línea por celda (ahora una por fila). **Recorrido en el navegador integrado** (demo con un Canvas de seis tarjetas): Refresh all corre las tres en orden y guarda sus fotos; una conexión soltada en un hueco crea `paso_1` ya conectado («by folio») y corre; renombrar `ventas_limpias` → `limpias` reescribe dos tarjetas y mantiene las flechas; el marco arrastra a `por_tienda`; una Source de la fuente `ventas` dice que la fuente rompe su contrato; Supr y Ctrl+F. La suite completa encontró que `probarTiposDeArchivo` tiene la lista cerrada de tipos: ampliada con el Canvas. Las 63 suites en verde |
| 2026-10-23 | 2 | **Fase 2 hecha**, `probarLienzo.mjs` **57/57**. **Chart**: Story Flow en modo informe dentro de la tarjeta (se carga sólo si hay un gráfico) y, con el lápiz o doble clic, el editor completo de Story Flow encima del lienzo; la configuración vuelve a `grafico`. **Number**: una cuenta (suma, media, recuento, mínimo, máximo o primera fila) de una columna, con su etiqueta y, si se elige, la variación frente a otra tarjeta; se configura dentro de la tarjeta. Las dos leen la vista de lo que enseñan con `sqlDeVisual` (puro, probado), no dejan vista, tienen su punto de estado (al día si lo que enseñan lo está y no corrió después) y guardan su foto (las filas del gráfico, hasta 2.000; la cifra). **Refresh all** las corre detrás de lo que enseñan. Se crean desde la barra (de la tarjeta de datos seleccionada), desde el menú al soltar una conexión, o **soltando una conexión sobre ellas** (la única conexión a mano que existe: dice qué enseñan). **Etiquetas**: doble clic en una flecha la escribe a mano; vacía vuelve a la deducida. **Parámetros** (Dec-59): la barra enseña los `{{x}}` que usan las consultas y los de `parametros`; cambiar uno deja desactualizado lo que lo usa. **La foto**: «Snapshot as of …» en la barra mientras se vean fotos sin haber corrido. **Recorrido en el navegador integrado** (demo con gráfico, cifra y el parámetro `minimo`): Refresh all corre cinco tarjetas y la cifra da 235.5; `minimo` = 50 deja desactualizadas cuatro (la Source no, porque no lo usa) y al refrescar la cifra es 180; el editor de Story Flow se abre y se cierra; la etiqueta «by tienda» pasa a «ventas por tienda»; un gráfico nuevo sin conectar recibe `por_tienda` al soltar sobre él una conexión, y se dibuja. Las 63 suites en verde |
| 2026-10-23 | 3 | **Fase 3 hecha**, `probarLienzo.mjs` **77/77**. `client/src/components/lienzo/salidas.js` (puro): orden de lectura de marcos y tarjetas, la rama que necesita una tarjeta y **el SQL autónomo** (lo de arriba como CTE con su nombre y la suya al final; las de un gráfico o una cifra, su lectura sobre lo que enseñan): lo que sale del lienzo se ejecuta en otro sitio y otro día, sin las vistas de la sesión. **Present**: los marcos en orden de lectura, uno por pantalla (flechas, espacio, Esc), con el lienzo quieto y las barras ocultas; al salir vuelve el encuadre de antes. **Export**: *To Report Flow* (una lámina por marco: su título, sus textos y notas, la cifra de un Number con su foto, y sus gráficos como `.amoxvis` autónomos en `charts/`; `chart-full` o `chart-grid`; los parámetros pasan a `variables` del deck), *To a notebook* (las consultas en orden de dependencias con su nombre, las notas como cita), *Branch to Data Flow* (un paso SQL por tarjeta que deja su tabla, `{{x}}` → `${x}` con su valor, base de trabajo) y *Card as SQL*. **What changed** para un `.amoxcanvas` (`diffDeProcesos.diferenciasDeLienzo`, misma forma que la de un proceso: tarjetas añadidas, quitadas y cambiadas; mover, la foto y el modo de ver no cuentan; etiquetas a mano y parámetros sí) en el menú del Canvas y en el panel de Git (Steps / Text). **Hallazgo de la prueba:** al pasar a cuaderno, la cola de tarjetas de datos se vaciaba dentro del `find` y el cuaderno salía sin consultas. **Ejecutado de verdad:** el SQL autónomo de `por_tienda` corre solo con `/api/query`; la rama como proceso de Data Flow, con un Export File al final, corre y entrega `norte,120` / `sur,55`. **Recorrido en el navegador integrado:** Present (1 / 1) oculta las barras y Esc lo cierra; *To Report Flow* abre un deck nuevo, escribe `charts/Ventas_de_octubre_grafico_1.amoxvis` y su gráfico se dibuja. Las 63 suites en verde |
