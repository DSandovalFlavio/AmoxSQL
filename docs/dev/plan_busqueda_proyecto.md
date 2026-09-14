# Plan — Búsqueda en el proyecto

> Buscar texto dentro de los archivos del proyecto, no solo por nombre. Hoy el explorador filtra por nombre de archivo y nada más: la pregunta *«¿dónde escribí lo de la marca de agua?»* no tiene respuesta dentro de la app. Vive en la barra de actividad, no dentro de un editor concreto; el panel de estructura del editor de markdown será **un consumidor más**, no el dueño. Relacionado: [`plan_editor_documentos.md`](plan_editor_documentos.md) §fase 4. Fecha: 2026-09-13.

---

## 1. Lo que mide un proyecto real

Medido sobre `Curso_SQL`, buscando la palabra «ventas»:

| Ámbito | Archivos | Leído | Tiempo | Coincidencias |
|---|---|---|---|---|
| **Fuente** (`.sql .md .amoxvis .sqlchain .amoxdeck .json .yaml .txt`) | 184 | **1,0 MB** | **31 ms** | 756 |
| **Datos** (`.csv .parquet .xlsx .duckdb`) | 176 | **335 MB** | **6.118 ms** | **0** |

**433× más peso, 197× más lento, cero resultados.** El proyecto tiene un `export.csv` de 88 MB y un `curso_sql.duckdb` de 121 MB. Incluir datos por defecto congelaría la app seis segundos para no encontrar nada.

Y los `.parquet` / `.duckdb` son **binarios**: leerlos como texto no solo es lento, puede producir coincidencias basura con secuencias de bytes que parecen palabras.

**De aquí sale todo lo demás.** El ámbito por defecto no es una preferencia de gusto: es la diferencia entre 31 ms y 6 segundos.

---

## 2. Tres categorías, no dos

La línea no es «datos sí / datos no», sino **por qué existe el archivo**:

| Categoría | Extensiones | Por defecto |
|---|---|---|
| **Fuente** — lo escribió una persona | `.sql` `.md` `.amoxdeck` `.sqlnb` `.sqlchain` `.amoxvis` `.yaml` `.yml` `.txt` `.json` de configuración | **siempre**, no se puede apagar |
| **Datos de texto** — lo generó una consulta | `.csv` `.tsv` `.jsonl` `.ndjson` | **apagado**, con interruptor |
| **Binarios** | `.parquet` `.xlsx` `.duckdb` `.db` `.ducklake`, imágenes | **nunca**, sin interruptor |

La tercera categoría no lleva interruptor a propósito: buscar texto dentro de un parquet no tiene sentido, y para eso está DuckDB.

---

## 3. Decisiones tomadas

- **Texto plano, sin expresiones regulares.** Sin distinguir mayúsculas ni acentos. Para «¿dónde escribí lo del reintento?» sobra, y regex multiplica el coste de la interfaz (validación, errores de sintaxis, resaltado).
- **Solo buscar, sin reemplazar.** Reemplazar en lote es donde se rompen los proyectos: necesita vista previa, selección por coincidencia y deshacer. Cuando toque, será su propio plan.
- **Vive en la barra de actividad**, junto a Explorer, Schema, DBT, Git y los demás. No dentro de un editor.

---

## 4. Diseño

### 4.1 Un endpoint, con el índice que ya existe

```
GET /api/search?q=…&scope=fuente|datos|todo&limit=200
→ { hits: [{ path, line, text, col }], truncado, omitidos: [{path, motivo}], ms }
```

Reutiliza el recorrido y la **caché por `mtime`** de `/api/docs/index` (`server/index.js`), que ya salta `node_modules`, `.git`, `dist` y los bloques cercados. De hecho `/api/docs/index` pasa a ser **un caso particular** de este índice (`scope` acotado a `.md`), lo que también adelgaza lo construido en la fase 3 del editor.

### 4.2 Buscar el texto que significa algo, no el JSON en crudo

Varios formatos propios son JSON, y buscarlos en crudo da ruido puro: «bar» encontraría `"chartType": "bar"` y «type» devolvería todos los archivos. El índice extrae **el texto que el usuario reconoce de la interfaz**, con los parsers que ya existen:

| Formato | Qué se indexa | Con qué |
|---|---|---|
| `.sqlnb` | el SQL y el markdown de cada celda | `notebookParser.js` |
| `.sqlchain` | nombre, descripción y etiquetas de los nodos | `chainUtils.js` |
| `.amoxvis` | título, ejes y la consulta | lectura directa del JSON |
| `.amoxdeck` | tal cual — **ya es markdown** con front-matter | ninguno |
| `.md`, `.sql`, `.yaml`, `.txt` | tal cual | ninguno |

**`.sqlnb.state.json` se excluye siempre.** Es el sidecar con resultados cacheados: pesa megas y no contiene nada que nadie haya escrito, aunque acabe en `.json`.

### 4.3 Límites, y decirlos en voz alta

- **2 MB por archivo** por defecto. Un CSV de 88 MB se salta incluso con los datos activados.
- **Se respeta `.gitignore`**: fuera `exports/`, artefactos generados y todo lo que el proyecto ya considera desechable.
- Lo omitido **se dice**: «3 archivos omitidos por tamaño», «176 archivos de datos no incluidos (335 MB)». Omitir en silencio es peor que no buscar: el usuario concluye que su texto no existe.
- El interruptor de datos de texto enseña **el número antes de activarse**: *«176 archivos, 335 MB — la búsqueda tardará varios segundos»*. Que la decisión se tome con el dato delante.

### 4.4 Choque de atajos que hay que resolver

<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> está libre en `App.jsx` y es **la convención universal** para buscar en archivos. Pero la fase 4 del editor de markdown se lo asignó al **modo foco**.

**Propuesta:** la búsqueda global se queda con <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>, y el modo foco pasa a <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> (libre), además de su botón en la barra de estado, que ya existe.

Ocupados hoy en `App.jsx`: `Ctrl+K`, `Ctrl+Shift+P`, `Ctrl+B`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+Shift+A`, `Ctrl+Shift+E`, `Ctrl+Shift+D`, `Ctrl+Shift+/`, `Ctrl+W`, `Ctrl+N`, `Ctrl+Enter`.

---

## 5. Fases

**Estado: fases 1 a 4 implementadas (2026-09-13).** Lo construido y lo que cambió respecto a este plan está al final, en §7.



### Fase 1 — Buscar en la fuente
- `GET /api/search` con `scope=fuente`, texto plano, caché por `mtime`.
- Panel en la barra de actividad: caja de búsqueda, resultados agrupados por archivo, la línea con el término resaltado, contador total.
- Pulsar un resultado abre el archivo. Con <kbd>Enter</kbd> se recorren los resultados sin soltar el teclado.
- Límite por archivo y respeto a `.gitignore`.

**Aceptación:** encontrar una frase escrita hace semanas en cualquier `.sql` o `.md` del proyecto, en menos de 100 ms, sin saber en qué archivo estaba.

### Fase 2 — Formatos propios
- Extracción por formato (§4.2) para `.sqlnb`, `.sqlchain` y `.amoxvis`.
- El resultado dice **dónde** dentro del archivo: «celda 3», «nodo *limpieza*», y al abrir salta ahí.

### Fase 3 — Ámbito ampliable
- Interruptor de datos de texto, con su aviso de peso.
- Filtro por tipo de archivo en la propia caja.
- `/api/docs/index` se reescribe como caso particular del índice general.

### Fase 4 — Enganches
- **Editor de markdown**: la lupa del panel de estructura llama al mismo endpoint con el ámbito acotado a `.md`. El editor **no implementa búsqueda**, solo la invoca.
- Paleta de comandos: una acción que abre el panel con lo que haya seleccionado.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Buscar se vuelve lento al crecer el proyecto | El ámbito por defecto es 1 MB; la caché por `mtime` solo relee lo que cambió |
| El usuario activa los datos y la app parece colgada | Aviso con el peso antes de activar, límite por archivo, y resultados en streaming si hiciera falta |
| Coincidencias basura en binarios | No se leen nunca; no hay interruptor que lo permita |
| Buscar JSON en crudo devuelve ruido | Extracción por formato (§4.2); nunca se indexa la estructura, solo el contenido |
| El índice se queda obsoleto | Invalidación por `mtime`, igual que `ai/skills.js` |
| Dos atajos para <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Se decide antes de escribir código (§4.4) |


---

## 7. Lo implementado (2026-09-13)

`server/projectSearch.js` (nuevo) + `GET /api/search` + `GET /api/docs/index`, y
`client/src/components/SearchPanel.jsx` en la barra de actividad con
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>. El modo foco del editor de
markdown pasó a <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> (§4.4).

**El índice de documentos dejó de ser un endpoint aparte.** Las 132 líneas de
escaneo que vivían dentro de `server/index.js` se fueron: `/api/docs/index` es
ahora una vista del mismo recorrido. Un recorrido, dos consumidores.

### Dos fallos que solo aparecieron ejecutándolo

**No todo `.json` es configuración.** Un `dataset.json` de 147 KB con un volcado
de filas se clasificaba como fuente y **acaparaba las 500 coincidencias él
solo**: los `.sql` y los `.md` no llegaban a verse. Ahora un `.json` que empieza
por `[` o que pasa de 512 KB cuenta como datos.

**El tope global mataba el reparto.** Aunque un archivo no sea un volcado, el
primero que casa mucho se come el presupuesto. Hay un tope de 20 coincidencias
**por archivo**; se cuentan todas y el panel enseña «20 de 143».

Medido después del arreglo, sobre el mismo proyecto y la misma búsqueda:

| | Antes | Después |
|---|---|---|
| Coincidencias | 500 en **1 archivo** | 134 en **39 archivos** |
| Tiempo | 39 ms | 65 ms |
| Formatos alcanzados | `.json` | `.txt` `.sql` `.md` `.amoxvis` `.amoxdeck` |

### Verificado

44 comprobaciones sobre `projectSearch` (categorías, `.gitignore`, extractores
de los tres formatos propios, caché, topes, acentos) contra el repositorio y
contra un proyecto real, más la ruta de interfaz accionada en la app:
el atajo abre el panel, la búsqueda resalta, agrupa por archivo, **no aparece un
solo `.csv` ni `.parquet`**, encuentra dentro de un `.sqlchain` por el nombre del
nodo, y el interruptor de datos avisa de los 261 MB antes de activarse.

### Pendiente

- Filtro por tipo de archivo dentro de la caja (§fase 3).
- Ir a la línea exacta al abrir un resultado: hoy abre el archivo. Necesita que
  `LayoutManager.openFile` acepte una línea.
- Estado en Git por sección, lo único que queda de la fase 4 del editor.
