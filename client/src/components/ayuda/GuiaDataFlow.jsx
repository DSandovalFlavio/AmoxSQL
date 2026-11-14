/**
 * Help › La guía de Data Flow y volver a ver su recorrido.
 * Vivía en Settings; desde la 6.0 (M8) es una sección del diálogo Help
 * (Ayuda.jsx), que la carga al abrirla.
 */
import { LuGitBranch } from 'react-icons/lu';
import { DataFlowGuide } from '../chains/DataFlowGuide';
import { emitir } from '../../eventos.js';

export default function GuiaDataFlow() {
    return (
        <div className="stg-section">
            <DataFlowGuide />
            <div style={{ marginTop: '18px' }}>
                <button
                    onClick={() => { try { localStorage.removeItem('amoxsql-dataflow-tour-seen'); } catch (e) {} emitir('amox_replay_dataflow_tour'); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-color-user, #5E6AD2)', color: 'var(--button-text-color, #fff)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                    <LuGitBranch size={14} /> Replay tour
                </button>
                <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Opens the step-by-step tour the next time you open a Data Flow.
                </p>
            </div>
        </div>
    );
}
