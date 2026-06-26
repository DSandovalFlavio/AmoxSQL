/**
 * Tour registry — the single catalog of every first-run tour.
 *
 * One place defines a tour's id, branding, content (steps) and the
 * localStorage key that records "already seen". Features trigger first-run
 * with openTour(id); the global <OnboardingHost> renders and persists. This
 * decouples tours from the view that owns them, so any tour can be replayed
 * from the Command Palette or Settings even when its feature isn't open.
 */
import { LuSparkles, LuWaypoints, LuCompass, LuNotebookPen, LuLibrary, LuPuzzle, LuRocket } from 'react-icons/lu';

import { GETTING_STARTED_TOUR_STEPS } from './content/gettingStartedTour';
import { STORY_FLOW_STAGES } from '../DataVisualizer/StoryFlowGuide';
import { DATA_FLOW_STAGES } from '../chains/DataFlowGuide';
import { AI_MODES } from '../ai/AiModesGuide';
import { NOTEBOOK_TOUR_STEPS } from './content/notebookTour';
import { DEEP_DIVE_TOUR_STEPS } from './content/deepDiveTour';
import { AI_CONTEXT_TOUR_STEPS } from './content/aiContextTour';
import { VAULT_TOUR_STEPS } from './content/vaultTour';
import { EXTENSIONS_TOUR_STEPS } from './content/extensionsTour';

/** Fired by openTour(); listened to by <OnboardingHost>. */
export const OPEN_TOUR_EVENT = 'amox-open-tour';

export const TOURS = [
    {
        id: 'getting-started', brandLabel: 'Welcome to AmoxSQL', brandIcon: LuRocket, doneLabel: 'Start exploring',
        steps: GETTING_STARTED_TOUR_STEPS, storageKey: 'amoxsql-getting-started-seen',
    },
    {
        id: 'storyflow', brandLabel: 'Story Flow', brandIcon: LuSparkles, doneLabel: 'Done',
        steps: STORY_FLOW_STAGES, storageKey: 'amoxsql-storyflow-tour-seen',
        legacyReplayEvent: 'amox_replay_storyflow_tour',
    },
    {
        id: 'dataflow', brandLabel: 'Data Flow', brandIcon: LuWaypoints, doneLabel: 'Done',
        steps: DATA_FLOW_STAGES, storageKey: 'amoxsql-dataflow-tour-seen',
        legacyReplayEvent: 'amox_replay_dataflow_tour',
    },
    {
        id: 'ai-modes', brandLabel: 'Meet the AI', brandIcon: LuSparkles, doneLabel: 'Got it',
        steps: AI_MODES, storageKey: 'amox-ai-modes-tour-seen',
    },
    {
        id: 'notebooks', brandLabel: 'SQL Notebooks', brandIcon: LuNotebookPen, doneLabel: 'Got it',
        steps: NOTEBOOK_TOUR_STEPS, storageKey: 'amoxsql-notebooks-tour-seen',
    },
    {
        id: 'deep-dive', brandLabel: 'Deep Dive', brandIcon: LuCompass, doneLabel: 'Got it',
        steps: DEEP_DIVE_TOUR_STEPS, storageKey: 'amoxsql-deepdive-tour-seen',
    },
    {
        id: 'ai-context', brandLabel: 'AI Context', brandIcon: LuSparkles, doneLabel: 'Got it',
        steps: AI_CONTEXT_TOUR_STEPS, storageKey: 'amoxsql-aicontext-tour-seen',
    },
    {
        id: 'vault', brandLabel: 'Analysis Vault', brandIcon: LuLibrary, doneLabel: 'Got it',
        steps: VAULT_TOUR_STEPS, storageKey: 'amoxsql-vault-tour-seen',
    },
    {
        id: 'extensions', brandLabel: 'Extensions', brandIcon: LuPuzzle, doneLabel: 'Got it',
        steps: EXTENSIONS_TOUR_STEPS, storageKey: 'amoxsql-extensions-tour-seen',
    },
];

const byId = Object.fromEntries(TOURS.map((t) => [t.id, t]));

export function getTour(id) { return byId[id] || null; }

export function hasSeenTour(id) {
    const t = byId[id];
    if (!t) return true;
    try { return !!localStorage.getItem(t.storageKey); } catch { return false; }
}

export function markTourSeen(id) {
    const t = byId[id];
    if (!t) return;
    try { localStorage.setItem(t.storageKey, '1'); } catch { /* ignore */ }
}

export function resetTour(id) {
    const t = byId[id];
    if (!t) return;
    try { localStorage.removeItem(t.storageKey); } catch { /* ignore */ }
}

/** Open (or replay) a tour anywhere. Renders via <OnboardingHost>. */
export function openTour(id) {
    if (!byId[id]) return;
    window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT, { detail: { id } }));
}
