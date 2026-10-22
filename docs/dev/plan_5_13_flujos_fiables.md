# Plan 5.13.0 · Flujos fiables

> Familia E recortada (más F4, H1 y J10), tras la revisión del 2026-10-22. Escrito
> leyendo `main` en `d0a97e8` (5.12.0). **No se publica**: como la 5.10, la 5.11 y la
> 5.12, es una etapa interna hasta la 6.0.

## 1. Dónde cae este plan

AmoxSQL es una mesa de trabajo local: un archivo entra, un proceso lo transforma y
sale otro archivo, en la máquina de quien lo construye. Con la 5.11 esos procesos
corren solos, y con eso cambia lo que más duele: **ya no hay nadie mirando cuando
algo sale mal**. Esta versión se ocupa de eso, y de nada más:

- **E2 + E3 · El contrato de la fuente.** El archivo trae lo que debe, o el proceso se
  para y dice qué cambió, antes de entregar un Excel con una columna vacía.
- **E1, reducida · Las medidas del workspace, usables.** «Venta neta» se escribe
  `venta_neta(importe, estado)` en cualquier proyecto del workspace y da lo mismo.
- **H1 · Lo programado no estorba.** Un proceso de fondo no se come la máquina
  mientras trabajas.
- **J10 · Reintentos.** Una caída de red de un minuto no tumba el proceso de la noche.
- **F4 · La fecha de los datos.** Lo que se entrega dice de cuándo son sus datos.

Fuera, por la revisión del 2026-10-22 (ver `candidatos_v6.md`): la capa semántica
completa, columnas sensibles, el linaje del proyecto y la bitácora de acceso. Ya
existen `redact_pii`, la política de IA, la procedencia, el linaje de dbt y el
historial de ejecuciones.

**Tamaño:** cinco fases, la última de cierre. Si una fase crece más de lo previsto, se
recorta su alcance, no se añade otra fase.

## 2. Lo que el código ya da

| Pieza | Dónde | Qué aprovecha esta versión |
|---|---|---|
| Fuentes con nombre | `server/fuentes.js` (`normalizarDefinicion`, `montar`) | La definición gana `contrato`; el catálogo `fuentes` ya es el punto por el que todo lee |
| Nodo `schema_validation` | `ChainExecutor.js` | Compara columnas y tipos. **Fallo:** consulta `"${tabla}"` sin el esquema, así que detrás de un nodo de fuente (`fuentes.x`) no encuentra la tabla |
| Nodo `assert` | `ChainExecutor.js` | Filas, no vacía, sin nulos, único y consulta propia. **El mismo fallo de esquema** |
| Resumen de una ejecución | `server/ejecucion/resumen.js` | Qué leyó, qué dejó y dónde falló: aquí se anotan el contrato, los reintentos y la fecha de los datos |
| Medidas | `metrics.yml` (proyecto y workspace), `ai/contextLoader.js`, `ai/capaWorkspace.js` | Hoy sólo las lee la IA; pasan a ser macros |
| Contextos de ejecución | `server/ejecucion/ContextoDeEjecucion.js`, `server/motor.js` | Un solo sitio donde nace cada instancia: ahí se ponen los límites |
| Procedencia | `server/procedencia.js` | Los archivos de los que salió cada tabla, con su fecha: de ahí sale «la fecha de los datos» |
| Excel y publicar | `xlsxEscribir.js`, `xlsxPlantilla.js`, `publicar.js` (`KV_METADATA`) | Donde se escribe la fecha |

Comprobado al escribir el plan (motor 1.5.6):
- `CREATE MACRO revenue() AS sum(amount)` **falla**: una macro sin parámetros no ve las columnas de quien la llama.
- `CREATE MACRO revenue(amount, status) AS sum(amount) FILTER (WHERE status = 'paid')` **funciona**, agrupada o no: `SELECT store, revenue(amount, status) … GROUP BY ALL`.
- Un valor por defecto no puede nombrar una columna (`a := amount`).

## 3. Las decisiones que fija este plan

**Dec-37 · El contrato vive en la definición de la fuente y viaja con ella.** Va en
`fuentes/<nombre>.json` → `contrato`:

```json
{
  "columnas": [
    { "nombre": "Importe", "tipo": "numero", "obligatoria": true },
    { "nombre": "Fecha", "tipo": "fecha" }
  ],
  "estricto": false,
  "reglas": [
    { "tipo": "no_nulos", "columna": "Importe" },
    { "tipo": "unico", "columna": "Folio" },
    { "tipo": "rango", "columna": "Importe", "min": 0 },
    { "tipo": "valores", "columna": "Tienda", "valores": ["norte", "sur"] },
    { "tipo": "filas_minimas", "filas": 1 }
  ],
  "alFallar": "parar"
}
```

- **Los tipos son familias** (`texto`, `numero`, `fecha`, `logico`), no tipos del motor. Un Excel que hoy se lee como `BIGINT` y mañana como `DOUBLE` no rompe nada; uno cuya columna pasa a ser texto, sí.
- **«estricto»** también se para ante columnas que sobran.
- **`alFallar`**: `parar`, el valor por defecto, o `avisar` (el proceso sigue y la ejecución queda en aviso, como un test en *warn* de dbt).
- Sin contrato, todo funciona como hoy.
- **Con contrato, un Excel o un CSV se lee como texto y cada columna se convierte a su familia** (fase 0.3):
  - `numero` → `DOUBLE`;
  - `fecha` → `DATE`, desde una fecha `AAAA-MM-DD` o `DD/MM/AAAA` escrita como texto, o desde el número de serie de Excel.

  Leído con tipos, una celda vacía en la primera fila vuelve texto toda la columna (un falso fallo), y un «N/A» en medio pasa el `DESCRIBE` como número pero revienta la lectura en esa celda. Leído como texto y convertido, las dos cosas desaparecen, y lo que no convierte se cuenta y se nombra («"Importe" has 1 value that is not a number: N/A»).

  Lo que llega a los pasos siguientes tiene entonces el tipo del contrato, no el que adivina el motor. Parquet y los lagos ya traen tipos: sólo se comprueban.

**Dec-38 · El contrato se comprueba al correr, no al consultar.** Se comprueba:
- en cada ejecución de Data Flow que lee la fuente (un nodo de fuente, o SQL con `fuentes."x"`), **antes del primer paso**;
- al correr dbt desde AmoxSQL con esa fuente en `amoxsql.yml`;
- con el botón **Check** en la lista de fuentes.

Una consulta interactiva **no** lo comprueba: las vistas del catálogo son perezosas y comprobar en cada consulta sería releer el archivo.

Las columnas se comprueban con `DESCRIBE` y las reglas con **una sola consulta** que cuenta todas las violaciones. Medido en la fase 0.2, en un Excel de 50.000 filas: `DESCRIBE` tarda 21 ms; las reglas, 1,1 veces lo que cuesta leer el archivo; y leído como texto, convertido y con reglas, de 1,5 a 2,2 veces (0,3–0,7 s). Las reglas se escriben en una línea:

```sql
SELECT count(*) FILTER (WHERE "Importe" IS NULL) AS r0,
       count(*) - count(DISTINCT "Folio") AS r1, …
FROM fuentes."ventas"
```

**Dec-39 · Un contrato que falla dice qué cambió, en palabras.**
- «ventas: the column "Importe" is missing — "Monto" is new: was it renamed?»
- «"Fecha" was a date and now is text»
- «"Importe" has 3 empty values»

Si falta una columna y aparece otra nueva del mismo tipo, se sugiere el cambio de nombre. Va al aviso del sistema (D2), a la ficha de la ejecución, como el primer paso, y al estado de la fuente.

**Sin tabla nueva:** el historial de comprobaciones es el de las ejecuciones (`resumen`), y la lista de fuentes enseña las cinco últimas.

**Dec-40 · Contrato desde lo que hay.** **Take today's columns** escribe el contrato con las columnas y tipos de hoy, todas obligatorias. El autor quita lo que no importa y añade reglas. Nadie escribe un contrato desde cero.

**Dec-45 · Lo que falló se ve sin buscarlo: en la bienvenida y en el workspace.**
Petición del autor (2026-10-22). Hoy el botón de Operations se pone rojo con un número,
y la vista de workspaces lista ejecuciones, pero el **porqué** sólo está en la ficha.

- **«Needs attention»** es una lista de las ejecuciones que fallaron o quedaron en aviso y que nadie ha mirado todavía. Vale para procesos, dbt o un contrato que no se cumplió.
- Cada fila: el proceso, cuándo, **la razón en una línea** (la de Dec-39, o el error del paso), **Open** (la ficha), **Run again** y **Dismiss**.
- Aparece en dos sitios:
  - **la bienvenida**: una franja compacta con las de todos los workspaces, sólo si hay alguna (si no, la bienvenida queda exactamente como está);
  - **la ficha de cada workspace**, en la vista de workspaces: arriba, las suyas.
- **Ya vista** = la ficha se abrió, se pulsó Dismiss o se repitió y terminó bien. Se guarda en las preferencias de la base central (`fallos_vistos`, los ids de los últimos 30 días), **sin migración**.
- El botón de Operations de la barra de título cuenta las mismas, no sólo las de hoy. Un fallo de anoche que nadie miró sigue rojo por la mañana.
- `GET /api/operacion/atencion?workspace=<id>` y `POST /api/operacion/atencion/vista`.

> La bienvenida era intocable; el autor pide expresamente este cambio. Se limita a esta
> franja, que no aparece si no hay nada que atender.

**Dec-41 · Las medidas son macros temporales con las columnas como parámetros.**
- Cada medida de `metrics.yml` (workspace y proyecto; gana el proyecto) se convierte en `CREATE OR REPLACE TEMP MACRO <nombre>(<columnas>) AS <sql>`.
- Las columnas salen de los identificadores de la expresión, sin las palabras del motor, las funciones ni las cadenas, en el orden en que aparecen.
- Se crean al abrir la sesión y en cada contexto de ejecución. **Nunca se escriben** en la base del usuario (son `TEMP`).
- Si una macro no compila, se salta con un aviso en la lista de medidas, no al abrir.
- **Un nombre que ya es una función del motor o de una extensión no se crea nunca** (fase 0.1). Una medida llamada `sum` tapa a `sum()` en toda la sesión y rompe hasta las otras medidas. Se mira en `duckdb_functions()` antes de crearla.
- El editor completa `venta_neta(` con sus parámetros y la ayuda enseña la definición y la descripción.
- Una medida declara sus columnas a mano (`columnas: [importe, estado]`) si la extracción automática no basta.

**Dec-42 · Lo que corre de fondo tiene límites; lo de la interfaz, no.**
- Una ejecución con `origen` ≠ `interfaz` y la aplicación abierta (programada, línea de comandos con AmoxSQL abierto, lote) abre su instancia con:
  - `threads` = la mitad de los núcleos (al menos 1);
  - `memory_limit` = el 25 % de la memoria;
  - `temp_directory` en el home de AmoxSQL, para que lo que no quepa vaya a disco en vez de fallar.
- Sin la aplicación abierta (la tarea de Windows despierta a AmoxSQL), no hay a quién molestar: sin límites.
- dbt lanzado de fondo corre con prioridad «por debajo de lo normal» (`os.setPriority`).
- **Límite conocido:** un proceso con base `proyecto` comparte la instancia de la interfaz y no se puede limitar sin limitar al usuario. Se dice en la ficha («ran in the project database: not limited»), no se arregla aquí.
- Los porcentajes se pueden cambiar en **Settings → Scheduled processes**.
- Medido en la fase 0.4 (4 núcleos, 16 GB), con un análisis de 30 millones de filas en «la interfaz» mientras el fondo trabaja:

  | | La interfaz (p95) | El proceso de fondo |
  |---|---|---|
  | Sola | 2,2 s | — |
  | Fondo sin límites | 7,0 s | 47 s |
  | Fondo con límites | 3,3 s | 30 s |

  Con límites ganan los dos: la interfaz responde el doble de rápido y el fondo también termina antes, porque compite menos. Una consulta pequeña de la interfaz no se nota en ningún caso.
- **`temp_directory` es imprescindible:** con poca memoria y sin él, el motor falla («Out of Memory»); con él, va a disco y termina.
- La prioridad baja la hereda todo el árbol: `dbt.exe` y el `python.exe` que lanza (fase 0.5).
- Confirmado por el autor: el uso típico es poner procesos **muy temprano**, cada quien en su máquina. A esa hora, con la aplicación cerrada, corren sin límites. Si al llegar se abre AmoxSQL y se pone al día con lo perdido, esa puesta al día sí lleva límites: es justo cuando la persona empieza a trabajar.

**Dec-43 · Reintentar sólo lo que vale la pena reintentar.**
- Los nodos que leen de la red (`http_fetch`, `bucket_read`, `gsheet_read`, y `fuente` cuando es un *bucket*, un lago o una URL) aceptan `reintentos: { veces: 0–5, esperaSegundos }`. Por defecto `{ veces: 2, esperaSegundos: 30 }` en los procesos programados y 0 en la interfaz.
- Sólo se reintenta un error pasajero: tiempo agotado, conexión cortada, HTTP 429 o 5xx. Un 404, un permiso o una credencial no se reintentan.
- **El motor ya reintenta por su cuenta** (fase 0.6): 3 veces, con 100, 400 y 1.600 ms de espera. Un fallo de un par de segundos ya no tumba nada. Lo que AmoxSQL añade es **la espera larga**, para una caída de minutos; por eso se mide en decenas de segundos.
- Clasificación, por el mensaje del motor, comprobada con un servidor local:
  - pasajero: `HTTP (429|5xx)`, `Timeout was reached`, `Could not connect`, `Server returned nothing`;
  - definitivo: `HTTP 404`, `HTTP 401`.
- Cada reintento queda en el paso («2 retries») y en el resumen.
- De paso, `http_fetch` escapa la URL que mete en el SQL; hoy va tal cual.

**Dec-44 · «La fecha de los datos» es la del archivo más nuevo que se leyó.**
- Sale de los archivos que leyó la ejecución (fuentes e importaciones) o de la procedencia de las tablas que consulta una figura.
- Se escribe en:
  - el Excel, como propiedad del documento y, si se pide, como una línea visible («Data as of 21 Oct 2026»);
  - lo publicado (`KV_METADATA datos_al`);
  - la línea del resumen y del aviso;
  - el pie de las diapositivas de Report Flow, junto al sello de actualización que ya existe.
- Un dato remoto sin fecha no cuenta. Si no hay ninguna fecha, no se escribe nada en vez de inventarla.
- **En el Excel, la línea visible va apagada por defecto** (recomendación aceptada por el autor). La propiedad del documento se escribe siempre. Una línea visible mueve la hoja: en un libro del cliente o en una tabla que empieza en A1 rompería fórmulas y rangos. Se enciende por nodo (**Add "Data as of" line**). Con plantilla, si el libro tiene un nombre definido `datos_al`, esa celda se rellena: el cliente decide dónde va, sin mover nada.

## 4. Las fases

### Fase 0 · Pruebas de concepto (`scripts/poc513/`)
Cada prueba responde a una duda que puede cambiar una decisión:
- **0.1 (Dec-41):** extraer las columnas de las medidas del `metrics.yml` de ejemplo y de tres medidas reales con `FILTER`, `CASE` y un cociente, crearlas como macros temporales y usarlas agrupadas y sin agrupar.
- **0.2 (Dec-38):** cuánto tarda `DESCRIBE` sobre una fuente Excel de 50.000 filas y la consulta de reglas.
- **0.3 (Dec-37):** si la familia de tipo de una columna de Excel se mantiene entre dos archivos del mismo cliente.
- **0.4 (Dec-42):** un proceso pesado con y sin `threads`/`memory_limit`, mientras la interfaz consulta. ¿Se nota? ¿`temp_directory` evita el «out of memory»?
- **0.5 (Dec-42):** que `os.setPriority` funcione sobre el árbol de procesos de dbt en Windows.
- **0.6 (Dec-43):** qué errores devuelve el motor ante un 503, un 404, un tiempo agotado y una red caída. Sólo se reintenta lo que se pueda distinguir.

### Fase 1 · El contrato de la fuente y dónde se ve lo que falla (E2 + E3; Dec-37 a Dec-40, Dec-45)
- `server/contrato.js` (puro donde se pueda): normalizar, comprobar columnas por familia, la consulta única de reglas, el texto de cada fallo y la sugerencia de cambio de nombre.
- `fuentes.normalizarDefinicion` acepta `contrato`.
- `ejecutarProceso` comprueba antes del primer paso las fuentes que lee el proceso; dbt, antes de correr.
- `/api/fuentes/:nombre/comprobar` y `/api/fuentes/:nombre/contrato/de-hoy`.
- Arreglo: `schema_validation` y `assert` usan el esquema de lo que les llega (`fuentes.x`).
- **«Needs attention» (Dec-45):** el componente compartido, la franja de la bienvenida, el bloque en la ficha del workspace, los endpoints y el contador de Operations sobre lo no visto.
- **Interfaz:** en la ficha de la fuente, **Contract**: columnas con su familia y «required», reglas, *strict*, al fallar, **Take today's columns**, **Check** y las últimas comprobaciones.
- Prueba: `probarContrato.mjs`.

### Fase 2 · Las medidas, usables (E1 reducida; Dec-41)
- `server/medidas.js`: de `metrics.yml` a macros (columnas, compilar, saltar con motivo).
- Se crean en la sesión (al abrir el proyecto y al cambiar el archivo) y en `abrirContexto`.
- Editor: completado de `nombre(` con sus parámetros, la ayuda con la definición y la medida en la lista de funciones.
- El asistente las recibe como funciones que puede usar, no sólo como texto de contexto.
- Prueba: `probarMedidas.mjs`.

### Fase 3 · Lo de fondo no estorba y reintenta (H1, J10; Dec-42, Dec-43)
- `motor.crearInstancia(ruta, { fondo })` con los límites; `abrirContexto` lo pide según el `origen`.
- Prioridad baja para dbt de fondo.
- Ajustes en **Settings → Scheduled processes**.
- Reintentos en el ejecutor (alrededor de `executeNode`, sólo para los nodos de red), con la clasificación de la fase 0.6. **Retries** en el panel de esos nodos.
- La URL de `http_fetch`, escapada.
- Prueba: `probarFondo.mjs`, con un servidor local que devuelve 503 dos veces y luego 200.

### Fase 4 · La fecha de los datos (F4; Dec-44)
- `ejecucion/resumen.js` calcula `datosAl` con lo que leyó la ejecución.
- `xlsxEscribir` y `xlsxPlantilla` escriben la propiedad del documento y, si el nodo Excel lo pide, la línea visible.
- `publicar` escribe `datos_al`.
- Report Flow la toma de la procedencia y la pone en el pie.
- Prueba: `probarFechaDeLosDatos.mjs`.

### Fase 5 · Cerrar → **5.13.0** (sin publicar)
- Recorrido real (`scripts/poc513/p0N_recorrido_real.mjs`, home temporal): una fuente Excel con contrato; el archivo del cliente cambia «Importe» por «Monto»; el proceso programado se para, avisa y dice el cambio de nombre. Después: una medida usada en el proceso, un nodo HTTP que reintenta, y el Excel entregado con su fecha.
- Todas las `probar*.mjs` y `pnpm dist` (instalador local).
- Docs ES/EN:
  - *Contrato de la fuente*, en `data/sources.md` o en una página propia;
  - *Medidas del workspace*;
  - la sección de límites y reintentos en `data-flow/scheduling.md`;
  - la fecha de los datos en `data-flow/excel-output.md` y en Report Flow.
- `CLAUDE.md` y la versión **5.13.0** en los cuatro sitios, CHANGELOG «(sin publicar)», familia E marcada como hecha en `candidatos_v6.md`.

## 5. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| El contrato de un Excel «parpadea» porque el motor infiere tipos distintos cada semana | Familias de tipo (Dec-37) y la prueba 0.3; si aun así parpadea, `fecha` acepta texto con forma de fecha |
| Comprobar el contrato hace lento el proceso | Una sola consulta para todas las reglas y sólo al correr (Dec-38); medido en 0.2 |
| La extracción de columnas de una medida se equivoca | Las columnas se pueden declarar a mano; una macro que no compila se salta con su motivo (Dec-41) |
| Los límites hacen lento lo programado sin la aplicación abierta | Sin aplicación abierta no hay límites (Dec-42) |
| Reintentar un error permanente retrasa el aviso 1 minuto | Sólo se reintenta lo pasajero (Dec-43, 0.6) |
| «La fecha de los datos» engaña con datos remotos | Sin fecha, no se escribe nada (Dec-44) |

## 6. Decisiones del autor (respondidas el 2026-10-22)

1. **Al fallar el contrato, parar:** sí. Además, que se vea fácil, con la razón, **en la bienvenida y en el workspace** → Dec-45.
2. **25 % de la memoria y la mitad de los núcleos** para lo de fondo con la aplicación abierta: sí. El uso típico es programar flujos muy temprano, cada quien en su máquina (Dec-42).
3. **La línea «Data as of …» en el Excel:** según la recomendación, apagada por defecto, con la propiedad del documento siempre y el nombre definido `datos_al` en las plantillas (Dec-44).

## 7. Lo que queda fuera de la 5.13.0

- La capa semántica completa (medidas con granularidad, dimensiones y tabla propia): E1 se queda en macros.
- Tendencias de calidad (gráficos de cuántos nulos hubo cada semana): el historial está en las ejecuciones.
- Contratos para tablas de la base o modelos de dbt (dbt ya tiene sus tests).
- Límites para procesos con base `proyecto` (Dec-42).

## 8. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-22 | — | Plan escrito leyendo `main` en `d0a97e8`, tras recortar las familias E–K con el autor. Hallazgos que lo moldean: `schema_validation` y `assert` no encuentran una tabla del esquema `fuentes`; una macro sin parámetros no ve las columnas (con parámetros, sí); nada limita hoy los hilos ni la memoria de lo que corre de fondo; `http_fetch` mete la URL en el SQL sin escaparla y no reintenta. Decisiones Dec-37 a Dec-44; tres preguntas para el autor (§6) |
| 2026-10-22 | 0 | **Fase 0 hecha** (`scripts/poc513/`). **0.1** (`p00_medidas.mjs`): las medidas como macros temporales con las columnas como parámetros salen **9 de 9** iguales a su expresión, agrupadas y sin agrupar. Las del ejemplo y seis reales: `FILTER`, `CASE`, cociente con `NULLIF`, `::DOUBLE`, una columna con espacio entre comillas. Las columnas salen quitando lo que el motor llama palabras (`duckdb_keywords()`), funciones y cadenas. Funcionan con otra base adjunta, se listan en `duckdb_functions()` para el completado, y una que no compila falla al crearla. **Hallazgo:** una medida llamada `sum` tapa a `sum()` en toda la sesión y rompe las demás → regla nueva en Dec-41. **0.2 y 0.3** (`p01_contrato.mjs`): en un Excel de 50.000 filas, `DESCRIBE` tarda 21 ms y cinco reglas en una consulta, 1,07 veces la lectura. Las familias aguantan enteros → decimales y una columna de más, y un cambio de nombre se dice con su sugerencia. **Hallazgos:** una celda vacía arriba o fechas como texto vuelven texto la columna (falso fallo), y un «N/A» en medio pasa el `DESCRIBE` y revienta la lectura en su celda → Dec-37: con contrato, leer como texto y convertir. Sin falsos fallos, y el «N/A» se cuenta y se nombra; cuesta de 1,5 a 2,2 veces la lectura. **0.4 y 0.5** (`p02_fondo.mjs`): con límites, la interfaz pasa de 7,0 s a 3,3 s de p95 y el fondo de 47 s a 30 s. Sin `temp_directory`, poca memoria es «Out of Memory»; con él, termina. `setPriority` lo hereda el `python.exe` que lanza `dbt.exe`. **0.6** (`p03_red.mjs`): el motor ya reintenta 3 veces en unos 2 s; un 404 no se reintenta. La clasificación por mensaje acierta en los 7 casos → Dec-43 se queda en la espera larga |
| 2026-10-22 | — | **Respuestas del autor (§6):** parar ante un contrato roto, con lo que falla visible y su razón en la bienvenida y en el workspace (Dec-45, nueva; la bienvenida se toca sólo con esa franja, a petición suya); límites del 25 % y la mitad de los núcleos (los flujos suelen ir muy temprano); la línea «Data as of» apagada por defecto, con el nombre `datos_al` en las plantillas |
