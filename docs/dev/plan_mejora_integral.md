# Plan de mejora integral

> Sale de [`auditoria_integral_2026-11.md`](auditoria_integral_2026-11.md) (2026-11-12). Los códigos entre
> paréntesis (S1, F2, U1…) son los hallazgos de la auditoría.

## 1. Cómo se ordena

Tres criterios, en este orden: **lo que pone en riesgo los datos del usuario**, **lo que el usuario toca todos los días**, **lo que hace más barato lo siguiente**. Cada entrega es pequeña, se puede publicar sola y termina con todas las suites en verde.

| Entrega | Qué | Hallazgos | Tamaño | Cuándo |
|---|---|---|---|---|
| **M0** | Cerrar el servidor | S1, S2 | S | **Antes de publicar la 6.0** |
| **M1** | Los fallos que se ven | F1–F11 | S–M | **Antes de publicar la 6.0** |
| **M2** | El gráfico acierta a la primera | R1, R2, R3, D3 | M | 6.1 |
| **M3** | Una barra lateral que se entiende | U1, U4, F9 | M | 6.1 |
| **M4** | La primera sesión | U2, F6, D1 | S | 6.1 |
| **M5** | Resultados y cuaderno | U3, U6, U7 | M | 6.1 |
| **M6** | Probar con un comando | E8, E9 | S | 6.1 (primero de las de código) |
| **M7** | El servidor por partes | E1, E2, E7, P3, P4 | L | 6.2 |
| **M8** | El cliente por partes | E3, E4, E5, E6, P1, D6 | L | 6.2 |
| **M9** | Color y jerarquía | D2, D4, D5, U5 | M | 6.2 |
| **T2** | Auditoría, tanda 2 | Data Flow, Canvas, Report Flow, Diagram, dbt, Deep Dive, Operations, Workspaces | M | Tras M5 |

S ≈ una sesión de trabajo · M ≈ dos o tres · L ≈ cuatro o más.

## 2. Las entregas

### M0 · Cerrar el servidor (S1, S2)

1. `server/index.js`: `app.listen(port, '127.0.0.1')`. Comprobar que el arranque de reserva (puerto ocupado) también lleva la dirección.
2. CORS con lista: el origen de la app instalada (`amoxsql://…`) y, sólo en desarrollo, `http://localhost:5173`. Una petición sin `Origin` (el propio Electron, `AmoxSQL.exe run`) pasa; una con otro origen, 403.
3. **Credencial de sesión**: Electron main genera un valor aleatorio al arrancar, lo pasa al servidor por `parentPort` y a la ventana por el puente (`window.electronAPI`); `client/src/api.js` lo añade a cada petición y un middleware lo exige. En desarrollo (`?apiPort=`), el servidor de pruebas arranca con una credencial conocida.
4. Un ayudante `literalDeRuta()` junto a `esquemas.referencia` y usarlo en `import`, la vista previa de Data Flow y los lectores de archivo.
5. **Prueba** `probarServidorCerrado.mjs`: desde otra interfaz no conecta; con otro `Origin`, 403; sin credencial, 401; con todo bien, 200; un archivo con apóstrofo se importa.
6. Actualizar `SECURITY.md`.

Riesgo: las ventanas emergentes y la línea de órdenes usan el servidor; las dos reciben la credencial por el mismo camino. Se prueba con `probarInteraccion` y `probarLineaDeComandos`.

### M1 · Los fallos que se ven (F1–F11)

| Hallazgo | Arreglo | Prueba |
|---|---|---|
| F1 | El respaldo de «Upgrade…» pasa a `<nombre>.duckdb.before-6` (no termina en `.duckdb`, así que no entra en el selector) y el selector recuerda la última base usada del proyecto en `project.json` | `probarFormatoDeBase` + una nueva del selector |
| F2 | `handleFileOpen` guarda las aperturas en curso por ruta: la segunda llamada espera a la primera y sólo enfoca | `probarInteraccion`: doble clic → una pestaña |
| F3 | El historial lo escribe `/api/query` (y la celda del cuaderno) con **el texto que mandó el usuario**, antes de envolverlo. `_logQuery` deja de escuchar todo el motor y desaparece la lista de prefijos | Nueva `probarHistorial`: lo ejecutado aparece tal cual; el completado, el perfil y el plan no dejan nada |
| F4 | El título del cuaderno ocupa el ancho disponible y pasa a dos líneas si no cabe | Visual |
| F5 | La tabla formatea por **tipo de columna** (ya llega en `types`), no por `typeof`: DECIMAL y BIGINT con separador de miles como DOUBLE | `probarTabla` (pura, sobre el formateador) |
| F6 | El tour de Story Flow sólo se ofrece cuando la vista Chart está visible | Visual + M4 |
| F7 | El explorador oculta `*.sqlnb.state.json` (como ya oculta otros archivos de la app); el buscador de archivos también | Visual |
| F8 | Pasar a inglés las ~30 cadenas; añadir a `probarPalabraProject` (que ya vigila palabras) una guarda de acentos y de una lista de palabras en español en JSX | La guarda |
| F9 | «New Data Flow» | — |
| F10 | Enter confirma en `promptAsync` si la validación pasa | `probarInteraccion` |
| F11 | `/api/db/tables` con un solo JOIN, como `/api/db/schemas` | `probarEsquemasAnidados` ya la cubre |

### M2 · El gráfico acierta a la primera (R1, R2, R3, D3)

1. **Un módulo puro `client/src/utils/columnas.js`** (y su gemelo en el servidor, o compartido): de un resultado (nombres, tipos, una muestra) devuelve por columna `{ papel: fecha | medida | dimension | identificador | texto_libre, cardinalidad, … }`. Parte de las listas de `preguntasSugeridas.js` (dimensiones, importes, «no es dimensión»), a las que añade: rangos y posiciones (`lugar`, `rank`, `#`, `id`) no son medida ni eje; una numérica con pocos valores distintos y nombre de año/mes es dimensión.
2. **Ejes por defecto** en `DataVisualizer`: X = la fecha si hay; si no, la dimensión de menor cardinalidad razonable; nunca un identificador o un ranking. Y = la medida «más importe» (nombre e intervalo), no la primera. Con el caso de la auditoría: `producto` × `venta`.
3. **Tipo sugerido**: fecha → líneas; dimensión con más de ~8 valores → barras horizontales ordenadas; dos medidas sin dimensión → dispersión; una sola fila → número. Se aplica sólo al crear el gráfico, nunca sobre uno ya tocado, y Story Flow lo dice en una línea («Suggested: bars by producto») con un clic para deshacerlo.
4. `DataProfiler.semanticType` y `preguntasSugeridas` pasan a usar el mismo módulo (R3). El Assistant recibe el papel de cada columna en `display_chart`.
5. **Color de la primera serie** (D3): decidir y dejarlo escrito. Recomendación: la figura usa su propia paleta (se exporta y no debe depender del tema), pero la **primera serie por defecto es el acento de la marca**, no violeta.
6. **Prueba** `probarColumnas.mjs` con los resultados de los ejemplos (las ocho consultas de la tienda y las tres de marketing): para cada una, los ejes y el tipo esperados. `probarGraficos` sigue pasando.

### M3 · Una barra lateral que se entiende (U1, U4, F9)

Propuesta de agrupación (para decidir con el autor antes de tocar nada; si quiere verla, se le enseña con una maqueta dentro de la app):

| Hoy (15 iconos) | Propuesta (7) |
|---|---|
| Explorer | **Files** |
| Search | **Search** |
| Database Schema | **Data** (esquema, fuentes, destinos; Extensions entra aquí como sección plegada: son del motor) |
| Snippets · Functions · History · Vault | **Library**, con cuatro pestañas arriba (Snippets y Variables · Functions · History · Saved) |
| DBT Studio | Sólo aparece si el proyecto tiene `dbt_project.yml` o desde la paleta |
| Source Control | **Git** (sólo si la carpeta es un repositorio) |
| Deep Dive | **Deep Dive** |
| Chart Gallery · New Execution Chain | Fuera de la tira: ya están en la pantalla de inicio, en «+» de las pestañas y en la paleta |
| Collapse · Settings | Igual |

Además: nombre visible bajo cada icono cuando la barra está expandida (opción en Appearance), y los atajos actuales no cambian.

Explorador (U4): la cabecera pasa de nueve iconos a «+ New», Refresh y un menú «…»; el nombre del archivo tiene prioridad sobre tamaño y fecha (que salen al pasar el ratón o al ensanchar).

Cada panel sigue siendo el mismo componente: se mueve, no se reescribe. **Prueba**: `probarInteraccion` (atajos y paneles) + recorrido visual.

### M4 · La primera sesión (U2, F6, D1)

1. **Un solo recorrido de bienvenida** (los cinco pasos de «Welcome»), y nada más salta solo. Las demás guías pasan a ser **ayuda en su sitio**: un «?» o «Guide» en la cabecera de Story Flow, del cuaderno, de Data Flow y del Assistant, y una pista de una línea la primera vez («New here? Take the 1-minute tour») que no tapa nada.
2. El registro de tours (`onboarding/tourRegistry`) pasa a ser el único sitio que decide; se quitan las condiciones repartidas por los componentes.
3. **Tema por defecto: Amox Dark** (D1) para instalaciones nuevas; quien ya eligió, conserva el suyo.
4. **Prueba**: `probarInteraccion` con casa nueva: un modal, no cuatro.

### M5 · Resultados y cuaderno (U3, U6, U7)

1. **Barra de resultados en una fila**: Table · Chart · Profile a la izquierda; a la derecha buscar, Filters, **Explain** (Assist) y un menú **Share / Save ▾** con Save as table, Store for comparison (hoy «Store A»), Save to Vault, Pop-out y Download. «Chart it» desaparece: es la pestaña Chart.
2. **Canalón de la celda**: Run, el modo (código / resultado / los dos) y «…» con lo demás.
3. La celda de texto mide lo que su contenido (sin el hueco fijo).
4. Con el Assistant abierto y poco ancho, los paneles de Story Flow se pliegan a su tira de iconos antes de encoger la figura.

### M6 · Probar con un comando (E8, E9)

1. `scripts/correrSuites.mjs` (el corredor que se escribió para la 6.0, ya probado): cada suite en su proceso y con su casa temporal, resumen al final, `--solo <patrón>`, `--rapidas` (las puras).
2. `package.json`: `"test": "node scripts/correrSuites.mjs"`, `"test:rapidas"`, `"test:app": "node scripts/probarInteraccion.mjs"`.
3. `CLAUDE.md` al día: hay pruebas y cómo se corren; `AiSidebar` fuera; cifras reales; los módulos nuevos de la 6.0.
4. El workflow de GitHub corre `pnpm test:rapidas` en cada PR (las de motor, opcionales, en Windows).

Va antes de M7 y M8 a propósito: son las dos entregas que más código mueven y necesitan la red puesta.

### M7 · El servidor por partes (E1, E2, E7, P3, P4)

1. **`server/rutas/`**: un archivo por familia (`ia.js` 48 rutas, `dbt.js` 35, `flujos.js` 23, `base.js` 21, `git.js` 17, `proyecto.js`, `fuentes.js`, `workspaces.js`, `programacion.js`…), cada uno exporta `(app, contexto) => void`. `index.js` queda en el arranque, el contexto compartido (raíz, `dbManager`, cachés) y el atrapa-todo al final. Se mueve familia a familia, una por commit, con las suites entre medias. **No cambia ninguna URL.**
2. `ChainExecutor`: **cada paso se define una vez** (`server/flujos/pasos/<tipo>.js`: `sql(config, entradas)` y, si hace falta, `ejecutar`). `buildNodeSql` y `executeNode` leen de ahí. `probarSqlGenerado` ya ejecuta todos los pasos por los dos caminos: es la red.
3. Lecturas de disco síncronas dentro de manejadores → `fs.promises` donde el archivo puede ser grande o estar en red (carpetas sincronizadas); las de configuración pequeña pueden quedarse.
4. `console.log` → un registrador con nivel (`AMOXSQL_LOG`), para que la salida del servidor sirva para diagnosticar.
5. E7 (rutas en dos idiomas): **no se renombran** (no aporta al usuario); la regla para lo nuevo queda escrita en `CLAUDE.md`.

### M8 · El cliente por partes (E3, E4, E5, E6, P1, D6)

1. **Borrar lo muerto** (E5): los siete archivos, y las ~267 clases sin uso de `index.css` (comprobando una a una las que se arman por concatenación).
2. **`index.css` por dominios**: `estilos/base.css` (tokens y temas), `shell.css`, `resultados.css`, `flujos.css`, `ia.css`… importados desde un índice. Sin cambiar una sola regla: es mover.
3. **`SettingsModal`**: una sección por archivo (`settings/Apariencia.jsx`, `settings/IA.jsx`…), cargada al entrar en ella. Las tres secciones de ayuda salen a un panel Help.
4. **`App.jsx`**: el estado del shell (panel lateral, tema, modales) a un `ShellProvider`; los paneles laterales con `lazy()` (hoy ocho se cargan al arrancar). Objetivo medible: paquete principal de 2,98 MB a menos de 1,8 MB.
5. **Eventos de ventana** (E6): `client/src/eventos.js` con el nombre, quién lo emite y qué lleva cada uno de los 37, y dos funciones `emitir` / `escuchar` tipadas por nombre. Se migra archivo a archivo.
6. **Estilos en línea** (D6): no se persiguen los 1 419; se crean cuatro o cinco utilidades (`fila`, `columna`, `hueco-*`, `texto-secundario`) y la regla de no añadir más en lo nuevo. Se limpian al tocar cada componente.

### M9 · Color y jerarquía (D2, D4, D5, U5)

1. **Botones**: tres niveles con nombre (`btn-primario` relleno, `btn-secundario` con borde, `btn-texto`). Regla: **un primario por vista**. Extensions (Install), dbt y los diálogos se ajustan.
2. **Acentos**: los ocho «Vibrant» pasan a cubrir el círculo cromático (cian, azul, violeta, magenta, rojo, naranja, lima, verde) en vez de siete azules.
3. **Contraste con margen**: subir el piso de `text-tertiary` a 5 y el de `text-disabled` a 3,3 en `checkThemeContrast.cjs` y ajustar los temas; tamaño mínimo de texto 11 px.
4. Settings: «Store Integrations» → «Cloud storage»; revisar el orden (Appearance, Editor, AI, Data & credentials, Project, Workspaces, About).
5. Temas: mantener los diez, pero ordenar la galería (los dos de marca primero y más grandes).

### T2 · Auditoría, tanda 2

Lo que esta pasada no recorrió en pantalla: Data Flow (el panel de configuración de 2 448 líneas merece revisión propia), Canvas, Report Flow, AmoxDiagram, DBT Studio con un proyecto real, Deep Dive con un modelo real, Operations y Workspaces. Mismo método (medir, ver, leer) y los hallazgos se añaden a la auditoría como sección 11.

## 3. Lo que se propone NO hacer

- **Renombrar rutas, archivos o variables por coherencia de idioma**: mucho movimiento, ningún beneficio para el usuario.
- **Meter un gestor de estado nuevo** (Redux, Zustand): el problema de `App.jsx` es que es dueño de todo, y se arregla repartiendo en proveedores de React, que ya se usan.
- **Reescribir componentes grandes de golpe**: se parten moviendo, con las suites entre medias.
- **Virtualizar tablas o listas**: decisión ya tomada.
- **Tocar la pantalla de bienvenida**.

## 4. Cómo se sabe que mejoró

| Medida | Hoy | Objetivo |
|---|---|---|
| El servidor responde desde otra máquina | Sí | No |
| Modales que saltan solos en la primera sesión | 4 (17 pasos) | 1 (5 pasos) |
| Iconos en la barra lateral | 15 | 7–8 |
| Gráfico por defecto correcto en las 11 consultas de los ejemplos | Por medir en M2 (la auditada, mal) | 10 de 11 |
| Acciones visibles en la barra de resultados | 12 en dos filas | 6 en una |
| `server/index.js` | 7 641 líneas | < 800 |
| Paquete principal del cliente | 2,98 MB | < 1,8 MB |
| `index.css` | 22 384 líneas en un archivo | Por dominios, sin clases muertas |
| Correr todas las pruebas | 80 comandos a mano | `pnpm test` |

## 5. Decisiones para el autor

1. **¿M0 y M1 entran en la 6.0.0?** Recomendación: **sí**. M0 no debería esperar, y F1 lo introdujo la propia 6.0.
2. **La agrupación de la barra lateral (M3)**: es el cambio más visible. ¿La propuesta de siete entradas, o prefieres verla antes en una maqueta dentro de la app?
3. **El color por defecto de la primera serie de un gráfico (M2.5)**: ¿el acento de la marca, o se queda el violeta?
4. **Tema por defecto (M4.3)**: ¿Amox Dark para instalaciones nuevas?

## 6. Bitácora

| Fecha | Entrega | Qué |
|---|---|---|
| 2026-11-12 | — | Auditoría y plan escritos |
| 2026-11-12 | M0 | Hecha (c28affa). `server/puerta.js`: escucha en 127.0.0.1, lista de orígenes, `Host` local, CORS con la misma lista. Elegida en vez de un token de sesión: `EventSource`, imágenes y descargas no pueden mandar cabeceras y ningún GET tiene efectos. Rutas con apóstrofo escapadas (importar, Data Flow, modo sin herramientas). `probarServidorCerrado` 14/14 |
| 2026-11-12 | M1 | Hecha (72cc79c), F1–F11. F3 cambió de diseño: el historial pasa a ser opcional (`historial` en `query`/`queryWithMetadata`) y sólo lo piden el editor y las celdas; `probarSecretos` se ajustó. Guardas nuevas: `probarHistorial`, `probarFormatoCelda`, `probarTextosEnIngles` |
| 2026-11-12 | M2 | Hecha en parte (035c144): R1 y R2 con `client/src/utils/columnas.js`, 11 de 11 consultas de ejemplo con el gráfico esperado (`probarColumnas`), «Suggested… Undo» verificado en la app. Un borrador de gráfico guardado antes de la 6.0 conserva los ejes viejos (se respeta lo recordado). Pendiente: R3 (Data Profiler y preguntas sugeridas del servidor sobre el mismo módulo) y D3, que espera la decisión 3. 83/83 suites pasan |
| 2026-11-12 | §5 | El autor decide: todo entra en la 6.0; la barra lateral según la maqueta (artefacto «AmoxSQL barra lateral»); primera serie = acento de la marca; Amox Dark por defecto |
| 2026-11-12 | M3 + D3 + M4.3 | Hechas. Los paneles conservan sus ids (`activeSidebarTab`), la tira muestra grupos (`GRUPO_DE_PANEL` en `App.jsx`): así los atajos, la paleta y lo que abre «history» o «vault» siguen igual. Data = `DatabaseExplorer` + Extensions plegable; Library = pestañas sobre los cuatro paneles (vuelve a la última); dbt y Git según `/api/dbt/detect` y `/api/git/status` (se vuelve a mirar al recuperar el foco). `mostrarPanel` (paleta) despliega el panel y traduce `extensions`. Explorador: «+ New», Refresh, «…»; tamaño y fecha con `@container` (≥ 360 px) o al pasar el ratón. D3: `COLOR_PALETTES.default[0] = #00c4c6` (oklch 0.73 0.155 195), fijo y no del tema. M4.3: `TEMA_POR_DEFECTO` en `theme.js`. Al probarlo salió un fallo previo de `SqlEditor`: `onMount` con el `tabId` de un render anterior dejaba el editor sin modelo tras ejecutar; ahora lee el id, el valor y el idioma actuales por ref |
| 2026-11-12 | M2 (R3) | Hecha. Las reglas de NOMBRE viven en `server/compartido/papelesDeColumna.json`: el servidor lo lee con `require` (Electron 33 = Node 20, sin `require` de ESM; y en el instalable el servidor no ve `client/src`), el cliente lo importa con `with { type: 'json' }` (Vite: `server.fs.allow` incluye esa carpeta). `columnas.js` expone `papelDe` (el núcleo, de filas o de un perfil) y `pesoDeMedida`; `DataProfiler.semanticType` lo usa con sus estadísticas (secuencia 1..n por min/max y conteo aproximado); `preguntasSugeridas` toma de ahí importe, «no dimensión», identificador y el orden de dimensiones. `probarColumnas` 22/22 |
| 2026-11-12 | M4 | Hecha. `tourRegistry.ofrecerTour(id)` (decide ahí si se vio); `OnboardingHost` pinta la pista (una a la vez, la última; nunca con un recorrido abierto; cerrarla la marca vista). Las ocho aperturas automáticas pasan a ofertas; sólo `getting-started` se abre solo. «?» nuevo en la cabecera del cuaderno (Story Flow, Data Flow, Assistant y Deep Dive ya lo tenían). `probarInteraccion` comprueba con casa nueva que sólo se abre la bienvenida |
| 2026-11-12 | M5 | Hecha. Resultados: una fila y el menú **Save / Share ▾** con posición fija a la ventana (el panel de resultados recorta con `overflow: hidden`), hacia arriba si no cabe debajo. Cuaderno: canalón Run · vista (rota) · «…»; el hueco bajo una celda de texto = el de entre celdas (márgenes del último hijo). Story Flow: por debajo de 760 px de ancho total, tira de iconos y panel encima (`sf-tira`) |
| 2026-11-13 | M6 | Hecha. `scripts/correrSuites.mjs`: cada suite en su proceso con `AMOXSQL_HOME` temporal (borrada al acabar), `--rapidas`, `--solo`, `--log`, `--sondear`. Las rápidas no se eligen por lista: llevan `// @suite rapida` y corren con `scripts/lib/sinMotor.mjs` (`module.registerHooks` hace fallar cualquier `@duckdb/*`), así una marca equivocada falla; el sondeo encontró 27 (+ `probarInteraccion --puro`). `pnpm test` 85/85 en 315 s; `pnpm test:rapidas` 28/28 en 6 s. `.github/workflows/pruebas.yml`: rápidas obligatorias (instalación con `--ignore-scripts`), todas en Windows con `continue-on-error`; sin correr aún en GitHub (nada se ha subido). `CLAUDE.md`: pruebas, cifras reales, `AiSidebar` como código muerto, barra por grupos, módulos de la 6.0 |
| 2026-11-13 | M7 | Hecha. **1.** `server/index.js` de 7 672 a ~670 líneas: doce familias en `server/api/` (`git`, `dbt`, `flujos`, `ia`, `consultas`, `base`, `proyecto`, `archivos`, `fuentes`, `operacion`, `workspaces`, `ajustes`), cada una un `express.Router` montado antes del atrapa-todo; ninguna URL cambia. La carpeta es `api/` y no `rutas/`: `server/rutas.js` ya existe (dónde vive la casa de AmoxSQL). Las movió una herramienta que sigue cada unión del árbol de sintaxis: una declaración de `index.js` usada sólo por la familia va con ella; lo compartido llega por `server/api/compartido.js` (funciones desestructuradas; el estado que cambia en marcha —`ROOT_DIR`, `PROYECTO_ABIERTO`, cachés— con getter/setter). En `ia.js` se llama `compartido` porque un manejador ya tenía un `ctx` propio (lo cazó la prueba de humo: 500 en `/api/ai/preguntas-sugeridas`, deshecho antes del commit). Un commit por familia, cada uno tras la prueba de humo (las 115 rutas GET sin parámetros contra la línea base: iguales). **2.** `server/flujos/pasos.js`: doce pasos de Data Flow definidos una vez; `ejecutarPaso` y `buildNodeSql` leen de ahí; donde las copias diferían manda la ejecución (operador desconocido del filtro). `type_cast` y `clean` siguen aparte (leen el esquema al correr), como join/merge. **3.** El recorrido del proyecto y las lecturas grandes con `fs.promises` (índice de archivos, carpetas, gráficos de una consulta, lo que sigue a un renombre, el manifest de dbt, la versión anterior de un `.sql`); `probarRutasDeArchivos` pasa con el código de antes y el de ahora. **4.** `server/registrador.js` (`AMOXSQL_LOG`), las 235 llamadas a `console.*` del servidor por el árbol de sintaxis; `registro` chocaba con variables locales, de ahí `registrador`. **5.** Regla de nombres de rutas nuevas en `CLAUDE.md`. De paso: `/api/ai/sessions` daba 500 (Deep Dive sin lista de sesiones: `c.*` con un GROUP BY escrito a mano y columnas añadidas por migraciones) — arreglado, `probarSesionesDeepDive`. `dbtConvivir` (require) y `extractReferencedTables` ya estaban sin uso antes de partir: quedan para M8 (E5). |

