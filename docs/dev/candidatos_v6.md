# Candidatos para la 6.0

> Lo que puede entrar en la próxima versión mayor, sacado de la
> [auditoría de 150 preguntas](auditoria_plataforma_analisis.md) y corregido con las
> respuestas del autor. Cada candidato dice **para qué sirve**, **un ejemplo** y **qué
> mejora**, en lenguaje de usuario. No es todavía un plan por fases: es la lista de la que
> saldrá. Fecha: 2026-09-29.

---

## 1. Lo que cambió con tus respuestas

Cuatro respuestas, y dos de ellas le dan la vuelta a la auditoría.

**Lo que agrupa proyectos lo gobierna AmoxSQL, no la carpeta.** Se llama
**workspace**. Los workspaces se crean en la aplicación, y a cada proyecto se le dice
«perteneces a este workspace». El workspace no entra en la jerarquía de carpetas. Eso
permite lo que una carpeta no puede: que la documentación, las medidas y el contexto
existan **aunque no haya ningún proyecto abierto**, y que sirvan a todos sus proyectos a
la vez.

Para una agencia, un workspace es un cliente; para un equipo interno, un área; para quien
lleva varias marcas, una marca. Por eso el concepto tiene un nombre neutro y **cada usuario
elige la palabra que ve** ([B8](#b8--la-palabra-la-eliges-tú)). Y por eso hay que arreglar
antes una cosa: hoy la interfaz ya llama *workspace* a la carpeta del proyecto
([B7](#b7--project-en-toda-la-interfaz)).

En este documento, *workspace* es el concepto y *cliente* es el cliente real de la agencia
—el que manda el Excel y espera el reporte—. Las preguntas 151–163 conservan la voz de
quien las hace, y alguien de agencia dice «cliente».

**Lo que manda es el archivo, no la base.** Esto es lo que más cambia. Para casi todos los
usuarios —todos menos el ingeniero de datos— la base DuckDB es lo último que usarían. La
entrada es un Excel, un CSV o un Parquet; la salida es otro Excel o un gráfico. Lo que sí
tiene sentido es conectarse a un lago (Delta, Iceberg) o a un bucket de Parquet, y cruzar
un archivo que vive en la nube con un Excel local. Y según los usuarios piloto, el uso que
crece es el de los **procesos internos** de los analistas: de Excel a Excel, sin pasar por
ninguna base, y lo que les falta es que corran solos.

**La programación: tarea del sistema y ponerse al día al abrir.** Confirmado.

**Python, mucho después.** Es lo último: llega con la familia K, que cierra la 6.0.0. R,
fuera.

### Lo que eso resuelve de rebote

La decisión técnica que más preocupaba —**una base DuckDB admite un solo escritor**— deja
de ser un problema si cada cosa vive donde le toca. Hoy no es así: Data Flow escribe en
la base del proyecto aunque el proceso vaya de Excel a Excel —materializa cada paso con
`CREATE OR REPLACE TABLE` y guarda el historial en `amoxsql_chains.runs`—, así que una
ejecución programada chocaría con la aplicación abierta.

La regla del motor, para no olvidarla: un archivo DuckDB lo abre **un solo proceso para
escribir**; varios pueden abrirlo para leer, pero nunca a la vez que uno que escribe.
De ahí sale el reparto, que es idea del autor:

```
Qué                                   Dónde                                  Quién escribe
──────────────────────────────────────────────────────────────────────────────────────────
Workspaces, fuentes, programaciones,  La base de AmoxSQL                     Sólo la aplicación
ejecuciones, entregas                 (~/.amoxsql, fuera de los proyectos)

Pasos intermedios de un proceso       Su base de trabajo, una por proceso    Sólo ese proceso
                                      (o en memoria, si no necesita reanudar)

Lo que el proceso produce             Un archivo: Parquet, Excel, CSV,       Sólo ese proceso, y
                                      publicado de golpe (ver C6)            de forma atómica

La base del proyecto                  Donde está                             El analista, a mano.
                                                                             Un proceso de fondo
                                                                             sólo si lo declara
```

Y encima del reparto, una garantía que la aplicación ya da: **nunca corren dos AmoxSQL a
la vez**, por la instancia única. Una ejecución lanzada por el programador del sistema se
entrega a la aplicación si está abierta; si no, ese mismo arranque corre sin ventana. Un
solo proceso es dueño de cada base, así que nada compite por ninguna. Eso hizo innecesaria
la «bandeja» que se había propuesto aquí. Ver [A4](#a4--ejecuciones-aisladas),
[A5](#a5--la-base-de-amoxsql) y la decisión Dec-1 del plan.

Y un criterio que ordena qué va a la base y qué a archivos:

> **Lo que escribe una persona es texto; lo que registra la máquina va a la base.**

Las medidas, la documentación y el glosario de un workspace son texto —se editan, se leen,
se exportan (B6)—. Las ejecuciones, los avisos y las entregas los registra la máquina, y
van a la base de AmoxSQL, donde se consultan y se filtran.

### La numeración

Decidido después, con el plan de implementación
([`plan_v6_cimientos_y_workspaces.md`](plan_v6_cimientos_y_workspaces.md)):
**la 6.0.0 es el cierre de todo este documento**, de la A a la K. Cada familia es una
versión menor, en orden alfabético, que es también el orden de sus dependencias: ninguna de
las 46 que declaran los candidatos apunta a una familia posterior.

**Con una excepción, decidida el 2026-10-01: la familia I se adelanta a la 5.12.0.** Se
rehízo alrededor de dbt y DuckLake (ver I más abajo), y así depende sólo de C y D, que van
antes. El bloqueo entre AmoxSQL y dbt —la aplicación tiene la base abierta y `dbt run` no
puede escribir— es un problema de hoy, no una mejora, y su arreglo (I1) llega aún antes,
con la 5.10.0. E, F, G y H se corren un número.

| Versión | Familia |
|---|---|
| **5.9.0** | A + B · cimientos y workspaces — **publicada el 2026-10-01** |
| 5.10.0 | C · los datos donde están |
| 5.11.0 | D · procesos que corren solos |
| 5.12.0 | I · el ingeniero de datos: dbt y DuckLake (adelantada) |
| 5.13.0 | E · confianza en los números |
| 5.14.0 | F · entregar y recordar |
| 5.15.0 | G · compartir y heredar |
| 5.16.0 | H · operar la máquina |
| 5.17.0 | J · mejoras sueltas |
| **6.0.0** | K · Python y experimentos |

Cada ficha lleva la versión de su familia.

### Lo que la 6 es, en una frase

> **Workspaces gobernados por AmoxSQL, y procesos de archivo a archivo que corren solos.**

La primera mitad llega en la 5.9.0. La segunda, en la 5.10.0 y la 5.11.0, sobre lo que la
5.9.0 deja puesto: la línea de comandos, las ejecuciones aisladas, la base central y el
llavero. La tesis está entera en la 5.11.0; lo que sigue hasta la 6.0.0 la hace más fiable,
más fácil de compartir y, al final, abierta a Python.

### Lo que sigue sin decidir

- **El registro de tiempo** no tuvo respuesta. Queda como candidato, apagado por defecto
  ([F6](#f6--registro-de-tiempo)).

---

## 2. Cómo leer cada candidato

```
Nombre                         [tipo] · versión · tamaño
Para qué sirve     una frase, como la diría el usuario
Ejemplo            un caso concreto
Qué mejora         lo que cambia respecto a hoy
Contesta           preguntas de la auditoría (y las nuevas, 151–163)
Depende de         lo que tiene que existir antes
```

**Tipo**

- **Nueva** — no existe nada parecido.
- **Mejora** — la pieza existe y se extiende.
- **Modificación** — la pieza existe y cambia cómo funciona; puede afectar a lo que ya
  usa alguien.

**Versión**: la de su familia (ver §1). **Pendiente** si falta una decisión del autor;
**fuera** si está decidido que no.

**Tamaño**: **S** unos días · **M** una o dos semanas · **L** varias semanas.

---

## 3. Las preguntas que faltaban (151–163)

Las respuestas abren trece preguntas que la auditoría no hacía, porque suponía que el
usuario trabajaba sobre una base. Mismo formato que allí.

| # | Lo que se pregunta | Hoy |
|---|---|---|
| 151 | Mi Excel de entrada vive en una carpeta que se sincroniza con la nube, ¿puedo leerlo donde está? | **A medias.** Es una ruta local y se lee, pero sin nombre: la ruta es la de esta máquina |
| 152 | En mi máquina esa carpeta está en `G:`, en la de mi colega en `D:`, ¿puedo nombrarla una vez? | **No** |
| 153 | Mi proceso toma tres Excel y deja uno, ¿necesito una base para eso? | **Hoy sí, sin saberlo**: Data Flow crea tablas y guarda su historial en la base del proyecto |
| 154 | ¿Puedo dejar el Excel de salida con el formato que espera el cliente: varias hojas, encabezados, anchos? | **No.** Una sola hoja plana |
| 155 | ¿Puedo escribir los datos dentro de una plantilla de Excel que ya tiene fórmulas y gráficos? | **No** |
| 156 | El Excel trae los encabezados en la fila 4 y notas al pie, ¿lo leo sin limpiarlo a mano? | **A medias.** Se elige la hoja; no la fila de encabezado ni el rango, aunque el motor lo permite |
| 157 | ¿Puedo leer un lago en Delta o Iceberg sin copiarlo? | **A medias.** Instalando la extensión y escribiendo SQL; no hay interfaz |
| 158 | ¿Puedo tratar todos los Parquet de un bucket como una sola tabla? | **A medias.** Con SQL y comodines; la credencial es global (58–59) |
| 159 | ¿Puedo consultar las medidas del cliente sin abrir ningún proyecto? | **No.** Viven en `.amoxsql/context/` de cada proyecto |
| 160 | Tengo proyectos viejos sin cliente, ¿puedo asignárselo después? | **No aplica hoy** |
| 161 | ¿Puedo pasarle a un colega todo el contexto de un cliente sin pasarle los proyectos? | **No** |
| 162 | ¿Puede alguien de otra área correr el proceso cambiando sólo la fecha, sin ver SQL? | **No** |
| 163 | ¿Puedo ver cómo salió la ejecución de anoche sin abrir el Excel? | **No** |

---

## 4. Los candidatos

Agrupados en once familias. Las tres primeras son las que sostienen la frase de §1.

### A · Cimientos

> **Hecha en la 5.9.0** (fases 0–4 del plan). Lo que cambió al implementar está en la
> bitácora de `plan_v6_cimientos_y_workspaces.md`.

Lo que todo lo demás necesita. Ninguno se ve mucho; sin ellos, nada de lo vistoso funciona
sin el usuario delante.

#### A1 · Llavero de credenciales
`Modificación` · **5.9** · M

- **Para qué sirve:** guardar las contraseñas y claves en la caja fuerte del sistema
  operativo, no en un archivo de texto.
- **Ejemplo:** la clave del bucket de la financiera se guarda una vez como
  «bucket-financiera». Los proyectos la piden por ese nombre y nunca ven el valor.
- **Qué mejora:** hoy las claves están en texto plano en `~/.amoxsql/config.json`, y las de
  S3/GCS se fijan con `SET` global, así que dos clientes con buckets distintos no pueden
  convivir. Con `safeStorage` de Electron y `CREATE SECRET` con `SCOPE` por prefijo, cada
  credencial vale sólo para lo suyo.
- **Contesta:** 20–21, 58–61, 63, 158
- **Depende de:** —

#### A2 · Manifiesto del proyecto
`Mejora` · **5.9** · S

- **Para qué sirve:** que el proyecto diga qué necesita para funcionar —qué credenciales,
  qué fuentes, qué versión de AmoxSQL— sin guardar nada secreto.
- **Ejemplo:** tu colega abre el proyecto y, en lugar de un error de conexión, ve «Faltan:
  credencial *bucket-financiera*, fuente *ventas-semanales*».
- **Qué mejora:** hoy lo que falta al otro lado se descubre fallando.
- **Contesta:** 60, 87
- **Depende de:** A1

#### A3 · Línea de comandos
`Nueva` · **5.9** · M

- **Para qué sirve:** correr un proceso sin abrir la ventana.
- **Ejemplo:** `amoxsql run cierre-mensual --semana 38`.
- **Qué mejora:** es la pieza que hace posible programar con la aplicación cerrada. Usa el
  mismo ejecutor de Data Flow; no es un segundo motor.
- **Contesta:** 72, 100
- **Depende de:** A4

#### A4 · Ejecuciones aisladas
`Modificación` · **5.9** · M

- **Para qué sirve:** que un proceso que corre de fondo no toque la base del proyecto ni
  la de nadie más.
- **Ejemplo:** el proceso del lunes lee tres Excel, cruza y agrupa, y deja un Parquet. Sus
  pasos intermedios viven en su propia base de trabajo; si falla en el paso 4, el martes se
  reanuda desde ahí. Mientras tanto, el analista trabaja en el proyecto sin notar nada.
- **Qué mejora:** hoy Data Flow crea sus tablas y guarda su historial en la base del
  proyecto aunque el proceso no la necesite. Aquí cada proceso tiene **su** base de
  trabajo: es la «base de ejecuciones» que un ingeniero crearía a mano, pero automática y
  una por proceso, así que dos procesos nunca se pisan. Si el proceso no necesita
  reanudar, corre en memoria y no deja nada. La base del proyecto sólo se toca si el
  proceso lo declara; y si la aplicación la tiene abierta, se le pide a la aplicación que
  lo corra.
- **Contesta:** 153, y desbloquea 24, 90, 94
- **Depende de:** —

#### A5 · La base de AmoxSQL
`Nueva` · **5.9** · M

- **Para qué sirve:** que AmoxSQL tenga su propia base, fuera de los proyectos, para lo que
  pertenece a la máquina y no a un proyecto.
- **Ejemplo:** el panel de operación pregunta «¿qué falló esta semana, de todos mis
  clientes?» y la respuesta es una consulta, no abrir nueve proyectos.
- **Qué mejora:** hoy no hay nada por encima del proyecto. Aquí viven el registro de
  workspaces, las fuentes con nombre, las programaciones, las ejecuciones, los avisos y la
  bitácora de entregas. **Sólo un proceso la abre**, porque nunca corren dos AmoxSQL a la
  vez: una ejecución lanzada desde fuera se entrega a la aplicación abierta, o corre ella
  misma sin ventana. En la 5.9.0 guarda workspaces, proyectos, credenciales cifradas,
  ejecuciones y preferencias; las fuentes llegan con la 5.10.0 y las programaciones con la
  5.11.0.
- **Contesta:** 92, 163, y es la casa de B1, D1, D2, D7 y F1
- **Depende de:** —

---

### B · El workspace

> **Hecha en la 5.9.0** (fases 5–8). Un cambio respecto a esta ficha, decidido con el
> autor: B3 no sustituye la bienvenida, que se queda como estaba y sólo gana un botón a
> la vista de workspaces.

Un espacio que gobierna AmoxSQL. Los proyectos se le asignan; el workspace no vive dentro
de ninguna carpeta.

#### B1 · Crear workspaces y asignar proyectos
`Nueva` · **5.9** · M

- **Para qué sirve:** tener los workspaces registrados y decirle a cada proyecto a cuál
  pertenece.
- **Ejemplo:** creas el workspace «Tiendas del Norte» —un cliente, en tu caso—. Al abrir la
  carpeta `reporte-ventas-q3`, AmoxSQL pregunta a qué workspace pertenece y la engancha.
- **Qué mejora:** hoy los proyectos son una lista suelta. **Cómo se engancha:** el workspace
  y sus datos viven en el espacio de AmoxSQL; el proyecto guarda en su `project.json` sólo
  el **identificador y el nombre** del workspace. Así la carpeta sigue sabiendo a qué
  pertenece si cambia de sitio o de máquina, y en una máquina donde ese workspace no existe
  se ofrece crearlo o importarlo (ver B6).
- **Contesta:** 1, 160
- **Depende de:** A5, B7

#### B2 · Contexto del workspace, sin abrir proyecto
`Modificación` · **5.9** · M

- **Para qué sirve:** documentación, medidas, glosario y reglas del workspace en un solo
  sitio, compartidos por todos sus proyectos.
- **Ejemplo:** «Venta neta» se define una vez para Tiendas del Norte. Sus cinco proyectos
  la usan, y puedes consultar la definición sin abrir ninguno.
- **Qué mejora:** hoy `metrics.yml`, el glosario y `RULES.md` viven en cada proyecto, y hay
  que copiarlos. **Modificación** porque cambia dónde vive el contexto: el workspace pone la
  base y el proyecto puede añadir o sobrescribir lo suyo.
- **Contesta:** 32, 46, 159
- **Depende de:** B1

#### B3 · Inicio por workspace
`Nueva` · **5.9** · M

- **Para qué sirve:** una pantalla de inicio que enseñe los proyectos agrupados por
  workspace, con su estado.
- **Ejemplo:** ves «Tiendas del Norte — 3 en curso, 1 en revisión» y, debajo, «Financiera
  — cierre mensual: vence el día 5».
- **Qué mejora:** la pantalla de inicio de hoy es una lista de recientes. Aquí entran el
  estado del proyecto, las etiquetas, archivar lo terminado y buscar en todos los
  proyectos de un workspace.
- **Contesta:** 3–4, 6, 8, 11
- **Depende de:** B1

#### B4 · Política de IA por workspace
`Nueva` · **5.9** · S

- **Para qué sirve:** que cada workspace diga qué IA se puede usar con sus datos.
- **Ejemplo:** el hospital sólo permite el modelo local y que la IA vea el esquema, nunca
  filas. Al abrir uno de sus proyectos, el selector de modelo sólo ofrece los locales.
- **Qué mejora:** hoy el proveedor es global. Salió tres veces en la auditoría, en los tres
  perfiles.
- **Contesta:** 44, 47, 135
- **Depende de:** B1

#### B5 · Marca del workspace
`Mejora` · **5.9** · S

- **Para qué sirve:** logo, colores y plantilla del workspace —en una agencia, la marca del
  cliente—, heredados por todo lo que produce.
- **Ejemplo:** cualquier deck o gráfico nuevo de Tiendas del Norte sale ya con su verde y
  su logo.
- **Qué mejora:** hoy la marca se pone deck por deck.
- **Contesta:** 15
- **Depende de:** B1

#### B6 · Exportar e importar un workspace
`Nueva` · **5.9** · S

- **Para qué sirve:** pasarle a otra persona —o a otra máquina tuya— todo lo transversal
  de un workspace.
- **Ejemplo:** exportas «Tiendas del Norte» a un archivo. Tu colega lo importa y tiene las
  medidas, el glosario, la marca y las fuentes con nombre. **Sin** credenciales: esas las
  pone cada uno en su llavero.
- **Qué mejora:** es la contrapartida de que el workspace no sea una carpeta: si no viaja
  con los proyectos, tiene que poder viajar solo.
- **Contesta:** 50, 161
- **Depende de:** B1, B2, A1

#### B7 · Project en toda la interfaz
`Modificación` · **5.9** · S

- **Para qué sirve:** que la carpeta se llame igual en toda la aplicación.
- **Ejemplo:** donde hoy dice «Recent Workspaces», «Open a workspace» o «Close Workspace»,
  dirá «Recent Projects», «Open a project» y «Close Project».
- **Qué mejora:** hoy la misma cosa tiene dos nombres: la interfaz dice *workspace* y el
  código, los documentos y `project.json` dicen *project*. Hay que arreglarlo **antes** de
  B1, porque *workspace* pasa a significar lo que agrupa proyectos. Son unos quince textos
  y la sección Workspace de Settings. **Modificación** que notan los usuarios piloto: la
  primera vez que abran la 5.9, una frase lo explica —*"Your workspaces are now called
  projects. Workspaces group them."*—.
- **Contesta:** — es requisito de B1
- **Depende de:** —

#### B8 · La palabra la eliges tú
`Nueva` · **5.9** · S

- **Para qué sirve:** que los workspaces se llamen como los llamas tú.
- **Ejemplo:** la primera vez, AmoxSQL pregunta *"How do you organize your work?"*. En una
  agencia se elige **Clients**, y la interfaz dice «Clients», «New client» y «Client brand»
  en todas partes. Un equipo interno elige **Teams**; quien lleva varias marcas,
  **Brands**; una empresa de producto, **Products**. Quien no elige, ve **Workspaces**.
- **Qué mejora:** el concepto es uno y la palabra es de cada uno. En el código y en la
  documentación es siempre *workspace*; la interfaz y el asistente usan la palabra del
  usuario, para hablarle como habla él. Si dos personas usan palabras distintas y se pasan
  un workspace (B6), no pasa nada: lo que viaja es el concepto, no la etiqueta.
- **Contesta:** — lo pidió el autor: «para mí serían clientes y para otros serían otra cosa»
- **Depende de:** B1

---

### C · Los datos donde están

Archivos primero. La base es una opción, no el punto de partida.

#### C1 · Fuentes con nombre
`Nueva` · **5.10** · M

- **Para qué sirve:** declarar una vez de dónde vienen los datos y usarlos por su nombre.
- **Ejemplo:** «ventas-semanales» es la carpeta sincronizada de la nube donde el cliente
  deja su Excel. En tu máquina apunta a `G:\Tiendas\entrada`; en la de tu colega, a
  `D:\Nube\Tiendas\entrada`. El proceso sólo dice «ventas-semanales».
- **Qué mejora:** hoy una ruta es la ruta de esta máquina. Una fuente con nombre puede ser
  un archivo, una carpeta, un bucket o un lago, y se declara en el workspace (B2), así que
  sirve a todos sus proyectos. Se consulta como una tabla (`fuentes."ventas-semanales"`)
  desde el editor, los cuadernos, Data Flow, la IA y la línea de comandos, y dbt la recibe
  como `source` (I7).
- **Contesta:** 19, 22, 151–152
- **Depende de:** A1, B1

#### C2 · Excel de entrada sin limpiarlo a mano
`Mejora` · **5.10** · S

- **Para qué sirve:** leer el Excel tal como llega.
- **Ejemplo:** el reporte del cliente trae el título en la fila 1, los encabezados en la 4
  y notas al pie. Le dices «encabezados en la fila 4, hasta la columna H» y lo lee limpio.
- **Qué mejora:** hoy sólo se elige la hoja. El motor ya acepta fila de encabezado y rango;
  falta pedirlos en la interfaz, recordarlos para la próxima vez y ofrecer unir varias
  hojas.
- **Nota:** la librería `xlsx` 0.18.5 es una versión antigua con fallos conocidos al
  abrir archivos manipulados. **Decidido (2026-10-01): se retira.** Las hojas ya se listan
  con un lector propio y el motor lee los datos; un `.xls` antiguo, cifrado o dañado recibe
  un error claro.
- **Contesta:** 156
- **Depende de:** —

#### C3 · Carpeta de entrada vigilada
`Mejora` · **5.10** · S

- **Para qué sirve:** que el proceso use siempre el archivo más reciente que llegó.
- **Ejemplo:** el cliente deja `ventas_sem38.xlsx` y la semana que viene
  `Ventas Semana 39 FINAL.xlsx`. Con el patrón «ventas*.xlsx», el proceso toma el último sin
  que cambies nada.
- **Qué mejora:** hoy hay que reimportar a mano. La aplicación ya vigila el disco para el
  editor; se reutiliza.
- **Contesta:** 16, 71
- **Depende de:** C1

#### C4 · Lagos y buckets con interfaz
`Mejora` · **5.10** · M

- **Para qué sirve:** conectarse a un lago en Delta o Iceberg, o a un bucket de Parquet,
  sin escribir SQL de conexión.
- **Ejemplo:** eliges la fuente «lago-financiera», ves sus tablas y las cruzas con el Excel
  que te mandaron ayer.
- **Qué mejora:** hoy se puede, instalando la extensión y escribiendo SQL. Aquí la fuente se
  declara, se explora y se consulta como cualquier otra.
- **Contesta:** 97, 157–158
- **Depende de:** A1, C1

#### C5 · Procedencia de lo cargado
`Mejora` · **5.10** · S

- **Para qué sirve:** saber de qué archivo y de qué día salió cada dato.
- **Ejemplo:** el total no cuadra; la tabla te dice «viene de `ventas_sem38.xlsx`, leído el
  lunes a las 7:02».
- **Qué mejora:** hoy lo importado olvida de dónde vino.
- **Contesta:** 18
- **Depende de:** C1

#### C6 · Publicar un archivo
`Nueva` · **5.10** · M

- **Para qué sirve:** que lo que produce un proceso quede disponible para otros, con
  nombre, sin que nadie tenga que abrir la base de quien lo hizo.
- **Ejemplo:** el proceso del ingeniero usa su base de trabajo para los pasos intermedios
  y termina publicando `ventas_limpias.parquet` en la carpeta compartida del cliente. Queda
  registrado en el workspace como la fuente «ventas-limpias». El analista la usa por ese
  nombre en su proceso de Excel, y ve de cuándo es.
- **Qué mejora:** es el puente entre perfiles, y encaja con que manda el archivo. Tres
  garantías: se publica **de golpe** —se escribe con otro nombre y se renombra al final,
  así que nadie lee nunca un archivo a medias—; guarda su **esquema** y avisa si una
  versión nueva lo rompe; y dice su **frescura**. Sustituye a la antigua I2 «tablas
  publicadas», que suponía que el puente era una tabla.
- **Contesta:** 55–56, 140, y la mitad de 22
- **Depende de:** A4, C1

---

### D · Procesos que corren solos

Lo que más piden los usuarios piloto. De archivo a archivo, a la hora que toque.

#### D1 · Programación
`Nueva` · **5.11** · L

- **Para qué sirve:** que un proceso corra solo a una hora.
- **Ejemplo:** «cierre mensual, el primer día hábil de cada mes a las 7:00».
- **Qué mejora:** hoy no existe. **Cómo funciona en local:** AmoxSQL registra una tarea en el
  programador del sistema operativo, que llama a la línea de comandos (A3) aunque la
  aplicación esté cerrada. Si la máquina estaba apagada, al abrir AmoxSQL **se pone al
  día**: corre lo que se perdió y lo dice. El calendario de días hábiles y festivos va por
  workspace.
- **Contesta:** 24–25, 69, 90–91, 96, 126
- **Depende de:** A3, A4, A5, A1

#### D2 · Avisos y bitácora de ejecuciones
`Nueva` · **5.11** · M

- **Para qué sirve:** enterarse de cómo salió cada ejecución sin ir a mirarla.
- **Ejemplo:** a las 7:04 llega un aviso del sistema, «Cierre mensual: 3 archivos leídos,
  1 guardado, 4 s». Si falló, el aviso dice en qué paso y por qué.
- **Qué mejora:** hoy hay historial dentro de Data Flow, pero nadie avisa y no se ve fuera
  del proceso.
- **Contesta:** 27, 93, 163
- **Depende de:** D1

#### D3 · Salida a Excel de verdad
`Mejora` · **5.11** · M

- **Para qué sirve:** que el Excel que sale sea el que espera el cliente.
- **Ejemplo:** el proceso deja un libro con tres hojas —Resumen, Detalle, Notas—,
  encabezados en negrita, columnas con ancho y números con formato. O mejor: rellena **la
  plantilla del cliente**, que ya tiene sus fórmulas y sus gráficos.
- **Qué mejora:** hoy la salida es una sola hoja plana (`COPY … FORMAT xlsx`). Para un
  analista cuyo trabajo empieza y termina en Excel, ésta es la diferencia entre usar el
  resultado y tener que rehacerlo.
- **Contesta:** 154–155, 30
- **Depende de:** —

#### D4 · Parámetros desde fuera y ejecución en lote
`Mejora` · **5.11** · S

- **Para qué sirve:** correr el mismo proceso con otros valores, o con muchos a la vez.
- **Ejemplo:** el reporte semanal, una vez por cada una de las doce tiendas, y cada tienda
  en su archivo.
- **Qué mejora:** los parámetros `{{nombre}}` ya existen; hoy sólo se cambian dentro de la
  aplicación, de uno en uno.
- **Por decidir en su plan:** hoy un parámetro (`${…}` en Data Flow, `{{…}}` en cuadernos y
  decks) es texto que se pega en el SQL. Cuando llegue desde fuera —un formulario (D5), la
  línea de comandos, un lote—, conviene pasarlo como variable de DuckDB
  (`getvariable('region')`): con su tipo y sin forma de colar SQL. La sintaxis de siempre
  se mantiene.
- **Contesta:** 26, 29
- **Depende de:** A3

#### D5 · Correr sin ver SQL
`Mejora` · **5.11** · S

- **Para qué sirve:** que alguien que no escribe SQL pueda lanzar el proceso.
- **Ejemplo:** la jefa de compras abre el proceso, ve un formulario con «Semana» y
  «Tienda», y pulsa **Correr**. No ve ni una línea de código.
- **Qué mejora:** convierte un proceso en una herramienta para otra área. Sale de los
  mismos parámetros que D4.
- **Contesta:** 162
- **Depende de:** D4

#### D6 · Destino de entrega
`Mejora` · **5.11** · S

- **Para qué sirve:** decir una vez dónde se deja el resultado.
- **Ejemplo:** el Excel de salida se guarda siempre en la carpeta compartida del cliente,
  con la fecha en el nombre.
- **Qué mejora:** hoy se exporta a mano cada vez.
- **Contesta:** 30
- **Depende de:** C1

#### D7 · Panel de operación
`Nueva` · **5.11** · M

- **Para qué sirve:** ver en un solo sitio todo lo programado, de todos los workspaces.
- **Ejemplo:** «Hoy: 4 procesos. 3 bien, 1 falló (Financiera, 7:00). Mañana: 2».
  Desde ahí pausas todo antes de irte de vacaciones.
- **Qué mejora:** vive por encima de los proyectos, como el workspace.
- **Contesta:** 92, 95
- **Depende de:** D1, B1

#### D8 · Disparar al llegar un archivo
`Mejora` · **5.11** · S

- **Para qué sirve:** que el proceso corra cuando aparece un archivo nuevo, no a una hora.
- **Ejemplo:** el cliente deja el Excel a las 9:40 en vez de a las 7:00; el proceso lo
  detecta y corre entonces.
- **Qué mejora:** reutiliza la vigilancia de C3. Sólo funciona con la aplicación abierta,
  y eso se dice.
- **Contesta:** 71
- **Depende de:** C3, D1

---

### E · Confianza en los números

#### E1 · Medidas del workspace consultables
`Modificación` · **5.13** · M

- **Para qué sirve:** que una medida definida se pueda **usar**, no sólo leer.
- **Ejemplo:** escribes `SELECT venta_neta(...)` o eliges «Venta neta» en un gráfico, y
  sale siempre calculada igual en todos los proyectos del workspace.
- **Qué mejora:** hoy `metrics.yml` sólo lo lee la IA. **Modificación** porque la capa
  semántica pasa de ser contexto para el modelo a ser algo que ejecuta el motor.
- **Contesta:** 32
- **Depende de:** B2

#### E2 · Contrato de la fuente
`Mejora` · **5.13** · S

- **Para qué sirve:** que el proceso compruebe que el archivo trae lo que debe antes de
  usarlo.
- **Ejemplo:** esta semana el cliente renombró «Importe» a «Monto». El proceso se para y
  avisa, en vez de dejar un Excel con una columna vacía.
- **Qué mejora:** existen Schema Diff y el nodo de validación, pero a mano.
- **Contesta:** 17, 78
- **Depende de:** C1

#### E3 · Reglas de calidad con historial
`Mejora` · **5.13** · M

- **Para qué sirve:** reglas —no nulos, únicos, rangos— que corren en cada ejecución y
  dejan rastro.
- **Ejemplo:** «el total de ventas no puede bajar más de un 30 % respecto a la semana
  pasada». Si pasa, se bloquea la entrega; y puedes ver cómo evolucionaron los nulos en
  tres meses.
- **Qué mejora:** existen los nodos de aserción; falta severidad, reutilización e
  historial.
- **Contesta:** 33, 75–77
- **Depende de:** —

#### E4 · Columnas sensibles
`Nueva` · **5.13** · S

- **Para qué sirve:** marcar datos personales para que no se escapen.
- **Ejemplo:** marcas «RFC» y «Teléfono» como sensibles. No se envían a la IA y en los
  exports salen enmascarados, salvo que digas lo contrario.
- **Qué mejora:** hoy no hay forma de marcarlas.
- **Contesta:** 23, 40, 148
- **Depende de:** B4

#### E5 · Un linaje del proyecto
`Nueva` · **5.13** · L

- **Para qué sirve:** ver de dónde sale cada cosa y qué se rompe si la cambio.
- **Ejemplo:** tocas la consulta de ventas y ves que afecta a dos gráficos, un deck y el
  proceso del lunes.
- **Qué mejora:** hoy hay tres linajes que no se hablan: el de dbt, el de los procesos y el
  del cuaderno.
- **Contesta:** 34–35, 79
- **Depende de:** —

#### E6 · Bitácora de acceso a fuentes
`Nueva` · **5.13** · S

- **Para qué sirve:** saber qué fuentes externas se leyeron, cuándo y desde qué proceso.
- **Ejemplo:** «bucket-financiera: 14 lecturas esta semana, la última del proceso de
  cierre, el lunes a las 7:00».
- **Qué mejora:** las fuentes con nombre (C1) dicen qué hay; esto dice qué se usó. Venía de
  la antigua familia I.
- **Contesta:** 62
- **Depende de:** C1

---

### F · Entregar y recordar

#### F1 · Bitácora de entregas
`Nueva` · **5.14** · S

- **Para qué sirve:** saber qué se le mandó a cada cliente, qué versión y cuándo.
- **Ejemplo:** «Tiendas del Norte, reporte semanal v38, entregado el lunes 7:04 en la
  carpeta compartida».
- **Qué mejora:** hoy lo exportado no deja rastro. Las ejecuciones programadas (D1) la
  alimentan solas.
- **Contesta:** 10, 41
- **Depende de:** A5

#### F2 · Ficha del proyecto
`Nueva` · **5.14** · S

- **Para qué sirve:** contactos, alcance, decisiones y notas de traspaso del proyecto, en un
  solo documento.
- **Ejemplo:** un markdown con plantilla que se crea con el proyecto: quién pidió qué,
  cuándo cambió el alcance y qué tiene que saber quien lo herede.
- **Qué mejora:** hoy eso vive en la cabeza de quien lo lleva, o en el correo.
- **Contesta:** 12–13, 88
- **Depende de:** —

#### F3 · Instantáneas y comparar
`Mejora` · **5.14** · M

- **Para qué sirve:** guardar el resultado de cada entrega y compararlo con otro.
- **Ejemplo:** «¿Por qué la venta de marzo cambió entre el reporte de abril y el de mayo?».
  Se comparan las dos instantáneas.
- **Qué mejora:** `CompareResults` ya compara dos resultados, pero sólo dentro de la
  sesión.
- **Contesta:** 28, 43
- **Depende de:** F1

#### F4 · Fecha de los datos en lo que se entrega
`Mejora` · **5.14** · S

- **Para qué sirve:** que cualquier gráfico o reporte diga de cuándo son sus datos.
- **Ejemplo:** el pie de la lámina dice «Datos al 22 de septiembre».
- **Qué mejora:** el Studio ya conoce la frescura de su figura; se extiende a todo lo que
  se exporta.
- **Contesta:** 36
- **Depende de:** —

#### F5 · Retomar
`Mejora` · **5.14** · S

- **Para qué sirve:** al abrir un proyecto, saber dónde lo dejaste.
- **Ejemplo:** «Tenías 3 pestañas abiertas, 2 tareas pendientes y una entrega el jueves. El
  proceso de anoche falló».
- **Qué mejora:** hoy vuelven las pestañas; lo demás hay que buscarlo.
- **Contesta:** 5
- **Depende de:** F1, D2

#### F6 · Registro de tiempo
`Nueva` · **pendiente de decidir** · S

- **Para qué sirve:** saber cuántas horas se le dedicaron a cada workspace.
- **Ejemplo:** «Septiembre: Tiendas del Norte 22 h, Financiera 9 h», sacado de las sesiones
  con sus proyectos abiertos.
- **Qué mejora:** útil para facturar, invasivo si se activa sin preguntar. Si entra, lo
  hace **apagado por defecto** y se enciende por workspace.
- **Contesta:** 9, 14
- **Depende de:** B1

---

### G · Compartir y heredar

#### G1 · Biblioteca en tres niveles
`Modificación` · **5.15** · S

- **Para qué sirve:** que tus consultas, snippets y plantillas te acompañen.
- **Ejemplo:** tu consulta favorita para limpiar fechas está en **tu** biblioteca y aparece
  en todos tus proyectos; la que calcula la venta neta está en la del **workspace**.
- **Qué mejora:** hoy los snippets viven en `<proyecto>/.amox/snippets.json` y cada proyecto
  empieza vacío. **Modificación** porque cambia dónde se guardan: niveles personal,
  workspace y proyecto.
- **Contesta:** 46, 48–49, 111
- **Depende de:** B1

#### G2 · Proyecto desde plantilla
`Mejora` · **5.15** · S

- **Para qué sirve:** empezar un proyecto nuevo con la estructura de uno que ya funciona.
- **Ejemplo:** «nuevo proyecto de cierre mensual» trae sus carpetas, sus procesos y sus
  entregables. Sin datos.
- **Qué mejora:** el asistente de hoy crea carpetas vacías.
- **Contesta:** 7, 144
- **Depende de:** —

#### G3 · Paquete de proyecto
`Nueva` · **5.15** · M

- **Para qué sirve:** pasar un proyecto entero cuando git no es opción.
- **Ejemplo:** exportas el proyecto a un archivo, con los datos o sin ellos, y **nunca** con
  credenciales. Quien lo abre ve el manifiesto (A2) y sabe qué le falta.
- **Qué mejora:** hoy sólo existe git, y git no se lleva los datos.
- **Contesta:** 38, 86, 120, 138
- **Depende de:** A2

#### G4 · Receta de reconstrucción
`Nueva` · **5.15** · M

- **Para qué sirve:** que quien clona el proyecto pueda rehacer los datos con un gesto.
- **Ejemplo:** «Reconstruir» corre, en orden, las cargas que dejan la base como estaba.
- **Qué mejora:** el `.gitignore` excluye `*.duckdb` —bien hecho—, pero no deja receta.
  Importa menos ahora que la base es la excepción.
- **Contesta:** 85
- **Depende de:** —

#### G5 · Comentarios anclados
`Nueva` · **5.15** · M

- **Para qué sirve:** dejar dudas o notas pegadas a una celda, un paso del proceso o una
  lámina.
- **Ejemplo:** «¿Esta cifra incluye devoluciones?» queda en la celda. Tu colega la ve al
  abrir el proyecto y contesta ahí.
- **Qué mejora:** se guardan como texto junto al archivo, así que viajan con git y con el
  paquete. Es colaboración **asíncrona**, que es la que tiene sentido en local.
- **Contesta:** 37, 141
- **Depende de:** —

---

### H · Operar la máquina

#### H1 · Recursos para lo que corre de fondo
`Mejora` · **5.16** · S

- **Para qué sirve:** que un proceso programado no congele la máquina mientras trabajas.
- **Ejemplo:** los procesos de fondo usan como mucho 2 hilos y 4 GB.
- **Qué mejora:** el motor ya permite limitarlo; no se hace.
- **Contesta:** 74, 147
- **Depende de:** A3

#### H2 · Almacenamiento por workspace y proyecto
`Nueva` · **5.16** · S

- **Para qué sirve:** ver cuánto disco ocupa cada cosa y limpiar.
- **Ejemplo:** «Financiera: 4,2 GB, de los que 3,8 son exports antiguos».
- **Qué mejora:** con procesos que corren solos y dejan archivos, el disco se llena sin que
  nadie lo note.
- **Contesta:** 150
- **Depende de:** B1

#### H3 · Cierre de proyecto
`Nueva` · **5.16** · S

- **Para qué sirve:** terminar un proyecto limpiamente cuando acaba el contrato.
- **Ejemplo:** se conserva el código, se borran los datos del cliente, se desactivan sus
  procesos programados y queda constancia de todo.
- **Qué mejora:** hoy terminar un proyecto es simplemente dejar de abrirlo.
- **Contesta:** 64
- **Depende de:** D1

#### H4 · Confinar y cifrar
`Mejora` · **5.16** · S

- **Para qué sirve:** que un proyecto no escriba fuera de su carpeta, y que su base esté
  cifrada.
- **Ejemplo:** el proyecto del hospital está confinado y su base cifrada, con la clave en
  el llavero.
- **Qué mejora:** el motor ya trae las dos cosas; la aplicación no las expone.
- **Contesta:** 63, 65
- **Depende de:** A1

---

### I · El ingeniero de datos: dbt y DuckLake

**Rehecha el 2026-10-01, con el autor.** La versión anterior proponía construir dentro de
AmoxSQL lo que un ingeniero de datos ya tiene en dbt: cargas incrementales, dependencias,
entornos, instantáneas, frescura, capas. El ingeniero prefiere dbt, y con razón. Así que la
familia deja de reconstruirlo y pasa a **integrar dbt y DuckLake a fondo**.

**La frontera queda decidida** (era la antigua I13):

- **dbt** es para el ingeniero: transformar datos que viven en bases y lagos, con SQL
  versionado, tests y documentación.
- **Data Flow** es para el analista: procesos de archivo a archivo, sin escribir SQL.
- **El puente** son las fuentes con nombre (C1), que dbt recibe como `sources` (I7), y
  publicar un archivo (C6).

Llega en la **5.12.0**, adelantada (ver *La numeración*). I1 llega antes, con la 5.10.0.

Lo que había hoy, leyendo la 5.9.0: detectar el entorno de dbt, crear el proyecto y su
`profiles.yml`, plantillas de modelo, fuente, test y macro, armar y ejecutar comandos con
la salida en vivo, y el linaje y el autocompletado leídos del `manifest.json`. Lo que
faltaba es lo de la tabla.

| ID | Candidato | Tipo | Tamaño | Para qué sirve, con un ejemplo | Contesta |
|---|---|---|---|---|---|
| I1 | **Convivir sin bloqueos** | Mejora | S | Pulsas `dbt build`: AmoxSQL suelta la base, dbt escribe y AmoxSQL la vuelve a abrir sola. Con DuckLake sobre un catálogo SQLite, los dos podrían escribir a la vez (se comprueba antes). **Llega con la 5.10.0** | 84, 89 |
| I2 | **dbt dentro del editor** | Mejora | M | Abres `stg_ventas.sql` y ves su SQL compilado; «Preview» lo ejecuta sin materializar (`dbt show`); «Run +stg_ventas» corre el modelo y sus dependencias | 83, 89 |
| I3 | **Resultados en el linaje** | Mejora | M | El grafo pinta cada modelo en verde o rojo con su duración y sus filas (`run_results.json`). Un test que falla lleva a las filas que lo rompen (`store_failures`). Absorbe la antigua «dónde se va el tiempo» | 73, 98 |
| I4 | **Entornos con los targets de dbt** | Mejora | S | `dev` y `prod` del mismo proyecto; con `prod` activo, «PRODUCCIÓN» en rojo en la barra y confirmación antes de escribir | 51–53, 84 |
| I5 | **Catálogo y documentación** | Mejora | S | Las descripciones de modelos y columnas de dbt (`catalog.json`, `manifest.json`) en el explorador de base, y para el asistente | 34, 89 |
| I6 | **Promover a modelo dbt** | Mejora | M | Una consulta o una celda de cuaderno se convierte en `models/marts/ventas_semanales.sql`, con sus `ref()` y `source()` puestos | 57, 139 |
| I7 | **Las fuentes de AmoxSQL como sources de dbt** | Nueva | S | «ventas-semanales» (C1) se escribe sola en `sources.yml` con su ubicación en esta máquina, y `dbt source freshness` dice si el Excel tiene más de 7 días. Absorbe la antigua «frescura de lo materializado» | 22, 99 |
| I8 | **DuckLake de primera clase** | Mejora | M | Crear un lago desde la interfaz (catálogo local + carpeta de datos), ver sus *snapshots*, consultar «como estaba ayer» y el mantenimiento (compactar archivos, expirar versiones). Absorbe la antigua «instantáneas del lago» | 80–81, 97 |
| I9 | **Incrementales y snapshots, explicados** | Mejora | S | Plantillas de un modelo incremental que sólo procesa lo nuevo y de un *snapshot* que guarda el historial de cambios. Absorbe la antigua «carga incremental» | 66 |
| I10 | **Programar dbt** | Mejora | S | Con la programación de D1: «`dbt build` cada noche a las 2:00», y desde la línea de comandos `AmoxSQL.exe dbt build --project …`, con aviso (D2) si falla un test. Absorbe la antigua «dependencias entre procesos»: el orden lo pone el grafo de dbt | 70 |
| I11 | **Capas desde el inicio** | Mejora | S | Crear un proyecto dbt trae `staging/`, `intermediate/` y `marts/`, con un ejemplo de cada una | 54 |

**Qué pasó con la lista anterior:** carga incremental, dependencias, instantáneas del lago,
tiempos, frescura, capas y entornos quedan absorbidos por dbt y DuckLake (arriba). Las
«tablas publicadas» ya las había absorbido C6. El diff legible de procesos y los reintentos
por nodo son de Data Flow: pasan a **J** (J9, J10). La bitácora de acceso a fuentes pasa a
**E** (E6), junto a la confianza en los números.

---

### J · Mejoras sueltas

Pequeñas, útiles y sin familia: no sostienen la frase de §1, pero ninguna necesita Python.
Todas van en la 5.17.0.

| ID | Candidato | Tipo | Tamaño | Para qué sirve, con un ejemplo | Contesta |
|---|---|---|---|---|---|
| J1 | **Mirar otro proyecto del mismo workspace** | Mejora | S | Adjuntar en sólo lectura los datos de un proyecto hermano para cruzarlos, sin cerrar el tuyo | 2 |
| J2 | **Perfil con distribuciones** | Mejora | S | Además del resumen, histogramas, correlaciones y valores atípicos de cada columna | 109, 114 |
| J3 | **Muestreo con semilla** | Mejora | S | «Dame el 10 %, siempre el mismo». El motor ya lo hace; falta en la interfaz | 110 |
| J4 | **Skills de análisis** | Nueva | S | Estadística, revisión de metodología y propuesta de variables para el asistente. Son archivos markdown, como las de hoy | 115, 133–134 |
| J5 | **Mapas en Story Flow** | Mejora | M | Dibujar por región o por punto lo que la extensión espacial ya sabe leer | 116 |
| J6 | **Cuaderno limpio para entregar** | Mejora | S | Marcar celdas como borrador y dejarlas fuera del export | 131 |
| J7 | **HTML interactivo** | Mejora | M | Un informe que el cliente abre en el navegador con filtros sobre los datos incrustados | 39 |
| J8 | **Historial por celda** | Mejora | M | Quién cambió esta celda y cuándo, leído de git y enseñado donde está la celda | 142 |
| J9 | **Diff legible de procesos** | Mejora | S | Ver qué nodos de un `.sqlchain` se añadieron o cambiaron, sin leer JSON. Venía de la antigua I | 83 |
| J10 | **Reintentos por nodo** | Mejora | S | «Si la API falla, reintenta 3 veces cada 30 s». Primero hay que verificar qué hace hoy el nodo HTTP. Venía de la antigua I | 68 |

---

### K · Python, y lo que queda fuera

| Candidato | Versión | Por qué | Contestaría |
|---|---|---|---|
| **Python**: celdas o puente | 6.0 | Decisión del autor. Con él llegan también la puntuación de modelos, el seguimiento de su degradación y las figuras de importancia | 101–108, 112, 125, 127–129, 132, 145–146 |
| **Registro de experimentos** | 6.0, con Python | Sin Python pierde casi todo su sentido | 113, 117–124, 136–137, 149 |
| **R** | Fuera | Decisión del autor | 105 |
| **Enviar por correo** | Fuera | Exige credenciales de correo; basta con dejar el resultado en su destino (D6) | 31 |
| **Colaboración en tiempo real** | Fuera | Choca con «sin servidor» y con el escritor único. La colaboración es asíncrona (G5) | 143 |

### Las que no necesitan candidato

Cinco preguntas ya tienen buena respuesta hoy, y lo correcto es no tocarlas: **42**
(entregar los datos limpios), **45** (la IA aislada por proyecto), **67** (reanudar una
carga que falló), **82** (todo es texto versionable) y **130** (de Story Flow a Report
Flow).

---

## 5. Índice

| ID | Candidato | Tipo | Versión | Tamaño |
|---|---|---|---|---|
| A1 | Llavero de credenciales | Modificación | 5.9 | M |
| A2 | Manifiesto del proyecto | Mejora | 5.9 | S |
| A3 | Línea de comandos | Nueva | 5.9 | M |
| A4 | Ejecuciones aisladas | Modificación | 5.9 | M |
| A5 | La base de AmoxSQL | Nueva | 5.9 | M |
| B1 | Crear workspaces y asignar proyectos | Nueva | 5.9 | M |
| B2 | Contexto del workspace, sin abrir proyecto | Modificación | 5.9 | M |
| B3 | Inicio por workspace | Nueva | 5.9 | M |
| B4 | Política de IA por workspace | Nueva | 5.9 | S |
| B5 | Marca del workspace | Mejora | 5.9 | S |
| B6 | Exportar e importar un workspace | Nueva | 5.9 | S |
| B7 | Project en toda la interfaz | Modificación | 5.9 | S |
| B8 | La palabra la eliges tú | Nueva | 5.9 | S |
| C1 | Fuentes con nombre | Nueva | 5.10 | M |
| C2 | Excel de entrada sin limpiarlo a mano | Mejora | 5.10 | S |
| C3 | Carpeta de entrada vigilada | Mejora | 5.10 | S |
| C4 | Lagos y buckets con interfaz | Mejora | 5.10 | M |
| C5 | Procedencia de lo cargado | Mejora | 5.10 | S |
| C6 | Publicar un archivo | Nueva | 5.10 | M |
| D1 | Programación | Nueva | 5.11 | L |
| D2 | Avisos y bitácora de ejecuciones | Nueva | 5.11 | M |
| D3 | Salida a Excel de verdad | Mejora | 5.11 | M |
| D4 | Parámetros desde fuera y ejecución en lote | Mejora | 5.11 | S |
| D5 | Correr sin ver SQL | Mejora | 5.11 | S |
| D6 | Destino de entrega | Mejora | 5.11 | S |
| D7 | Panel de operación | Nueva | 5.11 | M |
| D8 | Disparar al llegar un archivo | Mejora | 5.11 | S |
| E1 | Medidas del workspace consultables | Modificación | 5.13 | M |
| E2 | Contrato de la fuente | Mejora | 5.13 | S |
| E3 | Reglas de calidad con historial | Mejora | 5.13 | M |
| E4 | Columnas sensibles | Nueva | 5.13 | S |
| E5 | Un linaje del proyecto | Nueva | 5.13 | L |
| E6 | Bitácora de acceso a fuentes | Nueva | 5.13 | S |
| F1 | Bitácora de entregas | Nueva | 5.14 | S |
| F2 | Ficha del proyecto | Nueva | 5.14 | S |
| F3 | Instantáneas y comparar | Mejora | 5.14 | M |
| F4 | Fecha de los datos en lo que se entrega | Mejora | 5.14 | S |
| F5 | Retomar | Mejora | 5.14 | S |
| F6 | Registro de tiempo | Nueva | pendiente | S |
| G1 | Biblioteca en tres niveles | Modificación | 5.15 | S |
| G2 | Proyecto desde plantilla | Mejora | 5.15 | S |
| G3 | Paquete de proyecto | Nueva | 5.15 | M |
| G4 | Receta de reconstrucción | Nueva | 5.15 | M |
| G5 | Comentarios anclados | Nueva | 5.15 | M |
| H1 | Recursos para lo que corre de fondo | Mejora | 5.16 | S |
| H2 | Almacenamiento por workspace y proyecto | Nueva | 5.16 | S |
| H3 | Cierre de proyecto | Nueva | 5.16 | S |
| H4 | Confinar y cifrar | Mejora | 5.16 | S |
| I1 | Convivir sin bloqueos (dbt) | Mejora | 5.10 | S |
| I2–I11 | El ingeniero de datos: dbt y DuckLake | — | 5.12 | — |
| J1–J10 | Mejoras sueltas | — | 5.17 | — |
| K | Python y experimentos; R, correo y tiempo real quedan fuera | — | 6.0 | — |

## 6. El orden que imponen las dependencias

Cuatro cadenas. La **5.9.0** son los cimientos y la cadena del workspace; la de datos es la
**5.10.0** y la de procesos, la **5.11.0**; Excel se reparte entre las dos (C2 en la 5.10.0,
D3 en la 5.11.0). La del ingeniero —dbt y DuckLake— va justo detrás, en la **5.12.0**, porque
se apoya en las fuentes (C1) y en la programación (D1). El orden fino de la 5.9.0, con sus prereleases, está en el
[plan](plan_v6_cimientos_y_workspaces.md). Las raíces —**A5**, **A4** y **A1**— no se ven,
pero sin ellas nada corre solo; B7 es la otra raíz silenciosa: sin ella, *workspace*
significaría dos cosas a la vez.

```
Excel      C2 Excel de entrada ──┐
                                 ├──►  útil sin nada más
           D3 Salida a Excel ────┘

Procesos   A4 Ejecuciones aisladas ──► A3 Línea de comandos ──┐
           A5 La base de AmoxSQL ─────────────────────────────┴──► D1 Programación ──► D2 Avisos ──► D7 Panel

Datos      A1 Llavero ───┐
           B1 Workspace ─┴──► C1 Fuentes con nombre ──┬──► C3 Carpeta vigilada
                                                      ├──► C4 Lagos y buckets
           A4 ────────────────────────────────────────┴──► C6 Publicar un archivo

Workspace  B7 Project en la interfaz ──┐
           A5 La base de AmoxSQL ──────┴──► B1 Crear workspaces ──► B2 Contexto ──► E1 Medidas consultables
                                                 ├──► B3 Inicio · B4 Política de IA · B5 Marca · B8 La palabra · G1 Biblioteca
                                                 └──► B6 Exportar un workspace (necesita A1)
```

**Se empieza por A y B**, decisión del autor. Esta sección recomendaba antes empezar por
C2 y D3 porque no dependen de nada; siguen siendo lo más rápido de entregar a los pilotos
en cuanto salga la 5.9.0, y por eso van primero dentro de sus versiones.
