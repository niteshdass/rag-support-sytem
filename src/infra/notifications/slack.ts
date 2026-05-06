import { logger } from '../../observability/logger.js';

export interface EscalationNotification {
  tenantId: string;
  ticketId: string;
  channel: string;
  subject?: string;
  customerEmail?: string;
  webhookUrl: string;
}

export async function notifyEscalation(n: EscalationNotification): Promise<void> {
  const text = [
    `*Escalation requested* — a customer indicated the auto-reply didn't help.`,
    `• Channel: ${n.channel}`,
    `• Ticket: ${n.ticketId}`,
    n.subject ? `• Subject: ${n.subject}` : null,
    n.customerEmail ? `• Customer: ${n.customerEmail}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const resp = await fetch(n.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!resp.ok) {
      logger.warn(
        { tenantId: n.tenantId, status: resp.status },
        'slack escalation webhook returned non-ok',
      );
    }
  } catch (err) {
    logger.error({ err, tenantId: n.tenantId }, 'slack escalation webhook failed');
  }
}
