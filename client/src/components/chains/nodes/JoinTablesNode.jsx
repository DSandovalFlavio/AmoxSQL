import BaseChainNode from './BaseChainNode';

const JoinTablesNode = (props) => {
    const { data } = props;
    const joinType = data.config?.joinType || 'LEFT';
    const leftKey = data.config?.leftKey;
    const rightKey = data.config?.rightKey;
    const configSummary = leftKey && rightKey
        ? `${joinType} JOIN on ${leftKey} = ${rightKey}`
        : `${joinType} JOIN`;

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default JoinTablesNode;
