import BaseChainNode from './BaseChainNode';

const HttpFetchNode = (props) => {
    const { data } = props;
    const url = data.config?.url || '';
    const fmt = data.config?.format || 'csv';
    const configSummary = url
        ? `${fmt.toUpperCase()} from ${url.replace(/^https?:\/\//, '').slice(0, 30)}${url.length > 40 ? '…' : ''}`
        : 'No URL configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default HttpFetchNode;
