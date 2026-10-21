import BaseChainNode from './BaseChainNode';

/** Excel (5.11, D3): how many sheets, or which template, and the file it leaves. */
const ExcelNode = (props) => {
    const { data } = props;
    const c = data.config || {};
    const archivo = c.outputPath ? String(c.outputPath).split(/[\/]/).pop() : null;
    const configSummary = c.modo === 'plantilla'
        ? (c.plantilla ? `Template ${String(c.plantilla).split(/[\/]/).pop()}${archivo ? ` → ${archivo}` : ''}` : 'No template yet')
        : (archivo ? `→ ${archivo}` : 'Not saved anywhere yet');

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ExcelNode;
