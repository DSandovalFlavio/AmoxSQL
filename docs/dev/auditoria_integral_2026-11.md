# Auditoría integral de AmoxSQL · noviembre de 2026

> Hecha el 2026-11-12 sobre la rama `claude/v6-duckdb-2` (5.19.0 + las fases 0–3 de la 6.0).
> El plan que sale de aquí está en [`plan_mejora_integral.md`](plan_mejora_integral.md).

## 0. Cómo se hizo y qué cubre

Tres fuentes, y cada hallazgo dice de cuál sale:

- **Medido**: contado en el código o en el instalable (líneas, endpoints, tamaño del paquete, código sin usar).
- **Visto**: recorriendo la app en ejecución con el proyecto de ejemplo (servidor de prueba, casa temporal), a 1440×900: bienvenida, primera sesión, los once paneles laterales, un `.sql` con resultados, el gráfico, un cuaderno, Settings y el Assistant.
- **Leído**: el código del flujo en cuestión.

**Lo que esta pasada NO recorrió en pantalla**: Data Flow, Canvas, Report Flow, AmoxDiagram, DBT Studio con un proyecto real, Deep Dive con un modelo, Operations y Workspaces. De ellos hay métricas de código y lo que ya se sabía de sus planes, pero no una revisión visual nueva. Quedan como «Tanda 2» en el plan.

Cada hallazgo lleva una gravedad: **Crítico** (riesgo para los datos o la máquina del usuario), **Alto** (rompe o confunde un flujo diario), **Medio** (fricción o deuda que frena), **Bajo** (pulido).

## 1. Resumen

AmoxSQL hace muchísimo y casi todo funciona: 80 suites automáticas pasan, los flujos principales responden rápido y los temas cumplen sus pisos de contraste. Los problemas no están en lo que falta sino en tres sitios:

1. **Un riesgo de seguridad que hay que cerrar antes de publicar nada más** (S1): el servidor interno acepta conexiones de toda la red y de cualquier página web.
2. **La app creció por capas y se nota al usarla**: once paneles laterales sin agrupar, cuatro tours modales en los dos primeros minutos, una barra de resultados con doce acciones, tres sitios distintos que «entienden» qué es una columna.
3. **El código tiene cinco archivos que concentran el riesgo**: `server/index.js` (7 641 líneas, 304 endpoints), `ChainExecutor.js`, `SettingsModal.jsx`, `LayoutManager.jsx` e `index.css` (22 384 líneas).

Los diez hallazgos que más importan, en orden:

| # | Hallazgo | Gravedad |
|---|---|---|
| S1 | El servidor escucha en todas las interfaces de red, con CORS abierto y sin credencial | Crítico |
| F1 | Tras «Upgrade…», al reabrir el proyecto se elige el respaldo `*.before-6.duckdb` como base | Alto |
| F2 | Doble clic en un archivo puede abrirlo en dos pestañas | Alto |
| F3 | El historial guarda la consulta envuelta por AmoxSQL y consultas internas | Alto |
| R1 | El gráfico por defecto elige mal los ejes (primera columna, primera numérica) | Alto |
| U1 | Once paneles laterales en una tira de iconos sin grupos ni nombres | Medio |
| U2 | Cuatro tours modales seguidos en la primera sesión, y uno salta fuera de su sitio | Medio |
| E1 | `server/index.js`: 7 641 líneas y 304 endpoints en un archivo | Medio |
| E4 | `index.css`: 22 384 líneas, 551 KB, ~267 clases sin uso y 1 419 estilos en línea en los componentes | Medio |
| E8 | 80 suites de prueba y ningún `pnpm test`; `CLAUDE.md` dice que no hay pruebas | Medio |

## 2. Seguridad

### S1 · El servidor interno está abierto a la red — Crítico (leído)
`server/index.js:122` hace `app.use(cors())` sin restringir orígenes y `server/index.js:7591` hace `app.listen(port)` sin dirección, así que Express escucha en **todas las interfaces**, no sólo en `localhost`. No hay ninguna credencial entre la ventana y el servidor.

Lo que eso permite hoy:
- **Otra máquina de la misma red** (la oficina, un wifi público) puede llamar a `http://<ip>:3001/api/query` y ejecutar SQL en la base abierta, incluido `COPY … TO` (escribir archivos) y `read_text` (leer archivos).
- **Cualquier página web abierta en el navegador del usuario** puede hacer lo mismo contra `localhost:3001`, porque CORS lo autoriza.
- `GET /api/file?path=` lee **cualquier ruta absoluta** en modo texto (sólo el modo binario está limitado al proyecto, `index.js:3631`). Es a propósito —abrir un archivo que no es del proyecto—, pero combinado con lo anterior es lectura de archivos desde fuera.

El firewall de Windows suele preguntar la primera vez y muchos usuarios aceptan. Las claves de IA están cifradas y no salen por la API, pero los datos del cliente sí.

**Arreglo** (plan, M0): escuchar sólo en `127.0.0.1`; CORS limitado al origen de la app (el esquema `amoxsql://` y, en desarrollo, `localhost:5173`); una credencial de sesión generada al arrancar, que Electron entrega a la ventana por el puente y viaja en cada petición.

### S2 · SQL armado con texto en endpoints de metadatos — Medio (leído)
Varios endpoints interpolan nombres que llegan del cliente (`table-details`, la vista previa de Data Flow, `import`). Casi todos citan bien el identificador; `import` mete la ruta del archivo entre comillas simples sin doblarlas (`FROM '${fullSourcePath}'`): un archivo con apóstrofo en el nombre falla. Con S1 cerrado deja de ser un vector externo, pero conviene un único ayudante de citado (ya existe `esquemas.referencia` para identificadores; falta uno para literales de ruta).

## 3. Fallos de funcionamiento

| # | Qué pasa | Dónde | Gravedad | Fuente |
|---|---|---|---|---|
| **F1** | Después de **Upgrade…**, al volver a abrir el proyecto el selector de base propone `tienda.before-6.duckdb` (el respaldo), porque va antes alfabéticamente que `tienda.duckdb`. El usuario acaba trabajando sobre la copia vieja sin saberlo | Pantalla de sesión; `server/formatoDeBase.js` (nombre del respaldo) | Alto | Visto |
| **F2** | Doble clic sobre `analisis_2024.sqlnb` lo abrió en **dos pestañas**. Cada clic lanza `handleFileOpen` (una lectura asíncrona); si la segunda termina antes de que la primera esté en el estado, `openFile` no la ve abierta | `App.jsx:944–978` | Alto | Visto + leído |
| **F3** | El historial muestra `SELECT * FROM ( … ) __amox_rows LIMIT 1000001` y consultas internas (`SELECT DISTINCT ON(function_name)…`). `_logQuery` registra todo lo que pasa por el motor y descarta por una lista de prefijos (`PRAGMA`, `EXPLAIN`, `FROM INFORMATION_SCHEMA`…): cada consulta interna nueva se cuela, y lo del usuario queda envuelto | `DatabaseManager.js:595–640` | Alto | Visto + leído |
| **F4** | El título del cuaderno se corta: «Ventas 20» por «Ventas 2024: dónde estamos» | `cuaderno/CuadernoEditor.jsx` (cabecera) | Medio | Visto |
| **F5** | En la tabla, `precio_promedio` (DOUBLE) sale «1,700» y `venta` (DECIMAL) «5553900.00»: los DECIMAL llegan como texto y no se formatean | `ResultsTable.jsx:551` | Medio | Visto + leído |
| **F6** | El tour de Story Flow salta al ejecutar una consulta estando en la vista **Table**: el visualizador está montado aunque no se vea | `DataVisualizer.jsx` (tour) | Medio | Visto |
| **F7** | El explorador enseña los `.sqlnb.state.json` junto a cada cuaderno | `FileExplorer.jsx` | Bajo | Visto |
| **F8** | Textos en español en una interfaz en inglés: el panel de búsqueda entero («Texto a buscar…», «Fuente», «Sin coincidencias en…»), el visor de celda («Copiar contenido», «Cerrar»), el editor de Markdown, «Por etapa / Para empezar / Para descubrir» en Functions, descripciones de modelos en Settings. Unas 30 cadenas en 12 archivos | Varios | Medio | Visto + medido |
| **F9** | El botón de la barra lateral dice **New Execution Chain**; el producto lo llama Data Flow desde hace muchas versiones | `App.jsx:1562` | Bajo | Leído |
| **F10** | En el diálogo de pedir un nombre (p. ej. «New schema inside…»), **Enter no confirma**: hay que pulsar Create | `dialogs/DialogProvider.jsx` | Bajo | Visto |
| **F11** | `/api/db/tables` hace una consulta de columnas **por cada tabla** (la usan el completado del editor y Data Flow). Con 200 tablas son 201 consultas al abrir cada editor. `/api/db/schemas` ya lo hace en una | `server/index.js` (`/api/db/tables`) | Medio | Leído |

## 4. Gráficos y recomendaciones

### R1 · Los ejes por defecto no miran los datos — Alto (visto + leído)
Con `03_top_productos.sql` (columnas `lugar, producto, categoria, unidades, venta, precio_promedio`), el gráfico inicial fue **barras de `unidades` por `lugar`**: el número de ranking en el eje X. `DataVisualizer.jsx:293–310` toma `columns[0]` como X y la primera columna numérica como Y. El usuario tiene que corregirlo casi siempre.

### R2 · El tipo de gráfico no se sugiere — Medio (leído)
Siempre empieza en columnas. Una fecha en X pide líneas; dos numéricas, dispersión; una categoría con muchos valores, barras horizontales ordenadas. La información para decidirlo ya está en el resultado.

### R3 · Tres sitios distintos «entienden» una columna — Medio (leído)
- `server/ai/preguntasSugeridas.js`: listas de dimensiones, importes y «no es dimensión» (id, email, url…).
- `DataProfiler.jsx → semanticType`: fecha, identificador, número, email, categoría.
- `DataVisualizer`: ninguna.

El que mejor lo hace (las preguntas sugeridas) no lo comparte con el que más lo necesita (el gráfico). Un solo módulo puro de «qué es cada columna» serviría a los tres y al Assistant.

### R4 · Lo que sí está bien
Las preguntas para empezar un Deep Dive salen de las métricas, el glosario y las columnas del proyecto y dicen de dónde vienen: es el mejor sistema de sugerencias de la app. Los seguimientos del chat (`suggest_followups`) y los atajos de inicio del Assistant por tipo de archivo también funcionan. No hay que rehacerlos, hay que **darles la misma base** (R3).

## 5. Navegación y estructura de la interfaz

### U1 · La barra lateral: once paneles y cuatro acciones, sin grupos — Medio (visto + leído)
`App.jsx:1465–1583`: Explorer · Search · Database · Extensions · DBT · Snippets · Functions · History · Vault · Source Control · Deep Dive, y abajo Chart Gallery · New Execution Chain · ocultar · Settings. Quince iconos de 20 px sin nombre; para saber qué es cada uno hay que pasar el ratón.

Solapamientos:
- **Snippets, Functions, History y Vault** son cuatro paneles de «cosas guardadas o de consulta».
- **Extensions y DBT** son de configuración, y están al mismo nivel que el explorador de archivos.
- **Chart Gallery** y **New Data Flow** son acciones, no paneles, y viven en la misma tira.

Propuesta (se detalla en el plan): seis entradas —Files, Search, Data, Library (Snippets + Variables + Functions + History + Vault en pestañas), Git, Deep Dive— y mover Extensions y dbt a donde se usan.

### U2 · La primera sesión: cuatro tours modales — Medio (visto)
En el primer recorrido saltaron, por este orden: **Meet the AI** (2 pasos), **Welcome to AmoxSQL** (5), **Story Flow** (6, al ejecutar una consulta, F6) y **SQL Notebooks** (4, al abrir un cuaderno). Diecisiete pasos de modal antes de hacer nada, y el de la IA va antes que la bienvenida. Catorce archivos tienen código de tours o guías.

### U3 · La barra de resultados: dos filas y doce acciones — Medio (visto)
Table · Chart · Profile · Filters arriba; debajo Explain · Chart it · buscar · Store A · Pop-out · Save as table… · Vault · Download. **Chart** y **Chart it** hacen cosas parecidas con nombres parecidos; **Store A** y **Vault** no se explican solos.

### U4 · El explorador de archivos — Medio (visto)
Nueve iconos en la cabecera; los nombres se cortan («01_panorama….sql») para dejar sitio al tamaño y la fecha en un panel de 190 px; los archivos de estado del cuaderno a la vista (F7).

### U5 · Settings — Bajo (visto + medido)
Doce secciones en un modal de 2 817 líneas con 55 `useState`. «Store Integrations» no dice qué es. Shortcuts, Story Flow y Data Flow son ayuda, no ajustes.

### U6 · El cuaderno — Medio (visto)
Unos diez iconos en vertical en el canalón de cada celda; un hueco grande entre el texto y la primera celda (altura fija de la celda de texto); el título cortado (F4).

### U7 · Con el Assistant abierto, el gráfico se queda sin sitio — Bajo (visto)
A 1440 px, con barra lateral + paneles de Story Flow + Assistant, la figura bajó sola al 42 % de zoom.

## 6. Diseño y color

| # | Observación | Fuente |
|---|---|---|
| **D1** | El tema por defecto es **Obsidian** (`theme.js:46`, `'dark'`), no **Amox Dark**, que Settings presenta como «Signature». La primera impresión no es la marca | Leído + visto |
| **D2** | Diez temas. Los ocho acentos «Vibrant» son siete tonos de cian-azul casi iguales y un violeta; los «Sober» sí son distintos entre sí | Visto |
| **D3** | El gráfico sale en violeta con el acento en cian: la paleta de la figura no parte del tema. Es una decisión defendible (la figura se exporta), pero hoy parece un descuido | Visto |
| **D4** | El botón relleno de acento se usa para todo (cada **Install** de Extensions, **Run**, **Continue**, **Initialize Project**): cuando todo es primario, nada lo es | Visto |
| **D5** | Los temas pasan todos los pisos de `checkThemeContrast.cjs`, pero `text-disabled` queda en 3,09 (piso 3) y `text-tertiary` en 4,56–4,61 (piso 4,5) en los claros: sin margen. Hay texto terciario de 9–10 px en cabeceras de sección | Medido + visto |
| **D6** | 1 419 `style={{…}}` en los componentes: tamaños, colores y espacios puestos a mano por componente. Es la causa de que dos paneles «iguales» no midan lo mismo | Medido |

Lo que está bien: el sistema de tokens existe y se respeta en lo nuevo; el contraste se comprueba con un script; la tipografía es coherente.

## 7. Código y estructura

### E1 · `server/index.js`: 7 641 líneas, 304 endpoints — Medio (medido)
Por prefijo: `ai` 48, `dbt` 35, `chains` 23, `db` 21, `git` 17, `project` 13, `fuentes` 13, `workspaces` 11… Consecuencias ya vividas: el «atrapa-todo» de producción a mitad del archivo que tapó rutas (5.15), una ruta que usaba una constante antes de declararla (5.14). Tiene 101 llamadas síncronas a disco dentro de manejadores de petición y 66 `console.log`.

### E2 · `ChainExecutor.js`: el SQL de cada paso está escrito dos veces — Medio (leído)
`buildNodeSql` (el SQL equivalente) y `executeNode` (lo que corre) repiten cada paso. En la fase 1 de la 6.0 hubo que arreglar Deduplicate, la muestra estratificada y Unpivot **en los dos sitios**; dos de esos fallos llevaban versiones sin que nadie los viera porque ninguna prueba ejecutaba esos pasos.

### E3 · Componentes gigantes — Medio (medido)

| Archivo | Líneas | Señal |
|---|---|---|
| `SettingsModal.jsx` | 2 817 | 55 `useState` |
| `LayoutManager.jsx` | 2 756 | 23 `useState`, 65 props de callback |
| `ChainNodeConfigPanel.jsx` | 2 448 | 251 props de callback |
| `App.jsx` | 1 999 | 47 `useState`, 37 `useEffect`, 128 props de callback |
| `DataVisualizer.jsx` | 1 428 | — |

`App.jsx` es dueño de casi todo el estado y lo baja por props; cada estado nuevo pasa por él.

### E4 · CSS — Medio (medido)
`index.css`: 22 384 líneas, 551 KB compilado, 2 662 clases de las que unas 267 no aparecen en el código (prefijos `ai-`, `nb-`, `chain-`, `snb-`: el cuaderno viejo y el chat viejo). Más `deck.css` (2 450) y `MarkdownEditor.css` (1 737).

### E5 · Código que nadie usa — Bajo (medido)
1 440 líneas en 7 archivos: `AiSidebar.jsx` (1 049 líneas; `CLAUDE.md` aún lo describe como el chat), `chains/nodeLineage.js`, `ProjectInfo.jsx`, `StatusBar.jsx`, `OpenProjectModal.jsx`, `deck/panels/LayoutsPanel.jsx`, `LazyVisible.jsx`.

### E6 · 37 eventos de ventana como bus de mensajes — Medio (medido)
`amox_asistir` (16 usos), `amox_revisar_propuesta` (15), `amox_abrir_ejecucion` (10)… Funciona, pero no hay una lista de qué eventos existen, quién los emite y qué llevan: se descubren buscando texto.

### E7 · Dos idiomas en las rutas — Bajo (medido)
`/api/project` (13) y `/api/proyecto` (8) y `/api/proyectos` (2); `/api/chains` y `/api/ejecuciones`. No rompe nada, pero duplica el vocabulario.

### E8 · 80 suites y ningún `pnpm test` — Medio (medido)
`package.json` sólo tiene `start`, `client:dev`, `client:build`, `dist`, `postinstall`. Las suites se corren a mano una por una (para la 6.0 hubo que escribir un corredor en el scratchpad). `CLAUDE.md` dice «No test, lint, or typecheck scripts exist — don't claim to have run them», que ya no es verdad.

### E9 · La documentación interna va por detrás — Bajo (leído)
`CLAUDE.md` describe `AiSidebar.jsx` como el chat, dice «64+ components» (son 245 archivos `.jsx`) y «70+ endpoints» (son 304).

## 8. Rendimiento

| # | Qué | Medida | Fuente |
|---|---|---|---|
| **P1** | El paquete principal del cliente pesa **2,98 MB** en un solo archivo, más 1,52 MB del esquema de Vega-Lite. Sólo hay 20 `lazy()`; `App.jsx` importa de entrada 28 componentes, entre ellos ocho paneles laterales, los dos paneles de IA, Operations y los diálogos de importar | `client/dist/assets` | Medido |
| **P2** | Leer una carpeta de CSV con `union_by_name` es ~30 % más lento en DuckDB 2.0, y con `all_varchar` ~60 % (fase 0 de la 6.0). AmoxSQL usa las dos | Fase 0 | Medido |
| **P3** | `/api/db/tables`: N+1 consultas (F11) | — | Leído |
| **P4** | 101 llamadas síncronas a disco en manejadores (E1): mientras una corre, el servidor no atiende otra cosa | — | Medido |
| **P5** | El visualizador se monta con cada resultado aunque se mire la tabla (de ahí F6): trabajo que no se ve | — | Visto |

En una app de escritorio P1 pesa menos que en una web (se carga de disco), pero se paga en cada arranque y en cada ventana emergente.

Lo que está bien: resultados por lotes y con tope, consultas por turnos y cancelables, paneles laterales con keep-alive, sin virtualización (decisión tomada).

## 9. Por tipo de archivo

| Tipo | Estado | Lo que más le falta |
|---|---|---|
| `.sql` | Sólido | F3 (historial), U3 (barra de resultados), R1 (gráfico por defecto) |
| `.sqlnb` | Funciona | F2, F4, F7, U6 |
| `.amoxvis` | Muy completo | R1, R2, D3 |
| `.sqlchain` | Funciona; revisado sólo en código | E2 (SQL duplicado); panel de configuración de 2 448 líneas |
| `.amoxcanvas` | No recorrido en esta pasada | Tanda 2 |
| `.amoxdeck` | No recorrido en esta pasada | Tanda 2 |
| `.amoxdiagram` | No recorrido en esta pasada | Tanda 2 |
| `.md` | Funciona | F8 (textos en español en el editor) |
| `.duckdb` | Sólido | F1 |

## 10. Lo que no hay que tocar

- La pantalla de bienvenida (decisión del autor).
- El formato de los archivos: todos son texto legible y con diff razonable.
- El modelo «el Assistant propone, tú decides».
- Las pruebas contra el motor real con casa temporal: son la red que permitió cambiar de motor en dos días.
