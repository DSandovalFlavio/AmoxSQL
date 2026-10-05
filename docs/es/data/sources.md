# Fuentes de datos

**🌐 [English](../../en/data/sources.md) · Español**

> Una fuente es un dato que llega de fuera —un Excel, un CSV, un Parquet, una carpeta donde aparece cada semana, un bucket, una tabla de un lago— con un **nombre** estable. Se define una vez y se consulta por su nombre en todas partes: `SELECT * FROM fuentes."ventas-semanales"`.

## Qué es

Una fuente tiene dos mitades:

- **La definición** —el nombre, qué es (archivo, carpeta, bucket, lago), cómo se lee (hoja, rango, formato)— es la misma en todas las máquinas. Vive en el **workspace** (la ven todos sus proyectos y viaja en el `.amoxworkspace`) o en el **proyecto** (`.amoxsql/fuentes/`). Con el mismo nombre, gana la del proyecto.
- **Dónde está en esta máquina** —`G:\Tiendas\entrada` aquí, `D:\Nube\Tiendas\entrada` en la de al lado— lo guarda cada máquina por su cuenta. Un archivo dentro del proyecto va con ruta relativa y vale en todas sin hacer nada; una dirección en la nube (`s3://…`) es la misma en todas y se guarda con la fuente.

Cada fuente es una **vista** del catálogo `fuentes`: el dato se lee del archivo cada vez y nada se copia a la base del proyecto. Por eso el editor, los cuadernos, Data Flow, el asistente y la línea de comandos la usan igual.

## Cuándo usarla

- El mismo archivo se usa en varios proyectos de un cliente.
- El archivo cambia de sitio según la máquina (una carpeta sincronizada).
- El archivo llega cada semana con otro nombre (*Ventas Semana 39.xlsx*, *Ventas Semana 40.xlsx*…).
- Los datos viven en un bucket o en un lago (Delta, Iceberg, DuckLake).
- Un proceso prepara un archivo que otros proyectos van a leer (ver **Publicar**).

## Cómo usarla

### Crear una fuente
- Desde el **explorador de base**, sección **Sources**, botón **+**.
- Desde la **vista de workspaces**, en la ficha de un workspace, **New source** (sin abrir ningún proyecto).

En el formulario eliges **qué lee**:

| Tipo | Para qué |
|---|---|
| **One file** | Un archivo que no se mueve, o que se reemplaza en su sitio |
| **A folder** | Una carpeta donde llega el archivo: **the newest file** (el más reciente que terminó de llegar) o **all files, combined** (todos unidos, con una columna `_archivo`) |
| **Cloud bucket** | Parquet, CSV o JSON en un bucket (o una carpeta con la misma forma), con patrón de ruta y particiones *hive* (`anio=2026/`) |
| **Data lake** | Una tabla Delta, Iceberg o DuckLake. **Explore** encuentra las tablas de un lago |

**Preview** (o **Test connection** en la nube) la lee de verdad, sin guardar nada, y dice qué falla si algo falla: la credencial, el permiso, la ruta, la red, una extensión que hay que descargar la primera vez.

### El nombre
Minúsculas, cifras y guiones: `ventas-semanales`. Como lleva guiones, en SQL va **entre comillas**: `fuentes."ventas-semanales"`.

### Un Excel
Si es un Excel, el formulario enseña la hoja tal como es, con letras y números de fila: **clic en el número de la fila** donde están los nombres de columna y, si hace falta, en la **letra** de la última columna. `A4:E` lee desde la fila 4 hasta la primera fila vacía —la forma de un informe con título arriba y notas abajo—. También puedes **rellenar hacia abajo** las celdas combinadas, **limpiar los nombres** de columna y **unir varias hojas** con la misma forma (con una columna `_hoja`).

### Una carpeta: el archivo que acaba de llegar
- Un **patrón** de nombre (`ventas*.xlsx`) y, si quieres, las subcarpetas.
- Sólo cuenta un archivo que **terminó de llegar**: el que lleva unos segundos sin cambiar —una carpeta sincronizada lo escribe en varias pasadas—. Nunca los temporales de Office (`~$…`) ni las descargas a medias.
- Con AmoxSQL abierto, al llegar uno nuevo la fuente ya lo lee y un aviso lo dice. Con AmoxSQL cerrado, un proceso de Data Flow o de la línea de comandos elige el más reciente al empezar.

### En la nube y en un lago
Para un bucket privado, crea una **credencial de nube con nombre** en **Settings → Credentials → New cloud credential** (S3 o compatible, o Google Cloud Storage) y elígela en la fuente. Se guarda cifrada con el llavero del sistema y sólo abre la carpeta de su fuente, así que dos buckets con claves distintas conviven. Los proyectos sólo anotan su **nombre**.

### Ubicarla en otra máquina
Al abrir un proyecto que usa una fuente que en esta máquina no está ubicada, un aviso lo dice. En el explorador, la fuente sale con un aviso: clic derecho → **Set location on this machine…**. Consultarla sin ubicar da un mensaje que dice qué hacer.

### Usarla
- **Editor y cuadernos:** `SELECT * FROM fuentes."ventas-semanales"`. Se puede arrastrar desde el explorador.
- **Data Flow:** el nodo **Source** la elige por su nombre; los nodos de después la leen donde está, sin copiarla.
- **El asistente** ve las fuentes, con su descripción.
- `CREATE TABLE foto AS SELECT * FROM fuentes."x"` deja una tabla que **recuerda de dónde salió** (ver más abajo).

### De dónde salió cada tabla
Una tabla cargada desde un archivo —importándola, con Import File o Import Folder de Data Flow, o materializando una fuente— recuerda qué archivo era, con qué hoja y rango, cuándo se leyó y cuántas filas tenía. El explorador lo dice al desplegar la tabla y **avisa si el archivo cambió después de cargarlo**. Import Folder añade la columna `_archivo` a cada fila.

### Publicar
El nodo **Publish** de Data Flow escribe un Parquet en una carpeta (o un bucket) y lo **registra como fuente** del workspace: cualquier otro proyecto lo lee por su nombre.

- **Nadie lee nunca medio archivo:** se escribe aparte y se cambia de una vez. Si otro programa lo tiene abierto, se reintenta unos segundos; si sigue, se dice quién lo tiene (cuando Office lo deja saber) y el publicado queda como estaba.
- **Lleva dentro su esquema, su fecha y de dónde viene**: quien lo usa en otra máquina lo sabe sin nada más.
- **Un cambio que rompe a quien ya lo lee no se publica:** si una columna desaparece o cambia de tipo, se detiene y el anterior queda intacto (se puede bajar a aviso). Añadir columnas se permite.
- **Frescura:** una fuente puede avisar si su archivo tiene más de N días.
- CSV también se puede publicar, sin la garantía de esquema.

### Destinos: adónde entregan los procesos
Un **destino** es la dirección contraria: una carpeta con nombre donde los procesos dejan lo que producen. Por ejemplo, `entrega-cliente` es `G:\Clientes\Norte\Reportes` en esta máquina y otra carpeta en la de al lado. Vive en **Destinations**, debajo de Sources, en el explorador de base y en la ficha de un workspace.

- **Dos mitades, como una fuente.** El nombre, la descripción y una **subcarpeta por fecha** opcional (`{fecha:AAAA}/{fecha:MM}`) viajan con el workspace o el proyecto. La carpeta es de esta máquina: en otra, el destino la pide la primera vez. Una carpeta dentro del proyecto va relativa y vale en todas.
- **En un proceso.** En **Excel**, **Export File** y **Publish**, elígelo en **Deliver to**. El nodo entonces sólo da el **nombre del archivo**, donde valen `{fecha}`, `{fecha:AAAA-MM}`, `{hora}` y los `${parámetros}`: `cierre_{fecha:AAAA-MM}_${tienda}.xlsx`.
- **La fecha es la de la ejecución.** Una ejecución programada usa la fecha que tocaba: el cierre de septiembre que corre el 2 de octubre lleva la fecha de septiembre.
- **Lo que falla, se dice.** Se para con un mensaje claro en estos casos:
  - un destino sin carpeta en esta máquina;
  - una carpeta que no se alcanza (una unidad desconectada);
  - un nombre de archivo con carpetas dentro.

  Nunca crea por su cuenta la carpeta del destino; sólo crea dentro de ella las subcarpetas por fecha.

## Notas y gotchas

- Si la base del proyecto tiene un esquema llamado `fuentes`, `fuentes."x"` es ambiguo y el motor lo dice; usa `fuentes.main."x"`. El explorador avisa.
- Una vista del proyecto que lee una fuente sólo funciona donde exista esa fuente.
- La primera vez, leer un bucket o un lago puede necesitar internet para descargar una extensión del motor (`httpfs`, `delta`, `iceberg`, `ducklake`).
- En la línea de comandos, un proceso que usa una fuente sin ubicar en esta máquina sale con el código **3** antes de empezar; un Publish con el esquema roto sale con **1**.
- La primera versión que trae las fuentes (5.10) sube la base propia de AmoxSQL al esquema v3: la 5.9 ya no la abre.

## Ver también
- [Importar datos](importing-data.md)
- [Explorador de base de datos](database-explorer.md)
- [Workspaces](../user-guide/workspaces.md)
- [Data Flow](../data-flow/data-flow.md) · [Referencia de nodos](../data-flow/node-reference.md) · [Línea de comandos](../data-flow/command-line.md)
