import BaseChainNode from './BaseChainNode';

const CleanNode = (props) => {
    const { data } = props;
    const ops = data.config?.operations || [];
    const configSummary = ops.length > 0
        ? `${ops.length} operation${ops.length > 1 ? 's' : ''}: ${[...new Set(ops.map(o => o.type))].join(', ')}`
        : 'Not configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default CleanNode;
