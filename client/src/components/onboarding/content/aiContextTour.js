/**
 * AI Context — first-run tour content.
 * The project context files that teach the AI your data (Settings → AI Context).
 */
import { LuSparkles, LuRuler, LuWaypoints, LuBookA } from 'react-icons/lu';

export const AI_CONTEXT_TOUR_STEPS = [
    {
        icon: LuSparkles, title: 'Teach the AI your data', tagline: 'Context beats guessing',
        headline: 'A few files make the AI accurate',
        desc: 'The AI already sees your schema. Context files add the meaning behind it — your definitions, your joins, your vocabulary — so generated SQL matches how your business actually works.',
        points: ['Lives in your project under .amoxsql/context/', 'Edit it any time from Settings → AI Context'],
    },
    {
        icon: LuRuler, title: 'metrics.yml', tagline: 'Define your numbers',
        headline: 'Pin down what metrics mean',
        desc: 'Spell out "revenue", "churn" or "MAU" in SQL once. The AI reuses your definition instead of inventing one — so the same question always gives the same number.',
    },
    {
        icon: LuWaypoints, title: 'joins.yml', tagline: 'Correct joins, every time',
        headline: 'Encode how tables relate',
        desc: 'List the canonical keys between your tables. The AI joins them correctly without guessing foreign keys.',
    },
    {
        icon: LuBookA, title: 'glossary.md + examples/', tagline: 'Words and patterns',
        headline: 'Add vocabulary and worked examples',
        desc: 'A glossary translates business terms to plain language; the examples/ folder gives the AI proven queries it can adapt to recurring questions.',
    },
];
