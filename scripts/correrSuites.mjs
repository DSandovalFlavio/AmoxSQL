/**
 * Todas las pruebas con un comando (6.0, M6).
 *
 *     pnpm test                      todas las suites scripts/probar*.mjs
 *     pnpm test:rapidas              sólo las marcadas «@suite rapida» (sin motor, segundos)
 *     pnpm test -- --solo dbt        las que contienen «dbt» en el nombre (sin distinguir mayúsculas)
 *     pnpm test -- --log <carpeta>   deja la salida de cada suite en <carpeta>/<suite>.log
 *     pnpm test -- --sondear         corre cada suite con el motor bloqueado y dice cuáles
 *                                    podrían llevar la marca (no cambia nada)
 *
 * Cada suite corre en su propio proceso y con su propia casa (`AMOXSQL_HOME` temporal,
 * borrada al acabar): ninguna toca nunca `~/.amoxsql`. La prueba en Electron real
 * (`probarInteraccion.mjs`) va aparte: `pnpm test:app`.
 *
 * Sale con 0 si todas pasan y con 1 si alguna falla, con las últimas líneas de cada una
 * que falló.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(RAIZ, 'scripts');
const SIN_MOTOR = pathToFileURL(path.join(SCRIPTS, 'lib', 'sinMotor.mjs')).href;
const APARTE = new Set(['probarInteraccion.mjs']);   // Electron real: pnpm test:app
const TOPE_MS = 5 * 60 * 1000;
const MARCA = /@suite\s+rapida\b/;

// ── argumentos ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opcion = (nombre) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? (args[i + 1] ?? '') : null;
};
const rapidas = args.includes('--rapidas');
const sondear = args.includes('--sondear');
const solo = opcion('--solo');
const carpetaLog = opcion('--log');
if (carpetaLog) fs.mkdirSync(path.resolve(carpetaLog), { recursive: true });

// ── qué suites ─────────────────────────────────────────────────────────────
// Además de los archivos, la parte pura de la prueba de Electron (cola, atajos), que
// corre sin lanzar nada y entra en las rápidas.
const EXTRA = [{ suite: 'probarInteraccion.mjs --puro', archivo: 'probarInteraccion.mjs', args: ['--puro'], rapida: true }];
const esRapida = (archivo) => MARCA.test(fs.readFileSync(path.join(SCRIPTS, archivo), 'utf8').slice(0, 4000));
let suites = fs.readdirSync(SCRIPTS)
    .filter(f => /^probar.*\.mjs$/.test(f) && !APARTE.has(f))
    .sort()
    .map(f => ({ suite: f, archivo: f, args: [], rapida: esRapida(f) }));
if (!sondear) suites.push(...EXTRA);
if (solo) suites = suites.filter(s => s.suite.toLowerCase().includes(solo.toLowerCase()));
if (rapidas) suites = suites.filter(s => s.rapida);
if (!suites.length) {
    console.error('Ninguna suite coincide.');
    process.exit(1);
}

// ── correr ─────────────────────────────────────────────────────────────────
const conMotorBloqueado = rapidas || sondear;
const titulo = sondear ? 'Sondeo: cada suite con el motor bloqueado'
    : rapidas ? 'Suites rápidas (sin motor)' : 'Todas las suites';
console.log(`${titulo} — ${suites.length}\n`);

const ancho = Math.max(...suites.map(s => s.suite.length));
const resultados = [];
const t0 = Date.now();
for (const { suite, archivo, args: extra, rapida } of suites) {
    const casa = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-prueba-'));
    const inicio = Date.now();
    const argv = [...(conMotorBloqueado ? ['--import', SIN_MOTOR] : []), path.join(SCRIPTS, archivo), ...extra];
    const r = spawnSync(process.execPath, argv, {
        cwd: RAIZ,
        encoding: 'utf8',
        timeout: TOPE_MS,
        maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, AMOXSQL_HOME: casa, AMOXSQL_LLAVERO_DE_PRUEBA: '1', FORCE_COLOR: '0' },
    });
    const ms = Date.now() - inicio;
    const salida = `${r.stdout || ''}${r.stderr || ''}`;
    const ok = r.status === 0;
    const motivo = r.error?.code === 'ETIMEDOUT' ? `más de ${TOPE_MS / 60000} min`
        : r.signal ? `señal ${r.signal}` : ok ? '' : `salió con ${r.status}`;
    resultados.push({ suite, ok, ms, salida, motivo, marcada: rapida });
    if (carpetaLog) fs.writeFileSync(path.join(path.resolve(carpetaLog), `${suite.replace(/\s+/g, '_')}.log`), salida);
    try { fs.rmSync(casa, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* un archivo abierto en Windows: se queda en temp */ }

    const segundos = (ms / 1000).toFixed(1).padStart(6);
    console.log(`${ok ? '  ok ' : ' MAL '} ${suite.padEnd(ancho)} ${segundos} s${motivo ? `  (${motivo})` : ''}`);
}

// ── resumen ────────────────────────────────────────────────────────────────
const total = ((Date.now() - t0) / 1000).toFixed(0);
if (sondear) {
    const sinMotor = resultados.filter(r => r.ok);
    const faltan = sinMotor.filter(r => !r.marcada).map(r => r.suite);
    const sobran = resultados.filter(r => !r.ok && r.marcada).map(r => r.suite);
    console.log(`\n${sinMotor.length}/${resultados.length} pasan sin el motor (${total} s).`);
    console.log(faltan.length ? `Podrían llevar «@suite rapida»:\n  ${faltan.join('\n  ')}` : 'Todas las que pueden ya llevan la marca.');
    if (sobran.length) console.log(`Llevan la marca y NO pasan sin el motor:\n  ${sobran.join('\n  ')}`);
    process.exit(sobran.length ? 1 : 0);
}

const malas = resultados.filter(r => !r.ok);
for (const m of malas) {
    const cola = m.salida.trimEnd().split(/\r?\n/).slice(-25).join('\n    ');
    console.log(`\n── ${m.suite} (${m.motivo}) ──\n    ${cola}`);
}
console.log(`\n${resultados.length - malas.length}/${resultados.length} suites pasan en ${total} s.${malas.length ? ` Fallan: ${malas.map(m => m.suite).join(', ')}.` : ''}`);
process.exit(malas.length ? 1 : 0);
