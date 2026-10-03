/**
 * Prueba de concepto 0.4 de la 5.10 (Dec-13, fases 5 y 6 · C4 y C6).
 *
 * 1. Publicar = escribir `.<nombre>.amoxtmp` en la misma carpeta y renombrar.
 *    ¿Que pasa en Windows si el destino lo tiene abierto otro programa, segun
 *    COMO lo abrio? (Excel lo abre sin compartir; un lector cualquiera, sin
 *    permitir borrar; Node y DuckDB, compartiendolo todo.)
 * 2. ¿`delta` e `iceberg` cargan sin red si ya se instalaron una vez?
 *
 *   node scripts/poc510/p04_renombrar_y_extensiones.mjs [--carpeta <ruta>]
 *
 * Con --carpeta, la parte 1 se hace ahi (p. ej. una carpeta sincronizada con la
 * nube) en lugar de en el temporal del sistema. Crea y borra una subcarpeta
 * `amox-poc04-*`; no toca nada mas.
 */
import { createRequire } from 'module';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { DuckDBInstance } = require('@duckdb/node-api');

const i = process.argv.indexOf('--carpeta');
const base = i > 0 ? process.argv[i + 1] : os.tmpdir();
const dir = fs.mkdtempSync(path.join(base, 'amox-poc04-'));
const fwd = (p) => p.split(path.sep).join('/');

const resultados = [];
const anota = (pregunta, ok, detalle = '') => {
    resultados.push({ pregunta, ok });
    console.log(`${ok ? 'SI ' : 'NO '} ${pregunta}${detalle ? `  — ${detalle}` : ''}`);
};

/**
 * Abre `ruta` desde otro proceso (PowerShell, .NET) con el modo de compartir
 * dado y lo mantiene abierto hasta que se le mata. Resuelve cuando ya lo tiene.
 */
function abrirDesdeOtroProceso(ruta, compartir) {
    const ps = `$f = [System.IO.File]::Open('${ruta.replace(/'/g, "''")}', 'Open', 'Read', '${compartir}'); ` +
        `Write-Output 'abierto'; Start-Sleep -Seconds 60; $f.Close()`;
    const hijo = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
        hijo.stdout.on('data', (d) => { if (String(d).includes('abierto')) resolve(hijo); });
        hijo.stderr.on('data', (d) => reject(new Error(String(d))));
        setTimeout(() => reject(new Error('PowerShell no abrio el archivo')), 15000);
    });
}

// Como abre el motor AmoxSQL (sin la caché de archivos: ver server/motor.js).
const { crearInstancia } = require('../../server/motor.js');
const inst = await crearInstancia(':memory:');
const c = await inst.connect();
const intenta = async (sql) => {
    try { const r = await c.runAndReadAll(sql); return { ok: true, filas: r.getRowObjectsJson() }; }
    catch (e) { return { ok: false, error: String(e.message || e).split('\n')[0] }; }
};

// --- 1. Escribir aparte y renombrar
const destino = path.join(dir, 'ventas.parquet');
const temporal = path.join(dir, '.ventas.parquet.amoxtmp');
const publicar = async (n) => {
    await c.run(`COPY (SELECT ${n} AS version) TO '${fwd(temporal)}' (FORMAT parquet)`);
    const t0 = performance.now();
    try { fs.renameSync(temporal, destino); return { ok: true, ms: performance.now() - t0 }; }
    catch (e) { return { ok: false, code: e.code, ms: performance.now() - t0 }; }
};
const version = async () => (await intenta(`SELECT version FROM '${fwd(destino)}'`)).filas?.[0]?.version;

{
    let r = await publicar(1);
    anota('renombrar sobre nada', r.ok, `${r.ms.toFixed(1)} ms`);
    r = await publicar(2);
    anota('renombrar reemplaza un destino que nadie tiene abierto', r.ok && await version() === 2);

    // Un lector a mitad: DuckDB leyendo el destino en otra conexion mientras se publica
    const c2 = await inst.connect();
    const lectura = c2.runAndReadAll(`SELECT count(*) AS n, max(version) AS v FROM read_parquet(['${fwd(destino)}', '${fwd(destino)}', '${fwd(destino)}'])`);
    r = await publicar(3);
    const leido = await lectura.then(x => x.getRowObjectsJson()[0]).catch(e => ({ error: e.message }));
    // En Windows CUALQUIER proceso con el destino abierto impide reemplazarlo,
    // aunque lo comparta todo (incluido DuckDB leyendolo en ese instante). Lo que
    // importa: el lector ve una version entera, y el reintento entra al soltarlo.
    anota(`con DuckDB leyendo el destino a la vez: el renombrado ${r.ok ? 'entra' : `falla con ${r.code}`}, la lectura ve una version entera`,
        !leido.error && Number(leido.v) === 2 || Number(leido.v) === 3, `lectura ${JSON.stringify(leido)}`);
    if (!r.ok) {
        try { fs.renameSync(temporal, destino); r = { ok: true }; } catch (e) { r = { ok: false, code: e.code }; }
        anota('  ...el reintento, con la lectura ya terminada, entra', r.ok && await version() === 3, r.code);
    }

    for (const [compartir, quien] of [['None', 'como Excel (sin compartir)'], ['Read', 'un lector que no permite borrar'], ['ReadWrite, Delete', 'un lector que lo comparte todo']]) {
        let hijo;
        try { hijo = await abrirDesdeOtroProceso(destino, compartir); }
        catch (e) { anota(`abrir el destino ${quien}`, false, e.message); continue; }
        r = await publicar(10);
        // Reintentos de Dec-13: unos segundos
        let reintentos = 0;
        while (!r.ok && reintentos < 3) {
            await new Promise(res => setTimeout(res, 300));
            try { fs.renameSync(temporal, destino); r = { ok: true }; } catch (e) { r = { ok: false, code: e.code }; }
            reintentos++;
        }
        hijo.kill();
        await new Promise(res => hijo.on('exit', res));
        anota(`destino abierto ${quien}: ${r.ok ? 'se reemplaza' : `falla con ${r.code}`}`, true);
        if (!r.ok) {
            const quedo = fs.existsSync(temporal);
            fs.rmSync(temporal, { force: true });
            anota('  ...y el temporal se puede quitar sin dejar rastro', quedo && !fs.existsSync(temporal));
            // Al soltarlo, publicar entra
            r = await publicar(11);
            anota('  ...al soltarlo, publicar vuelve a funcionar', r.ok && await version() === 11);
        }
    }

    // Lo que hay en la carpeta al final: ningun temporal huerfano
    const restos = fs.readdirSync(dir).filter(n => n.endsWith('.amoxtmp'));
    anota('no quedan temporales en la carpeta', restos.length === 0, restos.join(', '));

    // El aviso de propietario de Office: Excel deja ~$<nombre> con quien lo abrio
    anota('(dato) Office deja «~$<nombre>» junto al archivo abierto; sirve para decir quien lo tiene', true,
        'se comprueba a mano abriendo el destino en Excel');
}

// --- 2. Extensiones sin red
{
    // Un repositorio que no existe simula no tener red: si INSTALL/LOAD no lo
    // necesitan, terminan bien.
    const sinRed = await DuckDBInstance.create(':memory:', { autoinstall_known_extensions: 'false' });
    const s = await sinRed.connect();
    await s.run(`SET custom_extension_repository = 'http://127.0.0.1:9/no-hay-red'`);
    for (const ext of ['delta', 'iceberg', 'ducklake', 'httpfs', 'excel']) {
        let paso = 'INSTALL';
        try {
            await s.run(`INSTALL ${ext}`);
            paso = 'LOAD';
            await s.run(`LOAD ${ext}`);
            anota(`${ext}: INSTALL + LOAD sin red, ya descargada`, true);
        } catch (e) {
            anota(`${ext}: sin red`, false, `${paso}: ${String(e.message).split('\n')[0]}`);
        }
    }
    // Una que no esta descargada: el error que vera el usuario
    try { await s.run('INSTALL spatial'); anota('spatial (no descargada): sin red falla', false, 'se instalo'); }
    catch (e) { anota('una extension nunca descargada falla sin red, con este error', true, String(e.message).split('\n')[0].slice(0, 160)); }
}

fs.rmSync(dir, { recursive: true, force: true });
const fallos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} como se esperaba`);
process.exit(fallos ? 1 : 0);
