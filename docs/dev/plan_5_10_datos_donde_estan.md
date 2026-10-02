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
| 5.12.0 | I · el ingeniero de datos: dbt y DuckLake | Adelantada el 2026-10-01 (ver `candidatos_v6.md`) |
| … | E, F, G, H, J | 5.13.0 a 5.17.0 |
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
| C1 + C2 + I1 | **5.10.0-alpha.1** | Fuentes con nombre, el Excel que llega, y dbt sin bloqueos | *Prerelease* |
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
*Confirmada por la prueba 0.1* (`scripts/poc510/p01_catalogo_fuentes.mjs`), con cuatro matices:
- **Un esquema `fuentes` en el proyecto** no se lee en silencio: el motor da un error de
  ambigüedad. Es lo deseable; AmoxSQL avisa al abrir un proyecto con un esquema así, y
  `fuentes.main."x"` funciona siempre.
- **Crear la vista lee el archivo** (para saber sus columnas): una fuente cuyo archivo no
  está falla al crearse. Se crea entonces una vista con `error('…')` que explica qué pasa
  al consultarla. Si el archivo se va **después**, la vista sigue y la consulta dice que
  no está; si vuelve con otra columna, la vista la ve sin rehacerse.
- **El coste** es leer cada archivo: ~3,5 ms por CSV (200 fuentes, 0,8 s). Las vistas se
  crean después de abrir, sin hacer esperar.
- Una vista **del proyecto** que lee de una fuente sólo resuelve donde exista el catálogo:
  por eso lo crean también los contextos aislados y la línea de comandos.
`COMMENT ON VIEW` funciona en el catálogo (la descripción de la fuente viaja con ella), y
`DatabaseManager.close()` no lo suelta (no tiene archivo).

**Dec-11 · El Excel lo lee el motor; la librería `xlsx` 0.18.5 se retira.**
La auditoría la marcó: versión antigua, fallos conocidos con archivos manipulados, y los
Excel de clientes pasan a ser la entrada principal. El motor ya lee hoja, fila de
encabezado y rango (`read_xlsx(…, sheet, range, header)`). Y las hojas **ya** se listan con
un lector propio del ZIP (`xlsxMeta.js`); la librería sólo queda como respaldo cuando ese
lector falla. Se quita el respaldo: un archivo que el lector propio no entiende (`.xls`
antiguo, cifrado, dañado) recibe un error claro en vez de pasar a una librería con fallos
conocidos. Una dependencia menos, ninguna nueva. **Aprobado por el autor** (2026-10-01).

*Confirmada por la prueba 0.2* (`scripts/poc510/p02_excel.mjs`, muestras en
`scripts/fixtures/excel/`). `read_xlsx` lo da la extensión `excel` y se autocarga:
**`spatial` sobra** para leer Excel. El lector propio listó los 23 libros reales del disco
del autor; los dos que no pudo eran **CSV con extensión `.xlsx`**. Y fija cuatro reglas:
- **Siempre `empty_as_varchar = true`.** El motor decide el tipo de cada columna por la
  primera fila de datos: una columna vacía ahí se toma por número y la lectura falla en
  cuanto llega texto. **Nunca `ignore_errors`**: «arregla» eso perdiendo el texto en silencio.
- **«Hasta el final» es `A4:E1048576` con `stop_at_empty = true`** (5 ms). El rango
  abierto `A4:E` devuelve el millón de filas de la hoja.
- **Una celda combinada** llega llena sólo en su primera fila: C2 ofrece «rellenar hacia
  abajo».
- **Lo que no es un libro se reconoce por su firma**: `PK` es un ZIP; `D0 CF 11 E0` es un
  `.xls` antiguo o un `.xlsx` cifrado; texto es un CSV con otra extensión («¿leerlo como
  CSV?»). Los errores del lector hoy dicen `EOCD signature not found`: se traducen.

**Dec-12 · Lo que se publica guarda su esquema y su fecha dentro del archivo.**
Quien consume un archivo publicado (C6) puede estar en otra máquina y no ver la base
central de quien lo publicó. Así que los metadatos viajan **dentro** del Parquet:
`COPY … TO … (FORMAT parquet, KV_METADATA {…})` con el nombre de la fuente, la fecha, el
proceso, el workspace y el esquema; se leen con `parquet_kv_metadata()`. Sin archivos al
lado que puedan perderse o quedar desfasados.

*Confirmada por la prueba 0.3* (`scripts/poc510/p03_metadatos_parquet.mjs`): los valores
vuelven idénticos (acentos, ñ, comillas, JSON), leerlos de un Parquet de 110 MB cuesta 2 ms,
un esquema de 400 columnas ocupa 26 KB y cabe 1 MB sin problema, y un patrón (`*.parquet`)
dice los de cada archivo. CSV rechaza `KV_METADATA`: confirma que la garantía es sólo de
Parquet (§7.4).

**Dec-13 · Publicar es escribir aparte y renombrar, y reintentar siempre.**
Se escribe `.<nombre>.amoxtmp` en la **misma carpeta** y se renombra al final: en el mismo
volumen el renombrado es atómico, así que nadie lee nunca un archivo a medias.

*Reescrita tras la prueba 0.4* (`scripts/poc510/p04_renombrar_y_extensiones.mjs`): en
Windows **cualquier** proceso con el destino abierto impide reemplazarlo (`EPERM`), lo abra
como lo abra —también uno que lo comparte todo, y también el propio motor leyéndolo en ese
instante—. Así que el reintento no es para el caso raro de Excel: es el camino normal.
Se reintenta con espera creciente durante unos segundos; el lector de ese instante ve
siempre una versión entera. Si sigue sin poder, falla sin dejar el temporal y dice
**quién** lo tiene sólo cuando se sabe: Office deja `~$<nombre>` junto al archivo con el
usuario que lo abrió; si no, «otro programa tiene abierto el archivo». La prueba en una
carpeta sincronizada queda para hacerla a mano (`--carpeta`).

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
| 0.5 | Para I1: ¿qué error da `dbt run` cuando AmoxSQL tiene la `.duckdb` abierta? ¿Cuánto tarda soltarla y volver a adjuntarla, y qué estado de la sesión se pierde (vistas temporales, extensiones cargadas, el catálogo `fuentes`)? ¿Un DuckLake con catálogo **SQLite** deja que AmoxSQL y dbt escriban a la vez? | Script con un proyecto dbt mínimo (`dbt-duckdb`) en un entorno temporal |

**Cerrada cuando:** las cinco tienen respuesta en la bitácora, y Dec-10 a Dec-13 se
confirman o se reescriben. **Cerrada el 2026-10-01**: Dec-10, Dec-11 y Dec-12 se confirman
con matices; Dec-13 se reescribe (reintentar es el camino normal). Los scripts quedan en
`scripts/poc510/` y se pueden repetir con otra versión del motor.

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
| 2.1 | Las hojas, sin `xlsx` | `xlsxMeta.js` ya lee el `xl/workbook.xml`: se quita el respaldo a la librería. Lo que no es un libro se reconoce por su firma y recibe un error claro en español: `.xls` antiguo o cifrado, dañado, o CSV con extensión `.xlsx` (que se ofrece leer como CSV). Se retira la dependencia (Dec-11), y leer Excel deja de cargar `spatial` |
| 2.2 | Ver antes de leer | `/api/excel/vista` devuelve las primeras ~30 filas **sin encabezado y como texto** (`header=false, all_varchar=true`), con la letra de cada columna, para que el usuario vea dónde empieza la tabla |
| 2.3 | Elegir sobre la vista | En el diálogo de importar y en el asistente de fuentes: clic en la fila de encabezado, arrastrar hasta la última columna; «hasta la primera fila vacía» por defecto (`A4:E1048576` + `stop_at_empty`). Lo elegido se traduce a `range` y `header` y se ve el resultado al momento. Toda lectura lleva `empty_as_varchar = true`, nunca `ignore_errors` (Dec-11) |
| 2.3b | Celdas combinadas | «Rellenar hacia abajo» las columnas que se elijan: una celda combinada llega llena sólo en su primera fila |
| 2.4 | Unir hojas | Ya existe en el diálogo (modo *MERGE*); se lleva a las fuentes y a Data Flow. La columna con la hoja pasa a llamarse `_hoja` en lo nuevo |
| 2.4b | Lo que el diálogo pedía y nadie usaba | `cleanColumns` (limpiar nombres de columna) y `tableMapping`: se implementan o se quitan del diálogo |
| 2.5 | Recordarlo | En una fuente, en su definición. En un archivo suelto, en `project.json → lecturas["datos/ventas.xlsx"]`, así que la próxima vez sale ya elegido y Data Flow lo usa |
| 2.6 | Data Flow | `import_file` con Excel gana los mismos campos (fila de encabezado, rango, unir hojas) |

**Se comprueba con** `probarExcel.mjs`, sobre los archivos de `scripts/fixtures/excel/`: hojas
con nombres raros (`&`, acentos, comillas), un `.xls`, uno cifrado, uno dañado y un CSV
disfrazado (cada uno con su error claro, nada se cae); el Excel de cliente con encabezado
en la fila 4, una columna vacía en la primera fila, una celda combinada y notas al pie;
unir tres hojas; lo recordado vuelve a aplicarse.

### Fase 2b · dbt sin bloqueos (I1, adelantada) → **5.10.0-alpha.1**

Hoy AmoxSQL tiene abierta la base del proyecto y `dbt run` no puede escribir en ella. Es un
problema de hoy, así que no espera a la familia I (5.12.0).

| # | Tarea | Detalle |
|---|---|---|
| 2b.1 | Soltar y volver | Antes de ejecutar un comando de dbt que escribe (`run`, `build`, `seed`, `snapshot`), si la base que usa el `profiles.yml` es la que AmoxSQL tiene abierta, AmoxSQL la suelta con `DETACH` —lo que ya hace `dbManager.close`, sin tirar el motor—, dbt corre, y al terminar —bien o mal— se vuelve a adjuntar sola. Abrirla en sólo lectura **no** sirve: también bloquea (prueba 0.5) |
| 2b.2 | Nada que rehacer | La prueba 0.5 dice que soltar y volver cuesta ~3 ms y que **todo sobrevive**: el catálogo `fuentes`, las vistas temporales de los cuadernos (vuelven a resolver al reabrir) y las extensiones cargadas. Sólo hay que volver a hacer `USE` en los carriles |
| 2b.3 | Mientras tanto | La interfaz enseña «dbt está usando la base» y las consultas esperan o dicen por qué no pueden correr, en vez de fallar con `Catalog Error: … schema "user_db" does not exist` |
| 2b.4 | DuckLake | Con catálogo **SQLite**, dos procesos escriben a la vez sin soltar nada —**si usan la misma versión del motor**—. Con catálogo en archivo DuckDB (lo que crea AmoxSQL hoy) hay un solo escritor: recibe el trato de 2b.1 |
| 2b.5 | Las versiones | El motor de dbt suele ir por detrás del de AmoxSQL. Una base `.duckdb` se entiende en los dos sentidos (1.5 ↔ 1.4.4, probado), pero **un lago no**: el de 1.5 escribe un formato de DuckLake que 1.4.4 no abre. AmoxSQL lee la versión del motor del entorno de dbt y, si es más vieja, avisa antes de tocar un lago que dbt usa |
| 2b.6 | dbt que no arranca | Si `dbt --version` falla, se dice tal cual y antes de intentar nada (el entorno del autor está roto así: Python 3.14 con una dependencia de dbt que aún no lo admite) |

**Se comprueba con** `probarDbtSinBloqueos.mjs`, con un `dbt` falso que abre la base en
escritura (un proceso de Node con DuckDB): con la base abierta en AmoxSQL, el comando
termina bien, y al acabar la sesión vuelve a estar adjunta con sus extensiones, sus
fuentes y sus vistas temporales. Y a mano, con un `dbt` real (el entorno del autor hay que
repararlo antes). **Se publica la 5.10.0-alpha.1.**

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
| 5.5 | Extensiones | Las que haga falta se anotan en el manifiesto (A2). La primera vez necesitan red; se dice antes de intentarlo. Ya descargadas, `delta`, `iceberg`, `ducklake`, `httpfs` y `excel` instalan y cargan sin red (prueba 0.4); una que nunca se descargó falla con `Failed to download extension`, que se traduce |

**Se comprueba con** `probarLagos.mjs`, **sin red**: un lago Delta y un bucket de Parquet
*hive* simulados en una carpeta local (las mismas funciones del motor leen `file://`), y el
secreto con `SCOPE` comprobado por `which_secret()`. La conexión real a un bucket se prueba
a mano con el del autor, si tiene uno. **Se publica la 5.10.0-alpha.3.**

### Fase 6 · Publicar un archivo (C6) → **5.10.0-beta.1**

| # | Tarea | Detalle |
|---|---|---|
| 6.1 | El nodo **Publish** | En Data Flow: elige el nombre de la fuente que crea (`ventas-limpias`), la carpeta (o bucket) y el formato (Parquet; CSV como opción sin garantía de esquema). Escribe aparte y renombra con reintentos (Dec-13) |
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
| Renombrar sobre un archivo que otro tiene abierto | Dec-13: en Windows pasa con cualquier lector, así que reintentar es el camino normal; un error que nombra el problema (y a quién, si Office lo dice); el temporal se limpia |
| El motor de dbt va por detrás del de AmoxSQL | 2b.5: las bases se entienden en los dos sentidos, los lagos no; se avisa antes de tocar un lago que dbt usa |
| Las extensiones de lagos necesitan red la primera vez | Se avisa antes; el manifiesto las lista; las pruebas no dependen de la red |
| Una fuente con el mismo nombre en el workspace y en el proyecto | Regla de B2: gana el proyecto, y la interfaz lo enseña («sobrescribe la del workspace») |
| La IA con política «sólo esquema» y fuentes | Las fuentes son vistas del motor: el filtro de B4 actúa igual sobre sus resultados |

## 7. Decisiones que necesitan al autor

> **Decididas por el autor el 2026-10-01: las seis como se recomiendan.** La librería `xlsx` se retira; un `.xls` antiguo, cifrado o dañado recibe un error claro («guárdalo como .xlsx»).

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
- Catálogos Iceberg REST: más adelante, junto a DuckLake en la familia I (5.12.0) o después.
- El resto de dbt (editor, resultados en el linaje, entornos, sources desde las fuentes de
  AmoxSQL, DuckLake de primera clase): **5.12.0 (I)**.
- Mover a «procesados» los archivos ya leídos de una carpeta: se valora en D con la
  programación, que es cuando importa.

## 9. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-01 | — | Plan escrito sobre la 5.9.0 |
| 2026-10-01 | — | El autor aprueba las seis decisiones de §7, incluida la retirada de `xlsx` |
| 2026-10-01 | — | La familia I se rehace alrededor de dbt y DuckLake y se adelanta a la 5.12.0; su I1 (dbt sin bloqueos) entra en esta versión como fase 2b, con su prueba 0.5 |
| 2026-10-01 | 0 | **0.1** (20/20): `fuentes."x"` resuelve en la sesión del proyecto, en otro carril, sin proyecto y con base de trabajo; un esquema homónimo da error de ambigüedad (no lee lo que no es); crear la vista lee el archivo (~3,5 ms por CSV) y un archivo ausente se cubre con una vista `error()` |
| 2026-10-01 | 0 | **0.2** (27/27): `read_xlsx` viene de `excel` y se autocarga, `spatial` sobra; tipos por la primera fila → siempre `empty_as_varchar`, nunca `ignore_errors`; «hasta el final» = rango hasta 1048576 + `stop_at_empty`; celdas combinadas llegan vacías tras la primera fila. El lector propio listó 23/23 libros reales; los otros 2 del disco eran CSV con extensión `.xlsx`. Muestras en `scripts/fixtures/excel/` (generadas con `generar.py`) |
| 2026-10-01 | 0 | **0.3** (11/11): `KV_METADATA` y `parquet_kv_metadata()` funcionan en 1.5; valores idénticos, 2 ms sobre 110 MB, 1 MB por valor sin problema; CSV no lo admite |
| 2026-10-01 | 0 | **0.4** (21/21): en Windows cualquier proceso con el destino abierto impide el renombrado (`EPERM`), también uno que lo comparte todo y el propio motor leyendo → Dec-13 reescrita (reintentar siempre); el temporal se limpia; las extensiones de lagos ya descargadas cargan sin red. Pendiente a mano: la carpeta sincronizada (`--carpeta`) y el `~$` de Excel |
| 2026-10-01 | 1 | **Fase 1 (C1) hecha**, `probarFuentes.mjs` 42/42. Migración 3 (`fuentes_locales`, ámbito `w:<id>`/`p:<id>` —el id del proyecto y no su ruta, para que mover la carpeta no pierda la ubicación—). `server/fuentes.js`; catálogo montado por el carril `meta` tras abrir proyecto, conectar, cambiar el enlace o importar (y al rehacerse el motor, `dbManager.alIniciar`); en contextos aislados y la línea de comandos (sale con 3 si falta ubicar). Un archivo dentro del proyecto va relativo en la definición, sin registro. Nodo **Source** (`fuente`) de Data Flow, sin materializar. Explorador: sección *Sources*; ficha del workspace: bloque *Sources*; formulario con vista previa (en un portal: el panel lateral encajona los `fixed`). La IA: `list_tables` y el contexto con `SOURCE fuentes."x"`. **Hallazgos:** (a) con `error()` en la columna, `count(*)` devolvía 1: el aviso va en el `WHERE` (añadido a la prueba 0.1); (b) `/api/db/schemas` y la comprobación de sesión del motor no filtraban por catálogo: se excluye `fuentes`; (c) una consulta justo al abrir podía llegar antes del catálogo: espera. **Queda:** autocompletar `fuentes."` en el editor (pendiente, no bloquea) |
| 2026-10-02 | — | **5.10.0-alpha.1 publicada** (fases 1, 2 y 2b; PRs #147-#150) como prerelease, instalador en Drive `prerelease/`. El autor acepta Dec-8 (la 5.9 no abre la base v3): sus probadores usan la 4.x, sin IA ni lagos |
| 2026-10-02 | — | **5.10.0-alpha.2 publicada** (fases 3 y 4; PRs #151-#153) |
| 2026-10-02 | 5 | **Fase 5 (C4) hecha**, `probarLagos.mjs` 25/25 sin red (un bucket hive y una tabla Delta en local —el log de Delta escrito a mano—, un DuckLake, y la «nube» un endpoint que no responde). **Credenciales de nube con nombre** (`secretos.guardarNube`, tipo `nube-s3`/`nube-gcs`, JSON cifrado con región, endpoint y estilo de URL): cada una se crea en el motor como secreto TEMPORAL con `SCOPE` en el prefijo de su fuente —dos buckets con claves distintas conviven, comprobado con `which_secret`—; Settings → Credentials gana el formulario. Fuentes de tipo **bucket** (Parquet/CSV/JSON, patrón de ruta, particiones hive) y **lago** (`delta_scan`, `iceberg_scan` con `allow_moved_paths`, y DuckLake adjunto en sólo lectura como `amox_lago_<nombre>`, fuera del explorador y de la comprobación de sesión). Una URL va en la definición (vale en todas las máquinas). **Explorar** un lago encuentra sus tablas Delta/Iceberg y catálogos DuckLake (en local por el disco, en la nube con `glob`). **Probar la conexión** y el catálogo dicen qué falla: extensión sin descargar, credencial que no está o rechazada, permiso, ruta vacía, red, Iceberg sin `version-hint`. El manifiesto anota extensiones y el nombre de la credencial; ahora se anota **antes** de correr la consulta (una fuente que hoy no se puede leer sigue siendo una dependencia) y la línea de comandos sólo mira las fuentes de su proceso (también las de sus `.sql`). **Queda a mano:** un bucket y un lago reales del autor (si tiene) |
| 2026-10-02 | 4 | **Fase 4 (C5) hecha**, `probarProcedencia.mjs` 19/19. `server/procedencia.js`: la procedencia va en el `COMMENT ON TABLE` de la tabla —una línea legible («AmoxSQL · from ventas_sem38.xlsx (sheet Ventas, A4:E) · read 2026-10-02 07:02 · 6 rows», hora local) y debajo el JSON que relee la app (archivos con tamaño y fecha, hoja/hojas, rango, fuente, filas, cuándo)—. La dejan importar un archivo (también con comodines), importar Excel, Import File e Import Folder de Data Flow (que gana `_archivo` por fila, 4.2, también en el SQL exportado), y `CREATE TABLE … AS … fuentes."x"` desde el editor (sólo si lee UNA fuente). El explorador lo dice en la fila (icono, y aviso si el archivo cambió o se fue: 4.4) y al desplegarla; la IA lo recibe en su esquema (`-- loaded from …`) |
| 2026-10-02 | 3 | **Fase 3 (C3) hecha**, `probarLlegadas.mjs` 20/20. Fuente de tipo **carpeta** (`patron`, `criterio` reciente/todos, `subcarpetas`): «el más reciente» es el más nuevo que lleva `ESTABLE_MS` (3 s) sin cambiar (Dec-14); «todos» los une con `_archivo`; fuera los temporales de Office (`~$`) y de descargas. La lista de archivos va escrita en la vista: `server/llegadas.js` vigila cada carpeta (sin recursión salvo que se pida), espera a que el archivo esté quieto —un archivo escrito en tres pasadas da UN aviso—, rehace la vista y avisa por `/api/fuentes/llegadas` (canal propio, para no mezclarse con el vigilante del editor); la interfaz lo dice con un toast. Sin la aplicación abierta, los contextos de Data Flow y la línea de comandos eligen al montar (3.4). **Hallazgo:** un archivo que ya estaba a medio escribir cuando arranca el vigilante no produce más eventos: se espera aunque no los haya. Formulario con «One file / Newest file in a folder / All files in a folder», lo que hay ahora en la carpeta, y hoja/rango sobre el más reciente; el explorador y la ficha del workspace dicen qué archivo se lee |
| 2026-10-02 | 2b | **Fase 2b (I1) hecha**, `probarDbtSinBloqueos.mjs` 24/24 con un `dbt` falso en el PATH. `server/dbtConvivir.js` lee del `profiles.yml` (proyecto, `--profiles-dir`, `DBT_PROFILES_DIR`, `~/.dbt`) qué archivos abrirá dbt —`path` y `attach`, con `env_var`; lo remoto no cuenta; DuckLake con SQLite no se suelta, con catálogo en archivo sí—. `dbManager.prestar`/`recuperar`: sólo DETACH y vuelta al ATTACH sin `connect()` (que reiniciaría el motor y perdería las vistas temporales). Dos comandos a la vez cuentan préstamos. Mientras tanto `/api/query` y las celdas de cuaderno responden 409 diciendo por qué (lo que sólo lee `fuentes.` corre); `/api/dbt/base` lo dice a la interfaz; el panel de dbt pinta los avisos de AmoxSQL. Falla, cancelación o error: la base vuelve siempre. 2b.5: con un DuckLake en el perfil, se compara la versión del motor del entorno de dbt con la de AmoxSQL y se avisa. 2b.6: un dbt que muere antes de su primera línea lo dice. **Queda a mano:** probar con el dbt real del autor (su entorno no arranca, Python 3.14) |
| 2026-10-02 | 2 | **Fase 2 (C2) hecha**, `probarExcel.mjs` 34/34. `server/excel.js`, el único sitio que compone una lectura de Excel (fuentes, importar y Data Flow). `xlsx` retirada (`pnpm remove`) y el respaldo de `xlsxMeta.js` quitado; ZIP64 leído por el lector propio (muestra `zip64.xlsx`). Firmas: `.xls`/cifrado, dañado y **CSV disfrazado** (que se importa como CSV). Leer Excel ya no carga `spatial`. Diálogo de importar rehecho: la hoja cruda con letras y filas (`/api/excel/vista`; el motor deduce el ancho por la primera fila, así que se pide `A1:ZZ40` y se recortan las columnas vacías — ~2 s en una hoja de 14 MB, en caché por fecha), clic en la fila de encabezados y en la última columna, rellenar hacia abajo, limpiar nombres (`normalize_names`), unir hojas con `_hoja`; vista previa con tipos. Lo elegido va a `project.json → lecturas` y Data Flow lo usa si el nodo no dice nada (2.5, 2.6). El formulario de una fuente usa el mismo bloque. 2.4b: `cleanColumns` hace algo ya y `tableMapping` desaparece. **Dato para la D3:** `COPY … (FORMAT xlsx)` no autocarga `excel` (hay que `LOAD excel`), y la salida a Excel de Data Flow sigue pasando por `spatial`: se cambia en la D3 |
| 2026-10-01 | 0 | **0.5** (18/18): con la base adjunta —también en sólo lectura— dbt no escribe; `DETACH` (lo que hace `close()`) basta, cuesta ~3 ms y todo sobrevive (fuentes, vistas temporales, extensiones); 1.5 ↔ 1.4.4 se entienden con bases `.duckdb` pero **no** con lagos (formato de DuckLake); con catálogo SQLite y la misma versión, dos procesos escriben a la vez. El entorno `dbt-duckdb` del autor no arranca (Python 3.14 con una dependencia de dbt que aún no lo admite): se probó con su DuckDB 1.4.4 haciendo de dbt. **Fase 0 cerrada** |
