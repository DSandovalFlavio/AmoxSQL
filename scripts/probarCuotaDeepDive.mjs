/**
 * Deep Dive y una cuota agotada (plan UX, F9), con el bucle REAL del servidor.
 *
 *     node scripts/probarCuotaDeepDive.mjs
 *
 * Un modelo falso rechaza la primera solicitud como lo hace Gemini en la capa
 * gratuita (429, «Please retry in 1s») y contesta la segunda. El bucle debe
 * esperar, avisar y repetir el paso en vez de fallar. Con una cuota diaria no
 * debe esperar: devuelve el error con lo necesario para que el cliente lo diga.
 *
 * Casa temporal: no toca ~/.amoxsql.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CASA = fs.mkdtempSync(path.join(os.tmpdir(), 'amox-cuota-'));
process.env.AMOXSQL_HOME = CASA;
const require = createRequire(import.meta.url);

const { MockLanguageModelV3 } = require(path.join(RAIZ, 'node_modules/ai/dist/test/index.js'));
const { APICallError } = require(path.join(RAIZ, 'node_modules/ai'));
const agenticLoop = require(path.join(RAIZ, 'server/ai/agenticLoop.js'));
const loop = agenticLoop.agenticLoop || agenticLoop;

let bien = 0, mal = 0;
const ok = (c, m) => { if (c) { bien++; console.log(`  ok  ${m}`); } else { mal++; console.log(`  MAL ${m}`); } };

const error429 = (texto) => new APICallError({
    message: texto, url: 'https://example.invalid', requestBodyValues: {}, statusCode: 429,
    responseBody: JSON.stringify({ error: { code: 429, message: texto, status: 'RESOURCE_EXHAUSTED' } }),
    isRetryable: false,
});
const respuesta = (texto) => ({
    stream: new ReadableStream({
        start(c) {
            c.enqueue({ type: 'stream-start', warnings: [] });
            c.enqueue({ type: 'text-start', id: 't' });
            c.enqueue({ type: 'text-delta', id: 't', delta: texto });
            c.enqueue({ type: 'text-end', id: 't' });
            c.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } });
            c.close();
        },
    }),
});

async function correr(modelo, { abortSignal } = {}) {
    const eventos = [];
    const t0 = Date.now();
    for await (const ev of loop({
        messages: [{ role: 'user', content: 'Hola' }],
        dbManager: {}, providerOverride: 'gemini', modelOverride: 'gemini-3.6-flash',
        mode: 'diving', memoriasRetenidas: true, maxIterations: 2, abortSignal,
    }, () => modelo)) {
        eventos.push(ev);
        if (ev.type === 'text-delta' || ev.type === 'error') break;
    }
    return { eventos, ms: Date.now() - t0 };
}

console.log('— un límite por minuto se espera y el paso se repite');
let llamadas = 0;
const porMinuto = new MockLanguageModelV3({
    doStream: async () => {
        llamadas++;
        if (llamadas === 1) throw error429('You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 5, Generate content requests per minute limit exceeded on Free Tier. Please retry in 1.2s.');
        return respuesta('Listo.');
    },
});
const r1 = await correr(porMinuto);
const espera = r1.eventos.find(e => e.type === 'esperando-cuota');
ok(espera && espera.segundos === 3, `avisa que espera (${espera?.segundos} s: los 2 que pide, redondeados, y 1 de margen)`);
ok(r1.eventos.some(e => e.type === 'cuota-reanudada'), 'avisa al reanudar');
ok(r1.eventos.some(e => e.type === 'text-delta' && e.text.includes('Listo')), 'repite el paso y sigue');
ok(!r1.eventos.some(e => e.type === 'error'), 'no termina en error');
ok(llamadas === 2 && r1.ms >= 2500, `esperó de verdad (${r1.ms} ms, ${llamadas} solicitudes)`);

console.log('— una cuota diaria no se espera');
const diaria = new MockLanguageModelV3({
    doStream: async () => { throw error429('Quota exceeded for metric: generate_content_free_tier_requests per day, limit: 250. Please retry in 5s.'); },
});
const r2 = await correr(diaria);
const err = r2.eventos.find(e => e.type === 'error');
ok(!r2.eventos.some(e => e.type === 'esperando-cuota'), 'no espera');
ok(err?.limite?.diaria === true, 'el error dice que es una cuota diaria, para que el cliente lo explique');

console.log('— Stop corta la espera');
const siempre = new MockLanguageModelV3({ doStream: async () => { throw error429('Requests per minute limit exceeded. Please retry in 30s.'); } });
const corte = new AbortController();
setTimeout(() => corte.abort(), 600);
const r3 = await correr(siempre, { abortSignal: corte.signal });
ok(r3.ms < 5000, `no se queda esperando los 30 s (${r3.ms} ms)`);

console.log('— un error que no es de cuota sigue siendo un error');
const roto = new MockLanguageModelV3({ doStream: async () => { throw new APICallError({ message: 'Invalid API key', url: 'x', requestBodyValues: {}, statusCode: 401, isRetryable: false }); } });
const r4 = await correr(roto);
const e4 = r4.eventos.find(e => e.type === 'error');
ok(e4 && e4.limite === null && !r4.eventos.some(e => e.type === 'esperando-cuota'), 'sin espera y sin marca de cuota');

fs.rmSync(CASA, { recursive: true, force: true });
console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
