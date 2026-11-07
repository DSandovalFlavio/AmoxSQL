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

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
