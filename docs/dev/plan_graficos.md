# Plan de implementación — la tarjeta de gráfico

Ejecuta el contrato de `docs/dev/sistema_graficos.html`. Solo la parte de **corregir y
reordenar**: los modos de composición (apilado / cabecera partida / lateral) son una función
nueva y van en otro PR.

Estado: `[ ]` pendiente · `[x]` hecho · `[—]` descartado con razón.

---

## Fase A — Los tres errores de corrección

### A1 · Formato numérico mixto en la nota al pie
`server/ai/chartStory.js:21` — `formatNum()` usa compacto con un decimal por encima de 1000 y
`toFixed(2)` por debajo. De ahí `Peak: 4.6M | Low: 422.67 | Average: 2.8M`, tres números con tres
estilos distintos en la misma línea.

- [x] Un solo estilo: compacto con un decimal a partir de 1000, y **sin decimales** por debajo
      cuando la parte entera tiene tres cifras o más. `422.67` → `423`.
- [x] Nada de `Number.isInteger()` decidiendo el formato: eso hace que dos números del mismo
      rango se impriman distinto según si uno cayó redondo.

### A2 · El periodo del subtítulo no casa con el eje
`server/ai/chartStory.js:130` — `chart_subtitle` hace `xValues[0] → xValues[último]`, o sea las
posiciones primera y última **del array tal como llega**, que es `data.slice(0, 500)` sin ordenar
(`DataVisualizer.jsx:322`). Describe un subconjunto distinto del que se dibuja.

- [x] Calcular el rango con **min y max** de los valores de X, no por posición.
- [x] Formatear la fecha como fecha: `2020-03-01 00:00:00` → `2020-03-01`.
- [x] Si los datos venían recortados, decirlo (`primeras 500 filas`) en vez de presentar el rango
      como si fuera el del conjunto completo.

### A3 · El delta compara cosas incomparables
`client/src/components/DataVisualizer/utils/dataProcessing.js:193` — `computeHeadline()` toma la
suma del periodo como valor y la compara contra el primer punto de la serie. De ahí
`▲ +7658.1 %` junto a una conclusión que dice «cayó 0,4 %».

- [x] Matriz de parejas válidas (sección 07 del contrato):

  | métrica | comparación | qué compara |
  |---|---|---|
  | `last` | `previous` | punto n vs punto n−1 |
  | `last` | `first` | punto n vs punto 1 |
  | `total` / `average` | `previous` | la ventana vs la ventana previa del mismo tamaño |
  | `total` / `average` | `first` | **inválida** — no se calcula |
  | `first` | cualquiera | **inválida** — sin delta |

- [x] `headline.window`: `'all'` (por defecto) o un número N.
      Con `'all'` + `total` no hay ventana previa → **no hay pastilla**.
- [x] Devolver `compareLabel` con el texto de contra qué compara.
- [x] Si no hay pareja válida, `delta` y `deltaPercent` a `null`.


### A2b · «Primero» y «último» sobre datos sin ordenar
Salió al probar A2, y es el mismo fallo un nivel más abajo: `firstVal` / `lastVal` se tomaban por
posición sobre un array que llega sin garantía de orden, así que la narrativa decía «creció de X
a Y» comparando dos puntos elegidos por azar.

- [x] En una serie temporal se ordena una copia por el valor de X antes de tomar primero y último.
- [x] Comprobado: con los mismos datos ordenados y revueltos, el hallazgo sale idéntico.

---

## Fase B — El KPI en pantalla

### B1 · Etiqueta obligatoria de comparación
`overlays/HeadlineOverlay.jsx` — hoy la etiqueta gris solo lleva el valor absoluto.

- [x] Mostrar `compareLabel` siempre que haya delta: `▲ +12.4 % (+85k) vs. mes anterior`.
- [x] Sin `compareLabel` no se pinta pastilla.

### B2 · Métrica por defecto
`constants.js:357` — hoy `{ visible: false, metric: 'total', compareWith: 'none' }`.

- [x] `metric: 'last'` y `compareWith: 'previous'` por defecto.
- [x] `window: 'all'`.
- [—] **No** se toca `visible: false`. Encenderlo por defecto haría aparecer un número grande en
      todos los gráficos existentes; eso es una decisión del usuario, no un arreglo.

---

## Fase C — El orden de la tarjeta

### C1 · El título, arriba del todo
`DataVisualizer.jsx:541-585` — hoy el orden es KPI → título → subtítulo. Se lee al revés.

- [x] Reordenar a **título → subtítulo + leyenda → KPI** → lienzo → conclusión → nota → firma.
- [x] Conservar el `paddingLeft: 50px` del modo alineado a la izquierda en el bloque que quede
      primero, para que la sangría no salte.

---

## Fase D — Valores de fábrica y cromo que sobra

### D1 · Sin líneas de eje
- [x] `DEFAULT_CONFIG.showAxisLines: false`. La rejilla punteada ya marca el nivel.

### D2 · Sin leyenda con una sola serie
`DataVisualizer.jsx:135` — `inlineLegendItems` se construye con cualquier número de series.
- [x] Devolver `null` cuando `finalSeriesKeys.length < 2`.

### D3 · Sin título de eje X cuando el eje es de fechas
- [x] En `ChartRenderer`, ignorar `showXAxisTitle` si la columna de X es de fecha: las etiquetas
      ya dicen qué es.

### D4 · Puntos hasta 40
`renderers/ChartRenderer.jsx:34` — `CustomizedDot` respeta `showDots` sin mirar cuántos hay.
- [x] Ocultar los puntos por encima de 40 registros aunque `showDots` esté activo.
- [x] `DEFAULT_CONFIG.showDots: true` — con el umbral ya no molesta.

### D5 · Jerarquía entre series
`ChartRenderer.jsx:567` — todas las líneas van a `strokeWidth={2}` y opacidad plena.
- [x] La primera serie a grosor 2 y opacidad 1; el resto a 1.5 y 0.55, y sin puntos.
- [x] Solo cuando hay más de una serie y **solo en `line`**. En barras el color y la posición ya
      separan; en área el apilado hace que atenuar una capa deje un hueco.
- [x] Si el usuario ha fijado el color de alguna serie a mano, no se atenúa ninguna: ha decidido él.

---

## Fase E — Verificación

- [x] `node --check` sobre los archivos de servidor tocados.
- [x] `npx vite build` sin errores nuevos.
- [x] Repaso de esta lista, punto por punto, marcando lo que quedó fuera y por qué.

---

## Fuera de este plan… hasta que dejaron de estarlo

Los tres puntos de abajo se apartaron en la parte 1 y **se hicieron después**. Se dejan escritos
para que se entienda el orden en que ocurrió, no como pendientes:

- ~~**Modos de composición** y la retirada de bloques por alto~~ → parte 2.
- ~~**Adaptación por formato de salida**~~ → parte 2 y, de verdad, parte 4 con el lienzo propio.
- ~~**Encender el KPI por defecto**~~ → parte 3, con el visto bueno del usuario.

---

## Resultado de la fase E

- `node --check` sobre `server/ai/chartStory.js` y `server/index.js`: **pasa**.
- `npx vite build`: **pasa**, sin errores nuevos.
- Matriz del KPI comprobada con los siete casos: la combinación rota de hoy
  (`total` + `first`) ya no produce pastilla; `total` + `previous` con ventana 6 da +48.2 %
  sobre datos reales; `first` nunca la produce.
- Formato del pie: `Peak: 630.0K | Low: 423 | Average: 429.3K` — tres números, un solo estilo.
- Narrativa estable ante el desorden de las filas.

### Dos errores míos durante la implementación, por si vuelven a aparecer
1. Usé `isDateColumn` cuando el prop llega desestructurado como `isDateCol`. Habría sido
   `undefined` en tiempo de ejecución.
2. Usé `isStacked` en la cabecera del componente cuando se define 400 líneas más abajo — error de
   zona muerta temporal. Se resolvió no dependiendo de él: la jerarquía solo aplica a `line`,
   porque atenuar una capa de un apilado deja un hueco.

---

# Parte 2 — El sistema completo

La primera parte corrigió lo roto. Esta implementa lo que quedaba del contrato: los modos de
composición, la retirada de bloques por alto, y la adaptación real a cada formato de salida.

## Hallazgo previo: la exportación no re-maqueta

`utils/exportChart.js` captura el elemento del DOM **tal como está en pantalla** con html2canvas y
lo encaja en el lienzo de destino preservando proporción — o sea con **bandas**. Exportar a 9:16
desde un panel apaisado no produce una figura vertical: produce la figura apaisada con dos franjas
de fondo arriba y abajo.

Eso convierte la fase H en algo más que asignar un modo por preset: hay que **re-maquetar antes de
capturar**.

---

## Fase F — Modos de composición

### F1 · La clave
- [x] `DEFAULT_CONFIG.layout: 'auto'` — valores `auto | stacked | split-header | side`.

### F2 · Deducción automática
- [x] Con `auto`, elegir por la proporción del hueco medida con un `ResizeObserver`:
      relación ≥ 2.1 → `side`; ≥ 1.5 → `split-header`; por debajo → `stacked`.
- [x] Un modo elegido a mano siempre gana.

### F3 · La figura se reorganiza
- [x] Construir los bloques como una lista de piezas con nombre en vez de JSX suelto en el orden
      del render, y colocarlos según el modo.
- [x] `stacked`: columna, como hoy.
- [x] `split-header`: título y subtítulo a la izquierda, KPI a la derecha, en una fila.
- [x] `side`: rejilla de dos columnas — texto a la izquierda, leyenda y lienzo a la derecha.

### F4 · El control
- [x] Selector en `FormatPanel`, que es donde vive lo de forma y espaciado.

---

## Fase G — Retirada de bloques por alto

- [x] Por **umbrales de alto**, no midiendo bloque a bloque: es predecible y no provoca reflujos
      en cadena. Orden fijo — nota al pie → subtítulo → fuente y firma → conclusión.
- [x] Título, KPI y lienzo no se retiran nunca.
- [x] No aplica en modo informe ni a pantalla completa: ahí sobra el alto.

---

## Fase H — Adaptación por formato de salida

### H1 · Cada preset lleva su maqueta
- [—] **Descartado**: al re-maquetar a la proporción de destino, `resolveLayout()` elige el modo
      solo y acierta en los cinco formatos. Un campo `layout` en cada preset habría sido
      configuración que nadie lee, o dos fuentes para lo mismo. Lo que sí se hizo fue **ajustar
      los umbrales** para que cada formato caiga donde dice el contrato.
- [—] `textScale` por preset: tampoco hace falta. La escala sale de que el elemento se captura a
      su tamaño de trabajo y se reescala al de destino.

### H2 · Re-maquetar antes de capturar
- [x] En `exportChartAsPng`, fijar temporalmente el elemento a la **proporción de destino** antes
      de llamar a html2canvas, y restaurarlo después.
- [x] Con eso el resultado deja de tener bandas: la figura se dibuja para el formato.

---

## Fase I — Verificación
- [x] `npx vite build`.
- [x] Repaso punto por punto.


---

## Resultado de la parte 2

Comprobado con `resolveLayout()` sobre las medidas reales de cada preset:

| formato | proporción | modo |
|---|---|---|
| PowerPoint 16:9 | 1.78 | **lateral** |
| Banner ancho | 1.91 | **lateral** |
| PowerPoint 4:3 | 1.33 | apilado |
| Cuadrado 1:1 | 1.00 | apilado |
| Historia 9:16 | 0.56 | apilado |
| Panel del IDE | ~1.57 | cabecera partida |
| Forzado a mano | — | gana siempre |

`npx vite build` pasa.

### Decisiones que tomé sobre la marcha

- **La retirada de bloques va por umbrales de alto, no midiendo pieza a pieza.** Medir cada bloque
  obliga a pintar, medir y volver a pintar, y con el lienzo dentro son dos reflujos por cada cambio
  de tamaño. Con umbrales el resultado es el mismo y es predecible.
- **No se retira nada en modo informe ni a pantalla completa**: ahí sobra el alto y esconder cosas
  sería perder información sin motivo.
- **Las siete piezas se declaran una vez y se colocan según el modo**, en vez de escribir tres
  variantes del mismo JSX. El orden vive en un solo sitio.
- **La restauración del tamaño al exportar va en `finally`.** Si la captura falla a media, sin eso
  la tarjeta se quedaría clavada en el tamaño de exportación dentro de la aplicación.

### Lo que sigue sin estar probado en la aplicación

El build pasa y la lógica de modos está verificada con las medidas de cada formato, pero el
reordenado de la tarjeta, la retirada por alto y la exportación re-maquetada **solo se ven
ejecutando**. Hace falta abrir un `.amoxvis`, cambiar de modo y exportar a 9:16 y a 16:9.

---

# Parte 3 — Que salga así de fábrica

El contrato dejó de ser una aspiración: los valores de fábrica se ajustan para que un gráfico
**recién creado** salga ya con la cara de los especímenes, sin tocar un panel.

| clave | antes | ahora | por qué |
|---|---|---|---|
| `borderStyle` | `none` | `subtle` | El filete de 1 px hace que la tarjeta se lea como un objeto. |
| `cardStyle.radius` | 8 | **12** | Más redondo que un panel del IDE: se lee como algo exportable. |
| `cardStyle.shadow` | `false` | **`true`** | Es lo que despega la figura del fondo. |
| `fontFamily` | `system` | `manrope` | La fuente de la aplicación, para que figura e interfaz hablen igual. |
| `legendPosition` | `bottom` | **`inline`** | Tejida en la línea del subtítulo, con los gemelos de texto. |
| `headline.visible` | `false` | **`true`** | La cifra es parte de la tarjeta, no un extra. |
| `titleMark` | `false` | `true` | El punto de acento tras el título. |
| `signature.visible` | `false` | `true` | Cierra el pie de la figura. |
| `lineAreaFill` | `false` | `true` | El degradado discreto bajo la línea. |
| `showXAxisTitle` / `showYAxisTitle` | `true` | **`false`** | «mes» debajo de unas fechas no añade nada. |
| `barRadius` | 4 | 3 | |
| `showAxisLines` | `true` | `false` | (parte 1) La rejilla punteada ya marca el nivel. |
| `showDots` | `false` | `true` | (parte 1) Con el umbral de 40 no ensucian. |

**No toca los `.amoxvis` que ya existen.** Al guardar se escribe el estado completo, así que un
archivo guardado trae todas sus claves y gana sobre el defecto. Solo cambia lo que nazca a partir
de ahora — comprobado leyendo `LOAD_CONFIG`, que parte de `DEFAULT_CONFIG` y le superpone el
archivo.

Todo sigue siendo ajustable desde los paneles: es un punto de partida, no una jaula.

---

# Parte 4 — El lienzo tiene tamaño propio

Salió de una observación del usuario: **la misma figura se exportaba distinta según si el
explorador de archivos estaba abierto o cerrado.** No era un fallo de la exportación — era que
la tarjeta se estiraba para llenar el hueco, así que su forma dependía del ancho del panel.

- [x] `CANVAS_SIZES` y la clave `canvasSize` (por defecto **4:3**). La tarjeta tiene proporción
      propia y lo que sobra alrededor queda vacío. Lo que ves es lo que se descarga.
- [x] Barra bajo el gráfico con las proporciones y un **zoom**. El zoom es solo para mirar: no
      entra en la exportación.
- [x] `Libre` conserva el comportamiento anterior de ocupar todo el hueco.

## El choque de conceptos que hubo que deshacer

La primera versión tenía dos ideas peleándose: el zoom al 100 % significaba «lo más grande que
quepa», y a la vez la tipografía escalaba con el tamaño de la tarjeta. Resultado: la figura se
veía siempre ampliada aunque el control marcara 100 %.

- [x] **Existe un tamaño natural**: la caja de diseño es 880×620, y de ahí sale el ancho de cada
      proporción (4:3 → 827, 16:9 → 880, 1:1 → 620, 9:16 → 349).
- [x] **Al 100 % la figura mide eso y el texto va a su tamaño real.** 18 px son 18 px.
- [x] **El zoom multiplica la tarjeta entera** — caja, texto y dibujo a la vez.
- [x] La escala del texto sale del tamaño **medido** de la tarjeta, así que funciona igual en el
      editor y durante la exportación, donde recibe medidas mucho mayores.
- [x] El botón alterna entre **ajustar al hueco** y **tamaño real**.

## Y lo que se arregló por el camino

- [x] La exportación capturaba el div interior en vez de la tarjeta: el PNG salía sin filete ni
      esquinas. Ahora hay un `cardRef` y lo usan PNG, SVG y portapapeles.
- [x] La barra de botones se marca con `data-export-hide` y además **flota en la esquina** en vez
      de ocupar una fila. Si ocupa alto, el aire de arriba depende de si los botones están — y en
      la exportación no están.
- [x] Aire uniforme por los cuatro lados, y escalado con la tarjeta.
- [x] Marco del 3,5 % alrededor de la tarjeta en el PNG: sin él, el filete caía en el canto de la
      imagen y dejaba de leerse como tarjeta.
- [x] Etiquetas del treemap arriba a la izquierda y con tamaño proporcional a la baldosa.

---

# Parte 5 — Lo que el contrato pedía por tipo de gráfico

La sección 04 del contrato describe qué cambia en cada tipo. Nunca se convirtió en puntos del
plan, y al repasarlo aparecieron dos huecos — uno de ellos abierto por mí.

- [x] **Dispersión y burbujas conservan sus títulos de eje.** Al apagarlos por defecto en la
      parte 1 dejé esos dos gráficos sin decir qué miden, que es justo lo contrario de lo que
      dice el contrato: ahí los dos ejes son variables distintas y ninguna se deduce sola. Ahora
      son una excepción explícita, por encima de la configuración.
- [x] **El donut lleva su total en el centro del anillo** (`donutCenterKpi: 'total'`), y la cifra
      de la cabecera se omite para ese tipo: repetirla arriba sobra.

Lo que el contrato describe y **ya hacía la aplicación**: leyenda obligatoria en apilados y
composición, etiquetas dentro de las bandas del embudo, colores semánticos en la cascada,
categorías al lado izquierdo en barras horizontales, y escala de color en el mapa de calor.

---

# Parte 6 — Auditoría de las opciones

Dos preguntas: ¿queda alguna opción muerta (con control pero que ya no se aplica)? ¿y se ofrece
cada una solo donde tiene sentido?

## Opciones muertas: ninguna

Comprobado con un barrido sobre las **77 claves** de `DEFAULT_CONFIG`, cruzando cada una contra
su consumo en el renderizador, el contenedor y las utilidades, y contra su control en los paneles.
Ninguna clave tiene control sin lector. Las dos que aparecen «sin control en paneles» —
`chartType` y `canvasSize` — sí lo tienen, fuera de `panels/`: el selector de tipo y la barra del
lienzo.

## Opciones que se ofrecían donde no aplican

- [x] **`isCartesian` era `!isDonut`.** La tarta, el treemap, el embudo y el mapa de calor —que
      tampoco tienen ejes— seguían enseñando escala logarítmica, dominio del eje Y, títulos de eje
      y rejilla. Ahora hay **una sola definición** (`tieneEjes` en `constants.js`) y la usan los
      dos paneles. Opciones presentes que no hacen nada son peor que opciones ausentes: se tocan,
      no pasa nada, y uno cree que algo está roto.
- [x] **El formato numérico ya no se oculta con el anillo.** Aplica siempre: etiquetas, tooltips y
      el KPI. Antes el panel entero desaparecía en donut.
- [x] **La rejilla y las líneas de eje** salen de «Grid & Legend» en los tipos sin ejes; la
      leyenda se queda, porque esa sí aplica a todos, y la sección se retitula.
- [x] **La tarta recupera sus controles de etiqueta.** Comparte renderizador con el anillo, así
      que `donutLabelContent`, `donutLabelPosition` y el umbral de agrupación le aplican — pero
      `isDonut` era estricto y se los negaba. Ahora `esCircular` cubre a las dos y `soloAnillo`
      guarda lo que de verdad necesita hueco: el grosor y la cifra del centro.

## La matriz resultante

| tipo | ejes/rejilla | formato | leyenda | línea | barra | anillo | meta/ref | tendencia | destacado | anotaciones |
|---|---|---|---|---|---|---|---|---|---|---|
| bar, bar-stacked, bar-100 | sí | sí | sí | — | sí | — | sí | sí | sí | sí |
| bar-horizontal (y apiladas) | sí | sí | sí | — | sí | — | sí | — | sí | sí |
| line, area | sí | sí | sí | sí | — | — | sí | sí | sí | sí |
| combo | sí | sí | sí | sí | — | — | sí | — | — | sí |
| scatter, bubble | sí | sí | sí | — | — | — | sí | — | — | — |
| waterfall | sí | sí | sí | — | — | — | sí | — | — | — |
| donut | — | sí | sí | — | — | sí | — | — | — | — |
| pie | — | sí | sí | — | — | etiquetas | — | — | — | — |
| treemap, funnel, heatmap | — | sí | sí | — | — | — | — | — | — | — |

### Lo que dejo anotado y no toco

`combo` no ofrece «Destacado» porque `supportsHighlight` es `isLine \|\| isBar` y combo no es
ninguno de los dos según esa clasificación. Tiene barras y línea, así que probablemente debería
ofrecerlo. Es anterior a este trabajo y cambiarlo es una decisión de producto, no un arreglo.
