/**
 * Help › La guía de Story Flow y volver a ver su recorrido.
 * Vivía en Settings; desde la 6.0 (M8) es una sección del diálogo Help
 * (Ayuda.jsx), que la carga al abrirla.
 */
import { LuSparkles, LuLayoutGrid } from 'react-icons/lu';
import { StoryFlowGuide } from '../DataVisualizer/StoryFlowGuide';
import { emitir } from '../../eventos.js';

export default function GuiaStoryFlow() {
    return (
        <div className="stg-section">
            <StoryFlowGuide />
            <div style={{ marginTop: '18px' }}>
                <button
                    onClick={() => { try { localStorage.removeItem('amoxsql-storyflow-tour-seen'); } catch (e) {} emitir('amox_replay_storyflow_tour'); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-color-user, #5E6AD2)', color: 'var(--button-text-color, #fff)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                    <LuSparkles size={14} /> Replay tour
                </button>
                <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Opens the step-by-step tour the next time you open a chart.
                </p>
            </div>
            {/* 6.0.1: la galería vivía en la barra lateral; se usa poco, así que vive aquí
                (y en Ctrl+K › Open Chart Gallery). */}
            <div className="stg-section-mt">
                <button className="btn-secundario" onClick={() => emitir('amox_abrir_galeria')}>
                    <LuLayoutGrid size={14} /> Open the chart gallery
                </button>
                <p className="texto-tenue stg-nota-ayuda">Ready-made charts of every type, to open and adapt to your data.</p>
            </div>
        </div>
    );
}
