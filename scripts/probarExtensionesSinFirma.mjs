/**
 * Extensiones sin firma (6.0.1): `server/motor.js → permiteSinFirma` y
 * `DatabaseManager.reiniciarConLaMismaBase`.
 *
 * - El ajuste se lee de `config.json` del home de AmoxSQL en CADA instancia.
 * - Una extensión con la firma rota no se instala sin el ajuste (y el mensaje
 *   lo dice con «signature», que es lo que el servidor reconoce), y sí con él.
 *   Se usa una copia de una extensión real con un byte cambiado, instalada en una
 *   carpeta de extensiones temporal: nunca en la del usuario.
 * - Reiniciar el motor para aplicar el ajuste deja la misma base abierta.
 *
 *   node scripts/probarExtensionesSinFirma.mjs   (con AMOXSQL_HOME temporal: pnpm test lo pone)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HOME = process.env.AMOXSQL_HOME;
if (!HOME) { console.error('Falta AMOXSQL_HOME temporal (pnpm test lo pone).'); process.exit(1); }
fs.mkdirSync(HOME, { recursive: true });
const CONFIG = path.join(HOME, 'config.json');
const ponerAjuste = (on) => fs.writeFileSync(CONFIG, JSON.stringify(on ? { extensionesSinFirma: true } : {}));

const motor = require('../server/motor');

let bien = 0;
let mal = 0;
function comprobar(titulo, real, esperado) {
    const a = JSON.stringify(real);
    const b = JSON.stringify(esperado);
    if (a === b) { bien++; return; }
    mal++;
    console.error(`FALLA  ${titulo}\n  esperado ${b}\n  real     ${a}`);
}

async function ajusteDelMotor(con) {
    const r = await (await con.run("SELECT current_setting('allow_unsigned_extensions') AS v")).getRowObjectsJson();
    return r[0].v === true || String(r[0].v) === 'true';
}

// ── el ajuste nace con la instancia ───────────────────────────────────────
for (const on of [false, true]) {
    ponerAjuste(on);
    comprobar(`permiteSinFirma lee config.json (${on})`, motor.permiteSinFirma(), on);
    const con = await (await motor.crearInstancia()).connect();
    comprobar(`la instancia nace con allow_unsigned_extensions = ${on}`, await ajusteDelMotor(con), on);
}
fs.writeFileSync(CONFIG, '{ roto');
comprobar('un config.json ilegible es «no»', motor.permiteSinFirma(), false);

// ── una extensión con la firma rota ───────────────────────────────────────
// Cualquier extensión ya descargada para la versión del motor sirve de base.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-sinfirma-'));
let base = null;
{
    const con = await (await motor.crearInstancia()).connect();
    const v = (await (await con.run('PRAGMA version')).getRowObjectsJson())[0].library_version;
    const carpeta = path.join(os.homedir(), '.duckdb', 'extensions', v);
    try {
        for (const plat of fs.readdirSync(carpeta)) {
            const f = fs.readdirSync(path.join(carpeta, plat)).find((n) => n.endsWith('.duckdb_extension'));
            if (f) { base = path.join(carpeta, plat, f); break; }
        }
    } catch { /* sin extensiones descargadas */ }
}
if (!base) {
    console.log('(sin una extensión descargada para esta versión del motor: se salta la prueba de firma)');
} else {
    const nombre = path.basename(base).split('.')[0];
    const copia = path.join(tmp, path.basename(base));
    const bytes = fs.readFileSync(base);
    bytes[bytes.length - 10] ^= 0xff;   // dentro de la firma
    fs.writeFileSync(copia, bytes);
    const literal = copia.split(path.sep).join('/');
    for (const on of [false, true]) {
        ponerAjuste(on);
        const con = await (await motor.crearInstancia()).connect();
        await con.run(`SET extension_directory = '${path.join(tmp, `dir-${on}`).split(path.sep).join('/')}'`);
        let fallo = null;
        try {
            await con.run(`FORCE INSTALL '${literal}'`);
            await con.run(`LOAD ${nombre}`);
        } catch (e) { fallo = e.message; }
        if (on) comprobar('con el ajuste, la extensión sin firma carga', fallo, null);
        else comprobar('sin él, falla por la firma', /signature/i.test(fallo || ''), true);
    }
}

// ── reiniciar para aplicarlo deja la misma base abierta ───────────────────
{
    ponerAjuste(false);
    const dbManager = require('../server/DatabaseManager');
    const archivo = path.join(tmp, 'prueba.duckdb');
    await dbManager.connect(archivo, tmp, {});
    await dbManager.query('CREATE TABLE t AS SELECT 42 AS x');
    ponerAjuste(true);
    await dbManager.reiniciarConLaMismaBase();
    const filas = await dbManager.query('SELECT x FROM t');
    comprobar('tras reiniciar, la base sigue abierta', Number(filas?.[0]?.x), 42);
    const ajuste = await dbManager.systemQuery("SELECT current_setting('allow_unsigned_extensions') AS v");
    comprobar('y el motor nuevo tiene el ajuste', String(ajuste?.[0]?.v), 'true');
    await dbManager.close?.();
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows puede tener el archivo abierto */ }
console.log(`${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
