# Auditoría de usabilidad — abrir, tocar y manejar archivos

Cien preguntas desde la silla de quien usa la aplicación todos los días, sobre **la
interacción con archivos y con la interfaz**: no qué hace AmoxSQL con los datos, sino qué
espera poder hacer con las cosas que hay a su alrededor.

## De dónde sale

De un caso real, y conviene no suavizarlo: **había que abrir un `.json` de configuración
que ya estaba en el proyecto, y no se pudo.** La aplicación insistía en tratarlo como un
conjunto de datos —previsualizarlo o consultarlo— y no había manera de decirle «esto es un
archivo de texto, ábremelo y ya».

No es un fallo aislado. Es el síntoma de una premisa que está escrita en el código:
**todo archivo que no sea de los nuestros, o es SQL o es un dataset.** Y esa premisa
choca con la costumbre de los tres perfiles que usan esto, que vienen de pasar el día en
un editor de código de propósito general donde **cualquier archivo se abre, sin más**.

## Quién la usa, y qué trae puesto

- **El ingeniero de datos** tiene el proyecto abierto en dos sitios a la vez: aquí y en su
  editor de código. Cambia de uno a otro cada pocos minutos. Sus archivos no son sólo
  `.sql`: hay `profiles.yml`, `dbt_project.yml`, `.env`, `docker-compose.yml`, JSON de
  configuración, scripts de Python que orquestan. **Cada vez que uno de esos no se abre
  aquí, se va al otro editor — y muchas veces ya no vuelve.**
- **El científico de datos** vive entre notebooks y archivos sueltos: un `.json` con
  hiperparámetros, un `.txt` con notas, un `.py` con las funciones de preparación. Tolera
  que no se ejecuten aquí; **no tolera no poder leerlos.**
- **El analista** es el que menos archivos raros tiene, y por eso el que más se desconcierta
  cuando uno no se abre: no tiene el modelo mental de «esta herramienta es sólo para SQL».
  Para él, si está en el árbol, se abre.

Los tres comparten una expectativa que no depende del perfil sino de la década en la que
aprendieron a trabajar: **el archivo manda.** Doble clic abre. Ctrl+S guarda. Ctrl+Z
deshace. Si algo cambia por fuera, el editor avisa. Romper cualquiera de esas cuatro se
siente como un error del programa, no como una decisión de diseño.

---

## Parte I — Abrir un archivo (20)

Aquí está la herida. Diecisiete de veinte respuestas son «no» o «a medias».

**1. Tengo un `.json` de configuración en el proyecto. Doble clic. ¿Qué pasa?**
**No se puede abrir como texto.** `FileExplorer.jsx:186` mete `json` en el mismo grupo que
`csv` y `parquet`, así que según el ajuste `defaultDataFileAction` sale una previsualización
de datos o una consulta directa. Un JSON de configuración no es una tabla, y el usuario se
queda sin salida. **Este es el caso que originó la auditoría.**

**2. Vale, ¿y si el JSON sí es de datos?**
Entonces el comportamiento actual es el bueno. **El problema no es lo que hace, es que no
hay forma de decirle que esta vez no.** La distinción no la puede hacer la extensión: la
tiene que hacer el usuario, en el momento.

**3. ¿Hay «Abrir como texto» en el menú contextual?**
**No.** El menú del archivo (`FileExplorer.jsx:948` en adelante) ofrece importar,
previsualizar, consultar, exportar para la IA — todo variantes de «trátalo como datos».
Falta la más simple.

**4. Tengo un `.yml`. ¿Se abre?**
**Sí, pero mal.** Cae en el «todo lo demás» de `FileExplorer.jsx:193` y se abre en el
editor. El problema es dónde aterriza: ver la 5.

**5. Se abrió mi `.yml`. ¿Qué editor me lo enseña?**
**El de SQL.** `EditorPane.jsx:389-397` reconoce ocho tipos propios y **todo lo que no esté
en esa lista es SQL**. `EditorPane.jsx:807` lo remata: `language={activeTab.type === 'md' ?
'markdown' : 'sql'}`. Así que un YAML se colorea con la gramática de SQL, y lo que sale es
un texto salpicado de palabras resaltadas al azar.

**6. ¿Y si pulso Ctrl+Enter en ese archivo?**
**Intenta ejecutarlo como consulta.** Esto es literalmente lo que reportó el usuario:
«siempre me mandaba la query». No hay nada en la interfaz que distinga un archivo
ejecutable de uno que no lo es.

**7. ¿Puedo abrir un `.py`?**
Se abre, con el mismo problema del 5. Y aquí duele más, porque Python es el segundo idioma
de los tres perfiles.

**8. ¿Un `.txt`, un `.log`, un `.env`?**
Igual: se abren, coloreados como SQL. Un `.log` de un proceso fallido es de las cosas que
más se abren en un día malo.

**9. ¿Puedo abrir un archivo que no esté en la carpeta del proyecto?**
**No desde la interfaz.** El explorador sólo enumera el árbol del proyecto y no hay un
«Abrir archivo…» en ningún sitio. El servidor sí acepta rutas absolutas en `/api/file`, o
sea que **la puerta existe y lo que falta es el picaporte**.

**10. Arrastro un archivo desde el escritorio a la ventana. ¿Lo coge?**
**Depende de dónde lo sueltes, y ninguna de las dos respuestas es buena.** Sobre el
**editor** sí: hay zona de soltar (`EditorPane.jsx:477`) y funciona — pero acaba en
`handleQueryFile` (`LayoutManager.jsx:1785`), o sea **«consúltalo como datos»**, que es el
mismo error de la pregunta 1 por otra puerta. Sobre el **árbol de archivos** no:
`FileExplorer.jsx:505` sólo lee el formato que pone la propia aplicación al arrastrar
dentro, y los archivos del sistema se ignoran sin decir nada — ni siquiera un «aquí no».

**11. ¿Puedo crear un archivo nuevo que no sea de los tipos conocidos?**
**No.** El explorador ofrece cinco botones —SQL, notebook, markdown, deck, diagrama— y
ninguno es «archivo en blanco con el nombre que yo diga».

**12. ¿Hay un borrador sin nombre para pegar algo y mirarlo un momento?**
**Sí**: `spawnTab` (`LayoutManager.jsx:872`) crea pestañas con `path: ''` y nombre
`Untitled.x`, que sólo eligen sitio al guardar. **Lo que no hay es un borrador que no sea
de un tipo nuestro** — las siete variantes son `.sql`, `.sqlnb`, `.sqlchain`, `.md`,
`.amoxdeck`, `.amoxdiagram` y `.amoxvis`. El mecanismo está entero; le falta una entrada
más.

**13. Abro un archivo enorme. ¿Me avisa antes?**
No hay aviso. El buscador del proyecto sí mide y avisa (`SearchPanel.jsx`), lo cual enseña
que **el criterio ya está pensado en un sitio de la aplicación** y falta aplicarlo al abrir.

**14. ¿Se abre una imagen? ¿Un PDF?**
**No.** Van al editor de texto y se ven como bytes. Hay un lector binario en el servidor
(`/api/file` con `binary=1`), así que la mitad del camino está hecha.

**15. ¿Puedo ver un `.parquet` sin ejecutarlo?**
Hay previsualización (`FilePreviewModal`), y para datos es la respuesta correcta. Lo que
falta es lo contrario: ver **el archivo**, no los datos.

**16. El archivo tiene extensión rara o no tiene ninguna. ¿Qué pasa?**
Se abre como SQL, que es la suposición por omisión. Para un `Dockerfile` o un `Makefile`
—ninguno de los dos tiene extensión— es la peor opción posible.

**17. ¿Recuerda cómo abrí este archivo la última vez?**
**No.** No hay memoria por archivo. Si eliges «consultar» para un CSV concreto, mañana
vuelve a preguntar —o peor, vuelve a hacer lo de siempre sin preguntar.

**18. ¿Puedo cambiar qué hace el doble clic?**
A medias: existe `defaultDataFileAction` en los ajustes, pero es **global** y sólo cubre
`csv|parquet|json`. Un ajuste global no resuelve un problema que es por archivo.

**19. ¿Dos archivos del mismo nombre en carpetas distintas se distinguen en la pestaña?**
La pestaña lleva el nombre. Con `data/ventas.sql` y `staging/ventas.sql` abiertos, hay dos
pestañas idénticas. **No se distinguen.**

**20. ¿Y si el archivo ya no existe cuando lo abro?**
Sale el error del servidor. No se limpia el estado ni se ofrece nada; la pestaña queda
apuntando a un fantasma.

---

## Parte II — La pestaña y el espacio de trabajo (20)

Esta parte está **mucho mejor** que la anterior: doce de veinte están resueltas, y algunas
con más cuidado del que tiene el editor del que venimos.

**21. ¿Puedo reordenar las pestañas arrastrando?**
**Sí.** `TabBar.jsx:99`.

**22. ¿Puedo arrastrar una pestaña al otro panel?**
**Sí**, arrastrando y también desde el menú contextual (`App.jsx:1680`).

**23. ¿Hay pantalla partida?**
**Sí**, Ctrl+\ (`App.jsx:534`), con geometría que se recuerda entre sesiones.

**24. ¿Veo que un archivo tiene cambios sin guardar?**
**Sí**, el punto de la pestaña (`TabBar.jsx:118`).

**25. ¿Cerrar las demás / las de la derecha / todas?**
**Las tres están** (`App.jsx:1690-1702`).

**26. ¿Puedo fijar una pestaña para que no se me cierre?**
**No hay fijar.** Con quince pestañas abiertas, la de la consulta buena se cierra por
accidente igual que las demás.

**27. Cierro una pestaña sin querer. ¿La recupero?**
**No.** No existe «reabrir la última cerrada», que es de los gestos más automáticos que
hay. Y como no hay fijar (26), **las dos ausencias se multiplican**.

**28. ¿Hay pestañas de previsualización, las que se reemplazan si sólo las miras?**
**No.** Cada archivo que tocas se queda. Explorar diez archivos deja diez pestañas.

**29. ¿Se guardan las pestañas al cerrar la aplicación?**
**Sí**, en `sessionStorage` (`amoxsql-open-tabs`).

**30. ¿Ctrl+W cierra la pestaña?**
**Sí** (`App.jsx:498`).

**31. ¿Ctrl+Tab pasa a la siguiente?**
**Sí**, y Ctrl+Shift+Tab a la anterior. **En orden de posición, no de uso reciente** — en el
editor de propósito general es por uso reciente, y eso cambia el gesto: aquí Ctrl+Tab no
sirve para «vuelve a lo que estaba haciendo».

**32. ¿Puedo saltar a la pestaña 3 con Ctrl+3?**
**No.**

**33. ¿Hay lista desplegable de pestañas abiertas cuando no caben?**
No la encontré. Con muchas pestañas, las últimas se buscan a ojo.

**34. ¿Puedo renombrar el archivo desde la pestaña?**
`TabBar` recibe `onTabRename`, así que **sí** por esa vía.

**35. ¿Abrir el mismo archivo dos veces, para ver el principio y el final?**
**Sí**: «Abrir una copia al lado» en el menú contextual (`App.jsx:1682`). Está resuelto, y
es de las cosas que cuesta encontrar hasta en editores maduros.

**36. ¿Se ve la ruta completa en algún sitio?**
En el título de la pestaña al pasar el ratón. No hay migas de pan sobre el editor.

**37. ¿Puedo cerrar todo y quedarme en limpio?**
Sí, «Cerrar todas».

**38. ¿Ctrl+B esconde la barra lateral?**
**Sí** (`App.jsx:443`).

**39. ¿Hay modo sin distracciones, sólo el editor?**
No como tal, pero Ctrl+B más ocultar resultados se le acerca.

**40. ¿La disposición se recuerda por proyecto o es global?**
Global. Dos proyectos con formas de trabajo distintas comparten disposición.

---

## Parte III — El árbol de archivos (20)

La segunda parte fuerte. El explorador hace bastante más de lo que aparenta.

**41. ¿Renombrar en el sitio?**
**Sí.**

**42. ¿Cortar, copiar y pegar archivos?**
**Sí**, con Ctrl+X/C/V y estado de «cortado» a la vista (`FileExplorer.jsx:633-680`).

**43. ¿Arrastrar un archivo a otra carpeta?**
**Sí** (`FileExplorer.jsx:500`).

**44. ¿Seleccionar varios?**
**Sí.**

**45. ¿Borrar con confirmación?**
Sí, hay diálogo dedicado.

**46. ¿Carpeta nueva?**
Sí.

**47. ¿Filtrar por nombre?**
**Sí**, y además ordenar por varios criterios (`FileExplorer.jsx:293-321`).

**48. ¿Veo el estado de git en el árbol?**
**Sí**, insignias por archivo. Esto es más de lo que se espera de una herramienta de datos.

**49. ¿«Mostrar en el explorador del sistema»?**
**Sí**, en el menú contextual (`FileExplorer.jsx:1125`). Es de las que nadie sabe que
están.

**50. ¿«Copiar ruta»?**
**Sí, y dos variantes:** «Copy Relative Path» y «Copy Name», al final del menú contextual
junto a «Reveal in Explorer». Las tres están **por debajo de «Delete»**, que es una frontera
visual fuerte: lo que hay detrás de una opción roja se lee como zona peligrosa y no se
explora. Ejemplo de libro de lo que dice la pregunta 90 — **funciones que existen y no se
encuentran.**

**51. ¿Veo carpetas y archivos ocultos, los que empiezan por punto?**
`.amoxsql/` y `agent/` tienen icono propio, así que se ven. **No hay interruptor** para
mostrar u ocultar.

**52. ¿El árbol se despliega en sitio o navego carpeta a carpeta?**
**Navego.** Hay migas de pan y botón de subir, pero no es un árbol desplegable: no se ven
dos ramas a la vez. Para comparar `staging/` con `marts/` hay que ir y volver.

**53. ¿Se refresca solo si aparece un archivo nuevo por fuera?**
**No.** Hay botón de refrescar manual. Si un proceso escribe un archivo, no aparece hasta
que lo pidas. *(Arreglado en la fase 2: el árbol se entera solo.)*

**54. ¿Puedo tener dos carpetas de proyecto a la vez?**
**No.** Un proyecto, una raíz.

**55. ¿Hay proyectos recientes?**
**Sí**, en la pantalla de bienvenida.

**56. ¿Hay archivos recientes?**
**No.** Y es más útil que los proyectos recientes en el día a día.

**57. ¿Puedo marcar un archivo como favorito?**
No. Hay marcadores de consultas, que es otra cosa.

**58. ¿Veo el tamaño y la fecha de un archivo?**
**El tamaño sí** (`FileExplorer.jsx:876`, con ajuste para apagarlo). **La fecha no**: se
puede ordenar por ella pero no se muestra, y «cuál toqué ayer» es la pregunta más frecuente
de las dos.

**59. ¿Menú contextual sobre varios archivos a la vez?**
Hay acciones en grupo —crear un notebook desde varios—, así que parcialmente.

**60. ¿Duplicar un archivo?**
Con copiar y pegar, sí.

---

## Parte IV — El editor por dentro (15)

**61. ¿Ctrl+S guarda?**
**Sí.**

**62. ¿Guardar como?**
**Sí**, Ctrl+Shift+S.

**63. ¿Guardar todo?**
**No lo encontré.** Con ocho pestañas sucias hay que ir una por una.

**64. ¿Autoguardado?**
**Sí**, por intervalo, **apagado por omisión** (`App.jsx:276`).

**65. ¿Deshacer funciona por archivo?**
Sí, es el del editor, que mantiene su propio historial.

**66. ¿Buscar y reemplazar dentro del archivo?**
**Sí**, Ctrl+F y Ctrl+H.

**67. ¿Ir a la línea N?**
El editor lo trae de serie; **no está documentado en ningún sitio de la aplicación**.

**68. ¿Cursores múltiples?**
Los trae el editor. Mismo problema: nadie lo dice.

**69. ¿Plegar bloques?**
Igual que los dos anteriores.

**70. ¿Formatear el archivo?**
Para SQL sí, con opciones. **Para cualquier otra cosa, no** — consecuencia directa de que
todo lo no-SQL sea SQL.

**71. ¿Minimapa y ajuste de línea?**
**Sí**, ambos conmutables desde la paleta.

**72. ¿Comparar dos archivos?**
**No.** Hay comparación de resultados y de esquemas, y el panel de git enseña el diff
contra lo último confirmado — pero **dos archivos cualesquiera, no**.

**73. ¿Puedo ver el archivo en columnas, el mismo archivo dos veces?**
Sí, vía «abrir una copia al lado» más pantalla partida.

**74. ¿El editor respeta la sangría del archivo?**
Se configura globalmente. Sin `.editorconfig` ni nada por archivo.

**75. ¿Hay resaltado de errores al escribir?**
Para SQL hay validación. Para el resto, nada que resaltar.

---

## Parte V — Buscar, navegar y volver (15)

**76. ¿Buscar texto en todos los archivos del proyecto?**
**Sí**, y bien hecho: fuente por omisión, datos opcionales con el peso a la vista, binarios
nunca, y **lo omitido se dice en voz alta** (`SearchPanel.jsx`). Es la pieza mejor pensada
de toda esta auditoría.

**77. ¿Buscar con expresiones regulares?**
**No hay opciones de búsqueda** — ni regex, ni distinguir mayúsculas, ni palabra completa.

**78. ¿Reemplazar en todos los archivos?**
**No.** Renombrar una columna en veinte consultas se hace a mano.

**79. ¿Filtrar la búsqueda por carpeta o por extensión?**
No hay filtros de ámbito más allá del interruptor de datos.

**80. ¿Saltar a un archivo escribiendo su nombre?**
**Sí**, Ctrl+K con búsqueda difusa sobre nombre y ruta (`CommandPalette.jsx:74`).

**81. ¿Con el atajo que tengo en los dedos?**
En el editor de propósito general ese gesto es Ctrl+P. **Aquí Ctrl+P no hace nada.** Un
alias cuesta una línea.

**82. ¿La paleta busca también tablas y columnas?**
**Sí.** Es una ventaja real sobre un editor genérico: un sitio para archivos y esquema.

**83. ¿Ir a la definición de una CTE o una vista?**
No. Para un `.sql` de doscientas líneas con seis CTE, saltar a la definición es lo que más
se usaría.

**84. ¿Hay esquema o índice del archivo abierto?**
**No hay panel de estructura**, ni siquiera para SQL, donde las sentencias y las CTE dan
una estructura evidente.

**85. ¿Atrás y adelante entre posiciones?**
**No.** Después de saltar a otro archivo desde la paleta, no hay «vuelve a donde estaba».

**86. ¿Marcadores dentro de un archivo?**
No.

**87. ¿La búsqueda del proyecto me lleva a la línea?**
Los resultados traen línea y columna, así que el dato está para hacerlo.

**88. ¿Historial de lo que he abierto en esta sesión?**
No.

**89. ¿Ctrl+Shift+E enfoca el explorador?**
**Sí**, y Ctrl+Shift+D el esquema, Ctrl+Shift+F la búsqueda.

**90. ¿La lista de atajos está completa?**
**No.** `KeyboardShortcutsModal.jsx` documenta doce; en `App.jsx` hay **más de veinte**.
Faltan Ctrl+W, Ctrl+B, Ctrl+\, Ctrl+K, Ctrl+L y las de zoom. **Media aplicación de atajos
es invisible**, y arreglarlo es escribir una tabla.

---

## Parte VI — El archivo vive fuera de la aplicación (10)

Esta parte es corta y es la más grave después de la primera: **diez de diez son «no».**

**91. Hago `git pull` por fuera y cambian tres archivos que tengo abiertos. ¿Me entero?**
**No.** No hay ningún vigilante de archivos en todo el proyecto — ni en el servidor, ni en
el proceso principal. La pestaña sigue enseñando lo de antes.

**92. ¿Y si guardo encima?**
**Piso el cambio, sin aviso.** Es exactamente el escenario contra el que AmoxDiagram sí se
protege al devolver un diagrama a su markdown. **La protección existe en un rincón de la
aplicación y no en el general.**

**93. Un proceso reescribe el `.csv` que tengo previsualizado. ¿Se actualiza?**
No. Hay que cerrar y volver a abrir.

**94. ¿Hay «recargar desde el disco»?**
**No**, ni manual.

**95. ¿Me avisa si un archivo abierto se borra por fuera?**
No.

**96. ¿Detecta el fin de línea del archivo y lo respeta al guardar?**
No hay nada que lo indique. En un repositorio compartido entre sistemas operativos, cambiar
los finales de línea convierte un commit de una línea en uno de doscientas.

**97. ¿Y la codificación?**
No se muestra ni se elige. Un CSV en Latin-1 se abre mal y no hay dónde decirlo.

**98. ¿Respeta el `.gitignore` al buscar?**
No lo comprobé; el buscador filtra por tamaño y por tipo, no por ignorados.

**99. ¿Puedo abrir la carpeta del proyecto en la terminal desde aquí?**
No hay terminal integrada ni acción que la abra.

**100. Si edito el mismo archivo aquí y en mi otro editor, ¿quién gana?**
**El último que guarda, en silencio.** Y como el usuario tiene los dos abiertos a la vez
—es el caso normal, no el raro—, esto va a pasar.

---

## Lo que dicen las cien juntas

Las preguntas se agrupan solas en cuatro heridas, por orden de lo que duele:

### 1. El archivo que no es de nadie no se puede abrir (preguntas 1-20)

La aplicación clasifica cada archivo en «de los míos», «datos» o «SQL», y **no existe la
cuarta opción: texto**. De ahí salen el JSON que no se abre, el YAML coloreado como SQL, el
Ctrl+Enter que intenta ejecutar un `.py` y el archivo sin extensión que se supone consulta.

Lo que lo arregla es pequeño y está casi todo escrito: **«Abrir como texto» en el menú**, un
editor de texto llano al que caiga lo desconocido en vez del de SQL, y **el idioma del
editor por extensión** en lugar de `md ? 'markdown' : 'sql'`. Ejecutar sólo debería
ofrecerse donde tiene sentido.

### 2. Nadie vigila el disco (preguntas 91-100)

Cero de diez. Y el usuario **tiene el proyecto abierto en dos sitios a la vez**, así que no
es un caso de borde: es martes. La pieza que falta es un vigilante de archivos y un aviso
de «esto cambió por fuera» con las tres salidas de siempre —recargar, conservar lo mío,
comparar—, que es el mismo patrón que ya se implementó para devolver un diagrama a su
markdown. **Existe el diseño; falta generalizarlo.**

### 3. Lo que hay no se ve (90, 67-69, 49, 50, 56)

Media docena de funciones **ya construidas** que nadie encuentra: los atajos no
documentados, «mostrar en el explorador», ir a la línea, los cursores múltiples. Es el
mismo fallo que tenía agrupar en AmoxDiagram —existía, funcionaba, no se descubría— y sale
igual de barato.

### 4. Faltan los gestos de volver atrás (27, 26, 85, 78)

Reabrir la pestaña cerrada, fijar una pestaña, volver a la posición anterior, reemplazar en
varios archivos. Ninguno es imprescindible por separado; juntos son la diferencia entre una
herramienta en la que te instalas y una a la que entras a hacer una cosa.

---

## Lo que NO propone esta auditoría

- **Convertir AmoxSQL en un editor de código de propósito general.** No hace falta depurador,
  ni extensiones, ni soporte de treinta lenguajes. Hace falta **abrir un archivo de texto y
  no mentir sobre lo que es**.
- **Ejecutar Python ni nada que no sea SQL.** Leer y editar no es ejecutar, y son cosas
  distintas que aquí están enredadas.
- **Terminal integrada** (99). Es un producto dentro del producto y merece su propia
  discusión, no un renglón en esta lista.
