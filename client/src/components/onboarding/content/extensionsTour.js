/**
 * Extensions — first-run tour content.
 * DuckDB extensions that add engine capabilities (httpfs, spatial, fts…).
 */
import { LuPuzzle, LuDownload, LuShieldCheck } from 'react-icons/lu';

export const EXTENSIONS_TOUR_STEPS = [
    {
        icon: LuPuzzle, title: 'Extend the engine', tagline: 'More than plain SQL',
        headline: 'Add capabilities to DuckDB',
        desc: 'Extensions unlock new powers in the local engine — reading remote files, spatial queries, full-text search, Excel I/O and more. Browse, install and load them here.',
        points: ['httpfs — query files over HTTP/S3/GCS', 'spatial, fts, excel, json and others'],
    },
    {
        icon: LuDownload, title: 'Install & load', tagline: 'One click each',
        headline: 'Featured, installed, or community',
        desc: 'Filter by Featured to discover the popular ones, install what you need, and load it into the current session. Core extensions ship with the engine and just load.',
    },
    {
        icon: LuShieldCheck, title: 'Know the source', tagline: 'Core vs community',
        headline: 'See where each extension comes from',
        desc: 'AmoxSQL marks whether an extension is core (shipped with DuckDB) or community-published, so you always know what you are loading before you run it.',
    },
];
