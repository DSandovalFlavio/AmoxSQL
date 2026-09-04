import BaseChainNode from './BaseChainNode';

const ChartNode = (props) => {
    const { data } = props;
    const outputPath = data.config?.outputPath || '';
    const chartType = data.config?.chartType || 'bar';
    const configSummary = outputPath
        ? `${chartType} → ${outputPath.split('/').pop()}`
        : 'No output configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default ChartNode;
