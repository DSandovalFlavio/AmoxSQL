/**
 * Reescribe las tablas de `docs/{es,en}/reference/keyboard-shortcuts.md` desde la
 * tabla de atajos (`client/src/utils/atajos.js`). La prosa de alrededor no se toca.
 *
 *     node scripts/atajosADocs.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { seccionesDeAtajos } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/atajos.js')).href);

const TEXTOS = {
    es: { General: 'General', Files: 'Archivos', Queries: 'Consultas', Tabs: 'Pestañas', Panels: 'Paneles', Editor: 'Editor', View: 'Vista', atajo: 'Atajo', accion: 'Acción', fin: '## Tips y gemas' },
    en: { General: 'General', Files: 'Files', Queries: 'Queries', Tabs: 'Tabs', Panels: 'Panels', Editor: 'Editor', View: 'View', atajo: 'Shortcut', accion: 'Action', fin: '## Tips & gems' },
};

for (const idioma of ['es', 'en']) {
    const ruta = path.join(RAIZ, 'docs', idioma, 'reference', 'keyboard-shortcuts.md');
    const texto = fs.readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
    const t = TEXTOS[idioma];
    const inicio = texto.indexOf(`## ${t.General}`);
    const fin = texto.indexOf(t.fin);
    if (inicio < 0 || fin < 0) throw new Error(`No encuentro las secciones de ${ruta}`);
    const tablas = seccionesDeAtajos(idioma).map(s => [
        `## ${t[s.category]}`, '',
        `| ${t.atajo} | ${t.accion} |`, '|---|---|',
        ...s.items.map(i => `| ${i.keys.replace('\\', '\\\\')} | ${i.description} |`), '',
    ].join('\n')).join('\n');
    fs.writeFileSync(ruta, `${texto.slice(0, inicio)}${tablas}\n${texto.slice(fin)}`);
    console.log('ok', path.relative(RAIZ, ruta));
}
