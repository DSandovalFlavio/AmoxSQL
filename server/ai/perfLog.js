/**
 * AmoxSQL AI — Ollama performance instrumentation (F0 del plan de performance local).
 *
 * Un log line legible por request local, construido desde los metadatos nativos
 * que ai-sdk-ollama expone en providerMetadata.ollama (duraciones en ns) y el
 * usage del AI SDK (inputTokens = prompt_eval_count de Ollama).
 *
 * Cómo leerlo:
 *   - load    → tiempo cargando el modelo a memoria (cold start; ~0 si estaba caliente)
 *   - prefill → tokens del prompt REALMENTE procesados este request. Los tokens
 *               servidos por el KV/prefix cache NO cuentan aquí, así que en el
 *               turno 2+ de una conversación este número debe ser pequeño
 *               (~solo el mensaje nuevo). Si sale ~todo el prompt, el cache se
 *               está rompiendo — ese es el observable clave del plan.
 *   - gen     → tokens generados y su velocidad
 *   - ttft    → tiempo hasta el primer evento del stream (latencia percibida)
 */

'use strict';

/** ns → seconds, tolerant of missing values. */
function ns(v) {
    return typeof v === 'number' ? v / 1e9 : null;
}

/**
 * Logs one perf line for an Ollama-backed request. No-op for cloud providers
 * (they don't carry providerMetadata.ollama).
 *
 * @param {string} tag - Short context tag, e.g. 'stream', 'loop#3', 'compact'
 * @param {object} info
 * @param {string} info.model - Model name
 * @param {object} [info.usage] - AI SDK usage (v6 inputTokens/outputTokens; tolerates legacy names)
 * @param {object} [info.providerMetadata] - providerMetadata from the result/finish part
 * @param {number} [info.ttftMs] - ms until the first stream event, if measured
 */
function logOllamaPerf(tag, { model, usage, providerMetadata, ttftMs } = {}) {
    const meta = providerMetadata?.ollama;
    if (!meta) return;

    const load  = ns(meta.load_duration);
    const evalS = ns(meta.eval_duration);
    const total = ns(meta.total_duration);
    const inTk  = usage?.inputTokens  ?? usage?.promptTokens;
    const outTk = usage?.outputTokens ?? usage?.completionTokens;
    const rate  = evalS && outTk ? `${(outTk / evalS).toFixed(1)}tk/s` : null;

    const parts = [
        `model=${model}`,
        load  != null ? `load=${load.toFixed(2)}s` : null,
        inTk  != null ? `prefill=${inTk}tk` : null,
        outTk != null ? `gen=${outTk}tk${rate ? ' @ ' + rate : ''}` : null,
        ttftMs != null ? `ttft=${(ttftMs / 1000).toFixed(2)}s` : null,
        total != null ? `total=${total.toFixed(2)}s` : null,
    ].filter(Boolean);

    console.log(`[AI Perf${tag ? ' ' + tag : ''}] ${parts.join(' | ')}`);
}

module.exports = { logOllamaPerf };
