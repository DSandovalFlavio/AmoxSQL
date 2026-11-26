// @suite rapida: no carga el motor; corre en cada PR (pnpm test:rapidas).
/**
 * Enlaces a archivos dentro de un documento Markdown (6.0.2).
 *
 * Al pasar el ratón por un enlace a un `.sql` que no se encontraba, la vista
 * previa guardaba `{ error }` y lo pintaba como texto: la ventana entera caía
 * (React #31). No se encontraba porque el enlace se buscaba desde la raíz del
 * proyecto, no desde la carpeta del documento. Aquí: dónde se busca
 * (`rutasDeEnlace`), y que la vista previa del `.sql` sólo pinte texto.
 *
 *   node scripts/probarEnlacesMarkdown.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rutasDeEnlace } from '../client/src/components/markdown/markdownUtils.js';

let bien = 0;
let mal = 0;
function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

comprobar('relativo: primero la carpeta del documento, luego la raíz',
    rutasDeEnlace('consultas/ventas.sql', 'docs'), ['docs/consultas/ventas.sql', 'consultas/ventas.sql']);
comprobar('./ es la carpeta del documento',
    rutasDeEnlace('./ventas.sql', 'docs/cierre'), ['docs/cierre/ventas.sql', 'ventas.sql']);
comprobar('.. sube desde la carpeta del documento',
    rutasDeEnlace('../queries/x.sql', 'docs/cierre'), ['docs/queries/x.sql']);
comprobar('un .. que sale del proyecto no es una ruta',
    rutasDeEnlace('../../fuera.sql', 'docs'), []);
comprobar('/ es la raíz y sólo la raíz',
    rutasDeEnlace('/queries/x.sql', 'docs'), ['queries/x.sql']);
comprobar('un documento en la raíz: una sola ruta',
    rutasDeEnlace('queries/x.sql', ''), ['queries/x.sql']);
comprobar('el ancla no forma parte del archivo',
    rutasDeEnlace('notas.md#tareas', 'docs'), ['docs/notas.md', 'notas.md']);
comprobar('las barras de Windows también',
    rutasDeEnlace('consultas\\x.sql', 'docs\\cierre'), ['docs/cierre/consultas/x.sql', 'consultas/x.sql']);
comprobar('nada que buscar', rutasDeEnlace('', 'docs'), []);

// La vista previa de un .sql sólo pinta su contenido si es texto: el error
// (un objeto) va por la rama que lee `.error`.
{
    const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const fuente = fs.readFileSync(path.join(raiz, 'client/src/components/markdown/MarkdownPreview.jsx'), 'utf8');
    comprobar('la rama del .sql exige texto',
        /isSql && typeof previewContent === 'string' \?/.test(fuente), true);
    comprobar('el enlace se busca con la carpeta del documento',
        /<FileLink \{\.\.\.p\} onOpenFile=\{onOpenFile\} baseDir=\{baseDir\} \/>/.test(fuente), true);
}

console.log(`${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
