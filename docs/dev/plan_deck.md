# Plan de implementación — la diapositiva de Report Flow

Contrato visual: [`sistema_deck.html`](sistema_deck.html). Este documento es el plan
para llevarlo al código, y también la bitácora: cada casilla se marca al cerrarse.

## Punto de partida

Report Flow ya tiene lo difícil de un formato: markdown como fuente única, front-matter,
láminas separadas por `---`, directiva de disposición, un gráfico vivo por lámina con
variables y «Refresh all», notas de orador, Studio visual de tres vistas y export a
PowerPoint nativo y a Word.

Lo que no tiene es **la lámina**. Hoy `.deck-slide` es un `MarkdownPreview` con relleno:
el `h2` hereda el filete inferior del preview de documentos, no hay antetítulo, no hay
pie, no hay KPIs, no hay número de lámina, y el gráfico entra con su tarjeta puesta
dentro de otra tarjeta.

Ese es todo el trabajo: convertir un preview de markdown en un lienzo.

## El orden y por qué

1. **Fase 0** va primero porque cambia el sistema de medidas. Todo lo demás se expresa
   en esas unidades; hacerlo después obligaría a reescribir cada fase anterior.
2. **La fase 2 (el pie) va antes que la 3 (la tarjeta)** aunque la 3 se vea más: el pie
   no toca el `DataVisualizer`, se apoya en datos que ya viajan por la red, y es lo que
   convierte el deck en auditable. Es la mejor relación entre lo que devuelve y lo que
   cuesta.
3. **La fase 6 va al final** porque es la única que rompe un contrato existente
   (`splitSlideContent` asume exactamente una figura). Todo lo que se pueda hacer sin
   romperlo, se hace antes.

---

## Fase 0 — El lienzo

Sin esto ninguna medida del contrato significa nada.

- [x] `deck.css`: el contenedor de consulta va en `.deck-slide-card`, **nunca** en
      `.deck-slide`. Una lámina que fuera su propio contenedor tendría el relleno
      expresado en la unidad que deriva de ella misma — referencia circular, y el
      navegador resuelve lo que quiere. Verificado en el contrato: con el contenedor en
      el envoltorio, `--u: calc(100cqw / 1600)` da relleno de 72 u y título de 40 u
      exactos.
- [x] Escala tipográfica de la lámina en unidades de diseño (tabla del apartado 02 del
      contrato). Deja de heredar de `.mde-preview-body`.
- [x] `.deck-slide`: fuera `overflow-y: auto`. Una lámina es una página; si no cabe, no
      cabe. Hoy el scroll esconde el problema en pantalla para que reviente en el PDF.
- [x] Aviso de desborde en la vista Design: medir `scrollHeight > clientHeight` con un
      `ResizeObserver` y marcar la lámina. Es la contrapartida honesta de quitar el
      scroll — sin el aviso, quitarlo sólo cambia un fallo visible por uno silencioso.
- [x] 16:9 fijo: fuera `ASPECT_MAP` de `DeckEditor.jsx:41`. Si el front-matter trae
      `aspect`, se ignora y se avisa una vez en la consola (hay decks escritos con esa
      clave).
- [x] `DECK_STARTER_TEMPLATE` sin `aspect`.

**Riesgo:** quitar el scroll deja a la vista contenido que hoy se desborda en silencio.
Es intencionado, pero conviene revisar los `.amoxdeck` de ejemplo del repo antes de
cerrar la fase.

## Fase 1 — La lámina como afirmación

- [x] Antetítulo: `section:` en el front-matter (hilo del deck) y
      `<!-- eyebrow: … -->` para sobreescribirlo en una lámina suelta.
- [x] Título como afirmación: escala de 40 u, sin filete inferior, máximo 3 líneas,
      `text-wrap: balance`.
- [x] Bajada: el primer párrafo tras el `##`, a 20 u y en `--text-secondary`.
- [x] Viñetas, prosa libre y conclusión (el `>` de markdown pasa a ser la conclusión con
      filete de acento). El punto de la viñeta va **posicionado, no como ítem de
      rejilla**: en un contenedor grid cada `<b>` y cada `<code>` del texto se convierte
      en ítem suelto y la viñeta ocupa varias filas (me pasó escribiendo el contrato).
- [x] Alertas `> [!note]` y `> [!warning]`. **Ya existían**: `remarkAlerts` y
      `ALERT_META` llevan cinco tipos en `MarkdownPreview`. El contrato las daba
      por ausentes porque audité los archivos del deck sin auditar el preview de
      markdown — el mismo fallo que con LaTeX y Mermaid. Aquí sólo se les ajusta
      la escala.
- [x] Comprobar que KaTeX y Mermaid heredan la escala de la lámina. **No había que
      añadirlos**: `MarkdownPreview` ya monta `remark-math`, `rehype-katex` y `mermaid`,
      así que una fórmula y un diagrama ya funcionan hoy dentro de la diapositiva. Lo
      único a validar es el tamaño y que el tema del diagrama siga al del deck.

## Fase 2 — El pie de procedencia

Lo que hace que esto sea un deck de AmoxSQL y no una plantilla bonita.

- [x] Componente `DeckFooter` con los seis campos: fuente, consulta, filas, variables
      activas como chips, refresco y número.
- [x] Canal de datos: hoy no existe. `AmoxChartEmbed` conoce `chartSource`, el nombre
      del `.amoxvis` y la respuesta de `/api/query` —que ya trae **`rowCount` y
      `limited`**—, pero no tiene por dónde subirlos. Contexto de React creado en
      `DeckEditor` y alimentado por cada embed.
- [x] El campo real es **`truncated`**, no `limited` como decía este plan: con el
      nombre equivocado el pie habría dado por completo todo resultado recortado.
      Importa tanto como `rowCount`: un resultado truncado presentado como
      completo es exactamente el fallo que este pie existe para evitar. Si viene
      truncado, el pie lo dice.
- [x] Marca de refresco a partir del último «Refresh all». En ámbar pasados 7 días.
- [x] Configuración: `footer: [source, query, rows, vars, refreshed, number]` o
      `footer: false` en el front-matter; `<!-- footer: false -->` y
      `<!-- footer: number -->` por lámina.
- [x] Su contenido no se teclea, se deriva. `source:` dentro del bloque **añade** una
      salvedad, no sustituye lo derivado.
- [x] La portada nunca lo lleva.

## Fase 3 — La tarjeta se disuelve

- [x] Prop `chrome` en `DataVisualizer` (`'card' | 'none'`). Cuidado: `isReportMode` ya
      existe y hace parte del trabajo (oculta controles, fondo transparente, sin
      relleno) pero **no quita la tarjeta**, así que hace falta una prop aparte y no
      reutilizar la que hay.
- [x] Subir las piezas suprimidas a la lámina: título, subtítulo, KPI con su variación,
      conclusión y nota. Dos caminos —
      **(a)** callback `onFigureParts(partes)` desde `componerFigura`;
      **(b)** que `AmoxChartEmbed` lo calcule por su cuenta con `computeHeadline`, que ya
      se exporta.
      **Recomiendo (a)**: (b) duplicaría la lógica de la matriz de validez del KPI, que
      ya nos costó una ronda de correcciones.
- [x] Reglas de colocación del apartado 05: el título del gráfico sube a título de
      lámina **sólo si la lámina no tiene el suyo**; el KPI entra en la tira; la firma
      desaparece porque el pie ya la lleva.
- [x] `card: true` en el bloque `amoxchart` como escape. Nunca por defecto.
- [x] La leyenda se queda con la figura: es lo único que da sentido a los colores.
      (Ya intenté una vez ocultarla con una sola serie y fue un error — en treemap y en
      barras por categoría hay una sola clave de serie y la leyenda es imprescindible.)

## Fase 4 — Los objetos de dato

- [x] Bloque ```kpis``` — de 2 a 5 métricas con valor, variación y base de comparación.
      Con seis, aviso en el Studio: cada uno baja de 240 u y deja de leerse.
- [x] Bloque ```metric``` — la cifra ancla.
- [x] Bloque ```steps``` y bloque ```actions``` (con responsable y fecha).
- [x] Tabla clasificada. **Va como bloque `rank` y no sobre la tabla GFM**: hace
      falta decir qué columna se dibuja como barra, cuál es el semáforo y qué filas
      se resaltan, y el markdown no sabe expresar eso. Una tabla normal se sigue
      escribiendo con la sintaxis de siempre.
- [x] Semáforo por fila: `ok` / `risk` / `bad`, declarado con `status: <columna>`
      igual que la barra. No se adivina por el contenido: una celda que diga «ok»
      puede ser un dato.
- [x] Verde y rojo son semánticos y **no salen de la paleta**: si la paleta los aporta,
      un cambio de paleta invertiría el significado.

## Fase 5 — Los diez tipos nuevos

Por cada uno: entrada en `DECK_LAYOUTS`, plantilla en `DECK_LAYOUT_TEMPLATES`, vista
previa esquemática en `DECK_LAYOUT_META` y render en `SlideDesigner`.

- [x] `cover`, `section`, `summary`, `statement`, `metric`
- [x] `chart-grid`, `compare`, `table`, `steps`, `actions`, `method`, `closing`
- [x] Renombrar los cinco actuales conservando alias: `title` → `cover`,
      `content-chart` → `finding`. Los `.amoxdeck` escritos siguen abriéndose.
- [x] `LayoutsPanel` agrupado por familia (portada · texto · evidencia · cierre): quince
      entradas en una lista plana no se eligen, se sufren.
- [x] Identificadores en inglés. Lo que se traduce es lo que el usuario ve en el Studio,
      no lo que se escribe en el archivo.

> **Estado — LAS NUEVE FASES CERRADAS Y PROBADAS EN LA APP.** Rama
> `claude/deck-fase-0`. Lo que queda anotado abajo son límites conocidos, no
> tareas pendientes del plan.
>
> **Estado por fases (histórico).** Fases 0 a 5, probadas en la app. Rama
> `claude/deck-fase-0`. El deck de prueba vive en `Curso_SQL/revision_campanas.amoxdeck`:
> 15 láminas sobre datos reales del dataset de campañas, 13 de los 16 tipos, los
> seis bloques, LaTeX, alertas y cuatro gráficos vivos.
>
> Abrirlo destapó **siete fallos que ninguna prueba de CSS, lógica o compilación
> podía ver** — el peor: las expresiones de los bloques cercados exigían LF, así
> que con un archivo CRLF la lámina `finding` nunca se repartía en dos columnas,
> y no se notaba porque el gráfico se dibujaba igual por otra vía. Están todos
> arreglados y documentados en el commit correspondiente.
>
> Quedan dos límites conocidos, ninguno un fallo:
>
> 1. Dentro de una columna, el dibujo ocupa alrededor del 60 % del alto
>    disponible en vez de llenarlo. Se lee bien, pero desperdicia sitio.
> 2. Una escala común sólo se impone si las figuras son comparables (menos de
>    25× entre la mayor y la menor). Cuando no lo son, la lámina lo dice en
>    lugar de aplanar la pequeña contra el eje.

> **Estado anterior (sin la app).** Rama `claude/deck-fase-0`, seis commits.
> Verificado a nivel de CSS (midiendo con el CSS real servido por HTTP), de
> lógica (parser y bloques contra los módulos reales) y de compilación. **Falta
> la comprobación dentro de la app**: no hay ningún `.amoxdeck` en el repo ni en
> un proyecto de prueba con el que abrir el Studio.

## Fase 6 — Varias figuras por lámina

La fase que rompe un contrato. Va sola y al final.

- [x] `splitSlideContent` → devuelve `charts: [{ slot, src, card }]` en vez de un único
      `chartSrc`. Hoy toma la primera figura y deja las demás dentro del texto.
- [x] `buildSlideRaw` idem, con `slot: a|b|c|d` en el bloque.
- [x] Compatibilidad: una lámina con un solo `amoxchart` sin `slot` sigue funcionando
      exactamente igual. Es la garantía de que ningún deck existente se rompe.
- [x] `SlideDesigner`: huecos múltiples, y `ChartsPanel` preguntando a qué hueco va la
      figura que se inserta.
- [x] `chart-grid` y `compare`.
- [x] **Escala común entre figuras hermanas.** Es lo caro de esta fase y no existe hoy:
      cada `.amoxvis` calcula su propio dominio, así que cuatro small multiples saldrían
      con cuatro escalas distintas y la comparación mentiría. Dos salidas — calcular el
      dominio común en el deck y pasarlo a cada `DataVisualizer`, o documentar que el
      autor lo fije en cada `.amoxvis`. **Recomiendo calcularlo**: pedirle al autor que
      cuadre cuatro archivos a mano es pedirle que se equivoque.

## Fase 7 — El export

- [x] `markdownToTextRuns` y compañía: KPIs, cifra ancla, pasos y acciones como cajas de
      texto nativas; tabla clasificada como tabla nativa con la barra aplanada.
- [x] El pie, como caja de texto al pie de la diapositiva.
- [x] LaTeX y Mermaid: hoy `markdownToTextRuns` los deja fuera en silencio. Deben salir
      como imagen, igual que los tipos de gráfico sin equivalencia nativa.
- [x] Los gráficos nativos siguen siendo nativos: eso no se toca.
- [x] Word: los mismos objetos, en flujo.

## Fase 8 — El tema del deck

- [x] `accent` y `palette` en el front-matter, propagados al `DataVisualizer` de cada
      figura. Hoy sólo existe `theme` y la paleta la decide cada `.amoxvis` por su
      cuenta, así que una lámina y su gráfico pueden discrepar.
- [x] Plantilla de arranque nueva: un deck de ejemplo que use portada, resumen,
      hallazgo y acciones — lo que alguien copiaría de verdad.

## Fase 9 — El pase

Esto no estaba en el contrato: el contrato define la lámina, no lo que se hace con ella
delante de una sala. Se añadió después, y por eso va como fase aparte.

- [x] `DeckShow`: overlay a pantalla completa, una lámina cada vez, por portal a `<body>`
      —la pestaña del Studio vive dentro de paneles con `overflow: hidden` y basta un
      `transform` en cualquier ancestro para recortar un `position: fixed`.
- [x] La lámina se dimensiona con unidades de contenedor: `container-type: size` en el
      escenario y `width: min(100cqw, 100cqh * 16/9)` en la tarjeta. Medido: a 1280x760
      da 1244x699,8 (razón 1,7778) y con las notas abiertas 908,8x511,2 — misma razón, y
      la escala de diseño sigue dando 72 u de margen y 40 u de título en ambos casos.
      **Nada de `max-height` sobre `aspect-ratio`**: esa combinación ya deformó una
      figura a 827x284 en el lienzo de Story Flow.
- [x] Se montan tres láminas —anterior, actual y siguiente— y no una ni todas. Cada
      figura ejecuta su consulta al montarse: todas es el bloqueo conocido con N
      gráficos; sólo la actual enseña el «Loading…» en cada avance. La oculta va con
      `visibility` y no con `display`, porque una figura sin caja medible no se dibuja.
- [x] Teclado: avance, retroceso, primera/última, salto por número, vista general,
      notas, negro, cronómetro, pantalla completa y ayuda. En captura y cortando la
      propagación, para que Ctrl+Tab no cambie de pestaña en mitad de una presentación.
- [x] El Escape tiene dos tiempos: el primero lo consume el navegador para salir de
      pantalla completa y el segundo cierra el pase. Salir de las dos cosas de un golpe
      es justo lo que nadie quiere delante de una sala.
- [x] La vista que se llamaba «Present» pasa a llamarse **Review**. Estaba ocupando el
      nombre de la cosa que de verdad presenta. La clave de `localStorage` sigue siendo
      `present` para no invalidar la preferencia de quien ya la tuviera.

**Lo que queda fuera de esta fase, a propósito:** la pantalla de presentador en un
segundo monitor (ventana aparte con la lámina siguiente y las notas). Las notas se ven
hoy en una banda inferior del mismo monitor, que es lo útil cuando se presenta desde un
portátil o compartiendo pantalla; la ventana secundaria es otra conversación y se apoya
en el `popout` de Electron que ya existe.

---

## Lo que este plan deja fuera, y por qué

Nada del contrato. Lo que sigue son cosas que **no están en el contrato** y que menciono
para que no parezcan olvidos:

- **Transiciones y animación entre láminas.** Hay un fundido de 180 ms entre láminas y
  nada más. Una biblioteca de transiciones es decoración, no argumento.
- **Edición colaborativa o comentarios.** Fuera del alcance del producto hoy.
- **Un lienzo distinto de 16:9.** Decidido: no.

## Deuda que queda anotada

- La narrativa que genera `chartStory.js` sigue en inglés y aparece dentro de las
  figuras del deck. Es una decisión de idioma para toda la generación de texto, no de
  esta iniciativa.
- El banco de medición del navegador sigue sin estar en `scripts/`, así que las
  comprobaciones de contraste de la lámina hay que repetirlas a mano.
