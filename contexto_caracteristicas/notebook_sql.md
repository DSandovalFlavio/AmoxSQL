# El cuaderno (.sqlnb)

## De qué va

Un cuaderno es un análisis partido en celdas donde **cada celda de SQL deja su consulta puesta en la sesión con el nombre de la celda**, para que la siguiente la lea por ese nombre. Nadie escribe `CREATE OR REPLACE TEMP VIEW`.

Eso no lo inventa la interfaz. `DatabaseManager` mantiene **una conexión viva por vía** (`main`, `meta`, `ai`), así que una vista temporal creada en una llamada sobrevive a la siguiente y encadena. La sesión ya era el dataframe; lo que faltaba era que la interfaz lo contara.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `client/src/components/cuaderno/CuadernoEditor.jsx` | El contenedor: documento, ejecución, estado visual, exportes |
| `client/src/components/cuaderno/Celda.jsx` | Celda de SQL: 520 px fijos, reparto inicial 40/60. Su cabecera sólo IDENTIFICA —nombre, descripción, qué deja— |
| `client/src/components/cuaderno/Canalon.jsx` | Los mandos, en el canalón izquierdo. Invisibles en reposo |
| `client/src/components/cuaderno/CeldaTexto.jsx` | Celda de texto SIN CAJA: es el documento. Sin borde, sin cabecera, sin tope de altura |
| `client/src/components/cuaderno/PantallaCompleta.jsx` | Una celda ocupando la pestaña entera |
| `client/src/components/cuaderno/Barra.jsx` | Barra derecha: índice, vistas vivas, parámetros |
| `client/src/utils/cuadernoFile.js` | Leer y escribir el archivo; lee además los tres formatos anteriores |
| `client/src/utils/celdaSql.js` | Qué se sabe de una celda antes de ejecutarla |
| `client/src/utils/vistaDeCelda.js` | Compone la vista implícita |
| `client/src/components/cuaderno/claves.js` | Con qué clave se guarda el estado visual, y cómo se reclava |
| `client/src/components/cuaderno/vistasVivas.js` | Cruza lo declarado con lo que el motor tiene vivo; parámetros |
| `client/src/components/cuaderno/grafo.js` | Dependencias, frescura y el orden de «Actualizar» |
| `client/src/components/cuaderno/exportar.js` | Traducción a Word y plan de tablero |
| `server/index.js` | `/api/cuaderno/celda`, `/api/cuaderno/vistas`, `/api/notebook-state` |

Las partes puras tienen prueba desde Node: `probarCuaderno`, `probarCeldaSql`, `probarVistaDeCelda`, `probarClavesCuaderno`, `probarVistasVivas`, `probarGrafoCuaderno`, `probarExportarCuaderno`.

---

## El formato

Markdown con cabecera. Se lee tal cual en cualquier editor y un diff enseña el análisis, no llaves de JSON.

```markdown
---
titulo: Caída de septiembre
parametros:
  desde: 2026-09-01
---

# ¿Por qué cayeron las ventas?

<!-- celda: ventas_limpias -->
```sql
-- Quito devoluciones
SELECT * FROM ventas WHERE NOT devuelta AND f >= {{desde}};
```
```

- El comentario `<!-- celda: nombre -->` da nombre a la celda; con ` materializada` detrás, la celda deja una tabla en vez de una vista.
- Se leen también JSON v3.0, v2.0 y el formato de marcadores `-- !CELL:CODE!`. Los tres se **guardan ya en el formato nuevo**, y las celdas `input` pasan a ser parámetros de la cabecera.
- Los parámetros usan `{{nombre}}`, la convención que ya compartían los cuadernos y los tableros (`injectEnvironmentVariables`). **No** la `${...}` del editor de consultas.

---

## La vista implícita

`analizarCelda` decide si la celda es envolvible —**una sola sentencia que empiece por `SELECT` o `WITH`**— y `componerCelda` produce dos piezas:

- `preparacion`: `CREATE OR REPLACE TEMP VIEW "nombre" AS (…)` más `COMMENT ON VIEW` con el comentario de cabecera.
- `lector`: `SELECT * FROM "nombre"`.

**Van dos piezas y no una** porque `applyRowLimit` sólo recorta un texto que empiece por `SELECT`: mandadas juntas, el texto empezaría por `CREATE` y la celda se traería la tabla entera al navegador. Y van en **una sola llamada** porque entre dos cabría una cancelación que dejaría la vista creada y las filas sin traer.

Los nombres van siempre entre comillas dobles: crear `"paso_1"` y leerlo como `paso_1` funciona, y así no hace falta llevar la lista de palabras reservadas.

### El aviso de nombre tapado

Medido contra el motor: una vista temporal llamada `ventas` tapa a la tabla `ventas` **y también a `main.ventas`**; sólo se escapa escribiendo el catálogo entero (`memory.main.ventas`). Por eso el servidor mira el catálogo y devuelve `{tapado}` **sin ejecutar nada** cuando el nombre choca con algo permanente.

---

## El grafo y la frescura

Las dependencias salen de `analisis.lee` —los nombres que cada celda consulta— cruzados con los nombres de celda: **por nombre, no por posición**.

Qué significa «desactualizado» hay que decirlo con cuidado. Una vista no guarda datos: leerla vuelve a ejecutar su cadena, así que en datos no envejece. Lo que envejece es la **definición puesta en la sesión** (se editó el SQL y no se volvió a ejecutar) y el **resultado que se ve en pantalla**. Lo segundo es lo que hace daño.

Cuatro estados: `nunca`, `dia`, `cambiada` (su SQL resuelto difiere del ejecutado) y `arriba` (algo de lo que depende cambió o corrió después).

Se compara la consulta **ya resuelta**, no la escrita: cambiar un parámetro cambia la consulta sin tocar una letra de la celda.

**El código se inclina a propósito.** Ante la duda, marcar como desactualizado: inventarse una dependencia cuesta una ejecución de más; perderla cuesta una cifra equivocada que nadie revisa. Al ejecutar, en cambio, se inclina al revés: una celda que escribe en disco se **aparta** de «Actualizar», porque repetir un `INSERT` duplica filas.

---

## La forma

El contrato visual está en `docs/dev/mockup_cuaderno_2.html`. Tres reglas, y de ellas cuelga
el resto:

1. **El cromo aparece a demanda y vive en el canalón izquierdo.** En reposo una celda enseña
   quién es y qué deja detrás; nada más. Diez botones por celda son ochenta en un cuaderno de
   ocho, y el que de verdad se usa —Ejecutar— competía con nueve vecinos.
2. **La prosa no vive en una caja.** Sin borde, sin cabecera y sin tope de altura. Llevó una
   medida de lectura de 70ch —como en las referencias, donde la prosa va más estrecha que el
   código— y se quitó: allí el código también está dentro de una columna de documento, y aquí
   ocupa todo el ancho, así que 490 px contra 1.400 no se leía como ritmo sino como una celda
   partida.
3. **La selección es una barra a la izquierda**, no un borde alrededor: un borde que cambia de
   color compite con el de la celda de al lado.

El hueco entre dos celdas es donde se añade. Antes la barra estaba al final del cuaderno, así
que meter una celda en medio obligaba a bajar hasta abajo y subirla a mano.

---

## El estado visual

Va en `.sqlnb.state.json`, bajo la clave `celdas`, **nunca en el documento**: el modo de cada celda, el reparto y la configuración del gráfico son de quien mira, no del análisis.

Dos cosas que no son obvias:

- **La clave es el nombre de la celda**, y la posición sólo mientras no tenga uno. No puede ser el identificador: se genera al leer el archivo, así que cambia en cada apertura. Como añadir, borrar, mover y renombrar corren las posiciones, toda modificación **reclava** el mapa (`reclavar` en `claves.js`).
- **El endpoint reescribe el archivo entero**, no fusiona. El mismo archivo puede llevar el `cells` de la notebook anterior, así que el editor guarda lo que no es suyo al leer y lo devuelve intacto al escribir.

Las ejecuciones (`{id: {en, sql}}`) viven **sólo en memoria**: guardarlas haría que al reabrir mañana las celdas se dieran por ejecutadas con la sesión vacía.

---

## Salidas

- **Word** (`generateWordReport`) — se queda. Un tablero se proyecta; un documento circula. Las figuras se capturan del DOM vivo apuntando al `.recharts-wrapper` de cada celda, que es exactamente la figura y no puede recortarse; la celda necesita `data-cell-id`.
- **Tablero** — el texto se vuelve prosa y cada celda con gráfico una diapositiva, con su `.amoxvis` escrito en `charts/`. Qué celdas tienen gráfico se lee **del estado**, no del DOM.
- **Retirados**: modo Informe, modo Presentación, export a HTML y export a PowerPoint del cuaderno. Duplicaban al tablero, que lo hace mejor y tiene el puente a un botón.

---

## Rendimiento: dos trampas que sólo aparecen con un cuaderno largo

Las dos salieron con un EDA de 31 celdas, y ninguna se ve con tres.

**Los callbacks que van a `ResultsTable` no pueden nacer en el render.** El avisador de
cambios de Story Flow (`useConfigChangeNotifier`) tiene su efecto dependiendo de la identidad
de `onConfigChange`. Con una flecha escrita en el JSX, esa identidad cambia en cada pintado:
el efecto se re-arma, a los 500 ms escribe la configuración del gráfico, eso provoca otro
pintado, y vuelta a empezar. Con dieciséis celdas montadas a la vez el cuaderno se queda
clavado y el `.state.json` engorda a 54 KB de configuraciones que nadie pidió — incluidas las
de celdas que están en tabla, porque **`DataVisualizer` se monta siempre y sólo se oculta por
CSS**.

Por lo mismo, `cambiarEstado` lee las claves de una referencia en vez de depender de ellas:
las claves se recalculan al cambiar `doc.celdas`, o sea en cada pulsación.

**El cuerpo de la celda se monta sólo cerca de lo que se ve** (`useCerca.js`). Treinta celdas
son treinta editores de código y treinta tablas de resultado con su motor de gráficos detrás;
medido, dieciséis instancias de Monaco antes de tocar nada. Con el gancho quedan una o dos.

Esto **no es virtualizar una lista** —que el proyecto prohíbe, y con razón—: aquí no se mide
ninguna altura. La celda de SQL tiene un alto fijo, así que su hueco ocupa lo mismo esté
montada o no y el contenedor de desplazamiento no cambia de tamaño jamás. Medido: 12.700 px
arriba, a mitad y de vuelta. Es el premio de haber fijado la altura.

---

## Trampas conocidas

- Los objetos temporales son **por conexión**. El asistente corre por otra vía, así que no ve las vistas del cuaderno: puede contestar «no existe» sobre algo que sí existe desde donde mira la persona.
- **No hay transacción**: si la vista se crea y el `SELECT` falla, la vista queda puesta.
- Una celda plegada en «sólo el código» no monta su resultado, así que su figura no se puede capturar al exportar. El cuaderno lo avisa por su nombre antes de empezar.
