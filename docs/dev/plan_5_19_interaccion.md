# Plan 5.19 — mejoras acumulativas · Tanda 1: cada pestaña es suya

**Estado:** las cuatro fases de la tanda 1 implementadas (2026-11-04), sin publicar. Pruebas: `scripts/probarInteraccion.mjs`, 67/67 en Electron.

La 5.19 se construye por acumulación: varias entregas `5.18.x` hasta llegar a ella. Esta es la primera
tanda, y este documento irá creciendo con las que el autor vaya pidiendo.

## 0. En una frase

Una pestaña debería recordar y controlar lo suyo: su altura de resultados, su tabla, su Ctrl+Z, su
consulta en marcha y su ventana emergente. Hoy casi todo eso es **uno solo para todo el panel**, y por
eso cambiar de pestaña desarma lo que dejaste.

## 1. La causa de fondo

El modelo de la pestaña (`LayoutManager`) guarda su texto y sus resultados, pero el resto vive un nivel
más arriba, en una sola copia:

| Estado | Dónde vive hoy | Dónde debería vivir |
|---|---|---|
| Altura de resultados | `linkedResultsRatio` / `resultsRatios[pane]` (`LayoutManager.jsx:89-117`) | Pestaña |
| Consulta en marcha | `runningQueryId` y `queryAbortControllerRef`, uno global (`LayoutManager.jsx:143`) | Pestaña |
| Ventana emergente | `isPoppedOut` en `EditorPane.jsx:132`; `popoutWindow` único en `electron/main.js:323` | Pestaña, con una ventana por pestaña |
| Texto y Ctrl+Z | Un solo modelo de Monaco; `setValue` al cambiar de pestaña (`SqlEditor.jsx:195`) | Un modelo por pestaña |
| Orden, filtros, página, columnas, scroll | `useState` de `ResultsTable`; se desmonta al cambiar de pestaña | Pestaña |

## 2. Hallazgos

Probado en dos entornos: Electron real (home temporal, copia del proyecto de ejemplo) y navegador contra
el servidor de pruebas. **Probado** significa que se vio ocurrir; **por código**, que se deduce del código
y falta verlo; **no reproducido**, que se intentó y no salió.

### A. Lo que tú reportaste

| # | Síntoma | Resultado | Evidencia |
|---|---|---|---|
| A1 | La altura de resultados se comparte entre pestañas | **Probado** | Llevada a 509 px en una pestaña, la otra también mide 509 px |
| A2 | La emergente cambia al ejecutar en otra pestaña | **Probado** | La ventana pasó de `03_top_productos` (10 filas) a `01_panorama` (22 filas). El efecto de `EditorPane.jsx:209` envía los resultados de la pestaña activa, sea cual sea |
| A3 | El aviso de la emergente ocupa espacio en blanco | **Probado** | 393 px para un texto y un botón. `resultadosVacios` excluye a propósito este caso (`EditorPane.jsx:448`) |
| A4 | Al cerrar la emergente no vuelve la tabla | **No reproducido** | Con la X volvió las 3 veces, en desarrollo. Falta probar el instalador; el rediseño de la fase 3 cubre el caso |
| A5 | Ctrl+F queda por debajo de algo y cuesta usar sus botones | **No reproducido** | Con el editor a 381, 108 y 85 px, y con reemplazar abierto, todos los botones reciben el clic y «siguiente» avanza (2→3 de 5). Sí es cierto que va pegada a la barra de acciones sin separación y que sus flechas son de 16 px y se apagan sin coincidencias. **Necesito una captura tuya** (§6) |

### B. Graves, que no reportaste

| # | Problema | Resultado | Impacto |
|---|---|---|---|
| B1 | **Consulta huérfana que bloquea la app.** Con una consulta corriendo en A, Ctrl+Enter en B sobrescribe el `queryId` y el controlador; Stop cancela la de B y la de A sigue sin ningún botón para detenerla | **Probado** | Una consulta de prueba `SELECT 1` seguía sin responder a los 6 s. Hay que esperar a que termine o reiniciar |
| B2 | **Ctrl+R recarga toda la app.** No hay `Menu.setApplicationMenu`, así que sigue activo el menú por defecto de Electron | **Probado** | Vuelve a la bienvenida sin avisar; se pierden todos los resultados |
| B3 | **Ctrl+Z no funciona tras cambiar de pestaña.** `setValue` borra la historia | **Probado** | `canUndo` falso y el texto no cambia |
| B4 | **Ctrl+K reformatea tu SQL** con el foco en el editor, aunque la barra superior lo anuncia como la paleta. Además lleva el cursor al final | **Probado** | El texto pasó de 421 a 339 caracteres |

### C. Ejecución entre pestañas

| # | Problema | Resultado |
|---|---|---|
| C1 | Con una consulta corriendo, **todas** las pestañas muestran Stop y ninguna Run | **Probado** |
| C2 | Stop desde otra pestaña cancela la consulta de la primera | **Probado** |
| C3 | Ninguna pestaña indica que está ejecutando ni que terminó | **Probado** |
| C4 | El botón dice «Cancel (Esc)», pero Esc no cancela | **Probado** |
| C5 | Si mueves una pestaña de panel mientras corre, el resultado va al panel anterior: `pane` se calcula al empezar | Por código |

### D. Estado que se pierde al cambiar de pestaña

| # | Problema | Resultado |
|---|---|---|
| D1 | El scroll de la tabla vuelve a cero (120 → 0) | **Probado** |
| D2 | Orden, filtros, página, columnas elegidas y anchos se pierden. El `key` por pestaña de la 5.18 lo hizo uniforme; antes ya se perdían al pasar por una pestaña sin resultados | Por código |
| D3 | Las variables expandidas son del panel, no de la pestaña (`varsExpanded`) | Por código |

### E. Ventana emergente

| # | Problema | Resultado |
|---|---|---|
| E1 | **Bring Back Here** deja la ventana abierta y huérfana | **Probado** |
| E2 | Cerrar la principal deja viva la emergente y la app corriendo, sin forma de volver | **Probado** |
| E3 | Recargar la principal deja la emergente abierta y la app ya no sabe de ella | **Probado** |
| E4 | Solo puede haber una emergente, así que no se pueden comparar dos resultados en otra pantalla | Por código |
| E5 | No hereda la vista ni el gráfico de la pestaña (`initialChartConfig={null}`), y Ctrl+= no aplica en ella | Por código |

### F. Atajos

Probado con el foco en el editor y fuera de él.

| Atajo | Editor | Fuera | Problema |
|---|---|---|---|
| Ctrl+K | Formatea | Paleta | B4 |
| Ctrl+L | Selecciona la línea | Sin efecto visible | Assist nunca se abre desde el editor. Fuera, el panel no apareció en la prueba: **a revisar** |
| Ctrl+Shift+F | Formatea | Busca en el proyecto | Mismo atajo, dos acciones |
| Ctrl+D | Siguiente coincidencia | — | La documentación dice «duplicar» |
| Ctrl+E | Plan de ejecución | Nada | No documentado; duplica Ctrl+Shift+A |
| Ctrl+Shift+H | Historial | Nada | Solo funciona en el editor |
| Esc | No cancela | No cancela | C4 |
| F5, Ctrl+, Ctrl+B, Ctrl+P, Ctrl+Shift+P, Ctrl+Shift+A/E/D, Ctrl+/ | Correctos | Correctos | — |

Por código, falta verlos:

- **Bloq Mayús rompe los atajos fuera del editor.** `App.jsx` compara `e.key === 's'` en minúscula: con Bloq Mayús llega `'S'` y Ctrl+S, B, W, N y L no responden.
- **Dependen de la distribución del teclado.** Ctrl+Shift+/ espera `e.key === '/'`, pero en un teclado de EE. UU. llega `'?'`. En latinoamericano, `\` necesita AltGr, así que Ctrl+\ es inalcanzable.
- **Hay cuatro listas de atajos y no coinciden:** `SettingsModal`, `CommandPalette`, `docs/*/reference/keyboard-shortcuts.md` y `KeyboardShortcutsModal.jsx`. Esta última es código muerto y afirma cosas falsas (Ctrl+Shift+R «recarga el esquema»; en realidad ejecuta ambos paneles). A la documentación le faltan más de una decena.

### G. Otros

| # | Problema | Resultado |
|---|---|---|
| G1 | **23 modales sin Escape propio**, entre ellos el plan de ejecución (probado), historial, exportar, guardar e importar. La documentación promete que Escape cierra los modales | Probado en uno, el resto por búsqueda en el código |
| G2 | El tour de bienvenida no atrapa el foco: **lo que escribes va al editor de detrás** y modifica tu archivo | **Probado** |
| G3 | Dos tours seguidos en el primer arranque | **Probado** |
| G4 | Una búsqueda que encuentra una línea larga desplaza el código horizontalmente y deja de verse el inicio de las líneas | **Probado** |

## 3. Decisiones propuestas

**Dec-82 — La altura es de la pestaña.** Se guarda en la pestaña y con el archivo (junto a las pestañas
del proyecto, `amoxsql-layout-v1:<carpeta>`). Una pestaña nueva hereda la última altura usada. El vínculo
entre paneles (`resultsLinked`) sigue existiendo, pero al arrastrar con él activo cambia las dos pestañas
visibles, no una altura global.

**Dec-83 — Un modelo de Monaco por pestaña.** Se usa el `path` de `@monaco-editor/react` para que cada
pestaña tenga su modelo y se deja de usar `setValue` al cambiar. Ctrl+Z, marcadores y estado viven por
pestaña; el modelo se libera al cerrarla.

**Dec-84 — La ejecución es de la pestaña.** Un mapa `tabId → { queryId, controller }` reemplaza el estado
global. Stop y Esc actúan solo sobre la pestaña activa. La pestaña muestra **ejecutando**, **en espera** y
**terminó**; si termina estando en segundo plano, lo marca hasta que vuelvas.

**Dec-85 — Las consultas se encolan a la vista.** Todas comparten una conexión de DuckDB porque las vistas
temporales, las variables y las macros son de la sesión, y de eso dependen cuadernos y Lienzo. Paralelizar
las rompería. En su lugar, una segunda ejecución queda **en espera de `02_mezcla.sql`**, cancelable sin
tocar a la otra.

**Dec-86 — La emergente se ancla a su pestaña.** Una ventana por pestaña, identificada por `tabId`. Solo
la actualiza una nueva ejecución de **esa** pestaña. Un botón **Fijar** la congela para comparar con el
resultado siguiente. Hereda la vista y el gráfico.

**Dec-87 — Sin hueco cuando el resultado está fuera.** El panel se colapsa a una franja, igual que sin
resultados: *«Results in a separate window · Show · Bring back»*. El editor se queda con el espacio.
Bring back cierra la ventana; cerrar la ventana devuelve la tabla; cerrar la principal cierra todas; al
recargar, la app le pregunta a `main` cuáles siguen abiertas.

**Dec-88 — Una sola tabla de atajos.** Un módulo `atajos.js` del que leen el manejador global, Ajustes y
la paleta, y del que se comprueba la documentación. Compara por `e.code` y sin distinguir mayúsculas.
Sale `KeyboardShortcutsModal.jsx`.

**Dec-89 — Sin recargas accidentales.** Menú de aplicación propio sin Recargar. Las herramientas de
desarrollo quedan solo en desarrollo o con `AMOX_DEVTOOLS=1`.

## 4. Fases

Cada fase se publica como una `5.18.x`. Van por gravedad: primero lo que hace perder trabajo.

### Fase 1 — Que nada se pierda ni se bloquee (5.18.1) · tamaño M
- Ejecución por pestaña, cola visible, indicador en la pestaña, Stop y Esc correctos (B1, C1-C5).
- Cancelar la consulta al cerrar su pestaña.
- Menú sin Recargar (B2).
- Ctrl+K deja de reformatear, según la decisión 1 de §6 (B4).
- El tour atrapa el foco y no se encadena con otro (G2, G3).

**Hecho cuando:** dos consultas lanzadas en dos pestañas se pueden cancelar por separado y `SELECT 1`
responde después; Ctrl+R no hace nada.

**Riesgo:** `executeQuery` y `runAsScript` son el corazón de la app; los cuadernos y Data Flow tienen sus
propios caminos y deben seguir igual.

### Fase 2 — La pestaña recuerda (5.18.2) · tamaño L
- Altura por pestaña (A1).
- Un modelo por pestaña y Ctrl+Z que sobrevive (B3).
- Orden, filtros, página, columnas, anchos y scroll por pestaña (D1, D2); variables expandidas (D3).

**Hecho cuando:** con 3 pestañas a alturas y órdenes distintos, ir y volver no mueve nada, y Ctrl+Z deshace
lo escrito antes de cambiar.

**Riesgo:** el modelo por pestaña es el cambio más delicado de la tanda: toca autocompletado, marcadores,
depuración de CTE y lo que escribe el asistente. Se prueba solo con `scripts/probarInteraccion.mjs`, antes
de seguir.

### Fase 3 — La ventana emergente (5.18.3) · tamaño M
- Ventanas por pestaña, ancladas, con Fijar (A2, E4).
- Franja colapsada (A3).
- Cierres coherentes en los tres sentidos (A4, E1-E3).
- Vista, gráfico y zoom heredados (E5).

**Hecho cuando:** el flujo que describiste (emergente en la segunda pantalla, cambiar de pestaña, ejecutar
otra) deja la ventana intacta, verificado también **en el instalador**.

### Fase 4 — Atajos y pulido (5.18.4) · tamaño M
- `atajos.js`, conflictos resueltos y Bloq Mayús / teclados (F).
- Escape en los 23 modales con un gancho común (G1).
- Búsqueda: separada de la barra y con objetivos más grandes (A5), más lo que muestre tu captura.
- Búsqueda sin desplazar el código cuando no hace falta (G4).
- Documentación ES/EN regenerada desde la tabla.

**Hecho cuando:** una prueba recorre la tabla de atajos con foco dentro y fuera, y la documentación
coincide con ella.

## 5. Cómo se prueba

Las pruebas de esta tanda están en la interacción, así que el arnés de la auditoría pasa al repositorio
como `scripts/probarInteraccion.mjs`: lanza Electron con **home temporal** y una copia del proyecto de
ejemplo, y lo maneja por el protocolo de depuración. Cada hallazgo de §2 se convierte en una comprobación.

Limitaciones: las teclas enviadas así no pasan por el teclado físico ni por la capa de ventanas, de modo
que Bloq Mayús, las distribuciones y las regiones de arrastre se revisan además a mano en el instalador.

**Regla del entorno:** nunca probar contra el puerto 3001 sin comprobar qué lo ocupa; ahí suele estar el
AmoxSQL instalado.

## 6. Pendiente de decidir

1. **Ctrl+K.** Recomendado: abre la paleta siempre, como anuncia la barra, y formatear queda en Shift+Alt+F. La alternativa, mantener Ctrl+K para formatear en el editor, deja la barra mintiendo.
2. **Ctrl+L dentro del editor.** Recomendado: abre Assist siempre; se pierde «seleccionar línea» de Monaco, poco conocido.
3. **Ctrl+Shift+F.** Recomendado: buscar en el proyecto siempre; formatear se queda en Shift+Alt+F.
4. **Varias emergentes.** Recomendado: una por pestaña. La alternativa, una sola anclada, es más simple pero no permite comparar.
5. **Ctrl+F (A5).** Una captura de cuando pasa, y si tenías Assist abierto, panel dividido o zoom distinto de 100 %.
6. **Al cerrar la emergente (A4).** Si te sigue pasando en la 5.18: ¿con la X, o con la pestaña en otro estado?

## 7. Decisiones del autor (2026-11-04)

Las cuatro recomendaciones de §6: Ctrl+K siempre paleta, Ctrl+L siempre Assist, Ctrl+Shift+F siempre búsqueda en el proyecto, y una emergente por pestaña. Quedan abiertas la captura de Ctrl+F (5) y el caso de la emergente (6).

## 8. Lo que cambió al implementar

- **Stop nunca interrumpía** (nuevo, no estaba en §2). `req.on('close')` salta en cuanto se lee el cuerpo de un POST: la consulta salía del registro al empezar y el cancelar respondía 404. Ahora `res.on('close')`.
- **F: «Ctrl+L sin efecto fuera del editor» era un falso negativo** de la prueba: Assist está montado con ancho 0. Funcionaba.
- **G3 no es un fallo:** los tours se encolan a propósito. Se queda igual.
- **G4 no se tocó:** al buscar una coincidencia fuera de la vista, Monaco desplaza para enseñarla. Es lo correcto.
- **Dec-85 con más alcance:** una pestaña con una consulta en marcha no admite otra (avisa), en vez de encolarse consigo misma.
- **Escape:** además de los 23 de `modal-overlay`, otra familia de diálogos (`ww-backdrop`) tampoco lo tenía. Se añadió a 7. **No se añadió** a los formularios largos (`EditorDeFuente`, `ContratoDeFuente`, `ContextoWorkspace`), para no perder lo escrito, ni a los que obligan a elegir (`EleccionEtiqueta`, `WorkspaceWizard`). No se mira `defaultPrevented`: Monaco lo deja puesto sin haber usado la tecla.
- **Coste asumido:** los acordes de Monaco que empiezan por Ctrl+K desaparecen en el editor SQL.
- **Menú:** en Windows y Linux no hay menú de aplicación; en macOS queda el de Edición, que hace falta para copiar y pegar. Las herramientas de desarrollo: `F12` / `Ctrl+Shift+I` en desarrollo o con `AMOX_DEVTOOLS=1`.

**Sin verificar a mano** (no se puede por el protocolo de depuración): Bloq Mayús físico, distribuciones de teclado reales, copiar y pegar sin menú en el instalador, y Ctrl+R en el instalador (en desarrollo, probado).

## 9. Bitácora

- 2026-11-04 — Descubrimiento en Electron y navegador, con home temporal. Base real sin tocar. Plan escrito.
- 2026-11-04 — Fases 1 a 4 implementadas en `claude/plan-5-19-interaccion`. Sin subir versión ni publicar.

---

# Tanda 2 — Archivos grandes: detener sin colgarse

**Estado:** auditoría hecha (2026-11-04), sin implementar. Mediciones reproducibles con
`scripts/medirArchivosGrandes.mjs`, en Electron real con home temporal: esta máquina, 4 hilos y 16 GB.

**El síntoma del autor:** con Excel o parquet grandes, Stop no terminaba nunca, la app se trababa y la
pantalla se quedaba sin contenido; solo Ctrl+R la sacaba, de vuelta a la selección de proyectos.

## T2.1 Qué se midió

| Prueba | Tiempo | Tras Stop, motor libre en | Peor congelación del servidor | Memoria |
|---|---|---|---|---|
| Parquet 5 M, `SELECT *` (con tope) | 0,5 s | — | 0 s | — |
| Parquet 5 M, consulta lenta, Stop | — | **0,5 s** | 0,2 s | 1,3 GB |
| Excel 1 M, `SELECT *` (con tope) | 1,6–2,4 s | — | 0,2 s | — |
| Excel 1 M, consulta lenta, Stop | — | **0,3 s** | 0,2 s | — |
| `FROM parquet` **sin tope**, 2 M, Stop a los 3 s | — | **10,1 s** | **12,1 s** | — |
| `FROM parquet` sin tope, 2 M, sin Stop | 19,9 s | — | 12,2 s (ventana: 5,2 s) | 2 GB |
| `FROM parquet` sin tope, 3 M | 18,6 s → `Invalid string length` | — | **17,1 s** | 2,3 GB |
| `FROM parquet` sin tope, 5 M | 30,6 s → `Invalid string length` | — | **29,2 s** | 4,5 GB |
| Excel 1 M, abrir **Perfil** | — | **19,8 s ocupado** | 0,1 s | — |
| Excel 1 M, abrir **Gráfico** con resultado recortado | — | **4,6 s ocupado** | 0,2 s | — |

## T2.2 Causas

**C1 — Stop no interrumpía nada (ya arreglado en la tanda 1).** Liberaba la interfaz y la consulta seguía
hasta acabar. Es la explicación más directa de «no terminaba nunca de detenerse» en las versiones
publicadas. Con el arreglo, Stop libera el motor en 0,3–0,5 s también sobre Excel.

**C2 — El límite de filas se salta con facilidad.** `applyRowLimit` solo actúa si el texto empieza por
`SELECT` o `WITH`. `FROM 'x.parquet'`, la forma natural en DuckDB, se trae el archivo entero; lo mismo
`TABLE`, `VALUES` o `PIVOT`, y cualquier consulta si el ajuste de filas está en 0. Entonces:
- Convertir las filas (`getRowObjectsJson`) y `res.json` bloquean el hilo del servidor. **Durante ese rato
  Stop ni siquiera puede llegar**: de ahí los 12–29 s de congelación.
- Pasado el medio GB de JSON, termina en `Invalid string length`: un mensaje que no dice nada.
- Si cabe, la ventana se traga el resultado: 5–7 s congelada y 1,5 GB por cada 2 M de filas.

**C3 — Recalcular en segundo plano, sobre el archivo entero, sin freno.** El **Perfil** (`/api/profile`)
y los totales del **Gráfico** (`vega/agregar.js`, añadidos en la 5.18) releen todo el archivo por la
conexión principal, sin `queryId` ni cancelación y sin indicador en la pestaña. Cambiar de vista o de
pestaña no los detiene. Tu consulta siguiente espera detrás sin explicación: parece que Stop o Run no
funcionan. En mi primera medición, un Stop de 0,3 s pareció de 20 s por un Perfil anterior.
`/api/db/file-schema` también usa esa conexión.

**C4 — Nada recupera la ventana (el más grave).** No hay un `ErrorBoundary` raíz: cualquier error de
render desmonta toda la interfaz y deja la pantalla sin contenido. No hay manejador de
`render-process-gone` ni de `unresponsive`: **probado**, al morir el proceso de la ventana esta se queda
abierta sin responder y el servidor sigue vivo. Ctrl+R era la única salida **y la tanda 1 la quitó**, así
que hoy se quedaría atrapado hasta cerrar la ventana.

## T2.3 Lo que no se confirmó

- **La pantalla en blanco en un flujo real no se reprodujo aquí.** Con 2 M de filas, gráfico y perfil la
  ventana sobrevivió (1,56 GB de 4,3 GB de montón). Tres pestañas así superarían el límite: es una
  proyección, no una medición. La muerte de la ventana se forzó con `Page.crash`.
- **No se probaron** archivos de varios GB, ni Excel de más de 1 M de filas (el formato no admite más),
  ni con poca RAM libre, ni las versiones publicadas.
- **La CPU no parece ser el problema:** durante consultas pesadas la ventana respondió en 0,1–0,4 s. No se
  propone limitar hilos.

## T2.4 Propuesta

**Fase 5 — Nunca atrapado (5.18.5) · tamaño S. Va primero: tapa lo que la tanda 1 dejó al descubierto.**
- `ErrorBoundary` raíz con **Reload** y el detalle del error.
- `render-process-gone`: recarga sola y lo dice. `unresponsive`: pregunta **Esperar / Recargar**.
- Las pestañas vuelven con sus archivos y borradores (ya se guardan); la sesión se reabre sin pasar por la
  selección de proyectos.

**Fase 6 — Un tope que no se salta (5.18.6) · tamaño M.**
- Decidir por el tipo de sentencia del motor, no por el texto: toda sentencia que devuelva filas lleva tope.
- Con el ajuste en 0, un tope duro de seguridad, y un aviso que lleve a exportar.
- Leer el resultado por lotes cediendo el hilo, para que el servidor siga atendiendo y Stop llegue.
- Mensaje útil en lugar de `Invalid string length`.

**Fase 7 — Lo de fondo, a la vista y cancelable (5.18.7) · tamaño M.**
- Perfil y totales del gráfico con `queryId`: se cancelan al cambiar de vista, de pestaña o de consulta.
- Una ejecución tuya tiene prioridad: cancela lo de fondo en vez de esperar detrás.
- Perfil con «Calculating…» y **Cancel**. Totales del gráfico con espera antes de lanzar, y cancelando el anterior.
- `file-schema` a la conexión de metadatos.

**Hecho cuando:** `medirArchivosGrandes.mjs` da menos de 1 s de Stop a motor libre y menos de 1 s de
congelación del servidor en todos los casos, y una ventana forzada a morir vuelve sola con sus pestañas.
