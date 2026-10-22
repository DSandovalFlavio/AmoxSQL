/**
 * Un dbt FALSO para las pruebas, que el corredor lanza como a uno de verdad (5.12).
 *
 * Desde la 5.12 dbt se lanza sin shell (Dec-26) y el proyecto sólo puede apuntar a
 * entornos de verdad: un `dbt.cmd` en el PATH ya no sirve. Así que se arma una
 * carpeta de entorno de Python de mentira cuyo `Scripts/dbt.exe` (o `bin/dbt`) es una
 * copia de Node, y `NODE_OPTIONS=--require <falso.cjs>` le hace correr el script de
 * la prueba en vez de buscar un módulo llamado «run».
 *
 *   const { carpeta } = crearEntornoFalso(dir, `console.log('ARGS', JSON.stringify(args));`);
 *   // project.json → dbt.entorno = { tipo: 'python', ruta: carpeta }
 *
 * En el código de la prueba, `args` son los argumentos de dbt (['run', '--select', …]).
 * Pone `NODE_OPTIONS` en el proceso (lo heredan los hijos, entre ellos el dbt falso).
 */
const fs = require('fs');
const path = require('path');

function crearEntornoFalso(dir, codigo) {
    const carpeta = path.join(dir, 'entorno-dbt-falso');
    const bin = path.join(carpeta, process.platform === 'win32' ? 'Scripts' : 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const exe = path.join(bin, process.platform === 'win32' ? 'dbt.exe' : 'dbt');
    if (!fs.existsSync(exe)) { fs.copyFileSync(process.execPath, exe); fs.chmodSync(exe, 0o755); }
    const falso = path.join(carpeta, 'falso.cjs');
    fs.writeFileSync(falso, `
// Sólo cuando lo lanzan como dbt: NODE_OPTIONS también llega a otros Node hijos.
if (require('path').basename(process.execPath).toLowerCase().startsWith('dbt')) {
  const Module = require('module');
  const args = [require('path').basename(process.argv[1] || ''), ...process.argv.slice(2)];
  const original = Module._load;
  Module._load = function (pedido, padre, esPrincipal) { if (esPrincipal) return {}; return original.apply(this, arguments); };
  ${codigo}
}
`);
    const opcion = `--require ${/\s/.test(falso) ? `"${falso}"` : falso}`;
    if (!String(process.env.NODE_OPTIONS || '').includes(falso)) process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, opcion].filter(Boolean).join(' ');
    return { carpeta, exe, falso };
}

module.exports = { crearEntornoFalso };
