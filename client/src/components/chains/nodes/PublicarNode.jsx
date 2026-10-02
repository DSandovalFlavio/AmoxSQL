import BaseChainNode from './BaseChainNode';

/** Publish (C6): shows the source it leaves, fuentes."name". */
const PublicarNode = (props) => {
    const { data } = props;
    const configSummary = data.config?.fuente
        ? `→ fuentes."${data.config.fuente}"`
        : 'No source name yet';

    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default PublicarNode;
