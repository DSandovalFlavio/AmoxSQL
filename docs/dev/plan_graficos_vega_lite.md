# Gráficos en Vega-Lite — análisis y plan (5.16 → 5.18)

> Estado: **5.16, 5.17 y 5.18 implementadas (2026-10-26)**, sin publicar — PR #208. Pendiente: la selección que filtra otras figuras (ver bitácora). La 6.0 va en otra sesión.
> Prueba: [`graficos-vega-lite/`](graficos-vega-lite/) — las 12 figuras de referencia escritas en Vega-Lite,
> compiladas y renderizadas (abre `galeria.html`).
> Relacionado: [`plan_6_0_duckdb_2.md`](plan_6_0_duckdb_2.md) (rama `claude/plan-6-0`), `sistema_graficos.html`, `plan_story_flow.md`.

## 0. En una frase

Un gráfico de AmoxSQL debería ser **un Vega-Lite válido con una capa AmoxSQL encima**, no un formato
propio. Las 12 figuras de referencia salen en Vega-Lite con 40–86 líneas cada una. Con el sistema actual,
4 salen bien, 4 salen con trucos en el SQL y 4 no se pueden hacer. Además, revisar el sistema destapó
dos fallos que hoy dibujan datos equivocados sin avisar (§3).

---

## 1. Cómo se construye hoy un gráfico (Story Flow)

### 1.1 El archivo

`.amoxvis` es un JSON plano: el estado completo del editor (**78 claves**, `DEFAULT_CONFIG` en
`DataVisualizer/constants.js`) más `query`. No lleva datos, porque la consulta se vuelve a correr al abrir.
Las claves describen **un tipo de gráfico con opciones**, no una gramática:

```json
{ "chartType": "bar-horizontal", "xAxisKey": "campana", "yAxisKeys": ["roas"],
  "highlightConfig": { "type": "min", "value": "", "color": "#f2545b" },
  "refLine": { "value": 1, "label": "", "color": "#555", "style": "dashed" },
  "showLabels": true, "colorTheme": "default", "query": "SELECT …" }
```

Cada capacidad nueva ha sido una clave nueva: `goalLine`, `trendLine`, `refArea`, `annotations`,
`headline`, `donutCenterKpi`, `scatterQuadrants`, y así hasta las 78. `useChartState.js` arrastra
migraciones de nombres viejos (`barStacked`, `lineSmooth`, `yAxisLog`, `maxItems`) y tipos compuestos
(`bar-100`, `bar-horizontal-stacked`).

### 1.2 La tubería

1. **Datos** → `processChartData` (`utils/dataProcessing.js`). Siempre **agrupa por X y suma Y**,
   pivota por `splitByKey`, ordena, acumula y corta en `limit` (**50 por defecto**).
2. **Dibujo** → `ChartRenderer.jsx` (1,143 líneas). Es un `if` por cada `chartType` que arma
   componentes de Recharts a mano. Cada tipo reimplementa ejes, rejilla, etiquetas y resaltado.
3. **Capas** → `refLine`, `goalLine`, `refArea`, `annotations` y `trendLine` son `Reference*` de
   Recharts. Solo existen en los ejes que cada tipo decidió soportar.
4. **Tarjeta** → `DataVisualizer.jsx` (1,097 líneas) pone el título-afirmación, el subtítulo con la
   leyenda tejida, el KPI, la conclusión, la fuente y la firma.

### 1.3 Quién depende del formato

Unos 50 archivos lo leen o lo escriben:

- **Report Flow:** `AmoxChartEmbed`, `deckParser`, `SlideCharts`, `generatePptxReport` y
  `officeChartMapper`, que hace PowerPoint nativo solo para bar, line, area, donut, pie y combo.
- **Lienzo y cuaderno:** el Lienzo guarda `t.grafico` en cada tarjeta; el cuaderno lo guarda en
  `.sqlnb.state.json` y en `exportar.js`.
- **Data Flow:** el nodo `chart` de `ChainExecutor`.
- **Asistente:** la herramienta `display_chart`, con 40 parámetros snake_case que se traducen a las
  claves; además `chartStory` y `compaction`.
- **Otros:** la galería (`galleryChartDefinitions.js`), la marca del workspace y la paleta de comandos.

### 1.4 Lo que sí es bueno y hay que conservar

Esto no es la gramática; es la **capa editorial**, y es lo que hace que una figura de AmoxSQL se vea
de AmoxSQL:

- el título como afirmación, la conclusión y la fuente;
- la leyenda tejida con colores gemelos de texto (Sterling);
- el KPI de cabecera y el lienzo con proporción fija (lo que ves es lo que se exporta);
- las paletas por propósito;
- las reglas del asistente para elegir el gráfico.

---

## 2. Las 12 figuras de referencia

Columnas:

- **Hoy:** qué tan viable es con Story Flow.
- **Vega-Lite:** líneas del JSON con formato en `graficos-vega-lite/NN_*.vl.json`. Todas compilan con
  vega-lite 6.4.3 y se renderizan con vega 6.2.0 (SVG en la misma carpeta).

| # | Figura | Hoy | Por qué | Vega-Lite |
|---|---|---|---|---|
| 1 | CVR diario con un tramo en rojo | **Con truco** | Solo hay resaltado de un punto (máx, mín o exacto). Hay que partir la serie en dos columnas en el SQL. Además el `limit` de 50 corta 153 días a 50 (§3) | 47 · capa con `filter` por rango de fechas |
| 2 | Histograma con media y mediana | **Con truco / parcial** | No hay histograma: los cubos se hacen en SQL. Media y mediana son líneas **verticales** sobre un eje de categorías, y `refLine` solo va en el eje de valores | 78 · `bin` + 2 `rule` con `aggregate: mean/median` |
| 3 | Barras horizontales agrupadas, eje % | **Sí** | `bar-horizontal` con dos Y, `percent`, `seriesConfig` | 52 · `yOffset` |
| 4 | Caja y bigotes con atípicos | **No** | No hay boxplot | 40 · `mark: boxplot` + color condicional |
| 5 | Histograma, media sólida y mediana punteada | **Con truco / parcial** | Igual que el 2 | 86 |
| 6 | Dos series normalizadas min-max | **Sí** | La normalización va en el SQL | 70 · con la normalización hecha en la figura (`fold` + `joinaggregate` + `calculate`) |
| 7 | Línea gris con un punto resaltado | **Sí** | `highlightConfig: exact`. El marcador es el ícono propio, no un punto | 56 |
| 8 | Dispersión coloreada por temporada | **No (dibuja mal)** | La dispersión **suma** los puntos con el mismo X y corta en 50 (§3) | 42 · 104 de 104 puntos |
| 9 | Matriz de correlaciones divergente | **Parcial** | El `heatmap` interpola entre dos colores de min a max. No hay escala divergente centrada en 0 ni barra de color | 65 · `domainMid: 0` + texto |
| 10 | Ranking con barras < 1 en rojo y regla en 1 | **Con truco** | No hay color por umbral: hay que partir en dos series apiladas. `refLine` sí va en X | 72 · `condition: datum.roas < 1` + `rule` |
| 11 | Barras con intervalos de confianza | **No** | No hay barras de error | 50 · `mark: errorbar` con `x`/`x2` |
| 12 | Dispersión con recta de regresión | **No** | `trendLine` solo se dibuja en línea y barras; además está la suma del §3 | 42 · `transform: regression` |

**Simplicidad.** En las figuras sencillas, el formato actual es más corto: la 7 son unas 8 claves y en
Vega-Lite unas 20 líneas útiles. A partir de ahí, el formato actual simplemente no llega.

En Vega-Lite las figuras se arman con las mismas cinco piezas:
- `mark`: qué se dibuja;
- `encoding`: qué columna va a qué canal;
- `transform`: cálculo;
- `layer`: superposición;
- `condition`: resaltado.

Con esas piezas, la media de la figura 2 es la misma idea que la regla de la 10 y que la recta de la 12.
En el formato actual cada una de esas tres cosas es una clave distinta (o no existe).

**La forma de recuperar la sencillez es poner recetas encima de la gramática, no claves nuevas.**

---

## 3. Fallos encontrados (hoy, en 5.15.1)

Los dos primeros merecen arreglo aunque no se haga nada más; ver la fase 0.

1. **La dispersión agrega los puntos.** `processChartData` agrupa por X y suma Y para todos los tipos.
   Prueba con 100 filas, 60 de ellas con `tv = 0`: se dibujan **41 puntos**, y el punto de X = 0 vale
   **137,700,000**, que es la suma de 60 semanas. Pasa sin avisar.
2. **`limit: 50` por defecto en todos los tipos.** Una serie diaria de 153 días (figura 1) se queda en
   los primeros 50 días. La dispersión pierde puntos. Tiene sentido en un ranking, no en una serie ni
   en una dispersión.
3. **El mapa de calor no es divergente.** Interpola de `palette[0]` a `palette[3]` entre el mínimo y el
   máximo. Una correlación de −0.2 y una de +0.2 pueden salir con el mismo tono.
4. **`trendLine` se ofrece en tipos que no la dibujan** (dispersión, combo). La opción existe, se toca
   y no pasa nada.

---

## 4. Story Flow frente a Vega-Lite, Deneb y Altair

En realidad son **un formato y dos programas que lo hablan**:
- **Deneb** es un visual de Power BI donde se pega un JSON de Vega-Lite (o Vega). Los datos del
  informe llegan con el nombre `"dataset"`.
- **Altair** es una API de Python que **produce** JSON de Vega-Lite (`chart.to_dict()`) y lo lee
  (`alt.Chart.from_dict(spec)`).

El denominador común es el JSON de Vega-Lite.

| | Story Flow (hoy) | Vega-Lite | Deneb | Altair |
|---|---|---|---|---|
| Modelo | Tipo de gráfico + 78 opciones | Gramática: mark, encoding, transform, layer, facet, concat, params | Vega-Lite / Vega | Vega-Lite desde Python |
| Datos | Filas de la consulta, agrupadas y sumadas en JS | `data` (valores, url o **nombre**) + transforms | `{"name": "dataset"}` | DataFrame |
| Composición | No (un tipo por figura; combo fijo) | Capas, facetas, concatenación, gráficos repetidos | Igual | Igual (`+`, `|`, `&`, `facet`) |
| Estadística | Tendencia lineal y media móvil | bin, aggregate, quantile, regression, loess, density, window, joinaggregate | Igual | Igual |
| Marcas | 17 tipos | bar, line, area, point, circle, rect, rule, text, tick, trail, arc, boxplot, errorbar, errorband, geoshape | Igual + Vega completo | Igual |
| Interacción | Tooltip | Selecciones, filtros cruzados, zoom, controles (`params`) | Igual | Igual |
| Estilo | Paletas + tarjeta editorial | `config` (tema) | `config` + plantillas | Temas registrados |
| Portabilidad | Ninguna fuera de AmoxSQL | Estándar abierto (BSD-3) | Plantillas JSON | JSON |
| Qué sabe la IA | Solo lo que dice el prompt | Mucho: hay especificaciones públicas por miles | — | — |

**Lo que Story Flow tiene y ellos no:** la tarjeta editorial (§1.4), el PowerPoint nativo, y el
asistente que razona la elección del gráfico. Todo eso se puede mantener **encima** de Vega-Lite.

---

## 5. La propuesta

### Dec-69 — El archivo `.amoxvis` es un Vega-Lite válido

El `.amoxvis` pasa a ser un JSON de Vega-Lite v6. Todo lo que es de AmoxSQL va en `usermeta`, el campo
que la especificación reserva para metadatos de la aplicación (los renderizadores lo ignoran):

```json
{
  "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
  "data": { "name": "dataset" },
  "title": { "text": "Tres campañas no recuperan lo que cuestan",
             "subtitle": "ROAS de Moda Nube, 2025. Línea punteada: ROAS = 1" },
  "encoding": { "y": { "field": "campana", "type": "nominal", "sort": "-x" },
                "x": { "field": "roas", "type": "quantitative" } },
  "layer": [
    { "mark": "bar", "encoding": { "color": { "condition": { "test": "datum.roas < 1", "value": "#f2545b" }, "value": "#b8bcc4" } } },
    { "mark": { "type": "rule", "strokeDash": [3, 3] }, "encoding": { "x": { "datum": 1 } } }
  ],
  "usermeta": { "amoxsql": {
    "version": 2,
    "consulta": "SELECT campana, ingresos / gasto AS roas FROM campanas_2025",
    "tarjeta": { "conclusion": "…", "fuente": "…", "kpi": null, "firma": true, "lienzo": "4:3" },
    "tema": "amox"
  } }
}
```

Las reglas que se siguen de esto:

- **Los datos se llaman `dataset`.** Es exactamente la convención de Deneb, así que el archivo se pega
  en Deneb sin tocar.
- **Título y subtítulo van en `title` de Vega-Lite** (que es estándar y viaja), aunque la tarjeta los
  dibuje en HTML.
- **El aspecto no va en el archivo.** El tema `amox` es un `config` de Vega-Lite que se genera **al
  renderizar** desde los tokens CSS (claro u oscuro, acento, fuente). Si el usuario cambia algo a mano
  (un color o un tamaño), eso sí va en `config` dentro del archivo, que también es estándar.
- **Si se quita `usermeta`, queda un Vega-Lite que se ve correcto en cualquier parte.** Con `usermeta`,
  se ve «nuestro» dentro de AmoxSQL.

### Dec-70 — Se renderiza con Vega-Lite, no con una imitación

Escribir un renderizador propio «compatible» sobre Recharts sería reimplementar la gramática: capas,
transformaciones, escalas y facetas. Eso es justo lo que hoy hace `ChartRenderer` tipo por tipo, y por
eso se queda corto. La alternativa es usar `vega-lite` (compilador) y `vega` (runtime):

- **Licencia:** BSD-3-Clause.
- **Peso:** 177 KB + 80 KB comprimidos. No importa en una app de escritorio.
- **Seguridad de contenido:** la app no tiene CSP hoy. Si algún día se pone una, existe el intérprete
  de expresiones sin `eval`.
- **Accesibilidad:** cada marca sale con `aria-label` («Mean of cpa: 1,860»).
- **Idioma:** con `formatLocale` / `timeFormatLocale` en es-MX, los meses salen como «abr», «may».

Recharts queda solo en `DataProfiler`, y se puede retirar después.

### Dec-71 — Los datos pesados los hace DuckDB

Las transformaciones de Vega-Lite corren en el renderizador sobre las filas recibidas. Hasta unas
decenas de miles de filas va bien. Para más:

1. La figura avisa y ofrece agregar en la consulta.
2. En 5.18, las transformaciones simples (`aggregate`, `bin`, `timeUnit`, `filter`) se traducen a SQL y
   se empujan a DuckDB, y el renderizador recibe ya los cubos.

La consulta sigue siendo la fuente.

### Dec-72 — La sencillez vive en recetas, no en claves

Story Flow conserva sus etapas (Tipo → Datos → Formato → Estilo → Historia → Exportar), pero cada panel
**edita el spec**:

- **Tipo:** recetas que generan el spec de partida (columnas, barras, línea, área, dispersión,
  histograma, caja, barras con error, mapa de calor, rampa, embudo, cascada…). Las 12 figuras de
  referencia son recetas.
- **Datos:** estantes de codificación (X, Y, color, tamaño, forma, opacidad, filas/columnas de faceta).
  Es lo mismo que hoy son `xAxisKey`, `yAxisKeys` y `splitByKey`, pero escrito en `encoding`.
- **Historia:** las capas analíticas son capas reales. Media, mediana, meta o umbral son una `rule`;
  una banda o un periodo, un `rect`; un resaltado, una `condition`; una tendencia, un `regression` o
  `loess`; las etiquetas, `text`.
- **Una pestaña «Spec»:** Monaco con el esquema JSON de Vega-Lite (autocompletado y validación
  incluidos). Quien viene de Deneb o Altair escribe ahí directamente, y lo que se edita en los paneles
  se ve en el JSON.

### Dec-73 — El asistente escribe Vega-Lite

`display_chart` recibe `spec` (Vega-Lite) más los campos de la tarjeta (título-afirmación, conclusión).
Las reglas de elección del gráfico del prompt se quedan. El servidor compila el spec. Si hay errores o
avisos, se los devuelve al modelo para que corrija; es el mismo ciclo que ya existe para `display_chart`.

Los modelos locales pequeños conocen Vega-Lite peor que los grandes, así que se deja también un camino
corto: `recipe` + campos. El servidor arma el spec con la receta.

### Dec-74 — Salir con tu gráfico

Para exportar:

- **Vega-Lite:** el JSON con los datos dentro (`data.values`). Abre en cualquier editor de Vega-Lite.
- **Para Deneb:** el JSON con `{"name": "dataset"}`. Opcionalmente lleva el `config` de AmoxSQL para
  conservar el aspecto.
- **Para Altair:** el JSON más un fragmento de Python con `alt.Chart.from_dict(spec)` y la consulta en
  DuckDB.

Para importar: se pega un Vega-Lite (`PasteJsonModal` ya existe para el formato viejo), y si trae
`data.values` se ofrece guardarlo como consulta.

### Dec-76 — Interfaz o código: un interruptor en Story Flow

Por defecto se trabaja con los paneles. Un interruptor **Interfaz | Código** en la barra lateral izquierda
de Story Flow la cambia por un editor (Monaco, JSON con el esquema de Vega-Lite): el usuario escribe o
pega el spec directamente y la figura se redibuja al vuelo; un error de compilación se muestra debajo
del editor sin borrar la última figura buena.

- **Quién manda.** En modo interfaz el spec se **genera** desde los paneles (su estado viaja en
  `usermeta.amoxsql.interfaz`). En cuanto el usuario edita el código, el spec pasa a ser la fuente
  (`usermeta.amoxsql.modo = "codigo"`) y los paneles dejan de reescribirlo.
- **Volver a la interfaz** no destruye nada sin avisar: si el código fue editado, se pregunta
  «Regenerar desde la interfaz (se pierden los cambios del código)».
- **La tarjeta** (título, subtítulo, conclusión, fuente, firma) sigue en ambos modos: título y subtítulo
  salen de `title` del spec, el resto de `usermeta.amoxsql.tarjeta`.
- Sustituye a la pestaña «Spec» de Dec-72 y adelanta su llegada a la 5.16: es la salida de escape
  desde el primer día.

### Dec-77 — El código manda, y vuelve a los paneles (2026-10-27, sustituye a Dec-76)

Decisión del autor: los paneles se llenan con lo que diga el código, el código siempre
manda, y lo que los paneles no representan se señala.

- **Una sola figura**: `spec = aplicar(deStoryFlow(paneles), extras)` (`vega/codigo.js`).
  No hay «modo código» ni «modo paneles»; el interruptor es solo la vista.
- **Del código a los paneles** (`leerPaneles`): lentes sobre el spec (tipo de marca,
  columnas, títulos y rejilla de los ejes, escala, cero, orden, interpolación, radio,
  leyenda, meta, referencia, etiquetas, tendencia, resalte, facetas, etiquetas al final,
  zoom, leyenda interactiva, título). Solo se aplica lo que CAMBIÓ frente a la base.
- **Lo demás son extras** (`diferencia(base, código)`): un parche con las capas por
  nombre (`amox_principal`, `amox_meta`…), así sobrevive a los cambios de los paneles; una
  capa quitada en código sigue quitada. Garantía probada: lo dibujado es exactamente el
  código.
- **Señal**: aviso al pie de los paneles con la lista y *Remove custom code*; en el
  editor, las líneas de los extras en ámbar (`vega/ubicar.js` las ubica en el texto tal
  como está escrito).
- El `.amoxvis` guarda los extras en `usermeta.amoxsql.interfaz.extras` y una **huella**
  del spec: si no coincide al abrir, el archivo se editó fuera y se vuelve a asimilar.

### Dec-78 — Lo que Vega-Lite abre a quien no escribe Vega-Lite

Paneles nuevos sobre capacidades de la gramática que eran caras con el dibujo anterior:
pequeños múltiplos (`facet`), leyenda interactiva (`params` + `bind: legend`), etiquetas
al final de cada línea, banda de intervalo (`errorband`), columnas extra en el tooltip,
escala raíz cuadrada, «empezar en cero», zoom on/off. Tipos nuevos: piruleta, mancuerna,
bump (`window rank`), densidad (`density`) y franjas (`tick`). Qué enseña cada panel lo
decide una sola tabla (`panels/capacidades.js`).

### Dec-75 — El PowerPoint nativo sigue

`officeChartMapper` pasa a leer un subconjunto del spec: una sola vista, `bar`, `line`, `area` o
`arc`, con X, Y y color nominal. Es el mismo alcance que hoy. Todo lo demás va como imagen, y la imagen
sale de `view.toSVG()` / `toCanvas()` y no de una captura de pantalla.

### Los `.amoxvis` existentes

Como no hay usuarios fijos, no hace falta compatibilidad. Aun así, el conversor es barato y lo
necesitamos para la galería, el proyecto de ejemplo y nuestras propias figuras. Es una función pura
`deStoryFlow(config) → spec` que cubre los 17 tipos:

- **combo:** `layer` con ejes independientes.
- **donut y pie:** `arc`.
- **heatmap:** `rect`.
- **funnel y waterfall:** con `window` y `bar` con `y`/`y2`.
- **treemap:** no existe en Vega-Lite; se escribe como **spec de Vega** (decisión del autor, §8.2). El archivo sigue siendo estándar: Deneb también lee Vega.

Al abrir un archivo viejo, se convierte, y se reescribe al guardar.

---

## 6. Fases — antes de la 6.0

La 6.0 (DuckDB 2) va después y no se mezcla con esto: cambiar el motor y el formato de los gráficos a
la vez haría imposible saber qué rompió qué.

### Fase 0 — Prueba dentro de la app

- Los fallos del §3 **no se arreglan** en el sistema viejo (decisión del autor): desaparecen con el
  conversor, que solo agrega cuando el tipo lo pide (la dispersión dibuja cada fila) y solo limita
  rankings.
- Rama con `vega-lite` + `vega`:
  - Renderizar las 12 figuras **dentro de la app**, con el tema generado desde los tokens en claro y en
    oscuro.
  - Comparar con Recharts el tiempo de render con 2,000 y 20,000 puntos.
  - Probar un Lienzo con 12 tarjetas a la vez.
  - Probar `toSVG` en PowerPoint.
- Criterio para seguir:
  - la tarjeta se ve igual que hoy en las figuras básicas;
  - el render es igual o mejor;
  - el lienzo con 12 figuras no se traba.

### 5.16 — «Vega-Lite por dentro»

- Formato nuevo (Dec-69) y el conversor `deStoryFlow` (con pruebas: los 17 tipos y la galería).
- `ChartRenderer` → `FiguraVegaLite` (una vista, el tema y el locale). La tarjeta editorial se queda
  igual, encima.
- Todas las superficies: el editor, Report Flow, el Lienzo, el cuaderno, el chat y el nodo `chart` de
  Data Flow.
- El interruptor **Interfaz | Código** (Dec-76).
- Los paneles de Story Flow escriben el spec, pero con la misma interfaz de hoy. El usuario no nota el
  cambio salvo que ahora las cosas funcionan (dispersión, histograma, umbral).
- Exportar PNG/SVG desde la vista y PowerPoint nativo desde el subconjunto (Dec-75).
- Guarda: `scripts/probarGraficos.mjs`. Cada receta y cada figura de la galería debe compilar sin
  avisos.

### 5.17 — «Escribe el gráfico»

- Recetas nuevas: histograma, caja, barras con error, dispersión con recta, rampa, matriz divergente,
  tramo resaltado.
- Estantes de codificación y capas analíticas como capas reales (Dec-72).
- El editor de código gana autocompletado por el esquema y fragmentos de capas.
- El asistente con `spec` y con `recipe` (Dec-73). Las reglas del prompt se reescriben sobre
  mark/encoding.
- Documentación: la guía de Story Flow, una página «Tu gráfico es Vega-Lite» y capturas nuevas.

### 5.18 — «Sal con tu gráfico»

- Exportar e importar (Dec-74).
- Transformaciones simples empujadas a DuckDB (Dec-71).
- Interacción: selección que filtra otra figura del mismo Lienzo o deck, y zoom en series largas.
- Retirar Recharts si `DataProfiler` ya migró.

---

## 7. Riesgos

- **Fidelidad de la tarjeta.** Hay detalles hechos a mano sobre Recharts: el degradado bajo la línea,
  la leyenda tejida, el ícono del resaltado y los márgenes. Vega-Lite tiene degradados de color y
  leyendas configurables, y la leyenda tejida sigue siendo HTML de la tarjeta. Esto se mide en la fase 0
  con capturas lado a lado.
- **Muchas figuras montadas.** El Lienzo y los decks montan muchas vistas. Para el canvas se usa el
  renderizador `canvas` en series grandes y se limpian las vistas al desmontar (`view.finalize()`).
  También se mide en la fase 0.
- **Modelos locales.** Pueden escribir specs inválidos. Para eso están la compilación con corrección y
  el camino `recipe`.
- **Treemap.** Es un spec de Vega, no de Vega-Lite: el editor de código lo muestra, pero las
  recetas y estantes no lo tocan.
- **Nombres.** La regla del proyecto prohíbe nombrar tecnologías ajenas. Al adoptarlo, **Vega-Lite pasa
  a ser una dependencia** y se puede nombrar. En la documentación de usuario, Deneb y Altair se
  mencionan solo como ejemplos de «programas que leen Vega-Lite», en la página de exportación.

## 8. Decisiones del autor (2026-10-26)

1. **Vega-Lite puro con `usermeta`.** Sí.
2. **Treemap.** Se lleva a Vega.
3. **Orden.** 5.16 → 5.18 en esta sesión; DuckDB 2 (6.0) en otra.
4. **Arreglos del §3 en el sistema viejo.** No: todo se reemplaza; no se arregla lo que se va.
5. **Nuevo:** el interruptor interfaz/código en la barra lateral de Story Flow (Dec-76).

## 9. Fuentes

- Vega-Lite — https://vega.github.io/vega-lite/ (npm `vega-lite` 6.5.0, 2026-10-08; la prueba usó 6.4.3)
- Vega — https://vega.github.io/vega/ (npm `vega` 6.4.0; la prueba usó 6.2.0)
- `usermeta` — https://vega.github.io/vega-lite/docs/spec.html
- Deneb — https://deneb-viz.github.io/ (datos por nombre `dataset`)
- Altair — https://altair-viz.github.io/ (6.1.0, 2026-04-21; `Chart.from_dict`, `to_dict`)
- Galería comunitaria para Deneb — https://github.com/CodeWithBehnam/vegaviz

## 10. Bitácora

- 2026-10-26 — Análisis del sistema actual, prueba de las 12 figuras (`graficos-vega-lite/`), fallos
  §3 reproducidos con `processChartData` y 100 filas sintéticas.
- 2026-10-26 — Decisiones del autor (§8). Se añade Dec-76 (interruptor interfaz/código). Empieza la 5.16.
- 2026-10-26 — **5.16 hecha**: `vega/` (deStoryFlow, figura, FiguraVega + motor, tema, EditorCodigo), `server/amoxvis.js`, todas las superficies (editor, Report Flow, Lienzo, cuaderno, chat, galería, nodo de Data Flow). Fallos de la §3 resueltos por construcción. De paso: pestañas de gráfico restauradas sin consulta; nombres de serie con «T».
- 2026-10-26 — **5.17 hecha**: histograma, caja, barras con intervalo, pendiente; resaltes por umbral y por tramo; referencia en media/mediana; regresión y curva suavizada en dispersión; «Others» en el anillo; **Add layer…** en el modo Código (`vega/capas.js`); el asistente con los tipos nuevos y `vega_lite` compilado en el servidor (vega-lite pasa a dependencia del servidor).
- 2026-10-26 — **5.18 hecha**: *Take it elsewhere* (Vega-Lite con datos, plantilla `dataset`, script de Python — `vega/salida.js`), totales desde DuckDB cuando el resultado llega recortado (`vega/agregar.js`; antes un gráfico sobre >10 000 filas sumaba solo las primeras), zoom en dispersión y series largas, el Data Profiler en Vega y **Recharts fuera** (−267 KB en el paquete principal). Word encontraba las figuras por la clase de Recharts: arreglado.
- **Queda para después**: la selección que filtra otras figuras del mismo Lienzo o deck (necesita un canal entre tarjetas que hoy no existe); el PowerPoint nativo sigue leyendo los paneles (un gráfico en modo código va como imagen, Dec-75 sin cambios); el empuje a DuckDB de `bin`/`timeUnit` para histogramas de millones de filas.
- Pruebas: `scripts/probarGraficos.mjs` 115/115, `scripts/probarGraficoIA.mjs` 10/10.
- 2026-10-27 — **Dec-77/78**: el código manda y vuelve a los paneles (`codigo.js`, `ubicar.js`), aviso y líneas en ámbar, Guardar en la cabecera; auditoría de los paneles (siete opciones que no hacían nada, ahora sí; márgenes y «Hide if space» fuera), paneles reescritos en orden lógico desde `capacidades.js`; cinco tipos nuevos y ocho opciones nuevas; fechas en UTC (salían un día antes). Pruebas: 175 + 12.
