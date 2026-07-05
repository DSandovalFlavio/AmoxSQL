import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** A markdown block that only re-parses when its content string changes. */
export const MarkdownChunk = memo(({ content, components }) => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{content}</ReactMarkdown>
));
MarkdownChunk.displayName = 'MarkdownChunk';

/**
 * StreamingMarkdown — incremental markdown for text that is still growing.
 *
 * Re-parsing the FULL accumulated text on every stream flush is O(n) per flush
 * → O(n²) over a long answer, and is a main cause of streaming jank. Instead,
 * everything before the last paragraph break is parsed once (memoized chunk);
 * only the short growing tail re-parses per flush. When the message completes,
 * callers should render the final text through a single normal markdown pass.
 */
const StreamingMarkdown = ({ content, components }) => {
    const splitIdx = content.lastIndexOf('\n\n');
    const stable = splitIdx > 0 ? content.slice(0, splitIdx) : '';
    const tail = splitIdx > 0 ? content.slice(splitIdx) : content;
    return (
        <>
            {stable ? <MarkdownChunk content={stable} components={components} /> : null}
            {tail ? <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{tail}</ReactMarkdown> : null}
        </>
    );
};

export default StreamingMarkdown;
