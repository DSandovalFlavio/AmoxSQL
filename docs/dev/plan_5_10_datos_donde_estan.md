# Plan de implementación — 5.10.0: los datos donde están

> La familia **C** (C1–C6) de [`candidatos_v6.md`](candidatos_v6.md), en fases, con la
> numeración que lleva de la 5.9.0 a la **5.10.0**: el segundo tramo del camino a la 6.0.0.
> Hecho leyendo el código de la 5.9.0, no suponiéndolo: cada decisión cita lo que
> encontró. Fecha: 2026-10-01.

---

## 1. Dónde cae este plan

| Versión | Familia | Estado |
|---|---|---|
| 5.9.0 | A + B · cimientos y workspaces | **Publicada** el 2026-10-01 |
| **5.10.0** | **C · los datos donde están** | **Este plan** |
| 5.11.0 | D · procesos que corren solos | Siguiente: programación, avisos, salida a Excel |
| … | E–J | |
| 6.0.0 | K · Python y experimentos | Cierra la 6 |

La tesis de la 6 —«workspaces gobernados por AmoxSQL, y procesos de archivo a archivo que
corren solos»— tiene su primera mitad en la 5.9.0. La 5.10.0 pone **de dónde vienen los
datos y adónde van**; la 5.11.0, **cuándo corren**. Por eso C va antes que D: programar un
proceso que lee «la ruta de esta máquina» no sirve en la máquina de al lado.

Lo que pide la familia, en una frase: **archivos primero; la base es una opción, no el
punto de partida.** Un proceso dice «ventas-semanales» y no `G:\Tiendas\entrada\…`; lee el
Excel tal como llega; toma el último que llegó; cruza con un lago; sabe de qué archivo
salió cada dato; y deja su resultado publicado, con nombre, para quien venga detrás.

## 2. La numeración de este tramo

| Hito | Versión | Qué lleva | Cómo se publica |
|---|---|---|---|
| C1 + C2 | **5.10.0-alpha.1** | Fuentes con nombre y el Excel que llega | *Prerelease* |
| C3 + C5 | **5.10.0-alpha.2** | El archivo que acaba de llegar, y de dónde salió cada dato | *Prerelease* |
| C4 | **5.10.0-alpha.3** | Lagos y buckets | *Prerelease* |
| C6 | **5.10.0-beta.1** | Publicar un archivo. Completa: desde aquí sólo arreglos | *Prerelease* |
| Arreglos | **5.10.0-beta.N** | Sólo correcciones | *Prerelease* |
| Cierre | **5.10.0** | Lo mismo que la última beta | Release normal, pasa a *Latest* |

Las reglas de la 5.9 siguen igual (número en cuatro sitios, rama `release/v…`,
`--prerelease`, Drive en `prerelease\`, `main` es la línea 5.10, la 5.9 se arregla desde
`release/5.9.x`). Recordatorio de la regla 6: en Drive, ordenado por nombre, `5.10.0`
aparece **antes** que `5.9.0`.

### Convivir con la 5.9 mientras dura el camino

| Qué toca la 5.10 | Si luego se abre la 5.9… | Cómo se consigue |
|---|---|---|
| La base de AmoxSQL (migración 3) | **Se niega a abrirla** (esquema v3 > v2) | Es lo que la 5.9 hace con una base más nueva, a propósito. **Por eso la migración 3 llega en la primera alfa y se avisa en sus notas**: quien instale una alfa no puede volver a la 5.9 sin perder la base central. Ver Dec-8 |
| `project.json` con `requiere.fuentes` y `lecturas` | Los conserva | `saveProjectConfig` fusiona |
| Un `.sqlchain` con nodos `source` o `publish` | Falla al correr esos nodos (tipo desconocido); el resto, bien | Aceptado y dicho en las notas |
| Las fuentes del workspace | No las ve | Son archivos nuevos dentro de `<home>/workspaces/<id>/fuentes/` |
| Tablas con su procedencia (`COMMENT ON TABLE`) | Las lee como siempre; el comentario se ignora | DuckDB guarda el comentario con la tabla |

---

## 3. Lo que el código ya da

Lo que se encontró leyendo la 5.9.0, y abarata o condiciona el plan:

| Hallazgo | Dónde | Consecuencia |
|---|---|---|
| Las hojas de un Excel **ya** se leen con un lector propio del ZIP (`xl/workbook.xml` desde el directorio central), con caché por fecha y tamaño | `server/xlsxMeta.js` (`getSheetNames`) | Retirar la librería `xlsx` es quitar su único uso: el respaldo `xlsx.read(…, {bookSheets})` de `xlsxMeta.js` y el `require` de `index.js` (Dec-11) |
| A `read_xlsx` sólo se le pasa `sheet`; nunca `range`, `header` ni `all_varchar` | `/api/db/import-excel` (`index.js`), `import_file` (`ChainExecutor.js`) | C2 es pedir y recordar dos parámetros que el motor ya acepta |
| Antes de leer un Excel se hace `INSTALL spatial; LOAD spatial` | `/api/db/import-excel`, `ensureSpatialExtension` | Por verificar en la prueba 0.2 qué extensión da `read_xlsx` en la 1.5: si no es `spatial` (pesada, pide red la primera vez), se deja de cargar para leer Excel |
| Unir hojas ya existe: modo *MERGE* con `UNION ALL BY NAME` y una columna `source_duck` con la hoja | `/api/db/import-excel` | 2.4 lo extiende a fuentes y Data Flow; la columna pasa a llamarse `_hoja`, como `_archivo` en las carpetas (las tablas ya importadas no cambian) |
| El diálogo de Excel recibe `cleanColumns` y `tableMapping`, y el servidor los ignora | `ImportExcelModal.jsx`, `/api/db/import-excel` | Se arregla de paso en la fase 2: o hacen algo o se quitan |
| Nada recuerda cómo se importó un archivo | — | 2.5: `project.json → lecturas` |
| El disco ya se vigila: `fs.watch` recursivo con antirrebote, firma por archivo y aviso al cliente por SSE (`/api/files/watch`) | `server/vigilanteArchivos.js` (`crearVigilante`), `client/src/state/vigilante.js` | C3 reutiliza `crearVigilante` para cada carpeta de fuente y el mismo canal SSE para avisar |
| `import_folder` ya lee una carpeta con patrón y `union_by_name`, pero sin «el más reciente» ni Excel | `ChainExecutor.js` | El tipo *carpeta* de C3 añade el criterio, la estabilidad (Dec-14) y Excel |
| `bucket_read` lee de S3/GCS tras `prepareCloud`; `export_file` escribe con `COPY` **directo al destino** | `ChainExecutor.js` | C4 parte de `bucket_read`; C6 añade el temporal y el renombrado (Dec-13), que hoy no existe |
| Las credenciales de nube son **una por proveedor**, y el secreto del motor se crea **sin `SCOPE`** | `server/secretos.js` (`NUBE`, `prepararNube`, `sqlCrearSecreto`) | C4 abre credenciales con nombre y les da `SCOPE`, para que convivan varias |
| DuckLake ya se adjunta (`ducklake:` + `DATA_PATH`); Delta e Iceberg no se usan en ningún sitio, sólo aparecen en la lista de extensiones | `DatabaseManager.js`, `ExtensionExplorer.jsx` | C4 empieza de cero para Delta e Iceberg; DuckLake se ofrece como fuente |
| Nada guarda de dónde vino una tabla importada. El precedente es el cuaderno: escribe `COMMENT ON VIEW/TABLE` y lo lee de `duckdb_views()`/`duckdb_tables()` | `vistaDeCelda.js` (`componerCelda`), `/api/cuaderno/vistas` | C5 usa el mismo mecanismo: la procedencia viaja con la tabla y no hace falta otra tabla |
| El explorador de base sale de una sola consulta a `information_schema` con un filtro de esquemas internos | `/api/db/schemas` (`userTablesWhereClause`), `DatabaseExplorer.jsx` | Las vistas del catálogo `fuentes` aparecen ahí por sí solas; sólo hay que agruparlas como **Sources** |
| La exportación de datos de la interfaz también escribe directo al destino | `/api/export-data` | Fuera de C6 (que es Data Flow); se valora reutilizar el mismo escritor atómico |

---

## 4. Las decisiones que fija este plan

Siguen la numeración de la 5.9 (**Dec-1 … Dec-7** siguen vigentes).

**Dec-8 · La migración 3 de la base central llega con la primera alfa y no se oculta.**
Las fuentes necesitan guardar dónde está cada una en **esta** máquina, y eso es de la
máquina (Dec-5): va a la base central. Una base con esquema v3 no la abre la 5.9 —por
diseño—. Se asume, se prueba que la 5.10 abre una v2 y la sube, y las notas de la
alpha.1 lo dicen en la primera línea.

**Dec-9 · Una fuente tiene dos mitades.**
- **La definición** —nombre, tipo, patrón, hoja, fila de encabezado, rango, esquema que se
  espera— la escribe una persona y es la misma en todas las máquinas: es **texto** del
  workspace, `<home>/workspaces/<id>/fuentes/<nombre>.json`, viaja en el `.amoxworkspace`
  (B6) y se edita sin proyecto abierto (como B2). Un proyecto sin workspace puede tener
  las suyas en `.amoxsql/fuentes/`; con el mismo nombre, gana la del proyecto (la regla de
  B2).
- **La ubicación en esta máquina** —`G:\Tiendas\entrada` aquí, `D:\Nube\Tiendas\entrada` en
  la de al lado— la registra la máquina: va a la base central (tabla `fuentes_locales`,
  migración 3). Un bucket o un lago (`s3://…`) es igual en todas partes: su ubicación va en
  la definición y no hace falta registrarla en cada máquina.
- Un proyecto anota en su manifiesto (A2) los **nombres** de las fuentes que usa
  (`requiere.fuentes`), así que al abrirlo en otra máquina se sabe cuál falta ubicar.

**Dec-10 · Las fuentes son un catálogo propio, `fuentes`, que vive en memoria.**
Cada sesión (la del proyecto, cada contexto aislado de Data Flow, la línea de comandos)
hace `ATTACH ':memory:' AS fuentes` y crea dentro una **vista** por fuente. Se consultan
como una tabla más: `SELECT * FROM fuentes."ventas-semanales"`. Así:
- nada de las fuentes se escribe en la base del proyecto (una vista es una definición; el
  dato se lee del archivo cada vez);
- el editor, los cuadernos, Data Flow, la IA y la línea de comandos las usan igual, porque
  para el motor son vistas;
- cambiar a qué archivo apunta (C3) es rehacer una vista, no tocar el SQL de nadie.
- El nombre de una fuente se limita a minúsculas, cifras y guiones (`ventas-semanales`):
  cabe en una URL, en un nombre de archivo y entre comillas en SQL sin sorpresas.
(Se comprueba en la prueba de concepto 0.1: resolución de `fuentes."x"` con el proyecto
adjunto, y que el catálogo no choca con un esquema llamado igual.)

**Dec-11 · El Excel lo lee el motor; la librería `xlsx` 0.18.5 se retira.**
La auditoría la marcó: versión antigua, fallos conocidos con archivos manipulados, y los
Excel de clientes pasan a ser la entrada principal. El motor ya lee hoja, fila de
encabezado y rango (`read_xlsx(…, sheet, range, header)`). Y las hojas **ya** se listan con
un lector propio del ZIP (`xlsxMeta.js`); la librería sólo queda como respaldo cuando ese
lector falla. Se quita el respaldo: un archivo que el lector propio no entiende (`.xls`
antiguo, cifrado, dañado) recibe un error claro en vez de pasar a una librería con fallos
conocidos. Una dependencia menos, ninguna nueva. **Pendiente del visto bueno del autor**,
por la regla de dependencias (ver §7).

**Dec-12 · Lo que se publica guarda su esquema y su fecha dentro del archivo.**
Quien consume un archivo publicado (C6) puede estar en otra máquina y no ver la base
central de quien lo publicó. Así que los metadatos viajan **dentro** del Parquet:
`COPY … TO … (FORMAT parquet, KV_METADATA {…})` con el nombre de la fuente, la fecha, el
proceso, el workspace y el esquema; se leen con `parquet_kv_metadata()`. Sin archivos al
lado que puedan perderse o quedar desfasados. (Prueba de concepto 0.3.)

**Dec-13 · Publicar es escribir aparte y renombrar.**
Se escribe `.<nombre>.amoxtmp` en la **misma carpeta** y se renombra al final: en el mismo
volumen el renombrado es atómico, así que nadie lee nunca un archivo a medias. Si el
destino está abierto por otro proceso (Windows lo bloquea), se reintenta unos segundos y,
si sigue, falla diciendo quién lo tiene abierto, sin dejar el temporal. (Prueba 0.4,
incluida una carpeta sincronizada de la nube.)

**Dec-14 · Un archivo que «llega» está quieto.**
Una carpeta sincronizada escribe el archivo en varias pasadas. C3 sólo considera llegado
un archivo cuyo tamaño y fecha no cambian durante unos segundos, y nunca los temporales de
Office (`~$…`) ni los del sincronizador.

---

## 5. Las fases

### Fase 0 · Pruebas de concepto

Cuatro preguntas que, si salen mal, cambian el diseño. Ninguna toca el producto.

| # | Pregunta | Cómo se contesta |
|---|---|---|
| 0.1 | ¿`ATTACH ':memory:' AS fuentes` + vistas resuelve `fuentes."x"` con el proyecto adjunto, en un contexto aislado y en la línea de comandos? ¿Y si el proyecto tiene un esquema `fuentes`? | Script con DuckDB 1.5: proyecto adjunto, vista sobre un CSV, consulta sin calificar catálogo; el caso del esquema homónimo |
| 0.2 | ¿`read_xlsx` lee bien un Excel «de cliente» (título arriba, encabezados en la fila 4, notas al pie) con `range` y `header`? ¿Qué devuelve con celdas combinadas y con fechas? ¿El lector propio (`xlsxMeta.js`) saca las hojas, sin el respaldo de la librería, de los `.xlsx` que generan las herramientas habituales, y falla con elegancia con un `.xls` o uno cifrado? ¿Qué extensión da `read_xlsx` en la 1.5: hace falta `spatial`? | Tres o cuatro archivos de muestra versionados en `scripts/fixtures/` |
| 0.3 | ¿`KV_METADATA` en `COPY … (FORMAT parquet)` y `parquet_kv_metadata()` funcionan en DuckDB 1.5? ¿Qué tamaño admiten los valores? | Script |
| 0.4 | ¿El renombrado sobre un archivo abierto por otro proceso falla siempre igual en Windows, y qué hace una carpeta sincronizada con el temporal? ¿`delta` e `iceberg` se instalan sin red si ya se descargaron una vez? | Script + prueba a mano en la carpeta sincronizada del autor |

**Cerrada cuando:** las cuatro tienen respuesta en la bitácora, y Dec-10 a Dec-13 se
confirman o se reescriben.

### Fase 1 · Fuentes con nombre (C1)

| # | Tarea | Detalle |
|---|---|---|
| 1.1 | Migración 3 | `fuentes_locales (ambito, nombre, ubicacion, actualizada)` —`ambito` es el id del workspace o la ruta del proyecto—. Se prueba subir una v2 real |
| 1.2 | `server/fuentes.js` | Leer las definiciones (workspace, luego proyecto; gana el proyecto), resolver la ubicación (definición → registro local), validar el nombre, y componer el SQL de lectura de cada tipo: `archivo` (CSV, Parquet, JSON, Excel), `carpeta` (C3), `bucket` y `lago` (C4) |
| 1.3 | El catálogo `fuentes` | En `DatabaseManager` al conectar (y al cambiar las definiciones), en `ContextoDeEjecucion` y en la línea de comandos: `ATTACH ':memory:' AS fuentes` y una vista por fuente. Una fuente sin ubicación en esta máquina no crea vista: crea una que falla con un mensaje claro («ventas-semanales no está ubicada en esta máquina: Settings → …») |
| 1.4 | API | `/api/fuentes` (listar con su estado: ubicada, encontrada, última modificación), crear, editar, borrar, ubicar en esta máquina, probar |
| 1.5 | La interfaz | En la vista de workspaces, la ficha de un workspace gana **Sources**: lista, crear (asistente: tipo → ubicación → vista previa), ubicar en esta máquina. En el explorador de base, una sección **Sources** con sus columnas, como las tablas. En Data Flow, un nodo **Source** que se elige por nombre |
| 1.6 | El manifiesto | Usar una fuente (en el editor, en un nodo) anota su nombre en `requiere.fuentes` del proyecto; al abrir en otra máquina, el aviso de A2 dice «falta ubicar ventas-semanales» y lleva a ubicarla |
| 1.7 | Viajan | El `.amoxworkspace` (B6) lleva las definiciones —nunca las ubicaciones locales— |
| 1.8 | La IA | `list_tables` y el contexto del asistente incluyen las fuentes como tablas del catálogo `fuentes`, con su descripción. La política de IA (B4) se les aplica igual |

**Se comprueba con** `probarFuentes.mjs`: definir en un workspace y en un proyecto (gana el
proyecto); ubicar en esta máquina y consultar por nombre desde el editor, desde un nodo de
Data Flow en contexto aislado y desde la línea de comandos; una «segunda máquina» (otro
home) con la misma definición y otra ubicación da el mismo resultado; una fuente sin
ubicar falla con el mensaje; la base del proyecto no recibe nada; exportar e importar el
workspace lleva la definición y no la ubicación.

### Fase 2 · El Excel tal como llega (C2) → **5.10.0-alpha.1**

| # | Tarea | Detalle |
|---|---|---|
| 2.1 | Las hojas, sin `xlsx` | `xlsxMeta.js` ya lee el `xl/workbook.xml`: se quita el respaldo a la librería y se da un error claro para `.xls` antiguo, cifrado o dañado. Se retira la dependencia (Dec-11). Si la prueba 0.2 lo confirma, leer Excel deja de cargar `spatial` |
| 2.2 | Ver antes de leer | `/api/excel/vista` devuelve las primeras ~30 filas **sin encabezado y como texto** (`header=false, all_varchar=true`), con la letra de cada columna, para que el usuario vea dónde empieza la tabla |
| 2.3 | Elegir sobre la vista | En el diálogo de importar y en el asistente de fuentes: clic en la fila de encabezado, arrastrar hasta la última columna; «hasta la primera fila vacía» por defecto. Lo elegido se traduce a `range` y `header` y se ve el resultado al momento |
| 2.4 | Unir hojas | Ya existe en el diálogo (modo *MERGE*); se lleva a las fuentes y a Data Flow. La columna con la hoja pasa a llamarse `_hoja` en lo nuevo |
| 2.4b | Lo que el diálogo pedía y nadie usaba | `cleanColumns` (limpiar nombres de columna) y `tableMapping`: se implementan o se quitan del diálogo |
| 2.5 | Recordarlo | En una fuente, en su definición. En un archivo suelto, en `project.json → lecturas["datos/ventas.xlsx"]`, así que la próxima vez sale ya elegido y Data Flow lo usa |
| 2.6 | Data Flow | `import_file` con Excel gana los mismos campos (fila de encabezado, rango, unir hojas) |

**Se comprueba con** `probarExcel.mjs`, sobre los archivos de `scripts/fixtures/`: hojas de
un `.xlsx` normal, uno con hojas ocultas, un `.xls` (error claro) y uno dañado (error
claro, nada se cae); encabezado en la fila 4 y rango hasta H; unir tres hojas; lo
recordado vuelve a aplicarse. **Se publica la 5.10.0-alpha.1.**

### Fase 3 · El archivo que acaba de llegar (C3)

| # | Tarea | Detalle |
|---|---|---|
| 3.1 | La fuente de tipo carpeta | Patrón (`ventas*.xlsx`), criterio (**el más reciente** por fecha de modificación, o **todos** unidos con una columna `_archivo`), y opcionalmente las subcarpetas |
| 3.2 | Quieto antes de contar | Dec-14: tamaño y fecha estables durante unos segundos; fuera los temporales de Office y del sincronizador |
| 3.3 | Vigilar | Un vigilante por carpeta de fuente (sin recursión salvo que se pida), con el mismo mecanismo que ya vigila el proyecto para el editor. Al llegar un archivo nuevo: la vista se rehace y la interfaz lo dice («ventas-semanales: llegó *Ventas Semana 39 FINAL.xlsx*») |
| 3.4 | Sin vigilante | Una ejecución de Data Flow o de la línea de comandos resuelve «el más reciente» **al empezar**, sin depender de que la aplicación estuviera abierta |
| 3.5 | La interfaz | En la ficha de la fuente: qué archivo es «el actual», cuándo llegó, y los anteriores |

### Fase 4 · De dónde salió cada dato (C5) → **5.10.0-alpha.2**

| # | Tarea | Detalle |
|---|---|---|
| 4.1 | Al cargar | Importar desde la interfaz, `import_file`/`import_folder` de Data Flow, o materializar una fuente: la tabla recibe `COMMENT ON TABLE` con la procedencia en JSON —archivo, tamaño, fecha de modificación, hoja y rango, cuándo se leyó, filas, y la fuente si la hubo—. El precedente es el cuaderno, que ya describe así sus vistas |
| 4.2 | Varios archivos | Una carga de carpeta añade la columna `_archivo` (y `_hoja` si une hojas): cada fila sabe de dónde vino |
| 4.3 | Verlo | El explorador de base y la ficha de una tabla lo dicen en una línea: «viene de `ventas_sem38.xlsx`, leído el lunes a las 7:02». La IA lo recibe con el esquema |
| 4.4 | Si el archivo cambió | Al mirar una tabla, si su archivo de origen tiene otra fecha que la de la carga, se avisa: «el archivo cambió después de cargarlo» |

**Se comprueba con** `probarProcedencia.mjs`: cada camino de carga deja su procedencia; la
de una carpeta, por fila; el aviso cuando el origen cambia. **Se publica la
5.10.0-alpha.2.**

### Fase 5 · Lagos y buckets (C4) → **5.10.0-alpha.3**

| # | Tarea | Detalle |
|---|---|---|
| 5.1 | Credenciales con nombre | Hoy el llavero sólo conoce `nube-s3` y `nube-gcs`, una por proveedor. Se abre a credenciales con nombre (`bucket-tn`), creadas en Settings → Credentials: S3 y compatibles (con *endpoint* y región), GCS. Cada una se crea en el motor como secreto **temporal** con `SCOPE` (Dec-3), así que dos buckets con claves distintas conviven |
| 5.2 | Los tipos | `bucket` (Parquet o CSV con patrón y particiones *hive*), `lago` en **Delta** (`delta_scan`) e **Iceberg** (`iceberg_scan` por ruta de tabla), y **DuckLake**, que ya existe en la conexión del proyecto y aquí se ofrece como fuente |
| 5.3 | Ver sus tablas | Para un lago, explorar: las subcarpetas que son tablas (`_delta_log/`, `metadata/`), con su esquema; cada una se puede añadir como fuente con un clic |
| 5.4 | Probar la conexión | Un botón que dice exactamente qué falla: credencial, permiso, ruta, extensión sin descargar |
| 5.5 | Extensiones | Las que haga falta se anotan en el manifiesto (A2). La primera vez necesitan red; se dice antes de intentarlo |

**Se comprueba con** `probarLagos.mjs`, **sin red**: un lago Delta y un bucket de Parquet
*hive* simulados en una carpeta local (las mismas funciones del motor leen `file://`), y el
secreto con `SCOPE` comprobado por `which_secret()`. La conexión real a un bucket se prueba
a mano con el del autor, si tiene uno. **Se publica la 5.10.0-alpha.3.**

### Fase 6 · Publicar un archivo (C6) → **5.10.0-beta.1**

| # | Tarea | Detalle |
|---|---|---|
| 6.1 | El nodo **Publish** | En Data Flow: elige el nombre de la fuente que crea (`ventas-limpias`), la carpeta (o bucket) y el formato (Parquet; CSV como opción sin garantía de esquema). Escribe aparte y renombra (Dec-13) |
| 6.2 | Lo que lleva dentro | Dec-12: nombre, fecha, proceso, workspace, filas y esquema en `KV_METADATA` |
| 6.3 | Si el esquema se rompe | Antes de renombrar, se compara con lo publicado: una columna que desaparece o cambia de tipo **detiene** la publicación (el archivo anterior queda intacto) y lo dice; añadir columnas se permite. Una opción lo convierte en aviso |
| 6.4 | Queda registrado | La publicación crea o actualiza la fuente en el workspace —de tipo `publicada`—, así que quien la usa la ve por su nombre |
| 6.5 | Frescura | Quien la consume ve de cuándo es (lo lee del propio archivo). Opcional en la definición: «avisar si tiene más de N días» |
| 6.6 | La línea de comandos | `AmoxSQL.exe run` con un nodo Publish devuelve 1 si el esquema se rompió, y su registro lo dice |

**Se comprueba con** `probarPublicar.mjs`: publicar y leer por nombre desde otro proyecto
del mismo workspace; un lector con el archivo abierto mientras se publica nunca ve medio
archivo (lectura en bucle durante la publicación); un esquema roto deja intacto el
anterior y sale 1 por la línea de comandos; la fecha y el esquema se leen del propio
archivo en una «segunda máquina». **Se publica la 5.10.0-beta.1. Desde aquí, sólo
arreglos.**

### Fase 7 · Cerrar → **5.10.0**

| # | Tarea | Detalle |
|---|---|---|
| 7.1 | Betas | Sólo correcciones; cada una, `5.10.0-beta.N` |
| 7.2 | Pasada completa | Todas las `probar*.mjs`, el build, y un recorrido real: el Excel de un cliente desde la carpeta sincronizada del autor, por nombre, hasta un Parquet publicado que lee otro proyecto |
| 7.3 | Documentación | Una página de usuario nueva, ES/EN, «Fuentes de datos», y lo que cambia en Data Flow, el editor y la importación de Excel. `.amoxsql/fuentes/` y el `KV_METADATA` de lo publicado, en *File Formats* de `CLAUDE.md` |
| 7.4 | Publicar | Bump a 5.10.0 en los cuatro sitios, entrada consolidada del CHANGELOG, Drive principal y GitHub como *Latest* |
| 7.5 | Cerrar el círculo | C como hecha en `candidatos_v6.md`, y empieza el plan de la 5.11.0 (D) |

---

## 6. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| Quien pruebe una alfa no puede volver a la 5.9 (esquema v3) | Dec-8: avisado en las notas; la base no se toca si la abre una versión más vieja |
| Las carpetas sincronizadas escriben a trozos o dejan archivos «sólo en la nube» | Dec-14 (archivo quieto); la prueba 0.4 en la carpeta real del autor; leer un archivo «sólo en la nube» lo descarga, y si tarda se dice |
| Un Excel de cliente raro (celdas combinadas, fechas como texto, encabezados en dos filas) | La vista previa como texto (2.2) deja ver lo que hay antes de leer; los casos raros van como archivos de muestra en `scripts/fixtures/` |
| Renombrar sobre un archivo que otro tiene abierto | Dec-13: reintento corto y un error que nombra el problema; el temporal se limpia |
| Las extensiones de lagos necesitan red la primera vez | Se avisa antes; el manifiesto las lista; las pruebas no dependen de la red |
| Una fuente con el mismo nombre en el workspace y en el proyecto | Regla de B2: gana el proyecto, y la interfaz lo enseña («sobrescribe la del workspace») |
| La IA con política «sólo esquema» y fuentes | Las fuentes son vistas del motor: el filtro de B4 actúa igual sobre sus resultados |

## 7. Decisiones que necesitan al autor

1. **Retirar `xlsx` 0.18.5** (Dec-11). Las hojas ya se listan con un lector propio; la
   librería sólo es el respaldo. Recomendado: sí. Es quitar una dependencia, no añadir.
2. **Fuentes también en proyectos sin workspace** (`.amoxsql/fuentes/`). Recomendado: sí;
   es la misma regla de capas de B2 y no obliga a nadie a crear workspaces.
3. **Iceberg con catálogo REST** queda fuera de la 5.10 (sólo tablas por ruta). El catálogo
   encaja mejor con la familia I (para el ingeniero de datos). Recomendado: así.
4. **Publicar sólo Parquet con garantía de esquema**; CSV como opción sin ella; Excel queda
   para D3 (salida a Excel de verdad, 5.11). Recomendado: así.
5. **Un esquema roto detiene la publicación** por defecto (y se puede bajar a aviso).
   Recomendado: detener; es lo que protege al que consume.
6. El nombre en la interfaz: **Sources** (en el explorador, en la ficha del workspace y en
   Data Flow). Recomendado.

## 8. Lo que queda fuera de la 5.10.0

- Programar procesos, avisos y salida a Excel con formato: **5.11.0 (D)**.
- Validar los datos de una fuente (reglas de calidad, rangos): **5.12.0 (E)**.
- Catálogos Iceberg REST y tablas publicadas en una base: **I**.
- Mover a «procesados» los archivos ya leídos de una carpeta: se valora en D con la
  programación, que es cuando importa.

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-01 | — | Plan escrito sobre la 5.9.0 |
