# Plan de implementación — 5.11.0: procesos que corren solos

> La familia **D** (D1–D8) de [`candidatos_v6.md`](candidatos_v6.md), en fases, con la
> numeración que lleva de la 5.10.0 a la **5.11.0**: el tercer tramo del camino a la 6.0.0,
> y el que completa la tesis. Hecho leyendo el código de la 5.10.0-beta.1, no suponiéndolo:
> cada decisión cita lo que encontró. Fecha: 2026-10-03.

---

## 1. Dónde cae este plan

| Versión | Familia | Estado |
|---|---|---|
| 5.9.0 | A + B · cimientos y workspaces | Publicada el 2026-10-01 |
| 5.10.0 | C · los datos donde están | beta.1 publicada; falta el cierre (fase 7, con el autor) |
| **5.11.0** | **D · procesos que corren solos** | **Este plan** |
| 5.12.0 | I · el ingeniero de datos: dbt y DuckLake | Siguiente |
| … | E, F, G, H, J | 5.13.0 a 5.17.0 |
| 6.0.0 | K · Python y experimentos | Cierra la 6 |

La tesis de la 6 —«workspaces gobernados por AmoxSQL, y procesos de archivo a archivo que
corren solos»— queda **entera** con la 5.11.0. La 5.9.0 puso el workspace y la línea de
comandos; la 5.10.0, de dónde vienen los datos y adónde van; la 5.11.0 pone **cuándo
corren, con qué valores, quién se entera y qué sale**.

Lo que pide la familia, en una frase: **el cierre mensual corre a las 7:00 del primer día
hábil aunque nadie abra AmoxSQL, deja el Excel que espera el cliente en su carpeta, y
avisa de cómo salió.** Y quien no escribe SQL puede lanzarlo desde un formulario.

## 2. La numeración de este tramo

| Hito | Versión | Qué lleva | Cómo se publica |
|---|---|---|---|
| D3 + D4 + D5 | **5.11.0-alpha.1** | Salida a Excel de verdad, parámetros con tipo y en lote, y correr sin ver SQL | *Prerelease* |
| D6 + D1 + D2 | **5.11.0-alpha.2** | Destino de entrega, programación y avisos | *Prerelease* |
| D7 + D8 | **5.11.0-beta.1** | El panel de operación y disparar al llegar un archivo. Completa: desde aquí sólo arreglos | *Prerelease* |
| Arreglos | **5.11.0-beta.N** | Sólo correcciones | *Prerelease* |
| Cierre | **5.11.0** | Lo mismo que la última beta | Release normal, pasa a *Latest* |

D3 va primero, como pedía `candidatos_v6.md` §6: no depende de nada y es lo que antes
llega a los pilotos. D4 va antes que D1 porque la programación guarda **parámetros** y el
formulario de D5 sale de ellos.

Las reglas de siempre: número en cuatro sitios, rama `release/v…`, `--prerelease`, Drive
en `prerelease\`. **La 5.11.0-alpha.1 espera a que la 5.10.0 esté cerrada** (es del autor
pasarla a *Latest*); mientras, las fases avanzan en sus ramas y se mergean a `main`.

### Convivir con la 5.10 mientras dura el camino

| Qué toca la 5.11 | Si luego se abre la 5.10… | Cómo se consigue |
|---|---|---|
| La base de AmoxSQL (migración 4: programaciones, destinos, columnas nuevas de `ejecuciones`) | **Se niega a abrirla** (esquema v4 > v3) | Lo mismo que Dec-8: llega en la primera alfa que la necesita (alpha.2) y se dice en sus notas |
| Un `.sqlchain` con parámetros con tipo (`parametros`) | Los ignora y usa `variables` como siempre | Los valores por defecto siguen en `variables`; `parametros` sólo añade tipo, etiqueta y opciones |
| Un nodo `excel` (D3) | Falla al correr ese nodo (tipo desconocido); el resto, bien | Dicho en las notas |
| La tarea del sistema operativo (D1) | Llama a `AmoxSQL.exe tick`, que la 5.10 no entiende: arranca la ventana | Las notas lo dicen; volver a la 5.10 pide borrar las programaciones antes (Settings → Schedules → «Remove all») |

---

## 3. Lo que el código ya da

| Hallazgo | Dónde | Consecuencia |
|---|---|---|
| La línea de comandos existe: `AmoxSQL.exe run <proceso> --project <ruta> --param n=v`; si AmoxSQL está abierto, la orden **se le entrega** (instancia única) y el arranque nuevo sólo espera el resultado | `electron/main.js` (`ordenInicial`, `esperarALaAbierta`), `server/ejecucion/ordenes.js`, `lineaDeComandos.js` | D1 no inventa cómo correr sin ventana: la tarea del sistema llama al mismo ejecutable con una orden nueva, `tick`, que reutiliza todo el camino |
| Cada ejecución deja una fila en `ejecuciones` (proceso, proyecto, workspace, origen, estado, error, parámetros) y su detalle en `amoxsql_chains.runs/node_runs`; la de la línea de comandos deja además `<home>/registros/<id>.log` | `server/ejecucion/historial.js`, `lineaDeComandos.js` | La bitácora de D2 y el panel de D7 leen lo que ya se escribe; falta saber **qué programación** la lanzó y **para qué hora** estaba prevista (migración 4) |
| `ejecucion.origen` ya distingue `interfaz` y `linea_de_comandos` | `ejecutarProceso.js` | Se añaden `programada`, `al_llegar` y `formulario` |
| Las variables de Data Flow son `{nombre: valor}` en texto, y `${nombre}` se pega tal cual en **toda** la configuración del nodo (SQL, rutas, nombres) | `ChainExecutor.applyVars`, `executeNode` | D4: lo que llegue de fuera ya no se pega a ciegas en el SQL (Dec-19). Ojo: el nodo `sql_file` lee su archivo **sin** sustituir variables |
| Comprobado (fase 0): `getvariable('x')` con un valor de texto se compara bien con una fecha y un número; las variables del motor son **por conexión** | prueba rápida, 2026-10-03 | Se fijan con `SET VARIABLE` en la conexión que corre cada paso, no una vez al abrir |
| La salida a Excel es `COPY … (FORMAT GDAL, DRIVER 'xlsx')`: una hoja plana, sin formato, y obliga a cargar `spatial` (pesada, pide red la primera vez) | `ChainExecutor.js` (`export_file`), `/api/export-data` | D3 escribe el libro con un escritor propio (Dec-20) y deja de necesitar `spatial` para escribir Excel |
| El libro de Excel ya se **lee** con un lector propio del ZIP (directorio central, ZIP64, `inflateRaw`) | `server/xlsxMeta.js` | La mitad de leer de D3 (abrir la plantilla del cliente) ya está; falta escribir el ZIP |
| Publicar ya escribe aparte y renombra con reintentos, y sabe quién tiene abierto un Office | `server/publicar.js` (`renombrarConReintentos`, `quienLoTiene`) | D6 y D3 dejan el archivo con el mismo escritor atómico |
| Las fuentes ya tienen dos mitades: definición que viaja y ubicación por máquina (`fuentes_locales`) | `server/fuentes.js`, migración 3 | Un destino de entrega (D6) es lo mismo con la flecha al revés (Dec-21) |
| La vigilancia de carpetas de fuentes avisa cuando llega un archivo **quieto** | `server/llegadas.js`, SSE `/api/fuentes/llegadas` | D8 es suscribirse a esa misma señal |
| La vista de workspaces es una pantalla aparte, con «Welcome» para volver, y ya lee `ejecuciones` | `client/src/components/workspaces/VistaWorkspaces.jsx`, `workspaces.resumenInicio` | El panel de operación (D7) es otra vista hermana, con el mismo patrón; la bienvenida no se toca |
| No hay ninguna programación, ni aviso del sistema, ni bandeja | `electron/main.js` | D1 y D2 empiezan de cero en el proceso principal |

---

## 4. Las decisiones que fija este plan

Siguen la numeración de la 5.9 y la 5.10 (**Dec-1 … Dec-14** siguen vigentes).

**Dec-15 · Lo programado es de la máquina.** Una programación —qué proceso, cuándo, con qué
parámetros, a quién avisar— va a la base de AmoxSQL (Dec-5), no al `.sqlchain`. Copiar un
proyecto a otra máquina no lo hace correr dos veces; abrirlo en la máquina de un
compañero no le programa nada. El proceso sí guarda lo que es suyo: sus parámetros y su
destino.

**Dec-16 · Una sola tarea del sistema, apuntada a la próxima hora que toque.** AmoxSQL
registra **una** tarea en el Programador de tareas de Windows («AmoxSQL — scheduled
processes»), con un único disparador a la hora de la próxima programación pendiente y
*StartWhenAvailable* (si la máquina estaba apagada, corre al encenderse). La tarea llama a
`AmoxSQL.exe tick`, que corre lo que toca, se pone al día y **reescribe el disparador** a la
siguiente hora. Así: una tarea en vez de una por proceso, ninguna regla de calendario
traducida al lenguaje del programador (días hábiles y festivos se calculan en AmoxSQL), y
ningún arranque cada pocos minutos. Si AmoxSQL está abierto, el `tick` se le entrega (Dec-1)
y además la aplicación abierta lleva su propio reloj, así que no depende de la tarea. Cada
ocurrencia tiene una clave (programación + hora prevista) anotada en `ejecuciones`: correr
dos veces la misma es imposible aunque lleguen el reloj y la tarea a la vez.
Sin contraseña: la tarea corre **sólo con la sesión del usuario iniciada**
(*InteractiveToken*), que es lo que puede hacer sin pedir privilegios y lo que necesita para
leer el llavero (A1). Se dice en la interfaz.
**Y es opcional** (con el autor, 2026-10-05): en Settings, «Correr aunque AmoxSQL esté
cerrado», **apagado por defecto**. Apagado, no hay nada en el Programador de tareas: las
programaciones corren con el reloj de la aplicación abierta y, al abrirla, se pone al día
(Dec-17). Encenderlo crea la tarea; apagarlo la borra. Se descartaron, con el autor, dejar
AmoxSQL residente en la bandeja (memoria todo el día, y si alguien lo cierra no corre nada)
y un servicio de Windows (pide administrador y no puede leer el llavero del usuario).

**Dec-17 · Ponerse al día corre una vez lo último que se perdió, y lo dice.** Si la máquina
estuvo apagada tres días y el proceso es diario, corre **una** vez (la ocurrencia más
reciente, con sus parámetros de fecha) y avisa «se perdieron 3, se corrió la última». Por
programación se puede elegir «no ponerse al día». Nunca se corre una ocurrencia de hace
más de 7 días.

**Dec-18 · Reglas legibles, no cron.** Cada día (con qué días de la semana), cada semana,
cada mes (día N · primer día hábil · último día hábil · N-ésimo día hábil), y cada N horas
dentro de una franja. Una función pura, `siguiente(regla, desde, calendario)`, con pruebas.
El **calendario** (qué días se trabaja y qué festivos) es del workspace:
`<home>/workspaces/<id>/calendario.json`, que viaja en el `.amoxworkspace` como el resto de
su contexto. Sin workspace: de lunes a viernes, sin festivos. La interfaz enseña las
próximas cinco fechas mientras se escribe la regla.

**Dec-19 · Un valor que llega de fuera nunca se pega a ciegas en el SQL.** Un parámetro
puede declarar su **tipo** (texto, número, fecha, lista de opciones, sí/no). Dentro del SQL
de un paso, `${x}` se sigue escribiendo igual, pero:
- fuera de comillas, un parámetro **con tipo** se convierte en `getvariable('x')` y su valor
  se fija con `SET VARIABLE` y su tipo en la conexión del paso;
- dentro de una cadena (`'ventas_${semana}'`) el valor va como texto con las comillas
  dobladas;
- dentro de un identificador (`"${tabla}"`) el valor tiene que ser un identificador válido;
- fuera de comillas y **sin tipo** (como todos los procesos de hoy) se pega igual que
  siempre si es un número o una palabra, y si no, se detiene y pide declarar el tipo.
En rutas y nombres de archivo, el valor va como texto y no puede contener separadores de
carpeta ni `..`. Lo de hoy sigue corriendo igual; lo que llega de un formulario, de la línea
de comandos o de un lote no puede colar SQL.

**Dec-20 · El Excel lo escribe AmoxSQL, sin librería.** Un libro `.xlsx` es un ZIP de XML.
AmoxSQL ya lo lee (`xlsxMeta.js`); escribirlo es un ZIP propio (`zlib.deflateRawSync` y
CRC-32 en una tabla) y un SpreadsheetML mínimo: varias hojas, encabezado en negrita y fijo,
filtro, ancho de columna según el contenido, formatos de número y fecha según el **tipo**
de la columna (no según el texto). La **plantilla del cliente** se copia y sólo se tocan
las celdas de datos indicadas (hoja + celda de inicio, o una tabla de Excel que crece); el
resto del libro —fórmulas, gráficos, formatos, otras hojas— queda como estaba, y el libro
pide recalcular al abrirse. Se escribe aparte y se renombra (Dec-13). Ninguna dependencia
nueva, y escribir Excel deja de necesitar la extensión `spatial`.

**Dec-21 · Un destino de entrega tiene las dos mitades de una fuente.** La definición
—nombre (`entrega-cliente`), patrón del nombre del archivo (`ventas_{fecha}.xlsx`)— vive en
el workspace o el proyecto y viaja; **dónde** está esa carpeta en esta máquina es de la
máquina (`destinos_locales`, migración 4). El patrón admite `{fecha}`, `{fecha:AAAA-MM}`,
`{hora}` y cualquier parámetro (`{tienda}`). Entregar es escribir aparte y renombrar; lo
que ya existe con ese nombre se sustituye, y la bitácora dice dónde quedó.

**Dec-22 · El aviso dice lo que pasó en una línea, y su clic lleva a la ejecución.** Aviso
del sistema desde el proceso principal: «Cierre mensual · 3 archivos leídos, 1 guardado ·
4 s», o «Cierre mensual falló en "Unir ventas": …». Por programación: avisar siempre, sólo
si falla, o nunca (por defecto: siempre). Lo que se corre a mano desde la interfaz no avisa
(ya se está viendo).

**Dec-23 · Disparar al llegar sólo con AmoxSQL abierto, y se dice.** D8 se suscribe a la
vigilancia de la fuente de carpeta (C3), que exige un archivo quieto (Dec-14). Varias
llegadas seguidas son **una** ejecución (se espera a que pase un minuto sin llegar nada).
La interfaz lo dice junto a la regla: «sólo mientras AmoxSQL está abierto».

**Dec-24 · El panel de operación es una vista aparte, como la de workspaces.** No sustituye
la bienvenida. Se llega desde la vista de workspaces, desde un botón en la barra de título
(con el número de lo que toca hoy) y desde la paleta de comandos. «Pausar todo hasta…»
guarda una fecha: la tarea del sistema no se borra; cada `tick` mira la fecha, no corre
nada y lo apunta.

**Dec-25 · Windows primero.** El programador es una interfaz con una implementación para
Windows (`schtasks` con XML). En otros sistemas, hasta que exista su instalador (iniciativa
*web y Mac*), las programaciones corren **sólo con AmoxSQL abierto**, y la interfaz lo dice.

---

## 5. Las fases

### Fase 0 · Pruebas de concepto

| # | Qué | Cómo se sabe que vale |
|---|---|---|
| 0.1 | La tarea del sistema | `schtasks /Create /XML` con un *TimeTrigger*, *StartWhenAvailable* e *InteractiveToken*, sin privilegios; reescribir su hora; que llame a `AmoxSQL.exe tick` y que, con AmoxSQL abierto, la orden se entregue. **Toca la configuración del sistema del autor: se pide permiso antes, con un nombre de tarea de prueba que se borra al terminar** |
| 0.2 | El aviso | Un aviso del sistema desde un arranque sin ventana (`app.setAppUserModelId`), y que su clic abra AmoxSQL en la ejecución |
| 0.3 | Escribir Excel | El libro propio lo leen el motor (`read_xlsx`) y un lector de Excel independiente; tipos, fechas, formatos y anchos correctos. La plantilla: una con fórmulas, una tabla y un gráfico sobre la tabla; después de escribir, la fórmula sigue, la tabla creció y el gráfico apunta a la tabla |
| 0.4 | Parámetros | El reescritor de `${x}` sobre todos los `.sqlchain` de ejemplo del repositorio: el SQL resultante corre igual que el de hoy |
| 0.5 | El coste de un `tick` | Tiempo y memoria de arrancar sin ventana, correr nada y salir: decide si el reloj de la aplicación abierta basta con un minuto |

### Fase 1 · Salida a Excel de verdad (D3) → **5.11.0-alpha.1**

| # | Qué |
|---|---|
| 1.1 | `server/xlsxEscribir.js`: ZIP propio + libro (hojas, estilos, anchos, encabezado fijo, filtro, formatos por tipo, fechas como número de serie), con límite de filas de Excel y error claro |
| 1.2 | `server/xlsxPlantilla.js`: abrir la plantilla, escribir en hoja + celda o en una tabla de Excel (ajustando su `ref`), conservar todo lo demás, `fullCalcOnLoad` |
| 1.3 | Nodo **Excel** en Data Flow: una hoja por cada nodo de entrada (nombre de hoja editable), o «rellenar plantilla»; deja el archivo con el escritor atómico. `export_file` en `xlsx` pasa a usar el escritor propio (sin `spatial`) |
| 1.4 | La exportación de la interfaz (`/api/export-data`) también: Excel con formato |
| 1.5 | `scripts/probarExcelSalida.mjs` + fixtures de plantilla (generadas por un script de Python en `scripts/fixtures/excel/`) |

### Fase 2 · Parámetros con tipo y en lote (D4)

| # | Qué |
|---|---|
| 2.1 | `parametros` en el `.sqlchain`: `[{nombre, tipo, etiqueta, opciones, ayuda}]`; el valor por defecto sigue en `variables` |
| 2.2 | `server/parametros.js`: validar un valor contra su tipo; reescribir `${x}` según el contexto (Dec-19); los valores de rutas |
| 2.3 | `ChainExecutor`: `SET VARIABLE` en la conexión de cada paso; `sql_file` también recibe sus parámetros |
| 2.4 | Línea de comandos: `--param` validado; `--batch <archivo.csv>` (una ejecución por fila; columnas = parámetros) y resumen al final |
| 2.5 | Interfaz: editor de parámetros con tipo en los ajustes del proceso; «Run for each…» (una lista, o los valores distintos de una columna de una fuente) |
| 2.6 | `scripts/probarParametros.mjs` |

### Fase 3 · Correr sin ver SQL (D5) → **5.11.0-alpha.1**

| # | Qué |
|---|---|
| 3.1 | Vista **formulario** de un proceso: título, descripción, un campo por parámetro (según su tipo), **Run**, y al terminar lo que dejó (archivos, con «Open» y «Show in folder») |
| 3.2 | El proceso puede abrirse siempre como formulario («Open as a form»), y desde el formulario se puede pasar al editor |
| 3.3 | Recorrido en el navegador integrado; documentación ES/EN |

### Fase 4 · Destino de entrega (D6)

| # | Qué |
|---|---|
| 4.1 | Migración 4 (también para D1): `destinos_locales`, `programaciones`, y en `ejecuciones` las columnas `programacion_id`, `prevista`, `resumen` |
| 4.2 | `server/destinos.js`: definiciones (workspace / proyecto), ubicación por máquina, patrón del nombre, entregar con el escritor atómico |
| 4.3 | Los nodos Excel, Export y Publish pueden decir «entregar en `<destino>`» en vez de una ruta |
| 4.4 | Interfaz: los destinos en la ficha del workspace y en el panel de fuentes del proyecto; ubicarlos en esta máquina |
| 4.5 | `scripts/probarDestinos.mjs` |

### Fase 5 · Programación (D1) → **5.11.0-alpha.2**

| # | Qué |
|---|---|
| 5.1 | `server/programacion/reglas.js`: `siguiente(regla, desde, calendario)` y `perdidas(regla, desde, hasta)`, puras, con pruebas de días hábiles, festivos, fin de mes, cambio de horario |
| 5.2 | `server/programacion/calendario.js`: el calendario del workspace; viaja en el `.amoxworkspace` |
| 5.3 | `server/programacion/tick.js`: qué toca, ponerse al día (Dec-17), clave de ocurrencia, una sola a la vez por programación, pausa general (Dec-24) |
| 5.4 | `electron/programador.js`: la tarea de Windows (Dec-16), reescribir su hora; orden `tick` en `ordenes.js`; el reloj de la aplicación abierta |
| 5.5 | Interfaz: **Schedule…** en el editor de Data Flow (y en el formulario): regla con las próximas cinco fechas, parámetros de esta programación, avisos, «ponerse al día» |
| 5.6 | `scripts/probarProgramacion.mjs` (reglas, tick y ponerse al día con un reloj falso y la tarea del sistema simulada) |

### Fase 6 · Avisos y bitácora (D2) → **5.11.0-alpha.2**

| # | Qué |
|---|---|
| 6.1 | El resumen de una ejecución: archivos leídos y guardados (por tipo de nodo), filas, tiempo, paso que falló |
| 6.2 | Aviso del sistema desde el proceso principal (Dec-22); su clic abre la ejecución |
| 6.3 | La ficha de una ejecución: pasos, archivos con «Open», registro, parámetros, «Run again» |

### Fase 7 · El panel de operación (D7) y disparar al llegar (D8) → **5.11.0-beta.1**

| # | Qué |
|---|---|
| 7.1 | Vista **Operations**: hoy (lo que corrió y lo que falta), mañana, todas las programaciones de todos los workspaces, la bitácora con filtros; pausar una o todas «hasta…» |
| 7.2 | El botón de la barra de título y la entrada desde la vista de workspaces y la paleta |
| 7.3 | Regla «al llegar un archivo a la fuente…» (Dec-23) |
| 7.4 | `scripts/probarOperacion.mjs`; recorrido completo en el navegador integrado |

### Fase 8 · Cerrar → **5.11.0**

| # | Qué |
|---|---|
| 8.1 | Arreglos de las betas |
| 8.2 | Todas las `probar*.mjs`, el build, y el recorrido de todas las pantallas en la aplicación real |
| 8.3 | Documentación de usuario ES/EN (procesos programados, parámetros, Excel, destinos, panel); `CLAUDE.md` |
| 8.4 | Versión en los cuatro sitios, CHANGELOG, instalador y *Latest* (con el autor) |
| 8.5 | D marcada como hecha en `candidatos_v6.md`; lo siguiente, el plan de la 5.12.0 (I) |

---

## 6. Las pantallas

| Pantalla | Dónde | Fase |
|---|---|---|
| Nodo Excel: hojas, formato, «rellenar plantilla» | Data Flow, panel del nodo | 1 |
| Parámetros del proceso (con tipo) y «Run for each…» | Data Flow, ajustes del proceso | 2 |
| El proceso como formulario | Pestaña del `.sqlchain` | 3 |
| Destinos de entrega | Ficha del workspace; panel de fuentes del proyecto | 4 |
| **Schedule…**: regla, próximas fechas, parámetros, avisos | Diálogo desde Data Flow y el formulario | 5 |
| Calendario del workspace (días hábiles y festivos) | Ficha del workspace | 5 |
| Ficha de una ejecución | Desde el aviso, la bitácora y el historial | 6 |
| **Operations**: hoy, mañana, programaciones, bitácora, pausar | Vista aparte | 7 |
| «Al llegar un archivo» en la regla | Diálogo Schedule… | 7 |
| Aviso de «ponerse al día» al abrir | Aviso en la aplicación | 5 |

---

## 7. Riesgos, y qué los cubre

| Riesgo | Qué lo cubre |
|---|---|
| La tarea del sistema no corre si la sesión no está iniciada | Dec-16: se dice en la interfaz; ponerse al día al abrir (Dec-17) recoge lo perdido |
| Dos disparos de la misma ocurrencia (reloj de la aplicación y tarea) | Clave de ocurrencia en `ejecuciones` (Dec-16) |
| Un proceso programado que se queda colgado | Una sola ejecución a la vez por programación; la siguiente ocurrencia se salta y se avisa |
| Un libro escrito por AmoxSQL que Excel «repara» al abrir | La prueba 0.3 lo abre con dos lectores; el XML sigue el mínimo de la norma; las plantillas reales del autor, en la fase 1 |
| Una plantilla con algo que no conocemos (tablas dinámicas, macros) | Sólo se tocan las celdas de datos; un `.xlsm` se conserva con sus macros; una tabla dinámica se marca para refrescar al abrir |
| Un valor de fuera que cuele SQL | Dec-19, con pruebas de inyección en `probarParametros.mjs` |
| Cambio de horario (la 1:30 que no existe o pasa dos veces) | `reglas.js` trabaja en hora local con pruebas en las dos fechas del cambio |
| Las credenciales en una tarea sin ventana | Ya resuelto en A1/A3: el `tick` corre como el usuario y lee su llavero |

## 8. Decisiones que necesitan al autor

> **2026-10-05:** el autor aprueba el plan y el programador de Windows como opción apagada
> por defecto (Dec-16). Quedan abiertas la 1, la 3 y la 4.

1. **Crear una tarea de prueba en el Programador de tareas** de esta máquina para la fase
   0.1 (se borra al terminar). Es configuración del sistema: hace falta su permiso.
2. **Ninguna dependencia nueva para escribir Excel** (Dec-20). Recomendado: así, como se hizo
   al leer (Dec-11).
3. **Cerrar la 5.10.0** (*Latest*) antes de la 5.11.0-alpha.1.
4. **Subir el motor** (`@duckdb/node-api` 1.5.0 → 1.5.6) que salió en las pruebas reales de
   la 5.10: sin ello, AmoxSQL no abre un DuckLake escrito por un dbt actual. Es un cambio de
   dependencia; se evalúa en su rama con todas las pruebas y decide el autor.

## 9. Lo que queda fuera de la 5.11.0

- Programar en macOS con su programador: cuando exista su instalador (Dec-25).
- Correr un proceso en otra máquina o en un servidor: la 6 es local.
- Avisos por correo o mensajería: necesitan una cuenta y un servicio; se valora en la
  familia F (entregar y recordar).
- Mover a «procesados» los archivos ya leídos de una carpeta: se valora con D8 en la beta,
  si los pilotos lo piden.

## 10. Bitácora

| Fecha | Fase | Qué |
|---|---|---|
| 2026-10-05 | 4 | **Fase 4 (D6) hecha**, `probarDestinos.mjs` **22/22**, `probarBaseCentral.mjs` **39/39** (con una base v3 de la 5.10 que sube a la v4 sin perder nada). **Migración 4**: `destinos_locales`, `programaciones` (para D1) y en `ejecuciones` las columnas `programacion_id`, `prevista` y `resumen`. `server/destinos.js`: definiciones por capas (workspace y proyecto, gana el proyecto), carpeta por máquina, subcarpeta con fecha, y `rutaDeEntrega`, que nunca crea la carpeta del destino (una unidad desconectada es un error con nombre, no una carpeta inventada en C:). Las fechas del nombre (`{fecha}`, `{fecha:AAAA-MM}`, `{hora}`) valen también sin destino y usan la fecha de referencia de la ejecución (`fechaReferencia`, la de la ocurrencia en D1). Los nodos Excel, Export File y Publish eligen **Deliver to**. Con un proyecto abierto, el servidor sabe si un destino es suyo o de su workspace para ubicarlo o borrarlo. Los destinos viajan en el `.amoxworkspace` (sin la carpeta). Interfaz: **Destinations** en el explorador (debajo de Sources) y en la ficha del workspace, con su editor. Recorrido en el navegador integrado: el destino en el explorador, el editor con la vista previa de la subcarpeta, el selector en el nodo Excel, y una ejecución que deja `Reportes/2026/cierre_2026-10_norte.xlsx` |
| 2026-10-05 | 3 | **Fase 3 (D5) hecha.** `ChainFormulario.jsx`: el proceso como formulario (nombre, descripción, un campo por parámetro con tipo, Run y lo que dejó), con «Always open this process as a form» (`vista: 'formulario'` en el `.sqlchain`) y «Edit the process»; en el editor, **Open as a form** en el menú. Los valores van como `deFuera` (origen `formulario`): un valor que no es de su tipo vuelve con su campo marcado. `server/ejecucion/resumen.js` + `GET /api/chains/run/:runId/resumen`: qué leyó, qué dejó (con si sigue ahí) y dónde falló, y una línea para el aviso de D2. Puente nuevo `openPath` en Electron: abre con su programa un documento que dejó un proceso, y sólo eso (un archivo que existe, con una extensión de documento). `probarParametros.mjs` **32/32**. **Hallazgo:** el `button:hover` global pesa más que una sola clase y dejaba gris el botón de acento con el puntero encima; los botones de acento llevan su propio hover. Recorrido en el navegador integrado: el proceso abre como formulario, «sur» → «Finished in 88 ms» con `cierre_sur.xlsx`, un campo vacío se marca, y «Edit the process» vuelve al lienzo |
| 2026-10-05 | 0.4 + 2 | **Fase 2 (D4) hecha**, `probarParametros.mjs` **30/30**. `server/parametros.js`: definiciones con tipo (`parametros` en el `.sqlchain`; el valor por defecto sigue en `variables`), validación con mensajes que dicen qué se esperaba, y la sustitución por contexto de Dec-19 con un recorrido del SQL que distingue código, cadena, identificador, comentarios y `$$`. El ejecutor resuelve los valores al empezar, fija los que tienen tipo con `SET VARIABLE` y sustituye con `aplicarAConfig` (campos SQL: `query`, `having`, `expression`…; rutas: `outputPath`, `carpeta`, `plantilla`…); el nodo de archivo `.sql` también recibe los parámetros. Línea de comandos: `--param` comprobado antes de correr (código 2), `--batch` con CSV (o JSON) que comprueba todas las filas antes y corre una detrás de otra. Interfaz: **Parameters** (antes Variables) con tipo, etiqueta para el formulario y opciones de lista; **Run for each…** con una lista o los valores distintos de una columna de una fuente o tabla, por SSE (`/api/chains/lote`, origen `lote`). **0.4, decidido al implementar:** el valor del AUTOR se pega exactamente como antes —también entre comillas sin doblarlas—, porque hay procesos que cuentan con ello (`IN ('${lista}')` con `a','b`); sólo los valores de fuera y los que tienen tipo se escapan. Así ningún proceso de la 5.10 cambia. **Hallazgos:** (1) `req.on('close')` salta en cuanto se lee el cuerpo de un POST (Node ≥ 16), no cuando el cliente se va: el lote se paraba tras la primera ejecución; se usa el cierre de la respuesta. El mismo patrón está en `/api/query` y en dbt; funciona por el orden en que llegan los eventos, y se dejó como tarea aparte. (2) `getvariable` con un valor de texto compara bien con fechas y números, así que declarar un tipo no rompe los procesos que ya comparaban. Recorrido en el navegador integrado: Parameters con un parámetro de tipo lista, y Run for each con tres tiendas, que deja tres libros |
| 2026-10-05 | 0.3 + 1 | **Fase 1 (D3) hecha**, `probarExcelSalida.mjs` **41/41**; las 39 pruebas en verde. **0.3:** el libro propio lo leen el motor (`read_xlsx`: fechas como fechas, 100 000 filas en menos de 1 s) y un lector de Excel independiente sin un solo aviso (tipos, formatos, anchos, panel fijo, filtro, UTF-8, emoji; los caracteres de control se quitan). La plantilla la genera `scripts/fixtures/excel/generar_plantillas.py` con lo que un cliente tiene: tabla con columna calculada y fila de totales, gráfico sobre la tabla, formato condicional, validación, nombre definido, otras hojas; y otra desde una celda con datos viejos, fórmula al lado y un pie. **1.1** `server/zip.js` (lector completo y escritor en flujo con descriptor de datos, CRC-32 en tabla) y `server/xlsxEscribir.js`. **1.2** `server/xlsxPlantilla.js`. **1.3** nodo **Excel** de Data Flow (los 8 puntos de un nodo), con las entradas y su nodo pasadas al ejecutor (`ctx.entradas`) para nombrar cada hoja; `export_file` en xlsx local usa el escritor propio (sin `spatial`). **1.4** `/api/export-data` en xlsx, también (por la conexión del usuario, fuera del historial). **Decidido al implementar:** (1) el formato sale del tipo; los enteros sin separador (años y códigos), un DOUBLE con dos decimales salvo que todos sus valores sean enteros, y un BIGINT de más de 15 cifras va como texto; (2) una fecha anterior a marzo de 1900 va como texto (Excel cuenta mal antes); (3) en una plantilla, el estilo de cada columna es el de la primera fila de datos de la plantilla, y una fecha sin formato de fecha recibe uno sin tocar el resto del estilo; (4) un rango cuenta como «de los datos» si sus columnas caen dentro y acaba justo en la última fila vieja; (5) una tabla de Excel nunca se queda sin filas (Excel no lo admite): con 0 filas queda una vacía y se avisa. **Hallazgo:** los estilos de la fila de muestra se leían después de limpiarla, y el libro perdía el formato del cliente; se copian antes. Recorrido en el navegador integrado: el nodo con sus dos modos, formatos por columna, la plantilla descrita («4 sheets, 1 table»), y las dos ejecuciones desde la interfaz, comprobadas con el lector independiente |
| 2026-10-05 | — | El autor aprueba el plan. Dec-16 cambia: la tarea de Windows es opcional y está apagada por defecto; sin ella, las programaciones corren con AmoxSQL abierto y se pone al día al abrirlo |
| 2026-10-03 | — | Plan escrito leyendo la 5.10.0-beta.1. Comprobado de paso que `getvariable` con un valor de texto compara bien con fechas y números, y que las variables del motor son por conexión |
