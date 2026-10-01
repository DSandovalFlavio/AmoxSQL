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

## Referencia: qué se guarda y dónde

| Qué | Dónde |
|---|---|
| El workspace (nombre, etiqueta, color) | La base de AmoxSQL, en `~/.amoxsql/amoxsql.duckdb` |
| Su carpeta de contexto | `~/.amoxsql/workspaces/<id>/` (la llenarán el contexto y las reglas compartidas) |
| El enlace de una carpeta | Su `.amoxsql/project.json`: `workspace: { id, nombre }` y el `id` del proyecto. Nada más |

## Tips y gemas

- **El enlace viaja con la carpeta.** Si la compartes o la abres en otra máquina que no tiene ese workspace, AmoxSQL te dice a cuál pertenece y ofrece **crearlo con el mismo id**, para que el enlace siga valiendo.
- **Mover la carpeta no rompe nada:** AmoxSQL reconoce el proyecto por su `id`, no por su ruta.
- **Sin ningún workspace no se pregunta nada.** Si no los usas, AmoxSQL no te molesta al abrir carpetas.
- Renombrar un workspace actualiza el nombre en el `project.json` de sus carpetas la próxima vez que las abres.

## Relacionado

- [Proyectos y conexiones](projects-and-connections.md)
- [Glosario](../reference/glossary.md)
