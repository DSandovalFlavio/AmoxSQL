import BaseChainNode from './BaseChainNode';

const SchemaValidationNode = (props) => {
    const { data } = props;
    const cols = data.config?.expectedColumns || [];
    const strict = data.config?.strict ? ' (strict)' : '';
    const configSummary = cols.length > 0
        ? `${cols.length} expected column${cols.length > 1 ? 's' : ''}${strict}`
        : 'Not configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default SchemaValidationNode;
