import BaseChainNode from './BaseChainNode';

const TypeCastNode = (props) => {
    const { data } = props;
    const casts = data.config?.casts || [];
    const configSummary = casts.length > 0
        ? `${casts.length} column${casts.length > 1 ? 's' : ''} → ${casts.map(c => c.targetType).join(', ')}`
        : 'Not configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default TypeCastNode;
