import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { isClientAuthenticated } from "./routes";
import { notificationService } from "./notificationService";
import { notifyTicketOpened } from "./whatsapp-ticket-notifications";
import multer from "multer";
import * as path from "path";
import * as fs from "fs";

// Configuração do multer para upload de arquivos
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const clientStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "client-" + uniqueSuffix + ext);
  },
});

const clientUpload = multer({
  storage: clientStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    // Verifica tipos de arquivo permitidos
    const allowedTypes = [
      // Imagens - qualquer extensão
      "image/jpeg",
      "image/jpg", 
      "image/png",
      "image/gif",
      "image/bmp",
      "image/webp",
      "image/tiff",
      "image/svg+xml",
      // PDFs
      "application/pdf",
      // Documentos do Microsoft Office
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
      "application/vnd.ms-excel", // .xls
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
      "application/vnd.ms-powerpoint", // .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
      // Documentos de texto
      "text/plain", // .txt
      "application/rtf", // .rtf
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Formato de arquivo não suportado. Aceitos: PDF, imagens (JPG, PNG, GIF, BMP, WebP, etc.) e documentos (DOC, DOCX, XLS, XLSX, TXT, RTF)") as any);
    }
  },
});

export function registerClientRoutes(app: Express) {
  // Rota para obter categorias de tickets (sem autenticação)
  app.get("/api/client/ticket-categories", async (req: Request, res: Response) => {
    try {
      const categories = await storage.getTicketCategories();
      res.json(categories);
    } catch (error) {
      console.error("Erro ao buscar categorias de tickets:", error);
      res.status(500).json({ success: false, message: "Erro ao buscar categorias de tickets" });
    }
  });
  
  // Rota para obter tickets do cliente
  app.get("/api/client/tickets", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      // O middleware isClientAuthenticated já associou o cliente e o contato ao request
      
      if (!req.client || !req.client.id || !req.clientContact) {
        return res.status(401).json({ message: "Cliente não autenticado ou identificado." });
      }
      
      let tickets;
      
      // Verificar se o contato é administrador da empresa
      if (req.clientContact.role === 'admin') {
        // Administrador vê todos os tickets da empresa
        tickets = await storage.getTickets({ clientId: req.client.id });
      } else {
        // Usuário comum vê apenas seus próprios tickets
        tickets = await storage.getTickets({ 
          clientId: req.client.id,
          createdByContactId: req.clientContact.id 
        });
      }
      
      // Caso não tenha tickets, retorna array vazio ao invés de erro
      if (!tickets || tickets.length === 0) {
        return res.json([]);
      }
      
      res.json(tickets);
    } catch (error) {
      console.error("Erro ao buscar tickets do cliente:", error);
      res.status(500).json({ message: "Erro ao buscar tickets" });
    }
  });
  
  // Rota para obter detalhes de um ticket específico
  app.get("/api/client/tickets/:id", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.client.id) {
        return res.status(401).json({ message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      if (isNaN(ticketId)) {
        return res.status(400).json({ message: "ID de ticket inválido" });
      }
      
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ message: "Acesso negado a este ticket" });
      }

      // Enriquecer com nome do contato que abriu o chamado
      let openedByName: string | null = null;
      let openedByEmail: string | null = null;
      if ((ticket as any).createdByContactId) {
        try {
          const contact = await storage.getClientContact((ticket as any).createdByContactId);
          if (contact) {
            openedByName = contact.name || null;
            openedByEmail = contact.email || null;
          }
        } catch (_) {}
      }

      // Enriquecer com nome do responsável
      let assignedUserName: string | null = null;
      if (ticket.assignedTo) {
        try {
          const assignedUser = await storage.getUser(ticket.assignedTo);
          if (assignedUser) assignedUserName = assignedUser.name || assignedUser.username || null;
        } catch (_) {}
      }

      res.json({ ...ticket, openedByName, openedByEmail, assignedUserName });
    } catch (error) {
      console.error("Erro ao buscar ticket específico:", error);
      res.status(500).json({ message: "Erro ao buscar detalhes do ticket" });
    }
  });
  
  // Rota para criar ticket sem anexo
  app.post("/api/client/tickets", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      // O middleware isClientAuthenticated já associou o cliente e o contato ao request
      
      // Validar os dados do formulário
      const { title, description, category, priority } = req.body;
      
      if (!title || !description || !category) {
        return res.status(400).json({ message: "Todos os campos obrigatórios devem ser preenchidos" });
      }
      
      // Criar o ticket sem anexo (herda tenantId do cliente)
      const ticket = await storage.createTicket({
        title,
        description,
        category,
        clientId: req.client.id,
        priority: priority || "média",
        status: "aberto",
        assignedTo: null,
        createdBy: null,
        createdByContactId: req.clientContact.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: (req.client as any).tenantId ?? null,
      } as any);
      
      // Registrar a atividade de criação do ticket
      await storage.createTicketActivity({
        ticketId: ticket.id,
        activityType: "create",
        content: "Ticket criado pelo cliente",
        clientContactId: req.clientContact.id,
        isInternal: false
      });

      const whatsappSent = await notifyTicketOpened(ticket).catch((error) => {
        console.error("Erro ao notificar abertura por WhatsApp:", error);
        return false;
      });
      
      // Enviar notificação por email para o cliente que criou o ticket
      try {
        const clientData = await storage.getClient(req.client.id);
        const contactData = await storage.getClientContact(req.clientContact.id);
        
        // Enviar email para o contato que criou o ticket se tiver email
        if (contactData && contactData.email) {
          // Buscar configurações SMTP do banco
          const { pool } = await import('./db');
          const settingsResult = await pool.query('SELECT key, value FROM system_settings WHERE key LIKE \'smtp%\'');
          const settings: Record<string, any> = {};
          
          settingsResult.rows.forEach((row: { key: string; value: string }) => {
            settings[row.key] = row.value;
          });

          // Verificar se configurações SMTP estão disponíveis
          if (settings.smtpHost && settings.smtpUser && settings.smtpPassword) {
            // Importar nodemailer e configurar transporter
            const nodemailer = await import('nodemailer');
            
            const transporter = nodemailer.default.createTransport({
              host: settings.smtpHost,
              port: parseInt(settings.smtpPort || '587'),
              secure: false,
              auth: {
                user: settings.smtpUser,
                pass: settings.smtpPassword,
              },
              tls: {
                rejectUnauthorized: false
              }
            });

            // Enviar email de confirmação para quem abriu o chamado
            const mailOptions = {
              from: `"Suporte RedeG7" <${settings.smtpUser}>`,
              to: contactData.email,
              subject: `Chamado #${ticket.id} criado com sucesso - ${ticket.title}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Suporte RedeG7</h1>
                  </div>
                  
                  <div style="padding: 30px; background-color: #f8f9fa;">
                    <h2 style="color: #0078D4; margin-top: 0;">Chamado Criado com Sucesso</h2>
                    
                    <p>Olá <strong>${contactData.name}</strong>,</p>
                    <p>Seu chamado foi criado com sucesso em nosso sistema. Confira os detalhes abaixo:</p>
                    
                    <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <p><strong>Número do Chamado:</strong> #${ticket.id}</p>
                      <p><strong>Título:</strong> ${ticket.title}</p>
                      <p><strong>Categoria:</strong> ${ticket.category}</p>
                      <p><strong>Prioridade:</strong> ${ticket.priority}</p>
                      <p><strong>Status:</strong> Aberto</p>
                      <p><strong>Data de Abertura:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                      
                      <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                        <p style="margin: 0;"><strong>Descrição:</strong></p>
                        <p style="margin: 10px 0 0 0;">${ticket.description}</p>
                      </div>
                    </div>
                    
                    <div style="margin-top: 30px; text-align: center;">
                      <p>Você pode acompanhar o progresso deste chamado através do portal de clientes.</p>
                      <p style="color: #666; font-size: 14px;">Nossa equipe de suporte analisará seu chamado e retornará em breve.</p>
                    </div>
                  </div>
                  
                  <div style="background-color: #333; color: white; padding: 20px; text-align: center; font-size: 12px;">
                    <p style="margin: 0;">Este é um email automático do sistema Suporte RedeG7.</p>
                    <p style="margin: 5px 0 0 0;">Para dúvidas, entre em contato conosco.</p>
                  </div>
                </div>
              `
            };

            await transporter.sendMail(mailOptions);
            console.log(`Email de confirmação enviado para ${contactData.email} sobre o ticket #${ticket.id}`);
          }
        }
      } catch (emailError) {
        console.error("Erro ao enviar notificação por email:", emailError);
      }
      
      // Enviar notificação por WhatsApp para o administrador via CallMeBot
      try {
        const clientData = await storage.getClient(req.client.id);
        const contactData = await storage.getClientContact(req.clientContact.id);
        
        await notificationService.sendTicketNotificationToAdmin({
          ticketId: ticket.id,
          title: ticket.title,
          description: ticket.description,
          category: ticket.category,
          priority: ticket.priority,
          clientName: clientData?.businessName || clientData?.tradeName || 'Cliente',
          clientPhone: clientData?.phone || undefined,
          contactName: contactData?.name || undefined
        });
      } catch (whatsappError) {
        console.error('Erro ao enviar notificação por WhatsApp:', whatsappError);
      }
      
      res.status(201).json({ ...ticket, whatsappSent });
    } catch (error) {
      console.error("Erro ao criar ticket:", error);
      res.status(500).json({ message: "Erro ao criar o ticket" });
    }
  });
  // Rota de login para clientes
  app.post("/api/client/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ success: false, message: "Nome de usuário e senha são obrigatórios" });
      }
      
      // Buscar o contato que corresponde a este usuário
      const contacts = await storage.getAllClientContacts();
      const contact = contacts.find(c => 
        c.username === username && c.isActive
      );
      
      if (!contact) {
        return res.status(401).json({ success: false, message: "Usuário não encontrado ou conta desativada" });
      }
      
      // Verificar a senha
      // Se o contato não tiver senha definida, rejeitar
      if (!contact.password) {
        return res.status(401).json({ success: false, message: "Credenciais inválidas" });
      }
      
      // Usar a função comparePasswords do auth.ts
      const { comparePasswords } = await import("./auth");  
      let passwordValid = false;
      
      try {
        passwordValid = await comparePasswords(password, contact.password);
      } catch (error) {
        console.error("Erro na comparação de senhas:", error);
        // Não usamos mais o fallback para senhas não criptografadas por motivos de segurança
      }
      
      if (!passwordValid) {
        return res.status(401).json({ success: false, message: "Senha incorreta" });
      }
      
      // Buscar cliente associado
      const client = await storage.getClient(contact.clientId);
      
      if (!client) {
        return res.status(404).json({ success: false, message: "Cliente não encontrado" });
      }
      
      // Usar o ID do contato como token de autenticação simples
      const authToken = `client_${contact.id}`;
      
      // Retornar o contato com informações do cliente, mas sem a senha
      const { password: _, ...contactWithoutPassword } = contact;
      
      res.json({
        ...contactWithoutPassword,
        authToken,
        client
      });
    } catch (error) {
      console.error("Erro no login do cliente:", error);
      res.status(500).json({ success: false, message: "Erro interno no servidor" });
    }
  });
  // Rota para criar ticket com anexo
  app.post("/api/client/tickets/with-attachment", 
    clientUpload.single('attachment'), 
    isClientAuthenticated,
    async (req: Request, res: Response) => {
    try {
      // O middleware isClientAuthenticated já associou o cliente e o contato ao request
      if (!req.clientContact) {
        return res.status(401).json({ message: "Erro de autenticação: contato do cliente não encontrado" });
      }
      
      if (!req.client) {
        return res.status(404).json({ message: "Erro de autenticação: cliente não encontrado" });
      }
      
      // Validar os dados do formulário
      const { title, description, category, priority } = req.body;
      
      if (!title || !description || !category || !priority) {
        return res.status(400).json({ message: "Todos os campos obrigatórios devem ser preenchidos" });
      }
      
      // Informações do arquivo enviado
      const fileInfo = req.file ? {
        id: Date.now(),
        filename: req.file.filename,
        size: req.file.size
      } : null;
      
      const ticket = await storage.createTicket({
        title,
        description,
        category,
        clientId: req.client.id,
        priority: priority || "média",
        status: "aberto",
        assignedTo: null,
        createdBy: null,
        createdByContactId: req.clientContact.id,
        attachments: fileInfo ? [fileInfo] : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: (req.client as any).tenantId ?? null,
      } as any);
      
      // Registrar a atividade de criação do ticket
      await storage.createTicketActivity({
        ticketId: ticket.id,
        activityType: "create",
        content: "Ticket criado pelo cliente",
        clientContactId: req.clientContact.id,
        isInternal: false
      });

      const whatsappSent = await notifyTicketOpened(ticket).catch((error) => {
        console.error("Erro ao notificar abertura por WhatsApp:", error);
        return false;
      });
      
      // Enviar notificação por email
      try {
        // Buscar os dados do cliente e contato para uso nos templates
        const clientData = await storage.getClient(req.client.id);
        const contactData = await storage.getClientContact(req.clientContact.id);
        
        await notificationService.sendEmail({
          recipient: "suporte@redeg7.com.br",
          subject: `Novo chamado #${ticket.id} - ${ticket.title}`,
          body: `
            <p>Um novo chamado foi aberto pelo cliente.</p>
            <p><strong>Cliente:</strong> ${clientData.businessName || clientData.tradeName}</p>
            <p><strong>Contato:</strong> ${contactData.name}</p>
            <p><strong>Categoria:</strong> ${ticket.category}</p>
            <p><strong>Prioridade:</strong> ${ticket.priority}</p>
            <p><strong>Assunto:</strong> ${ticket.title}</p>
            <p><strong>Descrição:</strong></p>
            <p>${ticket.description}</p>
            ${fileInfo ? `<p><strong>Anexo:</strong> ${fileInfo.filename} (${Math.round(fileInfo.size / 1024)} KB)</p>` : ''}
          `
        });
      } catch (emailError) {
        console.log("Não foi possível enviar email:", emailError);
      }
      
      // Enviar notificação por WhatsApp para o administrador via CallMeBot
      try {
        const clientData = await storage.getClient(req.client.id);
        const contactData = await storage.getClientContact(req.clientContact.id);
        
        await notificationService.sendTicketNotificationToAdmin({
          ticketId: ticket.id,
          title: ticket.title,
          description: ticket.description + (fileInfo ? `\n\n📎 Anexo: ${fileInfo.filename}` : ''),
          category: ticket.category,
          priority: ticket.priority,
          clientName: clientData?.businessName || clientData?.tradeName || 'Cliente',
          clientPhone: clientData?.phone || undefined,
          contactName: contactData?.name || undefined
        });
      } catch (whatsappError) {
        console.error("Erro ao enviar notificação por WhatsApp:", whatsappError);
      }
      
      res.status(201).json({ ...ticket, whatsappSent });
    } catch (error) {
      console.error("Erro ao criar ticket com anexo:", error);
      res.status(500).json({ message: "Erro ao criar o ticket" });
    }
  });
  // Rota para obter atividades de um ticket específico do cliente
  app.get("/api/client/tickets/:id/activities", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.client.id) {
        return res.status(401).json({ success: false, message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ success: false, message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ success: false, message: "Acesso negado a este ticket" });
      }
      
      const activities = await storage.getTicketActivities(ticketId);
      
      // Buscar nomes de usuários para atividades
      const activitiesWithUserNames = await Promise.all(
        activities.map(async (activity) => {
          if (activity.userId) {
            const user = await storage.getUser(activity.userId);
            return {
              ...activity,
              userName: user?.name || 'Usuário desconhecido'
            };
          }
          return {
            ...activity,
            userName: req.clientContact?.name || 'Cliente'
          };
        })
      );
      
      res.json(activitiesWithUserNames);
    } catch (error) {
      console.error("Erro ao buscar atividades:", error);
      res.status(500).json({ success: false, message: "Erro ao buscar atividades do ticket" });
    }
  });
  
  // Rota para upload de imagens em tickets
  app.post("/api/client/tickets/:id/upload", 
    clientUpload.array('files', 5), // máximo 5 arquivos
    isClientAuthenticated, 
    async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.clientContact) {
        return res.status(401).json({ message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ message: "Acesso negado a este ticket" });
      }
      
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Nenhum arquivo foi enviado" });
      }
      
      // Tipos de arquivo permitidos
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'application/rtf'
      ];
      
      // Filtrar arquivos permitidos
      const validFiles = files.filter(file => allowedMimeTypes.includes(file.mimetype));
      
      if (validFiles.length === 0) {
        return res.status(400).json({ message: "Tipos de arquivo não permitidos. Aceitos: PDF, imagens, DOC, DOCX, XLS, XLSX, TXT, RTF" });
      }
      
      // Retornar os caminhos dos arquivos enviados
      const uploadedFiles = validFiles.map(file => `/uploads/${file.filename}`);
      
      res.json({ 
        success: true, 
        files: uploadedFiles,
        message: `${uploadedFiles.length} arquivo(s) enviado(s) com sucesso` 
      });
    } catch (error) {
      console.error("Erro no upload de arquivos:", error);
      res.status(500).json({ message: "Erro interno no servidor" });
    }
  });

  // Rota para o cliente responder a um ticket
  app.post("/api/client/tickets/:id/reply", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.clientContact) {
        return res.status(401).json({ message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ message: "Acesso negado a este ticket" });
      }
      
      // Verificar se o ticket está em um estado que permite respostas
      if (ticket.status === "fechado" || ticket.status === "resolvido" || ticket.status === "resolved" || ticket.status === "closed" || ticket.status === "cancelado") {
        return res.status(400).json({ message: "Não é possível responder a um ticket fechado, resolvido ou cancelado" });
      }
      
      const { content, attachments } = req.body;
      
      if ((!content || content.trim() === '') && (!attachments || attachments.length === 0)) {
        return res.status(400).json({ message: "A mensagem ou anexos devem ser fornecidos" });
      }
      
      // Criar atividade de resposta incluindo anexos separadamente
      const activity = await storage.createTicketActivity({
        ticketId,
        activityType: "comment",
        content: content || "Anexos enviados",
        attachments: attachments || [],
        userId: null,
        clientContactId: req.clientContact.id,
        isInternal: false
      });
      
      console.log('Atividade criada com sucesso:', activity);
      
      // Atualizar status do ticket para "respondido" sempre que o cliente responder
      // Isso indica para a equipe que o cliente respondeu e está aguardando uma ação
      await storage.updateTicket(ticketId, { status: "respondido" });
      
      // Notificar equipe de suporte
      try {
        await notificationService.sendEmail({
          recipient: "suporte@redeg7.com.br",
          subject: `Nova resposta do cliente no chamado #${ticketId}`,
          body: `
            <p>O cliente respondeu ao chamado #${ticketId}.</p>
            <p><strong>Cliente:</strong> ${req.client.businessName || req.client.tradeName}</p>
            <p><strong>Contato:</strong> ${req.clientContact.name}</p>
            <p><strong>Assunto:</strong> ${ticket.title}</p>
            <p><strong>Mensagem:</strong></p>
            <p>${content}</p>
          `
        });
      } catch (error) {
        console.log("Email não enviado:", error);
      }
      
      res.json({ success: true, message: "Resposta enviada com sucesso" });
    } catch (error) {
      console.error("Erro ao responder ticket:", error);
      res.status(500).json({ message: "Erro ao enviar resposta" });
    }
  });
  
  // Rota para reabrir um ticket fechado ou resolvido
  app.post("/api/client/tickets/:id/reopen", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.clientContact) {
        return res.status(401).json({ message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ message: "Acesso negado a este ticket" });
      }
      
      // Verificar se o ticket está em estado fechado ou resolvido
      if (ticket.status !== "closed" && ticket.status !== "resolved") {
        return res.status(400).json({ message: "Apenas tickets fechados ou resolvidos podem ser reabertos" });
      }
      
      const { reason } = req.body;
      
      // Reabrir o ticket
      await storage.updateTicket(ticketId, { status: "reaberto" });
      
      // Criar atividade de reabertura
      await storage.createTicketActivity({
        ticketId,
        activityType: "reopen",
        content: reason || "Ticket reaberto pelo cliente",
        userId: null,
        clientContactId: req.clientContact.id,
        isInternal: false
      });
      
      // Notificar equipe de suporte
      try {
        await notificationService.sendEmail({
          recipient: "suporte@redeg7.com.br",
          subject: `Ticket #${ticketId} reaberto pelo cliente`,
          body: `
            <p>O cliente reabriu o chamado #${ticketId}.</p>
            <p><strong>Cliente:</strong> ${req.client.businessName || req.client.tradeName}</p>
            <p><strong>Contato:</strong> ${req.clientContact.name}</p>
            <p><strong>Assunto:</strong> ${ticket.title}</p>
            <p><strong>Motivo:</strong> ${reason || "Não informado"}</p>
          `
        });
      } catch (error) {
        console.log("Email não enviado:", error);
      }
      
      res.json({ success: true, message: "Ticket reaberto com sucesso" });
    } catch (error) {
      console.error("Erro ao reabrir ticket:", error);
      res.status(500).json({ message: "Erro ao reabrir ticket" });
    }
  });

  // Rota para o cliente avaliar um ticket resolvido
  app.post("/api/client/tickets/:id/rate", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      if (!req.client || !req.clientContact) {
        return res.status(401).json({ message: "Cliente não autenticado" });
      }
      
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ message: "Ticket não encontrado" });
      }
      
      // Verificar se o ticket pertence ao cliente
      if (ticket.clientId !== req.client.id) {
        return res.status(403).json({ message: "Acesso negado a este ticket" });
      }
      
      // Verificar se o ticket está fechado ou resolvido (aceita valores em PT e EN)
      const closedStatuses = ["resolved", "closed", "resolvido", "fechado", "cancelado", "cancelled"];
      if (!closedStatuses.includes(ticket.status as string)) {
        return res.status(400).json({ message: "Só é possível avaliar tickets fechados ou resolvidos" });
      }
      
      // Verificar se o rating é válido
      const { rating, feedback } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "A avaliação deve ser um número entre 1 e 5" });
      }
      
      // Atualizar o ticket com a avaliação usando atualização direta
      const ticketData: any = { // usar "any" para contornar a tipagem
        rating,
        feedback: feedback || null
      };
      const updatedTicket = await storage.updateTicket(ticketId, ticketData);
      
      // Registrar a atividade
      await storage.createTicketActivity({
        ticketId,
        activityType: "rate",
        content: `O cliente avaliou o atendimento com ${rating} estrelas${feedback ? ': "' + feedback + '"' : ''}.`,
        userId: null,
        clientContactId: req.clientContact.id,
        isInternal: false
      });
      
      // Notificar a equipe de suporte
      try {
        await notificationService.sendEmail({
          recipient: "suporte@redeg7.com.br",
          subject: `Avaliação do cliente no chamado #${ticketId}`,
          body: `
            <p>O cliente avaliou o chamado #${ticketId} com ${rating} estrelas.</p>
            <p><strong>Cliente:</strong> ${req.client.businessName || req.client.tradeName}</p>
            <p><strong>Contato:</strong> ${req.clientContact.name}</p>
            <p><strong>Assunto:</strong> ${ticket.title}</p>
            ${feedback ? `<p><strong>Comentário:</strong> ${feedback}</p>` : ''}
          `
        });
      } catch (error) {
        console.log("Email não enviado:", error);
      }
      
      res.json({ success: true, message: "Avaliação registrada com sucesso" });
    } catch (error) {
      console.error("Erro ao avaliar ticket:", error);
      res.status(500).json({ message: "Erro ao registrar avaliação" });
    }
  });

  // Rota para buscar informações específicas do contato do cliente
  app.get("/api/client/contact/:id", isClientAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      
      const contact = await storage.getClientContact(contactId);
      
      if (!contact) {
        return res.status(404).json({ 
          success: false, 
          message: "Contato não encontrado" 
        });
      }

      // Buscar dados do cliente associado
      const client = await storage.getClient(contact.clientId);

      res.json({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        clientId: contact.clientId,
        clientName: client?.businessName || 'Cliente não encontrado'
      });
    } catch (error) {
      console.error("Erro ao buscar contato:", error);
      res.status(500).json({ 
        success: false, 
        message: "Erro interno do servidor" 
      });
    }
  });
}