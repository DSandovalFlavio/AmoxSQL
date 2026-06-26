/**
 * SQL Notebooks — first-run tour content.
 * Cells are SQL (code), Text (markdown) and Input (parameters). Saved as .sqlnb.
 */
import { LuFileCode, LuType, LuSettings2, LuShare2 } from 'react-icons/lu';

export const NOTEBOOK_TOUR_STEPS = [
    {
        icon: LuFileCode, title: 'SQL cells', tagline: 'Run analysis step by step',
        headline: 'Break an analysis into cells',
        desc: 'A notebook (.sqlnb) is a sequence of cells you run independently. Each SQL cell keeps its own result, so you build an analysis one query at a time instead of one giant script.',
        points: ['Run a single cell or the whole notebook', 'Results stay attached to each cell'],
    },
    {
        icon: LuType, title: 'Text cells', tagline: 'Narrate the why',
        headline: 'Explain your reasoning inline',
        desc: 'Text cells use Markdown to document what each step does and what you found — turning a query log into a readable report.',
        points: ['Headings, lists, links and emphasis', 'Great for handing an analysis to someone else'],
    },
    {
        icon: LuSettings2, title: 'Input cells', tagline: 'Parameterize it',
        headline: 'Make notebooks reusable',
        desc: 'Input cells declare variables you reference as {{name}} in SQL. Change the input once and every dependent query re-runs with the new value.',
        points: ['Dates, thresholds, category filters…', 'No editing SQL to re-target the analysis'],
    },
    {
        icon: LuShare2, title: 'Share', tagline: 'Ship the result',
        headline: 'Export a self-contained report',
        desc: 'When the story is ready, export the notebook as a standalone HTML report with charts baked in — no AmoxSQL needed to read it.',
    },
];
