/**
 * Getting Started — global first-run tour.
 * Orients a brand-new user to the whole app on their first IDE session.
 */
import { LuDatabase, LuPlay, LuBot, LuLayoutGrid, LuCompass } from 'react-icons/lu';

export const GETTING_STARTED_TOUR_STEPS = [
    {
        icon: LuDatabase, title: 'Your workspace', tagline: 'Local and fast',
        headline: 'Welcome to AmoxSQL',
        desc: 'A desktop SQL workbench powered by a local DuckDB engine — everything runs on your machine, instantly. The left sidebar holds your files, database schema and extensions.',
        points: ['Files, Schema and Extensions in the sidebar', 'No servers, no uploads — your data stays local'],
    },
    {
        icon: LuPlay, title: 'Write & run', tagline: 'The editor',
        headline: 'Query in the editor',
        desc: 'Write SQL with autocomplete and run it with Ctrl+Enter. Results appear below, ready to sort, filter and export.',
        points: ['Ctrl+Enter to run · F5 also works', 'Ctrl+Shift+P opens the command palette'],
    },
    {
        icon: LuBot, title: 'Ask the AI', tagline: 'Assist & Deep Dive',
        headline: 'An analyst built in',
        desc: 'Toggle Assist with Ctrl+L to generate, fix or explain SQL beside you. Or hand a whole question to Deep Dive and let it investigate on its own.',
        points: ['Assist: a copilot in the editor', 'Deep Dive: an autonomous analyst'],
    },
    {
        icon: LuLayoutGrid, title: 'Make it speak', tagline: 'Story Flow & Data Flow',
        headline: 'Visualize and build pipelines',
        desc: 'Turn a result into a chart with Story Flow, or build a visual data pipeline with Data Flow. Each has its own guided tour the first time you open it.',
    },
    {
        icon: LuCompass, title: 'Find your way', tagline: 'Help is everywhere',
        headline: 'Replay any tour, anytime',
        desc: 'Every studio has a "?" guide, and you can replay any tour from the command palette under "Help & Tours". You are ready — open a file and run your first query.',
    },
];
