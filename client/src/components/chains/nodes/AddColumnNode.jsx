import BaseChainNode from './BaseChainNode';

const AddColumnNode = (props) => {
    const { data } = props;
    const newColumns = data.config?.newColumns || [];
    const configSummary = newColumns.length > 0
        ? newColumns.map(c => c.name).join(', ')
        : 'No columns defined';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default AddColumnNode;
