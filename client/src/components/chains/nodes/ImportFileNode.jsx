import BaseChainNode from './BaseChainNode';

const ImportFileNode = (props) => {
    const { data } = props;
    const file = data.config?.sourcePath ? data.config.sourcePath.split('/').pop() : '';
    const table = data.config?.tableName || '';
    const configSummary = file
        ? `${file} → ${table || '?'}`
        : 'No file configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ImportFileNode;
