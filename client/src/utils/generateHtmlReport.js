/**
 * AmoxSQL — Export to HTML
 * Generates a self-contained HTML file from the notebook's report view.
 * Supports dark/light themes. Uses html2canvas for chart capture (same as PNG export).
 */
import html2canvas from 'html2canvas';

// Lightweight Markdown → HTML converter (no dependencies)
function markdownToHtml(md) {
  if (!md) return '';
  let html = md
    // Code blocks (``` ... ```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre><code class="lang-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Headers
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold & Italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Blockquotes
    .replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr/>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // Line breaks → paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>(\s*<br\/>)?)+/gs, (match) => {
    return '<ul>' + match.replace(/<br\/>/g, '') + '</ul>';
  });

  return '<p>' + html + '</p>';
}

// Detect the current app theme
function detectTheme() {
  return document.body.classList.contains('light-theme') ? 'light' : 'dark';
}

/**
 * Capture a chart as a base64 PNG using html2canvas.
 * Same approach as DataVisualizer's handleDownload.
 */
async function captureCellChartAsImage(cellId, theme) {
  const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
  if (!cellEl) return null;

  // Find the Recharts wrapper container
  const wrapper = cellEl.querySelector('.recharts-wrapper');
  if (!wrapper) return null;

  // Go up to find the chart ref container (the div that holds title + chart + footnote)
  // This is the parent of the recharts-responsive-container
  let chartContainer = wrapper.closest('[style*="flex"]') || wrapper.parentElement?.parentElement;
  if (!chartContainer) chartContainer = wrapper.parentElement;

  try {
    const isDark = theme === 'dark';
    const canvas = await html2canvas(chartContainer, {
      backgroundColor: isDark ? '#1e1f22' : '#ffffff',
      scale: 2, // 2x for crisp rendering
      logging: false,
      useCORS: true,
      ignoreElements: (element) => {
        // Ignore buttons and interactive elements
        return element.tagName === 'BUTTON' || element.tagName === 'INPUT';
      }
    });

    return canvas.toDataURL('image/png');
  } catch (err) {
    console.error('html2canvas capture failed for cell:', cellId, err);
    return null;
  }
}

// Detect whether a cell is showing chart or table view by checking the DOM
function detectCellViewMode(cellId) {
  const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
  if (!cellEl) return 'table';

  // If a Recharts wrapper is present, the chart view is active
  const hasChart = cellEl.querySelector('.recharts-wrapper');
  if (hasChart) return 'chart';
  return 'table';
}

// Capture chart title/subtitle/footnote from DOM
function captureChartAnnotations(cellId) {
  const cellEl = document.querySelector(`[data-cell-id="${cellId}"]`);
  if (!cellEl) return { title: '', subtitle: '', footnote: '' };

  const title = cellEl.querySelector('h2')?.textContent || '';
  const subtitle = cellEl.querySelector('h3')?.textContent || '';
  const footnoteEl = cellEl.querySelector('[style*="font-style: italic"]');
  const footnote = footnoteEl?.textContent || '';

  return { title, subtitle, footnote };
}

// Get CSS for the selected theme
function getThemeCSS(theme) {
  const isDark = theme === 'dark';

  return `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: ${isDark ? '#0f1012' : '#f8f9fa'};
    color: ${isDark ? '#c1c2c5' : '#495057'};
    line-height: 1.7;
    padding: 40px 20px;
  }

  .report-wrapper {
    max-width: 900px;
    margin: 0 auto;
  }

  .report-header {
    text-align: center;
    padding: 40px 0 30px;
    border-bottom: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'};
    margin-bottom: 40px;
  }

  .report-header .logo {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    color: ${isDark ? '#00ffff' : '#0059ff'};
    margin-bottom: 8px;
  }

  .report-header .date {
    font-size: 12px;
    color: ${isDark ? '#909296' : '#868e96'};
  }

  /* Markdown Content */
  .md-section { margin-bottom: 32px; }
  .md-section h1 { font-size: 28px; color: ${isDark ? '#fff' : '#000'}; margin: 24px 0 12px; font-weight: 700; }
  .md-section h2 { font-size: 22px; color: ${isDark ? '#fff' : '#000'}; margin: 20px 0 10px; font-weight: 600; }
  .md-section h3 { font-size: 18px; color: ${isDark ? '#e0e0e0' : '#333'}; margin: 16px 0 8px; font-weight: 600; }
  .md-section h4 { font-size: 15px; color: ${isDark ? '#e0e0e0' : '#333'}; margin: 12px 0 6px; font-weight: 600; }
  .md-section p { margin: 8px 0; font-size: 15px; }
  .md-section ul { padding-left: 24px; margin: 8px 0; }
  .md-section li { margin: 4px 0; }
  .md-section blockquote { border-left: 3px solid ${isDark ? '#00ffff' : '#0059ff'}; padding: 8px 16px; color: ${isDark ? '#909296' : '#868e96'}; margin: 12px 0; background: ${isDark ? 'rgba(0,255,255,0.03)' : 'rgba(0,89,255,0.03)'}; border-radius: 0 6px 6px 0; }
  .md-section code { background: ${isDark ? '#1e1f22' : '#e9ecef'}; padding: 2px 6px; border-radius: 4px; font-size: 13px; color: ${isDark ? '#00ffff' : '#0059ff'}; font-family: 'JetBrains Mono', 'Consolas', monospace; }
  .md-section pre { background: ${isDark ? '#1e1f22' : '#f1f3f5'}; padding: 16px; border-radius: 8px; overflow-x: auto; margin: 12px 0; border: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'}; }
  .md-section pre code { background: none; padding: 0; color: ${isDark ? '#c1c2c5' : '#495057'}; }
  .md-section hr { border: none; border-top: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'}; margin: 24px 0; }
  .md-section a { color: ${isDark ? '#00ffff' : '#0059ff'}; text-decoration: none; }
  .md-section a:hover { text-decoration: underline; }

  /* SQL Code Block */
  .sql-block {
    background: ${isDark ? '#1a1b1e' : '#f8f9fa'};
    border-left: 3px solid ${isDark ? '#00ffff' : '#0059ff'};
    padding: 16px;
    border-radius: 0 8px 8px 0;
    margin-bottom: 16px;
    font-family: 'JetBrains Mono', 'Consolas', monospace;
    font-size: 13px;
    color: ${isDark ? '#c1c2c5' : '#495057'};
    overflow-x: auto;
    white-space: pre-wrap;
  }

  /* Chart Section */
  .chart-section {
    margin: 24px 0;
    background: ${isDark ? '#1e1f22' : '#ffffff'};
    border-radius: 12px;
    padding: 24px;
    border: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'};
    text-align: center;
  }
  .chart-section img { max-width: 100%; height: auto; border-radius: 8px; }
  .chart-title { font-size: 18px; font-weight: 600; color: ${isDark ? '#fff' : '#000'}; text-align: center; margin-bottom: 6px; }
  .chart-subtitle { font-size: 14px; color: ${isDark ? '#909296' : '#868e96'}; text-align: center; margin-bottom: 16px; }
  .chart-footnote { font-size: 12px; color: ${isDark ? '#909296' : '#868e96'}; font-style: italic; text-align: center; margin-top: 12px; border-top: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'}; padding-top: 8px; }

  /* Interactive Table */
  .table-section {
    margin: 24px 0;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'};
  }

  .table-meta {
    padding: 10px 16px;
    font-size: 12px;
    color: ${isDark ? '#909296' : '#868e96'};
    background: ${isDark ? '#141517' : '#f1f3f5'};
    border-bottom: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'};
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    font-family: 'JetBrains Mono', 'Consolas', monospace;
  }

  th {
    background: ${isDark ? '#1a1b1e' : '#f8f9fa'};
    color: ${isDark ? '#fff' : '#000'};
    font-weight: 600;
    padding: 10px 12px;
    text-align: left;
    border-bottom: 2px solid ${isDark ? '#2c2e33' : '#dee2e6'};
    cursor: pointer;
    user-select: none;
    position: sticky;
    top: 0;
    z-index: 2;
    white-space: nowrap;
  }

  th:hover { background: ${isDark ? '#25262b' : '#e9ecef'}; }
  th .sort-arrow { font-size: 10px; margin-left: 4px; opacity: 0.5; }
  th .sort-arrow.active { opacity: 1; color: ${isDark ? '#00ffff' : '#0059ff'}; }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid ${isDark ? '#2c2e33' : '#e9ecef'};
    color: ${isDark ? '#c1c2c5' : '#495057'};
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  tr:hover td { background: ${isDark ? '#25262b' : '#f1f3f5'}; }

  .table-scroll {
    max-height: 500px;
    overflow: auto;
  }

  .null-val { color: ${isDark ? '#909296' : '#adb5bd'}; font-style: italic; }

  /* Footer */
  .report-footer {
    text-align: center;
    padding: 40px 0 20px;
    border-top: 1px solid ${isDark ? '#2c2e33' : '#dee2e6'};
    margin-top: 60px;
    font-size: 11px;
    color: ${isDark ? '#555' : '#adb5bd'};
  }

  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${isDark ? '#4e5157' : '#ced4da'}; border-radius: 9px; }
  ::-webkit-scrollbar-thumb:hover { background: ${isDark ? '#5f6269' : '#adb5bd'}; }
`;
}

// Build the HTML template
function buildHtmlDocument(sections, theme) {
  const timestamp = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AmoxSQL Report — ${timestamp}</title>
<style>${getThemeCSS(theme)}</style>
</head>
<body>
<div class="report-wrapper">
  <div class="report-header">
    <div class="logo">AmoxSQL Report</div>
    <div class="date">Generated on ${timestamp}</div>
  </div>

  ${sections.join('\n\n')}

  <div class="report-footer">
    Generated by AmoxSQL — The Modern Codex for Local Data Analysis
  </div>
</div>

<script>
// Interactive table sorting
document.querySelectorAll('.sortable-table').forEach(table => {
  const headers = table.querySelectorAll('th');
  const tbody = table.querySelector('tbody');
  let sortCol = -1, sortDir = 1;

  headers.forEach((th, colIdx) => {
    th.addEventListener('click', () => {
      if (sortCol === colIdx) { sortDir *= -1; }
      else { sortCol = colIdx; sortDir = 1; }

      headers.forEach(h => {
        const arrow = h.querySelector('.sort-arrow');
        if (arrow) { arrow.textContent = '⇅'; arrow.classList.remove('active'); }
      });
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) {
        arrow.textContent = sortDir === 1 ? '↑' : '↓';
        arrow.classList.add('active');
      }

      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aVal = a.children[colIdx]?.textContent?.trim() || '';
        const bVal = b.children[colIdx]?.textContent?.trim() || '';
        const aNum = parseFloat(aVal.replace(/,/g, ''));
        const bNum = parseFloat(bVal.replace(/,/g, ''));
        if (!isNaN(aNum) && !isNaN(bNum)) return (aNum - bNum) * sortDir;
        return aVal.localeCompare(bVal) * sortDir;
      });
      rows.forEach(r => tbody.appendChild(r));
    });
  });
});
</script>
</body>
</html>`;
}

// Format a cell value for display in the HTML table
function formatVal(val) {
  if (val === null || val === undefined) return '<span class="null-val">NULL</span>';
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return val.toLocaleString();
    return val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  }
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z?$/.test(s)) return s.split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.replace('T', ' ').replace(/(\.\d{3})?Z$/, '');
  return s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Build HTML for a data table
function buildTableHtml(data) {
  if (!data || data.length === 0) return '<p style="color:#909296;">No data</p>';

  const columns = Object.keys(data[0]);
  const displayData = data.slice(0, 200);

  const headerRow = columns.map(col =>
    `<th>${col.replace(/</g, '&lt;')} <span class="sort-arrow">⇅</span></th>`
  ).join('');

  const bodyRows = displayData.map(row =>
    '<tr>' + columns.map(col => `<td>${formatVal(row[col])}</td>`).join('') + '</tr>'
  ).join('\n');

  return `<div class="table-section">
  <div class="table-meta">${data.length} rows · ${columns.length} columns${data.length > 200 ? ' · Showing first 200' : ''}</div>
  <div class="table-scroll">
    <table class="sortable-table">
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>
</div>`;
}

/**
 * Main export function — called from SqlNotebook
 * Now async because html2canvas is used for chart capture.
 * @param {Array} cells - Array of { id, type, content }
 * @param {Object} results - Map of cellId → { data, executionTime, error }
 * @param {boolean} hideCode - Whether SQL code blocks should be hidden
 */
export async function generateHtmlReport(cells, results, hideCode = false) {
  const theme = detectTheme();
  const sections = [];

  for (const cell of cells) {
    if (cell.type === 'markdown') {
      const html = markdownToHtml(cell.content);
      if (html.trim()) {
        sections.push(`<div class="md-section">${html}</div>`);
      }
    } else if (cell.type === 'code') {
      const result = results[cell.id];

      // Show SQL code block unless hidden
      if (!hideCode && cell.content.trim()) {
        sections.push(`<div class="sql-block">${cell.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`);
      }

      // Show results
      if (result && result.data && result.data.length > 0) {
        const activeView = detectCellViewMode(cell.id);

        if (activeView === 'chart') {
          // Chart view — capture as PNG image using html2canvas
          const dataUrl = await captureCellChartAsImage(cell.id, theme);

          if (dataUrl) {
            const annotations = captureChartAnnotations(cell.id);
            let chartHtml = '<div class="chart-section">';
            if (annotations.title) chartHtml += `<div class="chart-title">${annotations.title}</div>`;
            if (annotations.subtitle) chartHtml += `<div class="chart-subtitle">${annotations.subtitle}</div>`;
            chartHtml += `<img src="${dataUrl}" alt="Chart" />`;
            if (annotations.footnote) chartHtml += `<div class="chart-footnote">${annotations.footnote}</div>`;
            chartHtml += '</div>';
            sections.push(chartHtml);
          } else {
            // Fallback to table if capture failed
            sections.push(buildTableHtml(result.data));
          }
        } else {
          // Table view — build interactive table
          sections.push(buildTableHtml(result.data));
        }
      }

      if (result && result.error) {
        sections.push(`<div style="padding:12px 16px;color:#ff6b6b;background:rgba(255,107,107,0.1);border-radius:8px;font-family:monospace;font-size:13px;margin:16px 0;">Error: ${result.error}</div>`);
      }
    }
  }

  // Generate and download
  const htmlContent = buildHtmlDocument(sections, theme);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `amoxsql_report_${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
