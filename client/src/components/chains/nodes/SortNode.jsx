import BaseChainNode from './BaseChainNode';

const SortNode = (props) => {
    const { data } = props;
    const sortColumns = data.config?.sortColumns || [];
    const configSummary = sortColumns.length > 0
        ? sortColumns.map(c => `${c.column} ${c.direction || 'ASC'}`).join(', ')
        : 'No sort columns set';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SortNode;
