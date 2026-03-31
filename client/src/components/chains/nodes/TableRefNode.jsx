import BaseChainNode from './BaseChainNode';

const TableRefNode = (props) => {
    const { data } = props;
    const configSummary = data.config?.tableName
        ? `📋 ${data.config.tableName}`
        : 'No table selected';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default TableRefNode;
