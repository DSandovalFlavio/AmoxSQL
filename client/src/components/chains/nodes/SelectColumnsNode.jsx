import BaseChainNode from './BaseChainNode';

const SelectColumnsNode = (props) => {
    const { data } = props;
    const columns = data.config?.columns || [];
    const configSummary = columns.length > 0
        ? `${columns.length} column${columns.length > 1 ? 's' : ''}: ${columns.map(c => c.alias || c.name).join(', ')}`
        : 'No columns selected';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SelectColumnsNode;
