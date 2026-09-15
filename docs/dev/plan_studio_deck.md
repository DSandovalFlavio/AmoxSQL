# Plan de implementación — el Studio de Report Flow

Auditoría: [`auditoria_studio_deck.md`](auditoria_studio_deck.md) (las 50 preguntas).
Rediseño: [`mockup_studio_deck.html`](mockup_studio_deck.html).
Este documento es el plan y también la bitácora: cada casilla se marca al cerrarse.

## Punto de partida

El formato está terminado y la lámina está terminada. Lo que falta es la interfaz de
edición: hoy el Studio **enseña el resultado y esconde los mandos**. Las cincuenta
preguntas caen en cinco huecos, y el plan es cerrarlos en ese orden.

## El orden y por qué

1. **La fase 0 va primera porque es el sustrato.** Todo lo demás cuelga de «qué hay
   seleccionado», y para seleccionar algo primero tiene que existir. Sin regiones, el
   inspector no tendría de qué hablar.
2. **La marca del deck (fase 2) se adelanta a las herramientas de escritura** aunque
   parezca menos vistosa. Es el único hueco donde hoy **no hay interfaz en absoluto** —
   nueve ajustes que sólo se tocan escribiendo YAML— y es el que valida por primera vez
   que el inspector sabe escribir en el front-matter, que es el camino de serialización
   más delicado.
3. **Los bloques de dato (fase 4) van después de escribir (fase 3)** porque se insertan
   desde el menú de `/`, que nace en la 3.
4. **El crudo y los gestos (fase 5) van al final** porque son los únicos que tocan el
   historial de edición, y conviene que el resto esté asentado antes de meter deshacer.

---

## Fase 0 — Las regiones

Sin esto ninguna de las otras cinco fases tiene dónde agarrarse.

- [x] **Modelo de regiones por disposición.** Una tabla que diga, para cada uno de los 16
      layouts, qué regiones tiene, cómo se llaman y en qué orden se recorren. Hoy esa
      información existe pero **repartida entre dos archivos y en forma de JSX**:
      `SlidePreview.jsx` y `SlideDesigner.jsx` construyen cada disposición a mano y cada
      uno a su manera. Se extrae a un solo sitio y los dos lo consumen.
- [x] Dibujar las regiones **en reposo**: filete de puntos y nombre en versalitas.
      El plan decía «en unidades de diseño (`--u`) como todo lo demás de la lámina» y
      **se hizo en píxeles**: lo de dentro de la lámina va en `--u` porque es contenido
      y tiene que escalar con ella, pero esto es interfaz del editor — en `--u` una
      etiqueta baja de 5 px con el panel estrecho. Y el filete va en `outline`, no en
      `border`: un borde de 1 px dentro de una celda de la retícula desplazaría el
      contenido, y se vería una cosa distinta de la que se va a presentar.
- [x] Selección: pinchar una región la selecciona; `Tab` pasa a la siguiente; `Intro` o el
      segundo clic entran a editar; `Esc` sale.
      **Cuidado:** hoy el primer clic entra directamente a editar (`EditableProse`). El
      cambio a «primer clic selecciona» es deliberado —es lo que permite que el inspector
      tenga contexto— pero hay que conservar el doble clic como atajo directo a editar.
- [x] Vista limpia (`Ctrl+.`): apaga las regiones sin salir de Design.
- [x] El aviso de desborde señala **qué región** desborda, no sólo la lámina. `useDesborde`
      ya mide caja por caja; hoy se queda con el peor y tira el resto.

**Riesgo:** el modelo de regiones es una refactorización de dos componentes que hoy
funcionan. Se hace primero justamente por eso — cuanto más tarde, más código encima.

## Fase 1 — El inspector

- [x] Tercera columna a la derecha, plegable. Refleja la selección; no lleva pestañas.
- [~] **Tres** estados, no cuatro: lámina · región de texto · figura. El de la marca del
      deck llega en la fase 2 con su contenido — montar aquí la pestaña vacía sería
      enseñar un hueco con una disculpa dentro.
- [x] **Estado lámina:** disposición (galería), tono, campos del pie con casillas. Son las
      tres directivas que hoy hay que memorizar (`layout`, `tone`, `footer`).
- [x] Al cambiar de disposición, decir **qué se queda huérfano** antes de aplicar.
      **Corregido a mitad:** el aviso es sobre FIGURAS, no sobre texto. La primera versión
      comparaba partes de prosa y saltaba en cuatro tarjetas sin motivo — las partes no son
      trozos distintos, son vistas del mismo string y entre todas cubren siempre la prosa
      entera. Con las figuras sí pasa: una rejilla admite cuatro y un hallazgo una.
- [x] **Estado figura:** origen, sustituir, abrir en Story Flow, tarjeta sí/no, paleta,
      frescura.
- [~] El panel izquierdo pierde **Layouts**, que se va al inspector. Figuras e Imágenes
      siguen ahí hasta la fase 3, que es cuando pasan a invocarse desde donde se usan:
      quitarlas antes dejaría el deck sin ninguna forma de insertar nada.
- [x] Plegado del inspector con memoria en `localStorage`, y plegado **automático** con
      `@container` por debajo de 900 px de Studio — midiendo el panel y no la ventana, que
      en vista partida no son lo mismo.

**Riesgo:** tres columnas en un panel partido se quedan sin sitio. El inspector tiene que
plegarse solo por debajo de cierto ancho, no esperar a que el usuario lo haga.

## Fase 2 — La marca del deck

El hueco más grande: hoy **no existe interfaz**.

- [x] Panel Deck: título, hilo de sección, autor, periodo, fecha de corte, fuente. Entra por
      un conmutador de **ámbito** (Lámina · Deck) en el inspector. No contradice el «sin
      pestañas» de la fase 1: aquello era sobre el contexto, que no se elige; esto son dos
      objetos distintos, y el deck no se puede seleccionar en el lienzo porque no está
      dibujado en ninguna parte.
- [~] Acento y paleta de figuras. La **vista previa en vivo sobre el esquema** se quedó
      fuera: el esquema no renderiza láminas, sólo títulos, así que no había dónde
      previsualizar. El acento se ve aplicado en la lámina activa, que es donde se mira.
- [x] Tono del deck (tema · claro · oscuro), que la lámina puede sobreescribir.
- [ ] Campos del pie a nivel de deck, heredables por lámina. **Pendiente**: hoy sólo se
      editan por lámina. La herencia ya funciona en `resolveFooterFields`; falta el control.
- [x] **Comprobación de contraste antes de aplicar.** El cálculo se rehízo en el cliente
      (`deckColor.js`), no se importó del script de Node. Y el acento **no se resuelve de
      una tabla**: se compone en CSS y cambia con el tema, el modo y el tono, así que se
      lee del DOM aplicando la clase a una sonda y se mide contra el fondo real de la
      lámina. Piso 4,5:1, el mismo que usa el script. Un acento flojo se marca, no se
      prohíbe: puede haber un motivo, y decidir por el autor no es nuestro trabajo.
- [ ] Logotipo del deck: imagen en la portada, opcional en el pie. **Pendiente**: el
      formato no tiene todavía clave para esto y el contrato visual no define dónde va.
- [ ] **Separar la firma de la salvedad.** Los `.amoxvis` de la galería traen
      `chartFootnote: "Generated by AmoxSQL AI · 9/8/2026"`, que es una firma y no una nota
      analítica, y hoy sube al pie de cada lámina. Deuda anotada desde la v5.2.0.

**Riesgo:** escribir front-matter es reescribir la cabecera del archivo. `serializeDeck` ya
conserva `frontMatterText` tal cual; hay que pasar a **editarlo** sin perder claves que no
conozcamos ni el orden de las que ya estaban.

## Fase 3 — Escribir

- [~] Barra de formato: negrita, cursiva, código, enlace, lista y conclusión, con
      `Ctrl+B` · `I` · `K`. **No flota sobre la selección**, va fija encima del cuadro
      mientras editas. Colocar algo sobre el cursor de un `<textarea>` exige un div espejo
      y medir ahí, que es frágil — pero además la fija es mejor aquí: el diagnóstico es que
      el Studio esconde los mandos, y una barra que sólo aparece si ya sabías que había que
      seleccionar algo los sigue escondiendo.
- [x] Menú de inserción con `/` dentro de una región.
- [~] **El catálogo tampoco se reutilizaba tal cual**, y eso el plan no lo vio. El widget
      propio salió como se preveía (`slashMenu.js` está atado a Monaco), pero el catálogo
      del editor de documentos **mentía por los dos lados** dentro de una lámina: ofrecía
      la cabecera del documento, el índice y las casillas de tarea —que en una diapositiva
      no significan nada— y **no ofrecía los cinco bloques de dato del deck**. Escribir
      `/metr` y que no salga nada es peor que no tener menú. Hay un catálogo de lámina que
      añade `kpis`, cifra ancla, tabla clasificada, acciones y figura, y quita lo que es
      sólo de documento.
      Sin paradas encadenadas: se selecciona la primera y el resto se queda con su texto
      de ejemplo. Un `textarea` no sabe de eso.
- [ ] Medidor de ocupación de la región. **Pendiente.** El aviso de desborde ya dice qué
      región se pasa (fase 0), que es la mitad útil; falta el «cuánto queda» antes de
      pasarse, y eso necesita medir la región contra su hueco en cada tecla.
- [ ] Pegar HTML enriquecido y pegar imágenes. **Pendiente, y con una decisión detrás:**
      convertir HTML a markdown en condiciones quiere una dependencia nueva, y eso no se
      mete sin evaluarla antes. Pegar una imagen necesita además un punto de entrada en el
      servidor para guardarla en el proyecto.

## Fase 4 — Los bloques de dato

- [x] Formularios para los cinco: `kpis`, `metric`, `steps`, `actions`, `rank`.
- [~] Se abren desde el inspector cuando la región está **seleccionada pero no en edición**,
      no «cuando el cursor está dentro del bloque». El formulario trabaja sobre la prosa
      confirmada: seguir el cursor dentro del `textarea` pondría dos escritores sobre la
      misma cadena y el que pierde la carrera se lleva lo que el otro acababa de escribir.
      Desde el menú de `/` se insertan, y al salir de la edición el formulario ya está ahí.
- [x] Las reglas del contrato visual se dicen **en el formulario**. Comprobado en la
      aplicación: al pasar de cinco métricas sale el aviso. Y son avisos, no prohibiciones.
- [x] El YAML sigue siendo editable a mano. El formulario es un camino más, no el único.

## Fase 5 — El crudo y los gestos

- [ ] Crudo **de la lámina activa** (`Ctrl+Shift+E`), junto al lienzo. La vista Source del
      archivo completo se queda como está.
- [ ] Las directivas salen atenuadas y con explicación al pasar por encima.
- [ ] Error de markdown señalado en su línea, sin dejar de renderizar lo que sí se entiende.
- [ ] Deshacer (`Ctrl+Z`) en todo el Studio. El estado es el contenido del archivo, así que
      es una pila de cadenas — barato. **Ojo:** no debe pelearse con el deshacer nativo del
      `<textarea>` mientras se está editando una región.
- [ ] Duplicar lámina (`Ctrl+D`), arrastrar para reordenar, ocultar del pase sin borrar.
- [ ] El esquema pliega por sección, usando el separador que ya marca el corte.
- [ ] Repaso previo: desbordes, figuras sin datos, huecos vacíos, consultas viejas.

---

## Lo que este plan deja fuera, y por qué

- **La lámina renderizada.** El contrato visual está implementado y validado. Ninguna de
  las cincuenta preguntas pide cambiarlo.
- **Review y Present.** Funcionan; no se tocan.
- **Arrastrar cajas por el lienzo.** La retícula es el contrato visual y es lo que hace que
  todas las láminas se parezcan entre sí. La pregunta 14 se contesta explicándolo.
- **Un lienzo distinto de 16:9.** Decidido hace tiempo: no.
- **Colaboración y comentarios.** Fuera del alcance del producto hoy.

## Deuda que queda anotada

- La narrativa que genera `chartStory.js` sigue en inglés y aparece dentro de las figuras
  del deck. Es una decisión de idioma para toda la generación de texto, no de esta
  iniciativa.
- Los documentos de usuario de Report Flow (`docs/*/reports/report-flow.md`) siguen
  documentando el campo `aspect`, que se ignora desde la v5.2.0, y una tabla de 5
  disposiciones cuando hay 16.
- El aviso «Content overflows by 124px» aparece en la lámina 5 del deck de demo en vista
  Design. No está atribuido: no se comparó contra el estado anterior a la v5.4.0. En el
  pase esa lámina se ve entera.
