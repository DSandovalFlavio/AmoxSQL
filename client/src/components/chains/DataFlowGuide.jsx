/**
 * Data Flow — in-app guide + first-run tour.
 *
 * Single source of truth for the Data Flow explainer, reused by:
 *  - the "?" help drawer in the chain editor toolbar
 *  - Settings → Data Flow
 *  - the first-run tour carousel
 *
 * Mirrors StoryFlowGuide so both studios feel consistent. "Data Flow" is the
 * studio; the documents it produces are chains (.sqlchain).
 */
import { memo } from 'react';
import {
    LuDatabase, LuFilter, LuWaypoints, LuSparkles, LuUpload, LuShieldCheck,
} from 'react-icons/lu';
import { Tour } from '../onboarding/Tour';

// ─── Content (the stages of building a flow) ─────────────────
export const DATA_FLOW_STAGES = [
    {
        key: 'source', icon: LuDatabase, title: 'Source', tagline: 'Bring your data in',
        headline: 'Start from where the data lives',
        desc: 'Every flow begins with one or more source nodes that load data into the local engine.',
        points: ['Local files & folders, existing tables', 'Cloud buckets (S3/GCS), Google Sheets, HTTP'],
    },
    {
        key: 'shape', icon: LuFilter, title: 'Shape', tagline: 'Filter, pick, clean',
        headline: 'Trim and tidy before you build',
        desc: 'Reduce rows and columns, fix types, and standardize messy values early.',
        points: ['Filter & Order, Columns, Type Cast', 'Clean & Format: text, dates, JSON'],
    },
    {
        key: 'combine', icon: LuWaypoints, title: 'Combine', tagline: 'Join, merge, aggregate',
        headline: 'Bring the pieces together',
        desc: 'Relate tables and summarize them into the shape your analysis needs.',
        points: ['Join (composite keys) & Merge (union)', 'Group & Aggregate, Window, Pivot / Unpivot'],
    },
    {
        key: 'enrich', icon: LuSparkles, title: 'Enrich', tagline: 'Add AI-derived columns',
        headline: 'Augment rows with the AI model',
        desc: 'Apply an LLM per row to classify, extract, summarize, or redact — like a smart derived column.',
        points: ['Uses the provider/model from Settings → AI', 'Keep Max Rows modest — one call per row'],
    },
    {
        key: 'output', icon: LuUpload, title: 'Output', tagline: 'Persist or export',
        headline: 'Send the result where it’s needed',
        desc: 'Materialize the final result as a table, or export it to a file or cloud bucket.',
        points: ['Create Table for reuse in other chains', 'Export CSV/Parquet/Excel — local or partitioned cloud'],
    },
    {
        key: 'run', icon: LuShieldCheck, title: 'Run & Verify', tagline: 'Execute with guard rails',
        headline: 'Run it — and trust the result',
        desc: 'Execute the whole flow or from any node, with checkpoints and quality gates along the way.',
        points: ['Run all, run-from, or run-to a node', 'Assert & Schema Validation stop bad data; Checkpoint resumes'],
    },
];

export const DATA_FLOW_PRINCIPLES = [
    { title: 'Filter early', desc: 'Cut rows and columns near the source so every node downstream is faster.' },
    { title: 'One node, one job', desc: 'Small focused nodes read clearer, validate better, and are easier to debug.' },
    { title: 'Materialize at checkpoints', desc: 'Use Create Table or Checkpoint at natural breakpoints to resume without a full re-run.' },
    { title: 'Validate before you ship', desc: 'Put Assert or Schema Validation right before Output to catch bad data early.' },
];

// ─── Reference guide (used by the ? drawer and Settings) ──────
export const DataFlowGuide = memo(() => (
    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <p style={{ marginTop: 0 }}>
            Data Flow is the visual studio where you build chains — pipelines that run on the
            local engine. You drag nodes onto the canvas and connect them into a graph; the
            stages below are the natural order most flows follow.
        </p>

        {DATA_FLOW_STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
                <div key={s.key} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-color)' }}>
                    <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: 'var(--panel-section-bg, var(--bg-tertiary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-active)' }}>
                        <Icon size={15} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>{i + 1}. {s.title}</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{s.tagline}</span>
                        </div>
                        <div style={{ marginTop: '2px' }}>{s.desc}</div>
                        <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>
                            {s.points.map((p, j) => <li key={j} style={{ marginBottom: '2px' }}>{p}</li>)}
                        </ul>
                    </div>
                </div>
            );
        })}

        <h3 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-active)', margin: '18px 0 8px' }}>
            Pipeline principles
        </h3>
        {DATA_FLOW_PRINCIPLES.map((p, i) => (
            <div key={i} style={{ marginBottom: '8px' }}>
                <div style={{ color: 'var(--text-active)', fontWeight: 600, fontSize: '12.5px' }}>{p.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{p.desc}</div>
            </div>
        ))}

        <h3 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-active)', margin: '18px 0 8px' }}>
            Tip
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>
            Every node has its own docs — hover a node in the palette and click the “?”, or open the
            Info tab in a node’s config panel.
        </p>
    </div>
));
DataFlowGuide.displayName = 'DataFlowGuide';

// ─── First-run tour (carousel) — renders through the shared primitive ──
export const DataFlowTour = memo(({ isOpen, onClose }) => (
    <Tour
        isOpen={isOpen}
        onClose={onClose}
        steps={DATA_FLOW_STAGES}
        brandIcon={LuWaypoints}
        brandLabel="Data Flow"
        doneLabel="Done"
    />
));
DataFlowTour.displayName = 'DataFlowTour';
