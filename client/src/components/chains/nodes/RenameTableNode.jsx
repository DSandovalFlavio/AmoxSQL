import BaseChainNode from './BaseChainNode';

const RenameTableNode = (props) => {
    const { data } = props;
    const newName = data.config?.newName;
    const configSummary = newName
        ? `→ ${newName}`
        : 'No name set';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default RenameTableNode;
