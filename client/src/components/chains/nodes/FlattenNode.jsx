import BaseChainNode from './BaseChainNode';

const FlattenNode = (props) => {
    const { data } = props;
    const cfg = data.config || {};
    const configSummary = !cfg.column
        ? 'Not configured'
        : cfg.mode === 'explode'
            ? `explode ${cfg.column} → rows`
            : `extract ${(cfg.paths || []).length} field${(cfg.paths || []).length === 1 ? '' : 's'} from ${cfg.column}`;
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default FlattenNode;
