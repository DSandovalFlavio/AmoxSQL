import BaseChainNode from './BaseChainNode';

const WindowFunctionsNode = (props) => {
    const { data } = props;
    const windows = data.config?.windows || [];
    const configSummary = windows.length > 0
        ? windows.map(w => `${w.func}(${w.column || '*'}) AS ${w.alias || '…'}`).join(', ')
        : 'Not configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default WindowFunctionsNode;
