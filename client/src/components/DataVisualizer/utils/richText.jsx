/**
 * Lightweight rich-text renderer for chart titles/subtitles/takeaways.
 * Supports **emphasis** → rendered in the accent color (bold).
 * Anything else is plain text. No external markdown dependency.
 */

export function renderRichText(text, accentColor = 'var(--accent-color-user)') {
    if (text == null || text === '') return null;
    const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
                <span key={i} style={{ color: accentColor, fontWeight: 700 }}>
                    {part.slice(2, -2)}
                </span>
            );
        }
        return part;
    });
}
