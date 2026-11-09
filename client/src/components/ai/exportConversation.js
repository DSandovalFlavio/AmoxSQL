/**
 * exportConversation — Serializes an AI conversation to Markdown and triggers download.
 */

function toolCallsToMarkdown(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return '';
    const lines = [];
    for (const tc of toolCalls) {
        if (tc.toolName === 'execute_sql') {
            lines.push(`\n\`\`\`sql\n${tc.args?.query || ''}\n\`\`\``);
            if (tc.result?.rowCount !== undefined) {
                lines.push(`*${tc.result.rowCount} rows (${tc.result.executionTime}ms)*`);
            }
        } else if (tc.toolName === 'display_chart') {
            lines.push(`\n> 📊 **Chart**: ${tc.result?.chartConfig?.title || tc.args?.title || 'Chart'} (${tc.args?.chart_type})`);
        } else if (tc.toolName === 'write_file' || tc.toolName === 'edit_file' || tc.toolName === 'propose_file') {
            // What the user decided, not just that something was proposed.
            const nuevo = tc.result?.action === 'propose_file';
            const que = nuevo ? `New file \`${tc.result?.path || ''}\`` : 'Change to the file';
            const estado = tc.result?.error ? 'failed'
                : tc.estado === 'aplicada' ? (nuevo ? 'created' : 'applied')
                : tc.estado === 'rechazada' ? 'rejected' : 'proposed';
            lines.push(`\n> ✏️ **${que}** (${estado})${tc.result?.description ? `: ${tc.result.description}` : ''}`);
        } else if (tc.toolName === 'build_notebook') {
            lines.push(`\n> 📓 **Notebook created**: ${tc.result?.fileName || ''}`);
        } else if (tc.toolName === 'suggest_followups') {
            // skip
        } else {
            lines.push(`\n> 🔧 **${tc.toolName}**`);
        }
    }
    return lines.join('\n');
}

/**
 * Exports a conversation (array of messages) to a Markdown file download.
 * @param {Array} messages - Array of {role, content, toolCalls} objects
 * @param {string} title - Conversation title for filename and heading
 */
export function exportConversationToMarkdown(messages, title = 'Conversation') {
    const safeTitle = title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'Conversation';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const lines = [
        `# ${safeTitle}`,
        `*Exported from AmoxSQL — ${date}*`,
        '',
        '---',
        '',
    ];

    for (const msg of messages) {
        if (msg.role === 'user') {
            lines.push(`**You:**`);
            lines.push(msg.content || '');
            lines.push('');
        } else if (msg.role === 'assistant') {
            lines.push(`**AmoxSQL AI:**`);
            if (msg.content) {
                lines.push(msg.content);
            }
            const toolMd = toolCallsToMarkdown(msg.toolCalls);
            if (toolMd) {
                lines.push(toolMd);
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    const markdown = lines.join('\n');
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle.replace(/\s+/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
