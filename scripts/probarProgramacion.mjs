/**
 * Programación (D1), fase 5 del plan de la 5.11.
 *
 *     node scripts/probarProgramacion.mjs
 *
 * Con un reloj de mentira (cada tick recibe su «ahora»):
 *   - las reglas: días hábiles y festivos, fin de mes, cada N horas;
 *   - el tick: corre la ocurrencia más reciente y dice cuántas se perdieron;
 *     nunca dos veces la misma; no se pone al día si no debe ni con una de
 *     hace más de 7 días; respeta las pausas;
 *   - la fecha de la ocurrencia: un parámetro «hoy» y el {fecha} del archivo
 *     son los del día que tocaba;
 *   - los avisos según la programación (siempre, sólo si falla, nunca);
 *   - la orden `tick` de la línea de comandos;
 *   - la tarea del sistema, con un schtasks simulado: XML, escribir, borrar.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const RAIZ = path.resolve(path.dirname(ESTE), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-programacion-'));
const HOME = path.join(TMP, 'home');
fs.mkdirSync(HOME, { recursive: true });
process.env.AMOXSQL_HOME = HOME;
process.env.AMOXSQL_LLAVERO_DE_PRUEBA = '1';

const require = createRequire(import.meta.url);
const reglas = require(path.join(RAIZ, 'server/programacion/reglas.js'));

let pasadas = 0, fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    if (ok) { pasadas++; console.log(`  ok    ${titulo}`); }
    else { fallos++; console.log(`  FALLA ${titulo}${detalle ? ' — ' + detalle : ''}`); }
};
const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const igual = (a, b) => a && b && a.getTime() === b.getTime();

try {
    console.log('\nlas reglas');
    const cal = { laborables: [1, 2, 3, 4, 5], festivos: ['2026-11-02'] };
    comprobar('primer día hábil: salta el domingo 1 y el festivo 2', igual(reglas.siguiente({ tipo: 'mensual', hora: '07:00', modo: 'primer_habil' }, local(2026, 10, 15), cal), local(2026, 11, 3, 7)));
    comprobar('último día hábil', igual(reglas.siguiente({ tipo: 'mensual', hora: '18:00', modo: 'ultimo_habil' }, local(2026, 10, 1), cal), local(2026, 10, 30, 18)));
    comprobar('el día 31 en febrero es el 28', igual(reglas.siguiente({ tipo: 'mensual', hora: '07:00', modo: 'dia', dia: 31 }, local(2027, 2, 1), cal), local(2027, 2, 28, 7)));
    comprobar('el tercer día hábil', igual(reglas.siguiente({ tipo: 'mensual', hora: '07:00', modo: 'habil_n', dia: 3 }, local(2026, 10, 1), cal), local(2026, 10, 5, 7)));
    comprobar('cada 4 horas dentro de la franja', reglas.proximas({ tipo: 'cada', horas: 4, desde: '08:00', hasta: '18:00' }, local(2026, 10, 5, 9), cal, 3).map(d => d.getHours()).join() === '12,16,8');
    comprobar('sólo días hábiles', igual(reglas.siguiente({ tipo: 'diaria', hora: '07:00', soloHabiles: true }, local(2026, 10, 30, 8), cal), local(2026, 11, 3, 7)));
    comprobar('en una frase', reglas.describir({ tipo: 'mensual', hora: '07:00', modo: 'primer_habil' }) === 'Every month, on the first business day, at 07:00');
    let e = null; try { reglas.normalizar({ tipo: 'diaria', hora: '25:00' }); } catch (x) { e = x; }
    comprobar('una hora que no existe se dice', /HH:MM/.test(e?.message || ''), e?.message);

    console.log('\nel tick, con un reloj de mentira');
    const { startServer, atenderOrden, arrancarProgramador } = require(path.join(RAIZ, 'server/index.js'));
    const baseCentral = require(path.join(RAIZ, 'server/central/BaseCentral.js'));
    const programaciones = require(path.join(RAIZ, 'server/programacion/programaciones.js'));
    const programador = require(path.join(RAIZ, 'server/programacion/programador.js'));
    const { port } = await startServer(0);
    for (let i = 0; i < 100 && !baseCentral.estaAbierta(); i++) await new Promise(r => setTimeout(r, 100));
    const avisos = [];
    const proximas = [];
    arrancarProgramador({ reloj: false, avisar: (a) => avisos.push(a), proximaCambio: (p, activo) => proximas.push({ p, activo }) });
    const pedir = (m) => (p, b) => fetch(`http://localhost:${port}${p}`, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })
        .then(async x => ({ status: x.status, ...(await x.json().catch(() => ({}))) }));
    const get = pedir('GET'), post = pedir('POST'), put = pedir('PUT');

    const PR = path.join(TMP, 'cierre');
    fs.mkdirSync(PR, { recursive: true });
    const proceso = (consulta = `SELECT 1 AS n`) => ({
        version: '1.0', name: 'Cierre diario', config: { base: 'memoria' },
        parametros: [{ nombre: 'dia', tipo: 'fecha' }], variables: { dia: '2026-01-01' },
        nodes: [
            { id: 'q', type: 'sql_inline', label: 'Consulta', config: { query: consulta } },
            { id: 'x', type: 'export_file', label: 'Guardar', config: { format: 'csv', outputPath: 'salidas/cierre_${dia}_{fecha}.csv' } },
        ],
        edges: [{ id: 'e', source: 'q', target: 'x' }],
    });
    fs.writeFileSync(path.join(PR, 'cierre.sqlchain'), JSON.stringify(proceso()));
    fs.writeFileSync(path.join(PR, 'roto.sqlchain'), JSON.stringify({ ...proceso('SELECT * FROM no_existe'), name: 'Roto' }));

    const T0 = local(2026, 10, 1, 8);
    const diaria = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: PR, regla: { tipo: 'diaria', hora: '07:00' }, parametros: { dia: 'hoy' } }, { ahora: T0 });
    comprobar('se crea, con su próxima', igual(new Date(diaria.proxima), local(2026, 10, 2, 7)), diaria.proxima);
    let r = await programador.tick(local(2026, 10, 4, 9));
    const corrida = r.corridas[0];
    comprobar('tras tres días apagada corre UNA: la más reciente', r.corridas.length === 1 && igual(new Date(corrida.prevista), local(2026, 10, 4, 7)) && corrida.estado === 'ok', JSON.stringify(r).slice(0, 300));
    comprobar('y dice cuántas se perdieron (2)', corrida.perdidas === 2, JSON.stringify(corrida));
    const salida = path.join(PR, 'salidas', 'cierre_2026-10-04_2026-10-04.csv');
    comprobar('«hoy» y {fecha} son el día que tocaba', fs.existsSync(salida), fs.existsSync(path.join(PR, 'salidas')) ? fs.readdirSync(path.join(PR, 'salidas')).join(', ') : 'sin salidas');
    const [fila] = await baseCentral.query(`SELECT origen, programacion_id, prevista, resumen FROM ejecuciones WHERE id = $1`, [corrida.runId]);
    comprobar('queda en ejecuciones con su programación, su hora prevista y su resumen', fila?.origen === 'programada' && fila.programacion_id === diaria.id && fila.prevista && JSON.parse(fila.resumen || '{}').estado === 'ok', JSON.stringify(fila).slice(0, 300));
    comprobar('y avisa, contando lo perdido', avisos.length === 1 && /2 earlier runs were missed/.test(avisos[0].texto) && avisos[0].ok, JSON.stringify(avisos));
    r = await programador.tick(local(2026, 10, 4, 9, 30));
    comprobar('otro tick a la misma altura no la repite', r.corridas.length === 0, JSON.stringify(r));
    await baseCentral.query(`UPDATE programaciones SET ultima_prevista = $2 WHERE id = $1`, [diaria.id, local(2026, 10, 3, 7).toISOString()]);
    r = await programador.tick(local(2026, 10, 4, 9, 45));
    comprobar('aunque alguien la vuelva a pedir: la clave (programación, hora) lo impide', r.corridas.length === 0, JSON.stringify(r));

    const sinPonerse = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: PR, regla: { tipo: 'diaria', hora: '07:00' }, parametros: { dia: 'hoy' }, ponerseAlDia: false }, { ahora: T0 });
    await programaciones.pausar(diaria.id);
    r = await programador.tick(local(2026, 10, 6, 12));
    comprobar('sin «ponerse al día», lo perdido se salta y se dice', r.corridas.length === 0 && r.saltadas.some(x => x.programacionId === sinPonerse.id && /does not catch up/.test(x.motivo)), JSON.stringify(r));
    r = await programador.tick(local(2026, 10, 7, 7, 5));
    comprobar('pero lo de ahora sí corre', r.corridas.some(x => x.programacionId === sinPonerse.id), JSON.stringify(r).slice(0, 200));
    comprobar('una programación pausada no corre', !r.corridas.some(x => x.programacionId === diaria.id));
    await programaciones.borrar(sinPonerse.id);

    const mensual = await programaciones.crear({ proceso: 'cierre.sqlchain', proyecto: PR, regla: { tipo: 'mensual', hora: '07:00', modo: 'dia', dia: 1 }, parametros: { dia: 'hoy' } }, { ahora: local(2026, 9, 20) });
    r = await programador.tick(local(2026, 10, 15, 9));
    comprobar('nunca una de hace más de 7 días', r.corridas.length === 0 && r.saltadas.some(x => x.programacionId === mensual.id && /7 days/.test(x.motivo)), JSON.stringify(r));
    await programaciones.borrar(mensual.id);

    const rota = await programaciones.crear({ proceso: 'roto.sqlchain', proyecto: PR, regla: { tipo: 'diaria', hora: '07:00' }, avisar: 'fallo', parametros: { dia: 'hoy' } }, { ahora: local(2026, 10, 10, 8) });
    avisos.length = 0;
    r = await programador.tick(local(2026, 10, 11, 7, 1));
    comprobar('un proceso que falla: el aviso dice en qué paso', r.corridas[0]?.estado === 'fallo' && avisos.length === 1 && !avisos[0].ok && /failed at "Consulta"/.test(avisos[0].texto), JSON.stringify(avisos));
    await programaciones.actualizar(rota.id, { avisar: 'nunca' });
    avisos.length = 0;
    await programador.tick(local(2026, 10, 12, 7, 1));
    comprobar('«nunca» no avisa', avisos.length === 0);
    await programaciones.borrar(rota.id);

    await programaciones.pausar(diaria.id, { reanudar: true });
    await programaciones.pausaGeneral(local(2099, 1, 1));
    r = await programador.tick(local(2026, 10, 20, 9));
    comprobar('la pausa general no corre nada, y lo dice', r.corridas.length === 0 && !!r.pausado, JSON.stringify(r));
    await programaciones.pausaGeneral(null);

    console.log('\nla orden tick');
    await baseCentral.query(`UPDATE programaciones SET ultima_prevista = $2 WHERE id = $1`, [diaria.id, new Date(Date.now() - 36 * 3600 * 1000).toISOString()]);
    r = await atenderOrden({ id: `tick-${Date.now()}`, orden: 'tick' });
    const { textoDelResultado } = require(path.join(RAIZ, 'server/ejecucion/ordenes.js'));
    comprobar('corre lo que toca y lo cuenta en la consola', r.codigo === 0 && r.corridas.length === 1 && /1 scheduled process ran/.test(textoDelResultado(r)), textoDelResultado(r));
    const ordenes = require(path.join(RAIZ, 'server/ejecucion/ordenes.js'));
    comprobar('`AmoxSQL.exe tick` se reconoce como orden', ordenes.leerArgumentos(['AmoxSQL.exe', 'tick'], { desde: 1 })?.orden === 'tick');

    console.log('\ndesde la interfaz');
    let v = await post('/api/programaciones/vista-previa', { regla: { tipo: 'mensual', hora: '07:00', modo: 'primer_habil' } });
    comprobar('vista previa: la frase y las próximas cinco', /first business day/.test(v.descripcion || '') && v.proximas?.length === 5, JSON.stringify(v));
    v = await post('/api/programaciones/vista-previa', { regla: { tipo: 'semanal', hora: '07:00' } });
    comprobar('una regla a medias dice qué falta', /day of the week/.test(v.error || ''), JSON.stringify(v));
    await post('/api/project/open', { path: PR });
    let c = await post('/api/programaciones', { proceso: 'cierre.sqlchain', regla: { tipo: 'diaria', hora: '06:00' }, parametros: { dia: 'ayer' } });
    comprobar('un parámetro que no es de su tipo no se guarda', c.status === 400 && /YYYY-MM-DD/.test(c.error || ''), JSON.stringify(c));
    c = await post('/api/programaciones', { proceso: 'cierre.sqlchain', regla: { tipo: 'diaria', hora: '06:00' }, parametros: { dia: 'hoy' }, avisar: 'fallo' });
    const lista = await get('/api/programaciones?proceso=cierre.sqlchain');
    comprobar('la lista del proceso, con su frase', lista.programaciones?.length === 2 && lista.programaciones.some(p => p.descripcion === 'Every day, at 06:00'), JSON.stringify(lista).slice(0, 300));
    const w = await post('/api/workspaces', { nombre: 'Cierre' });
    await put('/api/project/workspace', { workspaceId: w.id });
    const enero = (await post('/api/programaciones/vista-previa', { regla: { tipo: 'mensual', hora: '07:00', modo: 'primer_habil' } })).proximas.find(d => new Date(d).getMonth() === 0);
    await put('/api/calendario', { workspaceId: w.id, calendario: { laborables: [1, 2, 3, 4, 5], festivos: [`${new Date(enero).getFullYear()}-01-0${new Date(enero).getDate()}`] } });
    const enero2 = (await post('/api/programaciones/vista-previa', { regla: { tipo: 'mensual', hora: '07:00', modo: 'primer_habil' } })).proximas.find(d => new Date(d).getMonth() === 0);
    comprobar('el calendario del workspace: un festivo mueve el primer día hábil', enero2 && new Date(enero2) > new Date(enero), `${enero} -> ${enero2}`);
    const exp = await get(`/api/workspaces/${w.id}/exportar`);
    comprobar('y viaja en el .amoxworkspace', 'calendario.json' in (exp.contexto || {}), Object.keys(exp.contexto || {}).join(', '));
    proximas.length = 0;
    await put('/api/programaciones/sistema', { activo: true });
    await new Promise(r2 => setTimeout(r2, 200));
    comprobar('activar la tarea del sistema le da la próxima hora al proceso principal', proximas.some(x => x.activo && x.p), JSON.stringify(proximas));

    console.log('\nla tarea del sistema (schtasks simulado)');
    const tarea = require(path.join(RAIZ, 'electron/programador.js'));
    const llamadas = [];
    tarea._probar.cambiarEjecutor(async (args) => { llamadas.push(args); return { ok: true, salida: '' }; });
    tarea._probar.cambiarComando(() => ({ exe: 'C:\\Program Files\\AmoxSQL\\AmoxSQL.exe', args: 'tick' }));
    const xml = tarea.xmlDeTarea('2026-10-06T13:00:00.000Z', { exe: 'C:\\Program Files\\AmoxSQL\\AmoxSQL.exe', args: 'tick' });
    comprobar('el XML: sin contraseña, con la sesión del usuario, y al encenderse si se perdió', /<LogonType>InteractiveToken<\/LogonType>/.test(xml) && /<StartWhenAvailable>true/.test(xml) && /<RunLevel>LeastPrivilege/.test(xml) && /<Arguments>tick<\/Arguments>/.test(xml));
    comprobar('la hora va en local y sin zona', new RegExp(`<StartBoundary>${tarea.horaLocal('2026-10-06T13:00:00.000Z')}</StartBoundary>`).test(xml) && !/Z<\/StartBoundary>/.test(xml));
    if (process.platform === 'win32') {
        await tarea.aplicar('2026-10-06T13:00:00.000Z', true);
        comprobar('encendida: la escribe', llamadas.at(-1)?.[0] === '/Create' && llamadas.at(-1).includes(tarea.NOMBRE_TAREA), JSON.stringify(llamadas.at(-1)));
        const n = llamadas.length;
        await tarea.aplicar('2026-10-06T13:00:00.000Z', true);
        comprobar('la misma hora otra vez: no toca nada', llamadas.length === n);
        await tarea.aplicar('2026-10-06T13:00:00.000Z', false);
        comprobar('apagada: la borra', llamadas.at(-1)?.[0] === '/Delete');
    }
    await baseCentral.cerrar();
} catch (x) {
    fallos++;
    console.log('  FALLA inesperado:', x.stack || x.message);
}

console.log(`\n${pasadas} pasadas, ${fallos} fallos`);
process.exit(fallos ? 1 : 0);
