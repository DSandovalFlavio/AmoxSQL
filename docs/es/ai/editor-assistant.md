# Asistente del editor

**🌐 [English](../../en/ai/editor-assistant.md) · Español**

> Tu copiloto en el editor: una barra lateral compacta, ligada al archivo abierto, que genera, explica y arregla SQL, y propone gráficos — todo sobre la query que tienes delante.

<img src="../../../images/07_ai_sidebar.png" alt="Asistente del editor de AmoxSQL" width="100%" />

## Qué es

El Asistente es el modo de IA de menor autonomía y mayor cercanía. Vive en una barra lateral junto al [editor SQL](../editor/sql-editor.md) o al [notebook](../notebooks/notebooks.md), y siempre está **ligado al archivo activo**: ve tu query actual, el último resultado y el gráfico configurado, así que sus respuestas son sobre lo que estás haciendo, no en abstracto.

Es reactivo y conversacional pero compacto: abre con el hallazgo, teje los números en la frase y cierra con el siguiente paso. Tú conduces; él ayuda. Cuando una pregunta merece un análisis completo sobre toda la base de datos, promuévela a [Deep Dive](deep-dive.md) con un botón.

## Cuándo usarlo

- Estás escribiendo SQL y quieres generarlo, explicarlo u optimizarlo.
- Una query falla o devuelve algo raro y quieres entender por qué.
- Tienes un resultado y quieres graficarlo bien de un tirón.
- Para un análisis narrado y autónomo sobre **toda** la base, usa [Deep Dive](deep-dive.md) en vez del Asistente.

## Cómo usarlo

### Abrir el Asistente
1. Abre un archivo. El botón **Assist** está en el editor SQL, el notebook, Markdown y Report Flow; **Ctrl+L** lo abre sobre cualquier archivo.
2. Escribe tu pregunta y envía con **Enter**.

El Asistente sabe qué archivo tiene delante (una consulta, un notebook, un deck, un gráfico, un Data Flow…) y lo trata como tal.
Mira la tabla [Qué puede cambiar en cada archivo](#qué-puede-cambiar-en-cada-archivo).

### Generar, explicar u optimizar SQL
1. Con la query en el editor, pídele *"explica esta query"*, *"optimízala"* o describe lo que quieres obtener.
2. El Asistente responde en prosa y, cuando propone cambiar el archivo, muestra la propuesta.

### Aceptar o rechazar una edición
1. Cuando el Asistente propone cambiar tu archivo, aparece un bloque de cambio con **Accept** / **Reject**.
2. **Accept** vuelca el nuevo contenido en el editor **sin guardarlo en disco** — tú revisas y guardas (Ctrl+S). En el editor SQL, **Ctrl+Z** lo deshace. **Reject** lo descarta.
3. Lo que decidiste se recuerda: al reabrir la conversación, el bloque dice **Applied to the editor** o **Rejected**.
4. Si el archivo cambió desde que se hizo la propuesta, aceptarla borraría lo que escribiste después. Por eso no se aplica: el bloque lo dice y ofrece **Propose again**, que se la pide de nuevo sobre la versión actual.

### Crear un archivo nuevo
Si le pides algo que va en otro archivo (*"guárdame esta consulta en un archivo"*), el Asistente propone la ruta y el contenido. Nada se escribe hasta que pulsas **Create**, que crea el archivo y lo abre. Nunca sobrescribe uno que ya exista.

### Insertar una consulta del chat
Bajo cada bloque SQL del chat, **Insert at cursor** pone la consulta donde está el cursor del editor, o sobre el texto seleccionado si hay selección. El resto del archivo no se toca y **Ctrl+Z** lo deshace. También tienes **Copy** y **Run**.

### Aplicar un gráfico
1. Sobre un resultado de un `.sql`, pide *"grafica esto por región"* o similar.
2. El Asistente propone un gráfico completamente configurado; pulsa **Apply to chart** para llevarlo al gráfico de los resultados de esa consulta, en [Story Flow](../visualization/story-flow.md). Solo cambia ese gráfico, no los de otras pestañas.

### Añadir contexto (drag & drop)
Arrastra una tabla del [explorador de base de datos](../data/database-explorer.md) o un archivo del [explorador de archivos](../data/file-explorer.md) y suéltalo en el chat. Queda como contexto de la conversación y se envía en cada pregunta.

### Elegir modelo y skill
En la barra inferior del chat eliges el **modelo** (ver [Proveedores y modelos](providers-and-models.md)) y, si tu proyecto trae [Skills](skills.md), la **skill activa** que enmarca el razonamiento.

## Referencia

### Qué puede hacer el Asistente

| Capacidad | Qué hace |
|---|---|
| Responder preguntas | Sobre tu query, tus datos o SQL de DuckDB en general |
| Generar / explicar / optimizar SQL | Escribe o reescribe la query del archivo activo |
| Proponer ediciones | Cambio con **Accept** / **Reject**; al aceptar carga en el editor sin guardar |
| Proponer archivos nuevos | Ruta y contenido con **Create**; nunca sobrescribe |
| Proponer gráficos | Gráfico configurado con **Apply to chart** hacia Story Flow |
| Citar números | Los valores enlazan a su query de origen ("Source Query") |
| Contexto por arrastre | Tablas y archivos soltados en el chat |

### Contexto que ve automáticamente

| Elemento | De dónde |
|---|---|
| Query actual | El buffer del editor activo |
| Último resultado | La tabla de resultados en pantalla |
| Config del gráfico | El gráfico activo de Story Flow |
| Esquema | Todas las tablas de la base local |
| Reglas del proyecto | `RULES.md` y `context/` (ver [Contexto como código](context-as-code.md)) |

### Qué puede cambiar en cada archivo

| Archivo | Qué hace el Asistente |
|---|---|
| `.sql`, notebook `.sqlnb`, Markdown `.md`, Report Flow `.amoxdeck`, texto (`.yml`, `.json`…) | Explica y propone cambios con **Accept** / **Reject** |
| Gráfico `.amoxvis`, Data Flow `.sqlchain`, Canvas `.amoxcanvas`, diagrama `.amoxdiagram` | Explica qué cambiar y dónde, para que lo hagas en su editor. Todavía no propone cambios: reescribir el archivo a mano lo rompería |
| Un archivo muy largo | Ve la primera parte y lo dice; no propone reescribirlo, porque perdería lo que no ve |

### Qué no sale de tu equipo

- **Las fotos de un Canvas** (las filas guardadas de cada tarjeta) nunca se mandan al modelo: ve el SQL y la forma del lienzo.
- **Los archivos de credenciales** (`profiles.yml`, `.env`, claves) no se mandan nunca a un modelo en la nube. Con un modelo local, sí.
- **La [política de IA](../user-guide/workspaces.md) del workspace** también vale para el archivo abierto: con «solo esquema», un archivo de datos abierto como texto o las filas escritas dentro de un gráfico no salen; con «muestras», solo sus primeras líneas.

## Tips y gemas

- **Aceptar no guarda:** una edición aceptada entra al editor pero no toca el disco hasta que pulses **Ctrl+S** — revisa siempre antes.
- **Promuévelo:** ¿la pregunta creció? El botón de promoción la lleva a [Deep Dive](deep-dive.md) conservando el contexto.
- **Las conversaciones se recuerdan por archivo:** al reabrir un `.sql`, recuperas el chat del Asistente asociado a ese archivo.
- **Clic en un número citado:** salta a la query exacta que lo produjo.

## Relacionado

- [Deep Dive](deep-dive.md) · [Proveedores y modelos](providers-and-models.md) · [Herramientas del agente](agent-tools.md)
- [Editor SQL](../editor/sql-editor.md) · [Story Flow](../visualization/story-flow.md)
- [Skills](skills.md) · [Contexto como código](context-as-code.md)
