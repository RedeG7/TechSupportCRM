import { Client } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage';
import { aiService } from './aiService';
import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

// Obter o caminho do diretório atual usando ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pasta para armazenar a sessão do WhatsApp
const SESSION_DIR = path.join(__dirname, '../whatsapp-session');

// Garantir que a pasta de sessão existe
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// Define os tipos para o conteúdo da sessão
interface SessionData {
  WABrowserId: string;
  WASecretBundle: string;
  WAToken1: string;
  WAToken2: string;
}

// Define os tipos de mensagem do WhatsApp para uso interno

/**
 * Serviço responsável por gerenciar a conexão com o WhatsApp
 */
class WhatsAppService {
  private client: Client | null = null;
  private isInitialized = false;
  private isConnected = false;
  private _connectionStatus: 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unavailable' = 'disconnected';
  private _lastStatusChangeTime: number = Date.now();
  private qrCode: string | null = null;
  private onQrCodeUpdateCallbacks: ((qrCode: string) => void)[] = [];
  private autoReplyChatbotEnabled = true;
  private clientReady = false;
  
  // Getter e setter para connectionStatus para rastrear mudanças
  get connectionStatus(): 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unavailable' {
    return this._connectionStatus;
  }
  
  set connectionStatus(value: 'disconnected' | 'connecting' | 'authenticating' | 'connected' | 'unavailable') {
    if (this._connectionStatus !== value) {
      this._connectionStatus = value;
      this._lastStatusChangeTime = Date.now();
      console.log(`Status do WhatsApp alterado para: ${value}`);
      
      // Se estiver conectado, notificar os callbacks
      if (value === 'connected') {
        this.onConnectionCallbacks.forEach(callback => callback(true));
      } else if (value === 'disconnected' || value === 'unavailable') {
        this.onConnectionCallbacks.forEach(callback => callback(false));
      }
    }
  }
  
  // Propriedades para conexão com WhatsApp Web via puppeteer
  private browser: any = null;
  private checkLoginInterval: any = null;
  
  // Callbacks para eventos
  private onConnectionCallbacks: ((isConnected: boolean) => void)[] = [];
  private onMessageCallbacks: ((message: any) => void)[] = [];
  
  constructor() {
    this.setupSessionDirectory();
    
    // Inicializar automaticamente se houver dados de sessão
    if (this.hasSession()) {
      console.log('Dados de sessão existentes encontrados, tentando inicializar WhatsApp...');
      this.initialize().catch(err => {
        console.error('Erro ao inicializar WhatsApp automaticamente:', err);
      });
    }
  }

  /**
   * Configura o diretório de sessão do WhatsApp
   */
  private setupSessionDirectory(): void {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
    console.log(`Diretório de sessão configurado em: ${SESSION_DIR}`);
  }

  /**
   * Verifica se existem dados de sessão salvos
   */
  private hasSession(): boolean {
    const sessionFile = path.join(SESSION_DIR, 'session.json');
    return fs.existsSync(sessionFile);
  }

  /**
   * Carrega os dados da sessão do WhatsApp
   */
  private loadSession(): SessionData | null {
    try {
      const sessionFile = path.join(SESSION_DIR, 'session.json');
      if (fs.existsSync(sessionFile)) {
        const data = fs.readFileSync(sessionFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Erro ao carregar dados da sessão:', error);
    }
    return null;
  }

  /**
   * Salva os dados da sessão do WhatsApp
   */
  private saveSession(sessionData: any): void {
    try {
      const sessionFile = path.join(SESSION_DIR, 'session.json');
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
      console.log('Dados da sessão salvos com sucesso.');
    } catch (error) {
      console.error('Erro ao salvar dados da sessão:', error);
    }
  }

  /**
   * Verifica se as dependências necessárias para o Puppeteer estão disponíveis
   * @returns Objeto com status e mensagem de erro se houver
   */
  async checkPuppeteerDependencies(): Promise<{ available: boolean, missingDependencies: string[], errorMessage?: string }> {
    try {
      // Verifica se o Chrome e suas bibliotecas estão disponíveis
      // Lista de bibliotecas essenciais para o Puppeteer
      const requiredLibraries = [
        'libnss3.so',
        'libxcomposite1',
        'libxss1',
        'libasound2',
        'libatk-bridge2.0-0',
        'libgtk-3-0'
      ];
      
      // Verifica a presença do Chrome ou Chromium
      let chromiumPresent = false;
      try {
        execSync('which chromium-browser || which google-chrome || which chromium');
        chromiumPresent = true;
      } catch (error) {
        // Chrome não encontrado
      }
      
      // Verifica quais bibliotecas estão faltando
      const missingLibs = [];
      for (const lib of requiredLibraries) {
        try {
          execSync(`ldconfig -p | grep ${lib} || echo "missing"`);
        } catch (error) {
          missingLibs.push(lib);
        }
      }
      
      const allDepsAvailable = chromiumPresent && missingLibs.length === 0;
      
      if (!allDepsAvailable) {
        const missing = [];
        if (!chromiumPresent) missing.push('Chrome/Chromium');
        missing.push(...missingLibs);
        
        return {
          available: false,
          missingDependencies: missing
        };
      }
      
      return { available: true, missingDependencies: [] };
    } catch (error) {
      return {
        available: false,
        missingDependencies: ['Não foi possível verificar dependências'],
        errorMessage: `Erro ao verificar dependências: ${error.message}`
      };
    }
  }

  /**
   * Inicializa o cliente WhatsApp sempre em modo real
   * @returns Resultado da inicialização
   */
  async initialize() {
    if (this.isInitialized) {
      return { 
        success: true, 
        message: 'Cliente WhatsApp já inicializado',
        hasQrCode: this.qrCode !== null,
        status: this.connectionStatus
      };
    }
    
    this.connectionStatus = 'connecting';
    
    // Verifica dependências antes de tentar inicializar
    const dependencies = await this.checkPuppeteerDependencies();
    if (!dependencies.available) {
      this.connectionStatus = 'unavailable';
      const missingItems = dependencies.missingDependencies.join(', ');
      return {
        success: false,
        message: `Não foi possível inicializar WhatsApp: faltam dependências (${missingItems})`,
        status: this.connectionStatus,
        hasQrCode: false,
        dependencies: dependencies
      };
    }
    
    // Sempre tenta inicializar em modo real
    try {
      console.log('Iniciando WhatsApp em modo real com web.whatsapp.com...');
      try {
        // Importando puppeteer dinamicamente para evitar problemas de compatibilidade
        const puppeteer = await import('puppeteer');
        
        console.log('Lançando navegador para acessar web.whatsapp.com...');
        try {
          const browser = await puppeteer.default.launch({
            headless: "new", // Usar o novo modo headless
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
          });
          
          // Armazenar o browser para poder fechá-lo mais tarde
          this.browser = browser;
        } catch (launchError) {
          this.connectionStatus = 'unavailable';
          
          // Extrair nomes de bibliotecas que estão faltando
          const errorMsg = launchError instanceof Error ? launchError.message : 'erro desconhecido';
          const missingLibsMatch = errorMsg.match(/error while loading shared libraries: (\S+):/);
          const missingLib = missingLibsMatch ? missingLibsMatch[1] : null;
          
          // Atualizar resultado da verificação de dependências com base no erro real
          const updatedDependencies = {
            available: false,
            missingDependencies: missingLib ? [missingLib] : ['Dependências do Chrome'],
            errorMessage: errorMsg
          };
          
          return {
            success: false,
            message: `Erro ao inicializar WhatsApp: ${errorMsg}`,
            status: this.connectionStatus,
            dependencies: updatedDependencies
          };
        }
        
        const page = await this.browser.newPage();
        await page.goto('https://web.whatsapp.com/', { waitUntil: 'networkidle0' });
        
        console.log('Acessando web.whatsapp.com e aguardando QR code...');
        
        this.isInitialized = true;
        
        // Esperar pela tag do QR code e capturar sua imagem
        try {
          await page.waitForSelector('canvas', { timeout: 30000 });
          console.log('QR code encontrado, capturando...');
          
          // Capturar o QR code como data URL
          const qrCodeDataUrl = await page.evaluate(() => {
            const canvas = document.querySelector('canvas');
            if (canvas) {
              return canvas.toDataURL();
            }
            return null;
          });
          
          if (qrCodeDataUrl) {
            this.connectionStatus = 'authenticating';
            this.qrCode = qrCodeDataUrl;
            console.log('QR code capturado com sucesso!');
            
            // Notificar sobre o novo QR code
            this.onQrCodeUpdateCallbacks.forEach(callback => callback(qrCodeDataUrl));
            
            // Configurar verificação periódica para detectar quando o QR code foi escaneado
            this.checkLoginInterval = setInterval(async () => {
              try {
                // Verificar diferentes estados da interface do WhatsApp Web
                const pageState = await page.evaluate(() => {
                  // QR code ainda visível?
                  const hasQrCode = !!document.querySelector('canvas');
                  
                  // Verificar se está na tela de autenticação (carregando após QR code)
                  const isAuthenticating = !hasQrCode && (
                    document.querySelector('[data-testid="status-v3-connecting"]') || 
                    document.querySelector('[data-icon="status-connecting"]')
                  );
                  
                  // Verificar se está conectado (tela principal do WhatsApp)
                  const isConnected = !hasQrCode && document.querySelector('[data-icon="chat"]');
                  
                  // Verificar mensagens de erro
                  const errorMessage = document.querySelector('[data-testid="alert-notification"]')?.textContent;
                  
                  return { hasQrCode, isAuthenticating, isConnected, errorMessage };
                });
                
                // Atualizar estado com base na interface
                if (pageState.errorMessage) {
                  console.error('Erro na autenticação do WhatsApp:', pageState.errorMessage);
                  this.connectionStatus = 'unavailable';
                  clearInterval(this.checkLoginInterval);
                } else if (pageState.isConnected) {
                  console.log('WhatsApp Web conectado com sucesso!');
                  this.connectionStatus = 'connected';
                  this.isConnected = true;
                  this.clientReady = true;
                  this.qrCode = null;
                  
                  // Notificar conexão bem-sucedida
                  this.onConnectionCallbacks.forEach(callback => callback(true));
                  
                  clearInterval(this.checkLoginInterval);
                } else if (pageState.isAuthenticating) {
                  console.log('WhatsApp Web autenticando...');
                  this.connectionStatus = 'authenticating';
                } else if (!pageState.hasQrCode) {
                  // QR Code não está mais visível, mas ainda não está conectado
                  console.log('QR Code escaneado, aguardando confirmação...');
                  this.connectionStatus = 'authenticating';
                }
              } catch (error) {
                console.error('Erro ao verificar estado do WhatsApp:', error);
              }
            }, 2000);
            
            return { 
              success: true, 
              message: 'WhatsApp iniciado, QR code capturado',
              hasQrCode: true,
              status: this.connectionStatus
            };
          } else {
            throw new Error('Falha ao capturar QR code');
          }
        } catch (err) {
          console.error('Erro ao capturar QR code:', err);
          await this.browser.close();
          this.isInitialized = false;
          this.connectionStatus = 'disconnected';
          
          // Erro ao capturar QR code, retornar erro
          console.log('Não foi possível capturar o QR code:', err.message);
          return { 
            success: false, 
            message: 'Não foi possível capturar o QR code do WhatsApp Web: ' + err.message,
            status: this.connectionStatus
          };
        }
      } catch (err) {
        console.error('Erro ao inicializar WhatsApp real:', err);
        // Retornar erro
        this.isInitialized = false;
        this.connectionStatus = 'unavailable';
        return { 
          success: false, 
          message: 'Erro ao inicializar WhatsApp: ' + (err instanceof Error ? err.message : 'erro desconhecido'),
          status: this.connectionStatus
        };
      }
    } catch (finalError) {
      // Captura qualquer outro erro que possa ocorrer
      console.error('Erro fatal na inicialização do WhatsApp:', finalError);
      this.isInitialized = false;
      this.connectionStatus = 'unavailable';
      return { 
        success: false, 
        message: 'Erro fatal na inicialização do WhatsApp: ' + (finalError instanceof Error ? finalError.message : 'erro desconhecido'),
        status: this.connectionStatus
      };
    }
  }

  /**
   * Registra um callback para notificações quando uma nova mensagem WhatsApp for recebida
   * @param callback Função que será chamada quando uma nova mensagem for recebida
   */
  onMessage(callback: (message: any) => void): void {
    this.onMessageCallbacks.push(callback);
  }
  
  /**
   * Registra um callback para notificações quando o status de conexão mudar
   * @param callback Função que será chamada quando o status de conexão mudar
   */
  onConnection(callback: (isConnected: boolean) => void): void {
    this.onConnectionCallbacks.push(callback);
    // Se já estiver conectado, notificar imediatamente
    if (this.isConnected) {
      callback(true);
    }
  }
  
  /**
   * Cria um ticket a partir de uma mensagem WhatsApp recebida
   * @param contactId ID do contato WhatsApp (ex: 5511999998888@c.us)
   * @param message Mensagem recebida
   * @returns Dados do ticket criado ou erro
   */
  async createTicketFromWhatsApp(contactId: string, message: string): Promise<any> {
    console.log(`Criando ticket a partir de mensagem WhatsApp de ${contactId}: ${message}`);
    
    try {
      // Normalizar o ID do contato para garantir o formato correto
      const normalizedContactId = contactId.includes('@c.us') ? contactId : `${contactId}@c.us`;
      
      // Extrair o número do telefone
      const phoneNumber = normalizedContactId.replace('@c.us', '');
      
      // Nome padrão caso não encontre o contato
      let contactName = "Cliente via WhatsApp";
      
      // Importar storage para usar o método de busca por número
      const { storage } = await import('./storage');
      
      // Buscar o contato de cliente pelo número de WhatsApp
      const clientContact = await storage.getClientContactByWhatsApp(phoneNumber);
      
      if (!clientContact) {
        console.log(`Nenhum contato de cliente encontrado para o WhatsApp ${phoneNumber}`);
        return { 
          success: false, 
          message: 'Contato de cliente não encontrado para este número de WhatsApp. ' +
                  'Cadastre o contato primeiro para poder receber tickets via WhatsApp.' 
        };
      }
      
      // Preparar os dados do ticket
      const now = new Date();
      const ticketData = {
        clientId: clientContact.clientId,
        title: `Atendimento via WhatsApp - ${clientContact.name}`,
        description: message,
        status: "new",
        priority: "medium",
        category: "Suporte", // Usando categoria padrão
        source: "whatsapp",
        createdBy: null,
        assignedTo: null,
        createdAt: now,
        updatedAt: now
      };
      
      // Criar o ticket no banco de dados
      const ticket = await storage.createTicket(ticketData);
      
      // Adicionar uma atividade ao ticket indicando que foi criado via WhatsApp
      await storage.createTicketActivity({
        ticketId: ticket.id,
        activityType: 'criado',
        clientContactId: clientContact.id,
        content: `Ticket criado automaticamente via WhatsApp por ${clientContact.name}`,
        isInternal: false,
        createdAt: now // Usando a mesma data de criação do ticket
      });
      
      console.log(`Ticket #${ticket.id} criado com sucesso via WhatsApp`);
      
      return {
        success: true,
        message: 'Ticket criado com sucesso',
        ticket
      };
    } catch (error) {
      console.error('Erro ao criar ticket a partir do WhatsApp:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao criar ticket a partir do WhatsApp'
      };
    }
  }

  /**
   * Busca um contato de cliente pelo número do WhatsApp
   */
  async findClientContactByWhatsApp(whatsappNumber: string): Promise<any> {
    try {
      console.log(`Buscando contato de cliente para WhatsApp: ${whatsappNumber}`);
      
      // Agora usamos o método do storage para buscar no banco de dados real
      const clientContact = await storage.getClientContactByWhatsApp(whatsappNumber);
      
      if (clientContact) {
        console.log(`Contato encontrado no banco de dados: ${clientContact.name} (ID: ${clientContact.id})`);
        return clientContact;
      } else {
        console.log(`Nenhum contato de cliente encontrado para o WhatsApp ${whatsappNumber}`);
        return null;
      }
    } catch (error) {
      console.error('Erro ao buscar contato de cliente por WhatsApp:', error);
      return null;
    }
  }

  /**
   * Notifica atualizações de ticket via WhatsApp
   * Envia mensagem diretamente usando a API do WhatsApp Web
   * @param phone Número do WhatsApp (com ou sem formatação)
   * @param message Mensagem a ser enviada
   * @returns Resultado do envio
   */
  async notifyTicketUpdate(phone: string, message: string): Promise<boolean> {
    // Verificar se o WhatsApp está inicializado e conectado
    if (!this.isInitialized || !this.isConnected) {
      console.log('WhatsApp não está inicializado ou conectado para enviar notificação');
      return false;
    }
    
    try {
      // Normalizar o número de telefone
      const normalizedPhone = phone.includes('@c.us') ? phone : `${phone}@c.us`;
      
      // Enviar a mensagem utilizando o método sendMessage
      const result = await this.sendMessage(normalizedPhone, message);
      
      if (result.success) {
        console.log(`Notificação de ticket enviada para ${phone}: ${message}`);
        return true;
      } else {
        console.error('Erro ao enviar notificação de ticket:', result.message);
        return false;
      }
    } catch (error) {
      console.error('Erro ao enviar notificação de ticket via WhatsApp:', error);
      return false;
    }
  }
  
  /**
   * Obter status do WhatsApp
   */
  /**
   * Obter status atual da conexão do WhatsApp com detalhes
   * @returns Objeto contendo informações detalhadas do status atual
   */
  async getStatus() {
    const statusMessages = {
      'disconnected': 'Desconectado',
      'connecting': 'Conectando ao WhatsApp Web',
      'authenticating': 'Aguardando autenticação do QR Code',
      'connected': 'Conectado ao WhatsApp',
      'unavailable': 'Serviço indisponível'
    };
    
    // Calcular tempo desde a última alteração de status
    const now = Date.now();
    const elapsedTime = this._lastStatusChangeTime ? now - this._lastStatusChangeTime : 0;
    const elapsedTimeFormatted = this.formatElapsedTime(elapsedTime);

    // Sempre verificar dependências para fornecer informações completas
    const dependencies = await this.checkPuppeteerDependencies();

    return {
      isInitialized: this.isInitialized,
      connectionStatus: this.connectionStatus,
      hasQrCode: this.qrCode !== null,
      statusMessage: statusMessages[this.connectionStatus] || 'Status desconhecido',
      isConnected: this.isConnected,
      clientReady: this.clientReady,
      elapsedTime: elapsedTimeFormatted,
      lastUpdate: new Date().toISOString(),
      dependencies
    };
  }
  
  /**
   * Formata um tempo em milissegundos para formato legível
   */
  private formatElapsedTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }

  /**
   * Obter QR code para conexão
   */
  async getQrCode() {
    // Para o modo real com cliente
    if (!this.qrCode) {
      return { success: false, qrCode: null };
    }
    
    try {
      // Verificar se o qrCode já é uma URL de dados
      if (this.qrCode.startsWith('data:')) {
        return { success: true, qrCode: this.qrCode };
      }
      
      // Converter o QR code para uma imagem data URL
      const qrImageDataUrl = await QRCode.toDataURL(this.qrCode, {
        errorCorrectionLevel: 'H',
        margin: 1,
        scale: 8,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      
      return { success: true, qrCode: qrImageDataUrl };
    } catch (error) {
      console.error('Erro ao gerar imagem QR code:', error);
      return { 
        success: false, 
        message: 'Erro ao gerar QR Code', 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  }

  /**
   * Desconectar o WhatsApp e limpar o estado
   * @returns Resultado da operação
   */
  /**
   * Reinicia a conexão do WhatsApp
   * Desconecta e depois inicializa novamente
   * @returns Resultado da operação
   */
  async restart() {
    console.log('Reiniciando WhatsApp...');
    
    // Primeiro desconecta
    await this.disconnect();
    
    // Aguarda um pequeno delay para garantir que a desconexão foi completa
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Inicializa em modo real sem opções de simulação
    return await this.initialize();
  }

  async disconnect() {
    if (!this.isInitialized) {
      return { success: false, message: 'WhatsApp não está conectado' };
    }
    
    // Fechar o navegador Puppeteer se estiver aberto
    if (this.browser) {
      try {
        console.log('Fechando navegador Puppeteer...');
        await this.browser.close();
        this.browser = null;
        console.log('Navegador Puppeteer fechado com sucesso');
      } catch (err) {
        console.error('Erro ao fechar navegador Puppeteer:', err);
      }
    }
    
    // Desconectar cliente real
    if (this.client && this.isInitialized) {
      await this.client.destroy();
    }

    // Limpar estado
    this.isInitialized = false;
    this.isConnected = false;
    this.connectionStatus = 'disconnected';
    this.qrCode = null;
    this.clientReady = false;
    console.log('Cliente WhatsApp desconectado.');

    return { 
      success: true, 
      message: 'WhatsApp desconectado com sucesso',
      status: this.connectionStatus
    };
  }
  
  /**
   * Obter todos os contatos do WhatsApp
   */
  async getContacts() {
    if (!this.isInitialized) {
      throw new Error('WhatsApp não está inicializado');
    }
    
    // Implementação para cliente real
    if (this.client) {
      try {
        const contacts = await this.client.getContacts();
        return contacts.map(contact => ({
          id: contact.id._serialized,
          name: contact.name || contact.pushname || contact.number,
          number: contact.number,
          profilePicture: null // Carregaria a foto de perfil em uma implementação real
        }));
      } catch (error) {
        console.error('Erro ao obter contatos do WhatsApp:', error);
        throw new Error('Falha ao buscar contatos');
      }
    }
    
    throw new Error('Cliente WhatsApp não está disponível');
  }
  
  /**
   * Obter conversas do WhatsApp
   */
  async getChats() {
    if (!this.isInitialized) {
      throw new Error('WhatsApp não está inicializado');
    }
    
    // Implementação para cliente real
    if (this.client) {
      try {
        const chats = await this.client.getChats();
        return chats.map(chat => ({
          id: chat.id._serialized,
          name: chat.name || chat.pushname || 'Chat',
          unreadCount: chat.unreadCount,
          timestamp: chat.timestamp * 1000, // Converter para milissegundos
          lastMessage: chat.lastMessage ? chat.lastMessage.body : null
        }));
      } catch (error) {
        console.error('Erro ao obter chats do WhatsApp:', error);
        throw new Error('Falha ao buscar chats');
      }
    }
    
    throw new Error('Cliente WhatsApp não está disponível');
  }
  
  /**
   * Obter mensagens de um chat específico
   */
  async getMessages(chatId: string) {
    if (!this.isInitialized) {
      throw new Error('WhatsApp não está inicializado');
    }
    
    // Implementação para cliente real
    if (this.client) {
      try {
        const chat = await this.client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit: 50 });
        
        return messages.map(msg => ({
          id: msg.id._serialized,
          body: msg.body,
          timestamp: msg.timestamp * 1000, // Converter para milissegundos
          fromMe: msg.fromMe,
          sender: msg.fromMe ? 'você' : chat.name || chat.pushname || 'Contato'
        }));
      } catch (error) {
        console.error('Erro ao obter mensagens do WhatsApp:', error);
        throw new Error('Falha ao buscar mensagens');
      }
    }
    
    throw new Error('Cliente WhatsApp não está disponível');
  }
  
  /**
   * Enviar mensagem via WhatsApp
   */
  async sendMessage(to: string, text: string) {
    if (!this.isInitialized) {
      throw new Error('WhatsApp não está inicializado');
    }
    
    // Implementação para cliente real
    if (this.client) {
      try {
        await this.client.sendMessage(to, text);
        return { 
          success: true, 
          message: 'Mensagem enviada com sucesso' 
        };
      } catch (error) {
        console.error('Erro ao enviar mensagem via WhatsApp:', error);
        return { 
          success: false, 
          message: 'Falha ao enviar mensagem: ' + (error instanceof Error ? error.message : 'erro desconhecido')
        };
      }
    }
    
    return { 
      success: false, 
      message: 'Cliente WhatsApp não está disponível' 
    };
  }
}



class WhatsAppServiceWithQRCallback extends WhatsAppService {
  /**
   * Registra um callback para atualização do QR Code
   */
  onQrCodeUpdate(callback: (qrCode: string) => void) {
    this.onQrCodeUpdateCallbacks.push(callback);
    // Se já tiver um QR code, chamar o callback imediatamente
    if (this.qrCode) {
      callback(this.qrCode);
    }
  }
}

export const whatsappService = new WhatsAppServiceWithQRCallback();