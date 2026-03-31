import BaseChainNode from './BaseChainNode';

const SqlFileNode = (props) => {
    const { data } = props;
    const configSummary = data.config?.filePath
        ? data.config.filePath.split('/').pop()
        : 'No file selected';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SqlFileNode;
