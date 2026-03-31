import BaseChainNode from './BaseChainNode';

const CheckpointNode = (props) => {
    const { data } = props;
    const configSummary = data.config?.resumeLabel || 'Execution pauses here';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default CheckpointNode;
