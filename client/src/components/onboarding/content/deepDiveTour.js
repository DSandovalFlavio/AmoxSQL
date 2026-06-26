/**
 * Deep Dive — first-run tour content.
 * The autonomous analyst over the whole local database.
 */
import { LuCompass, LuListChecks, LuChartColumn, LuNotebookPen } from 'react-icons/lu';

export const DEEP_DIVE_TOUR_STEPS = [
    {
        icon: LuCompass, title: 'Delegate the question', tagline: 'You ask, it investigates',
        headline: 'Hand over the whole analysis',
        desc: 'Deep Dive is a full-screen analyst over your entire local database. Give it a business question and it works the problem on its own — no query writing from you.',
        when: 'You have a question and want the analysis done end to end.',
        examples: ['Why did sales drop in Q3?', 'What drives churn?', 'Give me an overview of this dataset'],
    },
    {
        icon: LuListChecks, title: 'It plans', tagline: 'Steps you can follow',
        headline: 'Watch it reason in steps',
        desc: 'It lays out a plan, explores the schema, and runs queries proactively — narrating each finding so you can follow (and trust) the chain of reasoning.',
        points: ['Explores tables and relationships itself', 'Each step is shown, not hidden'],
    },
    {
        icon: LuChartColumn, title: 'It visualizes', tagline: 'Findings, not just numbers',
        headline: 'Charts where they help',
        desc: 'When a result is clearer as a chart, Deep Dive builds one inline so the insight lands at a glance.',
    },
    {
        icon: LuNotebookPen, title: 'It reports', tagline: 'Keep the work',
        headline: 'Save it as a notebook',
        desc: 'Turn the whole investigation into a .sqlnb report you can re-run, refine, or share — the analysis outlives the chat.',
        points: ['Reproducible: every query is kept', 'Promote an Assist chat to Deep Dive anytime with ↗'],
    },
];
