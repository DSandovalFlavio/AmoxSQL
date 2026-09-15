/**
 * Ejercita `utils/conflictoArchivo.js` — qué hacer cuando un archivo cambia por
 * fuera.
 *
 *     node scripts/probarConflictoArchivo.mjs
 *
 * **Es la tabla de verdad de la única decisión que, al fallar, no da un error:
 * pisa el trabajo de alguien y se calla.** El vigilante, el flujo de eventos y
 * los diálogos se comprueban con la aplicación delante; esto no puede esperar a
 * que se dé el caso.
 *
 * Las dos que hay que mirar primero:
 *
 * - **Sucio + cambió fuera → preguntar.** Nunca recargar. Ésta es la que evita
 *   el daño.
 * - **Misma firma → ignorar.** Sin ella la aplicación se avisaría a sí misma de
 *   cada guardado, y un aviso que sale siempre deja de leerse — con lo cual la
 *   anterior también dejaría de servir.
 */
import {
    decidirAviso, decidirGuardado, mismaRuta, ACCIONES,
} from '../client/src/utils/conflictoArchivo.js';

let ok = 0, mal = 0;
const eq = (nombre, a, b) => {
    const pasa = JSON.stringify(a) === JSON.stringify(b);
    if (pasa) { ok++; } else { mal++; console.log(`  FALLA  ${nombre}\n    esperado: ${JSON.stringify(b)}\n    obtenido: ${JSON.stringify(a)}`); }
};

const { IGNORAR, RECARGAR, PREGUNTAR, DESAPARECIDO } = ACCIONES;
const limpia = { path: 'queries/ventas.sql', dirty: false, firma: 'h:aaaa' };
const sucia = { path: 'queries/ventas.sql', dirty: true, firma: 'h:aaaa' };
const cambio = (firma) => ({ ruta: 'queries/ventas.sql', firma, tipo: 'cambio' });

// ── la tabla de verdad ──────────────────────────────────────────────────────
eq('limpia + misma firma -> ignorar', decidirAviso(limpia, cambio('h:aaaa')), IGNORAR);
eq('limpia + otra firma -> recargar', decidirAviso(limpia, cambio('h:bbbb')), RECARGAR);
eq('SUCIA + misma firma -> ignorar', decidirAviso(sucia, cambio('h:aaaa')), IGNORAR);
// **La que evita el daño.**
eq('SUCIA + otra firma -> PREGUNTAR', decidirAviso(sucia, cambio('h:bbbb')), PREGUNTAR);
eq('sucia jamas se recarga sola', decidirAviso(sucia, cambio('h:bbbb')) === RECARGAR, false);

// ── el archivo desaparece ───────────────────────────────────────────────────
// Nunca se cierra la pestaña sola: si habia cambios, lo unico que queda de ese
// archivo esta dentro de ella.
eq('baja estando limpia', decidirAviso(limpia, { ruta: 'queries/ventas.sql', firma: null, tipo: 'baja' }), DESAPARECIDO);
eq('baja estando sucia', decidirAviso(sucia, { ruta: 'queries/ventas.sql', firma: null, tipo: 'baja' }), DESAPARECIDO);
eq('firma nula sin decir "baja" tambien es desaparecido',
    decidirAviso(limpia, { ruta: 'queries/ventas.sql', firma: null, tipo: 'cambio' }), DESAPARECIDO);

// ── otro archivo ────────────────────────────────────────────────────────────
eq('otro archivo no me toca', decidirAviso(limpia, { ruta: 'queries/otra.sql', firma: 'h:zzz', tipo: 'cambio' }), IGNORAR);
eq('ni aunque yo este sucia', decidirAviso(sucia, { ruta: 'otra.sql', firma: 'h:zzz', tipo: 'cambio' }), IGNORAR);
// Un nombre que TERMINA igual no es el mismo archivo.
eq('mis_ventas.sql no es ventas.sql',
    decidirAviso(limpia, { ruta: 'queries/mis_ventas.sql', firma: 'h:zzz', tipo: 'cambio' }), IGNORAR);

// ── un borrador sin titulo ──────────────────────────────────────────────────
// No tiene nada en el disco, asi que nada de fuera puede cambiarlo.
eq('borrador sin ruta', decidirAviso({ path: '', dirty: true, firma: null }, cambio('h:bbbb')), IGNORAR);

// ── una pestaña sin firma ───────────────────────────────────────────────────
// Abierta antes de que esto existiera: no hay con que comparar, asi que manda
// el trabajo sin guardar. Ante la duda se pregunta — recargar por si acaso es
// la unica salida que destruye algo.
eq('sin firma y limpia -> recargar', decidirAviso({ path: 'queries/ventas.sql', dirty: false }, cambio('h:bbbb')), RECARGAR);
eq('sin firma y SUCIA -> PREGUNTAR', decidirAviso({ path: 'queries/ventas.sql', dirty: true }, cambio('h:bbbb')), PREGUNTAR);

// ── entradas rotas ──────────────────────────────────────────────────────────
eq('sin pestaña', decidirAviso(null, cambio('h:bbbb')), IGNORAR);
eq('sin aviso', decidirAviso(limpia, null), IGNORAR);
eq('los dos nulos', decidirAviso(null, null), IGNORAR);

// ── las rutas, que llegan de dos sitios distintos ───────────────────────────
eq('identicas', mismaRuta('a/b.sql', 'a/b.sql'), true);
eq('barras distintas', mismaRuta('a\\b.sql', 'a/b.sql'), true);
eq('mayusculas', mismaRuta('A/B.SQL', 'a/b.sql'), true);
eq('el "./" del principio', mismaRuta('./a/b.sql', 'a/b.sql'), true);
// El vigilante habla relativo a la raiz; una pestaña puede llevar la absoluta.
eq('absoluta contra relativa', mismaRuta('C:/proy/queries/v.sql', 'queries/v.sql'), true);
eq('pero solo en frontera de carpeta', mismaRuta('C:/proy/misqueries/v.sql', 'queries/v.sql'), false);
eq('sufijo del nombre no vale', mismaRuta('a/mis_ventas.sql', 'a/ventas.sql'), false);
eq('vacias', mismaRuta('', 'a.sql'), false);
eq('nulas', mismaRuta(null, null), false);
eq('distintas', mismaRuta('a/b.sql', 'a/c.sql'), false);

// ── al guardar ──────────────────────────────────────────────────────────────
// Aqui no hay «recargar en silencio»: el usuario ha pulsado Guardar y tiene algo
// que escribir. O se pregunta, o no habia conflicto.
eq('sin conflicto', decidirGuardado({ conflicto: false }), IGNORAR);
eq('con conflicto', decidirGuardado({ conflicto: true, firmaServidor: 'h:bbbb', firmaPestana: 'h:aaaa' }), PREGUNTAR);
eq('conflicto con la misma firma no es conflicto',
    decidirGuardado({ conflicto: true, firmaServidor: 'h:aaaa', firmaPestana: 'h:aaaa' }), IGNORAR);
eq('conflicto sin firmas -> preguntar', decidirGuardado({ conflicto: true }), PREGUNTAR);
eq('nunca recarga al guardar',
    [decidirGuardado({ conflicto: true }), decidirGuardado({ conflicto: true, firmaServidor: 'x' })].includes(RECARGAR), false);

console.log(`\n${ok} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
