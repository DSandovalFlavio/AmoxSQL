import BaseChainNode from './BaseChainNode';

const UnpivotNode = (props) => {
    const { data } = props;
    const cols = data.config?.valueColumns || [];
    const nameCol = data.config?.nameColumn || 'variable';
    const valCol = data.config?.valueColumn || 'value';
    const configSummary = cols.length > 0
        ? `${cols.length} col${cols.length > 1 ? 's' : ''} → ${nameCol}, ${valCol}`
        : 'Not configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default UnpivotNode;
