import type { Ticket } from "@shared/schema";
import { pool } from "./db";
import { storage } from "./storage";
import { whatsappBaileysService } from "./whatsapp-baileys";

async function resolveRecipient(ticket: Pick<Ticket, "clientId" | "createdByContactId">) {
  const client = await storage.getClient(ticket.clientId);
  if (!client) return null;

  if (ticket.createdByContactId) {
    const contact = await storage.getClientContact(ticket.createdByContactId);
    const phone = contact?.whatsapp || contact?.phone;
    if (contact?.isActive !== false && phone) {
      return { phone, name: contact.name || client.tradeName || client.businessName };
    }
  }

  const contacts = await storage.getClientContacts(ticket.clientId);
  const preferredContact =
    contacts.find((contact) => contact.isActive !== false && contact.isPrimary && (contact.whatsapp || contact.phone)) ||
    contacts.find((contact) => contact.isActive !== false && (contact.whatsapp || contact.phone));

  if (preferredContact) {
    return {
      phone: preferredContact.whatsapp || preferredContact.phone!,
      name: preferredContact.name || client.tradeName || client.businessName,
    };
  }

  return client.phone
    ? { phone: client.phone, name: client.tradeName || client.businessName }
    : null;
}

export async function notifyTicketOpened(ticket: Ticket): Promise<boolean> {
  const recipient = await resolveRecipient(ticket);
  const status = await whatsappBaileysService.getStatus();
  if (!recipient || !status.isConnected) return false;

  const message =
    `✅ *CHAMADO ABERTO COM SUCESSO*\n\n` +
    `Olá, ${recipient.name}!\n\n` +
    `📋 *Número do Chamado:* #${ticket.id}\n` +
    `📌 *Título:* ${ticket.title}\n` +
    `📁 *Categoria:* ${ticket.category}\n` +
    `⚡ *Prioridade:* ${ticket.priority}\n` +
    `📅 *Data:* ${new Date(ticket.createdAt).toLocaleString("pt-BR")}\n\n` +
    `📝 *Descrição:*\n${ticket.description.substring(0, 300)}${ticket.description.length > 300 ? "..." : ""}\n\n` +
    `Nossa equipe entrará em contato em breve.`;

  const result = await whatsappBaileysService.sendMessage(recipient.phone, message, false);
  if (result.success) {
    console.log(`[WHATSAPP-NOTIFY] Abertura do chamado #${ticket.id} enviada para o contato vinculado`);
  }
  return result.success;
}

async function processDueReminders() {
  const status = await whatsappBaileysService.getStatus();
  if (!status.isConnected) return;

  const due = await pool.query(
    `SELECT *
       FROM tickets
      WHERE reminder_date IS NOT NULL
        AND reminder_date <= NOW()
        AND reminder_notified_at IS NULL
        AND status NOT IN ('closed', 'fechado', 'resolved', 'resolvido', 'cancelled', 'cancelado')
      ORDER BY reminder_date
      LIMIT 50`
  );

  for (const row of due.rows) {
    const ticket = await storage.getTicket(row.id);
    if (!ticket) continue;
    const recipient = await resolveRecipient(ticket);
    if (!recipient) continue;

    const reminderDate = new Date(row.reminder_date);
    const message =
      `⏰ *LEMBRETE DE ATENDIMENTO*\n\n` +
      `Olá, ${recipient.name}!\n\n` +
      `📋 *Chamado:* #${ticket.id}\n` +
      `📌 *Título:* ${ticket.title}\n` +
      `📅 *Lembrete:* ${reminderDate.toLocaleString("pt-BR")}\n` +
      (row.reminder_note ? `📝 *Observação:* ${row.reminder_note}\n` : "") +
      `\nEsta é uma notificação automática do Suporte RedeG7.`;

    const result = await whatsappBaileysService.sendMessage(recipient.phone, message, false);
    if (result.success) {
      await pool.query(
        `UPDATE tickets SET reminder_notified_at = NOW() WHERE id = $1 AND reminder_notified_at IS NULL`,
        [ticket.id]
      );
      console.log(`[WHATSAPP-NOTIFY] Lembrete do chamado #${ticket.id} enviado para o contato vinculado`);
    }
  }
}

let reminderTimer: NodeJS.Timeout | null = null;

export function startWhatsAppReminderScheduler() {
  if (reminderTimer) return;

  const run = () => {
    processDueReminders().catch((error) =>
      console.error("[WHATSAPP-NOTIFY] Erro ao processar lembretes:", error)
    );
  };

  setTimeout(run, 10_000);
  reminderTimer = setInterval(run, 60_000);
}