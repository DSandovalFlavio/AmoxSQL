import BaseChainNode from './BaseChainNode';

/** A named source (C1): shows the name as it is queried, fuentes."name". */
const FuenteNode = (props) => {
    const { data } = props;
    const configSummary = data.config?.fuente
        ? `fuentes."${data.config.fuente}"`
        : 'No source selected';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default FuenteNode;
