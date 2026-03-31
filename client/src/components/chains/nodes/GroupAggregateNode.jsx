import BaseChainNode from './BaseChainNode';

const GroupAggregateNode = (props) => {
    const { data } = props;
    const groups = data.config?.groupColumns || [];
    const aggs = data.config?.aggregations || [];
    const parts = [];
    if (aggs.length > 0) parts.push(aggs.map(a => `${a.func}(${a.column})`).join(', '));
    if (groups.length > 0) parts.push(`BY ${groups.join(', ')}`);
    const configSummary = parts.length > 0 ? parts.join(' ') : 'No aggregation configured';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default GroupAggregateNode;
