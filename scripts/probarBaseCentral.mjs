/**
 * La base de AmoxSQL (A5, fase 1 del plan de la 5.9).
 *
 *     node scripts/probarBaseCentral.mjs
 *
 * Siempre sobre un AMOXSQL_HOME temporal: esta prueba crea, migra, rompe y
 * bloquea la base, y nada de eso puede pasarle a la de verdad.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-central-'));
process.env.AMOXSQL_HOME = TMP;                      // ANTES de cargar nada del servidor
const require = createRequire(import.meta.url);
const { BaseCentral } = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const { DuckDBInstance } = require('@duckdb/node-api');

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const RUTA = path.join(TMP, 'amoxsql.duckdb');

/** Lee la base «desde fuera», con una instancia propia, sin pasar por BaseCentral. */
async function mirar(sql) {
    const inst = await DuckDBInstance.create(RUTA);
    const con = await inst.connect();
    try { return (await con.run(sql)).getRowObjectsJson(); }
    finally { con.closeSync(); inst.closeSync(); }
}

try {
    // La carrera que encontró la prueba de extremo a extremo: el servidor abre
    // en segundo plano y `_abrir` asigna la conexión ANTES de migrar. Una
    // petición que llegaba en ese hueco veía la conexión y leía un estado vacío.
    console.log('\nuna petición a mitad de la apertura');
    {
        const c = new BaseCentral();
        const primera = c.abrir();
        let vueltas = 0;
        while (!c.conexion && vueltas++ < 100000) await new Promise(r => setImmediate(r));
        comprobar('(la prueba llega al hueco: conexión puesta, apertura sin terminar)', !!c.conexion && !c.estaAbierta());
        await c.abrir();
        const e = c.estado();
        comprobar('espera a la apertura en curso en vez de dar un estado vacío', e.ok && e.ruta === RUTA, JSON.stringify(e));
        await primera;
        await c.cerrar();
    }

    console.log('\nabrir');
    let db = new BaseCentral();
    await db.abrir();
    let e = db.estado();
    comprobar('queda abierta y bien', e.ok && e.abierta && db.estaAbierta(), JSON.stringify(e));
    comprobar('en el home apartado', e.ruta === RUTA && fs.existsSync(RUTA), e.ruta);
    comprobar('con el esquema v4', e.version === 4 && e.versionMaxima === 4, `v${e.version}`);
    const tablas = (await db.query(`SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main' ORDER BY 1`)).map(t => t.table_name);
    comprobar('con sus siete tablas', ['credenciales', 'ejecuciones', 'fuentes_locales', 'meta', 'preferencias', 'proyectos', 'workspaces'].every(t => tablas.includes(t)), tablas.join(', '));
    const deFlujo = (await db.query(`SELECT table_name FROM duckdb_tables() WHERE schema_name = 'amoxsql_chains' ORDER BY 1`)).map(t => t.table_name);
    comprobar('y el historial de Data Flow (migración 2)', deFlujo.join() === 'node_runs,runs', deFlujo.join(', '));
    const [{ valor: creada }] = await db.query(`SELECT valor FROM meta WHERE clave = 'creada'`);

    console.log('\nlos valores viajan como parámetros');
    const malicioso = `'); DROP TABLE workspaces; --  «ñ» €`;
    await db.guardarPreferencia('prueba', { texto: malicioso, n: 3 });
    const leido = await db.preferencia('prueba');
    comprobar('un valor con comillas vuelve idéntico', leido?.texto === malicioso && leido.n === 3, JSON.stringify(leido));
    comprobar('y la tabla que «intentaba» borrar sigue ahí',
        (await db.query(`SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE table_name = 'workspaces'`))[0].n === 1);
    comprobar('una preferencia que no existe es undefined', (await db.preferencia('no-existe')) === undefined);

    console.log('\nla cola');
    const muchas = await Promise.all(Array.from({ length: 25 }, (_, i) => db.query(`SELECT $1::INTEGER AS i`, [i])));
    comprobar('25 consultas a la vez vuelven cada una con lo suyo', muchas.every((r, i) => r[0].i === i));
    let fallo = null;
    try {
        await db.transaccion(async (q) => {
            await q(`INSERT INTO preferencias VALUES ('a-medias', '1')`);
            throw new Error('a propósito');
        });
    } catch (x) { fallo = x.message; }
    comprobar('una transacción que falla se deshace entera',
        fallo === 'a propósito' && (await db.preferencia('a-medias')) === undefined);
    comprobar('y la cola sigue funcionando después', (await db.query(`SELECT 42 AS n`))[0].n === 42);

    console.log('\nlos recientes de la 5.8');
    const A = path.join(TMP, 'Proyecto A'), B = path.join(TMP, 'Proyecto B');
    const r1 = await db.importarRecientes([A, A.toUpperCase(), B, '', 5, null]);
    const esperados = process.platform === 'win32' ? 2 : 3;   // en Windows, A y A en mayúsculas son la misma carpeta
    comprobar(`se importan sin duplicar ni aceptar basura (${esperados})`, r1.importados === esperados && !r1.yaImportados, JSON.stringify(r1));
    const r2 = await db.importarRecientes([path.join(TMP, 'Otro')]);
    comprobar('la segunda vez no hace nada', r2.yaImportados && r2.importados === 0, JSON.stringify(r2));
    const proys = await db.query(`SELECT nombre, origen FROM proyectos ORDER BY ultimo_abierto DESC`);
    comprobar('conserva el orden: el más reciente primero', proys[0]?.nombre === 'Proyecto A', proys.map(p => p.nombre).join(', '));
    comprobar('y sabe de dónde vinieron', proys.every(p => p.origen === 'recientes-5.8'));

    console.log('\nreabrir');
    await db.query(`INSERT INTO ejecuciones (id, proceso, origen, inicio, estado) VALUES ('x1', 'cierre', 'interfaz', current_timestamp, 'en_curso')`);
    await db.cerrar();
    comprobar('al cerrar queda cerrada', !db.estaAbierta() && db.estado().abierta === false);
    db = new BaseCentral();
    await db.abrir();
    const [{ valor: creada2 }] = await db.query(`SELECT valor FROM meta WHERE clave = 'creada'`);
    comprobar('no repite migraciones', db.estado().version === 4 && creada2 === creada);
    comprobar('los datos siguen ahí', (await db.preferencia('prueba'))?.texto === malicioso);
    const [ej] = await db.query(`SELECT estado, fin FROM ejecuciones WHERE id = 'x1'`);
    comprobar('lo que quedó «en curso» pasa a interrumpida, con su fin', ej.estado === 'interrumpida' && ej.fin, JSON.stringify(ej));

    console.log('\notro proceso con la base abierta');
    const hijo = spawnSync(process.execPath, ['-e', `
        process.env.AMOXSQL_HOME = ${JSON.stringify(TMP)};
        const { BaseCentral } = require(${JSON.stringify(path.join(RAIZ, 'server/central/BaseCentral.js'))});
        const db = new BaseCentral();
        db.abrir().then(() => console.log(JSON.stringify({ abrio: true })))
          .catch(e => console.log(JSON.stringify({ abrio: false, error: e.message, estado: db.estado() })));
    `], { cwd: RAIZ, encoding: 'utf8', timeout: 60000 });
    const rh = JSON.parse((hijo.stdout || '{}').trim().split('\n').pop() || '{}');
    comprobar('no puede abrirla', rh.abrio === false, hijo.stdout + hijo.stderr);
    comprobar('y lo dice en cristiano', /otro proceso/.test(rh.error || ''), rh.error);
    comprobar('nombrando al que la tiene', /\(node(\.exe)?, PID \d+\)/.test(rh.error || '') || process.platform !== 'win32', rh.error);
    comprobar('y su estado lo explica', rh.estado && rh.estado.ok === false && /otro proceso/.test(rh.estado.error || ''));
    await db.cerrar();

    // Lo que añade la v4, para simular una base anterior.
    const sinV4 = async (con) => {
        await con.run(`DROP TABLE destinos_locales`);
        await con.run(`DROP TABLE programaciones`);
        for (const c of ['programacion_id', 'prevista', 'resumen']) await con.run(`ALTER TABLE ejecuciones DROP COLUMN ${c}`);
    };

    console.log('\nuna base que se quedó en la v3 (la de la 5.10)');
    {
        const inst = await DuckDBInstance.create(RUTA);
        const con = await inst.connect();
        await sinV4(con);
        await con.run(`UPDATE meta SET valor = '3' WHERE clave = 'version_esquema'`);
        await con.run(`INSERT INTO ejecuciones (id, proceso, origen, inicio, estado) VALUES ('de-la-v3', 'x.sqlchain', 'interfaz', current_timestamp, 'ok')`);
        await con.run(`INSERT INTO fuentes_locales (ambito, nombre, ubicacion) VALUES ('w:abcd', 'ventas', 'C:/x.csv')`);
        con.closeSync(); inst.closeSync();
    }
    db = new BaseCentral();
    await db.abrir();
    comprobar('sube a la v4 al abrirla', db.estado().version === 4, `v${db.estado().version}`);
    comprobar('con destinos y programaciones', (await db.query(`SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE table_name IN ('destinos_locales', 'programaciones')`))[0].n === 2);
    const [vieja] = await db.query(`SELECT estado, programacion_id, prevista, resumen FROM ejecuciones WHERE id = 'de-la-v3'`);
    comprobar('las ejecuciones de antes siguen, con las columnas nuevas vacías', vieja?.estado === 'ok' && vieja.programacion_id === null && vieja.prevista === null, JSON.stringify(vieja));
    comprobar('y las ubicaciones de las fuentes también', (await db.query(`SELECT count(*)::INTEGER AS n FROM fuentes_locales WHERE nombre = 'ventas'`))[0].n === 1);
    await db.cerrar();

    console.log('\nuna base que se quedó en la v2 (la de la 5.9.0, la que tiene el autor)');
    {
        const inst = await DuckDBInstance.create(RUTA);
        const con = await inst.connect();
        await sinV4(con);
        await con.run(`DROP TABLE fuentes_locales`);
        await con.run(`UPDATE meta SET valor = '2' WHERE clave = 'version_esquema'`);
        await con.run(`INSERT INTO ejecuciones (id, proceso, origen, inicio, estado) VALUES ('de-la-v2', 'x.sqlchain', 'interfaz', current_timestamp, 'ok')`);
        con.closeSync(); inst.closeSync();
    }
    db = new BaseCentral();
    await db.abrir();
    comprobar('sube a la v4 desde la v2', db.estado().version === 4, `v${db.estado().version}`);
    comprobar('con fuentes_locales', (await db.query(`SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE table_name = 'fuentes_locales'`))[0].n === 1);
    comprobar('y sin perder lo que tenía', (await db.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE id = 'de-la-v2'`))[0].n === 1);
    await db.cerrar();

    console.log('\nuna base que se quedó en la v1');
    {
        const inst = await DuckDBInstance.create(RUTA);
        const con = await inst.connect();
        await sinV4(con);
        await con.run(`DROP SCHEMA amoxsql_chains CASCADE`);
        await con.run(`DROP TABLE fuentes_locales`);
        await con.run(`UPDATE meta SET valor = '1' WHERE clave = 'version_esquema'`);
        await con.run(`INSERT INTO ejecuciones (id, proceso, origen, inicio, estado) VALUES ('de-la-v1', 'x.sqlchain', 'interfaz', current_timestamp, 'ok')`);
        con.closeSync(); inst.closeSync();
    }
    db = new BaseCentral();
    await db.abrir();
    comprobar('sube hasta la v4 desde la v1', db.estado().version === 4, `v${db.estado().version}`);
    comprobar('con las tablas nuevas', (await db.query(`SELECT count(*)::INTEGER AS n FROM duckdb_tables() WHERE schema_name = 'amoxsql_chains'`))[0].n === 2);
    comprobar('y sin perder lo que tenía', (await db.query(`SELECT count(*)::INTEGER AS n FROM ejecuciones WHERE id = 'de-la-v1'`))[0].n === 1);
    await db.cerrar();

    console.log('\nuna base de una versión posterior');
    {
        const inst = await DuckDBInstance.create(RUTA);
        const con = await inst.connect();
        await con.run(`UPDATE meta SET valor = '99' WHERE clave = 'version_esquema'`);
        con.closeSync(); inst.closeSync();
    }
    const antes = await mirar(`SELECT (SELECT count(*) FROM duckdb_tables())::INTEGER AS tablas, (SELECT count(*) FROM proyectos)::INTEGER AS proyectos`);
    db = new BaseCentral();
    let error = null;
    try { await db.abrir(); } catch (x) { error = x.message; }
    comprobar('se niega a abrirla', !!error && !db.estaAbierta());
    comprobar('y explica por qué', /v99/.test(error || '') && /v4\b/.test(error || '') && /No se ha tocado nada/.test(error || ''), error);
    comprobar('su estado no está ok', db.estado().ok === false);
    const despues = await mirar(`SELECT (SELECT count(*) FROM duckdb_tables())::INTEGER AS tablas, (SELECT count(*) FROM proyectos)::INTEGER AS proyectos`);
    const [{ valor: v }] = await mirar(`SELECT valor FROM meta WHERE clave = 'version_esquema'`);
    comprobar('y de verdad no ha tocado nada', JSON.stringify(antes) === JSON.stringify(despues) && v === '99');
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows a veces tarda en soltar el archivo */ }
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos\n`);
process.exit(fallos ? 1 : 0);
