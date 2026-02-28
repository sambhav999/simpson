import { logger } from './logger';
import axios from 'axios';

export class AlertService {
    private webhookUrl: string | undefined;

    constructor() {
        this.webhookUrl = process.env.ALERT_WEBHOOK_URL;
    }

    async sendAlert(title: string, message: string): Promise<void> {
        logger.warn(`ALERT: ${title} - ${message}`);

        if (!this.webhookUrl) {
            logger.debug('No ALERT_WEBHOOK_URL configured, skipping external alert');
            return;
        }

        try {
            await axios.post(this.webhookUrl, {
                content: `**${title}**\n${message}`
            });
        } catch (err) {
            logger.error('Failed to send external alert', err);
        }
    }
}
