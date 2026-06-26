import BaseChainNode from './BaseChainNode';

const TASK_LABELS = {
    classify: 'Classify',
    extract: 'Extract',
    summarize: 'Summarize',
    redact_pii: 'Redact PII',
    custom: 'Custom',
};

const AiEnrichNode = (props) => {
    const { data } = props;
    const task = data.config?.task || 'classify';
    const input = data.config?.inputColumn || '';
    const out = data.config?.outputColumn || 'ai_result';
    const configSummary = input
        ? `${TASK_LABELS[task] || task}: ${input} → ${out}`
        : 'No input column configured';
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default AiEnrichNode;
