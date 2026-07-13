# Exportar datos

**🌐 [English](../../en/data/exporting-data.md) · Español**

> Lleva tus resultados a archivo o a la nube: CSV, Parquet y Excel real en local; CSV, JSON y Parquet a S3 o GCS.

<!-- 📷 CAPTURE: docs/images/data/export-modal.png — Diálogo "Exportar datos" con el selector Local/Nube, los formatos CSV/Parquet/Excel y el campo de nombre de archivo -->

## Qué es

Exportar toma una query (o los resultados a la vista) y escribe un archivo. Por debajo usa el `COPY TO` nativo de DuckDB, así que es rápido incluso con muchas filas y no pasa por el navegador.

Hay dos destinos: **local** (un archivo en tu workspace) y **nube** (un objeto en S3 o GCS vía la extensión `httpfs`). El formato disponible depende del destino.

Un matiz importante: el export está **ligado a la query**, no a lo que ves en pantalla. Ver "Dónde vive el export" más abajo y [Guardar resultados](../results/saving-results.md).

## Cuándo usarlo

- Para entregar un dataset (CSV para compartir, Parquet para analítica, Excel para negocio).
- Para publicar resultados a un bucket en la nube.
- Si solo quieres las filas que ves en la tabla (copiar/CSV/JSON rápido, en memoria), usa **Download** de la tabla de resultados — ver [Guardar resultados](../results/saving-results.md).

## Cómo usarlo

### Exportar en local
1. Abre el diálogo **Exportar datos** (botón **Export** del editor, o **Exportar resultados…** sobre un `.sql` en el explorador).
2. Elige destino **Local**.
3. Elige el **formato**: CSV, Parquet o **Excel (.xlsx)**.
4. Escribe el **nombre de archivo**. Se guarda en la carpeta de tu workspace.
5. Pulsa **Exportar**. Verás la ruta y el número de filas al terminar.

### Exportar a la nube
1. En el diálogo, elige destino **Nube**.
2. Selecciona el proveedor: **Amazon S3** o **Google Cloud Storage (GCS)**.
3. Escribe la **URI de destino** (por ejemplo `s3://mi-bucket/ruta/datos.parquet`).
4. Elige el formato (CSV, JSON o Parquet — **no** hay Excel en la nube).
5. Pulsa **Exportar**. Requiere credenciales configuradas (ver abajo).

### Dónde vive el export
- **Editor → Export:** exporta el resultado completo de la **query actual del editor**, re-ejecutándola.
- **Tabla de resultados → Download:** descarga solo las **filas ya cargadas** en la tabla (en memoria, instantáneo).
- **Explorador de archivos → Exportar resultados… (sobre un `.sql`):** lee la query del archivo y abre este mismo diálogo.

## Referencia de opciones

### Formatos por destino
| Formato | Local | Nube | Notas |
|---|---|---|---|
| CSV | Sí | Sí | Con cabecera |
| Parquet | Sí | Sí | Columnar, ideal para analítica |
| Excel (.xlsx) | Sí | **No** | `.xlsx` real vía la extensión `excel` |
| JSON | — | Sí | Solo en export a la nube |

### Campos del diálogo
| Campo | Qué hace |
|---|---|
| Destino | Local (archivo en el workspace) · Nube (S3 / GCS) |
| Proveedor (nube) | Amazon S3 · Google Cloud Storage |
| Formato | CSV · Parquet · Excel (local) / CSV · JSON · Parquet (nube) |
| Nombre de archivo (local) | Base del archivo; la extensión se añade sola |
| URI de destino (nube) | Ruta completa `s3://…` o `gs://…` |

## Tips y gemas

- **Límite de Excel:** una hoja `.xlsx` admite como máximo 1 048 576 filas. Si tu resultado la supera, verás un error claro pidiendo usar CSV o Parquet.
- **Excel de verdad:** el `.xlsx` se escribe con la extensión `excel` de DuckDB, así que abre correctamente en hojas de cálculo (no es un CSV disfrazado).
- **Nube sin Excel:** el export a la nube valida el formato y rechaza `.xlsx` a propósito.
- **Credenciales en Ajustes:** configura las claves de S3/GCS en **Ajustes → Store Integrations** antes de exportar a la nube.

## Relacionado

- [Guardar resultados](../results/saving-results.md) · [Importar datos](importing-data.md) · [Extensiones de DuckDB](duckdb-extensions.md)
- [Editor SQL](../editor/sql-editor.md) · [Configuración](../reference/configuration.md)
