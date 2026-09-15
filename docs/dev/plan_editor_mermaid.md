# Plan de implementación — AmoxDiagram

Un editor visual de diagramas con **pestaña y formato propios**, y mermaid como
almacenamiento. Se crea un `.amoxdiagram` desde cero, o se abre el diagrama que ya vive
dentro de un markdown y al guardar vuelve a su sitio sin tocar el resto del documento.

Auditoría: [`auditoria_editor_mermaid.md`](auditoria_editor_mermaid.md) (las 40 preguntas).
Este documento es el plan y también la bitácora: cada casilla se marca al cerrarse.

## Punto de partida

Hoy, para dibujar un diagrama hay que escribir mermaid a mano. Funciona —
`MarkdownPreview` lo renderiza y hay cuatro plantillas en el menú de `/`— pero escribir
`A[origen] --> B{decide}` es programar, y quien documenta una arquitectura no quiere
programar el dibujo de la arquitectura.

Media herramienta ya está en el repo:

| Pieza | Dónde | Estado |
|---|---|---|
| El lienzo de nodos | `@xyflow/react` 12.10, en `chains/ChainCanvas.jsx` | Ya se usa y está tematizado |
| El render | `mermaid` 11.14, en `markdown/MarkdownPreview.jsx:119` | Ya se usa |
| Grafo → mermaid | `chainAMermaid()` en `markdown/diagramFromChain.js` | **Escrito**, 102 líneas |
| Localizar un bloque cercado | `bloquesDe` / `reemplazarBloque` en `deck/deckBlockModel.js` | Escrito, atado al deck |
| Exportar un dibujo a PNG | `DataVisualizer/utils/exportChart.js`, sobre `html2canvas-pro` | Escrito |
| Guardar como | `handleRequestSaveAs` en `App.jsx:1162` | Escrito, hay que enseñarle la extensión |
| **mermaid → grafo** | — | **No existe. Aquí está el trabajo.** |

## Para quién

**El ingeniero de datos es el usuario principal** y dibuja arquitecturas: sus cajas son
sistemas, piensa en capas y las colorea, distingue lotes de continuo. El **científico de
datos** dibuja procesos esperados, con bucles y decisiones. El **analista** dibuja de dónde
sale el dato y quién lo toca, y es el que menos tolera la sintaxis.

Dos consecuencias que se notan en todo el plan: **agrupar en capas es una operación
central, no un adorno**, y **un diagrama con colores por capa tiene que abrirse**, porque
es el que de verdad escribe este público.

## Los dos hallazgos que ordenan el plan

### Mermaid publica las posiciones

El análisis original dio por hecho que habría que calcular la disposición, porque el formato
no guarda coordenadas. Eso apuntaba a una dependencia nueva (dagre, elk) y a un problema de
fondo: el editor colocaría las cajas a su manera y el documento las renderizaría a la suya.

Se comprobó sobre mermaid 11.14, renderizando un flujo con decisión, subgrafo y cuatro
formas, y leyendo el SVG:

```
<g class="node default" id="probe1-flowchart-A-0"  transform="translate(60.4, 138.1)">
<path class="... flowchart-link" id="probe1-L_B_C_0">
<g class="cluster" id="probe1-G">
```

**Los identificadores del autor están en el DOM**, con su posición al lado. De ahí:

1. **No hace falta una librería de disposición.** Mermaid no las guarda, pero las calcula y
   las publica.
2. **El editor enseña exactamente lo que el documento va a dibujar**, porque la geometría
   sale del mismo motor. El problema de los dos dibujos deja de existir.
3. **Sigue haciendo falta el parser de texto**: el SVG no dice si una caja se escribió `[]`
   o `{}`, ni si la flecha era `-->` o `-.->`. **El texto da la estructura y la intención;
   el render da la geometría.**

### Tres niveles de comprensión, no dos

La primera versión de este plan decía que un diagrama con `classDef`, `style` o `click` no
se abre, para no arriesgar pérdida de datos. La auditoría lo tumbó: colorear por capa es
justo lo que hace un ingeniero de datos, así que la regla protectora acababa cerrando la
puerta a los diagramas de su público principal.

| Nivel | Qué entra | Qué hace el editor |
|---|---|---|
| **Entiendo** | nodos, aristas, formas, subgrafos, dirección | Lo edita |
| **Conservo** | `classDef`, `class`, `style`, `linkStyle`, `click`, `%%{init}%%`, comentarios | **Lo guarda tal cual y lo vuelve a escribir igual** |
| **No abro** | cualquier tipo que no sea flowchart | El botón no aparece |

El nivel «conservo» es lo que permite que el editor sea **seguro sin ser cobarde**.

## El orden y por qué

1. **La fase 0 es el formato y va sola.** Es lo único sin lo que nada funciona y lo único
   que se prueba entero sin pintar un píxel. Sale con pruebas de ida y vuelta.
2. **La fase 1 es el archivo y la pestaña**, con un lienzo que sólo lee. Parece poco, pero
   valida lo caro —parser, geometría, registro en la aplicación— sin riesgo de estropear
   un documento.
3. **La fase 2 edita**, y por tanto escribe. Va después de que leer esté asentado.
4. **La fase 3 es la procedencia**, el camino de vuelta al markdown. Es la parte más
   delicada del plan y por eso va cuando todo lo demás funciona sobre archivo propio.
5. **La fase 4 es lo que pide una arquitectura**: capas, color, repaso.
6. **La fase 5 es salir**: imagen, plantillas y la salida digna cuando algo no se entiende.

---

## Fase 0 — El formato

Sin esto no hay editor. Con esto, aunque no se hiciera nada más, `diagramFromChain` queda
mejor de lo que está.

- [x] **Un módulo, `markdown/mermaidFlow.js`, con las dos direcciones dentro.** No dos
      archivos: el ida y vuelta sólo sale exacto si las dos mitades conocen el mismo
      subconjunto, y separadas se desincronizan en cuanto alguien añada una forma a una y
      se olvide de la otra.
- [x] `parsearFlujo(texto)` → `{ nodos, aristas, subgrafos, direccion, conservado }` o
      `null`. **Devolver `null` es una respuesta válida y frecuente**, no un fallo.
- [x] `flujoAMermaid(grafo)` → texto. La tabla `FORMA` se muda aquí desde
      `diagramFromChain.js`, que pasa a ser **consumidor**: chain → grafo → `flujoAMermaid`
      en vez de componer cadenas a mano. `PLANTILLAS_DIAGRAMA` se muda a
      `markdownInsertables.js`, con el resto del catálogo del menú de `/`.
- [x] **El subconjunto, declarado en el propio archivo:** `flowchart`/`graph` con dirección
      `TB|TD|BT|LR|RL`; siete formas de nodo —las cinco que ya emite `chainAMermaid`
      (`[]`, `[()]`, `{}`, `(())`, `[//]`) más redondeado `()` y trapecio `[\\]`—; aristas
      `-->`, `---`, `-.->`, `==>` con etiqueta `|texto|` o `-- texto -->`; `subgraph`/`end`
      con un nivel de anidamiento.
- [x] **`conservado`: las líneas que no entendemos, en orden y verbatim.** `classDef`,
      `class`, `style`, `linkStyle`, `click`, `%%{init}%%` y los comentarios. Se vuelven a
      escribir al serializar, en su sección, sin tocar un carácter.
- [~] **Sólo se rechaza el tipo de diagrama**: `sequenceDiagram`, `stateDiagram`, `erDiagram`,
      `gantt` y compañía devuelven `null`.
      **Se rechazan cuatro cosas más**, y el plan no las vio:
      **subgrafos anidados** (se sabrían leer, pero no dibujar sin decidir cómo se anidan las
      cajas, y abrir algo que luego no se guarda igual es peor que no abrirlo);
      **`direction` dentro de un subgrafo** (conservarlo sería mentir — se reescribiría fuera
      del subgrafo, donde significa otra cosa);
      **nodos separados por `&`** (se sabe leer, no se sabe escribir de vuelta sin cambiar la
      forma del archivo);
      y **cualquier línea que no se sepa clasificar**, en vez de ignorarla — ignorar una línea
      es perderla al guardar.
- [x] **El serializador es estable:** mismo grafo, mismo texto, siempre — orden de nodos,
      de aristas y de secciones fijado. **Es un requisito, no una cualidad**: el archivo se
      versiona en git, y un serializador inestable ensucia cada diff con reordenaciones que
      nadie hizo.
- [x] **Extraer el localizador de bloques cercados.** `bloquesDe` y `reemplazarBloque` ya
      existen en `deck/deckBlockModel.js`, filtrando por la lista de lenguajes del deck. La
      parte genérica se saca a `markdown/fencedBlocks.js` y la consumen los dos. *(La
      función de contraste llegó a tener tres copias en el repo y la tercera era la mala. No
      se copia un helper: se muda.)*
- [x] `scripts/probarMermaidFlow.mjs` — **143 comprobaciones**. El criterio es el ida y vuelta —parsear, serializar,
      volver a parsear, mismo grafo— más una batería de textos con `classDef` y `style` que
      **deben sobrevivir intactos**, y otra de tipos que deben rechazarse.

**Criterio de hecho:** las cuatro plantillas y la salida de `chainAMermaid` sobre una chain
real hacen el ida y vuelta sin perder nada, y un diagrama con cuatro `classDef` sale byte a
byte igual que entró.

**Cumplido**, con una comprobación que el criterio no pedía y hacía falta: las pruebas dicen
que el parser es coherente **consigo mismo**, no que mermaid entienda lo que escribimos. Se
renderizaron seis casos con mermaid 11.14 —las siete formas, los cuatro estilos de flecha,
etiquetas con acentos y paréntesis, la arquitectura del contrato visual, un nodo suelto y la
salida de una chain— y los seis dibujan lo que dice el modelo. De ahí salieron las dos
trampas de la geometría anotadas en la fase 1.

Una desviación deliberada en la forma canónica: **los nodos sueltos se declaran al final**, no
antes del flujo como se escribió primero. Añadir una caja que todavía no has conectado no
debería desplazar todas las líneas del flujo en el diff.

## Fase 1 — El archivo y la pestaña

Un `.amoxdiagram` que se crea, se abre, se ve y se guarda. Sin editar todavía.

- [x] **El formato del archivo:** front-matter (`title`, `author`, `updated`) más **un**
      bloque mermaid. Mismo patrón que `.amoxdeck`, que ya es markdown con front-matter, y
      así el archivo se lee sin la aplicación. Un diagrama por archivo; varios conviven en
      un markdown, que es donde un diagrama tiene vecinos que lo explican.
- [x] **Registrar el tipo en los diez sitios.** Es mecánico pero se olvida la mitad, así que
      va enumerado:

  | Dónde | Qué |
  |---|---|
  | `App.jsx:914` | extensión → `type` |
  | `App.jsx:1040-1050` | guardar como, y la extensión por defecto |
  | `EditorPane.jsx:378-385` | `isDiagram` |
  | `EditorPane.jsx:~553` | montar el editor |
  | `LayoutManager.jsx:802,814` | nombre y plantilla del archivo nuevo |
  | `FileExplorer.jsx:178` | que se pueda abrir |
  | `FileExplorer.jsx:241` | icono propio |
  | `FileExplorer.jsx:278` | grupo propio en el orden |
  | `FileExplorer.jsx:703` + `TabBar.jsx:79` + `CommandPalette.jsx:299` | los tres «nuevo» |
  | `server/projectSearch.js:27` | que la búsqueda del proyecto lo mire |

- [~] **`diagram/DiagramEditor.jsx`** — React Flow ocupando la pestaña.
      `ChainCanvas.jsx` es **referencia, no base**: importa 34 tipos de nodo atados a la
      ejecución de chains, validación de ciclos y configuración por nodo. De ahí se copia el
      montaje y el tematizado; no se extiende.
- [x] **Posiciones leídas del SVG de mermaid.** Se renderiza una vez en oculto y se mapean
      por el id del `<g>`. **Dos trampas, ya medidas en la fase 0 y con respuesta:**

  1. **No se parsea la cadena del SVG: se monta en el DOM.** Un diagrama con una
     directiva `click` produce un SVG que **no es XML bien formado**, y
     `DOMParser(svg, 'image/svg+xml')` devuelve un `parsererror` — medido: 1 nodo de 3.
     Con `text/html` o montándolo en un contenedor salen los 3. Y hace falta montarlo de
     todas formas por lo siguiente.
  2. **No se lee el atributo `transform`: se llama a `getCTM()`.** Un nodo con enlace va
     envuelto en un `<a transform="translate(…)">`, así que el `<g class="node">` **no
     tiene `transform`** y leer el atributo devuelve `null` — la caja acabaría en el
     origen, sin un solo error por consola. `getCTM()` da la posición esté donde esté el
     transform, y necesita el SVG vivo.

  Queda por comprobar, eso sí: qué pasa cuando dos nodos distintos sanean al mismo
  identificador, y si el índice final del id (`-0`, `-1`) es estable entre renders.
- [x] **Un solo tipo de nodo propio**, `DiagramNode`, con la forma pintada en CSS desde el
      campo `forma`. Nada de un componente por forma.
- [x] El lienzo respeta el tema y el acento, como el de Data Flow.
- [x] Zoom, encuadrar todo y minimapa — los tres los da React Flow.

**Criterio de hecho:** crear un `.amoxdiagram` desde los tres sitios, abrirlo, y que el
lienzo se parezca al SVG que renderiza el preview del mismo texto.

**Cumplido**, y `scripts/probarArchivoDiagrama.mjs` añade 63 comprobaciones — sobre todo que
guardar no toca ni la cabecera ni el texto de alrededor.

La desviación de `DiagramEditor`: **no es un portal a pantalla completa como decía el plan,
es la pestaña entera**, que es lo que pidió el usuario al replantear la arquitectura. Y las
columnas laterales del contrato visual —paleta e inspector— no se montan todavía: sin
edición serían mandos que no hacen nada.

Dos fallos que **sólo aparecieron mirando la aplicación**, ninguno de los cuales podía
delatar una prueba:

1. **El minimapa salía vacío.** React Flow dibuja ahí sólo los nodos que **declaran** su
   tamaño; los que él tiene que medir no salen. Se veía un recuadro negro flotando en la
   esquina, que parece un fallo de pintado y no una lista vacía. Se arregla poniendo
   `width`/`height` en el nodo, que además ahorra la medición entera — ya sabemos el
   tamaño, nos lo acaba de decir mermaid.
2. **El SVG del minimapa desbordaba su recuadro.** React Flow le pone 200×150 por atributo;
   dentro de una caja de 112×62 eso no lo encoge, lo **recorta**, y sólo se veía su esquina.

Y una trampa del entorno de verificación que conviene recordar: **React Flow mide con un
`ResizeObserver`, que no dispara mientras la ventana está tapada.** Con la ventana detrás,
el DOM decía cero aristas y cero texto, y las dos cosas estaban bien. Hay que forzar un
pintado —una captura— antes de medir nada.

## Fase 2 — Editar

La primera fase que escribe.

- [~] Añadir nodo por **tres caminos**: doble clic en el lienzo, arrastrar desde una paleta,
      y `Tab` desde un nodo seleccionado para encadenar. El tercero es el de quien ya sabe
      lo que va a dibujar.
- [x] Conectar y desconectar arrastrando desde el borde, como Data Flow.
- [x] **Editar el texto de una caja con doble clic, en el sitio.** Nunca un campo en un
      panel lejano para algo tan frecuente.
- [x] **Inspector a la derecha** con tres estados, como el Studio del deck: diagrama (sin
      selección) · nodo · arista. Forma y clase en el nodo; etiqueta y estilo de flecha en
      la arista; dirección y título en el diagrama.
- [x] **Una arista es seleccionable**, no un adorno entre dos cajas.
- [~] **Duplicar** — quien dibuja tres fuentes parecidas no las escribe tres
      veces.
- [x] **Buscar un nodo por su texto** y que el lienzo salte a él. Con cuarenta cajas, sin
      esto no se navega.
- [x] Deshacer y rehacer. La pila es **el texto mermaid**, no una lista de operaciones —
      mismo razonamiento que `deck/useHistorial.js`: no hay que escribir la inversa de cada
      acción.
- [x] **Panel de texto plegable al lado del lienzo**, editable, con el mermaid que se está
      generando. **Es una vista de primera clase, no una salida de emergencia:** la mitad
      del público sabe leer mermaid y va a querer comprobar qué se escribe en su archivo.
      Mismo papel que `DeckSlideRaw.jsx` en el deck.
- [x] Si lo escrito a mano deja de entenderse, **el lienzo se congela con un aviso**; no se
      vacía. Vaciarse da la sensación de haber perdido el trabajo.
- [~] **No se pueden fijar coordenadas, y se dice en la interfaz la primera vez.** Mermaid no
      tiene dónde guardarlas: si se permitiera, el usuario colocaría una caja, guardaría, y
      al reabrir la encontraría en otro sitio — el editor habría prometido algo que el
      formato no sostiene. Se arrastra para **reordenar** y para **cambiar de grupo**. A
      cambio, el dibujo nunca queda torcido: lo ordena mermaid en cada render, y eso también
      hay que contarlo, porque quien viene de otras herramientas espera pelearse con la
      disposición.

**Criterio de hecho:** dibujar desde cero la arquitectura de un flujo por lotes, guardarla,
cerrar la pestaña, reabrirla y encontrarla igual.

**Cumplido.** `scripts/probarOpsDiagrama.mjs` añade 70 comprobaciones sobre las operaciones,
que son puras justamente para esto: que borrar una caja **no deje flechas colgando** se
contesta en un milisegundo en vez de descubrirlo al abrir un archivo roto.

Cuatro desviaciones, todas deliberadas:

1. **La paleta se pulsa, no se arrastra**, y el plan decía lo contrario. Al implementarla se
   ve que arrastrar **sería mentira**: mermaid decide dónde va cada caja, así que el punto
   donde sueltas no significa nada. Siguen siendo tres caminos —pulsar una forma, doble clic
   en el vacío, `Tab` desde la selección— y los tres son honestos. Si hay una caja
   seleccionada la nueva **se encadena a ella**, que es la única información que el gesto sí
   puede llevar.
2. **Copiar y pegar no están; duplicar sí.** Entre teclado y portapapeles hay más superficie
   de la que esta fase necesitaba, y duplicar cubre el caso real —cinco fuentes parecidas—
   sin ninguna de esas preguntas.
3. **El aviso de arrastrar dice otra cosa.** El contrato visual lo redactó como «arrastra
   para reordenar y para cambiar de grupo»; las dos cosas llegan con los grupos, en la fase
   4. Prometerlas ahora sería exactamente la promesa incumplida que este editor existe para
   evitar, así que el aviso dice lo que hoy es cierto: la posición la calcula el diagrama.
4. **El identificador sigue al primer nombre.** No estaba en el plan y salió de mirar el
   archivo: una caja creada y bautizada acababa como `sin_nombre[("Almacén")]` para siempre.
   Ahora el id sigue al texto **la primera vez que se nombra una caja recién creada**, y
   nunca más — renombrar siempre movería también todas las líneas de flecha, ensuciando el
   diff. Con cinturón: si el id ya aparece en una línea conservada, no se toca.

Y un hallazgo del entorno de verificación, no del producto: **la automatización del navegador
no entregaba `Enter` al campo enfocado**, lo que hacía parecer que el renombrado en el sitio
no guardaba. Con un evento de teclado real funcionaba. Estuve a punto de arreglar algo que no
estaba roto.

## Fase 3 — La procedencia

El camino de vuelta al markdown. La parte más delicada del plan.

- [x] **Botón «Editar en AmoxDiagram»** en el bloque renderizado del preview, junto al de
      expandir. **Sólo aparece si `parsearFlujo` devuelve algo.** Un botón que a veces da
      error es peor que un botón que a veces no está.
- [x] Abre **una pestaña nueva**, no un modal.
- [x] **La pestaña dice de dónde viene.** Un rótulo de procedencia con el nombre del
      markdown que al pulsarlo abre ese archivo. **Ninguna pestaña de esta aplicación tiene
      hoy dueño en otro archivo**: es un concepto nuevo y hay que enseñarlo, porque sin él
      guardar es un acto a ciegas.
- [x] **El botón de guardar dice qué va a hacer**, no «Guardar» a secas: *Guardar en
      `arquitectura.md`* o *Guardar el diagrama*. Es la pregunta donde se pierde la
      confianza.
- [x] **Guardar reescribe el bloque, no el documento.** Se localiza con `fencedBlocks` y se
      sustituye. Lo de fuera del bloque no se toca.
- [x] **Qué pasa si el markdown cambió debajo.** El bloque se ancla por su **posición entre
      los bloques mermaid del archivo** más el **texto original**. Si al guardar el original
      ya no coincide, **no se adivina**: se avisa y se ofrecen las dos salidas —sobrescribir,
      o guardar como archivo nuevo. Perder el trabajo de otro en silencio es el único fallo
      de este editor que no tiene arreglo.
- [x] **«Guardar como» → `.amoxdiagram`.** El flujo ya existe (`handleRequestSaveAs`); hay
      que enseñarle la extensión. Resuelve además reutilizar un diagrama como plantilla.
- [x] Cancelar deja el texto intacto; cerrar con cambios sin guardar pregunta.
- [~] **Abrir en el editor el diagrama generado desde una chain.** Hoy `chainAMermaid`
      inserta texto; que pueda abrirlo directamente.

**Criterio de hecho:** un markdown de 300 líneas con tres diagramas; se edita el segundo y
el archivo sale byte a byte igual salvo ese bloque.

**Cumplido, y comprobado sobre un archivo real** con front-matter, un diagrama con
`classDef`, un bloque `sql`, un segundo flowchart y un `sequenceDiagram`. Se abrió el
**segundo**, se cambió, se guardó, y quedaron intactos: la cabecera, el `classDef` del
primero, el bloque `sql`, el diagrama de secuencia y el texto del final. El de secuencia,
además, **no ofrece el botón**: tres diagramas, dos botones.

`scripts/probarProcedenciaDiagrama.mjs` añade 40 comprobaciones sobre el ancla, que es la
pieza que decide si se escribe o se pregunta.

El conflicto se probó de verdad: se editó el documento **desde fuera** con la pestaña
abierta, y al guardar salió el diálogo con sus tres salidas sin haber escrito nada. Sólo
«Sobrescribir» pisa lo del otro, y lo hace dejando el resto del documento intacto.

Dos cosas que conviene saber:

1. **El anclaje tiene dos datos y ninguno basta solo.** La posición entre los bloques
   sobrevive a que escriban párrafos alrededor pero no a que inserten otro diagrama antes;
   el texto original sobrevive a que lo muevan pero no a que lo editen. Se usan los dos: la
   posición para encontrarlo, el texto para confirmar que es el mismo. Si el texto aparece
   una sola vez en otro sitio, **se sigue al bloque movido** — un diagrama que cambió de
   sección sigue siendo el mismo diagrama. Con dos copias idénticas no se adivina.
2. **Cerrar una pestaña es silencioso en toda la aplicación, y aquí no podía serlo.** Un
   archivo con ruta conserva su borrador y sigue en el disco; un diagrama abierto desde un
   markdown no tiene ni lo uno ni lo otro — su contenido **no existe en ningún otro sitio**
   hasta que vuelve a su documento. Se añadió una pregunta al cerrar, sólo para este caso.

La desviación: **abrir directamente el diagrama generado desde una chain** se queda en que
`chainAMermaid` inserta su bloque en el documento y ahí ya aparece el botón de editar. Un
camino propio ahorraría un clic y añadiría una segunda forma de llegar al mismo sitio.

Y un fallo encontrado sólo al usarlo, que dejó la aplicación **en negro**: la fase 1 dejó
`procedencia` como una ruta de texto y la fase 3 la convirtió en un objeto. Build y ESLint
pasaron por encima sin decir nada; lo cazó la consola del navegador a la primera pulsación.

## Fase 4 — Lo que pide una arquitectura

- [x] **Agrupar.** Seleccionar varias cajas → «agrupar» en un subgrafo; renombrar, meter y
      sacar. **Es la operación central del ingeniero de datos**, no un detalle de acabado:
      zonas de aterrizaje, refinado y consumo son subgrafos.
- [x] **Color por clase.** Una vez el nivel «conservo» mantiene `classDef`, asignar una
      clase a un nodo es una línea. Es lo que responde a «colorear por capa o por equipo».
- [x] **Estilo de flecha** para distinguir lotes de continuo (`-->` / `-.->` / `==>`).
- [x] **Repaso de cabos sueltos:** nodos sin conectar, grupos vacíos, etiquetas duplicadas.
      Barato, y es justo lo que alguien quiere mirar antes de enseñar una arquitectura.
- [x] **Plantillas para este público**, que las cuatro de hoy son genéricas: una arquitectura
      por capas, una ingesta por lotes frente a una continua, un flujo de experimento.

**Cumplido.** `probarOpsDiagrama` sube a 102 comprobaciones y `probarMermaidFlow` a 151.
Verificado en la aplicación: se abre un diagrama con dos zonas y tres capas, se seleccionan
dos cajas con `Ctrl`, se agrupan, el grupo aparece con su recuadro y el inspector pasa a
hablar de él; y crear una capa nueva pinta la caja de su color y añade su `classDef` sin
tocar los que había.

**El cambio de fondo de esta fase no está en la lista: `class` dejó de ser opaca.**

La fase 0 metió `class a,b origen` en el saco de lo conservado, junto a `classDef`. Al
llegar aquí eso hacía imposible la pregunta 26 de la auditoría —asignar una capa desde la
interfaz— porque la línea que lo dice era intocable. La distinción correcta resultó ser más
fina: se entiende **qué caja pertenece a qué clase** y no se toca **qué aspecto tiene esa
clase**. El `classDef` sigue siendo del autor, palabra por palabra; la asignación viaja en
la caja.

Eso tuvo un efecto secundario bueno y otro que hubo que arreglar. El bueno: la capa
**sobrevive al renombrado del identificador** sin necesitar el cinturón de seguridad, porque
ya no vive en una línea que nombra la caja por id. El que hubo que arreglar: el cinturón
seguía haciendo falta para `style` y `click`, que sí se conservan, y la prueba que lo
vigilaba usaba justo una línea `class` — pasó a usar un `style`, que es el caso real.

Dos decisiones de la interfaz que conviene tener escritas:

- **Una caja lleva una capa, no varias.** Mermaid las acumula, pero dos rellenos se pisan y
  el color que sale depende del orden de las líneas. Eso no se depura: se evita.
- **El color de una capa nueva no se pregunta.** Elegir relleno y filete que contrasten es
  trabajo, y equivocarse produce una caja ilegible. Se toma el siguiente de una paleta de
  cinco; quien quiera otro edita su `classDef`, que sigue siendo suyo, desde el panel de
  texto.

Y una consecuencia en el lienzo: **la caja se pinta con el color de su `classDef`**, no con
uno nuestro. Un editor que colorea a su manera vuelve a separar el dibujo del resultado, que
es justo lo que este diseño evita.

## Fase 5 — Salir

- [~] **Exportar PNG y SVG.** El exportador de PNG ya está escrito y en uso por Story Flow
      (`DataVisualizer/utils/exportChart.js`). Es de las primeras cosas que se van a pedir:
      el diagrama acaba en un documento de diseño que no es este markdown.
      **No se reutilizó**, y la razón es de fondo: aquél fotografía el DOM, y lo que hay en
      el DOM es **nuestra** versión del diagrama —nuestras cajas, nuestro filete de
      selección, nuestro fondo de puntos—. Se le vuelve a pedir a mermaid, que es quien lo
      va a dibujar en el documento: sale en vector, sale más limpio, y no hay forma de que
      la imagen y el documento discrepen.
- [ ] **Comprobar que una lámina del deck renderiza bien un bloque mermaid.** Ya debería
      —el deck renderiza markdown— y es trabajo de una tarde, no de una fase.
      **Comprobado, y no: no se dibuja.** Medido sobre dos disposiciones —`finding` con
      figura y `summary`— en Design y en Review: el bloque está en el markdown de la lámina
      y no sale ni como diagrama ni como bloque de código.
      La causa no es un descuido sino el contrato: **una lámina son regiones fijas**
      —antetítulo, afirmación, detalle, figura— y «figura» significa un `.amoxvis`, no un
      bloque cualquiera. Un diagrama no tiene hueco, y **inventarle uno es una decisión del
      deck, no de esta iniciativa**: hay exportadores a PowerPoint y Word detrás. Queda
      anotado para el plan del Studio, no arreglado aquí a medias.
- [x] **La salida digna.** Si no se entiende, el botón no aparece y el bloque se comporta
      como hoy: silencio, no error. Salvo cuando es un flowchart que casi entendemos: ahí un
      aviso discreto que diga **qué línea** no se supo leer. La diferencia importa — un
      `sequenceDiagram` no es un fallo, es otro tipo de diagrama; un flowchart con algo raro
      es algo que el usuario esperaba poder abrir.
- [x] Documentación de usuario: qué se edita visualmente, qué se conserva sin tocar, y por
      qué no se pueden mover las cajas. En `docs/es|en/editor/amoxdiagram.md`, con su fila
      en el índice.

**Cumplido salvo lo del deck.** Dos cosas salieron de medir en vez de suponer, y las dos
estaban escritas al revés en el primer intento:

1. **El PNG hay que pasarlo por un `data:`, no por un `blob:`.** Un SVG cargado desde una
   URL de blob **contamina el lienzo** en Chromium, y `toBlob` revienta con un
   `SecurityError`: el PNG no llegaba a existir. El SVG suelto sí se entrega como blob —
   ahí no hay lienzo de por medio.
2. **`htmlLabels: false` no hacía lo que decía el comentario.** Se puso «para que el PNG no
   salga con las cajas vacías», y midiéndolo resultan dos cosas falsas: en mermaid 11.14
   apagarlo **no** convierte las etiquetas en `<text>` —siguen en un `foreignObject`— y un
   `foreignObject` **sí** se rasteriza entrando por un `data:`. Se comprobó comparando el
   PNG con y sin esos nodos: 17,5 kB frente a 7,3 kB. Así que se deja como en el documento.

Y una decisión sobre la tipografía que conviene tener escrita: **el diagrama exportado no
usa la fuente de la aplicación**. Un SVG lleva los tamaños de caja ya calculados y se abre
donde esa fuente no está cargada; si el texto se dibujara con otra, se saldría de su caja.
Se mide y se dibuja con una familia que existe en todas partes: se ve un punto distinto del
de la pantalla, y a cambio se ve igual en cualquier sitio donde acabe.

---

## Después de las fases — lo que salió de usarlo

Las cinco fases estaban cerradas y el editor funcionaba. Lo que sigue **no lo pidió el
plan**: lo pidió abrir la aplicación y trabajar con ella. Queda anotado aquí porque es la
parte del expediente que más se repite: *el build y el linter pasan por encima de pantallas
en blanco, barras partidas y operaciones a las que no se llega.*

- [x] **Agrupar no se descubría.** La pregunta fue literal: «¿cómo se agrupan dos
      elementos?». La operación existía desde la fase 4, funcionaba, estaba probada — y no
      tenía **ni un solo punto de entrada visible**. Había que adivinar dos cosas a la vez:
      que <kbd>Ctrl</kbd> selecciona varias, y que entonces aparece un inspector distinto.
      Se añadieron la tira flotante sobre la selección múltiple, la pista del
      <kbd>Ctrl</kbd> en el inspector de una caja, y **Grupo nuevo…** como entrada directa.
      Agrupar era la operación central de una arquitectura y estaba escondida: eso no es un
      detalle de acabado, es la característica sin terminar.
- [x] **La barra se partía en dos filas.** 947 px metidos en 921: **Guardar** caía a la
      segunda fila, fuera de la vista. Lo causó la fase 5 al partir un «Exportar» en dos
      botones. Se arregla en dos capas, y hacen falta las dos: un menú para los formatos, y
      `flex-wrap: nowrap` con el título truncando — sin lo segundo, un nombre de archivo
      largo volvía a partirla. Mismo fallo que ya había pasado en la barra del deck.
- [x] **Las catorce formas clásicas.** Siete se quedaron cortas en cuanto alguien diagramó
      un proceso de verdad: no había dónde poner «esto lo hace una persona» ni «esto acaba
      aquí». Se subió a catorce, que es el juego clásico del diagrama de flujo.
      **Dos de las nuevas salieron de medir, no de mirar:** `salida` y `manual` se estaban
      dibujando **idénticas**, y otras dos siluetas estaban del revés. A 19 px ninguna
      captura lo enseña; se encontró comparando la firma de estilo calculado de las catorce
      —trece distintas de catorce— y se arregló leyendo la geometría real del polígono que
      dibuja mermaid.
- [x] **La paleta aprende.** Mermaid tiene más de cuarenta formas con nombre además de las
      catorce, y meterlas todas convertía la paleta en un catálogo. Así que la base es corta
      y **cada uno se queda con las que usa**: se lee y se escribe
      `id@{ shape: X, label: "Y" }`, y si el diagrama trae una forma desconocida el editor
      ofrece guardarla en `localStorage`, que es donde esta aplicación guarda lo que es del
      usuario y no del proyecto.
      La forma **vuelve en su sintaxis**, no traducida a cercos: la mayoría no tiene
      equivalente, y aproximarla a la más parecida sería cambiarle el dibujo al autor por la
      espalda. Y la silueta **no se dibuja a mano**: se le pregunta a mermaid cómo la dibuja
      y se guarda su contorno — la misma decisión que con las posiciones y la exportación,
      por la misma razón.
      Cuatro cosas más que salieron de medir: una forma puede estar dibujada con **varias**
      piezas (`brace` son dos trazos) y quedarse con la primera da media silueta; un `<g>`
      colgado de un `div` **no tiene caja** y `getBBox` revienta; `currentColor` **no se
      resuelve** dentro de un `url(data:…)` —doce siluetas negras sobre fondo negro— y por
      eso se usa como máscara; y **mermaid no pinta etiqueta** en `hourglass` ni en `bolt`,
      que son símbolos, así que se pregunta si la pinta **mirando el contenido** y no si el
      elemento existe: el hueco está puesto y vacío, y comprobar la presencia seguía
      diciendo que sí.

---

## Lo que este plan deja fuera, y por qué

- **Secuencia, estados, Gantt.** Sólo flowchart. Es lo que dibuja este público y lo que
  `chainAMermaid` ya emite. Entidad-relación además ya existe, generado desde la base de
  datos en `ErDiagram.jsx`; no se duplica.
- **Una biblioteca de iconos de proveedores.** No es una limitación técnica sino una regla
  del proyecto: no se nombran ni se dibujan tecnologías ajenas en la interfaz. Lo que el
  usuario escriba en su etiqueta es contenido suyo, y ahí no nos metemos. Se va a pedir.
- **Que la IA dibuje el primer borrador.** Es la petición más natural del mundo y encaja
  después sin tocar nada: si el editor abre cualquier mermaid del subconjunto, una
  herramienta que emita mermaid entra sola. Fuera del alcance de este plan, no del producto.
- **Crear enlaces `click` desde la interfaz.** Con el nivel «conservo» los enlaces que ya
  existan sobreviven; crearlos es candidato claro para después.
- **Usar el parser interno de mermaid.** Su API pública (`parse`, `render`, `detectType`)
  valida y dice el tipo, pero no devuelve el grafo. Para eso hay que entrar por `mermaidAPI`,
  marcado `@deprecated` y `@internal` en sus propios tipos: atarse a eso significa que una
  subida de versión menor deja de abrir los diagramas de la gente. **Usamos su render, que
  es API pública, y nuestro parser.**
- **Enlace vivo entre una chain y su diagrama.** `chainAMermaid` genera el esqueleto una vez,
  a propósito: si lo reflejara en tiempo real, cualquier retoque de la chain borraría lo que
  el autor escribió encima.

## Deuda que queda anotada

- `MermaidDiagram` reinicializa mermaid cuando cambia el tema, con una variable global de
  módulo (`lastMermaidTheme`). Con el editor abierto habrá **dos** consumidores del mismo
  singleton. Mirarlo en la fase 1, antes de que dé un fallo raro.
- `rehypeLineas` marca cada bloque de primer nivel con `data-line`, pero `MermaidDiagram` no
  recibe esa propiedad hoy. Hay que pasársela para la fase 3.
- No hay anotaciones sueltas en `flowchart`: lo más cercano es un nodo sin aristas, que ya
  se conserva. Se contesta explicándolo.
