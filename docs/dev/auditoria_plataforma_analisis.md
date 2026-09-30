# Auditoría — de IDE a mesa de trabajo de datos

> Qué esperaría de AmoxSQL quien vive de analizar datos —no quien escribe SQL por
> gusto— cuando trabaja varios proyectos para varios clientes a la vez. Tres perfiles,
> cincuenta preguntas cada uno, y al lado de cada pregunta lo que la aplicación contesta
> **hoy**, comprobado en el código y no supuesto. La restricción no se negocia en ningún
> punto: la aplicación corre en la máquina del usuario y no depende de un servidor.
> Fecha: 2026-09-29. Punto de partida: v5.8.0.

---

## 1. El diagnóstico en una frase

> AmoxSQL sabe muy bien qué hacer **dentro** de un proyecto, y no sabe nada de lo que hay
> **alrededor**: el cliente, la entrega, el lunes que viene y la persona que lo hereda.

Dentro del proyecto la aplicación es fuerte y está madura: editor, cuaderno con grafo de
dependencias, pipelines con puntos de control, gráficos narrativos, presentaciones que se
exportan editables, un asistente con contexto de negocio. Ninguna de las 150 preguntas
pide rehacer nada de eso.

Lo que falta son tres cosas que un profesional de datos da por hechas y que hoy no
existen en ninguna forma:

1. **Un nivel por encima del proyecto.** Los proyectos recientes son una lista plana en
   el `localStorage` de la aplicación (`amoxsql-recent-projects`; corregido el 2026-09-30,
   antes decía `config.json`). No hay cliente, ni estado, ni fechas, ni etiquetas. Quien
   lleva nueve proyectos de cuatro clientes los lleva de cabeza.
2. **Algo que pase sin que esté mirando.** No hay programación, ni línea de comandos, ni
   disparadores, ni avisos. Todo lo que ocurre, ocurre porque alguien pulsó un botón con
   la aplicación abierta.
3. **Una forma de que el trabajo salga entero de la máquina.** Git se lleva el código y
   —correctamente— no la base. Pero no hay receta para reconstruirla, ni paquete para
   quien no usa git, ni lista de qué credenciales hacen falta al otro lado.

Y un cuarto que no es una ausencia sino un riesgo, y que va primero en cualquier plan:

4. **Las credenciales están en texto plano y son globales.** Lo detallo en §2.

## 2. Lo que hay hoy, comprobado

| Pieza | Qué hace | Lo que significa para quien lleva varios clientes |
|---|---|---|
| **`project.json`** | `name`, `folders`, `defaultDb` (relativo), `git`, `wizard` | La base viaja bien porque la ruta es relativa. Pero no hay cliente, estado, entornos, requisitos ni responsable |
| **Recientes** | Lista plana de rutas en el `localStorage` de la aplicación | No se agrupan, no se archivan, no se buscan, y el servidor no los ve |
| **Claves de API** | Texto plano en `~/.amoxsql/config.json` (p. ej. `geminiApiKey`) | Nada las cifra: no se usa el llavero del sistema en ningún sitio |
| **Claves de S3/GCS** | Se fijan con `SET s3_access_key_id=…` **global a la sesión** | Sólo puede haber un juego a la vez: dos clientes con buckets distintos no conviven. El motor ya trae `CREATE SECRET` con `SCOPE` por prefijo, que resuelve justo eso —aquí sólo se usa para Sheets— |
| **Cuenta de servicio de Sheets** | Ruta **absoluta** al archivo de clave | Ese proyecto no funciona en otra máquina sin reconfigurar a mano |
| **IA: conversaciones, memorias, Vault** | Esquema `amoxsql_ai` **dentro de la base del proyecto** | Bien: lo que la IA aprende de un cliente no se filtra a otro. Pero el **proveedor** es global: no se puede imponer IA local sólo para el cliente que lo exige |
| **Contexto de negocio** | `.amoxsql/context/` (`metrics.yml`, `joins.yml`, glosario), `RULES.md`, skills | Es una capa semántica de verdad, pero hoy sólo la lee la IA; el analista no puede consultar una métrica definida ahí |
| **Snippets y marcadores** | `<proyecto>/.amox/snippets.json` | No te acompañan: cada proyecto empieza con la caja de herramientas vacía |
| **Data Flow** | DAG con puntos de control, reanudación, historial de ejecuciones, nodos de aserción y de validación de esquema | La mitad de lo que pide un ingeniero de datos ya está. Falta que corra solo |
| **Git** | Estado, ramas, commits, diff, stash; `.gitignore` con `*.duckdb` | Correcto no versionar la base. Pero quien clona recibe el código **sin receta** para reconstruir los datos |
| **dbt** | Detección, manifest, linaje, ejecución | Existe, con su propio linaje, separado del de Data Flow y del cuaderno |
| **Python** | Sólo se **detecta** (y conda/mamba), para dbt | No se ejecuta en ningún sitio. Para un científico de datos es el hueco más grande |
| **Programación** | — | **No existe** en ninguna forma |
| **Línea de comandos** | — | **No existe**. Es el requisito previo de cualquier programación que no dependa de la ventana abierta |
| **Motor** | DuckDB 1.5 | Ya permite cifrar una base al adjuntarla y restringir el acceso a disco. La aplicación no expone ninguna de las dos cosas |

Dos incoherencias menores que conviene saber antes de diseñar: hay **dos** carpetas
ocultas por proyecto (`.amox/` para snippets y marcadores, `.amoxsql/` para
`project.json` y el contexto), y la instancia es **única**, así que dos proyectos no se
abren a la vez.

## 3. Los tres perfiles

Cada perfil es una persona concreta con una semana concreta, porque las preguntas salen
de lo que le pasa a alguien, no de una lista de funciones.

**Mariana — analista de datos, independiente.** Cuatro clientes, nueve proyectos
activos. Cada lunes manda un reporte de ventas a una cadena de tiendas; cada día 5, el
cierre mensual a una financiera. Los datos le llegan como hojas de cálculo por correo,
con otro nombre cada semana. Entrega presentaciones y hojas de cálculo. Factura por hora.

**Diego — ingeniero de datos, en una consultora pequeña.** Monta las cargas de tres
clientes, cada uno con su bucket y su base. Deja tablas limpias para que los analistas
trabajen encima. En uno de los clientes el modelo está en dbt; en los otros, en Data
Flow. Su miedo es que algo falle de madrugada y nadie se entere hasta la reunión.

**Lucía — científica de datos.** Prepara las variables en SQL porque es donde están los
datos, pero entrena en Python. Tiene que poder decir, seis meses después, con qué datos
exactos entrenó el modelo que entregó. Uno de sus clientes, un hospital, prohíbe que un
solo dato salga a la nube.

Cada fila dice: la pregunta tal como la haría esa persona, qué contesta AmoxSQL **hoy**
(**Sí** · **A medias** · **No**), y qué haría falta. Donde una pregunta repite a otra de
otro perfil, lo digo; la repetición es información —indica un hueco transversal—.

---

## 4. Analista de datos — Mariana (1–50)

### Clientes y proyectos (1–8)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 1 | Tengo cuatro clientes y nueve proyectos, ¿dónde los veo juntos, agrupados por cliente? | **No.** Lista plana de recientes | El **cliente** como nivel por encima del proyecto, y una pantalla de inicio que lo use |
| 2 | ¿Puedo abrir dos proyectos del mismo cliente a la vez para cruzar datos? | **No.** Instancia única, una base | Adjuntar la base de otro proyecto del mismo cliente en sólo lectura, con un gesto |
| 3 | ¿En qué estado está cada proyecto: en curso, en revisión, entregado, cerrado? | **No.** `project.json` no tiene estado | Estado y fechas en `project.json`, visibles en la pantalla de inicio |
| 4 | ¿Puedo buscar «esa consulta de abandono» en todos mis proyectos, no sólo en el abierto? | **No.** La búsqueda es por proyecto | Un índice local entre proyectos, del mismo cliente o de todos |
| 5 | Al abrir un proyecto, ¿qué dejé pendiente la última vez? | **A medias.** Vuelven las pestañas; las tareas de los markdown existen pero no se reúnen | Un «retomar»: pestañas, tareas abiertas, próxima entrega y la última ejecución fallida |
| 6 | ¿Puedo archivar un proyecto terminado sin borrarlo y que deje de estorbar? | **No** | Archivar: sale de la vista, sigue en disco, se puede recuperar |
| 7 | ¿Puedo arrancar un proyecto nuevo copiando la estructura de uno anterior? | **A medias.** El asistente crea carpetas canónicas, no plantillas | Proyecto desde plantilla: carpetas, contexto, consultas base y entregables, **sin datos** |
| 8 | ¿Puedo etiquetar proyectos por sector o tipo de servicio para encontrar parecidos? | **No** | Etiquetas en `project.json` |

### Lo administrativo (9–15)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 9 | ¿Cuántas horas le dediqué a este cliente este mes? | **No** | Registro de tiempo **opcional y local**, derivable de las sesiones con el proyecto abierto. Nunca activado por defecto |
| 10 | ¿Qué le entregué a este cliente y cuándo? | **No.** Los exports caen en `exports/` sin registro | Bitácora de entregas: archivo, versión, fecha, destinatario |
| 11 | ¿Cuándo vence la próxima entrega? | **No** | Fechas de entrega por proyecto, con aviso |
| 12 | ¿Quién es mi contacto y qué pidió exactamente? | **No** | Ficha del proyecto —un markdown con plantilla: contactos, alcance, pedido original— que vive en la carpeta |
| 13 | El cliente cambió el alcance, ¿dónde queda escrito? | **No** | Bitácora de decisiones con fecha, en la misma ficha |
| 14 | ¿Puedo sacar un resumen del proyecto para facturar o para el informe de cierre? | **No** | Resumen generado: horas, entregas, decisiones, consultas clave |
| 15 | ¿Cada cliente puede tener su logo, sus colores y su plantilla de reporte? | **A medias.** La marca existe **por deck** | Marca a nivel de cliente, heredada por todos sus decks y gráficos |

### Los datos que llegan (16–23)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 16 | Me mandan la misma hoja cada semana con otro nombre, ¿la reimporto a mano? | **A medias.** Se importa; Data Flow sabe leer | Fuente vigilada: carpeta de entrada, patrón de nombre, se carga la más reciente |
| 17 | ¿Cómo sé que el archivo de esta semana trae las mismas columnas? | **A medias.** Schema Diff y el nodo de validación existen, a mano | Contrato de la fuente que se comprueba al cargar |
| 18 | ¿De dónde salió esta tabla: qué archivo, qué día? | **No.** Una tabla importada no guarda procedencia | Procedencia escrita al importar (comentario de tabla o tabla de metadatos) |
| 19 | ¿Puedo consultar la base del cliente sin copiarla a mi máquina? | **A medias.** Se puede con `ATTACH` y extensiones, escribiendo SQL | Conexiones con nombre por proyecto, en la interfaz, cada una con su credencial |
| 20 | Tengo datos de dos clientes, ¿puedo mezclarlos por error? | **A medias.** Una base por proyecto separa bien; las credenciales de nube globales, no | Aislamiento explícito por proyecto, y aviso si una consulta lee rutas fuera de él |
| 21 | ¿Puedo leer directamente la hoja de cálculo compartida del cliente? | **Sí,** con Google Sheets. Pero la clave es global y su ruta absoluta | La credencial, por cliente y por nombre (ver 58–60) |
| 22 | ¿Qué hago con archivos que no caben cómodos dentro del proyecto? | **A medias.** El motor lee en sitio; DuckLake existe | Carpeta de datos del cliente **configurable por máquina**, referenciada por nombre y no por ruta |
| 23 | ¿Puedo enmascarar datos personales antes de trabajarlos o compartirlos? | **No** | Marcar columnas como sensibles: se enmascaran en exports y **no se envían a la IA** |

### Lo que se repite (24–31)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 24 | Cada lunes rehago el mismo reporte, ¿puede actualizarse solo? | **No.** No hay programación | Refresco programado de un entregable (cuaderno, figura, deck) |
| 25 | Si el lunes no tengo la aplicación abierta, ¿qué pasa? | **No aplica hoy** | Una decisión de diseño —ver §8—: tarea del sistema, proceso residente, o ponerse al día al abrir |
| 26 | ¿Puedo sacar el reporte de otra semana sin tocar el SQL? | **Sí.** Parámetros `{{nombre}}` compartidos por cuaderno y deck | Ejecutar un entregable con parámetros **desde fuera**: «corre con `semana=38`» |
| 27 | ¿Me avisa si el reporte programado falló? | **No** | Notificación del sistema y bitácora de ejecuciones |
| 28 | ¿Cómo cambió la cifra entre la versión de la semana pasada y ésta? | **A medias.** `CompareResults` compara dos resultados de la sesión | Instantánea del resultado en cada ejecución, y comparar dos cualesquiera |
| 29 | ¿Puedo sacar el mismo reporte para cada una de las doce tiendas? | **No** | Ejecución en lote: un entregable × una lista de valores de parámetro |
| 30 | ¿Puede dejar el PowerPoint en la carpeta del cliente él solo? | **A medias.** Se exporta a mano | Destino de entrega configurado en el entregable |
| 31 | ¿Puedo mandar el reporte por correo desde la aplicación? | **No** | **Fuera de alcance**: exige credenciales de correo. Basta con dejar el paquete listo y abrir la carpeta |

### Confiar en los números (32–37)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 32 | ¿«Ventas» significa lo mismo en todos los reportes de este cliente? | **A medias.** `metrics.yml` y el glosario existen, pero sólo los lee la IA | Que una métrica definida sea **consultable** por el analista —una vista o macro generada—, no sólo contexto para el modelo |
| 33 | ¿Puedo dejar pruebas que avisen si un total no cuadra? | **A medias.** Nodo de aserción en Data Flow; modal de calidad | Aserciones en el propio entregable, que **bloqueen la entrega** si fallan |
| 34 | Si cambio una consulta base, ¿qué reportes se ven afectados? | **A medias.** Grafo dentro de un cuaderno; linaje de dbt | Linaje entre archivos del proyecto: cuaderno → figura → deck |
| 35 | ¿Puedo seguir una cifra de la presentación hasta la consulta que la produjo? | **A medias.** La lámina apunta a su `.amoxvis` | «De dónde sale», navegable desde la lámina |
| 36 | ¿Qué tan frescos son los datos de este gráfico? | **A medias.** El Studio conoce la frescura de su figura | Fecha de los datos visible en todo entregable, también en el exportado |
| 37 | ¿Puedo pedir a un colega que revise antes de entregar? | **No** | Revisión asíncrona: paquete de revisión y comentarios anclados (ver 141) |

### Entregar (38–43)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 38 | El cliente no tiene AmoxSQL, ¿qué le dejo que pueda abrir? | **Sí.** PowerPoint, Word, HTML, hoja de cálculo | Un gesto único de «entregar»: reúne, nombra, versiona y registra |
| 39 | ¿Puedo entregar algo interactivo que abra en el navegador sin instalar nada? | **A medias.** El informe HTML es estático | HTML autocontenido con filtros sobre los datos incrustados |
| 40 | ¿Cómo evito mandar por error datos que no debía? | **No** | Revisión previa al export: columnas sensibles, tamaño, destino |
| 41 | ¿Qué versión del reporte tiene el cliente? | **No** | Numeración de entregas en la bitácora (ver 10) |
| 42 | ¿Puedo entregar los datos limpios además del reporte? | **Sí.** CSV, Parquet, hoja de cálculo | — |
| 43 | Meses después piden «lo mismo, del trimestre pasado», ¿sale igual? | **A medias.** Los archivos siguen ahí; la base pudo cambiar | Entrega reproducible: entregable + parámetros + referencia a los datos de ese día |

### La IA con varios clientes (44–47)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 44 | Un cliente prohíbe que sus datos salgan a la nube, ¿puedo forzar IA local sólo en su proyecto? | **No.** El proveedor es global | **Política de IA por cliente o proyecto**: proveedores permitidos, y si puede ver filas o sólo esquema |
| 45 | ¿La IA recuerda cosas de un cliente cuando trabajo con otro? | **Sí, y bien aislado.** Todo vive en la base de cada proyecto | No se toca |
| 46 | ¿Puedo reutilizar mis reglas y skills de un cliente en otro? | **A medias.** Viven en cada proyecto | Biblioteca personal y por cliente, además de la del proyecto |
| 47 | ¿Qué le mandé exactamente al modelo? | **A medias.** El inspector de Deep Dive muestra las llamadas | Registro auditable, por proyecto, de lo que salió de la máquina |

### La caja de herramientas propia (48–50)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 48 | Mis consultas favoritas, ¿me siguen de un proyecto a otro? | **No.** Viven en `<proyecto>/.amox/` | Tres niveles de biblioteca: personal, cliente, proyecto |
| 49 | ¿Puedo tener mis plantillas de gráfico y de deck? | **A medias.** Temas y galería, no plantillas propias | Plantillas personales y por cliente |
| 50 | Si cambio de computadora, ¿me llevo todo? | **A medias.** Los proyectos son carpetas; la configuración global y las rutas absolutas no viajan | Exportar e importar el perfil, **sin** secretos |

---

## 5. Ingeniero de datos — Diego (51–100)

### Estructura y entornos (51–57)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 51 | ¿Puedo tener desarrollo y producción del mismo proyecto sin duplicar la carpeta? | **No.** Un solo `defaultDb` | **Entornos** con nombre: base, credenciales y variables por entorno |
| 52 | ¿Se ve claramente contra qué entorno estoy ejecutando? | **No** | Indicador permanente en la barra de título, y confirmación antes de escribir en producción |
| 53 | ¿Puedo tener varias bases en un proyecto y moverme entre ellas? | **A medias.** Se detectan, se adjuntan con SQL, DuckLake | Bases con nombre declaradas en `project.json` |
| 54 | ¿Cómo ordeno cargas, transformaciones y salidas para que otro las entienda? | **A medias.** Carpetas canónicas | Convención por capas (crudo · intermedio · publicado), opcional en el asistente |
| 55 | ¿Puedo marcar una tabla como «contrato» para los analistas? | **No** | Tablas publicadas con esquema fijado y aviso cuando un cambio lo rompe |
| 56 | ¿Puedo documentar tablas y columnas donde el analista las vea? | **A medias.** El cuaderno escribe `COMMENT ON` en sus vistas | Editar descripciones desde el explorador, y exportarlas |
| 57 | ¿Puedo convertir un cuaderno exploratorio en una carga reproducible? | **A medias.** Data Flow acepta archivos SQL | «Promover a pipeline» desde el cuaderno, respetando su grafo |

### Credenciales y seguridad (58–65)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 58 | ¿Dónde quedan guardadas mis claves? | **No,** en el sentido que importa: texto plano en la configuración global | **Llavero del sistema** mediante `safeStorage` de Electron; el proyecto sólo guarda el **nombre** de la credencial |
| 59 | Dos clientes, dos buckets: ¿conviven? | **No.** `SET` global, un juego a la vez | `CREATE SECRET` con `SCOPE` por prefijo, uno por credencial, creados al abrir el proyecto |
| 60 | Si comparto el proyecto, ¿se van las claves? | **A medias.** No se van —están fuera— pero tampoco se va su **nombre**: el otro no sabe qué le falta | Manifiesto de credenciales requeridas: nombres y tipos, nunca valores |
| 61 | ¿Puedo rotar una clave sin editar veinte archivos? | **A medias.** Al ser global se cambia en un sitio, pero por la razón equivocada | Referencia por nombre: se rota en el llavero y nada más cambia |
| 62 | ¿Queda registro de qué fuentes externas se leyeron y cuándo? | **A medias.** Hay historial de consultas en cada base | Bitácora de acceso a fuentes externas |
| 63 | ¿Puedo cifrar en reposo la base de un cliente? | **No** en la aplicación. El motor instalado ya lo permite al adjuntar | Base cifrada opcional por proyecto, con la clave en el llavero |
| 64 | ¿Qué pasa con los datos del cliente cuando termina el contrato? | **No** | Cierre de proyecto: se conserva el código, se borran o archivan los datos, y queda constancia local |
| 65 | ¿Puedo impedir que una consulta escriba fuera de la carpeta del proyecto? | **No.** `COPY TO` va donde se le diga | Modo confinado opcional, con los interruptores de acceso a disco que ya trae el motor |

### Cargas (66–74)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 66 | ¿Puedo cargar sólo lo nuevo desde la última vez? | **A medias.** Hay puntos de control, no marca de agua | Marca de agua por fuente, guardada entre ejecuciones |
| 67 | ¿Qué pasa si una carga falla a la mitad? | **Sí.** Puntos de control y reanudación | No se toca |
| 68 | ¿Puedo reintentar sola una fuente inestable? | **Por verificar** en el nodo HTTP | Política de reintentos declarada y visible por nodo |
| 69 | ¿Cada cuánto corre cada carga, y cuándo corrió por última vez? | **A medias.** Hay historial de ejecuciones, no programación | Ver 90 |
| 70 | ¿Puedo pedir que cuando termine la carga A corra la B? | **A medias.** Dentro de un pipeline sí; entre pipelines no | Dependencias entre pipelines |
| 71 | ¿Puedo disparar una carga cuando aparece un archivo nuevo? | **A medias.** La aplicación ya vigila el disco, para el editor | Disparador por archivo reutilizando esa vigilancia |
| 72 | ¿Puedo correr un pipeline sin abrir la interfaz? | **No** | **Línea de comandos**: `amoxsql run <pipeline>` sobre el mismo ejecutor. Es el requisito de 24, 90 y 126 |
| 73 | ¿Cuánto tarda cada paso y dónde se va el tiempo? | **A medias.** Logs por nodo en cada ejecución | Duración de cada paso comparada entre ejecuciones |
| 74 | ¿Puedo limitar memoria e hilos para no congelar la máquina mientras trabajo? | **No** en la interfaz. El motor lo permite | Perfil de recursos por proyecto y por ejecución de fondo |

### Calidad y contratos (75–81)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 75 | ¿Puedo declarar reglas —no nulos, únicos, rangos— que corran en cada carga? | **A medias.** Nodos de aserción y de validación; modal de calidad | Reglas declarativas por tabla, reutilizables fuera de un pipeline concreto |
| 76 | Si una regla falla, ¿se para todo o sigue y avisa? | **Por verificar** | Severidad por regla: bloquear o avisar |
| 77 | ¿Cuántos nulos había la semana pasada? | **No** | Métricas de calidad guardadas por ejecución |
| 78 | ¿Me entero si cambió el esquema de una fuente? | **A medias.** Schema Diff a mano | Detección en cada carga (ver 17) |
| 79 | ¿Puedo ver el linaje entero, de la fuente al reporte? | **A medias.** Tres linajes que no se hablan: dbt, pipelines, cuaderno | **Un** linaje del proyecto: fuentes, pipelines, vistas, cuadernos, figuras, decks |
| 80 | ¿Puedo probar un cambio sobre una copia sin tocar la base buena? | **A medias.** DuckLake tiene instantáneas; la aplicación no las ofrece | Copia de trabajo, o rama de datos sobre DuckLake |
| 81 | ¿Puedo volver a como estaba la tabla ayer? | **A medias.** Posible en DuckLake, no en una base normal | Exponer las instantáneas donde existan |

### Versionado y equipo (82–89)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 82 | ¿Todo lo que define el pipeline es texto versionable? | **Sí.** `.sqlchain`, `.sql`, `.sqlnb` | No se toca |
| 83 | ¿Puedo leer el diff de un pipeline sin leer JSON? | **A medias.** Diff de git; existe export a YAML | Diff semántico de pipelines: nodos añadidos, quitados, cambiados |
| 84 | ¿Puedo trabajar en una rama sin afectar a los analistas? | **A medias.** Ramas de código sí, pero con la misma base | Base por rama o por entorno (ver 51) |
| 85 | Un colega clona el repo: ¿cómo reconstruye la base? | **No.** Recibe el código sin los datos, y sin receta | **Receta de reconstrucción**: el orden de cargas, ejecutable con un gesto |
| 86 | ¿Puedo pasar el proyecto entero, con datos, cuando git no sirve? | **No** | **Paquete de proyecto**: con o sin datos, nunca con secretos, con manifiesto |
| 87 | ¿Qué versión de AmoxSQL y qué extensiones necesita este proyecto? | **No** | Requisitos en `project.json`, comprobados al abrir |
| 88 | ¿Puedo dejar notas de traspaso para quien lo herede? | **A medias.** Hay editor de markdown | Ficha del proyecto con sección de traspaso (ver 12) |
| 89 | ¿Pueden convivir dbt y Data Flow en el mismo proyecto sin pisarse? | **A medias.** Conviven, sin frontera | Decidir y declarar qué construye cada uno |

### Programación y operación (90–96)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 90 | ¿Puedo programar un pipeline cada noche? | **No** | Programación de pipelines y entregables |
| 91 | ¿Qué garantiza que corra si la laptop duerme o la aplicación está cerrada? | **No** | La decisión de §8 |
| 92 | ¿Dónde veo todo lo programado de todos mis clientes? | **No** | Panel de operación a nivel de máquina, por encima de los proyectos |
| 93 | ¿Me avisa si algo falló de madrugada? | **No** | Aviso del sistema al volver, y bitácora |
| 94 | Si coinciden cargas de dos clientes, ¿se estorban? | **No aplica hoy** | Cola con concurrencia limitada. Ojo: una base DuckDB admite **un solo escritor** (ver §8) |
| 95 | ¿Puedo pausar todo lo programado cuando me voy de vacaciones? | **No** | Pausa global y por cliente |
| 96 | ¿Puedo programar «el primer día hábil del mes»? | **No** | Calendario con días hábiles y festivos, por cliente |

### Rendimiento y escala (97–100)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 97 | Los datos del cliente ya no caben en mi máquina, ¿qué hago? | **A medias.** El motor lee en remoto; DuckLake | Guía y perfiles de consulta remota |
| 98 | ¿Cuáles son las consultas más lentas del proyecto? | **A medias.** El historial guarda el tiempo | Vista de consultas lentas |
| 99 | ¿Puedo materializar intermedios y saber cuándo se quedaron viejos? | **A medias.** Puntos de control; el cuaderno materializa | Frescura de cada materialización |
| 100 | ¿Puedo llevarme el pipeline para que corra en la infraestructura del cliente? | **A medias.** Export a SQL y a YAML | Export a SQL plano **ordenado**, con un guion de ejecución |

---

## 6. Científica de datos — Lucía (101–150)

### Lenguajes y entorno (101–108)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 101 | ¿Puedo escribir Python en el mismo cuaderno que mi SQL? | **No.** Python sólo se detecta, para dbt | Celdas de Python que lean y escriban en la sesión del proyecto (ver §8, un solo escritor) |
| 102 | ¿Qué entorno de Python usa este proyecto, y cómo lo fijo? | **A medias.** Se detectan conda y mamba | Entorno declarado por proyecto en `project.json` |
| 103 | ¿Puedo pasar un resultado de SQL a un dataframe sin exportar a CSV? | **No** | Puente en memoria o por Parquet temporal |
| 104 | ¿Y devolver una tabla de Python al SQL? | **No** | El mismo puente, en la otra dirección |
| 105 | ¿Puedo usar R? | **No** | Decisión: probablemente fuera de alcance |
| 106 | ¿Puedo abrir los cuadernos de Python que ya tengo? | **No.** Como mucho, como texto | Importarlos como cuaderno de AmoxSQL |
| 107 | ¿Se instalan desde la aplicación las librerías que necesito? | **No** | Gestión de paquetes del entorno del proyecto |
| 108 | ¿Puedo correr algo pesado sin congelar la interfaz? | **No** | Proceso aparte, con el mismo patrón que ya usa el servidor |

### Explorar y preparar (109–116)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 109 | ¿Puedo ver distribuciones, no sólo estadísticas? | **A medias.** El perfilador resume | Histogramas y correlaciones en el perfil |
| 110 | ¿Puedo muestrear de forma reproducible, con semilla fija? | **A medias.** El motor lo permite con SQL | Muestreo con semilla en la interfaz |
| 111 | ¿Puedo definir una variable una vez y usarla en varios modelos? | **A medias.** Las vistas del cuaderno | Catálogo de variables con descripción y versión |
| 112 | ¿Cómo evito usar datos del futuro sin darme cuenta? | **No** | Corte temporal declarado, y comprobación |
| 113 | ¿Puedo partir en entrenamiento y prueba y guardar la partición? | **No** | Partición guardada con su semilla |
| 114 | ¿Puedo ver rápido correlaciones y valores atípicos? | **A medias** | Ver 109 |
| 115 | ¿Puedo hacer estadística —contrastes, regresión simple— sin salir? | **A medias.** El motor trae `corr`, `regr_*` y compañía | Una skill de estadística para el asistente, y resultados legibles |
| 116 | ¿Puedo trabajar con datos geográficos? | **A medias.** La extensión espacial se instala; no se dibuja | Mapas en Story Flow |

### Experimentos y reproducibilidad (117–124)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 117 | ¿Puedo registrar cada experimento —parámetros, métricas, datos usados—? | **No** | Registro local de experimentos, en un esquema propio de la base del proyecto, como ya se hace con `amoxsql_ai` |
| 118 | ¿Puedo comparar tres corridas y ver cuál fue mejor? | **No** | Comparador sobre ese registro |
| 119 | ¿Con qué versión exacta de los datos entrené el modelo que entregué? | **No** | Huella de los datos usados: hash o instantánea |
| 120 | ¿Puede alguien reproducir mi resultado exacto? | **No** | Paquete reproducible: código, entorno, referencia de datos, semillas (ver 86) |
| 121 | ¿Puedo fijar una semilla para todo el proyecto? | **No** | Semilla del proyecto, heredada por muestreos y particiones |
| 122 | ¿Dónde guardo el modelo entrenado y sus métricas? | **No** | Carpeta canónica de modelos, con metadatos |
| 123 | ¿Puedo volver a correr el experimento de hace dos meses? | **A medias.** El código está en git; los datos quizá no | 119 + 120 |
| 124 | ¿Cuánto tardó cada entrenamiento? | **No** | Registrado en 117 |

### Del modelo al uso (125–131)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 125 | ¿Puedo puntuar datos nuevos con el modelo desde SQL? | **No** | Para modelos lineales y árboles, generar el SQL equivalente; para el resto, puntuar desde Python y devolver la tabla |
| 126 | ¿Puedo programar el reentrenamiento mensual? | **No** | La misma programación de 90 |
| 127 | ¿Me entero si el modelo se degrada con datos nuevos? | **No** | Seguimiento de distribuciones entre ejecuciones (ver 77) |
| 128 | ¿Puedo explicarle al cliente por qué el modelo decide así? | **A medias.** Story Flow narra bien | Figuras de importancia y de efectos listas para Story Flow |
| 129 | ¿Puedo entregar el modelo en un formato que su equipo use? | **No** | Export estándar del modelo junto con su ficha |
| 130 | ¿Puedo convertir mi análisis en un reporte ejecutivo sin rehacerlo? | **Sí.** Story Flow → Report Flow | No se toca |
| 131 | ¿Puedo entregar un cuaderno limpio, sin mis pruebas? | **A medias.** Existe el modo lectura | Marcar celdas como borrador y excluirlas del export |

### La IA como compañera (132–137)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 132 | ¿Entiende la IA también mi Python? | **No,** porque no hay Python | Llega con 101 |
| 133 | ¿Puede proponer variables o detectar fugas? | **A medias.** Hay skills de exploración y calidad | Skills de ciencia de datos |
| 134 | ¿Puede revisar mi metodología? | **A medias** | Una skill de revisión metodológica |
| 135 | Datos sensibles con un modelo local, el resto en la nube: ¿se puede? | **No.** El proveedor es global | = 44. Tercera vez que sale |
| 136 | ¿Puede leer mis experimentos anteriores? | **No** | Con 117, como herramienta del asistente |
| 137 | ¿Puede escribir la ficha técnica del modelo? | **A medias** | Plantilla de ficha, alimentada por 117 |

### Colaborar (138–144)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 138 | ¿Puedo pasar un experimento a un colega para que lo revise? | **No** | = 86 y 120 |
| 139 | ¿Puedo pasar mis variables al ingeniero para la carga diaria? | **A medias** | = 57 |
| 140 | ¿Puede el analista usar las predicciones sin saber Python? | **No** | Tabla publicada (= 55) |
| 141 | ¿Puedo dejar un comentario en una celda? | **No** | Comentarios anclados, guardados como texto junto al archivo y versionables |
| 142 | ¿Quién cambió qué en el cuaderno? | **A medias.** Log y diff de git | Historial legible por celda |
| 143 | ¿Puedo trabajar a la vez que el ingeniero en el mismo proyecto? | **No** | **Decisión**: colaboración asíncrona. La simultánea choca con el escritor único y con «sin servidor» |
| 144 | ¿Puedo dejar un proyecto de referencia para el equipo? | **A medias** | = 7 |

### Recursos y limpieza (145–150)

| # | Lo que se pregunta | Hoy | Lo que haría falta |
|---|---|---|---|
| 145 | ¿Puedo entrenar con más datos de los que caben en memoria? | **A medias.** El motor trabaja fuera de memoria; Python no | Preparar en SQL, entrenar sobre muestras o por lotes |
| 146 | ¿Puedo cerrar la aplicación mientras entrena algo largo? | **No** | Ejecución de fondo que sobreviva a la ventana (§8) |
| 147 | ¿Puedo limitar la memoria del experimento para seguir trabajando? | **No** | = 74 |
| 148 | ¿Cómo trato datos personales al entrenar? | **No** | = 23 |
| 149 | ¿Puedo borrar un experimento con todo lo que generó? | **No** | Con 117, se borra como unidad |
| 150 | ¿Cuánto disco ocupa cada proyecto, y qué puedo limpiar? | **No** | Panel de almacenamiento por proyecto y por cliente |

---

## 7. Lo que sale de las 150

### El recuento

Contado sobre las filas de arriba, no estimado. Las dos «no aplica hoy» (25 y 94)
cuentan como «no».

| | Sí | A medias | No | Por verificar |
|---|---|---|---|---|
| Analista (1–50) | 5 | 21 | 24 | 0 |
| Ingeniero (51–100) | 2 | 25 | 21 | 2 |
| Científica (101–150) | 1 | 17 | 32 | 0 |
| **Total** | **8** | **63** | **77** | **2** |

**Más de la mitad —77— son «no»**: cosas que no existen de ninguna forma. Esta versión
mayor es, sobre todo, construcción nueva, y conviene no engañarse con eso.

Pero la columna de al lado dice algo que la primera no dice. **63 respuestas son «a
medias»**, y casi todas por la misma razón: la pieza existe, pero sólo se alcanza a mano,
dentro de un proyecto, con la ventana abierta. Cuatro de cada diez preguntas se contestan
**sin construir nada nuevo**, sacando de la sesión lo que ya funciona. Ésa es la parte
barata del plan, y debería ir por delante.

La científica es la que peor sale —32 «no» de 50— y no por casualidad: Python es la única
pieza que falta por completo.

### Los doce huecos

Agrupadas, las 150 caen en doce huecos, ordenados por cuántas preguntas los piden. Una
pregunta puede caer en dos huecos —la 10 es a la vez administrativa y de entregas—, así
que la columna no suma 150.

| # | Hueco | Cuántas | Preguntas | Perfiles |
|---|---|---|---|---|
| 1 | **Automatizar**: línea de comandos, programación, disparadores, avisos, cola | 19 | 24–27, 29–30, 69–72, 90–96, 126, 146 | Los tres |
| 2 | **Confianza en los números**: métricas consultables, contratos, calidad guardada, un solo linaje | 13 | 17–18, 32–36, 55, 75–79 | Los tres |
| 3 | **Credenciales y aislamiento**: llavero, secretos con alcance, política de IA, confinamiento, cifrado | 13 | 20–21, 44, 47, 58–65, 135 | Los tres |
| 4 | **Experimentos y reproducibilidad** | 12 | 43, 113, 117–124, 136, 149 | Científica y analista |
| 5 | **El cliente como nivel**: agrupar, estado, etiquetas, archivar, marca, calendario | 10 | 1–4, 6, 8, 15, 92, 95–96 | Analista e ingeniero |
| 6 | **Python** | 9 | 101–108, 132 | Científica |
| 7 | **Lo administrativo**: ficha del proyecto, bitácora de entregas y decisiones, tiempo | 9 | 5, 9–14, 41, 88 | Analista e ingeniero |
| 8 | **Entregas con memoria**: instantáneas, versiones, procedencia, lote | 9 | 10, 28–29, 35–36, 39–41, 131 | Analista |
| 9 | **Compartir entero**: paquete de proyecto, receta de reconstrucción, manifiesto, requisitos | 8 | 38, 50, 60, 85–87, 120, 138 | Los tres |
| 10 | **Reutilizar en tres niveles**: personal, cliente, proyecto | 6 | 7, 46, 48–49, 111, 144 | Los tres |
| 11 | **Operar la máquina**: recursos, almacenamiento, cierre de proyecto | 5 | 64, 74, 94, 147, 150 | Los tres |
| 12 | **Entornos**: desarrollo y producción, bases con nombre | 4 | 51–53, 84 | Ingeniero |

La programación de tareas —la que ya tenías en mente— es **una parte del hueco 1**, y no
la primera. Sin línea de comandos no hay programación que funcione con la ventana
cerrada, y sin credenciales por nombre (hueco 3) una tarea de madrugada no tiene con qué
autenticarse. El orden lo imponen las dependencias, no el entusiasmo.

## 8. Lo que impone «local»

Estas no son preferencias. Son consecuencias de correr en la máquina del usuario, y
cualquier diseño que las ignore fallará en la práctica, no en la teoría.

1. **Nada sale de la máquina sin que el usuario lo decida.** Ni hacia la IA, ni hacia un
   export, ni hacia un envío. Por eso el correo (31) queda fuera y la política de IA
   (44) va dentro.
2. **Compartir es pasar archivos.** Git, un paquete o una carpeta sincronizada. No hay
   servidor, ni cuenta, ni «invitar a un colega». La colaboración es **asíncrona** (143),
   y eso no es una limitación a disimular: es el modelo.
3. **Los secretos nunca viven en el proyecto.** El proyecto declara *qué* necesita por
   nombre; cada máquina guarda *el valor* en su llavero. Así el proyecto puede viajar
   entero sin riesgo, y lo que falta al otro lado se anuncia en lugar de fallar.
4. **Programar exige algo despierto, y la aplicación no es un servidor.** Hay tres
   caminos y no son excluyentes:
   - **Tarea del sistema operativo** que llama a la línea de comandos. Corre con la
     aplicación cerrada. Requiere la CLI.
   - **Proceso residente** en la bandeja. Más cómodo, pero se muere si el usuario lo
     cierra, y tiene que respetar el punto 5.
   - **Ponerse al día al abrir.** Lo que no pudo correr, corre ahora y lo dice. Es la red
     de seguridad de las otras dos.
5. **Una base DuckDB admite un solo escritor.** Si la aplicación tiene abierta la base
   del proyecto, una carga programada no puede escribir en ella desde otro proceso. Esto
   condiciona la programación, las celdas de Python (101) y la cola (94) a la vez, y hay
   que decidirlo **antes** de diseñar cualquiera de las tres. Salidas posibles: que la
   ejecución de fondo pase por el mismo servidor cuando la aplicación está abierta, o que
   las cargas escriban en una base separada que el proyecto adjunta en sólo lectura.
6. **El disco es del usuario.** Lo que la aplicación genera —instantáneas, experimentos,
   exports— ocupa espacio que alguien tiene que poder ver y limpiar (150).

## 9. La idea que lo ordena todo

Hoy la aplicación tiene un nivel: el proyecto. Hacen falta dos más, uno por encima y
otro por debajo, y cada pregunta cae naturalmente en uno de ellos:

```
Mi máquina         llavero · biblioteca personal · perfil · panel de operación · programaciones
 └─ Cliente        marca · política de IA · credenciales por nombre · calendario · contactos
     └─ Proyecto   entornos · bases · pipelines · cuadernos · linaje · ficha · bitácora
         └─ Entrega  parámetros · instantánea · procedencia · versión · destino
```

Y una regla que hace que todo lo anterior siga siendo local:

> **El proyecto es una carpeta que viaja. Lo que no puede viajar —secretos, rutas de esta
> máquina— se declara por nombre y se resuelve en cada máquina.**

Si el cliente es **también una carpeta** —una carpeta de proyectos con su propia ficha—,
hereda esa misma virtud: se comparte, se archiva y se respalda igual que un proyecto.
El registro de la máquina sólo lo indexa.

## 10. Lo que NO se toca

- **El proyecto como carpeta simple.** Todo lo nuevo se suma a `project.json` o a
  archivos de texto dentro de la carpeta; nada exige una base central.
- **Los formatos de texto.** `.sql`, `.sqlnb`, `.sqlchain`, `.amoxvis`, `.amoxdeck` siguen
  siendo la única verdad y siguen siendo versionables.
- **Una base por proyecto** como punto de partida. Los entornos (51) la multiplican; no
  la sustituyen.
- **El aislamiento de la IA por proyecto** (45). Ya está bien resuelto.
- **Sin servidor, sin cuenta, sin tiempo real.** Ninguna de las 150 preguntas lo
  necesita para ser contestada bien.

## 11. Los candidatos a funcionalidad

No es todavía un plan por fases: es la lista de la que saldrá, con lo que contesta cada
pieza y un tamaño orientativo. El orden de la columna **Va antes de** es el que importa.

| Candidato | Contesta | Tamaño | Va antes de |
|---|---|---|---|
| **Llavero y credenciales por nombre** (`safeStorage` + `CREATE SECRET` con alcance) | 21, 58–61, 63 | M | Todo lo que corra sin el usuario delante |
| **Manifiesto y requisitos del proyecto** | 60, 87 | S | Paquete de proyecto |
| **Cliente como nivel** y nueva pantalla de inicio | 1–4, 6, 8, 15 | M | Panel de operación, política de IA por cliente |
| **Ficha y bitácora del proyecto** (markdown con plantilla) | 5, 10–14, 41, 88 | S | Resumen de cierre |
| **Política de IA por cliente/proyecto** | 44, 47, 135 | S | — |
| **Línea de comandos** sobre el ejecutor existente | 72, 100 | M | Programación |
| **Programación, disparadores y avisos** | 24–27, 69–71, 90–96, 126 | L | Panel de operación |
| **Receta de reconstrucción y paquete de proyecto** | 38, 50, 85–86, 120, 138 | M | — |
| **Entornos** | 51–53, 84 | M | — |
| **Métricas consultables** desde la capa semántica | 32 | S | Contratos |
| **Contratos y reglas de calidad guardadas** | 17–18, 33, 55, 75–78 | M | — |
| **Un linaje del proyecto** | 34–35, 79 | L | — |
| **Entregas con memoria** (instantáneas, versiones, lote) | 10, 28–29, 36, 40–41, 43 | M | — |
| **Biblioteca en tres niveles** | 7, 46, 48–49, 111, 144 | S | — |
| **Columnas sensibles** (enmascarado y excluidas de la IA) | 23, 40, 148 | S | — |
| **Python** (celdas y puente) | 101–108, 132 | L | Experimentos |
| **Registro de experimentos** | 113, 117–124, 136–137, 149 | M | — |
| **Operar la máquina**: recursos, almacenamiento, cierre | 64–65, 74, 147, 150 | S | — |

## 12. Lo que te toca decidir

> **Decidido el 2026-09-29** — ver [`candidatos_v6.md`](candidatos_v6.md) §1. El cliente
> **no** es una carpeta: lo gobierna AmoxSQL y las carpetas se le asignan (se descartó la
> recomendación 1 de abajo). Programación: tarea del sistema + ponerse al día, como se
> recomendaba. Python, mucho después; R, fuera. Y una respuesta que no estaba entre las
> preguntas cambió el resto: **lo que manda es el archivo, no la base**, lo que reduce casi
> a nada el problema del escritor único. Sigue sin decidir el registro de tiempo.
> Después se decidió el **nombre**: lo que esta auditoría llama «cliente» es, en la
> aplicación, un **workspace**, y cada usuario elige la palabra que ve (Clients, Teams,
> Brands…). Para liberar esa palabra, lo que hoy la interfaz llama *workspace* pasa a
> llamarse *project*, como ya lo llaman el código y `project.json`.
> Lo de abajo se conserva tal como se escribió.

Hay seis decisiones que ninguna pregunta puede contestar por sí sola, y cada una cambia
el diseño de varias piezas:

1. **¿El cliente es una carpeta o una entrada en un registro?** Recomiendo carpeta, por
   la regla de §9. El coste es que los proyectos existentes, sueltos, tienen que poder
   seguir abriéndose sin cliente.
2. **¿Cómo se resuelve el escritor único?** (§8.5). Es la decisión técnica de la que
   dependen a la vez programación, Python y la cola.
3. **¿Qué camino de programación va primero?** Recomiendo tarea del sistema + ponerse al
   día al abrir; el proceso residente, después y sólo si se echa de menos.
4. **¿Python entra como celda o como puente?** Celda es más cómodo; puente es más barato y
   respeta el entorno que el usuario ya tiene.
5. **¿El registro de tiempo entra?** Es útil para facturar e invasivo si se activa sin
   preguntar. Si entra, apagado por defecto.
6. **¿R entra?** Mi recomendación es que no, al menos en esta versión mayor.

Y una aclaración de numeración: dijiste que esto sería la versión 5, pero ya vamos por la
**5.8.0**. Todo lo de arriba apunta a la **6.0**.
