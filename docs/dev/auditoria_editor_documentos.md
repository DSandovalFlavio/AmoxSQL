# Auditoría — Para qué sirven los archivos `.md` en AmoxSQL

> Replanteamiento del papel del editor de markdown. La primera propuesta lo trataba como un *documento analítico* (resultados de consulta, gráficos incrustados, frescura de datos) y **se solapaba con los notebooks**, que ya hacen eso mejor. Esta auditoría redefine el uso real —**documentación de procesos, flujos y notas, escrita por ingenieros de datos**— y de ahí derivan el mockup y el plan. Fecha: 2026-09-12.

---

## 1. El reparto de formatos

AmoxSQL tiene cinco formatos propios y cada uno ya tiene un trabajo. El `.md` es el único sin definición clara, y por eso se le colaban funciones de los demás.

| Formato | Trabajo | Ejecuta |
|---|---|---|
| `.sqlnb` **Notebook** | Analizar: celdas SQL + markdown + inputs, resultados cacheados, gráficos por celda | sí |
| `.amoxvis` **Story Flow** | Un gráfico, con su narrativa y su exportación | sí (la consulta) |
| `.amoxdeck` **Report Flow** | Presentar el análisis a alguien | sí (refresca) |
| `.sqlchain` **Data Flow** | Construir y correr un pipeline: DAG, nodos, logs, historial, linaje | sí |
| `.md` **Documento** | **Lo que hay que saber, no lo que hay que correr** | **no** |

La línea divisoria, en una frase:

> Si el documento necesita ejecutar algo para tener sentido, es un notebook o una chain. Si su valor está en lo que dice y en a qué apunta, es un `.md`.

Un resultado de consulta dentro de un `.md` es una celda de notebook mal colocada: sin entorno, sin caché de resultados, sin historial y sin las herramientas que el notebook ya tiene alrededor. **El `.md` no ejecuta nada. Enlaza a lo que sí ejecuta.**

---

## 2. Quién escribe y para qué

El perfil es el **ingeniero de datos**, y el documento casi siempre es una de estas cuatro cosas:

### 2.1 Procedimientos (lo que hay que hacer)
- **Runbook operativo** — qué hacer cuando falla la carga de las 3:00. Pasos, comandos, verificaciones, a quién avisar, cómo confirmar que quedó bien.
- **Checklist de despliegue o migración** — pasos verificables, en orden, con marca de hecho.
- **Traspaso / puesta a punto** — cómo levantar el entorno, qué credenciales hacen falta, qué mirar primero.

### 2.2 Descripción de flujos (lo que existe y cómo encaja)
- **Documentación de un pipeline** — qué hace `carga_diaria.sqlchain`, cuándo corre, de qué depende, qué se rompe aguas abajo si falla.
- **Contrato de una tabla** — dueño, frescura esperada, origen, quién consume. Prosa y acuerdo, no perfilado estadístico.
- **Mapa del proyecto** — el README que dice qué hay y dónde, y enlaza al resto de artefactos.

### 2.3 Memoria (por qué las cosas son como son)
- **Decisión técnica** — por qué este particionado, por qué este motor, qué se descartó y por qué.
- **Incidencia / postmortem** — línea de tiempo, causa raíz, acciones correctivas con seguimiento.
- **Convenciones** — nomenclatura, estándares de SQL, estructura de carpetas.

### 2.4 Notas y trabajo pendiente
- **Lista de actividades** — el pendiente del día, del sprint, de la migración.
- **Notas sueltas** — lo que se apunta mientras se hace otra cosa y no puede esperar a tener forma.

Tres de las cuatro familias son **texto estructurado con estado**: pasos, casillas, responsables, fechas. Ninguna necesita ejecutar SQL. Eso cambia por completo qué tiene que ofrecer la interfaz.

---

## 3. Las 20 preguntas, rehechas

Las de la primera versión eran de analista escribiendo un informe. Estas son de ingeniero de datos documentando y organizando trabajo.

| # | Lo que se pregunta | Respuesta de diseño |
|---|---|---|
| 1 | Reventó la carga de anoche, ¿dónde está el runbook y cómo lo sigo sin perderme? | Pasos numerados con comandos copiables y casillas de progreso; el documento recuerda por dónde ibas |
| 2 | ¿Cómo documento lo que hace una chain sin redibujar el DAG a mano? | **Generar el diagrama desde el `.sqlchain`**: el DAG ya existe, se serializa a mermaid en un clic |
| 3 | Se me ocurre algo a media tarea, ¿cómo lo apunto sin perder el hilo? | Captura rápida: una tarea con fecha se añade al documento de notas sin cambiar de pestaña |
| 4 | ¿Dónde veo todo lo que tengo pendiente en el proyecto? | Panel de tareas que agrega los `- [ ]` de **todos** los `.md`, agrupados por documento |
| 5 | Marco una casilla en la vista previa, ¿se guarda de verdad? | Sí: la casilla escribe en el archivo. Es la interacción más usada de estos documentos |
| 6 | ¿Este documento sigue vigente o lleva un año sin que nadie lo mire? | Front-matter con última revisión y aviso visible cuando caduca |
| 7 | ¿De quién es este proceso? ¿A quién pregunto? | Dueño y etiquetas en el front-matter, editables como fichas, no como YAML a mano |
| 8 | ¿Qué otros documentos hablan de este? | Retroenlaces: quién enlaza aquí, calculado del proyecto |
| 9 | ¿Cómo enlazo a la consulta, la chain o el notebook concretos? | `@` autocompleta artefactos del proyecto; el enlace abre la pestaña correspondiente |
| 10 | Tengo que dejar por escrito una decisión, ¿hay un formato o improviso? | Plantilla de decisión técnica: contexto, opciones, elección, consecuencias |
| 11 | ¿Cómo escribo un procedimiento de doce pasos con comandos? | Bloque de pasos: numeración automática, comando copiable y casilla por paso |
| 12 | Este paso borra datos, ¿cómo aviso de verdad? | Callouts con los cinco niveles, insertables desde el menú |
| 13 | Necesito el diagrama del flujo, ¿salgo de la app? | No: mermaid con plantillas (flujo, secuencia, estados, ER) y vista previa en vivo mientras se escribe |
| 14 | Hubo incidencia, ¿cómo registro la línea de tiempo y las acciones? | Plantilla de incidencia con cronología y acciones como casillas con responsable |
| 15 | El runbook tiene 40 secciones, ¿cómo navego y reordeno? | Panel de estructura con arrastrar para mover secciones enteras |
| 16 | Escribo rápido, ¿tengo que acordarme de la sintaxis? | `/` inserta cualquier elemento; el selector dice qué bloque es y lo convierte |
| 17 | ¿Qué cambió en este documento desde el último commit? | Estado de Git por sección en el panel de estructura y en la barra inferior |
| 18 | ¿Cómo le paso esto a alguien que no tiene AmoxSQL? | PDF con texto real, Word o HTML autocontenido |
| 19 | ¿Cómo encuentro un documento entre cuarenta? | Búsqueda en el contenido de todos los `.md` del proyecto desde el panel |
| 20 | ¿Dónde están los atajos y cómo escribo sin distracción? | Pie del menú `/` con atajos en contexto y modo foco |

---

## 4. Qué se cae de la propuesta anterior

Lista explícita, para que no vuelva por la puerta de atrás:

| Se cae | Por qué | Dónde vive |
|---|---|---|
| Bloque `sql` ejecutable con tabla de resultados | Es una celda de notebook sin el notebook alrededor | `.sqlnb` |
| Gráfico `amoxchart` incrustado | Ya existe en el deck y en el notebook | `.amoxdeck`, `.sqlnb` |
| `amoxdict` (diccionario desde el perfilado) | El perfilado es análisis; el contrato de la tabla es prosa | `DataProfiler`, `.sqlnb` |
| `amoxmetric` (definición de métrica) | Pertenece al análisis que la calcula | `.sqlnb` |
| "Refrescar todo", "Congelar", frescura de datos | No hay datos vivos que refrescar | `.amoxdeck` |
| Sidecar `<archivo>.md.state.json` | Sin resultados cacheados, no hay estado que guardar | — |
| Grupo "Datos" en la barra | Se queda en tres grupos | — |
| Convertir a deck / a notebook | Si el contenido quiere ser eso, nació en el formato equivocado | — |
| Variables `{{ }}` | Añaden peso a cambio de un caso raro en documentación de procesos | `.sqlnb`, `.sqlchain` |

**La interfaz resultante es más pequeña que la actual, no más grande.** Ese es el objetivo, no un efecto secundario.

---

## 5. Lo que gana el `.md`, y que ningún otro formato da

1. **Estado sobre el texto** — casillas que se marcan y se guardan, y que se pueden agregar y contar a nivel de proyecto.
2. **Metadatos de vigencia** — dueño, estado, última revisión. Una documentación de procesos sin fecha de caducidad miente a los seis meses.
3. **Tejido de enlaces** — es la única capa que puede apuntar a todo lo demás (`.sqlchain`, `.sqlnb`, `.sql`, `.amoxvis`) y saber quién apunta a ella.
4. **Diagramas** — mermaid es la herramienta de documentación de flujos, y generarlo desde una chain existente es casi gratis.
5. **Velocidad de escritura pura** — sin resultados que esperar ni gráficos que configurar, la única métrica que importa es cuántas pulsaciones cuesta dejar algo escrito.

---

## 6. Principios de la interfaz

1. **No ejecuta nada.** Si aparece un botón de ejecutar, el contenido está en el formato equivocado.
2. **Tres grupos en la barra y ninguno más**: bloque, formato, insertar. Todo lo demás vive en `/` o en la barra contextual.
3. **La casilla es la interacción principal**, no un detalle del render. Se marca desde la vista previa y escribe en el archivo.
4. **El documento conoce el proyecto**: enlaza a artefactos reales con autocompletado y sabe quién lo enlaza a él.
5. **La vigencia es visible.** Un documento sin revisar desde hace meses lo dice en la cabecera.
6. **El archivo sigue siendo markdown plano.** Front-matter YAML estándar y bloques cercados normales: fuera de AmoxSQL se lee igual.

---

## 7. Continúa en

- [`mockup_editor_markdown.html`](mockup_editor_markdown.html) — la interfaz propuesta, pantalla por pantalla.
- [`plan_editor_documentos.md`](plan_editor_documentos.md) — fases de implementación.
