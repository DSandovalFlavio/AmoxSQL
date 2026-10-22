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
| Archivo en markdown con directivas | `cuadernoFile.js`, `deckParser.js` | El formato del lienzo (Dec-54) |
| Diapositivas desde un cuaderno | `cuaderno/exportar.js → planDeTablero` | Un marco → un deck de Report Flow |
| Fuentes con nombre | `fuentes."x"`, `FuentesExplorador` | La tarjeta Source y arrastrar desde el explorador |

## 4. Las decisiones que fija este plan

**Dec-54 · El lienzo es un archivo `.amoxcanvas` en markdown.** Como el cuaderno y el
deck: front-matter (título, parámetros) y una tarjeta por bloque, con su directiva:

    <!-- tarjeta: ventas_limpias consulta x=420 y=80 w=360 h=260 marco=trafico -->
    ```sql
    SELECT * FROM fuentes."ventas" WHERE estado <> 'devuelto'
    ```

Las posiciones **sí** se guardan (las pone la persona; en AmoxDiagram las calcula el
dibujo). Un cambio de una línea de SQL es un diff de una línea, y el diff legible de la
5.14 se extiende al lienzo. El estado de quien mira (zoom, qué tarjetas muestran el
código) va aparte, en `.amoxcanvas.state.json`, como el del cuaderno.

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
`UNION` → «+ rows of x». Se puede escribir otra y queda en la directiva.

**Dec-58 · Nada corre al abrir.** El lienzo abre con **la última foto** de cada tarjeta
(las primeras filas de una tabla, los puntos de un gráfico, la cifra) guardada en
`.amoxcanvas.state.json`, marcada «as of <fecha>». **Refresh all** (o **Refresh** de una
rama) vuelve a poner las vistas y recalcula. Así un lienzo de veinte tarjetas abre al
instante y nunca dice una cifra vieja sin decir que lo es.

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
- `client/src/utils/lienzoFile.js`: leer y escribir `.amoxcanvas` (ida y vuelta idéntica), directivas con posición, tamaño, marco y etiqueta.
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
- La foto al abrir (`.amoxcanvas.state.json`) y «as of».

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

## 7. Preguntas para el autor

1. **El nombre.** En la interfaz, **Canvas** (archivo `.amoxcanvas`), o un nombre de la familia de Story Flow / Data Flow / Report Flow (por ejemplo **Think Flow** o **Insight Board**).
2. **La foto al abrir (Dec-58).** ¿Guardar las primeras filas y los puntos de los gráficos en el `.state.json` (abre al instante, ocupa algo de disco y no va a git), o abrir vacío y que **Refresh all** lo llene?
3. **Transformaciones sin código.** ¿Basta con el menú que escribe el SQL (Dec-56), o quieres tarjetas de Filtrar / Agrupar / Unir con su formulario, como los nodos de Data Flow?

## 8. Lo que queda fuera de la 5.15

- El asistente dentro del lienzo (la caja de «pregúntale a tus datos»).
- Comentarios con hilo, colaboración en vivo, varias personas en el mismo lienzo.
- Python.
- Dibujo libre y formas (flechas a mano, rectángulos): sólo notas, texto y marcos.

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-22 | — | Plan escrito leyendo `main` en `d1e2083`. La 6.0 pasa a ser la subida a DuckDB 2.0; el lienzo es la 5.15. Decisiones Dec-54 a Dec-61; tres preguntas para el autor (§7). Mockup en `mockup_lienzo.html` |
