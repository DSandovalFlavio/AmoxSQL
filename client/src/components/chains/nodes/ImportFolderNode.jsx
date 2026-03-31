import BaseChainNode from './BaseChainNode';

const ImportFolderNode = (props) => {
    const { data } = props;
    const folder = data.config?.folderPath || '';
    const pattern = data.config?.filePattern || '*.csv';
    const table = data.config?.tableName || '';
    const configSummary = folder
        ? `${folder}/${pattern} → ${table || '?'}`
        : 'No folder configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ImportFolderNode;
