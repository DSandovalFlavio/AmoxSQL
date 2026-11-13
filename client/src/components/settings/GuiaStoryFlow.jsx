/**
 * Settings › La guía de Story Flow y volver a ver su recorrido.
 * Sale de SettingsModal (6.0, M8): lo que necesita del modal llega por props y
 * se carga la primera vez que se abre la sección.
 */
import { LuSparkles } from 'react-icons/lu';
import { StoryFlowGuide } from '../DataVisualizer/StoryFlowGuide';

export default function GuiaStoryFlow() {
    return (
        <div className="stg-section">
            <StoryFlowGuide />
            <div style={{ marginTop: '18px' }}>
                <button
                    onClick={() => { try { localStorage.removeItem('amoxsql-storyflow-tour-seen'); } catch (e) {} window.dispatchEvent(new CustomEvent('amox_replay_storyflow_tour')); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--accent-color-user, #5E6AD2)', color: 'var(--button-text-color, #fff)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                    <LuSparkles size={14} /> Replay tour
                </button>
                <p style={{ marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    Opens the step-by-step tour the next time you open a chart.
                </p>
            </div>
        </div>
    );
}
