/**
 * AmoxSQL — Report Flow layout gallery metadata.
 *
 * Tiny schematic previews (pure CSS blocks, no SVG/asset deps) for each deck
 * layout, plus a one-line "when to use" hint. Lets a user recognize what a
 * layout looks like before inserting it — without needing to already know
 * the `<!-- layout: X -->` directive names by heart.
 */
import { DECK_LAYOUTS } from '../../utils/deckParser';

function TitlePreview() {
    return (
        <div className="dlp-schema dlp-schema--title">
            <div className="dlp-bar dlp-bar--lg" />
            <div className="dlp-bar dlp-bar--sm" />
        </div>
    );
}

function ContentPreview() {
    return (
        <div className="dlp-schema dlp-schema--content">
            <div className="dlp-bar dlp-bar--md" />
            <div className="dlp-line" />
            <div className="dlp-line" />
            <div className="dlp-line dlp-line--short" />
        </div>
    );
}

function ContentChartPreview() {
    return (
        <div className="dlp-schema dlp-schema--split">
            <div className="dlp-col">
                <div className="dlp-bar dlp-bar--md" />
                <div className="dlp-line" />
                <div className="dlp-line dlp-line--short" />
            </div>
            <div className="dlp-col dlp-col--chart">
                <div className="dlp-chart-box" />
            </div>
        </div>
    );
}

function ChartFullPreview() {
    return (
        <div className="dlp-schema dlp-schema--full">
            <div className="dlp-chart-box dlp-chart-box--full" />
        </div>
    );
}

function TwoColPreview() {
    return (
        <div className="dlp-schema dlp-schema--split">
            <div className="dlp-col">
                <div className="dlp-line" />
                <div className="dlp-line dlp-line--short" />
            </div>
            <div className="dlp-col">
                <div className="dlp-line" />
                <div className="dlp-line dlp-line--short" />
            </div>
        </div>
    );
}

export const DECK_LAYOUT_META = {
    title: {
        label: 'Title',
        hint: 'Cover slide or section break',
        Preview: TitlePreview,
    },
    content: {
        label: 'Content',
        hint: 'Text, bullets, or a table',
        Preview: ContentPreview,
    },
    'content-chart': {
        label: 'Content + Chart',
        hint: 'Narrative next to one chart',
        Preview: ContentChartPreview,
    },
    'chart-full': {
        label: 'Chart (full width)',
        hint: 'A chart that needs room — many categories, long labels',
        Preview: ChartFullPreview,
    },
    'two-col': {
        label: 'Two Columns',
        hint: 'Compare two things side by side',
        Preview: TwoColPreview,
    },
};

export const DECK_LAYOUT_GALLERY = DECK_LAYOUTS.map((id) => ({ id, ...DECK_LAYOUT_META[id] }));
