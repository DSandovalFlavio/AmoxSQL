/**
 * Pruebas de `client/src/utils/vistaDeCelda.js`.
 *
 * El comportamiento que describen se midió antes contra el motor, no se supuso:
 * citar siempre funciona, `COMMENT ON` se lee desde el catálogo, y una vista
 * temporal tapa a una tabla real del mismo nombre incluso escribiendo
 * `main.ventas`. Esto comprueba que lo que se manda es lo que se midió.
 *
 *   node scripts/probarVistaDeCelda.mjs
 */
import {
    citarIdentificador, citarTexto, problemaDeNombre, nombrePorOmision, componerCelda,
} from '../client/src/utils/vistaDeCelda.js';
import { analizarCelda } from '../client/src/utils/celdaSql.js';

let bien = 0;
let mal = 0;

function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

const componer = (sql, extra = {}) =>
    componerCelda({ sql, analisis: analizarCelda(sql), ...extra });

// ── citar ───────────────────────────────────────────────────────────────────
comprobar('identificador citado', citarIdentificador('paso_1'), '"paso_1"');
comprobar('identificador con comilla', citarIdentificador('a"b'), '"a""b"');
comprobar('texto citado', citarTexto("no vale d'nada"), "'no vale d''nada'");

// ── nombres ─────────────────────────────────────────────────────────────────
comprobar('un nombre normal vale', problemaDeNombre('ventas_limpias'), null);
comprobar('con espacios y acentos también', problemaDeNombre('Caída de ventas'), null);
comprobar('vacío no', problemaDeNombre('   '), 'Sin nombre');
comprobar('con comillas no', problemaDeNombre('a"b'), 'No puede llevar comillas dobles');
comprobar('con punto y coma no', problemaDeNombre('a;b'), 'No puede llevar saltos de línea ni punto y coma');
comprobar('empezando por número no', problemaDeNombre('1paso'), 'No puede empezar por un número');

comprobar('el primer nombre libre', nombrePorOmision([]), 'paso_1');
comprobar('salta los tomados', nombrePorOmision(['paso_1', 'paso_2']), 'paso_3');
comprobar('rellena el hueco que se liberó', nombrePorOmision(['paso_1', 'paso_3']), 'paso_2');
comprobar('no distingue mayúsculas', nombrePorOmision(['PASO_1']), 'paso_2');
comprobar('los nombres puestos a mano no estorban', nombrePorOmision(['ventas']), 'paso_1');

// ── el caso que justifica todo ──────────────────────────────────────────────
{
    const r = componer('-- Quito devoluciones\nSELECT * FROM ventas;', { nombre: 'ventas_limpias', descripcion: 'Quito devoluciones' });
    comprobar('deja una vista', r.deja, 'vista');
    comprobar('el nombre es el de la celda', r.vista, 'ventas_limpias');
    comprobar(
        'la preparación crea la vista y le pone la descripción',
        r.preparacion,
        'CREATE OR REPLACE TEMP VIEW "ventas_limpias" AS (\n-- Quito devoluciones\nSELECT * FROM ventas\n);\n'
        + 'COMMENT ON VIEW "ventas_limpias" IS \'Quito devoluciones\';',
    );
    comprobar('el lector empieza por SELECT, que es lo que el límite sabe recortar', r.lector.startsWith('SELECT'), true);
    comprobar('y lee la vista', r.lector, 'SELECT * FROM "ventas_limpias"');
}

// El salto de línea tras `AS (` no es estética: sin él, el paréntesis quedaría
// dentro del comentario de la primera línea.
{
    const r = componer('-- sólo un comentario arriba\nSELECT 1 AS a', { nombre: 'p' });
    comprobar('el paréntesis no se come el comentario', r.preparacion.includes('AS (\n--'), true);
}

comprobar(
    'sin descripción no se manda COMMENT ON',
    componer('SELECT 1', { nombre: 'p' }).preparacion,
    'CREATE OR REPLACE TEMP VIEW "p" AS (\nSELECT 1\n);',
);

// ── materializar ────────────────────────────────────────────────────────────
{
    const r = componer('SELECT 1', { nombre: 'p', descripcion: 'd', materializar: true });
    comprobar('materializar deja una tabla', r.deja, 'tabla');
    comprobar('y crea una TEMP TABLE', r.preparacion.includes('CREATE OR REPLACE TEMP TABLE "p"'), true);
    comprobar('con COMMENT ON TABLE, no ON VIEW', r.preparacion.includes('COMMENT ON TABLE "p"'), true);
}

// ── los tres bordes del plan ────────────────────────────────────────────────
{
    const r = componer('INSERT INTO ventas VALUES (1)', { nombre: 'p' });
    comprobar('lo que no se puede envolver no deja vista', r.deja, 'nada');
    comprobar('y se ejecuta tal cual', r.lector, 'INSERT INTO ventas VALUES (1)');
    comprobar('sin preparación ninguna', r.preparacion, '');
}
{
    const r = componer('SELECT 1; SELECT 2;', { nombre: 'p' });
    comprobar('varias sentencias tampoco dejan vista', r.deja, 'nada');
}
{
    const r = componer('CREATE OR REPLACE TEMP VIEW mia AS SELECT 1', { nombre: 'la_de_la_celda' });
    comprobar('si la escribió quien la usa, se respeta', r.deja, 'propia');
    comprobar('y manda SU nombre, no el de la celda', r.vista, 'mia');
    comprobar('el texto va intacto', r.preparacion, 'CREATE OR REPLACE TEMP VIEW mia AS SELECT 1');
    comprobar('y se leen sus filas', r.lector, 'SELECT * FROM "mia"');
}

// ── sin nombre no se inventa nada aquí ──────────────────────────────────────
comprobar('sin nombre, no deja vista', componer('SELECT 1').deja, 'nada');
comprobar('con un nombre imposible, tampoco', componer('SELECT 1', { nombre: '1x' }).deja, 'nada');

// ── bordes ──────────────────────────────────────────────────────────────────
comprobar('celda vacía', componer('   ').deja, 'nada');
comprobar('celda vacía no revienta', componer('').lector, '');
comprobar(
    'el punto y coma final se quita para poder envolver',
    componer('SELECT 1;  ', { nombre: 'p' }).preparacion.includes('SELECT 1\n)'),
    true,
);
comprobar(
    'y varios puntos y coma también',
    componer('SELECT 1;;', { nombre: 'p' }).preparacion.includes('SELECT 1\n)'),
    true,
);
comprobar(
    'un nombre con espacios se cita y funciona',
    componer('SELECT 1', { nombre: 'Ventas Netas' }).lector,
    'SELECT * FROM "Ventas Netas"',
);
comprobar(
    'una descripción con apóstrofo no rompe el literal',
    componer('SELECT 1', { nombre: 'p', descripcion: "d'a" }).preparacion.includes("IS 'd''a'"),
    true,
);

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
