import BaseChainNode from './BaseChainNode';

const ExportFileNode = (props) => {
    const { data } = props;
    const format = (data.config?.format || 'csv').toUpperCase();
    const outputPath = data.config?.outputPath || '';
    const configSummary = outputPath
        ? `${format} → ${outputPath.split('/').pop()}`
        : 'No output configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ExportFileNode;
