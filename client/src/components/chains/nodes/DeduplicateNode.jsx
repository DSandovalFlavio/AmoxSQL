import BaseChainNode from './BaseChainNode';

const DeduplicateNode = (props) => {
    const { data } = props;
    const keyColumns = data.config?.keyColumns || [];
    const keep = data.config?.keep || 'first';
    const configSummary = keyColumns.length > 0
        ? `By ${keyColumns.join(', ')} (keep ${keep})`
        : 'Remove exact duplicates';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default DeduplicateNode;
