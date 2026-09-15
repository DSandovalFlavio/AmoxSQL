# Plan de implementación — el editor visual de diagramas

Un editor de nodos por delante, **mermaid por detrás**. El usuario arrastra, conecta y
escribe; el archivo sigue siendo un bloque ` ```mermaid ` dentro del documento.

Este documento es el plan y también la bitácora: cada casilla se marca al cerrarse.

## Punto de partida

Hoy, para dibujar un diagrama en un documento hay que escribir mermaid a mano. Funciona —
`MarkdownPreview` lo renderiza y hay cuatro plantillas en el menú de `/` — pero escribir
`A[origen] --> B{decide}` es programar, y quien documenta un pipeline no quiere programar
el dibujo del pipeline.

La pregunta que abrió esto fue si existe algo que enchufar o hay que hacerlo desde cero. La
respuesta es **ni una cosa ni la otra**: media herramienta ya está en el repo.

| Pieza | Dónde | Estado |
|---|---|---|
| El lienzo de nodos | `@xyflow/react` 12.10, montado en `chains/ChainCanvas.jsx` | Ya se usa y está tematizado |
| El render | `mermaid` 11.14, montado en `markdown/MarkdownPreview.jsx` | Ya se usa |
| Grafo → mermaid | `chainAMermaid()` en `markdown/diagramFromChain.js` | **Escrito**, 102 líneas |
| Localizar un bloque cercado en el texto | `bloquesDe` / `reemplazarBloque` en `deck/deckBlockModel.js` | Escrito, atado al deck |
| **mermaid → grafo** | — | **No existe. Aquí está el trabajo.** |

## El hallazgo que cambia el planteamiento

El análisis original dio por hecho que habría que **calcular la disposición** de los nodos,
porque el formato mermaid no guarda coordenadas. Eso apuntaba a una dependencia nueva
(dagre, elk) y a un problema de fondo: el editor colocaría las cajas a su manera y el
documento las renderizaría a la suya, enseñando dos dibujos distintos de lo mismo.

Se comprobó sobre mermaid 11.14, renderizando un flujo con decisión, subgrafo y cuatro
formas, y leyendo el SVG que devuelve:

```
<g class="node default" id="probe1-flowchart-A-0"  transform="translate(60.4, 138.1)">
<g class="node default" id="probe1-flowchart-B-1"  transform="translate(213.8, 138.1)">
<path class="... flowchart-link" id="probe1-L_B_C_0">
<g class="cluster" id="probe1-G">
```

**Los identificadores del autor están en el DOM.** Cada nodo lleva su id dentro del `id`
del `<g>` y su posición en el `transform`; cada arista lleva `L_<origen>_<destino>_<n>`;
un subgrafo sale como `g.cluster`; las etiquetas de arista como `g.edgeLabel`.

De donde salen tres consecuencias, y conviene tenerlas claras antes de empezar:

1. **No hace falta una librería de disposición.** Mermaid no guarda posiciones, pero las
   calcula y las publica. Se leen de ahí.
2. **El editor enseña exactamente lo que el documento va a dibujar**, porque la geometría
   sale del mismo motor. El problema de los dos dibujos desaparece; no se resuelve, deja
   de existir.
3. **Sigue haciendo falta el parser de texto.** El SVG da la topología y la geometría, pero
   no dice si una caja se escribió `[]`, `{}` o `[()]`, ni si la flecha era `-->` o `-.->`.
   **El texto da la estructura y la intención; el render da la geometría.** Son dos fuentes
   y cada una contesta lo suyo.

## El orden y por qué

1. **La fase 0 es el formato, y va sola.** Es la única pieza sin la que nada funciona, es
   la que se puede probar sin pintar un píxel, y es donde se decide el subconjunto de
   mermaid que vamos a saber abrir. Sale con pruebas de ida y vuelta antes de que exista
   interfaz.
2. **La fase 1 es leer, no editar.** Abrir el diagrama en un lienzo y no dejar tocarlo
   parece media función, pero valida lo caro —parser, geometría, correspondencia entre
   texto y dibujo— con cero riesgo de perder el documento del usuario.
3. **La fase 2 edita, y ahí entra el guardado.** Es la primera que escribe en el archivo,
   así que va después de que leer esté asentado.
4. **La fase 3 son las formas y el detalle**, que es lo que convierte un grafo en un
   diagrama que alguien quiere enseñar.
5. **La fase 4 es la salida digna**: lo que pasa cuando el parser no entiende algo.
   Deliberadamente al final, porque hasta entonces el botón simplemente no aparece.

---

## Fase 0 — El formato

Sin esto no hay editor. Con esto, aunque no se haga nada más, `diagramFromChain` queda
mejor de lo que está.

- [ ] **Un módulo de formato, `markdown/mermaidFlow.js`**, con las **dos** direcciones
      dentro. No dos archivos: el ida y vuelta sólo sale exacto si las dos mitades conocen
      el mismo subconjunto, y separadas se desincronizan en cuanto alguien añada una forma
      a una y se olvide de la otra.
- [ ] `parsearFlujo(texto)` → `{ nodos, aristas, subgrafos, direccion }` o `null`.
      **Devolver `null` es una respuesta válida y frecuente**, no un fallo.
- [ ] `flujoAMermaid(grafo)` → texto. La tabla `FORMA` se muda aquí desde
      `diagramFromChain.js`, que pasa a ser **consumidor**: chain → grafo → `flujoAMermaid`,
      en vez de componer cadenas a mano. `PLANTILLAS_DIAGRAMA` se queda donde está, que es
      contenido de menú y no formato.
- [ ] **El subconjunto, declarado en el propio archivo** y no repartido por el código:
      `flowchart`/`graph` con dirección `TB|TD|BT|LR|RL`; siete formas de nodo — las cinco
      que ya emite `chainAMermaid` (`[]`, `[()]`, `{}`, `(())`, `[//]`) más redondeado
      `()` y trapecio `[\\]`; aristas
      `-->`, `---`, `-.->`, `==>` con etiqueta `|texto|` o `-- texto -->`; `subgraph`/`end`
      con un nivel de anidamiento.
- [ ] **Todo lo demás hace que `parsearFlujo` devuelva `null`**: `%%{init}%%`, `classDef`,
      `class`, `click`, `style`, `linkStyle`, anidamiento de subgrafos de más de un nivel,
      y cualquier tipo que no sea flowchart. Abrir y tragarse la mitad al guardar es
      pérdida de datos; negarse es gratis.
- [ ] **Extraer el localizador de bloques cercados.** `bloquesDe` y `reemplazarBloque` ya
      existen en `deck/deckBlockModel.js`, pero filtran por la lista de lenguajes del deck.
      Se saca la parte genérica a `markdown/fencedBlocks.js` y la consumen los dos.
      *(La función de contraste llegó a tener tres copias en el repo, y la tercera era la
      mala. No se copia un helper: se muda.)*
- [ ] `scripts/probarMermaidFlow.mjs`, con el ida y vuelta como criterio: parsear un texto,
      serializarlo y volver a parsearlo tiene que dar el mismo grafo. Y una batería de
      textos que **deben** rechazarse.

**Criterio de hecho:** las cuatro `PLANTILLAS_DIAGRAMA` y la salida de `chainAMermaid`
sobre una chain real hacen el ida y vuelta sin perder nada.

## Fase 1 — Leer

Abrir el diagrama en un lienzo, sin dejar tocarlo todavía.

- [ ] **Botón «Editar» en el bloque renderizado**, junto al de expandir que ya existe en
      `MermaidDiagram` (`MarkdownPreview.jsx:119`). **Sólo aparece si `parsearFlujo`
      devuelve algo.** Un botón que a veces da error es peor que un botón que a veces no
      está.
- [ ] **`markdown/DiagramEditor.jsx`** — React Flow en un portal a pantalla completa,
      reusando el patrón de `FullscreenViewer` que ya está en ese archivo.
      `ChainCanvas.jsx` es **referencia, no base**: importa 34 tipos de nodo atados a la
      ejecución de chains, validación de ciclos y configuración por nodo. De ahí se copia
      el montaje y el tematizado; no se extiende.
- [ ] **Posiciones leídas del SVG de mermaid.** Se renderiza una vez en oculto, se leen los
      `transform` y se mapean por el id del `<g>`. **Pendiente de comprobar en esta fase:**
      qué ocurre cuando dos nodos distintos sanean al mismo identificador, y si el índice
      final del id (`-0`, `-1`) es estable entre renders.
- [ ] Un solo tipo de nodo propio, `DiagramNode`, con la forma pintada en CSS a partir del
      campo `forma` del modelo. Nada de un componente por forma.
- [ ] El lienzo **respeta el tema** y el acento, como el de Data Flow.

**Criterio de hecho:** abrir el diagrama de `PLANTILLAS_DIAGRAMA.flujo` y el generado por
`chainAMermaid` sobre una chain de verdad, y que el lienzo se parezca al SVG.

## Fase 2 — Editar y guardar

La primera fase que escribe en el documento del usuario.

- [ ] Añadir nodo, borrar nodo, conectar, desconectar, renombrar.
- [ ] **Guardar reescribe el bloque, no el documento.** Se localiza el bloque por su línea
      —`rehypeLineas` ya marca cada bloque de primer nivel con `data-line`, aunque hoy
      `MermaidDiagram` no recibe esa propiedad: hay que pasársela— y se sustituye con
      `reemplazarBloque`. Lo de fuera del bloque no se toca.
- [ ] **El editor no guarda posiciones, y eso es una decisión, no una carencia.** Mermaid no
      tiene dónde ponerlas. Si se dejara arrastrar libremente, el usuario colocaría una caja,
      guardaría, y al reabrir la encontraría en otro sitio: el editor habría prometido algo
      que el formato no sostiene. **Se puede arrastrar para reordenar y para cambiar de
      subgrafo; no para fijar coordenadas.** Al guardar, la disposición se recalcula.
- [ ] **Cancelar deja el texto intacto**, y cerrar con cambios sin guardar pregunta.
- [ ] Deshacer y rehacer dentro del editor. La pila es **el texto mermaid**, no una lista de
      operaciones — mismo razonamiento que en `deck/useHistorial.js`, y por la misma razón:
      no hay que escribir la inversa de cada acción.

**Criterio de hecho:** un diagrama abierto, editado y guardado produce un bloque que el
preview renderiza, y el resto del documento sale byte a byte igual.

## Fase 3 — Las formas y el detalle

Lo que convierte un grafo en un diagrama presentable.

- [ ] Cambiar la forma de un nodo desde el lienzo (las siete del subconjunto).
- [ ] Etiqueta en la arista, y estilo de flecha (sólida, punteada, gruesa).
- [ ] Dirección del diagrama (`LR`/`TB`/…), que es una propiedad del diagrama entero.
- [ ] Subgrafos: crear, renombrar, meter y sacar nodos.
- [ ] Insertar un diagrama **vacío** desde el menú de `/` y editarlo visualmente sin pasar
      por el texto. Hoy las plantillas insertan texto; esto cierra el círculo.

## Fase 4 — Cuando no se entiende

- [ ] Si `parsearFlujo` devuelve `null`, **el botón no aparece** y el bloque se comporta
      como hoy. Silencio, no error.
- [ ] Salvo cuando es un flowchart que casi entendemos: ahí sí, un aviso discreto que diga
      **qué línea** no se supo leer y ofrezca editarlo como texto. La diferencia importa —
      un `sequenceDiagram` no es un fallo, es otro tipo de diagrama; un `flowchart` con un
      `classDef` es algo que el usuario esperaba poder abrir.
- [ ] Documentación de usuario: qué se puede editar visualmente y qué no, y por qué.

---

## Lo que este plan deja fuera, y por qué

- **Secuencia, estados, Gantt, ER.** Sólo flowchart. Es lo que dibuja un analista
  documentando un pipeline, y es lo que `chainAMermaid` ya emite. ER además ya existe,
  generado desde la base de datos en `ErDiagram.jsx`.
- **Un tipo de archivo `.diagram` propio.** El diagrama vive dentro del documento que lo
  explica. Un archivo aparte obliga a inventar navegación, guardado y referencias para algo
  que hoy es un bloque de texto.
- **Usar el parser interno de mermaid.** Su API pública (`parse`, `render`, `detectType`)
  valida y dice el tipo, pero no devuelve el grafo. Para eso hay que entrar por
  `mermaidAPI`, marcado `@deprecated` y `@internal` en sus propios tipos: atarse a eso
  significa que una subida de versión menor deja de abrir los diagramas de la gente.
  **Usamos su render, que es API pública y estable, y nuestro parser.**
- **Enlace vivo entre una chain y su diagrama.** `chainAMermaid` genera el esqueleto una
  vez, a propósito: si lo reflejara en tiempo real, cualquier retoque de la chain borraría
  lo que el autor escribió encima.

## Deuda que queda anotada

- `MermaidDiagram` reinicializa mermaid cuando cambia el tema, con una variable global de
  módulo (`lastMermaidTheme`). Con el editor abierto habrá **dos** consumidores del mismo
  singleton. Conviene mirarlo en la fase 1 antes de que dé un fallo raro.
- Las cuatro `PLANTILLAS_DIAGRAMA` están en `diagramFromChain.js`, que tras la fase 0 deja
  de ser el archivo del formato. Su sitio natural es `markdownInsertables.js`, con el resto
  del catálogo del menú de `/`.
