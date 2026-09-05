import BaseChainNode from './BaseChainNode';

const ReportNode = (props) => {
    const { data } = props;
    const outputPath = data.config?.outputPath || '';
    const outputType = data.config?.outputType === 'deck' ? 'Deck' : 'Notebook';
    const configSummary = outputPath
        ? `${outputType} → ${outputPath.split('/').pop()}`
        : 'No output configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ReportNode;
