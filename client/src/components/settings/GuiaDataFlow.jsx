/**
 * Settings › La guía de Data Flow y volver a ver su recorrido.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { LuGitBranch } from 'react-icons/lu';
import { DataFlowGuide } from '../chains/DataFlowGuide';

export default function GuiaDataFlow() {
    return (
        <div className="stg-section">
            <DataFlowGuide />
            <div style={{ marginTop: '18px' }}>
                <button
                    onClick={() => { try { localStorage.removeItem('amoxsql-dataflow-tour-seen'); } catch (e) {} window.dispatchEvent(new CustomEvent('amox_replay_dataflow_tour')); }}
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
