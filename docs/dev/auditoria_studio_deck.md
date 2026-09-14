# Auditoría — el Studio de Report Flow no se deja usar

> El formato está bien y la lámina está bien: el contrato visual
> ([`sistema_deck.html`](sistema_deck.html)) se implementó entero y una presentación
> terminada se ve como debe. Lo que no funciona es **llegar hasta ahí**. Esta auditoría
> sale de usar la herramienta de verdad, no de leer el código. Fecha: 2026-09-14.

---

## 1. El diagnóstico en una frase

> El Studio enseña el **resultado** y esconde los **mandos**.

La lámina se pinta exactamente como va a salir —eso es una virtud y no se toca— pero de
ahí se dedujo, sin decirlo nunca, que la interfaz de edición también tenía que ser
invisible. Y una interfaz invisible sólo la usa quien la escribió.

Tres consecuencias, y las tres se notan en el primer minuto:

1. **No se ve qué es editable.** El aviso «Edit text» aparece al pasar el ratón. Si no
   pasas el ratón por encima justo de ahí, la lámina es una imagen.
2. **No hay mandos para lo que se edita.** Poner una palabra en negrita es escribir `**`.
   Añadir una métrica es escribir YAML dentro de una cerca. La interfaz no ayuda: se
   limita a no estorbar.
3. **Lo que no cabe en la lámina no existe.** El tema del deck, el acento, la paleta, el
   autor, el periodo, qué campos lleva el pie — todo eso sólo se toca escribiendo
   front-matter en la vista Source, que además enseña el archivo entero.

## 2. Lo que hay hoy, pieza por pieza

| Pieza | Qué hace | Qué falla |
|---|---|---|
| **Vista Design** | Una lámina, click-to-edit | Las regiones no se anuncian; cada disposición tiene las suyas y no hay forma de saber cuáles |
| **Vista Review** | Todas las láminas en solo lectura | Correcta. No se toca |
| **Vista Source** | Monaco con el `.amoxdeck` **entero** | Para retocar una lámina hay que encontrarla entre 260 líneas |
| **Panel Slides** | Esquema, reordenar, borrar | Correcto. Le falta duplicar |
| **Panel Layouts** | Galería de 16 disposiciones | Enseña la forma, no dice qué regiones trae ni qué pasa con lo que ya escribiste |
| **Panel Charts** | Lista de `.amoxvis` | Actúa sobre la lámina activa, pero eso no se dice en ninguna parte |
| **Panel Images** | Inserta `![](ruta)` en la prosa | La imagen cae al final del texto, no donde estabas |
| **Notas del orador** | Tira plegable bajo el lienzo | Plegada por defecto y sin indicio de que existan |
| **Aviso de desborde** | «Content overflows by 124px» | Dice el problema, no ofrece la salida |
| **Tema del deck** | — | **No existe interfaz.** Sólo front-matter a mano |
| **Bloques de dato** | `kpis`, `metric`, `steps`, `actions`, `rank` | **No existe interfaz.** Sólo YAML a mano |
| **Deshacer** | — | **No existe** |

## 3. Las 50 preguntas

Las de un analista que abre el Studio por primera vez con datos de verdad y una reunión
el jueves. Cada una es una pregunta que la interfaz de hoy no contesta, o contesta mal.

### Empezar (1–6)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 1 | Tengo mis gráficos hechos, ¿cómo empiezo una presentación con ellos? | Crear deck desde la galería: elegir figuras y salir con una lámina por figura, no con un archivo vacío |
| 2 | ¿Por dónde empiezo, por el texto o por la estructura? | Plantillas de deck completo (revisión, hallazgo único, propuesta), no sólo plantillas de lámina suelta |
| 3 | Esta lámina en blanco, ¿qué se supone que lleva? | La lámina vacía enseña sus regiones con nombre y un ejemplo en gris, no un hueco mudo |
| 4 | ¿Cuántas láminas debería tener esto? | El esquema muestra el arco del deck (apertura · evidencia · cierre) y avisa si falta alguna parte |
| 5 | ¿Puedo cambiar de idea sobre la disposición después de escribir? | Sí, y antes de aplicarla se dice qué se conserva y qué se queda huérfano |
| 6 | Me equivoqué. ¿Deshacer? | `Ctrl+Z` en todo el Studio, no sólo dentro de un cuadro de texto |

### El lienzo: qué puedo tocar (7–14)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 7 | ¿Qué partes de esta lámina puedo editar? | Las regiones se dibujan **en reposo**, con filete tenue y nombre, sin esperar al ratón |
| 8 | ¿Dónde escribo el título? | Cada región lleva su nombre: antetítulo · afirmación · narrativa · figura · cierre · pie |
| 9 | Pincho y me sale texto plano con asteriscos. ¿Esto es lo que va a ver la gente? | El cuadro de edición conserva el formato mientras escribes, y el crudo es una opción, no el único modo |
| 10 | ¿Cómo salgo de aquí sin romper nada? | `Esc` cancela, `Ctrl+Intro` confirma, y se dice en el propio cuadro |
| 11 | ¿Por qué hay dos sitios donde escribir en esta lámina? | Porque la disposición tiene dos regiones. Se nombran y se ordenan por tabulador |
| 12 | El aviso dice que me paso por 124 px, ¿qué quito? | El aviso señala la región que desborda y ofrece «partir en dos láminas» |
| 13 | ¿Esto es lo que va a ver la gente, o hay cromo de edición encima? | Interruptor de vista limpia (`Ctrl+.`) que apaga las regiones sin salir de Design |
| 14 | ¿Puedo mover esa caja un poco a la izquierda? | No, y hay que decirlo: la retícula es el contrato visual. La respuesta es cambiar de disposición |

### Escribir (15–24)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 15 | ¿Cómo pongo esto en negrita? | Barra de formato contextual sobre la selección, y `Ctrl+B` |
| 16 | ¿Cómo hago una lista de tres viñetas? | Misma barra, y `- ` sigue funcionando para quien lo prefiera |
| 17 | ¿Cómo meto una cifra grande, de esas que se ven en las presentaciones buenas? | Menú de inserción: «Cifra ancla». Escribe el bloque `metric` por ti |
| 18 | Quiero cuatro métricas con su variación arriba, ¿eso cómo se hace? | «Tira de métricas»: formulario de 2 a 5 métricas, no YAML |
| 19 | ¿Y una tabla con barras dentro de las celdas? | «Tabla clasificada»: elige columnas, cuál es la barra y cuál el semáforo |
| 20 | Necesito poner una fórmula. | Ya funciona (`$$…$$`); el menú de inserción lo descubre |
| 21 | ¿Puedo poner una conclusión destacada? | El `>` de markdown ya lo hace; la barra le pone un botón |
| 22 | Quiero decir «ojo, esto no dice nada de ingresos». | Bloque de advertencia, ya existe; entra en el menú de inserción |
| 23 | ¿Cuánto texto cabe aquí? | Medidor de ocupación de la región, antes de pasarse, no después |
| 24 | Esto lo escribí en el portapapeles con formato, ¿se pega bien? | Pegar HTML enriquecido se convierte a markdown |

### Figuras e imágenes (25–31)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 25 | ¿Cómo meto un gráfico? | Pulsar el hueco de figura abre el selector **encima**, no en un panel lateral que hay que descubrir |
| 26 | ¿Cuál de mis `.amoxvis` era este? | El selector enseña miniatura viva, no el nombre del archivo |
| 27 | Este gráfico no es el que quería, ¿lo cambio sin borrarlo? | «Sustituir figura» sobre la propia figura |
| 28 | ¿Puedo retocar el gráfico sin salir de aquí? | «Abrir en Story Flow» desde la figura, y al volver la lámina lo refleja |
| 29 | ¿Por qué esta figura sale sin su tarjeta y en Story Flow la tiene? | Se dice en el inspector: la lámina ya es la tarjeta. Con interruptor para recuperarla |
| 30 | Quiero una captura de pantalla aquí. | Pegar una imagen del portapapeles la guarda en el proyecto y la coloca en la región activa |
| 31 | ¿Los números de la figura son de hoy? | El pie ya lo dice; el inspector lo repite en grande cuando pasa de siete días |

### La marca del deck (32–38)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 32 | ¿Dónde cambio el color de toda la presentación? | Panel **Deck**: acento y paleta de figuras, con vista previa en vivo |
| 33 | Esto va a ir proyectado en una sala a oscuras, ¿puedo ponerlo todo oscuro? | Tono del deck (claro · oscuro · seguir el tema), y por lámina |
| 34 | ¿Dónde pongo mi nombre y la fecha del corte? | Panel Deck: título, autor, periodo, fecha, fuente. Son del deck, no de una lámina |
| 35 | ¿Puedo quitar el pie de página? | Sí, y elegir qué campos lleva, con casillas. Hoy es una lista en YAML |
| 36 | El pie dice «Generated by AmoxSQL AI · 9/8/2026», y eso no es una nota analítica. | Se separa la firma de la salvedad; la firma no viaja al pie de la lámina |
| 37 | ¿Puedo poner el logotipo de mi empresa? | Marca del deck: imagen en la portada y opcionalmente en el pie |
| 38 | Este hilo de sección, ¿se cambia en cada lámina? | Se hereda del deck; la lámina puede sobreescribirlo, y el inspector dice cuál manda |

### Estructura (39–43)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 39 | Quiero duplicar esta lámina y cambiarle dos cosas. | Duplicar, en el esquema y con `Ctrl+D` |
| 40 | ¿Puedo arrastrar para reordenar? | Sí. Hoy sólo hay flechas |
| 41 | ¿Puedo agrupar láminas por sección? | El separador ya marca el corte; el esquema lo usa para plegar bloques |
| 42 | Esta lámina la quiero fuera pero no borrarla. | Ocultar del pase sin borrar del archivo |
| 43 | ¿Cuántas láminas llevo y cuánto va a durar? | Contador de láminas y estimación de duración en el esquema |

### Editar en crudo (44–46)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 44 | Quiero tocar el markdown de **esta** lámina, no del archivo entero. | Crudo por lámina, al lado del lienzo. La vista Source del archivo completo se queda para quien la quiera |
| 45 | ¿Qué es todo esto de `<!-- layout: finding -->`? | Las directivas no se teclean: las escribe el inspector. En el crudo salen atenuadas y explicadas |
| 46 | Si rompo el markdown, ¿me lo dice? | Sí, en el momento, señalando la línea, sin dejar de renderizar lo que sí se entiende |

### Revisar, presentar, exportar (47–50)

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 47 | ¿Cómo veo todo seguido antes de mandarlo? | Review, que ya está bien |
| 48 | ¿Está todo listo? ¿Me falta algo? | Repaso previo: láminas que desbordan, figuras sin datos, huecos vacíos, consultas viejas |
| 49 | ¿Cómo lo enseño en la reunión? | Present, que ya está |
| 50 | Lo tengo que mandar por correo. | Export a PowerPoint y a Word, que ya están, y un PDF desde el pase |

## 4. Lo que sale de las 50

Agrupadas, las cincuenta caen en **cinco huecos**, y sólo cinco:

1. **El lienzo no declara sus regiones** (7–14). Es la raíz: sin esto, todo lo demás es
   adivinar.
2. **No hay mandos para escribir** (15–24). La barra contextual y el menú de inserción,
   que el editor de documentos **ya tiene escritos** en `markdownInsertables.js` y
   `slashMenu.js`.
3. **No hay inspector** (25–38). El panel lateral de hoy es un catálogo de objetos
   —láminas, disposiciones, gráficos, imágenes— cuando lo que falta es una columna que
   refleje **lo que está seleccionado**.
4. **El crudo es del archivo, no de la lámina** (44–46).
5. **Faltan gestos de estructura** (39–43, 6): duplicar, arrastrar, deshacer.

## 5. La idea que lo ordena todo

Hoy el panel lateral contesta *«¿qué objetos hay?»*. Tiene que contestar
*«¿qué he seleccionado y qué puedo hacerle?»*.

```
selección          →  el inspector muestra
─────────────────────────────────────────────────────
nada / la lámina   →  disposición, tono, pie, notas
una región de texto→  formato, insertar, ocupación
la figura          →  fuente, tarjeta, paleta, frescura
el deck            →  marca, acento, autor, periodo
```

Con eso, las preguntas 25 a 38 dejan de ser preguntas: la respuesta está donde el usuario
está mirando. Y las tres vistas de hoy (Design · Review · Source) siguen valiendo tal cual,
porque el problema nunca fue el reparto de vistas — fue que la de edición no tenía con qué
editar.

---

## 6. Lo que NO se toca

- **La lámina renderizada.** El contrato visual está implementado y validado; ninguna de
  las cincuenta preguntas pide cambiarlo.
- **Review y Present.** Funcionan.
- **El markdown como almacenamiento.** Sigue siendo la única verdad; todo lo que añade el
  inspector se serializa al `.amoxdeck` como hoy.
- **16:9 fijo** y la retícula. La pregunta 14 se contesta explicándola, no cediendo.
