import BaseChainNode from './BaseChainNode';

const BucketReadNode = (props) => {
    const { data } = props;
    const uri = data.config?.uri || '';
    const fmt = (data.config?.format || 'parquet').toUpperCase();
    const configSummary = uri
        ? `${fmt} from ${uri.slice(0, 38)}${uri.length > 38 ? '…' : ''}`
        : 'No bucket URI configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default BucketReadNode;
