# Exporting data

**🌐 English · [Español](../../es/data/exporting-data.md)**

> Send your results to a file or the cloud: CSV, Parquet, and real Excel locally; CSV, JSON, and Parquet to S3 or GCS.

<!-- 📷 CAPTURE: docs/images/data/export-modal.png — "Export Data" dialog with the Local/Cloud selector, the CSV/Parquet/Excel formats, and the filename field -->

## What it is

Exporting takes a query (or the visible results) and writes a file. Under the hood it uses DuckDB's native `COPY TO`, so it's fast even with many rows and doesn't go through the browser.

There are two destinations: **local** (a file in your workspace) and **cloud** (an object in S3 or GCS via the `httpfs` extension). The available format depends on the destination.

One important nuance: export is **tied to the query**, not to what's on screen. See "Where export lives" below and [Saving results](../results/saving-results.md).

## When to use it

- To deliver a dataset (CSV to share, Parquet for analytics, Excel for business).
- To publish results to a cloud bucket.
- If you only want the rows visible in the table (quick copy/CSV/JSON, in memory), use **Download** in the results table — see [Saving results](../results/saving-results.md).

## How to use it

### Export locally
1. Open the **Export Data** dialog (editor **Export** button, or **Export results…** on a `.sql` in the explorer).
2. Choose the **Local** destination.
3. Pick the **format**: CSV, Parquet, or **Excel (.xlsx)**.
4. Type the **filename**. It's saved in your workspace folder.
5. Click **Export**. You'll see the path and row count when it finishes.

### Export to the cloud
1. In the dialog, choose the **Cloud** destination.
2. Select the provider: **Amazon S3** or **Google Cloud Storage (GCS)**.
3. Type the **destination URI** (e.g. `s3://my-bucket/path/data.parquet`).
4. Pick the format (CSV, JSON, or Parquet — **no** Excel in the cloud).
5. Click **Export**. Requires configured credentials (see below).

### Where export lives
- **Editor → Export:** exports the full result of the **current editor query**, re-running it.
- **Results table → Download:** downloads only the **rows already loaded** in the table (in memory, instant).
- **File explorer → Export results… (on a `.sql`):** reads the file's query and opens this same dialog.

## Reference

### Formats by destination
| Format | Local | Cloud | Notes |
|---|---|---|---|
| CSV | Yes | Yes | With header |
| Parquet | Yes | Yes | Columnar, ideal for analytics |
| Excel (.xlsx) | Yes | **No** | Real `.xlsx` via the `excel` extension |
| JSON | — | Yes | Cloud export only |

### Dialog fields
| Field | What it does |
|---|---|
| Destination | Local (file in the workspace) · Cloud (S3 / GCS) |
| Provider (cloud) | Amazon S3 · Google Cloud Storage |
| Format | CSV · Parquet · Excel (local) / CSV · JSON · Parquet (cloud) |
| Filename (local) | File base; the extension is added for you |
| Destination URI (cloud) | Full `s3://…` or `gs://…` path |

## Tips & gems

- **Excel limit:** one `.xlsx` sheet holds at most 1,048,576 rows. If your result exceeds it, you'll get a clear error asking you to use CSV or Parquet.
- **Real Excel:** the `.xlsx` is written with DuckDB's `excel` extension, so it opens correctly in spreadsheets (it's not a CSV in disguise).
- **No cloud Excel:** cloud export validates the format and rejects `.xlsx` on purpose.
- **Credentials in Settings:** set your S3/GCS keys in **Settings → Store Integrations** before exporting to the cloud.

## Related

- [Saving results](../results/saving-results.md) · [Importing data](importing-data.md) · [DuckDB extensions](duckdb-extensions.md)
- [SQL editor](../editor/sql-editor.md) · [Configuration](../reference/configuration.md)
