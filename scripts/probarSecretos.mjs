/**
 * El llavero (A1) y el manifiesto (A2), fase 2 del plan de la 5.9.
 *
 *     node scripts/probarSecretos.mjs
 *
 * Todo en un AMOXSQL_HOME temporal y con el llavero de PRUEBA
 * (AMOXSQL_LLAVERO_DE_PRUEBA=1): cifra de verdad, con una clave que muere con
 * el proceso. Así se ejercita el modo 'llavero' entero —migración, servidor
 * HTTP, Settings— sin Electron. El proveedor real (safeStorage por parentPort)
 * se probó en la prueba de concepto 0.4.
 *
 * DuckDB comprime el texto al guardarlo, así que buscar un valor en los bytes
 * del archivo podría dar un «no aparece» falso. Las comprobaciones que importan
 * se hacen por SQL, leyendo las tablas; la de los bytes va de propina.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-secretos-'));
const HOME = path.join(TMP, 'home');
const PROYECTO = path.join(TMP, 'proyecto');
fs.mkdirSync(HOME, { recursive: true });
fs.mkdirSync(path.join(PROYECTO, '.amoxsql'), { recursive: true });
process.env.AMOXSQL_HOME = HOME;                 // ANTES de cargar nada del servidor
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
for (const k of ['GOOGLE_GENERATIVE_AI_API_KEY', 'ANTHROPIC_API_KEY', 'MINIMAX_API_KEY']) delete process.env[k];

// Lo que la 5.8 tenía en claro. Valores inconfundibles para buscarlos después.
const SECRETOS = {
    gemini: 'AIza-PRUEBA-gemini-7f3a9c',
    anthropic: 'sk-ant-PRUEBA-b81e22',
    s3Id: 'AKIA-PRUEBA-5d0c',
    s3Clave: 's3-SECRETO-PRUEBA-e4c1a8',
    nueva: 'AIza-NUEVA-PRUEBA-19ab77',
};
const CONFIG_58 = {
    geminiApiKey: SECRETOS.gemini, anthropicApiKey: SECRETOS.anthropic, minimaxApiKey: '',
    provider: 'gemini', defaultModel: 'gemini-2.5-flash',
    s3Config: { accessKeyId: SECRETOS.s3Id, secretKey: SECRETOS.s3Clave, region: 'us-east-1', defaultBucket: 'mi-bucket' },
};
const RUTA_CONFIG = path.join(HOME, 'config.json');
fs.writeFileSync(RUTA_CONFIG, JSON.stringify(CONFIG_58, null, 2));
fs.writeFileSync(path.join(PROYECTO, '.amoxsql', 'project.json'),
    JSON.stringify({ name: 'proyecto', defaultDb: 'main.duckdb', clavePropia: 'no-se-toca' }, null, 2));

const require = createRequire(import.meta.url);
const { startServer } = require(path.join(RAIZ, 'server/index.js'));
const secretos = require(path.join(RAIZ, 'server/secretos.js'));
const manifiesto = require(path.join(RAIZ, 'server/manifiesto.js'));
const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
const dbManager = require(path.join(RAIZ, 'server/DatabaseManager.js'));
const aiManager = require(path.join(RAIZ, 'server/AiManager.js'));
const { DuckDBInstance } = require('@duckdb/node-api');

let pasadas = 0, fallos = 0, omitidas = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const omitir = (titulo, por) => { omitidas++; console.log(`  --    ${titulo} (omitida: ${por})`); };
const sinSecretos = (texto, cuales = [SECRETOS.gemini, SECRETOS.anthropic, SECRETOS.s3Id, SECRETOS.s3Clave, SECRETOS.nueva]) =>
    cuales.filter(s => String(texto).includes(s));
const esperar = async (cond, ms = 15000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)); }
    return false;
};

let port;
try {
    ({ port } = await startServer(0));
    const u = (p) => `http://localhost:${port}${p}`;
    const get = (p) => fetch(u(p)).then(r => r.json());
    const post = (p, b) => fetch(u(p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

    console.log('\nel arranque');
    comprobar('el servidor entra en modo llavero', await esperar(async () => (await get('/api/secretos')).modo === 'llavero'));
    const lista = (await get('/api/secretos')).credenciales;
    const nombres = lista.map(c => c.nombre).sort();
    comprobar('copia lo que la 5.8 tenía en claro, y sólo eso',
        JSON.stringify(nombres) === JSON.stringify(['ia-anthropic', 'ia-gemini', 'nube-s3']), nombres.join(', '));
    comprobar('la lista no trae valores', !sinSecretos(JSON.stringify(lista)).length);
    const migr = await baseCentral.preferencia('migracion_credenciales');
    comprobar('la migración queda anotada', migr?.estado === 'copiadas' && migr.nombres.length === 3, JSON.stringify(migr));

    console.log('\nla purga del texto plano (5.9.0)');
    // AiManager.ensureConfig rellena los valores por defecto que falten, así que
    // el archivo cambia; lo que importa son las claves.
    const tras = JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
    comprobar('las claves en claro ya no están en config.json', !sinSecretos(JSON.stringify(tras)).length, sinSecretos(JSON.stringify(tras)).join(', '));
    comprobar('lo que no es secreto sigue igual', tras.provider === 'gemini' && tras.s3Config?.region === 'us-east-1' && tras.s3Config?.defaultBucket === 'mi-bucket', JSON.stringify(tras.s3Config));
    // Se leen de la base sin «usarlas» (eso anotaría último uso, que se mira más abajo).
    comprobar('y las claves siguen en el llavero, intactas',
        (await secretos._leerDeLaBase('ia-gemini')) === SECRETOS.gemini
        && JSON.parse(await secretos._leerDeLaBase('nube-s3')).secretKey === SECRETOS.s3Clave);
    const purga = (await get('/api/secretos/purga')).purga;
    comprobar('queda anotado qué se borró, para avisar una vez',
        purga && purga.avisada === false && purga.borradas.sort().join() === 'anthropicApiKey,geminiApiKey,s3Config.accessKeyId,s3Config.secretKey', JSON.stringify(purga));
    await post('/api/secretos/purga/vista', {});
    comprobar('y el aviso se marca como visto', (await get('/api/secretos/purga')).purga.avisada === true);
    comprobar('el anotado tampoco lleva valores', !sinSecretos(JSON.stringify(purga)).length);

    console.log('\nla base no guarda ningún valor en claro');
    const filas = await baseCentral.query(`SELECT * FROM credenciales`);
    comprobar('ni en la tabla de credenciales', !sinSecretos(JSON.stringify(filas)).length);
    comprobar('ni dentro de lo cifrado (decodificado)',
        !sinSecretos(filas.map(f => Buffer.from(f.cifrado, 'base64').toString('latin1')).join('|')).length);
    comprobar('ni en las preferencias', !sinSecretos(JSON.stringify(await baseCentral.query(`SELECT * FROM preferencias`))).length);
    comprobar('pero se leen de vuelta idénticos', (await secretos._leerDeLaBase('ia-gemini')) === SECRETOS.gemini);

    console.log('\nel renderer no recibe ni un secreto');
    const cfg = await get('/api/settings/config');
    comprobar('las claves guardadas llegan como centinela',
        cfg.geminiApiKey === secretos.SENTINELA && cfg.anthropicApiKey === secretos.SENTINELA, JSON.stringify([cfg.geminiApiKey, cfg.anthropicApiKey]));
    comprobar('la que no hay, vacía', cfg.minimaxApiKey === '');
    comprobar('de la nube, los secretos ocultos y lo público intacto',
        cfg.s3Config?.secretKey === secretos.SENTINELA && cfg.s3Config?.accessKeyId === secretos.SENTINELA
        && cfg.s3Config?.region === 'us-east-1' && cfg.s3Config?.defaultBucket === 'mi-bucket', JSON.stringify(cfg.s3Config));
    comprobar('y en toda la respuesta no aparece ningún valor', !sinSecretos(JSON.stringify(cfg)).length, sinSecretos(JSON.stringify(cfg)).join(', '));
    comprobar('dice dónde viven las claves, que no es un secreto', cfg._llavero === 'llavero', cfg._llavero);
    await new Promise(r => setTimeout(r, 300));     // «último uso» se anota sin esperar
    const trasVer = (await get('/api/secretos')).credenciales;
    comprobar('abrir Settings no cuenta como usar una clave', trasVer.every(c => c.ultimo_uso === null),
        trasVer.map(c => `${c.nombre}=${c.ultimo_uso}`).join(', '));

    console.log('\nguardar desde Settings');
    // Devolver la configuración tal cual llegó (con centinelas) no cambia nada
    let r = await post('/api/settings/config', cfg);
    comprobar('reenviar la config con centinelas no toca las claves', r.ok &&
        secretos.claveDeIA('gemini', aiManager.getConfig()) === SECRETOS.gemini
        && secretos.claveDeIA('anthropic', aiManager.getConfig()) === SECRETOS.anthropic);
    r = await post('/api/settings/config', { geminiApiKey: SECRETOS.nueva, anthropicApiKey: '' });
    const cuerpo = await r.text();
    comprobar('una clave nueva se guarda en el llavero', secretos.claveDeIA('gemini', aiManager.getConfig()) === SECRETOS.nueva);
    comprobar('una vacía se borra', !(await get('/api/secretos')).credenciales.some(c => c.nombre === 'ia-anthropic')
        && secretos.claveDeIA('anthropic', aiManager.getConfig()) === null);
    comprobar('la respuesta al guardar tampoco lleva secretos', !sinSecretos(cuerpo).length, sinSecretos(cuerpo).join(', '));
    const enDisco = fs.readFileSync(RUTA_CONFIG, 'utf8');
    comprobar('la clave nueva NO se escribe en config.json', !enDisco.includes(SECRETOS.nueva));
    comprobar('ni vuelve ninguna de las viejas', !enDisco.includes(SECRETOS.gemini) && !enDisco.includes(SECRETOS.anthropic));
    comprobar('y la borrada no resucita', secretos.claveDeIA('anthropic', JSON.parse(enDisco)) === null);

    console.log('\nuna clave escrita en la 5.8 después de migrar (volver a ella en las betas)');
    const tardia = 'mm-TARDIA-PRUEBA-5c2e';
    const conTardia = JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
    conTardia.minimaxApiKey = tardia;
    fs.writeFileSync(RUTA_CONFIG, JSON.stringify(conTardia, null, 2));
    const p2 = await secretos.purgarTextoPlano(RUTA_CONFIG);
    comprobar('no se pierde: se migra al llavero antes de borrarla',
        p2.borradas.join() === 'minimaxApiKey' && secretos.claveDeIA('minimax', aiManager.getConfig()) === tardia, JSON.stringify(p2));
    comprobar('y deja de estar en claro', !fs.readFileSync(RUTA_CONFIG, 'utf8').includes(tardia));

    console.log('\nuna que no se puede descifrar en esta máquina');
    // Una credencial que cifró otra máquina: el llavero de aquí no la abre.
    await baseCentral.query(`INSERT OR REPLACE INTO credenciales (nombre, tipo, cifrado) VALUES ('nube-gcs', 'gcs', 'bm8tZXMtZGUtYXF1aQ==')`);
    const gcsClave = 'gcs-UNICA-COPIA-PRUEBA-7f';
    const conGcs = JSON.parse(fs.readFileSync(RUTA_CONFIG, 'utf8'));
    conGcs.gcsConfig = { ...(conGcs.gcsConfig || {}), secretKey: gcsClave };
    fs.writeFileSync(RUTA_CONFIG, JSON.stringify(conGcs, null, 2));
    const re = await secretos.iniciar(aiManager.getConfig());
    comprobar('su copia en claro se CONSERVA: es la única que sirve',
        re.purga.conservadas.join() === 'gcsConfig.secretKey' && fs.readFileSync(RUTA_CONFIG, 'utf8').includes(gcsClave), JSON.stringify(re.purga));
    comprobar('y se avisa de ello', (await get('/api/secretos/purga')).purga.conservadas.join() === 'gcsConfig.secretKey');
    await baseCentral.query(`DELETE FROM credenciales WHERE nombre = 'nube-gcs'`);
    await secretos.iniciar(aiManager.getConfig());
    r = await post('/api/settings/config', { s3Config: { accessKeyId: secretos.SENTINELA, secretKey: secretos.SENTINELA, region: 'eu-west-1', defaultBucket: 'otro' } });
    const s3 = secretos.credencialNube('s3', aiManager.getConfig());
    comprobar('en la nube se cambia lo público y se conservan los secretos',
        s3.region === 'eu-west-1' && s3.defaultBucket === 'otro' && s3.secretKey === SECRETOS.s3Clave && s3.accessKeyId === SECRETOS.s3Id, JSON.stringify({ ...s3, secretKey: '…', accessKeyId: '…' }));

    console.log('\nlos secretos de DuckDB');
    const sql = secretos.sqlCrearSecreto({ nombre: 'x', tipo: 's3', claves: { KEY_ID: "a'b", SECRET: 'c' }, alcance: "s3://b'q/" });
    comprobar('son temporales, nunca persistentes', /^CREATE OR REPLACE TEMPORARY SECRET x \(/.test(sql) && !/PERSISTENT/.test(sql), sql);
    comprobar('y escapan las comillas', sql.includes("KEY_ID 'a''b'") && sql.includes("SCOPE 's3://b''q/'"), sql);
    let error = null;
    try { secretos.sqlCrearSecreto({ nombre: 'x; DROP TABLE t', tipo: 's3' }); } catch (x) { error = x.message; }
    comprobar('un nombre con SQL dentro se rechaza', /no válido/.test(error || ''));
    const vistas = [];
    await secretos.prepararNube({ systemQuery: async (q) => { vistas.push(q); return []; } }, 's3', aiManager.getConfig());
    comprobar('la exportación crea un secreto con nombre y no fija nada global',
        vistas.length === 1 && /TEMPORARY SECRET amox_nube_s3/.test(vistas[0]) && !/\bSET\b/i.test(vistas[0]), vistas.join(' | '));
    vistas.length = 0;
    await secretos.prepararNube({ systemQuery: async (q) => { vistas.push(q); return []; } }, 'gcs', aiManager.getConfig());
    comprobar('GCS ya no apunta s3_endpoint a Google', !vistas.some(q => /s3_endpoint/i.test(q)), vistas.join(' | '));
    {
        const inst = await DuckDBInstance.create(':memory:');
        const con = await inst.connect();
        try {
            await con.run('LOAD httpfs');
            await con.run(secretos.sqlCrearSecreto({ nombre: 'cliente_a', tipo: 's3', claves: { KEY_ID: 'a', SECRET: 'a' }, alcance: 's3://bucket-a' }));
            await con.run(secretos.sqlCrearSecreto({ nombre: 'cliente_b', tipo: 's3', claves: { KEY_ID: 'b', SECRET: 'b' }, alcance: 's3://bucket-b' }));
            const quien = async (url) => (await (await con.run(`SELECT name FROM which_secret('${url}', 's3')`)).getRowObjectsJson())[0]?.name;
            const n = (await (await con.run(`SELECT count(*)::INTEGER AS n FROM duckdb_secrets() WHERE name LIKE 'cliente_%'`)).getRowObjectsJson())[0].n;
            comprobar('dos clientes con buckets distintos conviven', n === 2);
            comprobar('y cada ruta usa la suya', (await quien('s3://bucket-a/x.parquet')) === 'cliente_a' && (await quien('s3://bucket-b/y.csv')) === 'cliente_b');
        } catch (x) {
            omitir('secretos con alcance contra el motor', `httpfs no se pudo cargar (${x.message.slice(0, 60)})`);
        } finally { con.closeSync(); inst.closeSync(); }
    }

    console.log('\nla fuga del historial (5.8)');
    await dbManager.connect(path.join(PROYECTO, 'main.duckdb'), PROYECTO);
    await dbManager.query(`SET s3_secret_access_key='${SECRETOS.s3Clave}'`).catch(() => {});
    await dbManager.query(`CREATE OR REPLACE TEMPORARY SECRET fuga (TYPE s3, KEY_ID '${SECRETOS.s3Id}', SECRET '${SECRETOS.s3Clave}')`).catch(() => {});
    await dbManager.query(`SELECT 42 AS marca_de_la_prueba`);
    await dbManager.flushQueryHistory();
    const hist = await dbManager.query(`SELECT * FROM amoxsql_ai.query_history`);
    comprobar('una consulta normal sí se registra', JSON.stringify(hist).includes('marca_de_la_prueba'), `${hist.length} filas`);
    comprobar('un SET o un CREATE SECRET con claves, no', !sinSecretos(JSON.stringify(hist)).length, sinSecretos(JSON.stringify(hist)).join(', '));

    // Lo que ya dejó la 5.8: se escribe a mano, como lo habría escrito ella, y
    // se reconecta. Al conectar, el historial se revisa y se tachan los valores.
    const comoLa58 = [
        `SET s3_access_key_id='${SECRETOS.s3Id}'`,
        `SET s3_secret_access_key='${SECRETOS.s3Clave}'`,
        `CREATE SECRET x (TYPE s3, KEY_ID '${SECRETOS.s3Id}', SECRET '${SECRETOS.s3Clave}', REGION 'us-east-1')`,
        `SELECT 'texto normal con una comilla''s' AS c`,
    ];
    for (const q of comoLa58) {
        await dbManager.systemQuery(`INSERT INTO amoxsql_ai.query_history (query) VALUES ('${q.replace(/'/g, "''")}')`);
    }
    const antesDe = (await dbManager.systemQuery(`SELECT count(*)::INTEGER AS n FROM amoxsql_ai.query_history`))[0].n;
    await dbManager.close();
    await dbManager.connect(path.join(PROYECTO, 'main.duckdb'), PROYECTO);
    const tras58 = await dbManager.systemQuery(`SELECT query FROM amoxsql_ai.query_history`);
    comprobar('al reconectar, los secretos que dejó la 5.8 quedan tachados', !sinSecretos(JSON.stringify(tras58)).length,
        sinSecretos(JSON.stringify(tras58)).join(', '));
    comprobar('pero las entradas se conservan', tras58.length === antesDe, `${antesDe} → ${tras58.length}`);
    comprobar('y dicen qué se hizo', tras58.some(r => /s3_secret_access_key='\*\*\*'/.test(r.query))
        && tras58.some(r => /KEY_ID '\*\*\*', SECRET '\*\*\*', REGION 'us-east-1'/.test(r.query)),
        tras58.map(r => r.query).filter(q => /\*\*\*/.test(q)).join(' | '));
    comprobar('lo que no es secreto no se toca', tras58.some(r => r.query === comoLa58[3]));
    await dbManager.close();
    await dbManager.connect(path.join(PROYECTO, 'main.duckdb'), PROYECTO);
    const otraVez = await dbManager.systemQuery(`SELECT query FROM amoxsql_ai.query_history ORDER BY query`);
    comprobar('y una segunda conexión no cambia nada (idempotente)',
        JSON.stringify(otraVez) === JSON.stringify([...tras58].sort((a, b) => a.query < b.query ? -1 : 1)));

    console.log('\nel manifiesto del proyecto');
    comprobar('anotar una extensión', manifiesto.anotarExtension(PROYECTO, 'Iceberg') === true);
    comprobar('la segunda vez no la repite', manifiesto.anotarExtension(PROYECTO, 'iceberg') === false);
    comprobar('un nombre raro se ignora', manifiesto.anotarExtension(PROYECTO, '../x; drop') === false);
    const cadena = { nodes: [
        { type: 'BucketRead', config: { uri: 's3://tn-media/spend/*.parquet' } },
        { type: 'Export', config: { opciones: { outputPath: 'gs://cierre/salida.csv' } } },
        { type: 'Filter', config: { expr: 'x > 1' } },
    ] };
    comprobar('una cadena anota las credenciales de la nube que usa', manifiesto.anotarDesdeCadena(PROYECTO, cadena) === 2);
    const pj = JSON.parse(fs.readFileSync(path.join(PROYECTO, '.amoxsql', 'project.json'), 'utf8'));
    comprobar('project.json conserva sus otras claves', pj.clavePropia === 'no-se-toca' && pj.name === 'proyecto');
    comprobar('y no guarda ningún valor', !sinSecretos(JSON.stringify(pj)).length);
    const falsaDb = { systemQuery: async () => [{ extension_name: 'json' }, { extension_name: 'httpfs' }] };
    const c = await manifiesto.comprobar(PROYECTO, falsaDb, aiManager.getConfig());
    comprobar('dice qué falta en esta máquina',
        JSON.stringify(c.faltan) === JSON.stringify({ credenciales: [{ nombre: 'nube-gcs', tipo: 'gcs' }], extensiones: ['iceberg'] }), JSON.stringify(c.faltan));
    comprobar('y lo que sí hay no lo reclama', !c.faltan.credenciales.some(x => x.nombre === 'nube-s3'));
    const sinProyecto = await get('/api/project/requisitos');
    comprobar('sin proyecto abierto no escribe ni reclama nada', sinProyecto.completo === true);

} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
} finally {
    // NO /api/shutdown: termina el proceso a los 200 ms (process.exit(0)), y la
    // prueba moriría sin imprimir —y con código 0 aunque hubiera fallos—. Y en
    // un finally, para que un fallo a medias no deje los archivos bloqueados.
    await dbManager.close().catch(() => {});
    await baseCentral.cerrar().catch(() => {});
}

// Después del apagado: los bytes del archivo, de propina (ver la cabecera)
await new Promise(r => setTimeout(r, 400));
const bytes = ['amoxsql.duckdb', 'amoxsql.duckdb.wal']
    .map(f => path.join(HOME, f)).filter(f => fs.existsSync(f))
    .map(f => fs.readFileSync(f).toString('latin1')).join('');
console.log('\nlos bytes del archivo (comprobación débil)');
comprobar('no contienen ningún valor en claro', !sinSecretos(bytes).length, sinSecretos(bytes).join(', '));

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* Windows suelta los archivos tarde */ }
console.log(`\n${pasadas} pasadas, ${fallos} fallos${omitidas ? `, ${omitidas} omitidas` : ''}\n`);
process.exit(fallos ? 1 : 0);
