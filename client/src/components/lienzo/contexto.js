/**
 * El contexto del Canvas: las acciones y el tema, compartidos por todas las
 * tarjetas. Vive en su propio módulo para que recargar `Tarjetas.jsx` en caliente
 * (desarrollo) no cree un contexto nuevo que el editor no provee.
 */
import { createContext } from 'react';

export const LienzoCtx = createContext(null);
