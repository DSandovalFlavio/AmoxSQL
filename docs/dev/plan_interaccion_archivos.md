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

- [ ] **Idioma por extensión** en lugar de `md ? 'markdown' : 'sql'`. La tabla de la fase 0
      ya lo dice. Coste medido: cero, por el hallazgo 2.
- [ ] Al menos JSON, YAML, Python, XML, INI/TOML, shell y texto llano. Son los que aparecen
      en los proyectos de estos tres perfiles.
- [ ] **«Abrir como texto» en el menú contextual del archivo**, para todos. Es la salida que
      faltaba en el caso que originó todo esto: un `.json` de configuración no es un
      dataset, y sólo el usuario sabe cuál de las dos cosas tiene delante.
- [ ] **Recordar la elección por archivo.** Si abriste `config.json` como texto, mañana se
      abre como texto. Un ajuste global (`defaultDataFileAction`) no puede resolver algo que
      varía archivo por archivo — pregunta 18.
- [ ] Icono propio para los archivos de texto y configuración en el árbol, como ya lo tienen
      los nuestros.
- [ ] Borrador sin título **de tipo texto**. El mecanismo entero ya existe
      (`LayoutManager.jsx:872`, siete variantes con `path: ''`); esto es una entrada más,
      no una función nueva.
- [ ] Aviso antes de abrir un archivo muy grande, con el peso a la vista. El criterio ya
      está escrito y calibrado en `SearchPanel.jsx`; se reutiliza, no se reinventa.

**Criterio de terminado:** el `.json` de configuración del caso original se abre con clic
derecho → «Abrir como texto», sale coloreado como JSON, y la próxima vez se abre así solo.

---

## Fase 2 — Que no se pierda trabajo

La fase que de verdad importa, y la única con infraestructura nueva.

- [ ] **Un vigilante de archivos en el servidor** sobre la raíz del proyecto, con la lista
      de ignorados de siempre (`.git`, `node_modules`, y lo que diga `.gitignore`).
- [ ] Se publica por el canal que **ya existe**: hay cuatro endpoints de
      `text/event-stream` en `server/index.js` y un consumidor en
      `chains/useChainExecution.js`. **No hace falta un transporte nuevo**, ni una
      dependencia, ni sondeo.
- [ ] **Si el archivo cambió fuera y aquí no está tocado: se recarga solo.** Preguntar por
      algo que no tiene conflicto es ruido, y el ruido enseña a ignorar los avisos.
- [ ] **Si cambió fuera y aquí está sucio: se pregunta**, con las tres salidas de
      `diagramMerge` —conservar lo mío, traer lo de fuera, ver las diferencias—. Nunca se
      escribe encima en silencio.
- [ ] **Comprobación al guardar**, además del aviso. El vigilante puede perderse un cambio
      —un montaje de red, un archivo que llega mientras la aplicación no tiene el foco—, y
      guardar es el último momento en que se puede evitar el daño. El aviso es la comodidad;
      **esta comprobación es la garantía**, y por eso van las dos.
- [ ] El árbol se refresca solo cuando aparece o desaparece un archivo (pregunta 53). Sale
      gratis del mismo vigilante.
- [ ] Aviso si un archivo abierto se borra por fuera: la pestaña lo dice y ofrece guardar su
      contenido en otro sitio, en vez de quedarse apuntando a un fantasma.
- [ ] **Conservar los finales de línea del archivo** al guardar (pregunta 96). En un
      repositorio compartido entre sistemas, cambiarlos convierte un commit de una línea en
      uno de doscientas, y quien lo sufre es el que revisa.
- [ ] Pruebas desde Node de la decisión —**no del vigilante**—: dados «cambió fuera» y
      «sucio aquí», qué salida corresponde. La tabla de verdad es lo que no puede fallar; el
      vigilante se comprueba con la aplicación delante.

**Criterio de terminado:** con un archivo abierto y sin tocar, un cambio por fuera se
refleja solo. Con el mismo archivo tocado aquí, sale el diálogo y **no se pierde un solo
byte, elija lo que elija.**

---

## Fase 3 — Que se encuentre lo que ya existe

Media docena de cosas construidas que nadie usa porque nadie sabe que están. Es el mismo
fallo que tenía agrupar en AmoxDiagram, y sale igual de barato.

- [ ] **La lista de atajos, completa.** `KeyboardShortcutsModal.jsx` documenta doce; en
      `App.jsx` hay más de veinte. Faltan Ctrl+W, Ctrl+B, Ctrl+\, Ctrl+K, Ctrl+L y las de
      zoom. Es escribir una tabla.
- [ ] **Ctrl+P como alias de Ctrl+K.** El gesto de «saltar a un archivo» ya funciona y está
      bien hecho (busca archivos *y* esquema); lo que no responde es la tecla que estos
      perfiles tienen en los dedos. Una línea.
- [ ] **«Copiar ruta»** en el menú del archivo (pregunta 50). Se pide varias veces al día
      para pegarla en un `read_csv`.
- [ ] **La fecha de modificación, visible** en la fila del archivo. Ya se puede ordenar por
      ella, o sea que el dato está ahí; sólo no se enseña. «Cuál toqué ayer» es la pregunta
      más frecuente sobre un árbol de archivos.
- [ ] Los atajos que trae el editor de serie —ir a la línea, cursores múltiples, plegar— se
      **nombran** en la lista. No hay que construirlos: hay que decir que existen.

**Criterio de terminado:** la lista de atajos coincide con lo que responde la aplicación.
Nada más, y nada menos.

---

## Fase 4 — Los gestos de volver atrás

- [ ] **Reabrir la última pestaña cerrada.** De los gestos más automáticos que hay, y hoy
      cerrar es definitivo.
- [ ] **Fijar una pestaña.** Con quince abiertas, la consulta buena se cierra por accidente
      igual que las demás. Junto con el punto anterior **son la misma herida vista dos
      veces**: no hay forma de proteger lo que importa.
- [ ] **Atrás y adelante entre posiciones.** Después de saltar desde la paleta no hay «vuelve
      a donde estaba», y ese salto es justo el que se da para consultar algo un momento.
- [ ] Archivos recientes, no sólo proyectos recientes.
- [ ] Ctrl+Tab **por uso reciente** y no por posición. Hoy funciona, pero no sirve para
      «vuelve a lo que estaba haciendo», que es para lo que se pulsa.

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
