// @suite rapida
/**
 * Los acentos (6.0, M9 · D2; auditoría de color 2026-11, docs/dev/auditoria_color_2026-11.md).
 *
 *   - cada acento del selector (accents.js) tiene su clase en oscuro y en claro;
 *   - cada id retirado se traduce (theme.js → migrateAccent) a uno que existe, y
 *     uno vigente se queda como está;
 *   - sin nada guardado el acento es el del tema (`tema`, sin clase), y un `cyan`
 *     guardado antes de la auditoría se lee una vez como `tema`;
 *   - cada uno de los diez temas trae su acento;
 *   - ninguna pareja de acentos se parece: ΔE (OKLab ×100) ≥ 8 en oscuro y ≥ 5
 *     en claro, donde la banda de luz es estrecha.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { CSS, THEME_SELECTORS, ACCENT_DEFAULT, themes } = require('./lib/themeTokens.cjs');
const { VIBRANT_ACCENTS, SOBER_ACCENTS, ACCENTS } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'accents.js')).href);

// theme.js lee localStorage: uno de mentira, en memoria.
const almacen = new Map();
globalThis.localStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
};
const { migrateAccent, acentoGuardado, guardarAcento, ACENTO_DEL_TEMA } = await import(pathToFileURL(path.join(RAIZ, 'client', 'src', 'theme.js')).href);

let ok = 0, mal = 0;
const bien = (n, c, x) => { if (c) { ok++; console.log('  ok ', n); } else { mal++; console.log('  MAL', n, x === undefined ? '' : JSON.stringify(x)); } };

console.log('— cada acento tiene su clase');
const reOscuro = (id) => new RegExp(String.raw`(^|\n)\.accent-${id}\s*\{([^}]*)\}`);
const reClaro = (id) => new RegExp(String.raw`\.mode-light\.accent-${id}\s*\{([^}]*)\}`);
bien('en oscuro', ACCENTS.every(a => reOscuro(a.id).test(CSS)), ACCENTS.filter(a => !reOscuro(a.id).test(CSS)).map(a => a.id));
bien('en claro', ACCENTS.every(a => reClaro(a.id).test(CSS)), ACCENTS.filter(a => !reClaro(a.id).test(CSS)).map(a => a.id));
bien('diez vivos y seis sobrios', VIBRANT_ACCENTS.length === 10 && SOBER_ACCENTS.length === 6);
bien('«tema» no es un color de la lista', !ACCENTS.some(a => a.id === ACENTO_DEL_TEMA));

console.log('— los ids retirados');
const viejos = ['amox-2', 'amox-3', 'amox-4', 'amox-5', 'amox-6', 'amox-7', 'amox-8', 'amox-9', 'amox-10', 'linear', 'islands', 'rose', 'lavender', 'amber', 'copper'];
const ids = new Set(ACCENTS.map(a => a.id));
const sinDestino = viejos.filter(v => !ids.has(migrateAccent(v)));
bien('cada id viejo va a uno que existe', !sinDestino.length, sinDestino);
bien('un id vigente no cambia', ACCENTS.every(a => migrateAccent(a.id) === a.id));
const conClaseVieja = viejos.filter(v => new RegExp(String.raw`\.accent-${v}\s*\{`).test(CSS));
bien('las clases viejas ya no están en el CSS', !conClaseVieja.length, conClaseVieja);

console.log('— el acento guardado');
bien('sin nada guardado, el del tema', migrateAccent(null) === ACENTO_DEL_TEMA && acentoGuardado() === ACENTO_DEL_TEMA);
almacen.set('amoxsql-accent', 'cyan');
bien('un cyan de antes se lee como el del tema', acentoGuardado() === ACENTO_DEL_TEMA);
guardarAcento('cyan');
bien('un cyan guardado ahora es el cian', acentoGuardado() === 'cyan');
almacen.set('amoxsql-accent', 'lavender');
bien('un retirado guardado se traduce', acentoGuardado() === 'mauve');

console.log('— cada tema trae su acento');
// Mist lo declara en su propio bloque: un acento elegido le gana igual (0-2-0).
const sinAcento = Object.keys(THEME_SELECTORS).filter(t => !ACCENT_DEFAULT[t] && !themes[t]['--accent-primary']);
bien('los diez', !sinAcento.length, sinAcento);

console.log('— ninguna pareja se parece');
// OKLCH → OKLab: la distancia euclídea en OKLab es la ΔE perceptual.
const lab = ([L, C, h]) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
const dE = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100; };
const num = (cuerpo, k) => { const m = cuerpo.match(new RegExp(String.raw`${k}:\s*([\d.]+)`)); return m ? +m[1] : null; };
const enOscuro = (id) => { const c = CSS.match(reOscuro(id))[2]; return [num(c, '--acc-l'), num(c, '--acc-c'), num(c, '--acc-h')]; };
const enClaro = (id) => { const m = CSS.match(reClaro(id))[1].match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/); return [+m[1], +m[2], +m[3]]; };
const masCercana = (leer) => {
    let peor = { d: Infinity };
    for (let i = 0; i < ACCENTS.length; i++) for (let j = i + 1; j < ACCENTS.length; j++) {
        const d = dE(leer(ACCENTS[i].id), leer(ACCENTS[j].id));
        if (d < peor.d) peor = { d: +d.toFixed(1), par: `${ACCENTS[i].id}/${ACCENTS[j].id}` };
    }
    return peor;
};
const po = masCercana(enOscuro), pc = masCercana(enClaro);
bien('en oscuro, ninguna a menos de ΔE 8', po.d >= 8, po);
bien('en claro, ninguna a menos de ΔE 5', pc.d >= 5, pc);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
