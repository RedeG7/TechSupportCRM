/**
 * Funções para gerenciar notificações
 */

/**
 * Tipos de notificações de tickets
 */
export enum TicketNotificationType {
  CREATED = 'created',
  STATUS_UPDATED = 'status_updated',
  REPLIED = 'replied',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  CANCELED = 'canceled'
}

/**
 * Interface para dados de notificação de ticket
 */
export interface TicketNotificationData {
  ticketId: number;
  ticketTitle: string;
  clientName: string;
  status?: string;
  message?: string;
  resolutionNote?: string;
  cancellationReason?: string;
}

/**
 * Enviar uma notificação por e-mail
 * @param recipient Endereço de e-mail do destinatário
 * @param subject Assunto do e-mail
 * @param body Corpo do e-mail
 */
export async function sendEmailNotification(recipient: string, subject: string, body: string) {
  try {
    const response = await fetch('/api/notifications/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient,
        subject,
        body
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error sending email notification: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to send email notification:', error);
    throw error;
  }
}

/**
 * Enviar uma notificação por WhatsApp
 * @param recipient Número do WhatsApp do destinatário
 * @param message Mensagem a ser enviada
 */
export async function sendWhatsAppNotification(recipient: string, message: string) {
  try {
    const response = await fetch('/api/notifications/whatsapp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient,
        message
      })
    });
    
    if (!response.ok) {
      throw new Error(`Error sending WhatsApp notification: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Failed to send WhatsApp notification:', error);
    throw error;
  }
}

/**
 * Enviar uma notificação de ticket
 * @param type Tipo de notificação
 * @param data Dados do ticket
 * @param email Email para notificação (opcional)
 * @param whatsapp Número do WhatsApp para notificação (opcional)
 */
export async function sendTicketNotification(
  type: TicketNotificationType,
  data: TicketNotificationData,
  email?: string,
  whatsapp?: string
) {
  // Prepara os templates de acordo com o tipo de notificação
  let emailSubject = '';
  let emailBody = '';
  let whatsappMessage = '';
  
  switch (type) {
    case TicketNotificationType.CREATED:
      emailSubject = `[Suporte RedeG7] Novo ticket #${data.ticketId} criado`;
      emailBody = `
        <h2>Novo ticket de suporte criado</h2>
        <p>Olá ${data.clientName},</p>
        <p>Um novo ticket de suporte foi criado com os seguintes detalhes:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p>Nossa equipe já foi notificada e irá atender sua solicitação em breve.</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `🔔 *Suporte RedeG7*\n\nOlá ${data.clientName}, seu ticket #${data.ticketId} - ${data.ticketTitle} foi criado com sucesso. Nossa equipe já foi notificada e irá atender sua solicitação em breve.`;
      break;
      
    case TicketNotificationType.STATUS_UPDATED:
      emailSubject = `[Suporte RedeG7] Atualização do ticket #${data.ticketId}`;
      emailBody = `
        <h2>Atualização de status do ticket</h2>
        <p>Olá ${data.clientName},</p>
        <p>O status do seu ticket de suporte foi atualizado:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p><strong>Novo status:</strong> ${data.status}</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `🔄 *Suporte RedeG7*\n\nOlá ${data.clientName}, o status do seu ticket #${data.ticketId} foi atualizado para *${data.status}*.`;
      break;
      
    case TicketNotificationType.REPLIED:
      emailSubject = `[Suporte RedeG7] Nova resposta no ticket #${data.ticketId}`;
      emailBody = `
        <h2>Nova resposta no seu ticket de suporte</h2>
        <p>Olá ${data.clientName},</p>
        <p>Há uma nova resposta no seu ticket de suporte:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p><strong>Mensagem:</strong> ${data.message}</p>
        <p>Acesse a área do cliente para responder ou verificar mais detalhes.</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `💬 *Suporte RedeG7*\n\nOlá ${data.clientName}, há uma nova resposta no seu ticket #${data.ticketId}:\n\n"${data.message}"\n\nAcesse a área do cliente para responder.`;
      break;
      
    case TicketNotificationType.RESOLVED:
      emailSubject = `[Suporte RedeG7] Ticket #${data.ticketId} resolvido`;
      emailBody = `
        <h2>Seu ticket de suporte foi resolvido</h2>
        <p>Olá ${data.clientName},</p>
        <p>Temos o prazer de informar que seu ticket de suporte foi resolvido:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p><strong>Resolução:</strong> ${data.resolutionNote}</p>
        <p>Se você tiver alguma dúvida ou precisar de assistência adicional, não hesite em nos contatar.</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `✅ *Suporte RedeG7*\n\nOlá ${data.clientName}, seu ticket #${data.ticketId} foi resolvido!\n\nResolução: ${data.resolutionNote}\n\nAgradecemos por usar nosso suporte.`;
      break;
      
    case TicketNotificationType.CLOSED:
      emailSubject = `[Suporte RedeG7] Ticket #${data.ticketId} fechado`;
      emailBody = `
        <h2>Seu ticket de suporte foi fechado</h2>
        <p>Olá ${data.clientName},</p>
        <p>Seu ticket de suporte foi fechado:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p>Se você precisar de assistência adicional, por favor abra um novo ticket.</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `🔒 *Suporte RedeG7*\n\nOlá ${data.clientName}, seu ticket #${data.ticketId} foi fechado. Se precisar de mais assistência, abra um novo ticket.`;
      break;
      
    case TicketNotificationType.CANCELED:
      emailSubject = `[Suporte RedeG7] Ticket #${data.ticketId} cancelado`;
      emailBody = `
        <h2>Seu ticket de suporte foi cancelado</h2>
        <p>Olá ${data.clientName},</p>
        <p>Seu ticket de suporte foi cancelado:</p>
        <p><strong>Ticket:</strong> #${data.ticketId} - ${data.ticketTitle}</p>
        <p><strong>Motivo:</strong> ${data.cancellationReason}</p>
        <p>Se você precisar de assistência, por favor abra um novo ticket.</p>
        <p>Atenciosamente,<br>Equipe de Suporte RedeG7</p>
      `;
      whatsappMessage = `❌ *Suporte RedeG7*\n\nOlá ${data.clientName}, seu ticket #${data.ticketId} foi cancelado.\n\nMotivo: ${data.cancellationReason}\n\nSe precisar de suporte, abra um novo ticket.`;
      break;
  }
  
  // Envia as notificações para os canais configurados
  const promises: Promise<any>[] = [];
  
  if (email && emailSubject && emailBody) {
    promises.push(sendEmailNotification(email, emailSubject, emailBody));
  }
  
  if (whatsapp && whatsappMessage) {
    promises.push(sendWhatsAppNotification(whatsapp, whatsappMessage));
  }
  
  if (promises.length > 0) {
    try {
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Error sending notifications:', error);
      return false;
    }
  }
  
  return true;
}

/**
 * API para gerenciar notificações
 */
export const notificationsAPI = {
  /**
   * Enviar notificação por e-mail
   */
  sendEmail: sendEmailNotification,
  
  /**
   * Enviar notificação por WhatsApp
   */
  sendWhatsApp: sendWhatsAppNotification,
  
  /**
   * Enviar notificação de ticket
   */
  sendTicketNotification
};