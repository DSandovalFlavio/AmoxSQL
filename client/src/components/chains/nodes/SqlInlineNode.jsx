import BaseChainNode from './BaseChainNode';

const SqlInlineNode = (props) => {
    const { data } = props;
    const query = data.config?.query || '';
    const configSummary = query
        ? query.slice(0, 60).replace(/\n/g, ' ') + (query.length > 60 ? '...' : '')
        : 'No query defined';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SqlInlineNode;
