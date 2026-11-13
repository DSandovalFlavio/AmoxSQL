// @suite rapida: no carga el motor; corre en cada PR (pnpm test:rapidas).
/**
 * Deep Dive: lo que se puede comprobar sin un modelo (plan UX, entrega 1).
 *
 *     node scripts/probarDeepDive.mjs
 *
 * - Los pasos se llaman por su nombre en todos los turnos, no `s2` (H8).
 * - `final_answer` no marca como hecho un paso que nunca empezó (H7).
 *
 * La parte visual (la pregunta del analista encima de la caja, la pestaña con el
 * nombre de la sesión, el aviso de «espera tu respuesta») se revisó en la app con
 * sesiones sembradas; su método está en docs/dev/plan_ux_deep_dive.md.
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { buildStepGroups, planSteps, stepTitle, buildSessionArtifacts } =
    await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/deepDiveTurns.js')).href);

let bien = 0, mal = 0;
const ok = (cond, msg) => { if (cond) { bien++; console.log(`  ok  ${msg}`); } else { mal++; console.log(`  MAL ${msg}`); } };

// ── Un plan creado en el primer turno y ejecutado en el segundo ──
const plan = { toolName: 'create_plan', args: { goal: 'g', steps: [{ id: 's1', description: 'Medir por categoría' }, { id: 's2', description: 'Ver los meses' }] } };
const t1 = { messages: [{ role: 'assistant', content: 'x', toolCalls: [plan, { toolName: 'update_plan', args: { step_id: 's1', status: 'in_progress' } }, { toolName: 'execute_sql', args: { query: 'select 1' }, result: { rowCount: 1 } }] }] };
const t2 = { messages: [{ role: 'assistant', content: 'y', toolCalls: [{ toolName: 'update_plan', args: { step_id: 's2', status: 'in_progress' } }, { toolName: 'execute_sql', args: { query: 'select 2' }, result: { rowCount: 1 } }] }] };
const todos = [...t1.messages, ...t2.messages];

console.log('— nombres de los pasos');
const pasos = planSteps(todos);
ok(pasos.s2?.descripcion === 'Ver los meses' && pasos.s2?.numero === 2, 'el plan de toda la conversación da nombre y número');
const sinPlan = buildStepGroups(t2);
ok(sinPlan[0]?.label === 'Step 2', 'sin el plan, un paso se llama «Step 2», nunca «s2»');
const conPlan = buildStepGroups(t2, pasos);
ok(conPlan[0]?.label === 'Ver los meses' && conPlan[0]?.numero === 2, 'en el segundo turno el paso lleva su nombre');
ok(buildStepGroups(t1, pasos).some(s => s.label === 'Medir por categoría'), 'en el primer turno también');
ok(stepTitle('paso-raro', {}) === 'paso-raro', 'un id que no es sN se muestra tal cual');
ok(buildSessionArtifacts(todos).some(a => a.type === 'step' && a.label === 'Step: Ver los meses'), 'las menciones con @ usan el nombre del paso');

console.log('— final_answer y los pasos sin empezar');
const { createTools } = require(path.join(RAIZ, 'server/ai/tools.js'));
const activePlan = { id: null, steps: [{ id: 's1', status: 'done' }, { id: 's2', status: 'in_progress' }, { id: 's3', status: 'pending' }] };
let herramientas = null;
try {
    herramientas = createTools({ dbManager: {}, mode: 'diving', activePlan, aiPersistence: null, queryResults: new Map(), conversationId: null });
} catch (e) { console.log(`  (no se pudieron crear las herramientas: ${e.message})`); }
if (herramientas?.final_answer) {
    await herramientas.final_answer.execute({ tldr: 'x', findings: [{ point: 'p' }] }, {});
    ok(activePlan.steps[1].status === 'done', 'el paso en curso al concluir queda hecho');
    ok(activePlan.steps[2].status === 'not_done', 'el paso que nunca empezó queda «no hecho», no hecho');
} else {
    mal++; console.log('  MAL no se encontró final_answer en las herramientas de diving');
}

// ── El informe (entrega 2) ──
const { armarInforme, eventosDeTurno, seccionDeConsulta } =
    await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/informeDeepDive.js')).href);
const { groupIntoTurns } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/deepDiveTurns.js')).href);

console.log('— el informe: una ejecución real es UN mensaje con textOffset');
const partes = [];
let texto = '';
const tools = [];
const decir = (t) => { texto += t; };
const llamar = (tc) => { tools.push({ ...tc, textOffset: texto.length }); };
decir('<think>plan first</think>Voy a medir por categoría. ');
llamar({ toolName: 'create_plan', args: { goal: 'g', steps: [{ id: 's1', description: 'Por categoría' }, { id: 's2', description: 'Por mes' }, { id: 's3', description: 'Por ciudad' }] } });
llamar({ toolName: 'update_plan', args: { step_id: 's1', status: 'in_progress' } });
llamar({ toolName: 'execute_sql', args: { query: 'q1' }, result: { queryId: 'qa', rowCount: 8 } });
llamar({ toolName: 'display_chart', args: {}, result: { chartConfig: { title: 'Cat', queryId: 'qa' } } });
decir('Todas quedan igual. ');
llamar({ toolName: 'update_plan', args: { step_id: 's1', status: 'done', note: 'Pareja' } });
llamar({ toolName: 'update_plan', args: { step_id: 's2', status: 'in_progress' } });
decir('<think>months</think>Mes a mes cae en octubre. ');
llamar({ toolName: 'execute_sql', args: { query: 'q2' }, result: { queryId: 'qb', rowCount: 12 } });
llamar({ toolName: 'update_plan', args: { step_id: 's2', status: 'done' } });
decir('En resumen: faltan datos. ');
llamar({ toolName: 'final_answer', args: {}, result: { tldr: 'Faltan datos', findings: [{ point: 'p', source_query_id: 'qb' }] } });
const real = [{ id: 'u1', role: 'user', content: '¿Por qué?' }, { id: 'a1', role: 'assistant', content: texto, toolCalls: tools }];
const [ep] = armarInforme(groupIntoTurns(real));
const s1 = ep.secciones.find(s => s.stepId === 's1');
const s2 = ep.secciones.find(s => s.stepId === 's2');
ok(ep.pregunta === '¿Por qué?' && ep.respuesta?.resultado?.tldr === 'Faltan datos', 'una pregunta y su respuesta');
ok(ep.respuesta.prosa === 'En resumen: faltan datos.', 'la narración de cierre es la respuesta, no el último paso');
ok(ep.intro.bloques[0]?.texto.startsWith('Voy a medir'), 'el planteamiento va en la introducción');
ok(s1.bloques.map(b => b.tipo).join(',') === 'consultas,grafico,texto', 'el paso 1 lleva su consulta, su gráfico y su narración, en orden');
ok(s1.nota === 'Pareja' && s1.estado === 'done', 'con su conclusión');
ok(s2.bloques.some(b => b.tipo === 'texto' && b.texto.includes('octubre')) && !s2.bloques.some(b => b.texto?.includes('resumen')), 'el paso 2 lleva su narración y no la del cierre');
ok(s2.razonamiento[0] === 'months' && ep.intro.razonamiento[0] === 'plan first', 'el razonamiento queda en su paso');
ok(ep.indice.map(p => p.estado).join(',') === 'done,done,not_done', 'el paso que no empezó queda «no hecho»');
ok(seccionDeConsulta([ep], 'qb')?.seccion === s2, 'un número de la respuesta lleva a la consulta que lo produjo');

console.log('— sesiones sin textOffset y en curso');
const viejo = [{ id: 'u1', role: 'user', content: 'Q' }, { id: 'a1', role: 'assistant', content: 'Toda la prosa junta.', toolCalls: tools.map(({ textOffset, ...t }) => t) }];
const [epViejo] = armarInforme(groupIntoTurns(viejo));
ok(epViejo.intro.bloques[0]?.texto === 'Toda la prosa junta.' && epViejo.secciones.find(s => s.stepId === 's1')?.bloques.some(b => b.tipo === 'grafico'), 'sin posiciones: la prosa delante y los pasos con sus gráficos');
const vivo = [{ id: 'u1', role: 'user', content: 'Q' }, { id: 'a1', role: 'assistant', content: 'Empiezo. ', toolCalls: tools.slice(0, 3) }];
const turnosVivos = groupIntoTurns(vivo).map(t => (t.type === 'ai' ? { ...t, inProgress: true } : t));
const [epVivo] = armarInforme(turnosVivos, { enCurso: true });
ok(epVivo.enCurso && epVivo.indice[0].estado === 'in_progress' && epVivo.indice[1].estado === 'pending', 'en curso: el paso que corre sigue «in progress»');
const [epParado] = armarInforme(groupIntoTurns(vivo));
ok(epParado.indice[0].estado === 'interrupted', 'detenido sin concluir: el paso a medias dice «interrupted»');

console.log('— continuar no abre otra pregunta; una pregunta nueva sí');
const conCont = [...vivo, { id: 'u2', role: 'user', content: 'Continue the plan where you left off.' },
    { id: 'a2', role: 'assistant', content: 'Sigo.', toolCalls: [{ toolName: 'update_plan', args: { step_id: 's2', status: 'in_progress' } }] },
    { id: 'u3', role: 'user', content: '¿Y por ciudad?' }, { id: 'a3', role: 'assistant', content: 'Por ciudad gana SF.' }];
const eps = armarInforme(groupIntoTurns(conCont));
ok(eps.length === 2 && eps[0].continuaciones.length === 1, '«Continue» se une al análisis; la pregunta nueva abre otro');
ok(eps[1].secciones.length === 1 && eps[1].secciones[0].titulo === null && eps[1].secciones[0].bloques[0].texto === 'Por ciudad gana SF.', 'una respuesta sin plan es texto sin encabezado');
ok(eventosDeTurno(groupIntoTurns(real)[1]).filter(e => e.tipo === 'texto').length === 4, 'el texto se parte en los puntos donde hubo herramientas');

console.log('— una ejecución cortada (F9): lo hecho queda y se dice por qué');
const { textoDeInterrupcion } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/informeDeepDive.js')).href);
const corte = { motivo: 'cuota', diaria: false, segundos: 31, proveedor: 'gemini' };
const cortada = [{ id: 'u1', role: 'user', content: 'EDA' }, { id: 'a1', role: 'assistant', content: texto.slice(0, tools[6].textOffset),
    toolCalls: [...tools.slice(0, 7), { toolName: 'amox_interrupcion', args: {}, result: corte, textOffset: tools[6].textOffset }] }];
const [epCortado] = armarInforme(groupIntoTurns(cortada));
ok(epCortado.interrupcion?.motivo === 'cuota' && !epCortado.respuesta, 'el episodio sabe que se cortó por la cuota');
ok(epCortado.secciones.find(s => s.stepId === 's1')?.bloques.some(b => b.tipo === 'grafico'), 'lo hecho antes del corte sigue, con su gráfico');
ok(epCortado.indice.map(p => p.estado).join(',') === 'done,interrupted,pending', 'el paso a medias dice «interrupted»; los demás, pendientes');
ok(!epCortado.secciones.some(s => s.herramientas.some(tc => tc.toolName === 'amox_interrupcion')), 'la marca no aparece como trabajo del analista');
const seguida = [...cortada, { id: 'u2', role: 'user', content: 'Continue the plan where you left off.' },
    { id: 'a2', role: 'assistant', content: 'Sigo.', toolCalls: [{ toolName: 'update_plan', args: { step_id: 's2', status: 'done' } }] }];
const [epSeguido] = armarInforme(groupIntoTurns(seguida));
const tu = [epSeguido.intro, ...epSeguido.secciones].flatMap(s => s.bloques).find(b => b.tipo === 'usuario');
ok(!epSeguido.interrupcion && tu?.tras?.motivo === 'cuota', 'al continuar, el corte queda como historia y deja de pedir decisión');
ok(textoDeInterrupcion({ motivo: 'cuota', diaria: true, proveedor: 'gemini' }).titulo === "Gemini's daily quota ran out.", 'en palabras: la cuota diaria de Gemini');
ok(textoDeInterrupcion({ motivo: 'detenido' }).titulo === 'You stopped the analysis.', 'en palabras: lo detuviste tú');

console.log('— el error real de Gemini se lee');
const { leerLimite, sePuedeEsperar } = require(path.join(RAIZ, 'server/ai/errores.js'));
const gem = leerLimite({ message: 'Failed after 3 attempts. Last error: You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 5, model: gemini-3.6-flash, description: Generate content requests per minute limit exceeded on Free Tier. Please retry in 31.298743296s.' });
ok(gem.esLimite && !gem.diaria && gem.segundos === 32 && sePuedeEsperar(gem), 'el de la captura: por minuto, 32 s, se espera');
const ant = leerLimite({ message: 'Overloaded', statusCode: 529, responseHeaders: { 'retry-after': '12' } });
ok(ant.esLimite && ant.segundos === 12, 'un 529 con retry-after en la cabecera');
ok(!leerLimite(new Error('no such table: ventas')).esLimite, 'un error de SQL no es una cuota');

console.log('— el inicio propone preguntas del proyecto (F5)');
const { preguntasSugeridas } = require(path.join(RAIZ, 'server/ai/preguntasSugeridas.js'));
const colsTienda = [['ventas', 'fecha', 'DATE'], ['ventas', 'producto', 'VARCHAR'], ['ventas', 'categoria', 'VARCHAR'], ['ventas', 'importe', 'DECIMAL(12,2)'], ['ventas', 'direccion', 'VARCHAR'], ['metas_2024', 'meta', 'BIGINT']]
    .map(([tabla, columna, tipo]) => ({ tabla, columna, tipo }));
const tienda = preguntasSugeridas({ metricas: [{ name: 'venta_total', sql: 'SUM(importe)', description: 'Venta en dinero, sin impuestos.' }], glosario: '- **Meta**: lo que Finanzas espera vender', columnas: colsTienda });
ok(tienda.idioma === 'es' && tienda.preguntas.length === 4, 'cuatro preguntas, en el idioma del proyecto');
ok(tienda.preguntas[0].texto === '¿Cómo evoluciona «venta total» mes a mes?' && tienda.preguntas[0].origen.includes('metrics.yml'), 'la primera sale de la métrica y lo dice');
ok(tienda.preguntas.some(p => p.texto.includes('«categoria»')) && !tienda.preguntas.some(p => /direccion/.test(p.texto)), 'una categoría antes que un producto; nunca una dirección');
ok(tienda.preguntas.some(p => p.texto.includes('contra la meta')), 'con una meta en el proyecto, comparar contra ella');
const ingles = preguntasSugeridas({ columnas: [{ tabla: 'orders', columna: 'order_date', tipo: 'DATE' }, { tabla: 'orders', columna: 'amount', tipo: 'DOUBLE' }, { tabla: 'orders', columna: 'region', tipo: 'VARCHAR' }] });
ok(ingles.idioma === 'en' && ingles.preguntas[0].texto === 'How does "amount" change month by month?', 'sin métricas: desde las columnas, en inglés');
ok(preguntasSugeridas({}).preguntas.length === 0, 'sin nada que mirar, ninguna pregunta inventada');

console.log('— un análisis se vuelve deck de Report Flow (F8)');
const { deckDeInforme, slugDe } = await import(pathToFileURL(path.join(RAIZ, 'client/src/components/ai/deckDeInforme.js')).href);
const { parseDeck } = await import(pathToFileURL(path.join(RAIZ, 'client/src/utils/deckParser.js')).href).catch(() => ({}));
const epDeck = { ...ep, respuesta: { resultado: { tldr: 'Faltan datos', findings: [{ point: 'Meses completos', value: '90,4 %', so_what: 'La brecha real es chica' }], suggested_actions: ['Revisar la carga: "15 de octubre"'], caveats: ['Octubre tiene 15 días'] }, prosa: '' } };
const s1Deck = epDeck.secciones.find(s => s.stepId === 's1');
const iGraf = s1Deck.bloques.findIndex(b => b.tipo === 'grafico');
const md = deckDeInforme(epDeck, { titulo: 'Meta 2024', fecha: '7 nov 2026', graficos: new Map([[`${s1Deck.key}-g${iGraf}`, 'charts/deep-dive/meta-1.amoxvis']]) });
ok(md.startsWith('---\ntitle: "Meta 2024"') && md.includes('<!-- layout: cover -->\n# ¿Por qué?'), 'portada con la pregunta y título en el front matter');
ok(md.includes('<!-- layout: summary -->\n## Faltan datos') && md.includes('- **Meses completos** — 90,4 %. La brecha real es chica'), 'resumen con los hallazgos y su valor');
ok(md.includes('<!-- layout: finding -->\n## Pareja') && md.includes('src: "charts/deep-dive/meta-1.amoxvis"'), 'un hallazgo por gráfico: la conclusión del paso como título y su .amoxvis');
ok(md.includes('- action: "Revisar la carga: \\"15 de octubre\\""'), 'las acciones con comillas y dos puntos no rompen el YAML');
ok(md.includes('## Caveats') && md.split('\n---\n').length >= 5, 'salvedades al final');
if (parseDeck) {
    const d = parseDeck(md);
    ok(d.slides?.length >= 5 && d.slides[0].layout === 'cover' && d.slides.some(s => s.layout === 'finding'), `el lector de Report Flow lo abre (${d.slides?.length} láminas)`);
}
ok(slugDe('¿Por qué no llegamos a la meta 2024?') === 'por-que-no-llegamos-a-la-meta-2024', 'nombre de archivo sin acentos ni signos');

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
