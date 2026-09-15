# Plan — abrir, tocar y manejar archivos

Este documento es **el plan y la bitácora a la vez**. Cada punto se marca `[x]` cuando está
hecho, `[~]` cuando está hecho con desviación —y entonces la desviación se escribe aquí
mismo— y `[ ]` mientras esté pendiente.

Sale de `auditoria_interaccion_archivos.md`, cien preguntas desde la silla de los tres
perfiles. **No implementa las cien.** Implementa las que sostienen una frase, y deja fuera
lo que sólo sumaría botones.

## La frase

> **Si está en el árbol, se abre. Y la aplicación no miente sobre lo que es.**

Todo lo que sigue se mide contra eso. Un archivo que la aplicación se niega a abrir rompe
la primera mitad; un YAML coloreado como SQL, con un botón de ejecutar encima, rompe la
segunda — y la segunda es peor, porque el usuario no descubre el error hasta que actúa.

---

## Los tres hallazgos que ordenan el plan

### 1. La premisa está escrita en una línea

`EditorPane.jsx:807`:

```js
language={activeTab.type === 'md' ? 'markdown' : 'sql'}
```

Ahí está todo el problema. No hay una cuarta categoría de archivo: hay «de los míos»,
«datos» y **SQL por descarte**. El JSON que no se abría, el YAML coloreado al azar y el
Ctrl+Enter que intenta ejecutar un `.py` **son la misma línea**, vista desde tres sitios.

La consecuencia buena: **no hay que reescribir el editor, hay que dejar de mentirle.**

### 2. El editor de código ya trae todos los idiomas — y viene de internet

Medido, no supuesto: el paquete construido contiene
`cdn.jsdelivr.net/npm/monaco-editor@0.55.1`. No hay `loader.config()` en ninguna parte y
`monaco-editor` no es dependencia directa del cliente, así que el editor **se descarga en
tiempo de ejecución**.

Eso tiene dos caras, y las dos importan aquí:

- **A favor:** la compilación del CDN trae *todos* los idiomas. Colorear JSON, YAML, Python,
  INI o XML **no cuesta ni un byte de nuestro paquete ni una dependencia nueva.** La fase 1
  es mucho más barata de lo que parecía.
- **En contra, y es un hallazgo aparte:** una aplicación de escritorio para análisis
  **local** necesita internet la primera vez que abre un editor. En un portátil corporativo
  cerrado, en un avión o en un entorno aislado —los tres perfectamente normales para un
  ingeniero de datos— el editor no carga. Esto **no lo destapó la auditoría de archivos**;
  apareció al medir para esta. Va como fase 5 porque toca lo mismo, pero es una discusión
  propia y se puede sacar de aquí sin romper nada.

### 3. La defensa contra pisar trabajo ajeno ya existe, en un rincón

La parte VI de la auditoría es la única que sale **cero de diez**: nada vigila el disco. Si
un `git pull` cambia un archivo abierto, se pisa al guardar y sin aviso.

Y sin embargo **ese problema ya se resolvió una vez**, esta misma semana: `diagramMerge.js`
ancla por posición **más** texto original, y si no coincide pregunta con tres salidas
—cancelar, guardar aparte, sobrescribir— en lugar de escribir. Lo que falta no es inventar
el diseño: es **subirlo de un editor a la aplicación entera.**

---

## El orden, y por qué

1. **Que el archivo se abra y se vea como lo que es** (fases 0 y 1). Es lo que se reportó y
   lo que más se usa.
2. **Que no se pierda trabajo** (fase 2). Es lo más grave de lo encontrado, pero va después
   porque necesita infraestructura nueva y las dos primeras no.
3. **Que se encuentre lo que ya existe** (fase 3). Barato, y hace visible media aplicación.
4. **Los gestos de volver atrás** (fase 4). Comodidad real, ningún riesgo.
5. **El editor sin internet** (fase 5). Independiente; puede salir de este plan.

---

## Fase 0 — El tipo «texto»

Sin esto ninguna de las demás tiene dónde apoyarse. Es una categoría nueva de pestaña, no
una pantalla nueva.

- [x] Un módulo `tiposDeArchivo.js` con **una sola tabla**: extensión → `{ tipo, idioma,
      ejecutable }`, más los archivos que se reconocen por el nombre entero (`Dockerfile`,
      `Makefile`, `.env`). **Un archivo se clasifica una vez.**
- [~] Tipo `texto` en `LayoutManager.openFile`, sustituyendo el `: 'sql'` final. Ver la
      desviación, que es la parte que importa de esta fase.
- [x] `EditorPane` monta el editor llano para `texto`: sin barra de ejecutar, sin panel de
      resultados, sin autocompletado de esquema. **Que no haya botón de ejecutar es parte
      del arreglo, no un recorte** — la pregunta 6 de la auditoría es precisamente que lo
      había.
- [x] Ctrl+Enter en un archivo no ejecutable **lo dice** en vez de no hacer nada.
- [x] Pruebas de la tabla desde Node (`scripts/probarTiposDeArchivo.mjs`): 72
      comprobaciones.

**Criterio cumplido, verificado con la aplicación delante:** un `.txt` se abre, se ve como
texto llano, se edita, se guarda en el disco y no ofrece ejecutarse. Comprobados además
`.yml`, `.py`, `Dockerfile` (por nombre, sin extensión), un binario, y que un `.sql` sigue
abriendo con su barra y ejecutando.

### La desviación: no eran tres sitios, eran cinco

El plan decía que la clasificación vivía en tres sitios. **Son cinco**, y los dos que
faltaban son los que mandaban:

4. `App.jsx:914` — `handleFileOpen`, con su propia cadena, y **pasaba el tipo explícito**,
   así que ganaba a la de `LayoutManager`. Con el cambio hecho sólo en `LayoutManager`, un
   `.yml` **seguía abriéndose como SQL**: el arreglo no llegaba a ejecutarse nunca.
5. `LayoutManager:1500` — la rama de arrastrar y soltar, con una lista más.

Y dos sitios que no clasificaban pero rompían el guardado, los dos en `handleSaveAs`:

- La rama final era `filename += '.sql'`, así que guardar un archivo de texto como
  `apuntes` daba `apuntes.sql` — y como `.yml` tampoco estaba en la lista de conocidas,
  `profiles.yml` se habría guardado como `profiles.yml.sql`.
- La descripción se inyecta como comentario `/* … */`, que es sintaxis de SQL. En un YAML o
  en un Python **lo rompe**. Ahora se salta para los archivos de texto.

Ninguno de los cinco se descubrió leyendo: **el primero salió de abrir el `.yml` en la
aplicación y verlo coloreado como SQL, con el arreglo ya escrito y en verde.** El build y el
linter pasaban; la tabla estaba bien; el módulo estaba importado. Lo único que fallaba era
la suposición de haberlos encontrado todos.

### Dos cosas que se añadieron sobre el plan

- **Los binarios se clasifican también**, y el editor llano los rechaza con una pantalla que
  lo dice. No estaba en la fase 0, pero dejarlos fuera habría significado que la tabla
  miente sobre un PNG justo mientras se escribe el módulo que existe para no mentir. Y un
  PNG volcado en un editor de texto no se ve como un archivo ilegible: se ve como un fallo
  del programa.
- **La restauración de pestañas** (`LayoutManager:265`) también caía en `'sql'` cuando la
  entrada guardada no traía tipo.

### Una trampa del entorno, para la próxima

Las pestañas **se restauran de `sessionStorage` con el tipo que tenían al guardarlas**. Tras
el arreglo, `profiles.yml` seguía abriéndose como SQL hasta que se cerró la pestaña y se
volvió a abrir el archivo: lo que se estaba mirando era una pestaña de antes, no el camino
nuevo. Costó un diagnóstico entero. **Al verificar un cambio de tipo, cerrar la pestaña
primero.**

---

## Fase 1 — Que se vea como lo que es

- [x] **Idioma por extensión** en lugar de `md ? 'markdown' : 'sql'`. Coste medido: cero,
      por el hallazgo 2.
- [x] JSON, YAML, Python, XML, INI/TOML, shell, R, JavaScript/TypeScript, `Dockerfile`,
      `Makefile` y texto llano.
- [x] **«Abrir como texto» en el menú contextual**, la primera entrada y para todos menos
      los binarios — a un PNG no se le ofrece, porque no serviría.
- [x] **Recordar la elección por archivo**, y por proyecto.
- [x] Icono propio en el árbol para lo que la tabla reconoce como texto.
- [x] Borrador sin título de tipo texto, desde la paleta de comandos.
- [x] Aviso antes de abrir un archivo grande, con el peso a la vista.

**Criterio cumplido, verificado con la aplicación delante:** el `config.json` del caso
original se abre con clic derecho → «Abrir como texto», sale coloreado como JSON, y **al
recargar la aplicación entera un clic normal lo vuelve a abrir así**. En la misma carpeta,
`eventos.json` sigue abriéndose como datos. Los dos a la vez es exactamente lo que ningún
ajuste global podía dar.

### La decisión que sostiene la fase: quién gana

La preferencia del archivo se consulta **antes que cualquier regla por extensión**. Si
alguien marcó su `config.json` como texto, no hay tabla que deba discutírselo.

Y la simétrica, que importa igual: **«Direct Query», «Quick Preview» e «Import to
Database» borran la preferencia.** Consultar un archivo es una elección tan explícita como
abrirlo como texto, y tiene que pesar lo mismo. Sin eso, un usuario que cambia de idea se
queda peleando con una decisión que tomó una vez y no sabe dónde deshacer. Comprobado:
tras «Direct Query», el almacén queda vacío.

La preferencia también **viaja al renombrar**. Se guarda contra la ruta, así que sin eso
renombrar un archivo marcado como texto lo devolvería a abrirse como tabla sin que nadie lo
pidiera — y eso se vive como que la aplicación decide sola.

### Por qué por proyecto y no sólo por ruta

Las rutas del explorador son **relativas a la raíz del proyecto**, así que `config.json`
existe en todos. Sin separar por proyecto, marcar uno como texto habría cambiado el
comportamiento en los demás. Son 28 comprobaciones en
`scripts/probarPreferenciaApertura.mjs`, y la que más vale es precisamente ésa.

### El umbral del aviso no es el del buscador

El buscador del proyecto se salta lo que pase de 2 MB; aquí se pregunta a partir de 5 MB.
No es incoherencia: **el buscador lee todos los archivos y el coste se multiplica**,
mientras que aquí se lee uno y el usuario lo ha pedido a propósito. Lo que se evita no es
un gasto, es que la ventana se quede pensando varios segundos sin que nadie avisara. Y se
pregunta, no se impide: un registro de 9,5 MB se abre entero si se dice que sí —comprobado,
160.001 líneas.

### Dos trampas del entorno, las dos caras

- **Un comentario JSX dentro de un `&& (…)`** añade un segundo hijo donde sólo cabe uno. El
  editor no dijo nada; lo cazó el build. Barato.
- **Cara: Vite dejó la página con el módulo roto de ese error.** Al arreglarlo, la recarga
  en caliente ya no pudo aplicar el módulo nuevo —`[vite] Failed to reload /src/App.jsx`— y
  la página siguió ejecutando el código viejo. Pasé un rato diagnosticando un clic que «no
  hacía nada» **sobre código que ya no existía**. Es la segunda vez en este plan que lo que
  se está mirando no es lo que se está editando; la primera fueron las pestañas
  restauradas. **Ante un comportamiento que no cuadra con el código, comprobar primero que
  la página está ejecutando ese código.**

---

## Fase 2 — Que no se pierda trabajo

- [x] **Un vigilante de archivos en el servidor** (`server/vigilanteArchivos.js`) sobre la
      raíz del proyecto, ignorando `.git`, `node_modules`, las carpetas de compilación y los
      archivos de trabajo de la base.
- [x] Se publica por el canal que **ya existía**: `GET /api/files/watch`, un flujo de
      eventos como los cuatro que ya tenía el servidor. Sin dependencia nueva y sin sondeo.
- [x] **Cambió fuera y aquí no está tocado: se recarga solo.**
- [x] **Cambió fuera y aquí está sucio: se pregunta**, con tres salidas.
- [x] **Comprobación al guardar**, además del aviso.
- [x] El árbol se refresca solo cuando aparece o desaparece un archivo.
- [x] Aviso si un archivo abierto se borra por fuera: la pestaña **no se cierra**.
- [~] Conservar los finales de línea al guardar.
- [x] Pruebas desde Node de la decisión: 32 comprobaciones en
      `scripts/probarConflictoArchivo.mjs`.

**Criterio cumplido, verificado con la aplicación delante.** Los cinco escenarios, uno a
uno: archivo limpio cambiado por fuera → se recargó solo, sin diálogo; archivo sucio
cambiado por fuera → **el trabajo sobrevivió intacto** y al guardar salió el diálogo; las
tres salidas hacen lo que dicen (cancelar no escribió nada y dejó la pestaña sucia,
sobrescribir puso mi versión en el disco, descartar trajo la de fuera); borrar el archivo
abierto dejó la pestaña con su contenido y marcada; y el árbol se enteró solo de un archivo
nuevo y de uno borrado.

### La firma, que es lo que hace esto tolerable

Cada aviso lleva una **firma del contenido**, no la fecha. Dos razones, y sin ellas la
característica sería peor que no tenerla:

1. **Nuestra propia escritura dispara el vigilante.** Sin firma, cada guardado produciría
   acto seguido un «este archivo cambió por fuera» sobre el cambio que acabas de hacer tú.
   Comprobado explícitamente: tras sobrescribir no aparece ningún aviso fantasma.
2. **Tocar un archivo no es cambiarlo.** Cambiar de rama y volver mueve la fecha sin mover
   un byte. Preguntar ahí es ruido, y **el ruido enseña a ignorar los avisos** — con lo cual
   el único aviso que evita perder trabajo dejaría de leerse.

### Aviso *y* comprobación al guardar: no es redundancia

El vigilante puede perderse un cambio —un montaje de red, un sistema sin vigilancia
recursiva, un cambio llegado mientras la ventana no tenía el foco—, y guardar es el
**último momento** en el que todavía se puede evitar el daño. El aviso es la comodidad;
la comprobación en el servidor es la garantía. Por eso van las dos.

### La tercera salida cambió respecto al plan

El plan pedía *cancelar / conservar lo mío / **ver las diferencias***. Son
*cancelar / guardar aparte / sobrescribir / descartar lo mío*, y «guardar aparte» va la
primera **por ser la única sin pérdida**.

Un visor de diferencias es otra herramienta entera, y lo que hace falta en ese instante no
es *entender* el conflicto: es **no perder nada**. Guardar aparte da eso ya, deja las dos
versiones en el disco y permite compararlas con lo que se quiera. Es además el mismo juego
de salidas que usa AmoxDiagram al devolver un diagrama a su markdown, y que sea el mismo
importa: son el mismo problema.

### Los finales de línea ya se conservaban

Marcado `[~]` porque **no hizo falta código**: el editor detecta el final de línea del
archivo y lo mantiene. Se comprobó en vez de suponerlo — un archivo con CRLF, editado y
guardado, salió con CRLF en las cuatro líneas, incluida la nueva.

---

## Fase 3 — Que se encuentre lo que ya existe

- [x] **La lista de atajos, completa**: de 12 a 38.
- [x] **Ctrl+P como alias de Ctrl+K.**
- [x] **«Copiar ruta»** — **ya existía.** Ver abajo.
- [x] **La fecha de modificación, visible** en la fila del archivo, en relativo.
- [x] Los atajos que trae el editor de serie —ir a la línea, cursores múltiples, plegar—
      nombrados en la lista.

### La auditoría se equivocaba, y el error es la lección

La pregunta 50 decía que no había «copiar ruta». **Sí la hay**, y además dos variantes,
junto a «Reveal in Explorer». Están **por debajo de «Delete»**, que es una frontera visual
fuerte: lo que hay detrás de una opción roja se lee como zona peligrosa y no se explora.

O sea que la respuesta correcta a la pregunta 50 no era «no existe» sino **«existe y no se
encuentra»**, que es exactamente lo que dice esta fase. La auditoría acertó el diagnóstico
fallando la pregunta.

---

## Fase 4 — Los gestos de volver atrás

- [x] **Reabrir la última pestaña cerrada** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>).
      Se **relee del disco**, no se resucita una copia en memoria.
- [x] **Fijar una pestaña** (<kbd>Alt</kbd>+<kbd>P</kbd> o el menú). Una fijada no se cierra
      ni con Ctrl+W ni con «cerrar las demás», lleva chincheta y **pierde la X**.
- [x] **Atrás y adelante entre pestañas visitadas** (<kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd>).
- [x] **Archivos recientes**, los cinco últimos, **arriba del todo** en la paleta.
- [x] **Ctrl+Tab por uso reciente** y no por posición.

**Verificado en la aplicación:** cerrar y reabrir devolvió la pestaña; fijar hizo que Ctrl+W
la rechazara con su aviso; desde `carga.py`, Ctrl+Tab fue a `enorme.log` —la visitada
antes— y no a `logo.png`, que es la vecina en la barra; Alt+← recorrió hacia atrás dos
saltos y Alt+→ volvió.

### «Fijar» funcionaba y no se veía

La primera vez, fijar **hizo lo correcto** —Ctrl+W lo rechazó con su mensaje— y la pestaña
siguió sin chincheta y con su X. La barra de pestañas se pinta en `App.jsx` a partir de una
**proyección** de cinco campos (`metaOf`, `LayoutManager.jsx:219`), y `fijada` no estaba en
la lista: existía en el estado y no llegaba nunca a la barra.

Es el mismo patrón que la fase 0 —un sitio de más que nadie recuerda al añadir un campo—
y el mismo síntoma: **el comportamiento correcto sin nada que lo anuncie.** Peor que no
funcionar, porque quien lo pruebe concluye que está roto.

### Lo que se desvió del plan

El plan decía «atrás y adelante entre **posiciones**». Es entre **pestañas**: volver al
punto exacto dentro del archivo exige seguir el cursor y guardarlo por salto, y el gesto que
de verdad falta es el otro —vas a mirar una cosa desde la paleta y no hay forma de volver—.
Anotado por si se pide.

### La trampa del día, tres veces

Los escapes en los documentos de aquí adentro. Una expresión regular con `\\` se quedó en
`\`, un `\n\n` se convirtió en saltos de línea de verdad dentro del servidor, y un
`'Ctrl + \\'` acabó siendo `'Ctrl + \'` — una cadena sin cerrar.

Las tres se arreglaron, pero la tercera merece contarse: **la miré con un script y creí que
estaba bien.** El `repr` de Python enseña `\\` para una sola barra, lo leí como dos, y di
por buena una línea rota. Sobrevivió a la compilación —el archivo se carga aparte— y la
cazó el linter varios pasos después. **Para cualquier cosa con escapes, las herramientas de
edición; y cuando se comprueba, comprobar con quien vaya a ejecutarlo.**

---

## Fase 5 — El editor sin internet

Independiente de las cuatro anteriores. **Se puede sacar de este plan y tratarla aparte**,
y quizá deba: no salió de la auditoría, salió de medir para ella.

- [ ] Servir el editor desde el paquete en vez del CDN (`loader.config({ paths: { vs } })`
      apuntando a una copia local). Pesa, y hay que medir cuánto.
- [ ] Medir el arranque en frío antes y después. Hoy la primera carga depende de la red del
      usuario, lo cual es a la vez malo —no funciona sin ella— y engañoso: en una conexión
      buena parece más rápido de lo que sería empaquetado.
- [ ] Decidir con el número delante. **Esta fase se abre con una medición, no con una
      implementación.**

---

## Lo que este plan deja fuera, y por qué

- **Ejecutar Python, o cualquier cosa que no sea SQL.** Leer y editar no es ejecutar. Aquí
  están enredados y el plan los separa; ejecutar es un producto distinto.
- **Terminal integrada** (pregunta 99). Es un producto dentro del producto y merece su
  propia discusión, no un renglón.
- **Comparar dos archivos cualesquiera** (pregunta 72). Hay comparación de resultados, de
  esquemas y el diff de git contra lo confirmado. Lo que falta cubre un caso menos frecuente
  que todo lo de las fases 0 a 2.
- **Reemplazar en todos los archivos** (pregunta 78). Es el que más pesa de los que se
  quedan fuera —renombrar una columna en veinte consultas se hace a mano—, pero escribir en
  N archivos a la vez sin haber terminado la fase 2 es exactamente la forma de perder
  trabajo. **Después de la fase 2, no antes.**
- **Árbol desplegable** en vez de navegación carpeta a carpeta (pregunta 52). Es un rediseño
  del explorador, no un arreglo.
- **Segunda carpeta de proyecto** (pregunta 54). Toca la noción de proyecto, que sostiene la
  conexión a la base de datos, los ajustes y el contexto de la IA.
- **Codificación de archivo** (pregunta 97). Real, pero por debajo del corte; se anota.

## Deuda que queda anotada

- `defaultDataFileAction` se queda como está en la fase 1 (la memoria por archivo manda
  sobre él). Si la memoria por archivo funciona bien, **ese ajuste global sobra** y habría
  que retirarlo en vez de mantener dos mecanismos para lo mismo.
- El servidor acepta rutas absolutas en `/api/file` para lecturas de texto, mientras que el
  modo binario sí está confinado a la raíz del proyecto. No lo toca ninguna fase de este
  plan, pero **conviene mirarlo aparte**: o se confina igual, o se abre a propósito y con un
  «Abrir archivo…» que lo justifique.
- El menú contextual del explorador mezcla español e inglés («Reveal in Explorer» junto a
  entradas en español). No es de este plan, pero se ve al tocarlo.
