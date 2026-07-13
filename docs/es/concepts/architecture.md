# Arquitectura

**🌐 [English](../../en/concepts/architecture.md) · Español**

> Cómo está construido AmoxSQL por dentro, a alto nivel: tres procesos que cooperan, un motor DuckDB local con carriles de conexión, y comunicación por HTTP local.

> Esta página es una vista conceptual para usuarios técnicos. Los detalles de implementación viven en la documentación interna ([docs/dev/arquitectura.md](../../dev/arquitectura.md)).

## Tres procesos

AmoxSQL es una app de escritorio con tres procesos que cooperan:

1. **Proceso principal (shell de escritorio)** — dueño de la ventana, diálogos nativos y controles de ventana. Arranca al servidor local como un sub-proceso en un puerto dinámico.
2. **Servidor local** — expone una API REST y mantiene la conexión con DuckDB. La interfaz le habla por **HTTP local** (no hay tráfico de red externo). Toda operación de datos —consultas, importaciones, exportaciones, IA— pasa por aquí.
3. **Interfaz (renderer)** — la SPA que ves. Se comunica con el servidor por HTTP; el shell solo le expone un puente mínimo para diálogos nativos y controles de ventana.

El puerto del servidor se asigna dinámicamente (prefiere uno estándar y cae a uno libre si está ocupado), así que puedes correr varias instancias sin choques.

## Motor DuckDB con carriles

El motor es una única instancia de DuckDB, pero con **tres carriles de conexión** independientes sobre esa instancia:

| Carril | Para qué |
|---|---|
| **main** | Tus queries, exportaciones y ejecuciones de Data Flow |
| **meta** | Autocompletado y sondeos de esquema — mantiene el editor responsivo aunque una query larga esté corriendo |
| **ai** | Consultas de la IA + bookkeeping del historial |

Separar carriles evita que, por ejemplo, el autocompletado o la IA se encolen detrás de una query pesada tuya. Todos comparten el mismo catálogo (las tablas que adjuntas o creas son visibles en los tres).

## Por qué importa para ti
- **Es local:** no hay servidor remoto ni latencia de red. Razona sobre DuckDB como algo instantáneo (ver [Local-first](local-first.md)).
- **Responsivo:** el editor y la IA no se traban por tus queries gracias a los carriles.
- **Al depurar "funciona en dev pero no en el build":** casi siempre es (a) el servidor local que no arrancó, o (b) la ruta de carga de la interfaz.

## Relacionado
- [Local-first](local-first.md) · [Proyectos y conexiones](../user-guide/projects-and-connections.md)
- [Extensiones de DuckDB](../data/duckdb-extensions.md)
