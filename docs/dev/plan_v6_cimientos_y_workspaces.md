# Plan de implementación — 5.9.0: cimientos y workspaces

> Las familias **A** (cimientos: A1–A5) y **B** (el workspace: B1–B8) de
> [`candidatos_v6.md`](candidatos_v6.md), en fases, con la numeración de versiones que
> lleva de la 5.8.0 a la **5.9.0**: el primer tramo del camino a la 6.0.0, que se cierra
> con la familia K. Hecho leyendo el código de la 5.8.0, no
> suponiéndolo: cada decisión cita lo que encontró. Fecha: 2026-09-29.

---

## 1. Dónde cae este plan en el camino a la 6.0

La **6.0.0 es el cierre de todo** lo que salió de la auditoría: las familias de la A a la K
de [`candidatos_v6.md`](candidatos_v6.md). Cada familia es una versión menor, en orden
alfabético, y la K cierra la 6.

Ese orden no es sólo cómodo: es el de las dependencias. De las 46 que declaran los
candidatos, **ninguna apunta a una familia posterior**, así que cada versión se construye
sobre las anteriores y nunca espera a una siguiente.

| Versión | Familia | Qué trae |
|---|---|---|
| **5.9.0** | **A + B** | Cimientos y workspaces — **este plan** |
| 5.10.0 | C | Los datos donde están |
| 5.11.0 | D | Procesos que corren solos, con la programación |
| 5.12.0 | E | Confianza en los números |
| 5.13.0 | F | Entregar y recordar |
| 5.14.0 | G | Compartir y heredar |
| 5.15.0 | H | Operar la máquina |
| 5.16.0 | I | Para el ingeniero de datos |
| 5.17.0 | J | Mejoras sueltas |
| **6.0.0** | **K** | Python y experimentos. Cierra la 6 |

Así el número dice qué familia se cerró. La tesis de la 6 —«workspaces gobernados por
AmoxSQL, y procesos de archivo a archivo que corren solos»— llega entera en la 5.11.0: la
primera mitad aquí, la segunda con C y D.

**Una consecuencia que hay que asumir a sabiendas.** La 5.9 lleva dos cambios que no se
deshacen solos: *workspace* cambia de significado (B7) y los secretos salen del texto plano
(A1). En una librería eso pediría un número mayor. En una aplicación de escritorio se
resuelve con un aviso claro en el primer arranque y en las notas del release, y así la 6.0
queda reservada para cuando esté todo.

## 2. La numeración de este tramo

| Hito | Versión | Qué lleva | Cómo se publica |
|---|---|---|---|
| Antes de empezar | **5.8.1** | El arreglo de las viñetas que se pintaban como casillas | Release normal: Drive + GitHub, queda como *Latest* |
| Fin de la familia A | **5.9.0-alpha.1** | A5, A1, A2, A4, A3 | *Prerelease* |
| B7 + B1 + B8 | **5.9.0-alpha.2** | La palabra cambia, los workspaces existen | *Prerelease* |
| B2 + B4 + B5 | **5.9.0-alpha.3** | Lo que el workspace aporta | *Prerelease* |
| B3 + B6 | **5.9.0-beta.1** | Completo: a partir de aquí sólo arreglos | *Prerelease* |
| Arreglos | **5.9.0-beta.N** | Sólo correcciones | *Prerelease* |
| Cierre | **5.9.0** | Lo mismo que la última beta, más la purga de secretos en texto plano | Release normal: Drive + GitHub, pasa a ser *Latest* |

Las familias siguientes repiten el mismo esquema con su número: `5.10.0-alpha.1` …
`5.10.0`, y así hasta `6.0.0-alpha.1` … `6.0.0`.

### Reglas

1. **El número vive en cuatro sitios** y los cuatro se mueven juntos, siempre en una rama
   `release/v<versión>` con su PR (ver la memoria del proceso de release): `package.json`
   de la raíz, `client/package.json`, la línea `Version` de `CLAUDE.md` y una entrada en
   `CHANGELOG.md`.
2. **Las prereleases se publican con `gh release create … --prerelease`.** Así el enlace
   `/releases/latest` del README sigue apuntando a la 5.8.1 hasta que exista la 5.9.0.
   En Drive van a una subcarpeta aparte, `G:\My Drive\amoxsql\prerelease\`, para que nadie
   instale una alfa creyendo que es la estable.
3. **`main` es la línea 5.9 desde el primer merge de la fase 1.** Si hiciera falta un
   arreglo para la 5.8, se abre `release/5.8.x` desde el tag `v5.8.1`, se publica la 5.8.2
   desde ahí y el arreglo se lleva también a `main`.
4. **El CHANGELOG** lleva una entrada por prerelease (`## [5.9.0-alpha.1] — fecha`), y la
   5.9.0 abre con una entrada consolidada que resume todas, para quien salta desde la 5.8.
5. **electron-builder acepta versiones con sufijo.** El truco de compilar con
   `5.0.2-beta.3` ya se usó en la 5.1.0; el instalador sale como
   `AmoxSQL Setup 5.9.0-alpha.1.exe`.
6. **La 5.10 va después de la 5.9.** Como número, sin duda; pero ordenado por nombre, como
   lo hace Drive, `5.10.0` aparece **antes** que `5.9.0`. En esa carpeta se ordena por
   fecha.

### Convivir con la 5.8 mientras dura el camino

El autor va a instalar alfas en la misma máquina donde usa la 5.8. Eso tiene que ser
seguro, y lo es porque cada cambio se hace de forma que la 5.8 no se entere:

| Qué toca la 5.9 | Si luego se abre la 5.8… | Cómo se consigue |
|---|---|---|
| `~/.amoxsql/config.json` | Funciona igual | Durante las prereleases los secretos se **copian** al llavero y el texto plano **no se toca**. La purga es sólo en la 5.9.0 (fase 9) |
| `project.json` | Conserva `workspace` y `requiere` | `saveProjectConfig` ya lee y fusiona (`{ ...existing, ...updates }`): la 5.8 no borra claves que no conoce |
| `.sqlchain` con `config.base` | **Por verificar**: el ejecutor lee `node.config` y no debería mirar esa clave | Se prueba en la fase 3 abriendo con la 5.8 una cadena guardada por la 5.9 |
| La base central | No la ve | Es un archivo nuevo que la 5.8 no conoce |
| El historial de Data Flow | Las ejecuciones hechas con la 5.9 no aparecen | Aceptado: el historial viejo sigue en su sitio y la 5.9 lo muestra como anterior |

Después de la 5.9.0, volver a la 5.8 obliga a reintroducir las claves. Lo dirán las notas
del release.

---

## 3. Lo que el código ya da

Esto es lo que se encontró leyendo la 5.8.0, y abarata o condiciona el plan:

| Hallazgo | Dónde | Consecuencia |
|---|---|---|
| Data Flow recibe la base **como parámetro** | `chainExecutor.run(dbManager, definicion, ROOT_DIR, …)` en `server/index.js` | Aislar una ejecución es pasarle otra conexión, no reescribir el ejecutor |
| Y de esa base sólo usa **dos métodos** | `query` (86 llamadas) y `systemQuery` (12) en `ChainExecutor.js` y `ChainPersistence.js` | La conexión aislada sólo tiene que implementar esos dos |
| El historial también recibe la base | `ChainPersistence.initSchema(dbManager)` | Se redirige a la base central sin tocar su lógica |
| `DatabaseManager` es una instancia en memoria que **adjunta** el archivo del proyecto | `DuckDBInstance.create(':memory:')` + `ATTACH` | El mismo patrón sirve para la base central y para las bases de trabajo |
| Todos los secretos pasan por un solo sitio | `AiManager` lee y escribe `config.json` (`geminiApiKey`, `anthropicApiKey`, `minimaxApiKey`); `s3Config`, `gcsConfig` y `gsheets` en `index.js` | A1 tiene un único punto por donde entrar |
| Las claves de nube se fijan con `SET` **global**, interpolando el valor en el SQL | `index.js`, hacia las líneas 1607 y 1641 | Hay que sustituirlo por `CREATE SECRET` con `SCOPE` y escapar los valores |
| La instancia única descarta los argumentos del segundo arranque | `app.on('second-instance', () => …)` sólo enfoca la ventana | Electron permite pasarle datos (`requestSingleInstanceLock(additionalData)`): es la cola que necesita la línea de comandos |
| El servidor y el proceso principal ya se hablan por mensajes | `parentPort`: `start`, `ready`, `error` | El llavero, que sólo existe en el proceso principal, se pide por ese canal |
| `project.json` se fusiona al escribir | `saveProjectConfig` | Enlazar un proyecto a un workspace es añadir una clave, y la 5.8 no la pierde |
| Contexto, reglas y skills de la IA se cargan **desde una ruta** | `loadProjectContext(ruta)`, `loadUserRules(ruta)`, `readSkillsDir(dir)` | B2 es llamarlos dos veces (workspace y proyecto) y fusionar. Las skills ya fusionan dos niveles |
| «Workspace» significa hoy *proyecto* en la interfaz | 14 textos en `client/src`; 35 menciones en 13 páginas de `docs/` | B7 es acotado, pero incluye la documentación de usuario |

---

## 4. Las decisiones que fija este plan

Llevan el prefijo **Dec-** para no confundirlas con los candidatos de la familia D
(D1 es la programación, no una decisión).

**Dec-1 · Un solo proceso de AmoxSQL, siempre.** La instancia única ya garantiza que nunca
corren dos. La 5.9 la aprovecha como cola: una ejecución lanzada desde la línea de comandos
se **entrega** a la aplicación si está abierta, y si no lo está, ese mismo arranque corre
sin ventana. Como sólo hay un proceso, es el único dueño de la base central y de cualquier
base que abra. Esto sustituye a la «bandeja» que proponía `candidatos_v6.md` (A5): con un
solo proceso no hace falta.

**Dec-2 · La línea de comandos es el mismo ejecutable, no un script aparte.** Por dos
razones que no dejan elección. El módulo nativo de DuckDB se recompila para el Node de
Electron (`postinstall`), así que un `node` suelto no lo carga. Y el llavero
(`safeStorage`) sólo existe dentro de Electron. Por eso se invoca como
`AmoxSQL.exe run …`.

**Dec-3 · Los secretos se cifran con el llavero del sistema y se guardan cifrados en la base
central.** El proceso principal cifra y descifra con `safeStorage` (DPAPI en Windows,
Keychain en macOS); el servidor se lo pide por `parentPort`. En DuckDB se crean siempre
como secretos **temporales**: `CREATE PERSISTENT SECRET` los escribe en claro en disco y
está prohibido.

**Dec-4 · La conexión aislada implementa `query` y `systemQuery`** sobre su propia
`DuckDBInstance`, y el ejecutor no sabe la diferencia.

**Dec-5 · Lo que escribe una persona es texto; lo que registra la máquina va a la base.**
El workspace guarda sus metadatos en la base central y su contexto (medidas, glosario,
documentos, reglas, skills) como archivos en `<home>/workspaces/<id>/`.

**Dec-6 · B7 cambia sólo lo que se ve.** Nombres de componentes (`WorkspaceWizard`), eventos
(`amox_open_workspace_wizard`) y claves de `localStorage` se quedan como están: renombrarlos
no le da nada al usuario y sí le da riesgo al código.

**Dec-7 · `AMOXSQL_HOME`.** Todo lo que hoy cuelga de `~/.amoxsql` pasa por una función que
respeta esa variable de entorno. Las pruebas la apuntan **siempre** a una carpeta temporal.
Así ninguna prueba, ni ninguna alfa lanzada en desarrollo, migra la configuración real del
autor.

---

## 5. Las fases

Cada fase dice qué se hace, cómo se comprueba y qué tiene que ser cierto para darla por
cerrada. Las pruebas siguen la costumbre de la casa: `scripts/probar*.mjs` contra carpetas
temporales, nunca contra proyectos reales, y además un recorrido en la aplicación.

### Fase 0 · Preparar el terreno → **5.8.1**

| # | Tarea | Detalle |
|---|---|---|
| 0.1 | Publicar la 5.8.1 | La rama `claude/vinetas-no-son-tareas` ya tiene el arreglo y su prueba (`client/scripts/probarVinetasDeTarea.mjs`, 12/12). Bump, `pnpm dist`, Drive, GitHub. Es lo último que sale de la línea 5.8 |
| 0.2 | `AMOXSQL_HOME` (Dec-7) | Una función `homeAmox()` en `server/rutas.js`. Sustituye cada `path.join(os.homedir(), '.amoxsql')`, empezando por `AiManager.js:43` |
| 0.3 | Prueba de concepto: la instancia única como cola | En una rama aparte, sin llegar a `main`: `requestSingleInstanceLock(datos)`, recibir los datos en `second-instance`, arrancar sin ventana y abrir la interfaz mientras corre sin ventana. **Y comprobar dos cosas de Windows**: si el ejecutable, que es de subsistema gráfico, escribe en la consola que lo lanzó, y si el programador de tareas recibe su código de salida |
| 0.4 | Prueba de concepto: el llavero desde el servidor | Petición y respuesta por `parentPort` con identificador; `safeStorage.isEncryptionAvailable()`; comprobar que lo cifrado sólo lo descifra ese usuario |

**Cerrada cuando:** la 5.8.1 está publicada, y las dos pruebas de concepto están escritas
en la bitácora (§8) con su resultado. Si `additionalData` no se comporta como se espera, el
plan B de Dec-1 está escrito antes de la fase 4: la aplicación abierta escribe su puerto en
`<home>/puerto` y la línea de comandos le habla por HTTP local.

### Fase 1 · La base de AmoxSQL (A5)

| # | Tarea | Detalle |
|---|---|---|
| 1.1 | `server/central/BaseCentral.js` | Abre `<home>/amoxsql.duckdb` en su propia `DuckDBInstance`, con `query` y `systemQuery`. Se abre al arrancar el servidor, y al cerrar hace `CHECKPOINT` desde `shutdownServer` |
| 1.2 | Migraciones con versión | `server/central/migraciones/001_inicial.js`, …; tabla `meta(clave, valor)` con la versión del esquema; se aplican en orden y en transacción. Si la base tiene una versión **mayor** que la que entiende el programa (una beta que abre una base de una beta posterior), se niega con un mensaje claro en vez de estropearla |
| 1.3 | El esquema de la 5.9 entero, de una vez | `workspaces`, `proyectos` (ruta, id, workspace, estado, entrega, último abierto), `credenciales` (nombre, tipo, cifrado, creada, último uso), `ejecuciones` (proceso, proyecto, workspace, origen, inicio, fin, estado, error, parámetros), `preferencias`. Crearlo entero ahora evita cinco migraciones seguidas; las familias siguientes añaden sus tablas con migraciones nuevas |
| 1.4 | Los recientes pasan a `proyectos` | Viven en el `localStorage` del renderer (`amoxsql-recent-projects`), no en `config.json`: el servidor no puede leerlos, así que **el cliente los manda una vez** al arrancar (`POST /api/central/recientes`) y la base anota que ya lo hizo. El `localStorage` no se vacía: la 5.8 lo sigue leyendo |
| 1.5 | Arrancar sin sorpresas | Al abrir, las ejecuciones que se quedaron «en curso» se marcan «interrumpida» |
| 1.6 | `/api/central/estado` | Ruta y versión del esquema, para diagnosticar |

**Se comprueba con** `scripts/probarBaseCentral.mjs` sobre un `AMOXSQL_HOME` temporal: se
crea, se migra, se reabre sin repetir migraciones, se niega ante una versión mayor, importa
los recientes y marca las interrumpidas. En la aplicación: abrir, cerrar, reabrir, y los
recientes siguen ahí.

**Cerrada cuando:** la prueba pasa y la 5.8 abre la misma máquina sin notar nada.

### Fase 2 · El llavero (A1) y el manifiesto (A2)

| # | Tarea | Detalle |
|---|---|---|
| 2.1 | `server/secretos.js` | `guardar(nombre, tipo, valor)`, `obtener(nombre)`, `listar()`, `borrar(nombre)`. Lo cifrado va a `credenciales`. Sin Electron —pruebas, servidor suelto— usa un proveedor **en memoria** que nunca escribe el valor en disco |
| 2.2 | El puente | Mensajes `secreto:cifrar` y `secreto:descifrar` entre servidor y proceso principal, con identificador de petición y tiempo límite |
| 2.3 | La IA | `AiManager` pide `gemini`, `anthropic` y `minimax` a `secretos`. La variable de entorno sigue valiendo como alternativa |
| 2.4 | La nube | Fuera los `SET s3_*` globales. Cada credencial crea `CREATE OR REPLACE SECRET "<nombre>" (TYPE s3, KEY_ID …, SECRET …, SCOPE 's3://…')`, temporal (Dec-3) y con los valores escapados. La exportación a la nube elige la credencial por su nombre |
| 2.5 | Sheets | **Decidido al implementar: se queda en `config.json`.** La ruta del archivo de la cuenta de servicio no es un secreto —el secreto es el archivo, que el usuario guarda donde quiere—, así que cifrarla no protege nada. Sólo se escapan sus comillas, porque va pegada al SQL de `CREATE SECRET` |
| 2.6 | Migrar | Al primer arranque se copian al llavero los secretos en texto plano, se comprueba que se leen de vuelta, y se anota `migracion.credenciales = copiadas`. `config.json` **no se toca** hasta la fase 9 |
| 2.7 | Ajustes | Sección **Credentials**: nombre, tipo, último uso y quién la usa; añadir, sustituir y borrar. El valor no se muestra nunca |
| 2.8 | El manifiesto (A2) | `project.json.requiere = { credenciales: [{nombre, tipo}], extensiones: [...] }`, que la aplicación mantiene sola cuando el proyecto usa una credencial o carga una extensión. Al abrir, si falta algo, un aviso dice qué: «Faltan: credencial *bucket-tn*» |

**Se comprueba con**

- `probarSecretos.mjs`: ida y vuelta, y **el valor no aparece en ningún byte del
  archivo `amoxsql.duckdb`**. Se busca literalmente.
- `probarSecretosNube.mjs`: dos credenciales S3 con alcances distintos conviven;
  `duckdb_secrets()` lista las dos y `which_secret()` elige bien para cada ruta.
- En la aplicación: se configura la clave de Gemini, se reinicia y funciona. Luego se
  estropea a propósito el valor en texto plano de `config.json`: tiene que seguir
  funcionando, porque ya lee del llavero.

**Cerrada cuando:** ningún camino de la aplicación lee un secreto de `config.json` salvo la
migración.

### Fase 3 · Ejecuciones aisladas (A4)

| # | Tarea | Detalle |
|---|---|---|
| 3.1 | `server/ejecucion/ContextoDeEjecucion.js` | `query` y `systemQuery` (Dec-4) sobre su propia instancia. Tres modos: **memoria**, **trabajo** (base propia en `<proyecto>/.amoxsql/trabajo/<proceso>.duckdb`, que el `.gitignore` ya excluye por `*.duckdb`) y **proyecto** (el `dbManager` de siempre) |
| 3.2 | Elegir el modo | `.sqlchain` gana `config.base: auto · memoria · trabajo · proyecto`. **auto**, que es el de las cadenas nuevas, mira lo que lee cada nodo: si alguno lee una tabla que la cadena no produce y que no es un archivo, necesita la base del proyecto; si no, va a una base de trabajo. Se reutiliza el análisis que ya hacen `_sqlClassify` y `celdaSql.js`. **Las cadenas que ya existen, sin la clave, se quedan en proyecto**: lo que funciona hoy no cambia |
| 3.3 | Reanudar | La base de trabajo sobrevive a un fallo, para reanudar desde el último punto de control. **Decidido al implementar: tampoco se borra si todo va bien** —se conserva para que la interfaz vea cada paso y se reescribe en la siguiente ejecución, con `CREATE OR REPLACE`—. Las vistas intermedias son normales y no temporales en esa base, para que reanudar funcione aunque la aplicación se haya cerrado entre medias |
| 3.4 | Cada instancia con lo suyo | Las extensiones y los secretos son **por instancia**. El contexto carga las extensiones que la cadena necesita y crea las credenciales de A1 en la suya |
| 3.5 | El historial, a la base central | `ChainPersistence.initSchema` recibe la base central. Cada ejecución lleva proyecto, workspace y origen (interfaz o línea de comandos). El historial viejo en `amoxsql_chains` del proyecto se muestra como anterior, en sólo lectura |
| 3.6 | La interfaz | En los ajustes de la cadena, dónde viven los pasos intermedios, y en el editor, la etiqueta «in memory · no database» (pantalla 6 del mockup) |
| 3.7 | Convivir con la 5.8 | Abrir con la 5.8 una cadena guardada por la 5.9 (§2). **Comprobado en el código**: la 5.8 lee la cadena y no mira `config`; al guardarla la reconstruye sin esa clave, y la cadena vuelve a la 5.9 como «anterior», o sea, en la base del proyecto. Se degrada hacia lo seguro |

**Se comprueba con** `probarContextoEjecucion.mjs`:

- Una cadena de Excel a Parquet en modo trabajo deja la base del proyecto **idéntica
  byte a byte** (hash antes y después) y produce su salida.
- En modo proyecto se comporta como en la 5.8.
- Si falla a propósito en el paso 3, se reanuda desde ahí.
- Una tabla de casos para el modo auto.

**Cerrada cuando:** las cadenas de ejemplo de la aplicación corren igual que en la 5.8, y
las nuevas de archivo a archivo no tocan la base del proyecto.

### Fase 4 · La línea de comandos (A3) → **5.9.0-alpha.1**

```
AmoxSQL.exe run <proceso.sqlchain> --project <ruta> [--param nombre=valor]…
```

| # | Tarea | Detalle |
|---|---|---|
| 4.1 | Leer los argumentos | En `electron/main.js`, **antes** del bloqueo de instancia única, y pasarlos en `requestSingleInstanceLock(datos)` |
| 4.2 | Si la aplicación está abierta | Recibe los datos en `second-instance(evento, argv, cwd, datos)`, se los manda a su servidor y escribe el resultado en `<home>/ejecuciones/<id>.json`. El proceso que la lanzó espera a ese archivo y sale con su código |
| 4.3 | Si no lo está | Arranca sin ventana: no crea ventana al recibir `ready`, no se cierra por `window-all-closed` mientras corre, ejecuta, escribe el resultado y sale con su código. Si mientras tanto el usuario abre AmoxSQL, ese arranque llega aquí y este proceso **abre su ventana y se queda** |
| 4.4 | Códigos de salida | 0 bien · 1 el proceso falló · 2 argumentos inválidos · 3 falta una credencial (lo dice el manifiesto) · 4 la aplicación abierta no contestó · 5 no existe el proyecto o el proceso |
| 4.5 | Registro | Uno por ejecución en `<home>/registros/<id>.log`. **Se incluye `amoxsql.cmd`** vía `extraResources` —la prueba 0.3 confirmó que una consola interactiva no espera a un ejecutable gráfico, y dentro de un `.cmd` sí—, que espera, enseña la salida y devuelve el código |
| 4.6 | Documentación | Una página nueva de usuario, en español e inglés: «Correr un proceso desde la línea de comandos», con un ejemplo de tarea en el programador de Windows. **La programación desde la interfaz no está aquí**: es D1, en la 5.11.0 |

**Se comprueba con** `probarLineaDeComandos.mjs`, que lanza el ejecutable de desarrollo con
un `AMOXSQL_HOME` temporal:

- Con la aplicación cerrada: sale 0, existe el archivo de salida y la ejecución está en la
  base central.
- Con la aplicación abierta: se entrega a ella y sale 0.
- Un proceso que falla: sale 1 y deja su registro.
- Falta una credencial: sale 3.
- Argumentos malos: sale 2.

Y a mano: una tarea creada en el programador de Windows que lo llama.

**Cerrada cuando:** los cinco casos pasan también con el instalador, no sólo en desarrollo.
**Se publica la 5.9.0-alpha.1.**

### Fase 5 · Project en toda la interfaz (B7)

| # | Tarea | Detalle |
|---|---|---|
| 5.1 | Los 14 textos | «Current Workspace», «Recent Workspaces», «Open a workspace», «Close Workspace», «Workspace ready!», «Save to workspace», «Copy this chart to your current workspace», «Open Workspace Wizard», la sección Workspace de Settings, y el resto de la lista que da `grep`. Todos pasan a *project* |
| 5.2 | Lo interno, igual | Dec-6 |
| 5.3 | La documentación | Las 35 menciones de 13 páginas de `docs/`, en español e inglés |
| 5.4 | El aviso único | El primer arranque de la 5.9 lo explica una vez: *"Your workspaces are now called projects. Workspaces group them."* Se recuerda en `preferencias`. **Movido a la fase 6 al implementar**: el aviso nombra el concepto nuevo, y con B8 ese nombre es el que elija el usuario (*Clients*, *Teams*…), así que tiene que pasar por `useEtiqueta()`. Las dos cosas salen juntas en la alpha.2 |
| 5.5 | Una guarda | `scripts/probarPalabraProject.mjs` falla si vuelve a aparecer en la interfaz un «workspace» que signifique carpeta. Tiene una lista de excepciones con los usos nuevos |

### Fase 6 · Workspaces y la palabra (B1 + B8) → **5.9.0-alpha.2**

| # | Tarea | Detalle |
|---|---|---|
| 6.1 | API | `/api/workspaces` para crear, leer, cambiar y archivar; `/api/workspaces/:id/proyectos`; `PUT /api/project/workspace` para enlazar y desenlazar. Escribe `workspace: { id, nombre }` en `project.json` con `saveProjectConfig`, que fusiona, y lo refleja en `proyectos` |
| 6.2 | Abrir una carpeta | Si `project.json` trae un id conocido, se enlaza, y si la ruta cambió, se actualiza (se reconoce por el id, no por la ruta). Si trae un id desconocido —otra máquina—, se ofrece crear el workspace con ese id y nombre (la importación llega con B6). Si no trae nada, sale el diálogo de la pantalla 5 del mockup, con «Leave unlinked» y «No volver a preguntar en este proyecto» |
| 6.3 | La palabra (B8) | `preferencias.etiqueta_workspace` ∈ {clients, teams, brands, products, workspaces}. Un único ayudante en el cliente, `useEtiqueta()`, devuelve singular y plural en minúscula y mayúscula, y **todo** texto que nombre el concepto pasa por él. Se elige en el primer arranque (pantalla 1) y se cambia en Settings. El prompt de la IA la recibe, para hablar con la palabra del usuario |
| 6.4 | La carpeta del workspace | `<home>/workspaces/<id>/`, con el esqueleto de contexto vacío que llenará B2 |

**Se comprueba con** `probarWorkspaces.mjs`: crear, enlazar, mover la carpeta (cambia la
ruta y se reconoce igual), abrirla desde una «segunda máquina» (un segundo `AMOXSQL_HOME`
temporal) y desenlazar; `project.json` conserva sus otras claves. En la aplicación, las
pantallas 1 y 5 del mockup, de principio a fin. **Se publica la 5.9.0-alpha.2.**

### Fase 7 · Lo que el workspace aporta (B2 + B4 + B5) → **5.9.0-alpha.3**

| # | Tarea | Detalle |
|---|---|---|
| 7.1 | Contexto en capas (B2) | `loadProjectContext`, `loadUserRules` y los skills se llaman primero para `<home>/workspaces/<id>/` y luego para el proyecto. Fusión: métricas y skills por nombre (gana el proyecto); `RULES.md`, los dos, cada uno bajo su título |
| 7.2 | La pestaña Context | Lista y editor de los archivos de texto del workspace, **sin proyecto abierto**. Y «Subir al workspace» para una métrica que hoy vive en un proyecto: es la forma natural de migrar lo que ya existe |
| 7.3 | La política de IA (B4) | En el workspace: `proveedores` (local · nube) y `datos` (esquema · muestras · filas). **Se aplica en el servidor**, no en la interfaz, con un solo ayudante `aplicarPolitica()` en cada salida hacia el modelo: la elección de proveedor en `AiManager`, los resultados de herramientas en `tools.js` y `agenticLoop.js`, el perfilado, `chartStory.js` y la extracción de memorias. En la interfaz, la etiqueta del asistente y de la barra de título |
| 7.4 | La marca (B5) | Color, paleta y logo. Los decks y figuras **nuevos** de un proyecto enlazado la heredan como valores iniciales. No es retroactivo |

**Se comprueba con**

- `probarPoliticaIA.mjs`, con un proveedor falso que guarda lo que recibe. Con
  «esquema», **ningún valor de la tabla de prueba aparece en ninguna carga enviada**: se
  buscan los literales. Con «local», elegir un proveedor en la nube falla con un mensaje
  claro.
- `probarContextoEnCapas.mjs`: las reglas de fusión.

**Se publica la 5.9.0-alpha.3.**

### Fase 8 · El inicio y el workspace que viaja (B3 + B6) → **5.9.0-beta.1**

| # | Tarea | Detalle |
|---|---|---|
| 8.1 | El inicio (B3) | La pantalla 2 del mockup sustituye a los recientes de `WelcomeScreen`: workspaces en la barra lateral, una tarjeta por workspace con el estado de sus proyectos, la próxima entrega y su política; los proyectos sin workspace; los archivados; y buscar por nombre y ruta en todos los proyectos. La tira de ejecuciones recientes lee `ejecuciones`, que existe desde la fase 3 |
| 8.2 | Estado y entrega | `estado` y `entrega` en `project.json`, reflejados en la base central |
| 8.3 | Exportar e importar (B6) | Un archivo `.amoxworkspace`: JSON con versión, sin dependencias nuevas. Lleva metadatos, marca (el logo en base64), los archivos de contexto y los **nombres** de las credenciales, nunca sus valores. Al importar: nuevo, o fusionar con lo que ya hay, preguntando archivo por archivo |
| 8.4 | Documentar el formato | En la sección *File Formats* de `CLAUDE.md` y en la documentación de usuario |

**Se comprueba con** `probarExportarWorkspace.mjs`: ida y vuelta sin pérdida; el archivo
exportado **no contiene** los valores de las credenciales de prueba (se buscan
literalmente); se importa en un segundo `AMOXSQL_HOME`, y un proyecto enlazado abierto allí
reconoce el workspace importado.

**Se publica la 5.9.0-beta.1. Desde aquí, sólo arreglos.**

### Fase 9 · Cerrar → **5.9.0**

| # | Tarea | Detalle |
|---|---|---|
| 9.1 | Betas | Sólo correcciones; cada una, `5.9.0-beta.N` |
| 9.2 | Purgar el texto plano | En el primer arranque de la 5.9.0 se comprueba que cada secreto migrado se lee del llavero, **y sólo entonces** se borra de `config.json`. Un aviso lo dice |
| 9.3 | Pasada completa | Todas las `probar*.mjs`, el verificador de contraste, el build, y el recorrido del mockup —las seis pantallas— en la aplicación real |
| 9.4 | Publicar | Bump a 5.9.0 en los cuatro sitios, entrada consolidada del CHANGELOG, `pnpm dist`, Drive en la carpeta principal y GitHub **sin** `--prerelease`, con lo que pasa a ser *Latest*. Tag `v5.9.0` |
| 9.5 | Cerrar el círculo | En `candidatos_v6.md`, A y B como hechas, y empieza el plan de la 5.10.0 (C) |

---

## 6. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| La instancia única no entrega los datos como se espera, o no se puede abrir la interfaz sobre un arranque sin ventana | **Descartado el 2026-09-30** por la prueba 0.3: entrega los datos enteros y avisa al dueño sin ventana. El plan B no hace falta |
| En Windows, un ejecutable de subsistema gráfico no escribe en la consola y el que lo lanza no espera | Prueba 0.3; registro por ejecución y `amoxsql.cmd` |
| Un secreto acaba en claro en disco | Dec-3: nada de secretos persistentes de DuckDB; la prueba busca el valor en los bytes de la base; purga sólo tras comprobar que se lee del llavero |
| La política de IA se escapa por un camino que nadie miró | Se aplica en el servidor con un solo ayudante, y la prueba con proveedor falso busca los valores en **todo** lo enviado |
| Una prueba o una alfa migra la configuración real del autor | Dec-7: `AMOXSQL_HOME` temporal en todas las pruebas |
| Los pilotos se pierden con el cambio de palabra | El aviso único de 5.4, y las notas del release |
| Cambia el comportamiento de cadenas que hoy funcionan | Las cadenas sin `config.base` se quedan en modo proyecto (3.2) |
| macOS | `safeStorage` usa Keychain y la instancia única funciona igual. El instalador de Mac sigue siendo beta: se prueba cuando haya un Mac |

## 7. Lo que queda fuera de la 5.9.0

Para que no se cuele: **programar desde la interfaz, avisos y panel de operación** (D1,
D2, D7) van a la **5.11.0**, y las **fuentes con nombre** (C1) y el resto de C, a la
**5.10.0**. La línea de comandos de la 5.9 ya permite programar a mano con el programador del sistema, y eso
basta para validar la base antes de construir la interfaz encima.

---

## 8. Bitácora

| Fecha | Fase | Qué pasó |
|---|---|---|
| 2026-09-29 | — | Plan escrito sobre la 5.8.0 |
| 2026-09-30 | 0.1 | **5.8.1 publicada**: arreglo de las viñetas (#125), release (#127), Drive y GitHub como *Latest*. Los documentos de la 6 entraron en `main` con #126 |
| 2026-09-30 | 0.3 | Prueba de concepto con una app Electron mínima, aparte y con otro nombre para no cruzar su bloqueo con el de AmoxSQL. **`requestSingleInstanceLock(datos)` entrega el objeto entero** en `second-instance`. El segundo arranque espera un archivo de resultado y **sale con su código**: bash, PowerShell `Start-Process -Wait`, `cmd /c` y `start /wait` reciben el 3. Si el dueño corre sin ventana y el usuario abre la app, **el dueño recibe `second-instance` con datos vacíos** y puede abrir su ventana sin cortar la ejecución. Dos hallazgos: Chromium añade sus propios argumentos a `argv` (`--allow-file-access-from-files`), así que **se lee de `additionalData`, no de `argv`**; y una consola interactiva no espera a un ejecutable gráfico, así que el `amoxsql.cmd` de 4.5 sí hace falta |
| 2026-09-30 | 0.4 | **`safeStorage` pedido desde un `utilityProcess` por `parentPort` funciona**: `isEncryptionAvailable()` es cierto en Windows, ida y vuelta en 2–22 ms, y lo cifrado no contiene el secreto en claro |
| 2026-09-30 | 0.2 | `AMOXSQL_HOME`: `server/rutas.js` con `homeAmox()`, y los tres sitios que construían `~/.amoxsql` (`AiManager.js`, `galleryManager.js`, `ai/duckdbDocs.js`) pasan por ella. `scripts/probarRutasHome.mjs` 9/9, incluido que `~/.amoxsql` queda idéntica al cargar los módulos con la variable puesta. El servidor arranca con un home temporal y crea allí `config.json` y la galería. **Fase 0 cerrada** |
| 2026-09-30 | 1 | **Base de AmoxSQL** en `server/central/` (`BaseCentral.js` + `migraciones.js`), abierta en segundo plano al arrancar y cerrada en `/api/shutdown`; rutas `GET /api/central/estado` y `POST /api/central/recientes`; el cliente manda los recientes una vez (`client/src/central.js`). `scripts/probarBaseCentral.mjs` **28/28**. Tres cosas que salieron por el camino: (1) **los recientes no estaban en `config.json`** sino en el `localStorage` del renderer —el mapa de la aplicación era de la v3.5—, y `amoxsql-recientes` son archivos, no proyectos; (2) en Windows DuckDB no dice «lock» cuando otro proceso tiene la base, dice «being used by another process … (PID n)»: el aviso lo reconoce y **nombra al proceso**; (3) **una carrera**: el servidor abre la base en segundo plano y `_abrir` asigna la conexión antes de migrar, así que una petición que llegaba en ese hueco leía un estado vacío. Lo encontró la prueba de extremo a extremo; la prueba unitaria nueva que lo cubre falla con el código viejo y pasa con el arreglado. **Fase 1 cerrada** |
| 2026-09-30 | 2 | **Llavero y manifiesto.** `server/secretos.js` (tres modos: *llavero*, *pendiente*, *texto* = la 5.8 tal cual sin Electron), el puente `safeStorage` en `electron/main.js`, `server/manifiesto.js`, Settings → **Credentials** (`CredentialsPanel.jsx`) y el aviso de requisitos al abrir un proyecto. El renderer ya no recibe ninguna clave: donde hay una guardada ve un centinela, y si lo devuelve tal cual no se toca. `cifrado` pasó de BLOB a texto base64 en la migración 1 (aún no había salido en ningún instalador). `scripts/probarSecretos.mjs` **42/42**, con un llavero de prueba que cifra de verdad con una clave que muere con el proceso; las 25 pruebas del repo, en verde. Vista en el navegador integrado con el servidor suelto: la migración, la sección, el centinela en los campos y el borrado con su diálogo. Hallazgos: (1) **una fuga real en la 5.8**: Data Flow fijaba las claves de S3/GCS con `dbManager.query`, que **registra cada sentencia**, así que con un proyecto abierto la clave secreta quedaba en claro en `amoxsql_ai.query_history`. Reproducida en la prueba —sin el arreglo aparecen `AKIA…` y la clave—; ahora pasa por `systemQuery` y además `_logQuery` no registra nunca una sentencia que lleve un secreto. **Pendiente de decidir por el autor: limpiar los historiales que ya la tengan**; (2) exportar a GCS fijaba `s3_endpoint='storage.googleapis.com'` de forma global y desviaba las lecturas de S3 posteriores: ahora son secretos con nombre (`TYPE s3` / `TYPE gcs`), temporales; (3) abrir Settings marcaba todas las claves como usadas —enseñar que existe no es usarla—; (4) Settings decía que la clave estaba en `config.json`: ahora dice dónde está de verdad (campo no secreto `_llavero`). **Fase 2 cerrada** |
| 2026-09-30 | 3 | **Ejecuciones aisladas.** `server/ejecucion/`: `ContextoDeEjecucion.js` (modos *memoria*, *trabajo*, *proyecto* y la resolución de *auto*), `historial.js` y `ejecutarProceso.js`, la única puerta para correr un proceso. **Migración 2** de la base central: `amoxsql_chains.runs` y `node_runs` con `proyecto`; el id de cada ejecución es el mismo en `ejecuciones`. El historial ya no se crea en la base del proyecto; el que la 5.8 dejó ahí se lista como anterior y no se borra (409). En la interfaz, la etiqueta de la barra de Data Flow con su menú (auto · in memory · work database · project database), «before 5.9» en el historial, y **Resume** también tras un fallo, no sólo en una pausa. `scripts/probarContextoEjecucion.mjs` **50/50**; `probarBaseCentral.mjs` sube a 32 (una base que se quedó en la v1 sube a la v2 sin perder nada) y las 26 pruebas del repo, en verde. Recorrido en el navegador integrado contra un servidor aparte con home temporal (nuevo `?apiPort=` sólo en desarrollo): correr desde la barra deja el Parquet, la base de trabajo y la fila en la base central. La base real del autor ya está en la v2. Hallazgos: (1) **las vistas intermedias eran `TEMP VIEW`**, que mueren con su conexión: en una base de trabajo se reabría la conexión y reanudar no las encontraba. Ahora la base de trabajo comparte UNA conexión por archivo y, además, crea vistas normales (`vistasPersistentes`); (2) Windows bloquea el archivo de una base abierta y no se puede leer para sacarle un hash: «idéntica byte a byte» se comprueba con tamaño y `mtime` al nanosegundo de la base y su WAL, más las comprobaciones por SQL; (3) la etiqueta desbordaba la barra con el panel estrecho: ahora cede su ancho; (4) la regla de *auto* es conservadora a propósito: un gráfico o un informe atan al proyecto porque su consulta se volverá a lanzar contra él. **Fase 3 cerrada** |
| 2026-10-01 | 4 | **La línea de comandos.** `server/ejecucion/ordenes.js` (leer los argumentos, códigos, rutas, el texto para la consola; sin nada pesado, porque lo carga también el proceso principal) y `lineaDeComandos.js` (comprobar, correr con `ejecutarProceso` como `linea_de_comandos`, escribir `registros/<id>.log` y `ejecuciones/<id>.json` de una vez, temporal + rename). En `electron/main.js`: la orden se lee antes del bloqueo y viaja en él; la abierta escribe un acuse y la corre; la cerrada corre sin ventana y sale con su código; si el usuario abre AmoxSQL mientras tanto, se abre la ventana y el proceso se queda; sin ventana, ningún fallo abre un diálogo (bloquearía una tarea programada). `amoxsql.cmd` en `extraResources`. **Decidido al implementar**: (1) un `AMOXSQL_HOME` propio pone también la carpeta de datos de Electron dentro de él, porque la instancia única se decide por esa carpeta —si no, la prueba entregaba sus órdenes a la aplicación del autor—; (2) `fuera`: una orden de la línea de comandos nunca usa la base que la interfaz tiene abierta salvo que sea la del mismo proyecto; si el proceso necesita la base de otro proyecto, se abre aparte (`defaultDb` de su project.json, o la única .duckdb) y sin la base central no se anota historial en ninguna base ajena; (3) las rutas relativas del SQL se resuelven con `file_search_path` = proyecto en todo contexto aislado; (4) un checkpoint en una orden sale con 1 y dice que se reanude desde History. `scripts/probarLineaDeComandos.mjs` **21/21** con el ejecutable de desarrollo, incluida la entrega a la aplicación abierta (que sigue viva); acepta la ruta de un ejecutable empaquetado. Documentación de usuario nueva, ES/EN: `data-flow/command-line.md`, con el Programador de tareas. Las 27 pruebas, en verde. Falta para cerrar: los cinco casos con el instalador |
| 2026-10-01 | 4 | **Cerrada con el instalador. 5.9.0-alpha.1 publicada** (#134): `probarLineaDeComandos.mjs dist/win-unpacked/AmoxSQL.exe` 21/21, y `amoxsql.cmd` desde una consola real (0 y 5). Al probarlo: dentro de un `.cmd` la consola SÍ recibe la salida del ejecutable gráfico, así que el texto salía dos veces —el de stdout y el del archivo de informe—; con `--informe` ahora va sólo al archivo. Y una orden ya no imprime los mensajes internos del proceso principal. GitHub como *Pre-release* (la 5.8.1 sigue *Latest*) e instalador en `G:\My Drive\amoxsql\prerelease\`. **Fase 4 cerrada** |
| 2026-10-01 | 5 | **Project en toda la interfaz.** 23 textos en 12 archivos del cliente: la barra de título (*Current Project*, *Recent Projects*, *Close Project*), la bienvenida (*Open a project*), Settings (la sección *Project*, *Open Project Setup*), el asistente (*Set Up Your Project*, *Project ready!*), guardar un gráfico de la galería (*Save to Project*), exportar, Git y el diálogo de abrir. El primer paso del tutorial decía *Your workspace* refiriéndose al banco de trabajo, no a la carpeta: ahora *Your workbench*, porque la palabra ya es otra cosa. Lo interno igual (Dec-6). Documentación: 13 páginas en ES y EN, y el glosario explica las dos palabras. `scripts/probarPalabraProject.mjs` mira los literales y el texto JSX de `client/src` (sin comentarios ni identificadores) y se comprobó que atrapa los textos viejos. El aviso único (5.4) se mueve a la fase 6. **Fase 5 cerrada** |
