import BaseChainNode from './BaseChainNode';

const CreateTableNode = (props) => {
    const { data } = props;
    const tableName = data.config?.tableName;
    const hasQuery = !!data.config?.query;
    const configSummary = tableName
        ? `→ ${tableName}${hasQuery ? ' (custom query)' : ' (from upstream)'}`
        : 'No table name set';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default CreateTableNode;
