# Auditoría — repensar la notebook de SQL

Setenta preguntas desde la silla de los tres perfiles, y **una pregunta previa que hay que
contestar antes que las setenta**: para qué sirve una notebook de SQL.

## De dónde sale

La notebook es de lo primero que tuvo este proyecto y **no ha recibido una sola revisión
desde la v1**. Funciona. Y aun así la sensación al abrirla es «ah, una notebook… bueno»:
no se siente como un archivo con el que quieras trabajar, sino como uno que está.

El encargo no es pulirla. Es **volver a preguntarse qué es**, incluyendo si debe seguir
llamándose así.

---

## La pregunta previa: ¿qué es una notebook si no hay dataframes?

En un cuaderno de código de otro lenguaje el valor está en una cosa: **el estado se
acumula**. Cargas datos en una celda, los limpias en la siguiente, entrenas en la tercera.
Cada celda deja algo con nombre que la siguiente usa. Sin eso, un cuaderno no es más que un
archivo partido en trozos.

Y ésa es exactamente la objeción: *en SQL eso no pasa, cada consulta es independiente*.

**Es falso en AmoxSQL, y ahí está el hallazgo que ordena toda esta auditoría.**

### El equivalente al dataframe ya existe, ya funciona, y la interfaz no lo cuenta

AmoxSQL mantiene **una conexión viva** al motor, no una por consulta
(`DatabaseManager.js:31`, carriles `main`/`meta`/`ai`). Eso significa que el estado de
sesión se acumula entre celdas. Medido contra la aplicación en marcha, tres llamadas
seguidas como las que haría una notebook:

```sql
-- celda 1
CREATE OR REPLACE TEMP VIEW ventas_limpias AS SELECT …;
-- celda 2
SELECT count(*) FROM ventas_limpias;          -- → 2 filas. Existe.
-- celda 3
CREATE OR REPLACE TEMP VIEW resumen AS
  SELECT cat, count(*) n FROM ventas_limpias GROUP BY cat;   -- → encadena
```

`ventas_limpias` **es** el dataframe. Sobrevive a la celda, tiene nombre, se encadena, y se
puede inspeccionar. Lo que no hay es **una sola línea de interfaz que lo diga**: ni qué
objetos ha creado esta notebook, ni cuáles dependen de cuáles, ni qué pasa con ellos al
cerrar.

O sea que la notebook **ya tiene su característica diferencial y la está escondiendo.**

### Y de ahí sale la segunda: la celda es la unidad equivocada

En un cuaderno de otro lenguaje la celda es la unidad correcta porque *celda = una
ejecución con efecto sobre el estado*. En SQL la unidad que significa algo no es el bloque
de texto: es **el resultado con nombre**. Un paso que produce algo que otro paso puede usar.

Un montón de celdas anónimas en vertical es la traducción literal de una interfaz pensada
para otro problema. Aquí la unidad debería ser **el paso**: tiene nombre, una consulta, un
resultado, y quien depende de él.

---

## Los otros tres hallazgos

### 1. La forma del contenido pelea con la forma de la interfaz

Una consulta es **ancha**. Un resultado es **más ancho todavía**. Y la notebook los mete en
una columna estrecha que se recorre hacia abajo, con cada resultado aplastado en una caja
de 300 px que hay que arrastrar para agrandar.

El editor de `.sql` **ya resolvió esto** y lo resolvió bien: partición vertical u
horizontal, el resultado al lado en pantallas anchas, la proporción recordada, la tabla con
su propio espacio. Nada de eso llegó a la notebook, que sigue con la disposición de la v1.

La observación sobre la interfaz que trae el propio motor —una sola celda, expandida a toda
la pantalla, para experimentar— apunta justo aquí: **el problema no es que las celdas sean
feas, es que verlas todas a la vez no sirve para nada.** Cuando trabajas, trabajas en una.

### 2. Está apretada entre tres vecinos que hacen su trabajo mejor

| Para | Ya existe | Y lo hace mejor porque |
|---|---|---|
| Explorar, tantear | `.sql` | partición, ultraancho, historial, plan, autocompletado |
| Presentar un hallazgo | `.amoxdeck` | láminas, export a Office, contrato visual |
| Escribir y documentar | Documentos markdown | tres columnas, índice, sin cromo |
| Encadenar pasos | `.sqlchain` | el grafo es explícito y se ejecuta |

La notebook intenta las cuatro cosas y no gana ninguna. **Ése es el diagnóstico completo de
«no se siente diferencial»**, y no se arregla puliendo: se arregla eligiendo qué territorio
es suyo y soltando los otros tres.

El territorio que queda libre, y que nadie cubre: **el expediente del análisis.** No el
borrador (eso es `.sql`), no la presentación (eso es el deck), sino **el camino
reproducible de la pregunta a la respuesta** — lo que abres dentro de seis meses cuando
alguien pregunta «¿de dónde salió este número?».

### 3. Ejecutar «todas» es una mentira sobre el estado

Hoy hay *run all*, *run above*, *run below*: los tres suponen que **el orden en la pantalla
es el orden de dependencia**. Con estado de sesión real, eso no hace falta suponerlo — **se
deduce**: si el paso C lee `ventas_limpias`, depende del paso que la crea, esté donde esté.

Un archivo `.sql` se ejecuta de arriba abajo. **Una notebook debería ejecutar lo que está
desactualizado.** Eso sí es una diferencia que justifica que el formato exista.

---

## Parte I — El analista de datos (25)

Es quien más va a usar esto. Su trabajo no es construir tuberías: es **contestar una
pregunta y poder defender la respuesta**.

**1. Abro una notebook en blanco. ¿Qué me dice que esto no es un `.sql` con celdas?**
Hoy, nada: sale una celda de SQL vacía. **Si lo primero que ves es un editor de consultas,
has abierto un `.sql` con pasos extra.** Debería pedir lo único que un `.sql` no tiene: la
pregunta que vas a contestar.

**2. ¿Dónde escribo la pregunta que estoy investigando?**
En una celda de texto, si te acuerdas. Debería ser **un campo del archivo**, no una celda
entre otras: es lo que distingue un expediente de un borrador, y lo que se lee primero
dentro de seis meses.

**3. Tengo doce celdas. ¿Cómo sé por dónde iba?**
Se recorre hacia abajo. No hay índice, ni esquema, ni nada que resuma el documento. El
editor de markdown **sí tiene** índice; la notebook, que lo necesita más, no.

**4. ¿Puedo ver el resultado y la consulta a la vez, cómodamente?**
En una caja de 300 px que se puede arrastrar. En un monitor ancho, **la mitad derecha está
vacía** mientras la tabla se lee por una rendija.

**5. Estoy tanteando una consulta. ¿Puedo concentrarme en ella?**
No. Siempre se ven las de arriba y las de abajo. **No hay modo de trabajo a pantalla
completa sobre un paso** — el que hay es de presentación, que es lo contrario: enseña todo
y esconde el código.

**6. Cambio una celda de en medio. ¿Qué queda mal debajo?**
No se sabe. Nada marca que un resultado se calculó con una versión anterior. **Un resultado
viejo con pinta de nuevo es peor que no tener resultado.**

**7. ¿Puedo reutilizar el resultado de una celda en otra?**
**Sí, y es el secreto mejor guardado de la aplicación**: `CREATE TEMP VIEW` en una celda,
`SELECT` en la siguiente. Nada en la interfaz lo sugiere, así que nadie lo hace.

**8. ¿Qué he creado en esta sesión?**
No hay respuesta. El explorador de base de datos muestra el esquema, pero no *qué es tuyo,
de esta notebook, y desde cuándo*.

**9. Cierro y vuelvo mañana. ¿Sigue ahí lo que construí?**
No: las vistas temporales mueren con la sesión. **Y no se avisa.** Abres la notebook, le
das a un paso de en medio y falla por algo que no hiciste tú.

**10. ¿Puedo poner un filtro de fecha y que todo se recalcule?**
**Sí** — las celdas de *Input* re-ejecutan las celdas que usan la variable
(`SqlNotebook.jsx:520`). Es de lo mejor que tiene y **está escondido detrás de un botón que
dice «Input»**, que no significa nada para un analista.

**11. Entonces, ¿esto puede ser un panel interactivo?**
Casi. Le falta admitirlo: parámetros arriba, resultados debajo, y el código plegado. Hoy es
un editor con controles intercalados.

**12. Quiero un gráfico de esta consulta. ¿Cuántos pasos?**
El resultado tiene su vista de gráfico y se recuerda. **Esto funciona bien**, y es de las
cosas que hay que no romper.

**13. ¿Puedo comparar el resultado de dos pasos lado a lado?**
No. Hay comparación en el editor de `.sql` entre paneles; en la notebook, ni eso.

**14. ¿Puedo quedarme con un número suelto —un total, un porcentaje— y referirme a él en el texto?**
No. Y es **lo que más se hace en un análisis**: «las ventas cayeron un 12 %». Hoy ese 12 %
se copia a mano, y al recalcular se queda mintiendo en el texto.

**15. ¿La notebook me dice de qué tablas depende todo esto?**
No. Para saberlo hay que leer las doce celdas.

**16. Alguien cambió la tabla de origen. ¿Me entero?**
No.

**17. ¿Puedo enseñarle esto a mi jefe sin que vea SQL?**
Sí: modo Report con «ocultar código», y export a HTML y Word. **Es bueno.** Lo raro es que
convive con «convertir en deck», que hace lo mismo mejor.

**18. Entonces, ¿presento desde la notebook o hago un deck?**
Exacto: ésa es la pregunta que no debería existir. **Dos caminos para lo mismo, y ninguno
lo dice.**

**19. Quiero rehacer el análisis del mes que viene. ¿Qué hago?**
Duplicar el archivo y cambiar fechas a mano, salvo que hayas descubierto los *Inputs*.

**20. ¿Puedo dejar anotado por qué descarté un camino?**
En una celda de texto. Pero entonces esa celda de código muerta se queda ahí, y al darle a
«ejecutar todo» **vuelve a ejecutarse**. No hay forma de decir «esto es historia».

**21. ¿Puedo ver cuánto tardó cada paso?**
El tiempo sale por resultado. No hay un total ni nada que diga dónde se va el tiempo.

**22. Me equivoqué y borré una celda. ¿Deshacer?**
El deshacer es del editor de texto, por celda. **Borrar una celda no se deshace.**

**23. ¿Puedo buscar dentro de la notebook?**
Dentro de una celda, sí. **En todo el documento, no** — ni siquiera «en qué celda usé esta
tabla».

**24. ¿Qué pasa si mi consulta devuelve 2 millones de filas?**
Se pagina, y se guardan 500 en el archivo de estado. Razonable; no se dice.

**25. Al final, ¿en qué se diferencia mi notebook de un `.sql` con comentarios?**
Hoy: en las celdas de texto, los *Inputs* y el modo Report. **Ninguna de las tres es lo
bastante visible como para que alguien elija notebook a propósito.**

---

## Parte II — El científico de datos (25)

Viene de cuadernos de otro lenguaje y trae esas expectativas puestas. Es el perfil al que
más le va a chirriar lo que falta — y el que más partido sacaría del estado de sesión si
alguien se lo enseñara.

**26. ¿Puedo guardar un resultado en algo con nombre y reusarlo?**
**Sí** (vistas temporales), y no lo sabe nadie. **Ésta es la pregunta central de toda la
auditoría.**

**27. ¿La interfaz me ofrece hacerlo?**
No. Habría que ofrecerlo donde se produce: al lado de un resultado, «guardar este paso
como…».

**28. ¿Veo mis objetos intermedios en algún sitio?**
No. Debería haber un panel de **lo que has construido**, que es el equivalente honesto al
inspector de variables.

**29. ¿Puedo ver de qué depende cada paso?**
No, y **es deducible**: está escrito en el SQL. Del `FROM` sale el grafo.

**30. Si cambio un paso de arriba, ¿se marcan los de abajo como desactualizados?**
No. Ésta es la que más duele viniendo de donde viene este perfil.

**31. ¿Puedo re-ejecutar sólo lo que hace falta?**
No: o una celda, o todas, o de aquí arriba/abajo. **Con el grafo, «lo que está sucio» es
calculable.**

**32. ¿El orden visual tiene que ser el orden de ejecución?**
Hoy sí, y es una atadura falsa. Con dependencias reales, **el orden de la pantalla es
narrativa y el de ejecución es el grafo.**

**33. ¿Puedo hacer un muestreo rápido de un paso intermedio sin romper nada?**
Escribiendo otra consulta a mano. Debería ser un gesto: «mírame esto».

**34. ¿Perfilado de una columna desde el resultado?**
Existe el perfilador como herramienta aparte, no desde aquí.

**35. ¿Puedo fijar una semilla o dejar constancia de la versión de los datos?**
No hay nada de reproducibilidad: ni fecha de ejecución guardada por paso, ni conteo de
origen.

**36. Se ejecutó hace tres días. ¿Sé cuándo?**
No se guarda por paso. Se guardan los resultados, pero no **cuándo** ni **contra qué**.

**37. ¿Puedo exportar un paso intermedio a un archivo?**
Hay exportación desde la tabla de resultados. Sirve.

**38. ¿Puedo llamar a la IA sobre un paso concreto?**
El asistente vive aparte y no tiene el concepto de «este paso».

**39. ¿Puedo alternar entre SQL y un gráfico sin perder el sitio?**
Sí, la vista se recuerda por celda. **Bien.**

**40. ¿Puedo tener dos gráficos del mismo resultado?**
No. Uno por celda.

**41. ¿Hay una vista de «sólo los gráficos»?**
El modo Report se acerca. No es navegable.

**42. ¿Puedo parametrizar un paso y barrer varios valores?**
No. Con *Inputs* se cambia uno y se recalcula; no hay «para cada valor de esta lista».

**43. ¿Puedo dejar una celda desactivada sin borrarla?**
No. O está y se ejecuta, o no está.

**44. ¿Y marcar una celda como «esto es el resultado»?**
No. En un expediente de análisis, **la conclusión debería poder señalarse**.

**45. ¿Puedo comentar un paso para mi yo futuro sin meterlo en el informe?**
Todo el texto es público. No hay nota de trabajo.

**46. ¿Puedo ver el plan de ejecución de un paso?**
En el `.sql` sí (Ctrl+Shift+A). **En la notebook no.**

**47. ¿Autocompletado del esquema dentro de una celda?**
**Sí**: la celda monta el mismo `SqlEditor` que el archivo `.sql`
(`NotebookCell.jsx:511`), con su autocompletado contra el esquema vivo. Es de lo mejor que
hereda y **es la razón de que cualquier rediseño tenga que seguir montando ese editor**, no
uno propio.

**48. ¿Puedo reordenar arrastrando?**
Sí, con indicador de destino. **Bien hecho.**

**49. ¿Puedo partir una celda en dos, o unir dos?**
No, y es el gesto más frecuente al ordenar un análisis.

**50. ¿Puedo sacar un paso a su propio `.sql`?**
No. Ni al revés: traerse un `.sql` como paso.

---

## Parte III — El ingeniero de datos (20)

**Aquí hay que ser honesto: es el perfil que menos la va a usar**, y eso es una conclusión
de diseño, no una disculpa. Sus herramientas son `.sql`, las chains y el panel de dbt. Las
veinte preguntas sirven para lo contrario de lo habitual — **para decidir qué NO hacer**:
si algo sólo lo pide este perfil, probablemente no va aquí.

**51. ¿Usaría esto para una tubería de producción?**
No. Para eso están las chains, que además se ejecutan como grafo. **Que la notebook no
compita con eso es correcto.**

**52. ¿Y para validar datos tras una carga?**
Sí, y es su caso real: una batería de comprobaciones que se ejecuta y se lee de un vistazo.

**53. Entonces, ¿existe «esto ha pasado / no ha pasado»?**
**No, y me equivoqué al mirarlo la primera vez.** Lo que parece una aserción
—`NotebookCell.jsx:331`, «Expected value…»— es el marcador del campo donde se escribe **el
valor de un parámetro**. No hay nada que compare un resultado contra lo esperado.

Y el equívoco es el hallazgo: si al leer el código pensé que era una aserción, **un usuario
delante de ese campo va a pensar lo mismo.** «Expected value» en una celda llamada «Input»
no significa nada de lo que hace.

**54. ¿Puedo ejecutar la notebook entera y que me diga sí o no?**
No hay un veredicto. Hay que mirar celda por celda.

**55. ¿Se puede ejecutar desde fuera, sin abrir la aplicación?**
No.

**56. ¿Puedo programarla?**
No, y probablemente no deba: eso es otro producto.

**57. ¿Se ve bien en un diff de git?**
**No.** Es JSON con los resultados dentro. Un cambio de una línea de SQL produce un diff
enorme. Los formatos nuevos del proyecto —el deck, el diagrama— aprendieron esto y son
markdown; **la notebook se quedó en el modelo viejo.**

**58. ¿Los resultados se guardan en el archivo?**
En un `.sqlnb.state.json` aparte, hasta 500 filas. **La separación es correcta**; lo que no
se entiende es por qué el archivo principal sigue siendo JSON.

**59. ¿Puedo revisar la notebook de un compañero en un PR?**
Mal, por lo anterior.

**60. ¿Puedo parametrizar por entorno?**
Con *Inputs*, a mano.

**61. ¿Deja rastro de qué creó en la base?**
No.

**62. ¿Y limpia lo que creó?**
No. Las temporales mueren solas; una tabla real, no.

**63. ¿Avisa si un paso escribe en la base?**
No. **Un `CREATE TABLE` y un `SELECT` se ven exactamente igual**, y uno de los dos cambia
el disco.

**64. ¿Puedo ver cuánto costó la ejecución completa?**
No hay total.

**65. ¿Hay control de transacción?**
No expuesto.

**66. ¿Puedo usarla sobre otra base?**
Depende de la sesión, no del archivo.

**67. ¿Documenta contra qué esquema se escribió?**
No.

**68. ¿Sirve como documentación viva de un modelo?**
Podría, y es su mejor caso: consultas de ejemplo junto a su explicación.

**69. ¿Se integra con el panel de dbt?**
No.

**70. Resumiendo: ¿qué quiere este perfil de aquí?**
**Poco, y está bien.** Tres cosas concretas: que el archivo se revise en un PR (57), que se
vea qué toca la base (63), y **comprobaciones con veredicto** (52-54) — que no existen y son
lo único de esta lista que hoy no cubre ninguna otra herramienta. Lo demás ya tiene sitio en
otra parte.

---

## Lo que dicen las setenta juntas

### El diagnóstico

No es que la notebook esté mal hecha. Es que **está resolviendo el problema de otra
herramienta**: copió la forma de un cuaderno de código —celdas anónimas en vertical, orden
igual a dependencia, todo a la vista— cuando el problema de SQL es distinto y **la pieza
que lo haría distinto ya está construida y escondida**.

### Las cinco decisiones que la convertirían en otra cosa

**1. El paso con nombre sustituye a la celda.**
Un paso = nombre + consulta + resultado. El nombre **no es decorativo**: crea la vista, y
con ella el paso siguiente puede usarlo. Es el dataframe, con la interfaz que le falta.

**2. Se trabaja en un paso, no en la lista.**
Uno a la vez, a todo el ancho, con la disposición que ya funciona en el `.sql` —partición,
resultado al lado, ultraancho—. La lista se convierte en **navegación**, no en el espacio
de trabajo. Es la idea de la celda expandida, llevada hasta el final.

**3. Las dependencias se deducen, no se suponen.**
Del `FROM` sale el grafo. Con el grafo: marcar lo desactualizado, re-ejecutar sólo eso, y
**soltar la atadura entre el orden visual y el de ejecución**. Un `.sql` corre de arriba
abajo; esto corre lo que hace falta. Ahí está la diferencia que justifica el formato.

**4. La notebook es el expediente, no el borrador ni la presentación.**
La pregunta pasa a ser un campo del archivo. La conclusión se puede señalar. Un número
puede citarse en el texto y **recalcularse con él**. Y presentar deja de ser cosa suya:
para eso está el deck, y ya hay un botón que lo hace.

**5. El archivo se vuelve legible.**
Markdown con front-matter, como el deck y el diagrama. Los resultados siguen en su archivo
aparte. Así se revisa en un PR y se edita a mano.

### Qué se quita

- **El modo Report y el export a HTML.** Duplican al deck, que lo hace mejor y ya tiene el
  puente. Quitarlo no es perder una función: es **dejar de tener dos caminos para lo mismo**,
  que es lo que hace que ninguno se sienta el bueno.
  **El export a Word se queda**, y la distinción importa: un deck es para *proyectar*, y un
  documento de Word es para *circular* — se comenta, se firma, se adjunta a un correo, se
  mete en una carpeta compartida. El expediente de un análisis acaba muchas veces ahí, y
  eso el deck no lo cubre.
- **«Ejecutar todo / arriba / abajo»** como conceptos centrales. Con el grafo sobra la
  aritmética de posiciones.
- **El JSON como formato principal.**
- **La palabra «Input».** Es un parámetro del análisis; que lo diga.

### Qué se queda intacto

El gráfico por resultado con su vista recordada, la reordenación arrastrando, el estado en
archivo aparte, **y el editor de celda**: es el mismo `SqlEditor` del `.sql`, con su
autocompletado contra el esquema. Cualquier rediseño tiene que seguir montando ése y no uno
propio, o se pierde lo mejor del producto por el camino.

### Sobre el nombre

Si esto acaba siendo pasos con nombre que se encadenan y saben cuándo están sucios,
**«notebook» describe la forma que estamos quitando, no la que queda**. El proyecto ya tiene
una convención —Data Flow, Story Flow, Report Flow— y una palabra suya para el expediente
de un análisis encajaría ahí. No lo decide una auditoría: lo decide quien mira los cuatro
nombres juntos.

---

---

## Cómo se vería: el rediseño desde cero

Lo anterior dice *qué* debería ser. Esto dice **qué se ve al abrirlo**, que es donde se
decide si se siente distinto o no.

### El principio: una lista hace tres trabajos

En un cuaderno clásico hay tres cosas repartidas en tres sitios: el **índice** (por dónde
voy), el **inspector de variables** (qué tengo construido) y el **grafo de dependencias**
(qué depende de qué). En SQL esas tres cosas **son la misma lista**, porque el nombre de un
paso *es* el nombre de la vista que crea.

Ésa es toda la idea. Si el nombre del paso no fuera real, esto sería decoración; como sí lo
es, la columna de la izquierda es a la vez el índice, el inspector y el mapa.

### La pantalla de trabajo

```
┌────────────────┬──────────────────────────────────────────────────────────┐
│ ¿Por qué cayó  │  ventas_limpias                            ● al día      │
│  septiembre?   │  ┌────────────────────────┬───────────────────────────┐  │
│                │  │ SELECT …               │  id  cat   importe        │  │
│ ● origen       │  │   FROM ventas          │   1  a       120,00       │  │
│ ● ventas_limpi │  │  WHERE fecha >= {des…} │   2  b        98,50       │  │
│ ◐ por_categoria│  │                        │                           │  │
│ ○ comparativa  │  │                        │  [tabla] [gráfico]        │  │
│ ! anomalias    │  └────────────────────────┴───────────────────────────┘  │
│                │                                                          │
│ ── parámetros  │  «Quito las devoluciones y los pedidos de prueba.»       │
│ desde  2026-09 │                                                          │
│                │  Lo usan: por_categoria, comparativa                     │
│ ── conclusión  │                                                          │
└────────────────┴──────────────────────────────────────────────────────────┘
```

**Izquierda, estrecha y fija.** Arriba la **pregunta** del análisis — es un campo del
documento, no una celda, y es lo primero que se lee dentro de seis meses. Debajo los pasos,
cada uno con su nombre real y **su estado en un punto**:

| | |
|---|---|
| `●` | al día |
| `◐` | desactualizado — algo de lo que depende cambió |
| `○` | nunca ejecutado |
| `!` | falló |

Esa columna de puntos es la característica entera hecha visible. Y al final, la
**conclusión**, también campo del documento.

**El centro es todo lo demás, y hay un solo paso.** Es la observación de la interfaz del
propio motor llevada hasta el final: cuando trabajas, trabajas en uno. El editor es **el
mismo `SqlEditor` del `.sql`** —con su autocompletado contra el esquema— y el resultado
hereda la disposición que ya funciona ahí: al lado en pantallas anchas, debajo en las
estrechas, con la proporción recordada. En un monitor ultraancho se llena; hoy se
desperdicia media pantalla.

Bajo el paso, dos renglones que no son celdas:

- **La nota** — «qué me dice esto». Una línea, opcional.
- **Quién lo usa** — deducido del `FROM`. Es el grafo sin dibujar un grafo.

### Lo que desaparece de la pantalla

- **El desfile vertical de cajas.** Entero.
- **La barra de ocho botones por celda** (subir, bajar, ejecutar arriba, ejecutar abajo,
  borrar…). Mover es arrastrar en la lista; «arriba/abajo» se va con el grafo.
- **El triplete «+SQL / +Texto / +Input».** Sólo se añaden pasos. El texto es un campo del
  paso; los parámetros viven en su propia zona de la izquierda.
- **La caja de resultados de 300 px con su tirador.**
- **La celda de markdown *intercalada*.** Lo que se va no es el texto: es que la prosa sea
  hermana de la consulta y haya que verlas todas a la vez. **La nota corta cuelga del paso;
  la prosa larga es un paso de texto** con la pantalla entera para ella. Ver más abajo.

### Un botón donde había tres

Desaparecen *ejecutar todo*, *arriba* y *abajo*. Queda **«Actualizar»**, que ejecuta lo que
está desactualizado, en orden de dependencia, y **dice cuánto**: «3 pasos por recalcular».

Es una interacción distinta, no el mismo botón con otro nombre. Un `.sql` corre de arriba
abajo porque no sabe otra cosa. Esto sabe.

### La pantalla de lectura

El mismo documento, sin editor: la pregunta, los pasos en orden con su nombre, su nota y su
resultado —tabla o gráfico—, y la conclusión. El SQL, plegado; se abre si alguien pregunta
de dónde salió.

**No es una presentación.** Presentar es del deck, y el puente ya existe. Esto es lo que
lees tú dentro de seis meses, o lo que exportas a Word para que circule. Que sean dos cosas
distintas es justamente lo que hace que dejen de competir.

### El texto largo tiene su propio paso

Un análisis exhaustivo no es sólo consultas anotadas: tiene **contexto** antes de la primera
consulta, **metodología**, **secciones** que agrupan, **limitaciones**, y lo que se probó y
se descartó. Nada de eso pertenece a un paso concreto, y en una nota de una línea no cabe.

Así que hay **dos clases de paso**, y la unidad no cambia:

- **Paso de consulta** — nombre, SQL, resultado, nota.
- **Paso de texto** — un título y prosa. No tiene consulta ni resultado, así que **no tiene
  estado** (no hay nada que recalcular), y en la lista se ve distinto: sin punto, y haciendo
  de **separador de sección** de lo que viene debajo.

La regla que lo sostiene es la misma que ya se aplicaba: **cada paso monta el editor que ya
existe para su contenido.** Una consulta monta el `SqlEditor`, con su autocompletado contra
el esquema vivo; un texto monta el `MarkdownEditor`, con sus modos editar/dividido/leer, su
índice y su modo concentración. Ninguno de los dos se construye aquí.

**Y no es volver a las celdas.** La diferencia no está en que exista texto: está en cuántas
cosas se ven a la vez. Una celda de markdown tiene el sitio que sobre entre dos consultas y
se ve junto a todas las demás; un paso de texto tiene **la pantalla entera** y se ve solo.
Es mejor sitio para escribir, no peor.

La nota de un paso de consulta **también admite markdown y no tiene tope** — se recorta a dos
líneas en la pantalla de trabajo para que no se coma el resultado, y sale entera en la de
lectura. La frontera entre las dos: si el texto habla de **un resultado**, es la nota de ese
paso; si habla del **análisis**, es un paso de texto.

### El número que no miente

De aquí sale la pieza que hoy no tiene ninguna herramienta del producto: **poder citar un
valor de un paso dentro del texto**, y que se recalcule con él. «Las ventas cayeron un
{comparativa.variacion} %».

Hoy ese número se copia a mano y empieza a mentir en cuanto alguien pulsa ejecutar. En un
expediente cuyo propósito es defender una cifra, es el detalle que más vale.

### Lo que NO cambia

El editor de celda —el mismo `SqlEditor`—, la tabla de resultados con su vista de gráfico
recordada, el estado en archivo aparte, y el export a Word. Cuatro cosas que ya funcionan y
que el rediseño hereda en vez de rehacer.

## Lo que esta auditoría NO propone

- **Ejecutar otro lenguaje dentro.** El día que haga falta, es otro producto.
- **Competir con las chains.** Una tubería de producción es un grafo que se ejecuta sin
  nadie delante. Esto es un análisis que alguien lee.
- **Un cuaderno de propósito general.** Eso es exactamente lo que se está quitando.
- **Migrar a la fuerza.** Los `.sqlnb` que existen tienen que seguir abriéndose, y el lector
  de formato antiguo ya está escrito.
