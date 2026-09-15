/**
 * Ejercita `utils/tiposDeArchivo.js` — qué es cada archivo.
 *
 *     node scripts/probarTiposDeArchivo.mjs
 *
 * Esta tabla decide tres cosas a la vez: qué editor se monta, cómo se colorea y
 * **si Ctrl+Enter intenta ejecutarlo**. La tercera es la que no puede fallar:
 * el fallo que originó todo este trabajo era exactamente ése — un archivo que
 * no era SQL con un botón de ejecutar encima.
 *
 * Los casos que se vigilan no son los bonitos. Son: sin extensión, sólo punto,
 * doble extensión, mayúsculas, rutas de Windows, y el descarte.
 */
import {
    tipoDeArchivo, tipoDePestana, extensionDe, nombreDe,
    esEjecutable, esBinario, idiomaDe, POR_DEFECTO, POR_EXTENSION,
} from '../client/src/utils/tiposDeArchivo.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

// ── el nombre, salga la ruta como salga ─────────────────────────────────────
eq('ruta con barras', nombreDe('a/b/c.sql'), 'c.sql');
eq('ruta de Windows', nombreDe('C:\\datos\\ventas.csv'), 'ventas.csv');
eq('ruta mezclada', nombreDe('proyecto/sub\\hoja.yml'), 'hoja.yml');
eq('sin ruta', nombreDe('suelto.txt'), 'suelto.txt');
eq('vacío', nombreDe(''), '');
eq('nulo no revienta', nombreDe(null), '');

// ── la extensión ────────────────────────────────────────────────────────────
eq('normal', extensionDe('consulta.sql'), 'sql');
eq('en mayúsculas se normaliza', extensionDe('VENTAS.CSV'), 'csv');
eq('sin extensión', extensionDe('Dockerfile'), '');
// La última, no la primera: un .csv.gz está comprimido y NO es un csv.
eq('doble extensión se queda con la última', extensionDe('ventas.csv.gz'), 'gz');
eq('varios puntos', extensionDe('informe.2026.final.md'), 'md');
// Un nombre que empieza por punto y no tiene más puntos no tiene extensión:
// ese punto es parte del nombre.
eq('archivo oculto sin extensión', extensionDe('.gitignore'), '');
eq('oculto CON extensión', extensionDe('.eslintrc.json'), 'json');
eq('termina en punto', extensionDe('raro.'), '');
eq('sólo un punto', extensionDe('.'), '');

// ── los nuestros ────────────────────────────────────────────────────────────
eq('sql', tipoDeArchivo('q.sql').tipo, 'sql');
eq('notebook', tipoDeArchivo('a.sqlnb').tipo, 'sqlnb');
eq('markdown', tipoDeArchivo('notas.md').tipo, 'md');
eq('deck', tipoDeArchivo('informe.amoxdeck').tipo, 'amoxdeck');
eq('diagrama', tipoDeArchivo('arq.amoxdiagram').tipo, 'amoxdiagram');
eq('gráfico', tipoDeArchivo('v.amoxvis').tipo, 'amoxvis');
// El .amoxdiagram es el que faltaba en la cadena de LayoutManager y llegaba
// marcado como SQL: que esté aquí es media razón de existir de este módulo.
eq('un diagrama NO es sql', tipoDeArchivo('arq.amoxdiagram').tipo === 'sql', false);

// ── lo ejecutable, que es lo que no puede fallar ────────────────────────────
eq('sql se ejecuta', esEjecutable('q.sql'), true);
eq('un notebook se ejecuta', esEjecutable('a.sqlnb'), true);
eq('una chain se ejecuta', esEjecutable('c.sqlchain'), true);
eq('un markdown NO', esEjecutable('notas.md'), false);
eq('un yaml NO', esEjecutable('profiles.yml'), false);
eq('un python NO', esEjecutable('carga.py'), false);
eq('un json NO', esEjecutable('config.json'), false);
eq('un csv NO', esEjecutable('ventas.csv'), false);
eq('un desconocido NO', esEjecutable('cosa.qwerty'), false);
eq('uno sin nombre NO', esEjecutable(''), false);
// Barrido: en toda la tabla, lo único ejecutable son sql, sqlnb y sqlchain.
eq('sólo tres extensiones son ejecutables',
    Object.entries(POR_EXTENSION).filter(([, v]) => v.ejecutable).map(([k]) => k).sort(),
    ['sql', 'sqlchain', 'sqlnb']);

// ── el idioma ───────────────────────────────────────────────────────────────
eq('yaml se colorea como yaml', idiomaDe('profiles.yml'), 'yaml');
eq('y su hermano largo también', idiomaDe('docker-compose.yaml'), 'yaml');
eq('python', idiomaDe('carga.py'), 'python');
eq('json', idiomaDe('config.json'), 'json');
eq('toml va por ini', idiomaDe('pyproject.toml'), 'ini');
eq('markdown', idiomaDe('notas.md'), 'markdown');
// El fallo original: todo lo desconocido se coloreaba como SQL.
eq('lo desconocido es texto llano, NO sql', idiomaDe('cosa.qwerty'), 'plaintext');
eq('un yaml no se colorea como sql', idiomaDe('profiles.yml') === 'sql', false);
// Un binario no tiene idioma, pero quien pregunte recibe algo usable.
eq('un binario cae en texto llano', idiomaDe('logo.png'), 'plaintext');

// ── por nombre entero ───────────────────────────────────────────────────────
eq('Dockerfile', tipoDeArchivo('Dockerfile').idioma, 'dockerfile');
eq('en minúsculas también', tipoDeArchivo('dockerfile').idioma, 'dockerfile');
eq('con ruta delante', tipoDeArchivo('infra/Dockerfile').idioma, 'dockerfile');
eq('Makefile', tipoDeArchivo('Makefile').idioma, 'makefile');
eq('.env', tipoDeArchivo('.env').idioma, 'ini');
eq('.gitignore es texto', tipoDeArchivo('.gitignore').tipo, 'texto');

// ── datos y binarios ────────────────────────────────────────────────────────
eq('csv son datos', tipoDeArchivo('ventas.csv').tipo, 'datos');
eq('parquet son datos', tipoDeArchivo('t.parquet').tipo, 'datos');
eq('excel son datos', tipoDeArchivo('libro.xlsx').tipo, 'datos');
// Un json es datos POR DEFECTO — no siempre, y de eso se encarga la interfaz.
eq('json es datos por defecto', tipoDeArchivo('config.json').tipo, 'datos');
eq('una imagen es binario', esBinario('logo.png'), true);
eq('un pdf es binario', esBinario('informe.pdf'), true);
eq('una base de datos es binario', esBinario('almacen.duckdb'), true);
eq('un csv NO es binario', esBinario('ventas.csv'), false);
eq('un txt NO es binario', esBinario('notas.txt'), false);

// ── el descarte ─────────────────────────────────────────────────────────────
eq('extensión inventada', tipoDeArchivo('cosa.qwerty'), POR_DEFECTO);
eq('sin extensión ni nombre conocido', tipoDeArchivo('LICENSE'), POR_DEFECTO);
eq('ruta vacía', tipoDeArchivo(''), POR_DEFECTO);
eq('nulo', tipoDeArchivo(null), POR_DEFECTO);
eq('el descarte es texto', POR_DEFECTO.tipo, 'texto');
eq('y no se ejecuta', POR_DEFECTO.ejecutable, false);

// ── el tipo de la pestaña ───────────────────────────────────────────────────
// `datos` y `binario` describen el archivo, no un editor: si se abren, se abren
// en el llano.
eq('un sql abre el editor de sql', tipoDePestana('q.sql'), 'sql');
eq('un md abre el de markdown', tipoDePestana('n.md'), 'md');
eq('un csv abierto va al llano', tipoDePestana('ventas.csv'), 'texto');
eq('un json abierto va al llano', tipoDePestana('config.json'), 'texto');
eq('un png abierto va al llano', tipoDePestana('logo.png'), 'texto');
eq('lo desconocido va al llano', tipoDePestana('cosa.qwerty'), 'texto');
eq('ninguna pestaña es de tipo datos', tipoDePestana('x.parquet') === 'datos', false);

// ── coherencia de la tabla entera ───────────────────────────────────────────
// Cada entrada tiene los tres campos, y ninguno se quedó a medias al escribirla.
const TIPOS = ['sql', 'sqlnb', 'sqlchain', 'md', 'amoxdeck', 'amoxdiagram', 'amoxvis', 'datos', 'texto', 'binario'];
const malas = Object.entries(POR_EXTENSION).filter(([, v]) =>
    !TIPOS.includes(v.tipo) || typeof v.ejecutable !== 'boolean' || v.idioma === undefined);
eq('todas las entradas están completas', malas.map(([k]) => k), []);
const binariosConIdioma = Object.entries(POR_EXTENSION).filter(([, v]) => v.tipo === 'binario' && v.idioma !== null);
eq('ningún binario dice tener idioma', binariosConIdioma.map(([k]) => k), []);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
