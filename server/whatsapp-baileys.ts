import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  WASocket,
  proto,
  makeCacheableSignalKeyStore,
  jidNormalizedUser,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db';
import { aiService, WhatsAppConversationContext } from './aiService';
import { storage } from './storage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_DIR = path.join(__dirname, '../whatsapp-auth');

if (!fs.existsSync(AUTH_DIR)) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
}

interface StoredMessage {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  body: string;
  timestamp: number;
  contactName: string;
}

interface StoredContact {
  id: string;
  name: string;
  number: string;
  profilePictureUrl: string | null;
  lastMessageTime: number;
  unreadCount: number;
  status: string;
  conversationId: number | null;
}

interface Conversation {
  id: number;
  phoneNumber: string;
  contactName: string | null;
  status: string;
  attendantId: number | null;
  clientId: number | null;
  ticketId: number | null;
  lastMessageAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
}

class WhatsAppBaileysService {
  private socket: WASocket | null = null;
  private qrCode: string | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'authenticating' | 'connected' = 'disconnected';
  private onQrCodeUpdateCallbacks: ((qrCode: string) => void)[] = [];
  private onConnectionCallbacks: ((isConnected: boolean) => void)[] = [];
  private onMessageCallbacks: ((message: StoredMessage) => void)[] = [];
  private isInitializing = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  
  private messages: Map<string, StoredMessage[]> = new Map();
  private contacts: Map<string, StoredContact> = new Map();
  private lastError: string | null = null;
  // Conversation context per JID (phone number) for AI flow
  private waContexts: Map<string, WhatsAppConversationContext> = new Map();

  constructor() {
    console.log('WhatsApp Baileys Service inicializado');
    // Tentar auto-reconexão ao iniciar
    this.tryAutoReconnect();
  }

  private async tryAutoReconnect(): Promise<void> {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    
    if (fs.existsSync(credsPath)) {
      try {
        const credsContent = fs.readFileSync(credsPath, 'utf-8');
        const creds = JSON.parse(credsContent);
        
        // Verificar se há credenciais registradas (me.id indica que já foi autenticado)
        if (creds && creds.me && creds.me.id) {
          console.log('Sessão WhatsApp encontrada, tentando reconectar automaticamente...');
          setTimeout(async () => {
            try {
              const result = await this.initialize();
              if (result.success || result.status === 'connecting') {
                console.log('Auto-reconexão do WhatsApp iniciada com sucesso');
              } else {
                console.log('Auto-reconexão falhou:', result.message);
              }
            } catch (error) {
              console.error('Erro na auto-reconexão:', error);
            }
          }, 3000); // Aguardar 3 segundos após iniciar o servidor
        } else {
          console.log('Nenhuma sessão WhatsApp ativa encontrada. Escaneie o QR Code para conectar.');
        }
      } catch (error) {
        console.log('Erro ao ler credenciais do WhatsApp:', error);
      }
    } else {
      console.log('Nenhuma sessão WhatsApp salva. Escaneie o QR Code para conectar.');
    }
  }

  async initialize(): Promise<{ success: boolean; message: string; hasQrCode?: boolean; status: string }> {
    if (this.isInitializing) {
      return { success: false, message: 'Inicialização já em andamento', status: this.connectionStatus };
    }

    if (this.connectionStatus === 'connected' && this.socket) {
      return { success: true, message: 'WhatsApp já conectado', status: 'connected' };
    }

    this.isInitializing = true;
    this.connectionStatus = 'connecting';
    this.lastError = null;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
      const { version } = await fetchLatestBaileysVersion();
      console.log(`Usando WhatsApp Web versão: ${version.join('.')}`);
      
      const logger = pino({ level: 'silent' });

      this.socket = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        printQRInTerminal: false,
        logger,
        browser: ['Chrome (Linux)', 'Chrome', '124.0.0'],
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        emitOwnEvents: true,
        markOnlineOnConnect: false
      });

      this.socket.ev.on('creds.update', saveCreds);

      this.socket.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log('Novo QR Code recebido');
          this.connectionStatus = 'authenticating';
          try {
            this.qrCode = await QRCode.toDataURL(qr, {
              errorCorrectionLevel: 'M',
              margin: 2,
              width: 256
            });
            this.onQrCodeUpdateCallbacks.forEach(cb => cb(this.qrCode!));
          } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
          }
        }

        if (connection === 'close') {
          const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = reason !== DisconnectReason.loggedOut;
          
          console.log('Conexão fechada, motivo:', reason);
          this.connectionStatus = 'disconnected';
          this.qrCode = null;
          this.isInitializing = false;

          if (reason === 405) {
            this.lastError = 'Conexão recusada pelo WhatsApp (erro 405). Tente novamente em alguns minutos.';
          } else if (reason === 401) {
            this.lastError = 'Sessão expirada. Escaneie o QR Code novamente.';
          } else if (reason) {
            this.lastError = `Conexão encerrada (código ${reason})`;
          }
          
          this.onConnectionCallbacks.forEach(cb => cb(false));

          if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Tentando reconectar... (tentativa ${this.reconnectAttempts})`);
            setTimeout(() => this.initialize(), 5000);
          } else if (reason === DisconnectReason.loggedOut) {
            console.log('Usuário deslogou, limpando sessão...');
            await this.clearSession();
          }
        }

        if (connection === 'open') {
          console.log('WhatsApp conectado com sucesso!');
          this.connectionStatus = 'connected';
          this.qrCode = null;
          this.isInitializing = false;
          this.reconnectAttempts = 0;
          
          this.onConnectionCallbacks.forEach(cb => cb(true));
        }
      });

      this.socket.ev.on('messages.upsert', async (m) => {
        // isHistory: mensagens do histórico não disparam bot, apenas armazenamento
        const isHistory = m.type !== 'notify';

        for (const msg of m.messages) {
          if (msg.message && msg.key.remoteJid) {
            const messageText = this.extractMessageText(msg.message);
            if (messageText) {
              const storedMessage: StoredMessage = {
                id: msg.key.id || Date.now().toString(),
                remoteJid: msg.key.remoteJid,
                fromMe: msg.key.fromMe || false,
                body: messageText,
                timestamp: (msg.messageTimestamp as number) * 1000 || Date.now(),
                contactName: msg.pushName || this.formatPhoneNumber(msg.key.remoteJid)
              };
              
              this.storeMessage(storedMessage);
              this.updateContact(msg.key.remoteJid, msg.pushName || '', storedMessage.timestamp, !msg.key.fromMe);
              this.onMessageCallbacks.forEach(cb => cb(storedMessage));
              
              // Só responde via bot para mensagens NOVAS (não histórico) recebidas de terceiros
              if (!msg.key.fromMe && !isHistory) {
                const jid = msg.key.remoteJid!;
                console.log(`[WA-BOT] Mensagem recebida de ${storedMessage.contactName} (${jid}): "${messageText.substring(0, 80)}"`);
                try {
                  const context: WhatsAppConversationContext = this.waContexts.get(jid) || {
                    history: [],
                    identifiedClientId: null,
                    identifiedClientName: null,
                  };

                  console.log(`[WA-BOT] Contexto: empresa=${context.identifiedClientName || 'não identificada'}, histórico=${context.history.length} msgs`);
                  console.log(`[WA-BOT] Chamando IA...`);

                  const { reply, updatedContext, ticketCreated } = await aiService.handleWhatsAppMessage(
                    messageText,
                    context,
                    storage,
                    storedMessage.contactName
                  );

                  console.log(`[WA-BOT] Resposta da IA: "${reply.substring(0, 100)}"`);

                  if (updatedContext.history.length > 20) {
                    updatedContext.history = updatedContext.history.slice(-20);
                  }
                  this.waContexts.set(jid, updatedContext);

                  await this.sendMessage(jid, reply);
                  console.log(`[WA-BOT] Resposta enviada para ${jid}`);

                  if (ticketCreated) {
                    console.log(`[WA-BOT] Chamado #${ticketCreated.id} criado via WhatsApp para ${storedMessage.contactName}`);
                  }
                  if (updatedContext.identifiedClientId && !context.identifiedClientId) {
                    console.log(`[WA-BOT] Empresa identificada: ${updatedContext.identifiedClientName} (ID: ${updatedContext.identifiedClientId})`);
                  }
                } catch (aiError: any) {
                  console.error('[WA-BOT] ERRO ao gerar resposta via IA:', aiError?.message || aiError);
                  console.error('[WA-BOT] Stack:', aiError?.stack?.split('\n').slice(0, 3).join(' | '));
                }
              }
            }
          }
        }
      });

      return { 
        success: true, 
        message: 'WhatsApp inicializando, aguarde o QR Code', 
        hasQrCode: false,
        status: this.connectionStatus 
      };

    } catch (error) {
      console.error('Erro ao inicializar WhatsApp Baileys:', error);
      this.connectionStatus = 'disconnected';
      this.isInitializing = false;
      return { 
        success: false, 
        message: `Erro: ${error instanceof Error ? error.message : 'desconhecido'}`,
        status: 'disconnected'
      };
    }
  }

  private extractMessageText(message: proto.IMessage): string | null {
    if (message.conversation) return message.conversation;
    if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
    if (message.imageMessage?.caption) return `[Imagem] ${message.imageMessage.caption}`;
    if (message.videoMessage?.caption) return `[Vídeo] ${message.videoMessage.caption}`;
    if (message.documentMessage?.fileName) return `[Documento] ${message.documentMessage.fileName}`;
    if (message.audioMessage) return '[Áudio]';
    if (message.stickerMessage) return '[Sticker]';
    if (message.contactMessage?.displayName) return `[Contato] ${message.contactMessage.displayName}`;
    if (message.locationMessage) return '[Localização]';
    return null;
  }

  private formatPhoneNumber(jid: string): string {
    return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  private async storeMessage(message: StoredMessage): Promise<void> {
    const jid = message.remoteJid;
    const phoneNumber = this.formatPhoneNumber(jid);
    console.log(`Armazenando mensagem para ${jid}: "${message.body.substring(0, 30)}..." fromMe: ${message.fromMe}`);
    
    if (!this.messages.has(jid)) {
      this.messages.set(jid, []);
    }
    const messages = this.messages.get(jid)!;
    const exists = messages.find(m => m.id === message.id);
    if (!exists) {
      messages.push(message);
      messages.sort((a, b) => a.timestamp - b.timestamp);
      if (messages.length > 100) {
        messages.shift();
      }
      console.log(`Total de mensagens armazenadas para ${jid}: ${messages.length}`);
    }

    try {
      let conversation = await this.getOrCreateConversation(phoneNumber, message.contactName);
      
      await pool.query(
        `INSERT INTO whatsapp_messages (conversation_id, phone_number, message_id, body, from_me, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [conversation.id, phoneNumber, message.id, message.body, message.fromMe, new Date(message.timestamp)]
      );

      await pool.query(
        `UPDATE whatsapp_conversations SET last_message_at = $1, updated_at = NOW() WHERE id = $2`,
        [new Date(message.timestamp), conversation.id]
      );

      if (!message.fromMe && conversation.status === 'finalizado') {
        await pool.query(
          `UPDATE whatsapp_conversations SET status = 'aguardando', updated_at = NOW() WHERE id = $1`,
          [conversation.id]
        );
      }
    } catch (error) {
      console.error('Erro ao salvar mensagem no banco:', error);
    }
  }

  private async getOrCreateConversation(phoneNumber: string, contactName?: string): Promise<Conversation> {
    const result = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE phone_number = $1 ORDER BY created_at DESC LIMIT 1`,
      [phoneNumber]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0] as Conversation;
    }

    const insertResult = await pool.query(
      `INSERT INTO whatsapp_conversations (phone_number, contact_name, status)
       VALUES ($1, $2, 'aguardando')
       RETURNING *`,
      [phoneNumber, contactName || null]
    );
    
    return insertResult.rows[0] as Conversation;
  }

  private async updateContact(jid: string, name: string, timestamp: number, incrementUnread: boolean): Promise<void> {
    const existing = this.contacts.get(jid);
    const phoneNumber = this.formatPhoneNumber(jid);
    
    this.contacts.set(jid, {
      id: jid,
      name: name || existing?.name || phoneNumber,
      number: phoneNumber,
      profilePictureUrl: existing?.profilePictureUrl || null,
      lastMessageTime: Math.max(timestamp, existing?.lastMessageTime || 0),
      unreadCount: incrementUnread ? (existing?.unreadCount || 0) + 1 : (existing?.unreadCount || 0),
      status: existing?.status || 'aguardando',
      conversationId: existing?.conversationId || null
    });

    if (name) {
      try {
        await pool.query(
          `UPDATE whatsapp_conversations SET contact_name = $1, updated_at = NOW() 
           WHERE phone_number = $2 AND (contact_name IS NULL OR contact_name = '')`,
          [name, phoneNumber]
        );
      } catch (error) {
        console.error('Erro ao atualizar nome do contato:', error);
      }
    }
  }

  async getConversationsByStatus(status: string, tenantId?: number | null): Promise<Conversation[]> {
    if (tenantId !== undefined && tenantId !== null) {
      const result = await pool.query(
        `SELECT * FROM whatsapp_conversations WHERE status = $1 AND tenant_id = $2 ORDER BY last_message_at DESC`,
        [status, tenantId]
      );
      return result.rows as Conversation[];
    }
    const result = await pool.query(
      `SELECT * FROM whatsapp_conversations WHERE status = $1 ORDER BY last_message_at DESC`,
      [status]
    );
    return result.rows as Conversation[];
  }

  async getAllConversations(tenantId?: number | null): Promise<Conversation[]> {
    if (tenantId !== undefined && tenantId !== null) {
      const result = await pool.query(
        `SELECT * FROM whatsapp_conversations WHERE tenant_id = $1 ORDER BY last_message_at DESC`,
        [tenantId]
      );
      return result.rows as Conversation[];
    }
    const result = await pool.query(
      `SELECT * FROM whatsapp_conversations ORDER BY last_message_at DESC`
    );
    return result.rows as Conversation[];
  }

  async startAttending(conversationId: number, attendantId: number, attendantName: string, tenantId?: number | null): Promise<{ success: boolean; message: string }> {
    try {
      const convResult = await pool.query(
        `SELECT phone_number, contact_name FROM whatsapp_conversations WHERE id = $1`,
        [conversationId]
      );
      
      if (convResult.rows.length === 0) {
        return { success: false, message: 'Conversa não encontrada' };
      }
      
      const conversation = convResult.rows[0];
      
      await pool.query(
        `UPDATE whatsapp_conversations 
         SET status = 'atendendo', attendant_id = $1, tenant_id = $3, started_at = NOW(), updated_at = NOW() 
         WHERE id = $2`,
        [attendantId, conversationId, tenantId ?? null]
      );
      
      const greetingMessage = `Olá! Meu nome é ${attendantName} e darei continuidade em seu atendimento.`;
      await this.sendMessage(conversation.phone_number, greetingMessage);
      
      return { success: true, message: 'Atendimento iniciado' };
    } catch (error) {
      console.error('Erro ao iniciar atendimento:', error);
      return { success: false, message: `Erro: ${error}` };
    }
  }

  async finishConversation(conversationId: number, sendFarewellMessage: boolean = false, clientName?: string): Promise<{ success: boolean; message: string }> {
    try {
      const convResult = await pool.query(
        `SELECT phone_number, contact_name FROM whatsapp_conversations WHERE id = $1`,
        [conversationId]
      );
      
      if (convResult.rows.length === 0) {
        return { success: false, message: 'Conversa não encontrada' };
      }
      
      const conversation = convResult.rows[0];
      const name = clientName || conversation.contact_name || 'Cliente';
      
      await pool.query(
        `UPDATE whatsapp_conversations 
         SET status = 'finalizado', finished_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [conversationId]
      );
      
      if (sendFarewellMessage) {
        const farewellMessage = `👋🏻 Atendimento finalizado!\n${name}, obrigado por escolher a RedeG7 Soluções em TI 🔰🔐\nEstamos sempre à disposição 😉`;
        await this.sendMessage(conversation.phone_number, farewellMessage);
      }
      
      return { success: true, message: 'Conversa finalizada' };
    } catch (error) {
      console.error('Erro ao finalizar conversa:', error);
      return { success: false, message: `Erro: ${error}` };
    }
  }

  async saveRating(data: { conversationId: number; ticketId?: number; clientId?: number; attendantId?: number; rating: number; comment?: string }): Promise<{ success: boolean; message: string }> {
    try {
      await pool.query(
        `INSERT INTO service_ratings (conversation_id, ticket_id, client_id, attendant_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.conversationId, data.ticketId || null, data.clientId || null, data.attendantId || null, data.rating, data.comment || null]
      );
      return { success: true, message: 'Avaliação salva' };
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      return { success: false, message: `Erro: ${error}` };
    }
  }

  async getRatingsStats(): Promise<{ totalRatings: number; averageRating: number; ratingsByScore: Record<number, number> }> {
    try {
      const totalResult = await pool.query(`SELECT COUNT(*) as total, AVG(rating) as average FROM service_ratings`);
      const byScoreResult = await pool.query(`SELECT rating, COUNT(*) as count FROM service_ratings GROUP BY rating ORDER BY rating`);
      
      const ratingsByScore: Record<number, number> = {};
      byScoreResult.rows.forEach((row: { rating: number; count: string }) => {
        ratingsByScore[row.rating] = parseInt(row.count);
      });
      
      return {
        totalRatings: parseInt(totalResult.rows[0]?.total || '0'),
        averageRating: parseFloat(totalResult.rows[0]?.average || '0'),
        ratingsByScore
      };
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return { totalRatings: 0, averageRating: 0, ratingsByScore: {} };
    }
  }

  async linkTicketToConversation(conversationId: number, ticketId: number): Promise<{ success: boolean; message: string }> {
    try {
      await pool.query(
        `UPDATE whatsapp_conversations SET ticket_id = $1, updated_at = NOW() WHERE id = $2`,
        [ticketId, conversationId]
      );
      return { success: true, message: 'Chamado vinculado à conversa' };
    } catch (error) {
      console.error('Erro ao vincular chamado:', error);
      return { success: false, message: `Erro: ${error}` };
    }
  }

  async getConversationMessages(conversationId: number): Promise<StoredMessage[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM whatsapp_messages WHERE conversation_id = $1 ORDER BY timestamp ASC`,
        [conversationId]
      );
      return result.rows.map(row => ({
        id: row.message_id || row.id.toString(),
        remoteJid: `${row.phone_number}@s.whatsapp.net`,
        fromMe: row.from_me,
        body: row.body,
        timestamp: new Date(row.timestamp).getTime(),
        contactName: row.from_me ? 'Você' : row.phone_number
      }));
    } catch (error) {
      console.error('Erro ao buscar mensagens:', error);
      return [];
    }
  }

  async sendMessage(to: string, message: string, storeInternally: boolean = true): Promise<{ success: boolean; message: string }> {
    if (!this.socket || this.connectionStatus !== 'connected') {
      return { success: false, message: 'WhatsApp não está conectado' };
    }

    try {
      let formattedNumber = to.replace(/\D/g, '');
      
      if (!formattedNumber.includes('@')) {
        formattedNumber = `${formattedNumber}@s.whatsapp.net`;
      }

      const sentMsg = await this.socket.sendMessage(formattedNumber, { text: message });
      
      if (storeInternally) {
        const storedMessage: StoredMessage = {
          id: sentMsg?.key?.id || Date.now().toString(),
          remoteJid: formattedNumber,
          fromMe: true,
          body: message,
          timestamp: Date.now(),
          contactName: 'Você'
        };
        this.storeMessage(storedMessage);
        this.updateContact(formattedNumber, '', Date.now(), false);
      }
      
      console.log(`Mensagem enviada para ${formattedNumber}${storeInternally ? '' : ' (silenciosa)'}`);
      return { success: true, message: 'Mensagem enviada com sucesso' };
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      return { success: false, message: `Erro: ${error instanceof Error ? error.message : 'desconhecido'}` };
    }
  }

  async getContacts(): Promise<StoredContact[]> {
    const contactsList = Array.from(this.contacts.values());
    contactsList.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    return contactsList;
  }

  async getMessages(jid: string): Promise<StoredMessage[]> {
    let normalizedJid = jid;
    if (!jid.includes('@')) {
      normalizedJid = `${jid.replace(/\D/g, '')}@s.whatsapp.net`;
    }
    const messages = this.messages.get(normalizedJid) || [];
    console.log(`getMessages para ${normalizedJid}: ${messages.length} mensagens encontradas`);
    console.log(`Todas as chaves de mensagens: ${Array.from(this.messages.keys()).join(', ')}`);
    return messages;
  }

  markAsRead(jid: string): void {
    const contact = this.contacts.get(jid);
    if (contact) {
      contact.unreadCount = 0;
      this.contacts.set(jid, contact);
    }
  }

  onMessage(callback: (message: StoredMessage) => void): void {
    this.onMessageCallbacks.push(callback);
  }

  async getStatus(): Promise<any> {
    const statusMessages: Record<string, string> = {
      'disconnected': 'Desconectado',
      'connecting': 'Conectando...',
      'authenticating': 'Aguardando escaneamento do QR Code',
      'connected': 'Conectado ao WhatsApp'
    };

    return {
      isInitialized: this.socket !== null,
      connectionStatus: this.connectionStatus,
      hasQrCode: this.qrCode !== null,
      qrCode: this.qrCode,
      statusMessage: statusMessages[this.connectionStatus] || 'Status desconhecido',
      lastError: this.lastError,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      connectionFailed: this.reconnectAttempts >= this.maxReconnectAttempts && this.connectionStatus === 'disconnected',
      isConnected: this.connectionStatus === 'connected',
      clientReady: this.connectionStatus === 'connected',
      dependencies: { available: true, missingDependencies: [] },
      totalContacts: this.contacts.size,
      totalMessages: Array.from(this.messages.values()).reduce((acc, msgs) => acc + msgs.length, 0)
    };
  }

  async getQrCode(): Promise<{ success: boolean; qrCode: string | null }> {
    return {
      success: this.qrCode !== null,
      qrCode: this.qrCode
    };
  }

  onQrCodeUpdate(callback: (qrCode: string) => void): void {
    this.onQrCodeUpdateCallbacks.push(callback);
  }

  onConnection(callback: (isConnected: boolean) => void): void {
    this.onConnectionCallbacks.push(callback);
    if (this.connectionStatus === 'connected') {
      callback(true);
    }
  }

  async disconnect(): Promise<{ success: boolean; message: string }> {
    try {
      if (this.socket) {
        await this.socket.logout();
        this.socket = null;
      }
      this.connectionStatus = 'disconnected';
      this.qrCode = null;
      this.messages.clear();
      this.contacts.clear();
      await this.clearSession();
      return { success: true, message: 'Desconectado com sucesso' };
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      return { success: false, message: `Erro: ${error instanceof Error ? error.message : 'desconhecido'}` };
    }
  }

  private async clearSession(): Promise<void> {
    try {
      if (fs.existsSync(AUTH_DIR)) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        fs.mkdirSync(AUTH_DIR, { recursive: true });
      }
    } catch (error) {
      console.error('Erro ao limpar sessão:', error);
    }
  }

  async sendTicketNotification(ticketData: {
    ticketId: number;
    title: string;
    description: string;
    category: string;
    priority: string;
    clientName: string;
    clientPhone?: string;
    contactName?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      const { pool } = await import('./db');
      const settingsResult = await pool.query(
        "SELECT value FROM system_settings WHERE key = 'whatsappAdminNumber'"
      );
      
      const adminPhone = settingsResult.rows[0]?.value;
      
      if (!adminPhone) {
        return { success: false, message: 'Número do administrador não configurado' };
      }

      const message = `🎫 *NOVO CHAMADO #${ticketData.ticketId}*\n\n` +
        `📋 *Título:* ${ticketData.title}\n` +
        `🏢 *Cliente:* ${ticketData.clientName}\n` +
        (ticketData.clientPhone ? `📞 *Telefone:* ${ticketData.clientPhone}\n` : '') +
        (ticketData.contactName ? `👤 *Contato:* ${ticketData.contactName}\n` : '') +
        `📁 *Categoria:* ${ticketData.category}\n` +
        `⚡ *Prioridade:* ${ticketData.priority}\n` +
        `📅 *Data:* ${new Date().toLocaleString('pt-BR')}\n\n` +
        `📝 *Descrição:*\n${ticketData.description.substring(0, 300)}${ticketData.description.length > 300 ? '...' : ''}`;

      return await this.sendMessage(adminPhone, message);
    } catch (error) {
      console.error('Erro ao enviar notificação:', error);
      return { success: false, message: String(error) };
    }
  }
}

export const whatsappBaileysService = new WhatsAppBaileysService();
