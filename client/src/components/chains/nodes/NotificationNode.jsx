import BaseChainNode from './BaseChainNode';

const NotificationNode = (props) => {
    const { data } = props;
    const type = data.config?.notifType || 'toast';
    const msg = data.config?.message || '';
    const typeLabels = { toast: 'Toast', log_file: 'Log File', webhook: 'Webhook' };
    const configSummary = msg
        ? `${typeLabels[type] || type}: ${msg.slice(0, 30)}${msg.length > 30 ? '…' : ''}`
        : `${typeLabels[type] || type} — no message`;
    return <BaseChainNode {...props} data={{ ...data, configSummary }} />;
};

export default NotificationNode;
