# Workspaces: agrupar proyectos

**🌐 [English](../../en/user-guide/workspaces.md) · Español**

> Un workspace agrupa los proyectos de un mismo cliente, equipo, marca o producto. Vive en AmoxSQL, no en una carpeta: tus carpetas de proyecto se le enlazan.

## Qué es

Hasta la 5.8, la interfaz llamaba *workspace* a la carpeta que abrías. Desde la 5.9 esa carpeta es un **project**, y *workspace* es lo que agrupa varios proyectos. Nada se movió en disco: cada carpeta que tenías sigue ahí, como proyecto.

Cada usuario elige **cómo los llama**: *Clients*, *Teams*, *Brands*, *Products* o *Workspaces*. Esa palabra es la que verás en toda la aplicación —«New client», «Which team does this project belong to?»— y la que usa el asistente de IA cuando habla del grupo.

## Cuándo usarlo

- Una agencia o consultoría: un workspace por cliente, con todos sus proyectos.
- Varias áreas de una empresa: un workspace por equipo.
- Cuando quieres que el asistente sepa para quién es el análisis.

## Cómo usarlo

### Elegir la palabra
La primera vez que abres la 5.9, AmoxSQL pregunta cómo organizas tu trabajo. Puedes cambiarlo cuando quieras en **Settings**, en la sección que lleva ese nombre (por ejemplo, **Settings → Clients**).

### Crear uno
En esa misma sección de Settings, **New client** (o la palabra que elegiste): nombre, una etiqueta opcional (*Retail*, *Health*…) y un color. También puedes crearlo al enlazar una carpeta.

### Enlazar una carpeta
- **Al abrirla:** si la carpeta no está enlazada y ya tienes algún workspace, AmoxSQL pregunta a cuál pertenece. Puedes elegir uno, crear otro, o **Leave unlinked**; con **Don't ask again for this project** no vuelve a preguntar en esa carpeta.
- **Después:** desde el menú del proyecto en la barra de título, **Client: …  Change** (o **Link to a client…**).

Con la carpeta enlazada, la barra de título enseña el workspace delante del proyecto: `Tiendas del Norte / ventas-q4 / base`.

### Renombrar y archivar
En Settings, cada workspace tiene **editar** (nombre, etiqueta, color) y **archivar**. Uno archivado sale de la lista y de las preguntas al abrir, pero no se borra: **Show archived → Restore** lo recupera.

### La vista de workspaces (desde la bienvenida)
La bienvenida no cambia: abrir una ruta, los recientes y el pie siguen igual. Cuando tienes algún workspace aparece un botón con tu palabra —por ejemplo **Clients 4**— en la cabecera de los recientes. Lleva a una pantalla aparte, con **Welcome** arriba para volver:

- **Overview:** lo último que corrió (de la interfaz o de la línea de comandos) con su workspace, una tarjeta por workspace —sus proyectos por estado, la próxima entrega y su política de IA— y los proyectos que aún no tienen workspace, que se enlazan ahí mismo sin abrirlos.
- **Un workspace:** sus proyectos con su **estado** (*In progress*, *In review*, *Delivered*, *Paused*) y su **fecha de entrega**, que se cambian en la tabla; lo que corrió; y los botones **Context**, **Edit** y **Export**.
- **Unassigned** y **Archived**, y un buscador por nombre y carpeta en todos los proyectos.

El estado y la entrega se guardan en el `project.json` de la carpeta, así que viajan con ella.

### Compartir un workspace: exportar e importar
**Export** guarda un archivo `.amoxworkspace` con sus datos, su política de IA, su marca (con el logo), sus archivos de contexto y los **nombres** de las credenciales que usan sus proyectos —nunca sus valores—. **Import…** (en la vista) lo trae:

- Si no existe aquí, se crea con el **mismo id**, así que las carpetas enlazadas en otra máquina lo reconocen.
- Si ya existe, los archivos nuevos se añaden y tú eliges cuáles de los distintos reemplazar; opcionalmente también el nombre, el color, la política y la marca. O se importa aparte, como otro workspace.
- Te dice qué credenciales hará falta añadir en **Settings → Credentials**.

## Referencia: qué se guarda y dónde

| Qué | Dónde |
|---|---|
| El workspace (nombre, etiqueta, color, política de IA, marca) | La base de AmoxSQL, en `~/.amoxsql/amoxsql.duckdb` |
| Su contexto (reglas, métricas, glosario, ejemplos, skills) | `~/.amoxsql/workspaces/<id>/` |
| El enlace, el estado y la entrega de una carpeta | Su `.amoxsql/project.json`: `workspace: { id, nombre }`, el `id` del proyecto, `estado` y `entrega` |
| Un workspace para compartir | Un archivo `.amoxworkspace` (JSON), sin valores de credenciales |

## Tips y gemas

- **El enlace viaja con la carpeta.** Si la compartes o la abres en otra máquina que no tiene ese workspace, AmoxSQL te dice a cuál pertenece y ofrece **crearlo con el mismo id**, para que el enlace siga valiendo.
- **Mover la carpeta no rompe nada:** AmoxSQL reconoce el proyecto por su `id`, no por su ruta.
- **Sin ningún workspace no se pregunta nada.** Si no los usas, AmoxSQL no te molesta al abrir carpetas.
- Renombrar un workspace actualiza el nombre en el `project.json` de sus carpetas la próxima vez que las abres.

## Relacionado

- [Proyectos y conexiones](projects-and-connections.md)
- [Glosario](../reference/glossary.md)
