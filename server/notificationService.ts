import nodemailer from 'nodemailer';
import { whatsappService } from './whatsapp-service';

// Interface para dados de notificação por email
interface EmailNotification {
  recipient: string;
  subject: string;
  body: string;
}

// Interface para dados de notificação por WhatsApp
interface WhatsAppNotification {
  recipient: string;
  message: string;
}

// Interface para notificação via CallMeBot
interface CallMeBotNotification {
  phone: string;
  apiKey: string;
  message: string;
}

/**
 * Configurações para serviço de email
 * Nota: Em ambiente de produção, use variáveis de ambiente para estas configurações
 */
const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  user: process.env.EMAIL_USER || 'dummy@example.com',
  pass: process.env.EMAIL_PASSWORD || 'dummy-password',
  from: process.env.EMAIL_FROM || 'Suporte RedeG7 <suporte@redeg7.com.br>'
};

/**
 * Serviço responsável por enviar notificações por diferentes canais
 */
class NotificationService {
  private emailTransporter: nodemailer.Transporter;
  private whatsappEnabled: boolean;
  
  constructor() {
    // Configura o transportador de email
    this.emailTransporter = nodemailer.createTransport({
      service: emailConfig.service,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass
      }
    });
    
    // Habilita WhatsApp com QR Code (sem necessidade de API key)
    this.whatsappEnabled = true;
  }
  
  /**
   * Envia uma notificação por email
   * @param data Dados para a notificação por email
   * @returns Resultado do envio
   */
  async sendEmail(data: EmailNotification): Promise<{ success: boolean; message?: string }> {
    try {
      // Verifica se as credenciais estão configuradas
      if (!emailConfig.user || emailConfig.user === 'dummy@example.com') {
        console.warn('Email não enviado: credenciais de email não configuradas');
        return { 
          success: false, 
          message: 'Credenciais de email não configuradas. Configure EMAIL_USER e EMAIL_PASSWORD nas variáveis de ambiente.'
        };
      }
      
      // Prepara a mensagem
      const mailOptions = {
        from: emailConfig.from,
        to: data.recipient,
        subject: data.subject,
        html: data.body
      };
      
      // Envia o email
      const info = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email enviado:', info.messageId);
      
      return { success: true };
    } catch (error) {
      console.error('Erro ao enviar email:', error);
      return { 
        success: false, 
        message: `Erro ao enviar email: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  /**
   * Envia uma notificação por WhatsApp usando WhatsApp Web via QR Code
   * @param data Dados para a notificação por WhatsApp
   * @returns Resultado do envio
   */
  async sendWhatsApp(data: WhatsAppNotification): Promise<{ success: boolean; message?: string }> {
    if (!this.whatsappEnabled) {
      console.log(`Mensagem WhatsApp simulada para ${data.recipient}: ${data.message}`);
      return { success: true };
    }
    
    try {
      // Envia a mensagem usando o serviço de WhatsApp com QR Code
      const result = await whatsappService.sendMessage(data.recipient, data.message);
      return result;
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      return { 
        success: false, 
        message: `Erro ao enviar WhatsApp: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Inicializa o serviço de WhatsApp (é iniciado sob demanda)
   */
  async initializeWhatsApp(): Promise<void> {
    if (this.whatsappEnabled) {
      await whatsappService.initialize();
    }
  }

  /**
   * Retorna o status da conexão WhatsApp
   */
  getWhatsAppStatus() {
    return whatsappService.getStatus();
  }

  /**
   * Retorna o QR Code atual para autenticação do WhatsApp
   */
  getWhatsAppQrCode() {
    return whatsappService.getQrCode();
  }

  /**
   * Registra um callback para ser chamado quando o QR Code for atualizado
   */
  onWhatsAppQrCodeUpdate(callback: (qrCode: string) => void) {
    whatsappService.onQrCodeUpdate(callback);
  }

  /**
   * Envia uma notificação por WhatsApp usando CallMeBot API
   * API gratuita que permite enviar mensagens para números WhatsApp cadastrados
   * @param phone Número do telefone (formato: 5511999999999)
   * @param apiKey Chave API do CallMeBot
   * @param message Mensagem a ser enviada
   * @returns Resultado do envio
   */
  async sendWhatsAppViaCallMeBot(phone: string, apiKey: string, message: string): Promise<{ success: boolean; message?: string }> {
    try {
      // Formatar número para o formato CallMeBot (sem +)
      const formattedPhone = phone.replace(/\D/g, '');
      
      // Codificar a mensagem para URL
      const encodedMessage = encodeURIComponent(message);
      
      // URL da API CallMeBot
      const url = `https://api.callmebot.com/whatsapp.php?phone=${formattedPhone}&text=${encodedMessage}&apikey=${apiKey}`;
      
      // Fazer a requisição
      const response = await fetch(url);
      const responseText = await response.text();
      
      if (response.ok && responseText.includes('Message queued')) {
        console.log(`WhatsApp enviado via CallMeBot para ${formattedPhone}`);
        return { success: true, message: 'Mensagem enviada com sucesso' };
      } else {
        console.error('Erro CallMeBot:', responseText);
        return { success: false, message: `Erro ao enviar: ${responseText}` };
      }
    } catch (error) {
      console.error('Erro ao enviar WhatsApp via CallMeBot:', error);
      return { 
        success: false, 
        message: `Erro ao enviar WhatsApp: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Envia notificação de novo chamado para o administrador
   * Tenta primeiro via WhatsApp Baileys (conexão direta), depois via CallMeBot
   */
  async sendTicketNotificationToAdmin(ticketData: {
    ticketId: number;
    title: string;
    description: string;
    category: string;
    priority: string;
    clientName: string;
    clientPhone?: string;
    contactName?: string;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const { pool } = await import('./db');
      const settingsResult = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('whatsappAdminNumber', 'callmebotApiKey')"
      );
      
      const settings: Record<string, string> = {};
      settingsResult.rows.forEach((row: { key: string; value: string }) => {
        settings[row.key] = row.value;
      });
      
      const adminPhone = settings.whatsappAdminNumber;
      const apiKey = settings.callmebotApiKey;
      
      if (!adminPhone) {
        console.log('Número do administrador não configurado - pulando notificação WhatsApp');
        return { success: false, message: 'Número do administrador não configurado' };
      }
      
      // Montar mensagem
      const message = `🎫 *NOVO CHAMADO #${ticketData.ticketId}*\n\n` +
        `📋 *Título:* ${ticketData.title}\n` +
        `🏢 *Cliente:* ${ticketData.clientName}\n` +
        (ticketData.clientPhone ? `📞 *Telefone:* ${ticketData.clientPhone}\n` : '') +
        (ticketData.contactName ? `👤 *Contato:* ${ticketData.contactName}\n` : '') +
        `📁 *Categoria:* ${ticketData.category}\n` +
        `⚡ *Prioridade:* ${ticketData.priority}\n` +
        `📅 *Data:* ${new Date().toLocaleString('pt-BR')}\n\n` +
        `📝 *Descrição:*\n${ticketData.description.substring(0, 300)}${ticketData.description.length > 300 ? '...' : ''}`;
      
      // Tentar primeiro via WhatsApp Baileys (conexão direta)
      try {
        const { whatsappBaileysService } = await import('./whatsapp-baileys');
        const status = await whatsappBaileysService.getStatus();
        
        if (status.isConnected) {
          console.log('Enviando notificação via WhatsApp Baileys (conexão direta)...');
          // Usar modo silencioso (storeInternally=false) para não criar conversa interna
          const result = await whatsappBaileysService.sendMessage(adminPhone, message, false);
          if (result.success) {
            return result;
          }
        }
      } catch (baileysError) {
        console.log('WhatsApp Baileys não disponível, tentando CallMeBot...');
      }
      
      // Fallback para CallMeBot se configurado
      if (apiKey) {
        console.log('Enviando notificação via CallMeBot...');
        return await this.sendWhatsAppViaCallMeBot(adminPhone, apiKey, message);
      }
      
      return { success: false, message: 'Nenhum método de envio WhatsApp disponível' };
    } catch (error) {
      console.error('Erro ao enviar notificação de ticket:', error);
      return { success: false, message: String(error) };
    }
  }
}

// Exporta uma instância única do serviço de notificações
export const notificationService = new NotificationService();