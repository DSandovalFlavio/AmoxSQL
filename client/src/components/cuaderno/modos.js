/**
 * Los tres estados del mando de la celda.
 *
 * Vive aparte de `Celda.jsx` porque un archivo que exporta un componente **y**
 * una constante rompe la recarga en caliente: React deja de saber si lo que
 * cambió es pintable o no, y recarga la página entera.
 */
export const MODOS = { AMBOS: 'ambos', CODIGO: 'codigo', RESULTADO: 'resultado' };
