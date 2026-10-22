# Plan 5.14.0 · El día a día

> El segundo y último tramo antes de la 6.0, tras el recorte del 2026-10-22 (ver
> `candidatos_v6.md`). Escrito leyendo `main` en `89a0718` (5.13.0). **No se publica**:
> como las anteriores, es una etapa interna hasta la 6.0, cuya funcionalidad nueva
> —un lienzo para el análisis de datos— se planea después.

## 1. Dónde cae este plan

La 5.13 hizo que lo que corre solo no entregue algo mal. La 5.14 es para quien trabaja
con AmoxSQL cada día: abrir un proyecto y saber dónde estaba, empezar el siguiente
como el último que funcionó, pasarlo a otra persona, y ver qué cambió entre dos
entregas o dos versiones de un proceso. Siete fichas, todas pequeñas o recortadas:

| Ficha | Qué |
|---|---|
| **F5** · Retomar | Al abrir un proyecto, dónde lo dejaste: sus pestañas, lo que falló, la entrega, lo que cambió |
| **G2 + G3** · Proyecto desde plantilla y paquete | Exportar un proyecto sin datos (o con ellos) a un archivo, y empezar uno nuevo desde él |
| **G1** reducida · La biblioteca del workspace | Los snippets del workspace, en todos sus proyectos, además de los del proyecto |
| **J6** · Cuaderno limpio | Marcar celdas como borrador y dejarlas fuera de lo que se exporta |
| **J1** · Mirar otro proyecto | Cruzar con los datos de un proyecto hermano, en sólo lectura, sin cerrar el tuyo |
| **F3** reducida · Comparar con la entrega anterior | Lo que entregó un proceso, comparado con lo que entregó la vez anterior |
| **J9** · Diff legible de procesos | Qué nodos de un `.sqlchain` se añadieron, quitaron o cambiaron, sin leer JSON |

**Tamaño:** cinco fases, la última de cierre. Sin fase de pruebas de concepto: lo que
hay que probar es pequeño y se prueba dentro de su fase. Si una fase crece, se
recorta su alcance.

## 2. Lo que el código ya da

| Pieza | Dónde | Qué aprovecha |
|---|---|---|
| Pestañas guardadas | `LayoutManager.jsx` (`amoxsql-layout-v1`) | Ya vuelven… pero la clave es **global**: al abrir otro proyecto intenta restaurar las del anterior y descarta las que no existen. F5 la hace por proyecto |
| Proyectos en la base central | `proyectos` (`estado`, `entrega`, `ultimo_abierto`), `workspaces.proyectosDe` | El estado, la entrega y los hermanos de un proyecto (J1) |
| Ejecuciones y «Needs attention» | `ejecuciones`, `ejecucion/atencion.js` | Lo que falló en este proyecto desde la última vez (F5) |
| Git | `/api/git/status`, `/api/git/diff`, `/api/git/log` | Lo que cambió desde la última vez (F5) y las versiones de un proceso (J9) |
| ZIP sin librerías | `server/zip.js` (`EscritorZip`, `abrir`) | El paquete del proyecto (G3) |
| Manifiesto del proyecto | `.amoxsql/project.json → requiere` (credenciales por nombre, extensiones, fuentes) | Lo que le falta a quien abre un paquete (G3) |
| Andamiaje | `server/projectScaffolder.js` | Crear un proyecto desde un paquete (G2) |
| Snippets | `/api/snippets` → `<proyecto>/.amox/snippets.json`, `SnippetsPanel.jsx` | El nivel del workspace (G1) |
| Cuaderno | `.sqlnb`: `<!-- celda: nombre materializada -->`, `cuaderno/exportar.js` | La marca `borrador` (J6) |
| Base de un proyecto | `ContextoDeEjecucion.baseDelProyecto` (`defaultDb` o la única `.duckdb`) | Qué base adjuntar de un hermano (J1) |
| Soltar bases para dbt | `dbtConvivir` suelta cualquier base adjunta (5.12) | Un hermano adjunto no bloquea a su dbt |
| Comparar resultados | `CompareResults.jsx` | La vista de F3 |
| Resumen de una ejecución | `ejecucion/resumen.js` (`guardados`) | De dónde sale «la entrega anterior» (F3) |

## 3. Las decisiones que fija este plan

**Dec-46 · «Donde lo dejaste» es una tarjeta, no un diálogo.** Al abrir un proyecto,
en la zona del editor (donde hoy dice «Create a new file to get started», o encima de
las pestañas restauradas), una tarjeta que se cierra con **Continue**:

- las pestañas que tenías (y que vuelven solas);
- lo que falló o avisó en este proyecto desde la última vez que lo abriste (lo de «Needs attention», filtrado);
- su estado y su entrega («due Thursday»);
- cuántos archivos cambiaron (git, si lo hay) y la última ejecución de cada proceso.

Las pestañas se guardan **por proyecto** (la clave lleva el id del proyecto). Si no hay
nada que contar (un proyecto nuevo), no hay tarjeta.

**Dec-47 · Un paquete de proyecto es un ZIP `.amoxproject` y nunca lleva secretos.**

- Lleva los procesos, consultas, cuadernos, gráficos, decks, el contexto del asistente, `fuentes/` y `destinos/` del proyecto, y `project.json` (sin su `id`, que es de esta carpeta).
- **Los datos van aparte y se eligen.** Al exportar, una lista con lo que no es «del proyecto», desmarcado de serie: las bases (`.duckdb`, lagos), los datos (`csv`, `xlsx`, `parquet`, `json`…) y la carpeta de trabajo (`.amoxsql/trabajo`, `.amox`). Excepción: una plantilla de Excel que usa un nodo Excel va marcada, porque sin ella el proceso no corre.
- **Nunca** credenciales (sólo viajan sus nombres, en el manifiesto), la carpeta `.git` ni los registros.

**Dec-48 · Empezar desde un paquete es crear un proyecto.** **New project → From a
package…** pide el `.amoxproject` y la carpeta, lo extrae, le da un `id` nuevo y lo
abre. Enseña lo que le falta: fuentes sin ubicar aquí, credenciales y extensiones que
pide su manifiesto. G2 («desde plantilla») es esto mismo: un paquete sin datos es una
plantilla. Además, **Save as template…** exporta sin datos de un clic.

**Dec-49 · La biblioteca del workspace es un archivo del workspace.** Los snippets del
workspace viven en `<home>/workspaces/<id>/snippets.json` y viajan con el
`.amoxworkspace`. El panel los enseña juntos, cada uno con su origen; al guardar uno
se elige dónde va («This project» o el workspace). El nivel personal queda fuera.

**Dec-50 · Un borrador es una marca de la celda.** `<!-- celda: nombre borrador -->`
(como `materializada`). Una celda en borrador se ve atenuada, sigue corriendo y
dejando su vista, pero **no sale** en ninguna exportación (HTML, Word, PDF ni tablero).
Antes de exportar se dice cuántas se quedan fuera.

**Dec-51 · Mirar otro proyecto es adjuntar su base en sólo lectura, con su nombre.**

- **Look at another project…** en el explorador lista los proyectos del mismo workspace que tienen base.
- Al elegir uno, su base se adjunta `READ_ONLY` como `"<nombre del proyecto>"` y se consulta `"cierre_norte".main.ventas`.
- Dura lo que la sesión. No se escribe nunca en ella.
- Si dbt de ese proyecto la necesita, se suelta como cualquier otra base adjunta (5.12).

**Dec-52 · «La entrega anterior» se guarda al reemplazarla.**

- Cuando un nodo Excel, Export File o Publish va a escribir encima de un archivo que ya existe, el que había se copia a `<proyecto>/.amoxsql/entregas/<ruta>/<fecha>.<ext>`.
- Se guardan las **5 últimas** de cada archivo, y ninguna de más de 200 MB.
- En la ficha de la ejecución, cada archivo guardado tiene **Compare with the previous one**: se leen los dos con el motor (la primera hoja en un Excel) y se ven las filas que aparecen, desaparecen o cambian por una columna clave que se elige.
- No se compara un archivo remoto.

**Dec-53 · El diff de un proceso habla de nodos, no de JSON.** Una función pura compara
dos `.sqlchain`:

- nodos añadidos, quitados y cambiados (por su etiqueta, con cada campo que cambió en palabras: «Filter · condition: `tienda = 'norte'` → `tienda IN ('norte', 'sur')`»);
- conexiones nuevas o quitadas;
- parámetros y variables.

Se usa en el panel de Git al mirar un `.sqlchain` (en vez del diff de texto) y en
Data Flow con **What changed** frente al último commit.

## 4. Las fases

### Fase 1 · Donde lo dejaste (F5; Dec-46)
- Las pestañas, por proyecto (y la de antes, migrada a la del proyecto que estaba abierto).
- `GET /api/proyecto/retomar`: estado y entrega, lo que falló o avisó desde la última apertura (de `ejecuciones`), la última ejecución de cada proceso y los cambios de git.
- La tarjeta en la zona del editor, con **Continue** y enlaces (abrir la ficha, abrir el proceso).
- Prueba: `probarRetomar.mjs`.

### Fase 2 · El paquete y el proyecto desde plantilla (G2 + G3; Dec-47, Dec-48)
- `server/paquete.js`:
  - qué archivos son del proyecto y cuáles son datos;
  - exportar a `.amoxproject` con `EscritorZip`;
  - leer el manifiesto de un paquete;
  - extraer en una carpeta nueva (nunca encima de una que no esté vacía) con `id` nuevo.
- `POST /api/proyecto/exportar` (con la lista elegida), `POST /api/proyecto/desde-paquete`.
- Interfaz:
  - **Export project…** con la lista de datos a llevar, y **Save as template…**;
  - **New project → From a package…**, que enseña lo que le falta.
- Prueba: `probarPaquete.mjs` (que nunca viaje un secreto ni `.git`; que la plantilla de Excel del nodo sí; ida y vuelta).

### Fase 3 · Biblioteca, cuaderno limpio y mirar otro proyecto (G1, J6, J1; Dec-49 a Dec-51)
- Snippets del workspace: `/api/snippets?nivel=workspace`, el panel con los dos orígenes, y que viajen en el `.amoxworkspace`.
- `borrador` en `cuadernoFile.js`, el botón en la cabecera de la celda y la exportación sin ellos (con el aviso).
- **Look at another project…**: la lista de los hermanos con base, adjuntar y soltar, y su sección en el explorador.
- Prueba: `probarBiblioteca.mjs` y las de cuaderno y explorador que ya existen, ampliadas.

### Fase 4 · Comparar (F3, J9; Dec-52, Dec-53)
- `server/entregas.js`: guardar la anterior al reemplazar (Excel, Export File, Publish), la poda (5, 200 MB), `POST /api/entregas/comparar` (filas añadidas, quitadas y cambiadas por clave). **Compare with the previous one** en la ficha, con la vista de `CompareResults`.
- `server/diffDeProcesos.js` (pura) y su vista: en el panel de Git para un `.sqlchain` y **What changed** en Data Flow.
- Prueba: `probarComparar.mjs`.

### Fase 5 · Cerrar → **5.14.0** (sin publicar)
- Recorrido real (`scripts/poc514/p0N_recorrido_real.mjs`, home temporal): abrir un proyecto con un fallo de anoche (la tarjeta lo dice); exportarlo sin datos; crear otro desde el paquete y ver lo que le falta; un snippet del workspace en los dos; un cuaderno con un borrador que no sale al exportar; mirar la base del primero desde el segundo; una entrega que cambia y su comparación; el diff del proceso tras cambiar un filtro.
- Todas las `probar*.mjs` y `pnpm dist` (instalador local).
- Docs ES/EN, `CLAUDE.md`, versión **5.14.0** en los cuatro sitios, CHANGELOG «(sin publicar)», fichas marcadas hechas en `candidatos_v6.md`.

## 5. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| Un paquete se lleva algo que no debía (una contraseña en un `.env`, una base enorme) | Lista explícita de lo que viaja, datos desmarcados de serie, nunca `.git` ni `.env*` ni registros (Dec-47); la prueba lo comprueba |
| Las entregas anteriores llenan el disco | 5 por archivo y ninguna de más de 200 MB (Dec-52); viven en `.amoxsql/entregas/`, fuera de git |
| Comparar dos Excel grandes es lento | Se comparan por una clave, en el motor, y se enseña el recuento con una muestra |
| Adjuntar la base de un hermano la bloquea para su dbt | Se suelta como cualquier base adjunta (5.12, `dbtConvivir`) |
| Pestañas de un proyecto que se abren en otro | La clave por proyecto (Dec-46) |

## 6. Decisiones del autor (respondidas el 2026-10-22)

1. **El paquete:** `.amoxproject`, con los datos desmarcados de serie salvo las plantillas de Excel que usa un proceso. Sí.
2. **Las entregas anteriores:** las 5 últimas de cada archivo en `.amoxsql/entregas/`, sin las de más de 200 MB. Sí.
3. **«Donde lo dejaste»:** la tarjeta en la zona del editor que se cierra con **Continue**. Sí.

## 7. Lo que queda fuera de la 5.14.0

- La biblioteca personal (G1 completa): sólo el nivel del workspace.
- Instantáneas de cualquier resultado (F3 completa): sólo las entregas de un proceso.
- Paquetes cifrados o firmados.
- Comparar procesos sin git (dos archivos cualesquiera): la función lo permite; la interfaz, sólo frente a git.

## 8. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-22 | — | Plan escrito leyendo `main` en `89a0718`. Hallazgos que lo moldean: las pestañas se guardan con una clave global (al abrir otro proyecto se intenta restaurar las del anterior); el cuaderno ya admite una marca por celda (`materializada`), así que el borrador cabe igual; `dbtConvivir` ya suelta cualquier base adjunta, así que mirar otro proyecto no bloquea su dbt. Decisiones Dec-46 a Dec-53; tres preguntas para el autor (§6) |
| 2026-10-22 | — | **Respuestas del autor (§6):** sí a las tres. Empieza la fase 1 |
| 2026-10-22 | 3 | **Fase 3 hecha**, `probarBiblioteca.mjs` **32/32**. **G1:** `GET/POST /api/snippets/workspace` guardan en `<home>/workspaces/<id>/snippets.json` (sólo nombre, SQL y descripción); `snippets.json` entra en lo permitido del workspace y viaja en el `.amoxworkspace`; un proyecto suelto no tiene dónde guardarlos (400). El panel de snippets enseña «<workspace> · shared» y «This project» delante de los de serie, con **Save in** al añadir. **J6:** `borrador` en la directiva (`<!-- celda: nombre materializada borrador -->`, `<!-- celda borrador -->` sin nombre); una celda de texto lleva `<!-- texto borrador -->` y la que va detrás `<!-- texto -->` para no pegarse; un cuaderno sin borradores se escribe byte a byte igual que antes. El mando está en el canalón (lápiz), la celda se ve apagada con el filo punteado y la etiqueta «draft»; `celdasParaExportar`, `graficosQueNoSalen` y `planDeTablero` los dejan fuera, y Word y el tablero dicen cuántos. **J1:** `server/hermanos.js` lista los proyectos del workspace (menos el abierto) con la base que se adjuntaría (`baseDelProyecto`) o por qué no; `mirar` sólo acepta uno de la lista y adjunta `READ_ONLY` como el nombre del proyecto normalizado (`Ventas Sur` → `"ventas_sur"`); `soltar` sólo suelta lo que adjuntó; esos catálogos salen de `userTablesWhereClause` para que el árbol propio no se mezcle. **Other projects** en el explorador de base (`OtrosProyectos.jsx`). **Hallazgos:** los endpoints de snippets usaban `conCentral` antes de su `const` (habría tirado el servidor al arrancar): movidos detrás; el menú de elegir proyecto, `fixed` dentro de la barra lateral, salía desplazado y recortado: va en un portal. **Recorrido en el navegador integrado** (demo con un hermano `ventas-sur`): adjuntarlo, sus tablas y columnas, el árbol propio sólo con `cierre`; un cuaderno con una celda SQL y un texto en borrador, apagados; «Export to Word» dice «2 draft cells stay out of the document». La guarda de la palabra encontró un «The workspace» en el panel de snippets: ahora usa la palabra del usuario. Las 61 suites en verde |
| 2026-10-22 | 2 | **Fase 2 hecha**, `probarPaquete.mjs` **17/17**. `server/paquete.js`: `contenido` (lo del proyecto, que viaja siempre, y los datos, que se eligen: bases y datos desmarcados; la plantilla que llena un nodo Excel, marcada y con su motivo; más de 1 GB, no se ofrece), `exportar` (ZIP con `amoxproject.json`, `project.json` sin `id`, escrito aparte y renombrado; los archivos grandes en flujo), `leer` y `extraer` (sólo en una carpeta nueva o vacía; una entrada con `..` o absoluta se rechaza y nada se escribe fuera). Nunca viajan `.git`, `.env*`, claves (`.pem`, `.key`…), la carpeta de trabajo, las entregas ni lo de `.amox` salvo snippets y marcadores; la prueba busca el secreto de un `.env` y del `.git` en todo el paquete, comprimido y descomprimido. Al crear un proyecto desde el paquete, `manifiesto.comprobar` dice lo que falta (la credencial por su nombre, la fuente sin su archivo) y al abrirlo el registro le da un `id` propio. Interfaz: **Export project…** y **Save as template…** en el menú del proyecto de la barra de título (`paquete/ExportarProyecto.jsx`), y **From a package…** en la vista de workspaces, junto a Import… (`paquete/DesdePaquete.jsx`; la bienvenida no se toca). **Hallazgo:** la regla «de `.amox` sólo snippets y marcadores» se aplicaba también a la carpeta y la saltaba entera. **Recorrido en el navegador integrado:** el diálogo de exportar con su contenido (había un párrafo que se partía en dos columnas por ser `flex`: arreglado); el de crear desde un paquete necesita los diálogos nativos de Electron, así que sólo lo cubre la prueba. Las 60 suites en verde |
| 2026-10-22 | 1 | **Fase 1 hecha**, `probarRetomar.mjs` **11/11**. `server/retomar.js` + `GET /api/proyecto/retomar`: el estado y la entrega del proyecto, lo de «Needs attention» de ESTE proyecto (`atencion.listar` filtra ahora por `proyecto`), la última ejecución de cada proceso, lo que corrió desde la última apertura, git (commits nuevos con sus autores y archivos sin guardar) y las fuentes que aquí no se leen o llegan viejas. La apertura anterior sale de `workspaces.registrar`, que devuelve la fila de antes de anotar esta (`ultimo_abierto` en UTC; las ejecuciones, en hora local: se comparan como fechas); una fila recién creada no cuenta como apertura anterior. Las pestañas se guardan **por proyecto** (`amoxsql-layout-v1:<carpeta>`); la clave global de antes se usa una vez y se borra. `Retomar.jsx`: la tarjeta en la zona del editor, encima de lo que haya, que se cierra con **Continue** (con **Open <proceso>** del último que corrió). **Hallazgo:** lo que se corre desde la interfaz no guarda resumen, así que su nombre salía del archivo («cierre») y no del proceso («Cierre semanal»): `atencion.nombreDeProceso` lo lee del propio `.sqlchain`. **Recorrido en el navegador integrado** (demo de la 5.13): la tarjeta con Needs attention y su razón, «Your tabs are back», «Last runs · since last time: 2 runs, 1 failed»; Continue la cierra; en `localStorage` queda sólo la clave del proyecto. Las 59 suites en verde |
