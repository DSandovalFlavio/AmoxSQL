# Sacar el cuaderno de AmoxSQL

**🌐 [English](../../en/notebooks/reports.md) · Español**

> Dos salidas, y hacen cosas distintas: un documento de Word que circula, y un tablero que se proyecta.

## Qué es

Cuando el análisis está hecho, hay que sacarlo de la herramienta. El [cuaderno](notebooks.md) tiene dos botones para eso, y la diferencia entre ellos no es de formato sino de uso:

- **Word** — un documento que **circula**. Se comenta, se firma, se adjunta a un correo. El expediente de un análisis acaba muchas veces ahí.
- **Tablero** — un tablero de [Report Flow](../reports/report-flow.md), que se **proyecta**. Diapositivas, una figura por página, para contarlo delante de gente.

## Word

El documento lleva, en el orden del cuaderno: el texto de las celdas de texto, y de cada celda de SQL su tabla o su figura.

Antes de empezar pregunta una cosa: **si van las consultas o no**.

| Opción | Para quién |
|---|---|
| Con las consultas | Para quien va a revisar el camino. El SQL queda como anexo del análisis |
| Sólo texto y resultados | Para quien lee las conclusiones |

Las figuras se capturan **de lo que hay en pantalla**, así que una celda plegada en «sólo el código» no tiene figura que capturar. El cuaderno lo avisa por su nombre antes de exportar, en vez de dejar que lo descubras en el documento —que es donde nadie vuelve a mirar—.

## Tablero

Cada celda de texto se convierte en una diapositiva de prosa, y cada celda **con un gráfico configurado y ejecutado** en una diapositiva de figura. Los gráficos se guardan como archivos `.amoxvis` en la carpeta `charts/` del proyecto, así que la diapositiva no lleva una imagen pegada: lleva **una referencia viva** que se puede volver a abrir y refrescar.

Qué celdas tienen gráfico se lee del estado del cuaderno, no de lo que se ve: una celda plegada o fuera de la vista entra igual.

El tablero se abre en una pestaña nueva y desde ahí se edita con el estudio de [Report Flow](../reports/report-flow.md), que exporta a PowerPoint nativo y editable.

## Qué ya no está, y por qué

El cuaderno tenía antes un **modo Informe**, un **modo Presentación** y un **export a HTML**. Los tres se retiraron: eran una versión más pobre de lo que hace un tablero, que además ya tenía su puente desde aquí. Mantener dos caminos hacia lo mismo obliga a elegir sin motivo y hace que uno de los dos envejezca.

El export a PowerPoint del cuaderno también se fue, por lo mismo: un tablero exporta a PowerPoint mejor, y el puente para llegar hasta él está a un botón.

## Relacionado

- [Cuadernos](notebooks.md) · [Report Flow](../reports/report-flow.md)
- [Exportar a Office](../reports/export-to-office.md) · [Story Flow](../visualization/story-flow.md)
