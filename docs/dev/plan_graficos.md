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

## Fuera de este plan, a propósito

- **Modos de composición** (apilado / cabecera partida / lateral) y la retirada de bloques por
  alto disponible. Es una función nueva con su propia clave de configuración.
- **Adaptación por formato de salida.** Depende de lo anterior.
- **Encender el KPI por defecto.** Decisión del usuario.

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
