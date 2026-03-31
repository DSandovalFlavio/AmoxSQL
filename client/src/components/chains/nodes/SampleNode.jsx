import BaseChainNode from './BaseChainNode';

const SampleNode = (props) => {
    const { data } = props;
    const sampleType = data.config?.sampleType || 'rows';
    const sampleValue = data.config?.sampleValue || '100';
    const configSummary = sampleType === 'percent'
        ? `Random ${sampleValue}%`
        : `First ${sampleValue} rows`;

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SampleNode;
