# Novedades de la 6.0

**🌐 [English](../../en/user-guide/whats-new-6.md) · Español**

> La 6.0 cambia el motor a **DuckDB 2.0** y ordena la interfaz: una barra lateral de siete entradas, pestañas y archivos que se encuentran, un acento por tema y lo que el motor nuevo permite —variables con tipo, JSON sin forma fija, subesquemas y un plan de ejecución que dice qué se saltó.

## Antes de actualizar: si vienes de la 5.x

| Qué | Lo que pasa en la 6.0 |
|---|---|
| **Tus bases `.duckdb`** | Se abren tal cual y siguen abriéndose en la 5.x aunque la 6.0 escriba en ellas. Las bases **nuevas** que crea la 6.0 van en el formato de DuckDB 2: la 5.x no las abre. |
| **Pasar una base al formato nuevo** | Es opcional y nunca automático: **Upgrade…** en el explorador (ver abajo). La original se queda al lado como `<nombre>.before-6.duckdb`. |
| **Lambdas** | DuckDB 2 escribe `lambda x: x + 1` en vez de `x -> x + 1`. Al encontrar una flecha, el editor ofrece **Rewrite the lambda**. El JSON (`j -> 'clave'`, `->>`) no cambia. |
| **Otros cambios de SQL** | `~` busca una coincidencia parcial (como `regexp_matches`), dividir entre cero con `//` es un error, y un `NULL` lleva tipo. El Assistant ya lo sabe. |
| **Lagos DuckLake de la 5.x** | Leerlos no los cambia; AmoxSQL avisa al abrirlos de que la primera escritura los deja sólo para la 6. |
| **dbt** | **Set up dbt…** instala dbt con DuckDB 2.0 y pide Python 3.11 a 3.13. Un entorno de antes (con DuckDB 1.x) sigue corriendo, pero AmoxSQL avisa: no abrirá las bases que crea la 6.0. |
| **Tu tema y tu acento** | Se conservan. Una instalación nueva empieza en **Amox Dark**. Si tenías un acento que ya no existe, pasa al más parecido. |
| **El servidor local** | Ahora sólo atiende a la ventana de AmoxSQL (escucha en `127.0.0.1`). Si alguna herramienta tuya llamaba a su API desde otra máquina o desde un navegador, dejará de poder hacerlo. |

## El motor: DuckDB 2.0

- **Variables del proyecto con `$nombre`.** Se declaran una vez, con tipo y descripción, y se usan en cualquier consulta, celda, tarjeta del Canvas o proceso: `WHERE region = $region`. Sin comillas a mano y sin que un valor pueda cambiar la consulta. Ver [Variables](../editor/variables.md).
- **JSON sin forma fija.** Al importar un JSON puedes guardar cada registro tal cual en una columna `datos` (VARIANT), aunque los registros no tengan los mismos campos. En los resultados, un valor anidado se abre como árbol; el perfil dice qué claves hay y en cuántas filas. Ver [Importar datos](../data/importing-data.md).
- **Subesquemas.** `CREATE SCHEMA ventas.crudo` funciona, y el explorador, el diagrama ER, Data Flow y el Assistant los muestran con su ruta. **New schema inside…** en el menú de un esquema. Ver [Explorador de base de datos](../data/database-explorer.md).
- **El plan de ejecución dice cuántos bloques de filas leyó** de los que había, y sugiere guardar la tabla ordenada cuando un filtro no se salta ninguno. Ver [Plan de ejecución](../results/execution-plan.md).
- **El Assistant pregunta antes de una consulta enorme**: si el motor estima más de 50 millones de filas, dice qué leería y pregunta, o propone acotarla.
- **Más rápido y más pequeño:** en el proyecto de ejemplo, la base ocupa un 20 % menos tras **Upgrade…** y las consultas con zonas horarias van un 39 % más rápido.

## La interfaz

- **Una barra lateral de siete entradas** en vez de quince iconos: Files, Search, Data, Library, dbt, Git y Deep Dive. Ver [La interfaz](interface.md).
- **Help** es su propio diálogo (**Ctrl+Shift+/**), con los atajos y las guías de Story Flow y Data Flow.
- **Pestañas que se distinguen** (*Query 1.sql*, *Notebook 2.sqlnb*), una lista de las que no caben, **Close saved** y **Ctrl+Shift+T** también para una pestaña sin guardar. Ver [Layout, pestañas y paneles](../editor/layout-tabs-and-panes.md).
- **El explorador de archivos** busca en todo el proyecto y filtra por tipo, se puede ver como árbol, enseña los gráficos debajo de su consulta, y arriba tiene **Open Editors** y **Favorites**. Ver [Explorador de archivos](../data/file-explorer.md).
- **Cada tema trae su acento**, y hay dieciséis acentos más para elegir, entre ellos un rojo neón. Ver [Temas y apariencia](themes-and-appearance.md).
- **La barra de resultados en una fila**, con **Save / Share ▾** reuniendo guardar, comparar, ventana aparte y descargar. Ver [Tabla de resultados](../results/results-table.md).
- **El gráfico acierta a la primera:** al abrirlo, AmoxSQL mira qué es cada columna y lo dice («Suggested: …», con **Undo**). Ver [Story Flow](../visualization/story-flow.md).
- **Una sola guía se abre sola**, la de bienvenida; las demás se ofrecen con una pista de una línea.

La lista completa, con los arreglos, está en el [CHANGELOG](../../../CHANGELOG.md).

## Relacionado

- [Instalación](installation.md) · [Primeros pasos](first-steps.md) · [Proyecto de ejemplo](example-project.md)
- [Variables](../editor/variables.md) · [Explorador de base de datos](../data/database-explorer.md) · [Importar datos](../data/importing-data.md)
