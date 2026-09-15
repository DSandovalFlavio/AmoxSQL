# Auditoría de usabilidad — el editor de diagramas

Cuarenta preguntas hechas antes de escribir código, desde la silla de quien va a usar la
herramienta. Veinte sobre **dónde están las cosas** y veinte sobre **qué espera poder
hacer**. Cada una lleva la respuesta que da el plan hoy y, cuando el plan no la contesta,
qué habría que cambiar.

## Quién la usa

Tres perfiles, y no quieren lo mismo:

- **El ingeniero de datos** es el usuario principal. Dibuja **arquitecturas**: orígenes,
  zonas de aterrizaje, capas de transformación, almacenes, consumos. Sus cajas son
  sistemas, no pasos. Piensa en capas y las colorea; distingue lo que corre por lotes de lo
  que corre continuo; anota frecuencias y responsables. Su diagrama acaba en un documento
  de diseño que alguien revisa.
- **El científico de datos** dibuja **procesos esperados**: ingesta de rasgos,
  entrenamiento, evaluación, reentrenamiento. Tiene bucles y decisiones, y su diagrama es
  una hipótesis de trabajo más que una foto de lo que existe.
- **El analista** dibuja **de dónde sale el dato y quién lo toca**. Es el que menos tolera
  la sintaxis y el que más agradece una plantilla. Su diagrama explica un proceso a alguien
  que no es técnico.

Los tres comparten una cosa: **el diagrama no es el entregable, es parte de un documento.**
Eso condiciona todo lo demás.

---

## Parte I — Dónde están las cosas (20)

**1. Quiero un diagrama nuevo. ¿Dónde lo creo?**
Donde se crea todo lo demás: el `+` de la barra de pestañas, el botón del explorador de
archivos y la paleta de comandos. Son los tres sitios donde ya viven «nuevo deck» y «nueva
chain». *El plan no lo decía; hay que registrarlo en los tres.*

**2. ¿Cómo distingo un `.amoxdiagram` en el árbol de archivos?**
Icono propio con el acento, y grupo propio en el orden del explorador —
`FileExplorer.jsx:241` y `:278` hacen exactamente eso para `.amoxdeck`. *Faltaba en el
plan.*

**3. Estoy en un markdown con un diagrama. ¿Cómo lo edito sin escribir mermaid?**
Botón en el bloque renderizado, junto al de expandir que ya existe. **Abre una pestaña
nueva**, no un modal. *El plan decía modal a pantalla completa: cambia.*

**4. Se abrió la pestaña. ¿Qué me dice que esto sigue perteneciendo al documento?**
Nada, en el plan actual. **Hueco grave.** La pestaña tiene que decir de dónde viene y
permitir volver: un rótulo de procedencia con el nombre del markdown, que al pulsarlo abre
ese archivo. Sin eso, guardar es un acto a ciegas.

**5. ¿Cómo sé si tengo cambios sin guardar?**
El punto de la pestaña, como cualquier otro archivo. Gratis si el editor usa el mismo
mecanismo de `dirty` que los demás.

**6. Le doy a Guardar. ¿Dónde se guarda?**
La pregunta del millón, y es donde se pierde la confianza. Si el diagrama vino de un
markdown, **guarda en ese markdown**; si es un `.amoxdiagram`, en su archivo. **El botón
tiene que decir cuál de las dos cosas va a hacer**, no poner «Guardar» a secas.

**7. ¿Y si quiero guardarlo aparte sin tocar el documento?**
«Guardar como» → `.amoxdiagram`. El flujo ya existe (`handleRequestSaveAs` en
`App.jsx:1162`) y hay que enseñarle la extensión nueva. *Estaba fuera del plan.*

**8. ¿Dónde añado una caja?**
Tres caminos, y conviene los tres: doble clic en el lienzo vacío, una paleta lateral de la
que se arrastra, y `Tab` desde un nodo seleccionado para encadenar el siguiente. El tercero
es el que usa quien ya sabe lo que quiere dibujar.

**9. ¿Cómo conecto dos cajas?**
Arrastrando desde el borde de una a la otra, que es lo que ya hace Data Flow y lo que
espera cualquiera que haya usado un lienzo de nodos.

**10. ¿Dónde cambio la forma de una caja?**
En un inspector a la derecha cuando hay algo seleccionado, con el mismo criterio que el
Studio del deck: izquierda navega, derecha edita lo seleccionado. *El plan hablaba de
«cambiar la forma desde el lienzo» sin decir dónde.*

**11. ¿Cómo edito el texto de una caja?**
Doble clic sobre ella, edición en el sitio. Nunca un campo en un panel lejano para algo tan
frecuente.

**12. ¿Dónde pongo una etiqueta a una flecha?**
Seleccionando la flecha, en el mismo inspector. Una flecha es seleccionable, no sólo un
adorno entre dos cajas.

**13. ¿Dónde cambio la dirección del diagrama?**
Es propiedad del diagrama entero, así que va en el inspector cuando **no** hay nada
seleccionado — el estado «diagrama», equivalente al estado «lámina» del deck.

**14. ¿Puedo ver el mermaid que estoy generando?**
Sí, y es importante que sí: la mitad del público sabe leerlo y va a querer comprobar qué
se está escribiendo en su archivo. Panel de texto al lado del lienzo, plegable — el mismo
papel que `DeckSlideRaw.jsx` cumple en el deck. *El plan lo trataba como salida de
emergencia; es una vista de primera clase.*

**15. Si edito el texto a mano, ¿se actualiza el dibujo?**
Sí, y si lo que escribo deja de entenderse, el lienzo **se congela con un aviso** en vez de
vaciarse. Vaciarse da la sensación de haber perdido el trabajo.

**16. ¿Cómo agrupo cajas en una capa o una zona?**
Seleccionar varias → «agrupar». Es la operación central del ingeniero de datos y en el plan
estaba en la fase 3, tratada como adorno. **Sube de prioridad.**

**17. ¿Dónde está deshacer?**
`Ctrl+Z`, con la pila sobre el texto mermaid — el mismo razonamiento que
`deck/useHistorial.js`, y por la misma razón: no hay que escribir la inversa de cada acción.

**18. El diagrama tiene cuarenta cajas. ¿Cómo me muevo?**
Zoom, encuadrar todo, minimapa — los tres los da React Flow. Falta **buscar un nodo por su
texto** y que el lienzo salte a él. *No estaba en el plan.*

**19. ¿Cómo lo meto en un documento de diseño que no es este markdown?**
Exportar PNG y SVG. Hay un exportador de PNG ya escrito y usado por Story Flow
(`DataVisualizer/utils/exportChart.js`, sobre `html2canvas-pro`). *No estaba en el plan, y
es de las primeras cosas que alguien va a pedir.*

**20. ¿Qué pasa si abro un diagrama que la herramienta no entiende?**
El botón no aparece, y el bloque se comporta como hoy. Silencio, no error. *Esto el plan lo
tenía bien — pero la definición de «no entiende» estaba mal calibrada; ver la pregunta 26.*

---

## Parte II — Qué espera poder hacer (20)

**21. ¿Puedo empezar de una plantilla de arquitectura?**
Hoy hay cuatro plantillas de texto en el menú de `/` y son genéricas («flujo»,
«secuencia»…). Para este público hacen falta otras: una arquitectura por capas, una ingesta
por lotes contra una continua, un flujo de experimento. *Hueco.*

**22. ¿Puedo marcar con qué tecnología está hecha cada caja?**
Con **texto libre en la etiqueta, sí. Con una paleta de logotipos, no** — y esto no es una
limitación técnica sino una regla del proyecto: no se nombran ni se dibujan tecnologías
ajenas en la interfaz. Conviene dejarlo escrito aquí para que nadie planifique una
biblioteca de iconos de proveedores. Lo que el usuario escriba en su etiqueta es contenido
suyo y ahí no nos metemos.

**23. ¿Puedo distinguir lo que corre por lotes de lo que corre continuo?**
Sí: estilo de flecha, que mermaid expresa (`-->`, `-.->`, `==>`). Estaba en el plan.

**24. ¿Puedo poner una nota que no sea una caja del flujo?**
Hoy no. Mermaid no tiene anotaciones sueltas en `flowchart`; lo más cercano es un nodo sin
aristas. **Se contesta explicándolo**, y se ofrece el nodo suelto — que ya se conserva, como
hace `chainAMermaid`.

**25. ¿Puedo marcar zonas — aterrizaje, refinado, consumo?**
Sí: son subgrafos. Ver la pregunta 16.

**26. ¿Puedo colorear las cajas por capa o por equipo?**
**Aquí está el fallo más grave del plan.** Decía que un diagrama con `classDef`, `class`,
`style` o `linkStyle` **no se abre**. Pero colorear por capa es exactamente lo que hace un
ingeniero de datos con una arquitectura: la regla escrita para proteger al usuario de
perder datos acaba cerrándole la puerta a los diagramas que de verdad escribe.

La corrección no es aceptar y perderlo, que es lo que la regla evitaba. Son **tres niveles**
en vez de dos:

| Nivel | Qué es | Qué hace el editor |
|---|---|---|
| Entiendo | nodos, aristas, formas, subgrafos, dirección | Lo edita |
| **Conservo** | `classDef`, `class`, `style`, `linkStyle`, `click`, `%%{init}%%` | **Lo mantiene intacto y lo vuelve a escribir igual** |
| No abro | otro tipo de diagrama | No ofrece el botón |

Y una vez conservado, editarlo es un paso pequeño: asignar clase a un nodo es una línea.

**27. ¿Puedo sacar el diagrama de una chain de Data Flow?**
Ya se puede: `chainAMermaid()`. Lo que falta es que el resultado se abra **en el editor**
en vez de insertarse como texto.

**28. ¿Puedo sacarlo del esquema de la base de datos?**
Para entidad-relación ya existe `ErDiagram.jsx`, generado desde la base. No se duplica.

**29. ¿Puedo pedirle a la IA que me dibuje un primer borrador?**
Es la petición más natural del mundo y hoy no existe. **Fuera del alcance de este plan**,
pero conviene dejar el formato preparado: si el editor abre cualquier mermaid válido del
subconjunto, una herramienta de IA que emita mermaid encaja después sin tocar nada.

**30. ¿Puedo duplicar una caja o una rama entera?**
Copiar, pegar y duplicar. Quien dibuja tres fuentes parecidas no las escribe tres veces.
*No estaba.*

**31. ¿Puedo ordenar el dibujo cuando queda torcido?**
No hace falta pedirlo: lo ordena mermaid en cada render. Es una ventaja de este diseño y
conviene contarla, porque quien viene de otras herramientas espera pelearse con la
disposición.

**32. ¿Puedo hacer una caja más grande?**
No, y es deliberado: el tamaño lo decide el motor a partir del texto. Ver la pregunta 33.

**33. ¿Puedo colocar las cajas donde yo quiera?**
**No, y es la respuesta que más va a costar.** Mermaid no guarda coordenadas: si dejáramos
fijar posiciones, el usuario colocaría una caja, guardaría, y al reabrir la encontraría en
otro sitio — el editor habría prometido algo que el formato no sostiene. Se puede arrastrar
para **reordenar** y para **cambiar de grupo**; no para fijar coordenadas. Hay que decirlo
en la interfaz la primera vez, no dejar que lo descubra arrastrando.

**34. ¿Puedo tener varios diagramas en un archivo?**
En un `.amoxdiagram`, uno. Varios conviven en un markdown, que es el sitio donde un
diagrama tiene vecinos y texto que lo explica.

**35. ¿Puedo enlazar una caja a un archivo del proyecto?**
Mermaid lo expresa (`click`), y para un ingeniero de datos es potente: la caja
«transformación» abre el `.sql` que la implementa. Con el nivel «conservo» de la pregunta
26 el enlace **sobrevive** aunque el editor todavía no lo cree. Crearlo desde la interfaz es
candidato claro para después.

**36. ¿Puedo saber si el diagrama tiene cabos sueltos?**
Nodos sin conectar, grupos vacíos, etiquetas duplicadas. Es barato y es justo el repaso que
alguien quiere antes de enseñar una arquitectura. *No estaba.*

**37. ¿Puedo buscar dentro del diagrama?**
Ver la pregunta 18.

**38. ¿Esto se ve bien en el control de versiones?**
Sí, y es un argumento fuerte para este formato frente a cualquier binario: el archivo es
texto y el diff se lee. **Con una condición**: que el serializador sea estable — mismo
grafo, mismo texto, siempre — o cada guardado ensuciará el diff con reordenaciones. *No
estaba escrito como requisito y tiene que estarlo.*

**39. ¿Puedo meterlo en una presentación?**
El deck ya renderiza markdown, así que un bloque mermaid ya funciona ahí. Comprobar que la
lámina lo trata bien es trabajo de una tarde, no de una fase.

**40. ¿Puedo reutilizar un diagrama como plantilla?**
«Guardar como» resuelve el 80% (ver la pregunta 7). Una galería propia como la de Data Flow
(`ChainTemplateGallery.jsx`) es más de lo que hace falta para empezar.

---

## Lo que cambia en el plan

Ocho cosas, ordenadas por lo que duelen:

1. **El nivel «conservo».** Un diagrama con `style` o `classDef` tiene que abrirse y volver
   a guardarse intacto. Como estaba, la herramienta se negaba a abrir precisamente los
   diagramas de su público principal. *(P26, P35)*
2. **Editor propio con pestaña y formato `.amoxdiagram`**, no un modal dentro del preview.
   Esto reordena el plan entero: aparece una fase de «el archivo y la pestaña» que antes no
   existía, con diez puntos de registro en la aplicación. *(P1, P2, P3)*
3. **La procedencia.** Una pestaña que edita un bloque que vive en otro archivo es un
   concepto nuevo en esta aplicación: ninguna pestaña de hoy tiene dueño en otro sitio. Hay
   que enseñarlo, y hay que resolver qué pasa si el markdown cambia debajo. *(P4, P6)*
4. **Guardar como.** *(P7)*
5. **Agrupar sube a la fase principal.** Es la operación central de una arquitectura, no un
   detalle de la fase de acabado. *(P16, P25)*
6. **El panel de texto es una vista, no una salida de emergencia.** *(P14, P15)*
7. **Faltan cuatro cosas pequeñas y muy pedidas:** buscar un nodo, duplicar, exportar
   imagen, y un repaso de cabos sueltos. *(P18, P30, P19, P36)*
8. **El serializador estable como requisito explícito**, por el diff. *(P38)*

Y una que no cambia el plan pero conviene tener escrita: **no habrá biblioteca de iconos de
proveedores** *(P22)*, y **no se podrán fijar coordenadas** *(P33)*. Las dos se van a pedir.
