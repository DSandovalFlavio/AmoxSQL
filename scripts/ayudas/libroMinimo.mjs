/**
 * Un libro de Excel mínimo, escrito celda a celda (pruebas de la 5.13).
 *
 * El escritor de AmoxSQL da a cada columna un solo tipo; los Excel de verdad
 * mezclan: un «N/A» entre números, la primera celda vacía, fechas escritas como
 * texto. Este los escribe tal cual. Números, texto, `Date` (como fecha de Excel,
 * con su formato) y null (celda vacía).
 *
 *     libro(ruta, ['Folio', 'Importe'], [[1, 10.5], [2, 'N/A']])
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const { EscritorZip } = require(path.join(RAIZ, 'server/zip.js'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letra = (i) => String.fromCharCode(65 + i);
const serie = (d) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000);
function celda(v, ref) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date) return `<c r="${ref}" s="1"><v>${serie(v)}</v></c>`;
    if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
}
/**
 * `opciones.otrasHojas`: [{ nombre, celdas: [{ ref: 'B2', v, s }] }] — hojas sueltas,
 * celda a celda (`s: 1` es el estilo de fecha). `opciones.nombres`: { nombre: 'Hoja!$B$2' }
 * — nombres definidos (para probar una plantilla con `datos_al`).
 */
export function libro(ruta, encabezado, filas, { otrasHojas = [], nombres = {} } = {}) {
    const xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
    [encabezado, ...filas].forEach((f, i) => {
        xml.push(`<row r="${i + 1}">${f.map((v, j) => celda(v, `${letra(j)}${i + 1}`)).join('')}</row>`);
    });
    xml.push('</sheetData></worksheet>');
    const hojas = [{ nombre: 'Ventas', xml: xml.join('') }];
    for (const h of otrasHojas) {
        const porFila = new Map();
        for (const c of h.celdas || []) {
            const r = Number(/\d+/.exec(c.ref)[0]);
            if (!porFila.has(r)) porFila.set(r, []);
            const v = c.v === null || c.v === undefined ? '' : typeof c.v === 'number' ? `<v>${c.v}</v>` : `<is><t>${esc(c.v)}</t></is>`;
            porFila.get(r).push(`<c r="${c.ref}"${c.s ? ` s="${c.s}"` : ''}${typeof c.v === 'string' ? ' t="inlineStr"' : ''}>${v}</c>`);
        }
        const filasXml = [...porFila.keys()].sort((a, b) => a - b).map(r => `<row r="${r}">${porFila.get(r).join('')}</row>`).join('');
        hojas.push({ nombre: h.nombre, xml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filasXml}</sheetData></worksheet>` });
    }
    const definidos = Object.entries(nombres).map(([n, ref]) => `<definedName name="${esc(n)}">${esc(ref)}</definedName>`).join('');
    const z = new EscritorZip(ruta);
    z.agregar('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
    z.agregar('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    z.agregar('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' + (definidos ? `<definedNames>${definidos}</definedNames>` : '') + '</workbook>');
    z.agregar('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.agregar('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>');
    hojas.forEach((h, i) => z.agregar(`xl/worksheets/sheet${i + 1}.xml`, h.xml));
    z.cerrar();
    return ruta;
}
