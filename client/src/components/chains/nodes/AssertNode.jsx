import BaseChainNode from './BaseChainNode';

const ASSERT_LABELS = {
    not_empty: 'Not Empty',
    row_count_gt: 'Row Count >',
    no_nulls: 'No NULLs',
    unique: 'Unique Values',
    custom_query: 'Custom Query',
};

const AssertNode = (props) => {
    const { data } = props;
    const assertType = data.config?.assertType || 'not_empty';
    const label = ASSERT_LABELS[assertType] || assertType;
    const table = data.config?.tableName;
    const column = data.config?.column;

    let configSummary = label;
    if (table) configSummary += ` on ${table}`;
    if (column) configSummary += `.${column}`;
    if (assertType === 'row_count_gt' && data.config?.threshold) {
        configSummary += ` ${data.config.threshold}`;
    }

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default AssertNode;
