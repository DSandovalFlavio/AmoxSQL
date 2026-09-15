/**
 * Ejercita `setFrontMatterKeys` — el escritor del front-matter de un deck.
 *
 *     node scripts/probarFrontMatterDeck.mjs
 *
 * Existe porque esta función **reescribe la cabecera del archivo del usuario**,
 * y un fallo aquí no se parece a un fallo: el deck sigue abriendo, sólo que sin
 * los comentarios que alguien puso, o con las claves en otro orden, o con una
 * `variables:` cuyas hijas quedaron huérfanas y ya no parsea. Eso no se ve
 * mirando la pantalla — se ve al abrir el archivo en otro sitio, tarde.
 *
 * Lo que garantiza, y que es todo el contrato:
 *   · lo que no se toca vuelve BYTE A BYTE, comentarios y orden incluidos;
 *   · una clave con bloque anidado se borra entera o no se borra;
 *   · el entrecomillado lo decide js-yaml, no nosotros.
 */
import { setFrontMatterKeys, parseDeckFrontMatter } from '../client/src/utils/deckParser.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

const FM = `---
title: Revisión de inversión en campañas
theme: dark
accent: amox-4
palette: sterlingDark
section: Inversión en campañas
# este comentario tiene que sobrevivir
author: Flavio Sandoval
period: Últimos 6 meses · feb–ago 2024
date: 14 ago 2024
variables:
  periodo: "6 meses"
  region: Este
---
`;

// ── lo que no se toca, no se toca ───────────────────────────────────────────
const soloAcento = setFrontMatterKeys(FM, { accent: 'amox-9' });
eq('el comentario sobrevive', soloAcento.includes('# este comentario tiene que sobrevivir'), true);
eq('el acento cambió', /accent: amox-9/.test(soloAcento), true);
eq('el orden se conserva',
    soloAcento.split('\n').filter(l => /^[a-z]+:/.test(l)).map(l => l.split(':')[0]),
    ['title', 'theme', 'accent', 'palette', 'section', 'author', 'period', 'date', 'variables']);
eq('el bloque anidado sigue entero', /variables:\n {2}periodo: "6 meses"\n {2}region: Este/.test(soloAcento), true);
eq('todo lo demás vuelve igual',
    soloAcento.replace(/accent: amox-9/, 'accent: amox-4'), FM);

// ── añadir una clave que no estaba ──────────────────────────────────────────
const conFuente = setFrontMatterKeys(FM, { source: 'Data/dataset.csv' });
eq('la clave nueva va al final', conFuente.trimEnd().split('\n').at(-2), 'source: Data/dataset.csv');
eq('y sigue parseando', parseDeckFrontMatter(conFuente).frontMatter.source, 'Data/dataset.csv');

// ── borrar ──────────────────────────────────────────────────────────────────
const sinAcento = setFrontMatterKeys(FM, { accent: null });
eq('la clave borrada desaparece', /accent:/.test(sinAcento), false);
eq('y no se lleva a las vecinas', /palette: sterlingDark/.test(sinAcento), true);

const sinVariables = setFrontMatterKeys(FM, { variables: null });
eq('borrar un bloque se lleva a sus hijas', /periodo|region: Este/.test(sinVariables), false);
eq('y lo que queda parsea', Object.keys(parseDeckFrontMatter(sinVariables).frontMatter).includes('variables'), false);

// ── el entrecomillado lo decide js-yaml ─────────────────────────────────────
const conDosPuntos = setFrontMatterKeys(FM, { title: 'Revisión: el semestre' });
eq('un título con dos puntos se entrecomilla', /title: 'Revisión: el semestre'/.test(conDosPuntos), true);
eq('y vuelve a parsear con su valor exacto',
    parseDeckFrontMatter(conDosPuntos).frontMatter.title, 'Revisión: el semestre');

// ── listas y false, que es lo que necesita el pie ───────────────────────────
const conPie = setFrontMatterKeys(FM, { footer: ['source', 'rows', 'number'] });
eq('la lista sale en línea', /footer: \[source, rows, number\]/.test(conPie), true);
eq('y parsea como array', parseDeckFrontMatter(conPie).frontMatter.footer, ['source', 'rows', 'number']);
eq('el pie apagado es false',
    /footer: false/.test(setFrontMatterKeys(FM, { footer: false })), true);
eq('y false NO es lo mismo que borrar',
    parseDeckFrontMatter(setFrontMatterKeys(FM, { footer: false })).frontMatter.footer, false);

// ── varias claves de una vez ────────────────────────────────────────────────
const varias = setFrontMatterKeys(FM, { accent: 'amox-2', author: 'Otra persona', tone: 'dark' });
const fmVarias = parseDeckFrontMatter(varias).frontMatter;
eq('las tres a la vez', [fmVarias.accent, fmVarias.author, fmVarias.tone], ['amox-2', 'Otra persona', 'dark']);
eq('sin duplicar claves', (varias.match(/^accent:/gm) || []).length, 1);

// ── casos de borde ──────────────────────────────────────────────────────────
eq('sin cambios devuelve lo mismo', setFrontMatterKeys(FM, {}), FM);
eq('un deck sin front-matter lo estrena',
    parseDeckFrontMatter(setFrontMatterKeys('', { title: 'Nuevo' })).frontMatter.title, 'Nuevo');
eq('borrar la última clave deja el bloque vacío',
    setFrontMatterKeys('---\ntitle: X\n---\n', { title: null }), '');

// CRLF, que es como llega un .amoxdeck guardado en Windows
const crlf = FM.replace(/\n/g, '\r\n');
const crlfTras = setFrontMatterKeys(crlf, { accent: 'amox-9' });
eq('CRLF entra y CRLF sale', /\r\n/.test(crlfTras) && !/[^\r]\n/.test(crlfTras), true);
eq('y el contenido es el correcto', parseDeckFrontMatter(crlfTras).frontMatter.accent, 'amox-9');

// ── ida y vuelta: escribir lo que ya había no cambia nada ───────────────────
const fm0 = parseDeckFrontMatter(FM).frontMatter;
eq('reescribir el mismo valor deja el archivo igual',
    setFrontMatterKeys(FM, { accent: fm0.accent }), FM);

console.log(`\n${ok} pasan, ${mal} fallan`);
process.exit(mal ? 1 : 0);
