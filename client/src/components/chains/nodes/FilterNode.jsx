import BaseChainNode from './BaseChainNode';

const FilterNode = (props) => {
    const { data } = props;
    const conditions = data.config?.conditions || [];
    const connector = data.config?.connector || 'AND';
    const configSummary = conditions.length > 0
        ? conditions.map(c => `${c.column} ${c.operator} ${c.value || ''}`).join(` ${connector} `)
        : 'No conditions set';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default FilterNode;
