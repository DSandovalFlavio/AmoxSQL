import { LuSettings } from 'react-icons/lu';
import { emitir } from '../../eventos.js';

/**
 * Cuando no hay modelo con el que preguntar (6.0, M10 · T17).
 *
 * Antes la respuesta era «Please select or enter a model name.»: no decía que
 * no había ningún proveedor listo ni dónde arreglarlo. Ahora lo dice y lleva a
 * Settings › AI. `useAiChat` deja este texto en `errorMsg`; los paneles lo
 * reconocen con `esSinModelo` para poner el botón.
 */
export const TEXTO_SIN_MODELO = 'No AI model is ready. Pick a provider and a model in Settings › AI (a local one with Ollama, or a cloud one with your key).';

export const esSinModelo = (msg) => msg === TEXTO_SIN_MODELO;

export function BotonAjustesIA() {
    return (
        <button type="button" className="btn-secundario btn--peq" onClick={() => emitir('amox_abrir_ajustes', 'ai')}>
            <LuSettings size={12} /> Open Settings › AI
        </button>
    );
}

/** El aviso entero, para la pantalla de inicio de Deep Dive (antes de preguntar). */
export default function SinModelo() {
    return (
        <div className="ai-sin-modelo fila" role="status">
            <span>{TEXTO_SIN_MODELO}</span>
            <BotonAjustesIA />
        </div>
    );
}
