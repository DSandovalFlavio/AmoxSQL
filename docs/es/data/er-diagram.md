# Diagrama ER

**🌐 [English](../../en/data/er-diagram.md) · Español**

> Un mapa visual e interactivo de tu esquema: tablas, columnas, claves primarias y foráneas conectadas con líneas, con zoom, pan y generación de DDL en un clic.

<img src="../../../images/10_er_diagram.png" alt="Diagrama ER de AmoxSQL" width="100%" />

## Qué es

El diagrama ER (entidad-relación) dibuja las tablas de un schema como tarjetas, cada una con sus columnas, tipos y marcadores de clave primaria (PK) y foránea (FK). Las relaciones se trazan como curvas entre columnas, con una flecha que apunta a la tabla referenciada.

Es un lienzo interactivo: puedes hacer zoom, desplazarte (pan), reordenar tablas arrastrándolas y resaltar las relaciones de una tabla al pasar el mouse. Se genera automáticamente a partir de la estructura real de la base — no hay que dibujarlo a mano.

Está acotado a un schema. Se abre desde el [Explorador de base de datos](database-explorer.md), con un botón por schema.

## Cuándo usarlo

- Para entender de un vistazo cómo se relacionan las tablas de un schema.
- Para localizar claves primarias y foráneas y qué apunta a qué.
- Para obtener el DDL de una tabla a partir del diagrama.
- Si solo necesitas navegar tablas/columnas o insertar nombres, el [Explorador de base de datos](database-explorer.md) es más directo.

## Cómo usarlo

### Abrir el diagrama
1. En el [Explorador de base de datos](database-explorer.md), pulsa el botón de diagrama (icono de flujo): en la cabecera para bases de un schema, o en la fila de cada schema en bases multi-schema.
2. Las tablas se disponen automáticamente en una cuadrícula y las relaciones FK se dibujan entre ellas.

### Navegar el lienzo
- **Zoom:** rueda del mouse, o los botones **+** / **−** de la barra.
- **Pan:** arrastra sobre el fondo vacío.
- **Reordenar:** arrastra una tarjeta de tabla para moverla.
- **Reset:** el botón de encuadre restaura zoom, posición y disposición.
- **Resaltar relaciones:** pasa el mouse sobre una tabla para destacar sus conexiones y atenuar el resto.

### Generar DDL
1. Haz clic en una tabla para seleccionarla (aparece un panel con su resumen: columnas, PK, FK).
2. Usa **Copiar DDL** para copiar su `CREATE TABLE` (con NOT NULL, PRIMARY KEY y FOREIGN KEY) al portapapeles.
3. O **Abrir en el editor** para enviar el DDL a una nueva pestaña SQL.

## Referencia de opciones

### Barra de herramientas
| Control | Qué hace |
|---|---|
| Zoom + / − | Acerca o aleja el diagrama |
| Reset / Encuadrar | Restaura zoom, pan y auto-layout |
| Copiar DDL | Copia el `CREATE TABLE` de la tabla seleccionada |
| Abrir en el editor | Envía el DDL a una nueva pestaña SQL |
| Refrescar | Vuelve a leer el esquema del schema |
| Contador | Muestra nº de tablas · relaciones · % de zoom |

### Marcadores en las tarjetas
| Marcador | Significado |
|---|---|
| Llave | Clave primaria (PK) |
| Enlace | Clave foránea (FK) |
| Ojo | La entidad es una vista |
| Curva con flecha | Relación FK → tabla referenciada |

## Tips y gemas

- **Resaltado por hover:** posar el mouse sobre una tabla ilumina solo sus relaciones, útil en esquemas densos.
- **Auto-layout inteligente:** las tablas se colocan en cuadrícula según su tamaño; el reset recalcula posiciones.
- **DDL fiel:** el `CREATE TABLE` generado incluye nulabilidad, PK y las FK detectadas — sirve para documentar o migrar.
- **Un diagrama por schema:** en bases multi-schema abres el ER del schema que te interese desde su fila.

## Relacionado

- [Explorador de base de datos](database-explorer.md) · [Explorador de archivos](file-explorer.md)
- [Editor SQL](../editor/sql-editor.md) · [Importar datos](importing-data.md)
