import BaseChainNode from './BaseChainNode';

const MergeTablesNode = (props) => {
    const { data } = props;
    const mode = data.config?.mergeMode === 'union' ? 'UNION' : 'UNION ALL';
    const configSummary = data.config?.tableName
        ? `${mode} → ${data.config.tableName}`
        : mode;

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default MergeTablesNode;
