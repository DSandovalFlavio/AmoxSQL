/**
 * El proyecto dbt (5.12, fase 2): I4, I9, I11 y Dec-29.
 *
 *     node scripts/probarDbtProyecto.mjs
 *
 *   - crear un proyecto: capas con un ejemplo, persist_docs, store_failures, un solo
 *     target `prod` marcado como producción; sin pisar lo que ya hay;
 *   - los targets, el activo, producción y la propuesta en un proyecto que no lo dijo;
 *   - «Create a dev target» con su propia base;
 *   - cuándo hay que confirmar antes de escribir en producción, y por el servidor;
 *   - el snapshot en YAML y las explicaciones.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-dbtproyecto-'));
process.env.AMOXSQL_HOME = path.join(TMP, 'home');
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';
fs.mkdirSync(process.env.AMOXSQL_HOME, { recursive: true });

const require = createRequire(import.meta.url);
const yaml = require(require.resolve('js-yaml', { paths: [RAIZ] }));
const proyecto = require(path.join(RAIZ, 'server/dbt/proyecto.js'));
const { crearEntornoFalso } = require(path.join(RAIZ, 'scripts/ayudas/dbtFalso.cjs'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const lanza = (f) => { try { f(); return null; } catch (e) { return e; } };
const leer = (p, rel) => fs.readFileSync(path.join(p, rel), 'utf8');

try {
    console.log('\ncrear un proyecto (I11, Dec-29)');
    const P = path.join(TMP, 'tienda');
    fs.mkdirSync(P, { recursive: true });
    const r = proyecto.crear(P, { nombre: 'tienda-norte' });
    comprobar('el nombre se limpia', r.nombre === 'tienda_norte');
    const dp = yaml.load(leer(P, 'dbt_project.yml'));
    comprobar('persist_docs y store_failures', dp.models.tienda_norte['+persist_docs']?.columns === true && dp.data_tests?.['+store_failures'] === true);
    comprobar('las tres capas, con su materialización', dp.models.tienda_norte.staging['+materialized'] === 'view' && dp.models.tienda_norte.marts['+materialized'] === 'table');
    const perfiles = yaml.load(leer(P, 'profiles.yml'));
    comprobar('un solo target, prod', JSON.stringify(Object.keys(perfiles.tienda_norte.outputs)) === '["prod"]' && perfiles.tienda_norte.target === 'prod', JSON.stringify(perfiles));
    comprobar('un ejemplo en cada capa, encadenados con ref()',
        /ref\('example_orders'\)/.test(leer(P, 'models/staging/stg_orders.sql'))
        && /ref\('stg_orders'\)/.test(leer(P, 'models/intermediate/int_orders_daily.sql'))
        && /ref\('int_orders_daily'\)/.test(leer(P, 'models/marts/fct_revenue_monthly.sql'))
        && fs.existsSync(path.join(P, 'seeds/example_orders.csv')));
    comprobar('sin packages.yml (correría sólo tras dbt deps)', !fs.existsSync(path.join(P, 'packages.yml')));
    const cfg = JSON.parse(leer(P, '.amoxsql/project.json'));
    comprobar('el proyecto empieza en producción', cfg.dbt?.target === 'prod' && JSON.stringify(cfg.dbt?.produccion) === '["prod"]', JSON.stringify(cfg.dbt));
    fs.writeFileSync(path.join(P, 'models/staging/stg_orders.sql'), 'select 1 as mio');
    const r2 = proyecto.crear(P, { nombre: 'otro' });
    comprobar('crear otra vez no pisa nada', leer(P, 'models/staging/stg_orders.sql') === 'select 1 as mio' && r2.creados.length === 0, JSON.stringify(r2.creados));
    comprobar('.gitignore con las bases y target/', /\*\.duckdb/.test(leer(P, '.gitignore')) && /target\//.test(leer(P, '.gitignore')));

    console.log('\nlos targets (I4)');
    let t = proyecto.targets(P);
    comprobar('prod, activo y en producción', t.activo === 'prod' && t.enProduccion && t.targets.length === 1 && t.targets[0].path === 'tienda_norte.duckdb', JSON.stringify(t));
    comprobar('con prod como único target, escribir NO pide confirmación', proyecto.confirmacionNecesaria(P, ['run']) === null);
    const dev = proyecto.crearDev(P);
    comprobar('«Create a dev target»: su propia base', dev.path === 'tienda_norte_dev.duckdb', JSON.stringify(dev));
    comprobar('y no se crea dos veces', /already a target named «dev»/.test(lanza(() => proyecto.crearDev(P))?.message || ''));
    t = proyecto.targets(P);
    comprobar('ahora hay dos', t.targets.map(x => x.nombre).join() === 'prod,dev');
    comprobar('con dev también, escribir en prod pide confirmación', proyecto.confirmacionNecesaria(P, ['build'])?.target === 'prod');
    comprobar('leer no la pide (compile, test, show, freshness)', ['compile', 'test', 'show', 'source freshness'].every(a => proyecto.confirmacionNecesaria(P, a.split(' ')) === null));
    comprobar('--full-refresh cuenta como escribir', proyecto.confirmacionNecesaria(P, ['test', '--full-refresh'])?.target === 'prod');
    comprobar('con --target dev, no', proyecto.confirmacionNecesaria(P, ['run', '--target', 'dev']) === null && proyecto.confirmacionNecesaria(P, ['run', '--target=dev']) === null);
    comprobar('conTarget añade el activo si la orden no dice otro', JSON.stringify(proyecto.conTarget(P, ['run'])) === '["run","--target","prod"]');
    comprobar('  no en deps ni clean, ni si ya lo dice', JSON.stringify(proyecto.conTarget(P, ['deps'])) === '["deps"]' && JSON.stringify(proyecto.conTarget(P, ['run', '--target', 'dev'])) === '["run","--target","dev"]');

    const VIEJO = path.join(TMP, 'viejo');
    fs.mkdirSync(VIEJO, { recursive: true });
    fs.writeFileSync(path.join(VIEJO, 'dbt_project.yml'), 'name: viejo\nprofile: viejo\n');
    fs.writeFileSync(path.join(VIEJO, 'profiles.yml'), 'viejo:\n  target: dev\n  outputs:\n    dev: { type: duckdb, path: dev.duckdb }\n    production: { type: duckdb, path: prod.duckdb }\n');
    t = proyecto.targets(VIEJO);
    comprobar('un proyecto que ya existía: producción sin decir, se propone «production»', t.produccion === null && JSON.stringify(t.propuesta) === '["production"]' && t.activo === 'dev', JSON.stringify(t));
    comprobar('  y mientras no lo diga, nada pide confirmación', proyecto.confirmacionNecesaria(VIEJO, ['run', '--target', 'production']) === null);

    console.log('\nel snapshot y las explicaciones (I9)');
    let s = proyecto.plantillaSnapshot({ nombre: 'orders history', relacion: "ref('stg_orders')", clave: 'order_id' });
    let y = yaml.load(s.texto);
    comprobar('snapshot por fecha, en YAML válido', s.archivo === 'snapshots/orders_history.yml' && y.snapshots[0].config.strategy === 'timestamp' && y.snapshots[0].config.updated_at === 'updated_at' && y.snapshots[0].relation === "ref('stg_orders')", s.texto);
    s = proyecto.plantillaSnapshot({ nombre: 'x', estrategia: 'check' });
    y = yaml.load(s.texto);
    comprobar('snapshot comparando columnas', y.snapshots[0].config.strategy === 'check' && y.snapshots[0].config.check_cols === 'all');
    comprobar('un snapshot sin nombre', !!lanza(() => proyecto.plantillaSnapshot({ nombre: '' })));
    comprobar('las explicaciones de incremental y snapshot', /only processes what is new/.test(proyecto.EXPLICACIONES.incremental) && /keeps the history/.test(proyecto.EXPLICACIONES.snapshot));

    console.log('\npor el servidor');
    const { startServer } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const { port } = await startServer(0);
    for (let k = 0; k < 100 && !baseCentral.estaAbierta(); k++) await new Promise(res => setTimeout(res, 100));
    const u = (p) => `http://localhost:${port}${p}`;
    const pedir = (m) => (p, b) => fetch(u(p), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST');
    const N = path.join(TMP, 'nuevo');
    fs.mkdirSync(N, { recursive: true });
    await post('/api/project/open', { path: N });
    let h = await post('/api/dbt/init', { projectName: 'nuevo' });
    comprobar('/api/dbt/init crea el proyecto con los ejemplos', h.success && h.createdFiles.includes('models/marts/fct_revenue_monthly.sql'), JSON.stringify(h).slice(0, 200));
    h = await get('/api/dbt/targets');
    comprobar('/api/dbt/targets: prod, en producción', h.activo === 'prod' && h.enProduccion === true);
    h = await post('/api/dbt/targets/dev', {});
    comprobar('crear dev lo deja activo', h.activo === 'dev' && h.creado?.path === 'nuevo_dev.duckdb', JSON.stringify(h).slice(0, 200));
    // El dbt falso, como entorno del proyecto.
    const falso = crearEntornoFalso(TMP, "console.log('ARGS ' + JSON.stringify(args)); console.log('Completed successfully');");
    const cfgN = JSON.parse(leer(N, '.amoxsql/project.json'));
    fs.writeFileSync(path.join(N, '.amoxsql/project.json'), JSON.stringify({ ...cfgN, dbt: { ...cfgN.dbt, entorno: { tipo: 'python', ruta: falso.carpeta }, target: 'prod' } }));
    h = await post('/api/dbt/execute', { command: 'dbt run' });
    comprobar('escribir en prod con dev al lado: 409 y qué target', h.status === 409 && h.necesitaConfirmar && h.target === 'prod', JSON.stringify(h));
    h = await post('/api/dbt/execute', { command: 'dbt run', confirmarProduccion: 'pro' });
    comprobar('  un nombre mal escrito no vale', h.status === 409);
    const sse = await fetch(u('/api/dbt/execute'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: 'dbt run', confirmarProduccion: 'prod' }) }).then(x => x.text());
    comprobar('  con el nombre, corre (y con --target prod)', /ARGS \[\\"run\\",\\"--target\\",\\"prod\\"/.test(sse) || /"--target","prod"/.test(sse.replace(/\\"/g, '"')), sse.slice(0, 300));
    h = await post('/api/dbt/execute', { command: 'dbt compile' });
    comprobar('compile no pide nada', h.status === undefined || h.status === 200);
    h = await post('/api/dbt/template/snapshot', { nombre: 'orders_history', relacion: "ref('stg_orders')", clave: 'order_id' });
    comprobar('la plantilla de snapshot escribe snapshots/<nombre>.yml', h.success && fs.existsSync(path.join(N, 'snapshots/orders_history.yml')));
    h = await post('/api/dbt/template/snapshot', { nombre: 'orders_history' });
    comprobar('  y no pisa uno que ya existe', h.status === 409);
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
