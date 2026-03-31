import BaseChainNode from './BaseChainNode';

const PivotNode = (props) => {
    const { data } = props;
    const group = data.config?.groupColumn;
    const pivot = data.config?.pivotColumn;
    const value = data.config?.valueColumn;
    const agg = data.config?.aggFunc || 'SUM';
    const configSummary = group && pivot && value
        ? `${agg}(${value}) BY ${group} × ${pivot}`
        : 'Not configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default PivotNode;
