# Excel output

**🌐 English · [Español](../../es/data-flow/excel-output.md)**

> The **Excel** node leaves the result the way the client expects it: a formatted workbook with one sheet per step, or the client's own template with this month's data in it.

<!-- 📷 CAPTURE: docs/images/data-flow/excel-node.png — the Excel node's settings with "A new workbook", three sheets and a column format -->

## What it is

A Data Flow node that writes an `.xlsx`. It has two modes:

- **A new workbook.** Each connected node becomes a sheet. Each column takes its format from its type, so you don't format anything by hand:
  - dates are real Excel dates;
  - a `DECIMAL(18,2)` shows two decimals;
  - whole numbers have no thousands separator, so years and codes stay as they are;
  - an identifier too long for Excel to keep exactly goes in as text.

  Headers are bold, stay visible while scrolling, and have a filter. Each column is as wide as its content.
- **Fill a template.** The client already has a workbook with formulas, charts and formatting. AmoxSQL copies it and writes only the data cells you point it to. Everything else is left exactly as it was: other sheets, images, styles, and macros in an `.xlsm`.

## When to use it

- Monthly close: *Summary*, *Detail* and *Notes* in one workbook.
- The client's report already exists and only needs this period's numbers.
- Someone works in Excel and needs the result ready to use, without reformatting it.

## How to use it

1. Add the **Excel** node (*Output* group) and connect the nodes whose results go into the workbook.
2. Choose **What to write**.
3. **A new workbook:**
   - Set the order and the name of the sheets. A sheet you don't name takes the name of its node.
   - If a column needs a particular look, open **Column formats** and force it: currency, percent, whole number, two decimals, date or text.
4. **Fill a template:** choose the template (`.xlsx`, `.xlsm`, `.xltx`). For each connected node, say where it goes:
   - **A table of the template** (recommended). Its columns are matched by name, or by position if the names differ. The table grows or shrinks to the new rows. Its calculated columns are filled with their formula, and its totals row moves down with it.
   - **A sheet, from a cell** (`B5`). Last time's data is cleared. A column next to the data that has a formula in every row is filled down to the last new row. Optionally, the column names are written first.
5. **Save as:** where the workbook is left. `${parameters}` work in the name: `outputs/close_${month}.xlsx`.

## What follows the data in a template

When the data grows or shrinks, anything that pointed at last time's rows points at the new ones:

- chart ranges;
- defined names;
- conditional formatting;
- data validation;
- the source of a pivot table, which also refreshes when the workbook opens.

The workbook recalculates when it is opened, so formulas show this run's numbers.

## Options

| Option | What it does |
|---|---|
| What to write | A new workbook, or fill a template |
| Sheets | Order, name, and forced formats per column |
| Template | The client's workbook to fill |
| Goes into | A table of the template, or a sheet and its first cell |
| Write the column names first | Only from a cell: writes the headers at that cell and the data below |
| Save as | The workbook's path; parameters allowed |

## Tips & gems

- **A table is the safest target:** it grows and shrinks, and charts and formulas that use it follow it.
- **It never writes over what isn't its own:** if the data would reach something below it (a footer), the run stops and says which cell. The previous file is left as it was.
- **Nobody reads half a file:** the workbook is written aside and swapped in at the end. If someone has it open in Excel, AmoxSQL waits a few seconds and then says who has it.
- **Excel's limit:** a sheet holds at most 1,048,575 rows plus the header. Above that, the run stops with a clear error before writing anything.
- **No extension needed:** AmoxSQL writes the workbook itself. **Export File** in Excel format and the editor's **Export** button use the same writer.

## Related

- [Node reference](node-reference.md)
- [Exporting data](../data/exporting-data.md)
- [Publishing a file](../data/sources.md)
