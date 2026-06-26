import BaseChainNode from './BaseChainNode';

const GSheetReadNode = (props) => {
    const { data } = props;
    const id = data.config?.spreadsheetId || '';
    const sheet = data.config?.sheet || '';
    const configSummary = id
        ? `Sheet ${id.slice(0, 16)}${id.length > 16 ? '…' : ''}${sheet ? ` · ${sheet}` : ''}`
        : 'No spreadsheet configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default GSheetReadNode;
