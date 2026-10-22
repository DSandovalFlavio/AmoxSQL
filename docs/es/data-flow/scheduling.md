# Programar procesos

**🌐 [English](../../en/data-flow/scheduling.md) · Español**

> Un proceso corre solo a la hora que le toca: «el cierre mensual, el primer día hábil de cada mes a las 7:00». Si la computadora estaba apagada, AmoxSQL se pone al día cuando vuelve.

<!-- 📷 CAPTURE: docs/images/data-flow/schedule-dialog.png — el diálogo Schedule con «Every month · the first business day · 07:00» y sus próximas cinco fechas -->

## Qué es

Una programación dice **qué proceso**, **cuándo**, **con qué parámetros** y **a quién avisar**. Es de **esta computadora**: vive en la base de AmoxSQL, no en el `.sqlchain`. Por eso copiar el proyecto a otra computadora no hace que corra dos veces allí.

## Cuándo usarlo

- Un reporte que alguien espera a la misma hora cada día, semana o mes.
- Un proceso que pone al día los datos durante la jornada, cada pocas horas.
- Cualquier cosa que de otro modo tendrías que acordarte de correr a mano.

## Cómo usarlo

1. Abre el proceso en Data Flow y elige **⋯ → Schedule…** (o **Schedule…** en el formulario del proceso).
2. Elige cada cuánto:
   - **Cada día.** Los días que marques, o sólo los hábiles.
   - **Cada semana.** Un día.
   - **Cada mes.** Un día del mes (el 31 pasa a ser el último en los meses más cortos), el **primer** o el **último día hábil**, o el **N-ésimo día hábil**.
   - **Cada pocas horas.** Cada 1 a 12 horas, dentro de una franja.
   - **Al llegar un archivo.** Cuando aparece un archivo nuevo en una [fuente de carpeta](../data/sources.md) («el cliente deja el Excel a las 9:40 en vez de a las 7:00»). Espera un minuto tras el último archivo, así que diez archivos a la vez son una ejecución. **Sólo con AmoxSQL abierto con ese proyecto**: vigilar carpetas lo hace la aplicación abierta.
3. Pon la hora. El diálogo enseña las próximas cinco fechas mientras escribes la regla.
4. Da valor a sus **parámetros**. En una fecha, **The day it was due** usa la de cada ejecución: el cierre de septiembre que corre el 2 de octubre sigue llevando la fecha de septiembre.
5. Elige **Notify me** (siempre, sólo si falla, nunca) y si **se pone al día** tras estar apagada la computadora.
6. Pulsa **Schedule**.

Cada programación dice en una frase cuándo corre la próxima vez y cómo fue la última, con **Run now**, **Pause** y **Remove**.

## Cuándo corre

- **Con AmoxSQL abierto**, mira cada minuto qué toca.
- **Al abrir AmoxSQL**, se pone al día. De cada programación corre **sólo la última** ocurrencia perdida y dice cuántas se perdieron («2 earlier runs were missed»). Nunca corre una de hace más de 7 días. Sin **Catch up**, la perdida se salta y el aviso lo dice.
- **Con AmoxSQL cerrado:** marca **Run even when AmoxSQL is closed** al pie del diálogo (apagado de inicio).
  - AmoxSQL crea entonces **una** tarea en el Programador de tareas de Windows. La tarea despierta a AmoxSQL a la próxima hora que toque y se reescribe tras cada ejecución.
  - La tarea corre con tu usuario, sin contraseña ni privilegios de administrador, **sólo con tu sesión de Windows iniciada**. Si la computadora estaba apagada, corre al iniciar sesión.
  - Desmarca la opción y la tarea se borra.

La misma ocurrencia nunca corre dos veces, la lance quien la lance (la aplicación abierta o la tarea de Windows). Si la ejecución anterior de una programación sigue corriendo, la siguiente se salta y se dice.

## Programar dbt

Un comando de dbt se programa igual que un proceso. En [DBT Studio](../dbt/dbt-studio.md) → **Commands**, escribe el comando (por ejemplo `dbt build --select +fct_ventas`) y pulsa el botón de calendario junto a **Execute**: se abre el mismo **Schedule…**, con las mismas reglas, avisos y puesta al día.

- Corre con el entorno de dbt y el *target* del proyecto, con sus [fuentes de AmoxSQL](../dbt/amoxsql-sources-in-dbt.md), y suelta la base si AmoxSQL la tiene abierta.
- Su nombre es el comando («dbt build +fct_ventas»), y en Operations y en la ficha es una ejecución más: cada modelo y test es un paso.
- Con **Notify me: only on failure**, un test en *warn* también avisa («…: tests with warnings»), aunque dbt termine bien.
- Un comando con algo de consola (`&&`, `|`…) o una carpeta sin `dbt_project.yml` no se programa.

## Cuando algo falla: Needs attention

Lo que corrió sin nadie delante (programado, desde la línea de comandos o en lote) y **falló o terminó con un aviso** sale en **Needs attention**, con la razón en una línea:

- en la **bienvenida**, de todos los workspaces (sólo si hay algo; si no, la bienvenida queda como siempre);
- arriba de la **ficha de cada workspace**, sólo lo suyo.

Cada fila tiene **Open** (la ficha de la ejecución), **Run again** y **Dismiss**. Sale de la lista al abrir su ficha, al pulsar Dismiss o cuando la siguiente ejecución del mismo proceso termina bien. El botón de Operations de la barra de título se pone rojo con lo que falta por mirar, no sólo con lo de hoy: un fallo de las 5:00 sigue a la vista cuando llegas.

## Lo que corre de fondo no estorba

Con AmoxSQL **abierto**, lo que corre sin nadie delante usa como mucho **la mitad de los núcleos y el 25 % de la memoria**: puedes seguir trabajando mientras tanto, y el propio proceso suele terminar antes porque compite menos. Lo que no quepa en esa memoria va a disco en vez de fallar.

- Con AmoxSQL **cerrado** (la tarea de Windows lo despierta), no hay límites: nadie está trabajando.
- Si al abrir AmoxSQL se pone al día con lo que se perdió, esa puesta al día sí lleva límites.
- Los porcentajes se cambian en **Operations** («While you work, a scheduled run uses up to…»).
- La ficha de la ejecución dice con qué límites corrió. Un proceso que usa la **base del proyecto** no se limita (compartiría los límites con tu sesión), y la ficha lo dice.
- dbt programado corre con prioridad baja.

## Si la red falla

Los pasos que leen de la red (una dirección web, un bucket, una hoja de cálculo en línea, una fuente en la nube) **reintentan un fallo pasajero**: tiempo agotado, conexión cortada, servidor ocupado (429, 5xx). De serie, **2 veces con 30 segundos** de espera cuando el proceso corre programado, y ninguna desde la interfaz. Cada paso lo cambia en **If the network fails**. Un archivo que no existe o un permiso no se reintentan: esperar no lo arregla. La ficha cuenta los reintentos de cada paso.

## Operations: todo en un sitio

**Operations** enseña todo lo programado en esta computadora, de todos los grupos. Se abre con el botón de la barra de título que dice cuántas tocan hoy (en rojo si alguna falló hoy), desde el menú **AmoxSQL** o desde la vista de workspaces.

- **Hoy y mañana.** Lo que corrió (terminó, falló) y lo que falta, en orden.
- **Las programaciones.** Agrupadas por grupo, con **Run now** y **Pause**.
- **La bitácora.** Las últimas ejecuciones de todos los proyectos: todas, sólo las programadas o sólo las que fallaron. Un clic abre la ficha de la ejecución.
- **Pausar todo hasta una fecha** antes de un puente. No corre nada programado hasta entonces, y lo que tocaba no se pone al día. **Resume now** quita la pausa.
- El interruptor **Run even when AmoxSQL is closed**.

## Días hábiles y festivos

«El primer día hábil» usa el **calendario del grupo** de proyectos: sus días laborables y sus festivos. Se pone en la ficha del grupo, en la vista de workspaces, en **Working days and holidays**. Viaja con el grupo (`.amoxworkspace`). Un proyecto sin grupo usa de lunes a viernes, sin festivos.

## Trucos y joyas

- **Pon fechas en el nombre de la salida:** `cierre_{fecha:AAAA-MM}.xlsx` en un [destino](../data/sources.md) guarda el archivo de cada mes.
- **Los avisos:** una línea por ejecución («Cierre mensual · 3 files read, 1 saved · 4 s»), o el paso que falló y por qué.
  - Con AmoxSQL abierto, al hacer clic en uno se abre **la ficha de la ejecución**: cómo fue, cuándo y cómo se lanzó, sus parámetros, los archivos que dejó (con **Open** y **Show in folder**) y cada paso con sus filas y su tiempo. **Run again** la repite con los mismos valores; una ejecución programada se repite con la fecha que tocaba.
  - Si corrió con AmoxSQL cerrado, la ejecución está en el historial al abrirlo.
- **Pausar todo antes de un puente:** pausa cada programación, o la tarea de Windows sigue despertando a AmoxSQL pero no corre nada mientras dure la pausa general.
- **Desde la línea de comandos:** `AmoxSQL.exe tick` corre lo que toca ahora mismo; es lo que llama la tarea de Windows.

## Relacionado

- [Línea de comandos](command-line.md)
- [Parámetros y lotes](data-flow.md)
- [Salida a Excel](excel-output.md)
