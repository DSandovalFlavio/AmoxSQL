/**
 * Precarga de las suites rápidas: el motor no se puede cargar.
 *
 *     node --import ./scripts/lib/sinMotor.mjs scripts/probarAlgo.mjs
 *
 * `correrSuites.mjs --rapidas` corre así las suites marcadas `@suite rapida`, de modo
 * que una marca equivocada falla en voz alta en vez de colar una suite lenta (o que
 * necesita el binario nativo) en la tanda que corre en cada PR.
 */
import module from 'node:module';

const PROHIBIDO = /^@duckdb\//;
const aviso = (spec) => new Error(`Suite rápida que carga el motor (${spec}): quítale la marca «@suite rapida».`);

if (typeof module.registerHooks === 'function') {
    // Node 22.15+: un mismo gancho para import y require.
    module.registerHooks({
        resolve(spec, contexto, siguiente) {
            if (PROHIBIDO.test(spec)) throw aviso(spec);
            return siguiente(spec, contexto);
        },
    });
} else {
    // Node más viejo: al menos require (createRequire es lo que usan las suites).
    const cargar = module._load;
    module._load = function (spec, ...resto) {
        if (PROHIBIDO.test(spec)) throw aviso(spec);
        return cargar.call(this, spec, ...resto);
    };
}
