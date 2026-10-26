import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { notificationService } from "./notificationService";
import { aiService } from "./aiService";
import { whatsappBaileysService } from "./whatsapp-baileys";
import { notifyTicketOpened } from "./whatsapp-ticket-notifications";
import { db } from "./db";
import axios from "axios";
import { eq, and, sql, desc, lte, gte, isNull, isNotNull, inArray, notInArray } from "drizzle-orm";
import { 
  users, User, clients, Client, clientContacts, ClientContact, tickets, Ticket, 
  ticketActivities, TicketActivity, investments, Investment, 
  ticketCategories, TicketCategory, revenues, Revenue, type InsertClientContact
} from "@shared/schema";
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import { setupAuth, hashPassword } from "./auth";
import { registerClientRoutes } from "./client-routes";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import util from 'util';
import QRCode from 'qrcode';

// ─── Multi-tenancy helper ─────────────────────────────────────────────────────
// Retorna o tenantId efetivo do usuário logado:
//   super_admin → null (vê TUDO)
//   admin       → user.id (vê apenas os próprios dados)
//   supervisor / operacional → user.tenantId (vê dados do licenciado deles)
function getActiveTenantId(req: Request): number | null {
  const user = req.user as any;
  if (!user) return -1; // bloqueado
  if (user.role === 'super_admin') return null; // sem filtro
  if (user.role === 'admin') return user.id;
  if (user.tenantId) return user.tenantId;
  return user.id; // fallback
}
// ─────────────────────────────────────────────────────────────────────────────

// Obter o caminho do diretório atual usando ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, '../uploads');

// Garantir que o diretório de uploads existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configurar Multer para armazenamento de arquivos
const storage_upload = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

const upload = multer({ 
  storage: storage_upload,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
  fileFilter: (_req, file, cb) => {
    // Permitir apenas certos tipos de arquivo
    const allowedFileTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'application/pdf',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain'
    ];
    
    if (allowedFileTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    
    cb(new Error('Tipo de arquivo não permitido. Tipos permitidos: imagens, PDF, documentos Word e Excel, e texto.'));
  }
});

const isAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user) {
    return next();
  }
  
  res.status(401).json({ success: false, message: 'Não autorizado' });
};

const isSuperAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated() && req.user && req.user.role === 'super_admin') {
    return next();
  }
  res.status(403).json({ success: false, message: 'Acesso restrito a Super Administradores' });
};

export const isClientAuthenticated = async (req: Request, res: Response, next: NextFunction) => {
  // Verificar se o cabeçalho de autenticação existe
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token de autenticação não fornecido' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Extrair o ID do contato do token (formato: client_ID)
    if (!token.startsWith('client_')) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    const contactId = parseInt(token.replace('client_', ''));
    if (isNaN(contactId)) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    // Buscar o contato do cliente pelo ID
    const [clientContact] = await db
      .select()
      .from(clientContacts)
      .where(eq(clientContacts.id, contactId));
    
    if (!clientContact) {
      return res.status(401).json({ success: false, message: 'Token inválido' });
    }
    
    if (!clientContact.isActive) {
      return res.status(401).json({ success: false, message: 'Conta de cliente desativada' });
    }

    if (clientContact.isBlocked) {
      return res.status(403).json({ success: false, message: 'Sua conta está bloqueada. Entre em contato com o administrador.' });
    }
    
    // Buscar o cliente associado ao contato
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, clientContact.clientId));
    
    if (!client) {
      return res.status(500).json({ success: false, message: 'Cliente não encontrado' });
    }
    
    // Anexar os objetos ao request para uso posterior
    req.clientContact = clientContact;
    req.client = client;
    
    next();
  } catch (error) {
    console.error('Erro ao autenticar cliente:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar autenticação' });
  }
};

// Estender a interface de Request para incluir o usuário autenticado
declare global {
    namespace Express {
      interface Request {
        user?: User;
        client?: Client;
        clientContact?: ClientContact;
      }
    }
}

/**
 * Formatador de datas para o padrão brasileiro
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

/**
 * Calcula a duração entre duas datas em dias úteis, excluindo fins de semana
 */
function calculateBusinessDays(startDate: Date, endDate: Date): number {
  let count = 0;
  let currentDate = new Date(startDate.getTime());

  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
}

/**
 * Consulta dados básicos de CNPJ na Receita Federal
 */
/**
 * Consulta dados básicos de CNPJ na Receita Federal
 * Nota: A API gratuita da ReceitaWS tem limite de 3 requisições por minuto
 * @param cnpj CNPJ a ser consultado (com ou sem formatação)
 * @returns Dados do CNPJ consultado ou erro se não encontrado
 */
async function fetchCNPJData(cnpj: string): Promise<any> {
  try {
    // Remover caracteres não numéricos
    const formattedCNPJ = cnpj.replace(/[^\d]/g, '');
    
    // Validar se o CNPJ tem 14 dígitos
    if (formattedCNPJ.length !== 14) {
      throw new Error('CNPJ inválido - deve conter 14 dígitos');
    }
    
    // Fazer a requisição para a API da Receita Federal
    const response = await axios.get(`https://receitaws.com.br/v1/cnpj/${formattedCNPJ}`);
    
    // Verificar se a API retornou erro
    if (response.data.status === 'ERROR') {
      throw new Error(response.data.message || 'Erro ao consultar CNPJ');
    }
    
    return response.data;
  } catch (error: any) {
    // Tratar erro de limite de requisições (429)
    if (error.response && error.response.status === 429) {
      throw new Error('Limite de consultas de CNPJ excedido. Por favor, tente novamente em alguns minutos.');
    }
    
    // Outros erros
    console.error('Erro ao consultar dados do CNPJ:', error);
    throw error;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Configuração de autenticação
  setupAuth(app);
  
  // Registrar rotas para a área do cliente
  registerClientRoutes(app);

  // Rota para consulta de CNPJ
  app.get('/api/lookup/cnpj/:cnpj', async (req, res) => {
    try {
      const cnpj = req.params.cnpj;
      // Remover caracteres não numéricos para validação
      const cleanCnpj = cnpj.replace(/[^\d]/g, '');
      
      // Verificar se o CNPJ é válido (14 dígitos após limpeza)
      if (!cleanCnpj || cleanCnpj.length !== 14) {
        return res.status(400).json({ success: false, message: 'CNPJ inválido' });
      }
      
      // Buscar dados da Receita Federal
      const cnpjData = await fetchCNPJData(cleanCnpj);
      
      // Transformar os dados no formato esperado pelo frontend
      const formattedData = {
        cnpj: cleanCnpj,
        businessName: cnpjData.nome || '',
        tradeName: cnpjData.fantasia || '',
        address: {
          zip: cnpjData.cep || '',
          street: cnpjData.logradouro || '',
          number: cnpjData.numero || '',
          complement: cnpjData.complemento || '',
          district: cnpjData.bairro || '',
          city: cnpjData.municipio || '',
          state: cnpjData.uf || '',
        },
        phone: cnpjData.telefone || '',
        email: cnpjData.email || '',
      };
      
      res.json(formattedData);
    } catch (error) {
      console.error('Erro ao consultar CNPJ:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao consultar CNPJ' 
      });
    }
  });

  // Rota para obter o usuário atual
  app.get('/api/me', isAuthenticated, (req, res) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Não autenticado' });
    }
    
    // Não enviar o hash da senha para o cliente
    const { password, ...userWithoutPassword } = req.user;
    res.json(userWithoutPassword);
  });
  
  // API Usuários
  app.get('/api/users', isAuthenticated, async (req, res) => {
    try {
      const currentUser = req.user as any;
      let allUsers = await storage.getUsers();
      // super_admin vê todos; admin vê apenas seus próprios membros de equipe (sem super_admin)
      if (currentUser?.role !== 'super_admin') {
        const tenantId = getActiveTenantId(req);
        // Admins licenciados: mostram a si mesmos + seus membros (tenantId === seu id)
        // super_admin NUNCA aparece na lista de usuários de um licenciado
        allUsers = allUsers.filter(u =>
          u.role !== 'super_admin' &&
          (u.id === tenantId || u.tenantId === tenantId)
        );
      }
      const usersWithoutPasswords = allUsers.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar usuários' });
    }
  });

  app.get('/api/users/:id', isAuthenticated, async (req, res) => {
    try {
      const user = await storage.getUser(parseInt(req.params.id));
      
      if (!user) {
        return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
      }
      
      // Não enviar o hash da senha para o cliente
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('Erro ao buscar usuário:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar usuário' });
    }
  });
  
  // Criar usuário
  app.post('/api/users', isAuthenticated, async (req, res) => {
    try {
      const { username, password, name, email, role, createPortalAccess,
              companyName, phone, licenseStatus, licenseExpiresAt, licenseNotes, subscriptionPlan } = req.body;
      
      // Validação básica
      if (!username || !password || !name || !email || !role) {
        return res.status(400).json({ 
          success: false, 
          error: 'Todos os campos são obrigatórios: username, password, name, email, role' 
        });
      }
      
      // Verificar se o nome de usuário já existe
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          error: `O nome de usuário "${username}" já está em uso` 
        });
      }
      
      const hashedPassword = await hashPassword(password);
      
      // Determinar o tenantId: admin/super_admin não têm tenant; equipe sim
      let newUserTenantId: number | null = null;
      if (role !== 'super_admin' && role !== 'admin') {
        // Membros de equipe são vinculados ao licenciado que os cria
        newUserTenantId = getActiveTenantId(req);
      }

      // Criar o usuário
      const newUser = await storage.createUser({
        username,
        password: hashedPassword,
        name,
        email,
        role,
        avatar: null,
        companyName: companyName || null,
        phone: phone || null,
        licenseStatus: licenseStatus || 'active',
        licenseExpiresAt: licenseExpiresAt ? new Date(licenseExpiresAt) : null,
        licenseNotes: licenseNotes || null,
        subscriptionPlan: subscriptionPlan || null,
        tenantId: newUserTenantId,
      } as any);

      // Se for licenciado (admin), gera slug e cria branding automaticamente
      if (role === 'admin') {
        try {
          const { pool } = await import('./db');
          // Slug baseado no username: lowercase, apenas a-z, 0-9 e hífen
          let baseSlug = username.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          // Verificar se slug já existe e tornar único se necessário
          const slugCheck = await pool.query("SELECT slug FROM tenant_branding WHERE slug = $1", [baseSlug]);
          let finalSlug = baseSlug;
          if (slugCheck.rows.length > 0) {
            finalSlug = `${baseSlug}-${newUser.id}`;
          }
          const displayName = companyName || name;
          await pool.query(
            `INSERT INTO tenant_branding (tenant_id, company_name, slug, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (tenant_id) DO NOTHING`,
            [newUser.id, displayName, finalSlug]
          );
        } catch (brandingErr) {
          console.error('Erro ao criar branding inicial para licenciado:', brandingErr);
        }
      }

      // Se estiver marcado para criar acesso ao portal
      if (createPortalAccess && role === 'client') {
        try {
          // Primeiro tentamos obter um cliente correspondente pelo email
          let clientId = null;
          const clients = await storage.getClients();
          const matchingClient = clients.find(client => client.email === email);
          
          if (matchingClient) {
            clientId = matchingClient.id;
          } else {
            // Se não encontrarmos um cliente com esse email, criamos um cliente genérico
            const newClient = await storage.createClient({
              cnpj: null,
              cpf: null,
              businessName: name,
              tradeName: name,
              businessType: 'Empresa',
              email: email,
              phone: null,
              address: null,
              createdAt: new Date()
            });
            
            clientId = newClient.id;
          }
          
          // Criamos um contato para esse cliente com as credenciais do portal
          if (clientId) {
            const { v4: uuidv4 } = await import("uuid");
            
            const contactData = {
              clientId,
              name: name,
              email: email,
              phone: null,
              role: 'Usuário',
              isPrimary: true,
              authToken: uuidv4(),
              username: username,
              password: hashedPassword, // Reutiliza a senha já criptografada
              hasCredentials: true,
              isActive: true
            };
            
            await storage.createClientContact(contactData);
            console.log(`Usuário do portal criado para ${name} (${username})`);
          }
        } catch (err) {
          console.error('Erro ao criar acesso ao portal para o usuário:', err);
          // Continuamos mesmo se houver falha na criação do portal
        }
      }
      
      // Não enviar o hash da senha na resposta
      const { password: _, ...userWithoutPassword } = newUser;
      
      console.log(`Usuário criado com sucesso: ${name} (${username})`);
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao criar usuário. Por favor, tente novamente.'
      });
    }
  });
  
  // Atualizar usuário
  app.put('/api/users/:id', isAuthenticated, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { username, name, email, role, password, isActive } = req.body;
      
      // Verificar se o usuário existe
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ 
          success: false, 
          error: 'Usuário não encontrado'
        });
      }
      
      const userData: any = {
        username,
        name,
        email,
        role
      };
      
      if (isActive !== undefined) userData.isActive = isActive;
      if (req.body.isBlocked !== undefined) userData.isBlocked = req.body.isBlocked;
      if (req.body.companyName !== undefined) userData.companyName = req.body.companyName;
      if (req.body.phone !== undefined) userData.phone = req.body.phone;
      if (req.body.licenseStatus !== undefined) userData.licenseStatus = req.body.licenseStatus;
      if (req.body.licenseExpiresAt !== undefined) userData.licenseExpiresAt = req.body.licenseExpiresAt ? new Date(req.body.licenseExpiresAt) : null;
      if (req.body.licenseNotes !== undefined) userData.licenseNotes = req.body.licenseNotes;
      if (req.body.subscriptionPlan !== undefined) userData.subscriptionPlan = req.body.subscriptionPlan;
      
      if (password) {
        userData.password = await hashPassword(password);
      }
      
      // Atualizar usuário
      const updatedUser = await storage.updateUser(userId, userData);
      
      if (!updatedUser) {
        return res.status(500).json({ 
          success: false, 
          error: 'Erro ao atualizar usuário'
        });
      }
      
      // Não enviar o hash da senha na resposta
      const { password: _, ...userWithoutPassword } = updatedUser;
      
      console.log(`Usuário atualizado com sucesso: ${name} (ID: ${userId})`);
      res.json(userWithoutPassword);
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Erro ao atualizar usuário. Por favor, tente novamente.'
      });
    }
  });
  
  // Delete user (Super Admin only)
  app.delete('/api/users/:id', isSuperAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      if (req.user && req.user.id === userId) {
        return res.status(400).json({ success: false, message: 'Você não pode excluir sua própria conta' });
      }
      await db.delete(users).where(eq(users.id, userId));
      res.json({ success: true, message: 'Usuário excluído com sucesso' });
    } catch (error) {
      console.error('Erro ao excluir usuário:', error);
      res.status(500).json({ success: false, message: 'Erro ao excluir usuário' });
    }
  });

  // Super Admin - Manage client licenses
  app.put('/api/super-admin/clients/:id/license', isSuperAdmin, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      const { licenseStatus, licenseExpiresAt, licenseNotes, isBlocked } = req.body;
      const updateData: any = {};
      if (licenseStatus !== undefined) updateData.licenseStatus = licenseStatus;
      if (licenseExpiresAt !== undefined) updateData.licenseExpiresAt = licenseExpiresAt ? new Date(licenseExpiresAt) : null;
      if (licenseNotes !== undefined) updateData.licenseNotes = licenseNotes;
      if (isBlocked !== undefined) updateData.isBlocked = isBlocked;
      const [updated] = await db.update(clients).set(updateData).where(eq(clients.id, clientId)).returning();
      res.json(updated);
    } catch (error) {
      console.error('Erro ao atualizar licença do cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar licença' });
    }
  });

  // Lembretes futuros (agendados mas ainda não vencidos) — para exibição na sidebar
  app.get('/api/tickets/upcoming-reminders', isAuthenticated, async (req, res) => {
    try {
      const now = new Date();
      const tenantId = getActiveTenantId(req);
      const baseConditions = [
        isNotNull(tickets.reminderDate),
        gte(tickets.reminderDate, now),
        notInArray(tickets.status, ['closed', 'fechado', 'resolved', 'resolvido', 'cancelled', 'cancelado'])
      ];
      if (tenantId !== null) {
        baseConditions.push(eq(tickets.tenantId, tenantId));
      }
      const result = await db.select().from(tickets).where(and(...baseConditions))
        .orderBy(tickets.reminderDate);
      res.json(result);
    } catch (error) {
      console.error('Erro ao buscar lembretes futuros:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar lembretes futuros' });
    }
  });

  // Ticket reminder date - get tickets with due reminders
  app.get('/api/tickets/reminders', isAuthenticated, async (req, res) => {
    try {
      const now = new Date();
      const tenantId = getActiveTenantId(req);
      const baseConditions = [
        isNotNull(tickets.reminderDate),
        lte(tickets.reminderDate, now),
        notInArray(tickets.status, ['closed', 'fechado', 'resolved', 'resolvido', 'cancelled', 'cancelado'])
      ];
      if (tenantId !== null) {
        baseConditions.push(eq(tickets.tenantId, tenantId));
      }
      const result = await db.select().from(tickets).where(and(...baseConditions));
      res.json(result);
    } catch (error) {
      console.error('Erro ao buscar lembretes:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar lembretes' });
    }
  });

  // Ticket reminder date - set reminder
  app.put('/api/tickets/:id/reminder', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const { reminderDate, reminderNote } = req.body;
      const updateData: any = {
        reminderDate: reminderDate ? new Date(reminderDate) : null,
        reminderNotifiedAt: null,
      };
      if (reminderNote !== undefined) updateData.reminderNote = reminderNote || null;
      const [updated] = await db
        .update(tickets)
        .set(updateData)
        .where(eq(tickets.id, ticketId))
        .returning();
      res.json(updated);
    } catch (error) {
      console.error('Erro ao definir lembrete:', error);
      res.status(500).json({ success: false, message: 'Erro ao definir lembrete' });
    }
  });

  // API Clientes
  app.get('/api/clients', isAuthenticated, async (req, res) => {
    try {
      const tenantId = getActiveTenantId(req);
      let query = db.select().from(clients);
      const conditions: any[] = [];
      if (tenantId !== null) conditions.push(eq(clients.tenantId, tenantId));
      const allClients = await (conditions.length
        ? query.where(and(...conditions))
        : query
      ).orderBy(desc(clients.id));
      res.json(allClients);
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar clientes' });
    }
  });

  app.get('/api/clients/:id', isAuthenticated, async (req, res) => {
    try {
      const client = await storage.getClient(parseInt(req.params.id));
      
      if (!client) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      res.json(client);
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar cliente' });
    }
  });
  
  app.post('/api/clients', isAuthenticated, async (req, res) => {
    try {
      // Verificar se o CNPJ já existe (apenas para pessoa jurídica)
      if (req.body.documentType === 'cnpj' && req.body.documentNumber) {
        const existingClient = await storage.getClientByCNPJ(req.body.documentNumber);
        
        if (existingClient) {
          return res.status(400).json({ 
            success: false, 
            message: 'Já existe um cliente cadastrado com este CNPJ' 
          });
        }
      }

      // Verificar se o CPF já existe (apenas para pessoa física)
      if (req.body.documentType === 'cpf' && req.body.documentNumber) {
        const existingClient = await storage.getClientByCPF(req.body.documentNumber);
        
        if (existingClient) {
          return res.status(400).json({ 
            success: false, 
            message: 'Já existe um cliente cadastrado com este CPF' 
          });
        }
      }
      
      // Verificar os campos obrigatórios
      if (!req.body.businessName) {
        return res.status(400).json({ success: false, message: 'Razão Social é obrigatória' });
      }
      
      // Se for pessoa jurídica, tentar buscar dados da Receita Federal
      let cnpjData = null;
      if (req.body.documentType === 'cnpj' && req.body.documentNumber) {
        try {
          cnpjData = await fetchCNPJData(req.body.documentNumber);
        } catch (error) {
          console.error('Erro ao buscar dados do CNPJ:', error);
          // Permitir continuar mesmo sem dados da Receita
        }
      }
      
      // Preparar dados para inserção
      const clientData = {
        businessName: req.body.businessName,
        businessType: req.body.businessType || 'Empresa',
        tradeName: req.body.tradeName || null,
        cnpj: req.body.documentType === 'cnpj' ? req.body.documentNumber : null,
        cpf: req.body.documentType === 'cpf' ? req.body.documentNumber : null,
        email: req.body.email || null,
        phone: req.body.phone || null,
        address: req.body.address || null,
        createdAt: new Date(),
        tenantId: getActiveTenantId(req),
      };
      
      // Criar o cliente
      const newClient = await storage.createClient(clientData);
      
      // Se houver contato principal, criar também
      if (req.body.contactName || req.body.contactEmail || req.body.contactPhone) {
        const contactData = {
          clientId: newClient.id,
          name: req.body.contactName || 'Contato Principal',
          email: req.body.contactEmail || null,
          phone: req.body.contactPhone || null,
          role: req.body.contactRole || 'Responsável',
          isPrimary: true,
          authToken: null,
          username: null,
          password: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await storage.createClientContact(contactData);
      }
      
      res.status(201).json(newClient);
    } catch (error) {
      console.error('Erro ao criar cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar cliente' });
    }
  });
  
  app.put('/api/clients/:id', isAuthenticated, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      // Verificar se o cliente existe
      const existingClient = await storage.getClient(clientId);
      if (!existingClient) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Verificar se o CNPJ está sendo atualizado e se já existe (apenas para pessoa jurídica)
      if (
        req.body.documentType === 'cnpj' && 
        req.body.documentNumber &&
        req.body.documentNumber !== existingClient.documentNumber
      ) {
        const clientWithCnpj = await storage.getClientByCNPJ(req.body.documentNumber);
        
        if (clientWithCnpj && clientWithCnpj.id !== clientId) {
          return res.status(400).json({ 
            success: false, 
            message: 'Já existe outro cliente cadastrado com este CNPJ' 
          });
        }
      }
      
      // Verificar se o CPF está sendo atualizado e se já existe (apenas para pessoa física)
      if (
        req.body.documentType === 'cpf' && 
        req.body.documentNumber &&
        req.body.documentNumber !== existingClient.documentNumber
      ) {
        const clientWithCpf = await storage.getClientByCPF(req.body.documentNumber);
        
        if (clientWithCpf && clientWithCpf.id !== clientId) {
          return res.status(400).json({ 
            success: false, 
            message: 'Já existe outro cliente cadastrado com este CPF' 
          });
        }
      }
      
      // Preparar dados para atualização
      const updateData = {
        businessName: req.body.businessName !== undefined ? req.body.businessName : existingClient.businessName,
        businessType: req.body.businessType || existingClient.businessType,
        tradeName: req.body.tradeName !== undefined ? req.body.tradeName : existingClient.tradeName,
        cnpj: req.body.documentType === 'cnpj' ? req.body.documentNumber : existingClient.cnpj,
        cpf: req.body.documentType === 'cpf' ? req.body.documentNumber : existingClient.cpf,
        email: req.body.email !== undefined ? req.body.email : existingClient.email,
        phone: req.body.phone !== undefined ? req.body.phone : existingClient.phone,
        address: req.body.address !== undefined ? req.body.address : existingClient.address
      };
      
      // Atualizar o cliente
      const updatedClient = await storage.updateClient(clientId, updateData);
      
      res.json(updatedClient);
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar cliente' });
    }
  });
  
  // Rota para inativar um cliente
  app.put('/api/clients/:id/inactivate', isAuthenticated, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      // Verificar se o cliente existe
      const existingClient = await storage.getClient(clientId);
      if (!existingClient) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Inativar o cliente
      const inactivatedClient = await storage.inactivateClient(clientId);
      
      if (inactivatedClient) {
        res.json({ success: true, message: 'Cliente inativado com sucesso', client: inactivatedClient });
      } else {
        res.status(500).json({ success: false, message: 'Erro ao inativar cliente' });
      }
    } catch (error) {
      console.error('Erro ao inativar cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao inativar cliente' });
    }
  });
  
  // Rota para excluir um cliente
  app.delete('/api/clients/:id', isAuthenticated, async (req, res) => {
    try {
      const clientId = parseInt(req.params.id);
      
      // Verificar se o cliente existe
      const existingClient = await storage.getClient(clientId);
      if (!existingClient) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Excluir o cliente
      const deleted = await storage.deleteClient(clientId);
      
      if (deleted) {
        res.json({ success: true, message: 'Cliente excluído com sucesso' });
      } else {
        res.status(500).json({ success: false, message: 'Erro ao excluir cliente' });
      }
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao excluir cliente' });
    }
  });

  // API Contatos de Clientes
  app.get('/api/clients/:clientId/contacts', isAuthenticated, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      // Verificar se o cliente existe
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      const contacts = await storage.getClientContacts(clientId);
      res.json(contacts);
    } catch (error) {
      console.error('Erro ao buscar contatos do cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar contatos do cliente' });
    }
  });
  
  // Rota para buscar contatos de um cliente específico
  app.get('/api/client-contacts', isAuthenticated, async (req, res) => {
    try {
      const clientId = req.query.clientId;
      const includeInactive = req.query.includeInactive === 'true';
      
      if (clientId) {
        // Buscar contatos de um cliente específico
        const contacts = await storage.getClientContacts(Number(clientId));
        // Filtrar apenas contatos ativos, a menos que includeInactive seja true
        const filteredContacts = includeInactive 
          ? contacts 
          : contacts.filter(c => c.isActive !== false);
        res.json(filteredContacts);
      } else {
        // Buscar todos os contatos se não especificar clientId
        const allContacts = await storage.getAllClientContacts();
        // Filtrar apenas contatos ativos, a menos que includeInactive seja true
        const filteredContacts = includeInactive 
          ? allContacts 
          : allContacts.filter(c => c.isActive !== false);
        res.json(filteredContacts);
      }
    } catch (error) {
      console.error('Erro ao buscar contatos do cliente:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar contatos do cliente' });
    }
  });

  // Rota para buscar contatos de clientes com credenciais (para o portal)
  app.get('/api/client-contacts/with-credentials', isAuthenticated, async (req, res) => {
    try {
      const tenantId = getActiveTenantId(req);
      // Buscar todos os contatos
      const allContacts = await storage.getAllClientContacts();
      
      // Filtrar apenas os que têm credenciais (username e hasCredentials) e estão ativos
      const contactsWithCredentials = allContacts.filter(contact => 
        contact.username && contact.hasCredentials && contact.isActive
      );
      
      // Para cada contato, adicionar o nome do cliente e aplicar filtro de tenant
      const enrichedContacts = (await Promise.all(contactsWithCredentials.map(async (contact) => {
        const client = await storage.getClient(contact.clientId);
        if (!client) return null;
        // Filtro multi-tenant: super_admin vê tudo, demais veem apenas seus clientes
        if (tenantId !== null && client.tenantId !== tenantId) return null;
        return {
          ...contact,
          clientName: client.businessName
        };
      }))).filter(Boolean);
      
      res.json(enrichedContacts);
    } catch (error) {
      console.error('Erro ao buscar contatos com credenciais:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar contatos com credenciais' });
    }
  });

  app.get('/api/client-contacts/:id', isAuthenticated, async (req, res) => {
    try {
      // Certifique-se de que o parâmetro 'id' não seja "with-credentials"
      if (req.params.id === 'with-credentials') {
        return res.status(400).json({ 
          success: false, 
          message: 'ID inválido, use a rota específica para buscar contatos com credenciais' 
        });
      }
      
      const contactId = parseInt(req.params.id);
      
      // Validar se o ID é um número válido
      if (isNaN(contactId)) {
        return res.status(400).json({ 
          success: false, 
          message: 'ID do contato deve ser um número' 
        });
      }
      
      const contact = await storage.getClientContact(contactId);
      
      if (!contact) {
        return res.status(404).json({ success: false, message: 'Contato não encontrado' });
      }
      
      res.json(contact);
    } catch (error) {
      console.error('Erro ao buscar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar contato' });
    }
  });
  
  app.post('/api/clients/:clientId/contacts', isAuthenticated, async (req, res) => {
    try {
      const clientId = parseInt(req.params.clientId);
      
      // Verificar se o cliente existe
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Verificar campos obrigatórios
      if (!req.body.name) {
        return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      }
      
      // Se for para criar acesso para o portal do cliente, verificar se os dados necessários foram fornecidos
      if (req.body.createPortalAccess) {
        if (!req.body.username || !req.body.password) {
          return res.status(400).json({ 
            success: false, 
            message: 'Para criar acesso ao portal, é necessário informar usuário e senha' 
          });
        }
        
        // Verificar se o nome de usuário já está em uso por outro contato
        const allContacts = await storage.getAllClientContacts();
        const existingUsername = allContacts.find(
          c => c.username === req.body.username && c.clientId !== clientId
        );
        
        if (existingUsername) {
          return res.status(400).json({ 
            success: false, 
            message: 'Este nome de usuário já está em uso' 
          });
        }
      }
      
      // Preparar dados para inserção
      const { v4: uuidv4 } = await import("uuid");
      const { hashPassword } = await import("./auth");
      
      // Criptografar a senha se estiver criando acesso ao portal
      let hashedPassword = null;
      if (req.body.createPortalAccess && req.body.password) {
        hashedPassword = await hashPassword(req.body.password);
      }
      
      const contactData = {
        clientId,
        name: req.body.name,
        email: req.body.email || null,
        phone: req.body.phone || null,
        role: req.body.role || null,
        isPrimary: req.body.isPrimary || false,
        authToken: req.body.createPortalAccess ? uuidv4() : null,
        username: req.body.createPortalAccess ? req.body.username : null,
        password: hashedPassword, // Senha criptografada
        hasCredentials: req.body.createPortalAccess ? true : false,
        isActive: true
      };
      
      const newContact = await storage.createClientContact(contactData);
      res.status(201).json(newContact);
    } catch (error) {
      console.error('Erro ao criar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar contato' });
    }
  });
  
  app.put('/api/client-contacts/:id', isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      // Verificar se o contato existe
      const existingContact = await storage.getClientContact(contactId);
      if (!existingContact) {
        return res.status(404).json({ success: false, message: 'Contato não encontrado' });
      }
      
      // Se estiver atualizando as credenciais do portal, verificar se o nome de usuário já está em uso
      if (req.body.username && req.body.username !== existingContact.username) {
        const allContacts = await storage.getAllClientContacts();
        const existingUsername = allContacts.find(
          c => c.username === req.body.username && c.id !== contactId
        );
        
        if (existingUsername) {
          return res.status(400).json({ 
            success: false, 
            message: 'Este nome de usuário já está em uso' 
          });
        }
      }
      
      // Se estiver alterando a senha, criptografá-la
      if (req.body.password) {
        await storage.changeClientContactPassword(contactId, req.body.password);
      }
      
      // Preparar dados para atualização
      const updateData = {
        name: req.body.name !== undefined ? req.body.name : existingContact.name,
        email: req.body.email !== undefined ? req.body.email : existingContact.email,
        phone: req.body.phone !== undefined ? req.body.phone : existingContact.phone,
        role: req.body.role !== undefined ? req.body.role : existingContact.role,
        isPrimary: req.body.isPrimary !== undefined ? req.body.isPrimary : existingContact.isPrimary,
        username: req.body.username !== undefined ? req.body.username : existingContact.username,
        updatedAt: new Date()
      };
      
      // Se está adicionando acesso ao portal
      if (req.body.addPortalAccess && (!existingContact.authToken || !existingContact.hasCredentials)) {
        if (!req.body.username || !req.body.password) {
          return res.status(400).json({ 
            success: false, 
            message: 'Para adicionar acesso ao portal, é necessário informar usuário e senha' 
          });
        }
        
        const { v4: uuidv4 } = await import("uuid");
        
        // Atualizar para incluir token e credenciais
        Object.assign(updateData, {
          authToken: uuidv4(),
          username: req.body.username,
          hasCredentials: true
        });
        
        // Criar credenciais separadamente para lidar com a senha
        await storage.createClientCredentials(contactId, req.body.username, req.body.password);
      }
      
      // Atualizar o contato
      const updatedContact = await storage.updateClientContact(contactId, updateData);
      
      res.json(updatedContact);
    } catch (error) {
      console.error('Erro ao atualizar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar contato' });
    }
  });
  
  // Ativar contato
  app.post('/api/client-contacts/:id/activate', isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      // Ativar o contato
      const updatedContact = await storage.activateClientContact(contactId);
      
      if (!updatedContact) {
        return res.status(404).json({ success: false, message: 'Contato não encontrado' });
      }
      
      res.json({ success: true, message: 'Contato ativado com sucesso', contact: updatedContact });
    } catch (error) {
      console.error('Erro ao ativar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao ativar contato' });
    }
  });
  
  // Desativar contato
  app.post('/api/client-contacts/:id/deactivate', isAuthenticated, async (req, res) => {
    try {
      const contactId = parseInt(req.params.id);
      
      // Desativar o contato
      const updatedContact = await storage.deactivateClientContact(contactId);
      
      if (!updatedContact) {
        return res.status(404).json({ success: false, message: 'Contato não encontrado' });
      }
      
      res.json({ success: true, message: 'Contato desativado com sucesso', contact: updatedContact });
    } catch (error) {
      console.error('Erro ao desativar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao desativar contato' });
    }
  });
  
  // API Categorias de Tickets
  app.get('/api/ticket-categories', isAuthenticated, async (req, res) => {
    try {
      const tenantId = getActiveTenantId(req);
      let categories = await storage.getTicketCategories();
      if (tenantId !== null) {
        // Mostrar categorias do próprio tenant + categorias globais (tenantId = null)
        categories = categories.filter(c => c.tenantId === tenantId || c.tenantId === null);
      }
      res.json(categories);
    } catch (error) {
      console.error('Erro ao buscar categorias de tickets:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar categorias de tickets' });
    }
  });
  
  app.post('/api/ticket-categories', isAuthenticated, async (req, res) => {
    try {
      // Verificar campos obrigatórios
      if (!req.body.name) {
        return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
      }
      
      const tenantId = getActiveTenantId(req);
      const categoryData = {
        name: req.body.name,
        description: req.body.description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: tenantId,
      };
      
      const newCategory = await storage.createTicketCategory(categoryData as any);
      res.status(201).json(newCategory);
    } catch (error) {
      console.error('Erro ao criar categoria de ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar categoria de ticket' });
    }
  });
  
  app.put('/api/ticket-categories/:id', isAuthenticated, async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      
      // Verificar se a categoria existe
      const existingCategory = await storage.getTicketCategory(categoryId);
      if (!existingCategory) {
        return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
      }
      
      // Verificar campos obrigatórios
      if (req.body.name === '') {
        return res.status(400).json({ success: false, message: 'Nome não pode ser vazio' });
      }
      
      const updateData = {
        name: req.body.name !== undefined ? req.body.name : existingCategory.name,
        description: req.body.description !== undefined ? req.body.description : existingCategory.description,
        updatedAt: new Date()
      };
      
      const updatedCategory = await storage.updateTicketCategory(categoryId, updateData);
      res.json(updatedCategory);
    } catch (error) {
      console.error('Erro ao atualizar categoria de ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar categoria de ticket' });
    }
  });
  
  app.delete('/api/ticket-categories/:id', isAuthenticated, async (req, res) => {
    try {
      const categoryId = parseInt(req.params.id);
      
      // Verificar se a categoria existe
      const existingCategory = await storage.getTicketCategory(categoryId);
      if (!existingCategory) {
        return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
      }
      
      // Verificar se há tickets usando esta categoria
      const ticketsWithCategory = await db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .where(eq(tickets.category, existingCategory.name));
      
      if (ticketsWithCategory[0].count > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Não é possível excluir uma categoria que está sendo usada em tickets' 
        });
      }
      
      const result = await storage.deleteTicketCategory(categoryId);
      
      if (result) {
        res.json({ success: true, message: 'Categoria excluída com sucesso' });
      } else {
        res.status(500).json({ success: false, message: 'Erro ao excluir categoria' });
      }
    } catch (error) {
      console.error('Erro ao excluir categoria de ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao excluir categoria de ticket' });
    }
  });
  
  // API Tickets
  app.get('/api/tickets', isAuthenticated, async (req, res) => {
    try {
      const { status, priority, clientId, assignedTo } = req.query;
      
      const filter: Partial<{ 
        status: string; 
        priority: string; 
        clientId: number;
        assignedTo: number;
      }> = {};
      
      if (status) {
        filter.status = status as string;
      }
      
      if (priority) {
        filter.priority = priority as string;
      }
      
      if (clientId) {
        filter.clientId = parseInt(clientId as string);
      }
      
      if (assignedTo) {
        filter.assignedTo = parseInt(assignedTo as string);
      }
      
      let tickets = await storage.getTickets(filter);
      // Filtro multi-tenant: apenas chamados do tenant ativo
      const tenantId = getActiveTenantId(req);
      if (tenantId !== null) {
        tickets = tickets.filter(t => t.tenantId === tenantId);
      }
      console.log(`[API /api/tickets] Total de tickets encontrados: ${tickets.length}`);
      
      const enrichedTickets = await Promise.all(tickets.map(async (ticket) => {
        try {
          const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
          const assignedUser = ticket.assignedTo ? await storage.getUser(ticket.assignedTo) : null;
          
          let resolutionTimeHours = null;
          const closedStatuses = ['fechado', 'resolvido', 'closed', 'resolved'];
          if (closedStatuses.includes(ticket.status as string) && ticket.resolvedAt) {
            const createdDate = new Date(ticket.createdAt);
            const resolvedDate = new Date(ticket.resolvedAt);
            const businessDays = calculateBusinessDays(createdDate, resolvedDate);
            resolutionTimeHours = businessDays * 8;
          }
          
          let openTimeHours = null;
          if (!closedStatuses.includes(ticket.status as string)) {
            const createdDate = new Date(ticket.createdAt);
            const now = new Date();
            const businessDays = calculateBusinessDays(createdDate, now);
            openTimeHours = businessDays * 8;
          }
          
          let createdByContactName = null;
          if (ticket.createdByContactId) {
            try {
              const contact = await storage.getClientContact(ticket.createdByContactId);
              createdByContactName = contact?.name || null;
            } catch (e) {}
          }

          let createdByUserName = null;
          if (ticket.createdBy) {
            try {
              const creator = await storage.getUser(ticket.createdBy);
              createdByUserName = creator ? (creator.name || creator.username) : null;
            } catch (e) {}
          }

          const openedByName = createdByContactName
            ? `${createdByContactName} (Cliente)`
            : createdByUserName
            ? `${createdByUserName} (Suporte)`
            : null;

          return {
            ...ticket,
            clientName: client?.businessName || 'Cliente não encontrado',
            assignedUserName: assignedUser ? 
              (assignedUser.name || assignedUser.username) : 
              'Não atribuído',
            createdByContactName,
            createdByUserName,
            openedByName,
            resolutionTimeHours,
            openTimeHours,
            createdAtFormatted: formatDate(new Date(ticket.createdAt)),
            updatedAtFormatted: formatDate(new Date(ticket.updatedAt)),
            resolvedAtFormatted: ticket.resolvedAt ? formatDate(new Date(ticket.resolvedAt)) : null,
          };
        } catch (enrichError) {
          console.error(`[API /api/tickets] Erro ao enriquecer ticket #${ticket.id}:`, enrichError);
          return {
            ...ticket,
            clientName: 'Cliente não encontrado',
            assignedUserName: 'Não atribuído',
            createdByContactName: null,
            createdByUserName: null,
            openedByName: null,
            resolutionTimeHours: null,
            openTimeHours: null,
            createdAtFormatted: formatDate(new Date(ticket.createdAt)),
            updatedAtFormatted: formatDate(new Date(ticket.updatedAt)),
            resolvedAtFormatted: ticket.resolvedAt ? formatDate(new Date(ticket.resolvedAt)) : null,
          };
        }
      }));
      
      console.log(`[API /api/tickets] Retornando ${enrichedTickets.length} tickets enriquecidos`);
      res.json(enrichedTickets);
    } catch (error) {
      console.error('Erro ao buscar tickets:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar tickets' });
    }
  });
  
  app.get('/api/tickets/:id', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      const ticket = await storage.getTicket(ticketId);
      
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Buscar informações adicionais
      const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
      const assignedUser = ticket.assignedTo ? await storage.getUser(ticket.assignedTo) : null;
      const activities = await storage.getTicketActivities(ticketId);
      
      // Calcular tempo de resolução ou tempo em aberto
      let resolutionTimeHours = null;
      let openTimeHours = null;
      
      if (['fechado', 'resolvido'].includes(ticket.status as string) && ticket.resolvedAt) {
        const createdDate = new Date(ticket.createdAt);
        const resolvedDate = new Date(ticket.resolvedAt);
        
        // Calcular somente dias úteis
        const businessDays = calculateBusinessDays(createdDate, resolvedDate);
        
        // Considerar dias úteis de 8 horas
        resolutionTimeHours = businessDays * 8;
      } else {
        const createdDate = new Date(ticket.createdAt);
        const now = new Date();
        
        // Calcular somente dias úteis
        const businessDays = calculateBusinessDays(createdDate, now);
        
        // Considerar dias úteis de 8 horas
        openTimeHours = businessDays * 8;
      }
      
      // Enriquecer atividades com informações do usuário
      const enrichedActivities = await Promise.all(activities.map(async (activity) => {
        const user = activity.userId ? await storage.getUser(activity.userId) : null;
        const contact = activity.clientContactId ? await storage.getClientContact(activity.clientContactId) : null;
        
        return {
          ...activity,
          userInfo: user ? {
            id: user.id,
            name: user.name || user.username,
          } : null,
          contactInfo: contact ? {
            id: contact.id,
            name: contact.name,
            clientId: contact.clientId
          } : null,
          createdAtFormatted: formatDate(new Date(activity.createdAt)),
        };
      }));
      
      // Resolver quem abriu o chamado
      let openedByName: string | null = null;
      if (ticket.createdByContactId) {
        try {
          const contact = await storage.getClientContact(ticket.createdByContactId);
          if (contact?.name) openedByName = `${contact.name} (Cliente)`;
        } catch (e) {}
      } else if (ticket.createdBy) {
        try {
          const creator = await storage.getUser(ticket.createdBy);
          if (creator) openedByName = `${creator.name || creator.username} (Suporte)`;
        } catch (e) {}
      }

      // Estrutura de resposta
      const response = {
        ...ticket,
        openedByName,
        clientInfo: client ? {
          id: client.id,
          name: client.name,
          type: client.type,
          email: client.email,
          phone: client.phone
        } : null,
        assignedUserInfo: assignedUser ? {
          id: assignedUser.id,
          name: assignedUser.name || assignedUser.username
        } : null,
        activities: enrichedActivities,
        resolutionTimeHours,
        openTimeHours,
        createdAtFormatted: formatDate(new Date(ticket.createdAt)),
        updatedAtFormatted: formatDate(new Date(ticket.updatedAt)),
        resolvedAtFormatted: ticket.resolvedAt ? formatDate(new Date(ticket.resolvedAt)) : null,
      };
      
      res.json(response);
    } catch (error) {
      console.error('Erro ao buscar ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar ticket' });
    }
  });
  
  app.post('/api/tickets', isAuthenticated, async (req, res) => {
    try {
      // Verificar campos obrigatórios
      if (!req.body.title || !req.body.description || !req.body.clientId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Título, descrição e cliente são obrigatórios' 
        });
      }
      
      // Verificar se o cliente existe
      const client = await storage.getClient(parseInt(req.body.clientId));
      if (!client) {
        return res.status(400).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Buscar contato do cliente se informado
      let contact = null;
      if (req.body.contactId) {
        contact = await storage.getClientContact(parseInt(req.body.contactId));
      }
      
      // Preparar dados do ticket
      const ticketData = {
        clientId: parseInt(req.body.clientId),
        title: req.body.title,
        description: req.body.description,
        category: req.body.category || 'Outro',
        status: 'novo',
        priority: req.body.priority || 'normal',
        assignedTo: req.body.assignedTo ? parseInt(req.body.assignedTo) : null,
        createdBy: req.user ? req.user.id : null,
        createdByContactId: req.body.contactId ? parseInt(req.body.contactId) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
        resolutionNote: null,
        attachments: req.body.attachments || null,
        tenantId: getActiveTenantId(req),
      };
      
      // Criar o ticket
      const newTicket = await storage.createTicket(ticketData);
      
      // Registrar atividade de criação
      await storage.createTicketActivity({
        ticketId: newTicket.id,
        activityType: 'create', // Corrigido: action -> activityType
        content: 'Ticket criado', // Corrigido: details -> content
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enviar notificação por email se o cliente tiver email
      let emailSent = false;
      if (client.email) {
        try {
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

            // Enviar email de notificação
            const mailOptions = {
              from: `"Suporte RedeG7" <${settings.smtpUser}>`,
              to: client.email,
              subject: `Novo Chamado #${newTicket.id} - ${newTicket.title}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background-color: #0078D4; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">Suporte RedeG7</h1>
                  </div>
                  
                  <div style="padding: 30px; background-color: #f8f9fa;">
                    <h2 style="color: #0078D4; margin-top: 0;">Novo Chamado Criado</h2>
                    
                    <div style="background-color: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <p><strong>Número do Chamado:</strong> #${newTicket.id}</p>
                      <p><strong>Título:</strong> ${newTicket.title}</p>
                      <p><strong>Categoria:</strong> ${newTicket.category}</p>
                      <p><strong>Prioridade:</strong> ${newTicket.priority}</p>
                      <p><strong>Status:</strong> Novo</p>
                      <p><strong>Data de Abertura:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                      
                      <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
                        <p style="margin: 0;"><strong>Descrição:</strong></p>
                        <p style="margin: 10px 0 0 0;">${newTicket.description}</p>
                      </div>
                    </div>
                    
                    <div style="margin-top: 30px; text-align: center;">
                      <p>Você pode acompanhar o progresso deste chamado através do nosso portal de clientes.</p>
                      <p style="color: #666; font-size: 14px;">Nossa equipe de suporte entrará em contato em breve.</p>
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
            emailSent = true;
            console.log(`Email de notificação enviado para ${client.email} sobre o ticket #${newTicket.id}`);
          } else {
            console.log('Configurações SMTP não encontradas - email não enviado');
          }
        } catch (emailError) {
          console.error('Erro ao enviar notificação por email:', emailError);
          // Não interromper o fluxo se a notificação falhar
        }
      }
      
      // Enviar notificação por WhatsApp para o administrador via CallMeBot
      try {
        await notificationService.sendTicketNotificationToAdmin({
          ticketId: newTicket.id,
          title: newTicket.title,
          description: newTicket.description,
          category: newTicket.category,
          priority: newTicket.priority,
          clientName: client.businessName || client.tradeName || 'Cliente',
          clientPhone: client.phone || undefined
        });
      } catch (whatsappError) {
        console.error('Erro ao enviar notificação por WhatsApp:', whatsappError);
      }
      
      const whatsappSent = await notifyTicketOpened(newTicket).catch((error) => {
        console.error('Erro ao enviar mensagem para o cliente:', error);
        return false;
      });
      
      res.status(201).json({ ...newTicket, whatsappSent });
    } catch (error) {
      console.error('Erro ao criar ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar ticket' });
    }
  });

  // Rota para criar ticket com anexo na área administrativa
  app.post('/api/tickets/with-attachment', upload.single('attachment'), isAuthenticated, async (req, res) => {
    try {
      // Verificar campos obrigatórios
      if (!req.body.title || !req.body.description || !req.body.clientId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Título, descrição e cliente são obrigatórios' 
        });
      }
      
      // Verificar se o cliente existe
      const client = await storage.getClient(parseInt(req.body.clientId));
      if (!client) {
        return res.status(400).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Buscar contato do cliente se informado
      let contact = null;
      if (req.body.contactId) {
        contact = await storage.getClientContact(parseInt(req.body.contactId));
      }
      
      // Informações do arquivo enviado
      const fileInfo = req.file ? {
        id: Date.now(),
        filename: req.file.filename,
        size: req.file.size
      } : null;
      
      // Preparar dados do ticket
      const ticketData = {
        clientId: parseInt(req.body.clientId),
        title: req.body.title,
        description: req.body.description,
        category: req.body.category || 'Outro',
        status: req.body.status || 'novo',
        priority: req.body.priority || 'normal',
        assignedTo: req.body.assignedTo ? parseInt(req.body.assignedTo) : null,
        createdBy: req.user ? req.user.id : null,
        createdByContactId: req.body.contactId ? parseInt(req.body.contactId) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
        resolutionNote: null,
        attachments: fileInfo ? [fileInfo] : null
      };
      
      // Criar o ticket
      const newTicket = await storage.createTicket(ticketData);
      
      // Registrar atividade de criação
      await storage.createTicketActivity({
        ticketId: newTicket.id,
        activityType: 'create',
        content: `Ticket criado${fileInfo ? ` com anexo: ${fileInfo.filename}` : ''}`,
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enviar notificação por email se o cliente tiver email
      let emailSent = false;
      if (client.email) {
        try {
          const emailResult = await notificationService.sendEmail({
            recipient: client.email,
            subject: `Novo ticket #${newTicket.id} - ${newTicket.title}`,
            body: `
              <h2>Novo ticket criado</h2>
              <p><strong>Ticket #${newTicket.id}:</strong> ${newTicket.title}</p>
              <p><strong>Categoria:</strong> ${newTicket.category}</p>
              <p><strong>Prioridade:</strong> ${newTicket.priority}</p>
              <p><strong>Descrição:</strong> ${newTicket.description}</p>
              ${fileInfo ? `<p><strong>Anexo:</strong> ${fileInfo.filename} (${Math.round(fileInfo.size / 1024)} KB)</p>` : ''}
              <p>Você pode acompanhar o progresso deste chamado através do nosso portal.</p>
            `
          });
          emailSent = emailResult.success;
        } catch (emailError) {
          console.error('Erro ao enviar notificação por email:', emailError);
        }
      }
      
      // Enviar notificação por WhatsApp para o administrador via CallMeBot
      try {
        await notificationService.sendTicketNotificationToAdmin({
          ticketId: newTicket.id,
          title: newTicket.title,
          description: newTicket.description + (fileInfo ? `\n\n📎 Anexo: ${fileInfo.filename}` : ''),
          category: newTicket.category,
          priority: newTicket.priority,
          clientName: client.businessName || client.tradeName || 'Cliente',
          clientPhone: client.phone || undefined
        });
      } catch (whatsappError) {
        console.error('Erro ao enviar notificação por WhatsApp:', whatsappError);
      }
      
      const whatsappSent = await notifyTicketOpened(newTicket).catch((error) => {
        console.error('Erro ao enviar mensagem para o cliente:', error);
        return false;
      });
      
      res.status(201).json({ ...newTicket, whatsappSent });
    } catch (error) {
      console.error('Erro ao criar ticket com anexo:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar ticket com anexo' });
    }
  });
  
  app.post('/api/tickets/:id/upload', upload.array('files', 5), isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        // Remover arquivos enviados se o ticket não existir
        if (req.files && Array.isArray(req.files)) {
          req.files.forEach(file => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Verificar se os arquivos foram enviados
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
      }
      
      // Preparar detalhes dos arquivos
      const fileDetails = req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path,
        mimetype: file.mimetype,
        size: file.size,
        uploadedAt: new Date()
      }));
      
      // Atualizar o ticket com os novos anexos
      const currentAttachments = ticket.attachments || [];
      const updatedAttachments = [...currentAttachments, ...fileDetails];
      
      await storage.updateTicket(ticketId, {
        attachments: updatedAttachments,
        updatedAt: new Date()
      });
      
      // Registrar atividade de anexo
      await storage.createTicketActivity({
        ticketId,
        activityType: 'attachment', // Corrigido: action -> activityType
        content: `${req.files.length} arquivo(s) anexado(s)`, // Corrigido: details -> content
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      res.json({ 
        success: true, 
        message: 'Arquivos anexados com sucesso', 
        files: fileDetails 
      });
    } catch (error) {
      console.error('Erro ao anexar arquivos:', error);
      res.status(500).json({ success: false, message: 'Erro ao anexar arquivos' });
    }
  });
  
  app.put('/api/tickets/:id', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const existingTicket = await storage.getTicket(ticketId);
      if (!existingTicket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Preparar dados para atualização
      const updateData: Partial<Ticket> = {
        updatedAt: new Date()
      };
      
      // Campos que podem ser atualizados
      const updatableFields = [
        'title', 'description', 'category', 'priority', 'assignedTo', 'status'
      ];
      
      // Verificar quais campos foram enviados para atualização
      let fieldsUpdated = false;
      for (const field of updatableFields) {
        if (req.body[field] !== undefined) {
          // Converter assignedTo para número ou null
          if (field === 'assignedTo') {
            updateData[field] = req.body[field] ? parseInt(req.body[field]) : null;
          } else {
            updateData[field] = req.body[field];
          }
          fieldsUpdated = true;
        }
      }
      
      if (!fieldsUpdated) {
        return res.status(400).json({ 
          success: false, 
          message: 'Nenhum campo para atualização foi fornecido' 
        });
      }
      
      // Verificar mudança de status para resolvido
      if (
        updateData.status && 
        ['fechado', 'resolvido'].includes(updateData.status) && 
        !['fechado', 'resolvido'].includes(existingTicket.status as string)
      ) {
        updateData.resolvedAt = new Date();
      }
      
      // Atualizar o ticket
      const updatedTicket = await storage.updateTicket(ticketId, updateData);
      
      if (!updatedTicket) {
        return res.status(500).json({ success: false, message: 'Erro ao atualizar ticket' });
      }
      
      // Registrar atividade de atualização
      let activityDetails = 'Ticket atualizado';
      
      // Detalhes específicos para mudanças de status
      if (updateData.status && updateData.status !== existingTicket.status) {
        const translateStatus = (status: string) => {
          switch (status.toLowerCase()) {
            case 'new':
            case 'novo':
              return 'novo';
            case 'open':
            case 'aberto':
              return 'aberto';
            case 'in_progress':
            case 'em_andamento':
              return 'em andamento';
            case 'waiting_client':
            case 'aguardando_cliente':
              return 'aguardando cliente';
            case 'resolved':
            case 'resolvido':
              return 'resolvido';
            case 'closed':
            case 'fechado':
              return 'fechado';
            case 'cancelled':
            case 'cancelado':
              return 'cancelado';
            default:
              return status;
          }
        };
        
        const oldStatusPt = translateStatus(existingTicket.status);
        const newStatusPt = translateStatus(updateData.status);
        activityDetails = `Status alterado de '${oldStatusPt}' para '${newStatusPt}'`;
      }
      // Detalhes para mudança de responsável
      else if (updateData.assignedTo !== undefined && updateData.assignedTo !== existingTicket.assignedTo) {
        const newUser = updateData.assignedTo ? await storage.getUser(updateData.assignedTo) : null;
        const oldUser = existingTicket.assignedTo ? await storage.getUser(existingTicket.assignedTo) : null;
        
        activityDetails = newUser 
          ? `Atribuído para ${newUser.name || newUser.username}`
          : 'Responsável removido';
          
        // Se havia um responsável anterior, incluir essa informação
        if (oldUser) {
          activityDetails += ` (era: ${oldUser.name || oldUser.username})`;
        }
      }
      
      await storage.createTicketActivity({
        ticketId,
        activityType: 'update', // Corrigido: action -> activityType
        content: activityDetails, // Corrigido: details -> content
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enviar notificação por email ao cliente sobre mudança de status
      if (updateData.status && updateData.status !== existingTicket.status) {
        try {
          const client = existingTicket.clientId ? await storage.getClient(existingTicket.clientId) : null;
          
          if (client && client.email) {
            await notificationService.sendEmail({
              recipient: client.email,
              subject: `Atualização do ticket #${ticketId} - ${existingTicket.title}`,
              body: `
                <h2>Ticket atualizado</h2>
                <p><strong>Ticket #${ticketId}:</strong> ${existingTicket.title}</p>
                <p><strong>Status atualizado:</strong> ${existingTicket.status} → ${updateData.status}</p>
                <p>Você pode acompanhar o progresso deste chamado através do nosso portal.</p>
              `
            });
          }
        } catch (emailError) {
          console.error('Erro ao enviar notificação por email:', emailError);
          // Não interromper o fluxo se a notificação falhar
        }
      }
      
      res.json(updatedTicket);
    } catch (error) {
      console.error('Erro ao atualizar ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar ticket' });
    }
  });
  
  app.post('/api/tickets/:id/comment', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Verificar se o comentário foi fornecido
      if (!req.body.comment) {
        return res.status(400).json({ success: false, message: 'Comentário é obrigatório' });
      }
      
      // Registrar atividade de comentário
      const activity = await storage.createTicketActivity({
        ticketId,
        activityType: 'comment', // Corrigido: action -> activityType
        content: req.body.comment, // Corrigido: details -> content
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Atualizar data de atualização do ticket
      await storage.updateTicket(ticketId, { updatedAt: new Date() });
      
      // Enriquecer a atividade com informações do usuário
      const user = req.user ? await storage.getUser(req.user.id) : null;
      const enrichedActivity = {
        ...activity,
        userInfo: user ? {
          id: user.id,
          name: user.name || user.username,
        } : null,
        createdAtFormatted: formatDate(new Date(activity.createdAt)),
      };
      
      // Enviar notificação por email ao cliente sobre novo comentário
      try {
        const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
        
        if (client && client.email) {
          await notificationService.sendEmail({
            recipient: client.email,
            subject: `Novo comentário no ticket #${ticketId} - ${ticket.title}`,
            body: `
              <h2>Novo comentário em seu ticket</h2>
              <p><strong>Ticket #${ticketId}:</strong> ${ticket.title}</p>
              <p><strong>Comentário:</strong> ${req.body.comment}</p>
              <p>Você pode acompanhar o progresso deste chamado através do nosso portal.</p>
            `
          });
        }
      } catch (emailError) {
        console.error('Erro ao enviar notificação por email:', emailError);
        // Não interromper o fluxo se a notificação falhar
      }
      
      res.json({ 
        success: true, 
        message: 'Comentário adicionado com sucesso', 
        activity: enrichedActivity 
      });
    } catch (error) {
      console.error('Erro ao adicionar comentário:', error);
      res.status(500).json({ success: false, message: 'Erro ao adicionar comentário' });
    }
  });
  
  app.post('/api/tickets/:id/close', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Verificar se a nota de resolução foi fornecida
      if (!req.body.resolutionNote) {
        return res.status(400).json({ success: false, message: 'Nota de resolução é obrigatória' });
      }
      
      // Gerar token único para avaliação
      const ratingToken = uuidv4();
      
      // Fechar o ticket
      const closedTicket = await storage.closeTicket(ticketId, req.body.resolutionNote);
      
      if (!closedTicket) {
        return res.status(500).json({ success: false, message: 'Erro ao fechar ticket' });
      }
      
      // Atualizar ticket com token de avaliação e data de resolução
      const resolvedAtDate = req.body.resolvedAt ? new Date(req.body.resolvedAt) : new Date();
      await storage.updateTicket(ticketId, {
        ratingToken: ratingToken,
        ratingRequestedAt: new Date(),
        resolvedAt: resolvedAtDate
      });
      
      // Registrar atividade de fechamento
      const activity = await storage.createTicketActivity({
        ticketId,
        activityType: 'close', // Corrigido: action -> activityType
        content: `Ticket fechado: ${req.body.resolutionNote}`, // Corrigido: details -> content
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enriquecer a atividade com informações do usuário
      const user = req.user ? await storage.getUser(req.user.id) : null;
      const enrichedActivity = {
        ...activity,
        userInfo: user ? {
          id: user.id,
          name: user.name || user.username,
        } : null,
        createdAtFormatted: formatDate(new Date(activity.createdAt)),
      };
      
      // Analisar sentimento do feedback se fornecido
      let sentimentAnalysis = null;
      if (req.body.clientFeedback) {
        try {
          sentimentAnalysis = await aiService.analyzeSentiment(req.body.clientFeedback);
          
          // Atualizar ticket com o feedback e avaliação
          await storage.updateTicket(ticketId, {
            clientFeedback: req.body.clientFeedback,
            rating: sentimentAnalysis.score
          });
          
          // Registrar atividade de feedback
          await storage.createTicketActivity({
            ticketId,
            activityType: 'feedback', // Corrigido: action -> activityType
            content: `Feedback do cliente: ${req.body.clientFeedback}`, // Corrigido: details -> content
            userId: null,
            clientContactId: null,
            createdAt: new Date()
          });
        } catch (aiError) {
          console.error('Erro ao analisar sentimento do feedback:', aiError);
          // Continuar mesmo sem análise de sentimento
        }
      }
      
      // Enviar notificação por email ao cliente sobre o fechamento do ticket
      try {
        const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
        
        if (client && client.email) {
          await notificationService.sendEmail({
            recipient: client.email,
            subject: `Ticket #${ticketId} - ${ticket.title} - Concluído`,
            body: `
              <h2>Seu ticket foi resolvido</h2>
              <p><strong>Ticket #${ticketId}:</strong> ${ticket.title}</p>
              <p><strong>Solução:</strong> ${req.body.resolutionNote}</p>
              <p>Agradecemos por utilizar nosso sistema de suporte!</p>
              <p>Você pode avaliar o atendimento através do nosso portal.</p>
            `
          });
        }
      } catch (emailError) {
        console.error('Erro ao enviar notificação por email:', emailError);
        // Não interromper o fluxo se a notificação falhar
      }
      
      // Enviar link de avaliação via WhatsApp
      let whatsappSent = false;
      let whatsappWarning = null;
      try {
        const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
        
        // Tentar buscar o contato do cliente que criou o chamado
        let contactPhone = null;
        if (ticket.createdByContactId) {
          const contact = await storage.getClientContact(ticket.createdByContactId);
          if (contact) {
            // Priorizar whatsapp, depois phone
            contactPhone = contact.whatsapp || contact.phone || null;
          }
        }
        
        // Se não encontrou o contato, tentar o telefone do cliente
        if (!contactPhone && client) {
          contactPhone = client.phone || null;
        }
        
        // Verificar se temos uma URL base válida (não localhost em produção)
        const baseUrl = process.env.REPLIT_DEV_DOMAIN 
          ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
          : process.env.APP_URL || null;
        
        if (!baseUrl) {
          whatsappWarning = 'URL do sistema não configurada - link de avaliação não enviado';
          console.warn(whatsappWarning);
        } else if (!contactPhone) {
          whatsappWarning = 'Contato sem telefone cadastrado - link de avaliação não enviado';
          console.warn(whatsappWarning);
        } else if (!whatsappBaileysService.isConnected()) {
          whatsappWarning = 'WhatsApp não conectado - link de avaliação não enviado';
          console.warn(whatsappWarning);
        } else {
          const ratingUrl = `${baseUrl}/avaliacao/${ratingToken}`;
          
          const ratingMessage = `✅ *Chamado Finalizado*\n\n` +
            `Olá! Seu chamado *#${ticketId} - ${ticket.title}* foi resolvido.\n\n` +
            `📋 *Solução:* ${req.body.resolutionNote}\n\n` +
            `⭐ Por favor, avalie nosso atendimento clicando no link abaixo:\n` +
            `${ratingUrl}\n\n` +
            `Agradecemos por utilizar nosso suporte! 🙏`;
          
          const result = await whatsappBaileysService.sendMessage(contactPhone, ratingMessage, false);
          if (result.success) {
            whatsappSent = true;
            console.log(`Link de avaliação enviado via WhatsApp para ${contactPhone}`);
          } else {
            whatsappWarning = 'Falha ao enviar mensagem WhatsApp';
          }
        }
      } catch (whatsappError) {
        console.error('Erro ao enviar link de avaliação via WhatsApp:', whatsappError);
        whatsappWarning = 'Erro ao enviar link de avaliação via WhatsApp';
      }
      
      res.json({ 
        success: true, 
        message: 'Ticket fechado com sucesso', 
        ticket: closedTicket,
        activity: enrichedActivity,
        sentimentAnalysis,
        ratingToken,
        whatsappSent,
        whatsappWarning
      });
    } catch (error) {
      console.error('Erro ao fechar ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao fechar ticket' });
    }
  });

  // Rota para finalizar ticket com anexo
  app.post('/api/tickets/:id/close-with-attachment', upload.single('attachment'), isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Verificar se a nota de resolução foi fornecida
      if (!req.body.resolutionNote) {
        return res.status(400).json({ success: false, message: 'Nota de resolução é obrigatória' });
      }
      
      // Informações do arquivo enviado
      const fileInfo = req.file ? {
        id: Date.now(),
        filename: req.file.filename,
        size: req.file.size
      } : null;
      
      // Fechar o ticket
      const closedTicket = await storage.closeTicket(ticketId, req.body.resolutionNote);
      
      if (!closedTicket) {
        return res.status(500).json({ success: false, message: 'Erro ao fechar ticket' });
      }
      
      // Atualizar ticket com data de resolução e anexo
      const resolvedAtDate = req.body.resolvedAt ? new Date(req.body.resolvedAt) : new Date();
      const updateData: any = { resolvedAt: resolvedAtDate };
      
      if (fileInfo) {
        const existingAttachments = closedTicket.attachments || [];
        updateData.attachments = [...existingAttachments, fileInfo];
      }
      
      await storage.updateTicket(ticketId, updateData);
      
      // Registrar atividade de fechamento
      const activity = await storage.createTicketActivity({
        ticketId,
        activityType: 'close',
        content: `Ticket fechado: ${req.body.resolutionNote}${fileInfo ? ` (com anexo: ${fileInfo.filename})` : ''}`,
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enriquecer a atividade com informações do usuário
      const user = req.user ? await storage.getUser(req.user.id) : null;
      const enrichedActivity = {
        ...activity,
        userInfo: user ? {
          id: user.id,
          name: user.name || user.username,
        } : null,
        createdAtFormatted: formatDate(new Date(activity.createdAt)),
      };
      
      // Enviar notificação por email ao cliente sobre o fechamento do ticket
      try {
        const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
        
        if (client && client.email) {
          await notificationService.sendEmail({
            recipient: client.email,
            subject: `Ticket #${ticketId} - ${ticket.title} - Concluído`,
            body: `
              <h2>Seu ticket foi resolvido</h2>
              <p><strong>Ticket #${ticketId}:</strong> ${ticket.title}</p>
              <p><strong>Solução:</strong> ${req.body.resolutionNote}</p>
              ${fileInfo ? `<p><strong>Anexo incluído:</strong> ${fileInfo.filename} (${Math.round(fileInfo.size / 1024)} KB)</p>` : ''}
              <p>Agradecemos por utilizar nosso sistema de suporte!</p>
              <p>Você pode avaliar o atendimento através do nosso portal.</p>
            `
          });
        }
      } catch (emailError) {
        console.error('Erro ao enviar notificação por email:', emailError);
        // Não interromper o fluxo se a notificação falhar
      }
      
      res.json({ 
        success: true, 
        message: 'Ticket fechado com sucesso', 
        ticket: closedTicket,
        activity: enrichedActivity,
        attachment: fileInfo
      });
    } catch (error) {
      console.error('Erro ao fechar ticket com anexo:', error);
      res.status(500).json({ success: false, message: 'Erro ao fechar ticket com anexo' });
    }
  });
  
  app.post('/api/tickets/:id/cancel', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      // Verificar se a nota de cancelamento foi fornecida
      if (!req.body.cancellationNote) {
        return res.status(400).json({ success: false, message: 'Motivo do cancelamento é obrigatório' });
      }
      
      // Cancelar o ticket
      const cancelledTicket = await storage.cancelTicket(ticketId, req.body.cancellationNote);
      
      if (!cancelledTicket) {
        return res.status(500).json({ success: false, message: 'Erro ao cancelar ticket' });
      }
      
      // Registrar atividade de cancelamento
      const activity = await storage.createTicketActivity({
        ticketId,
        activityType: 'cancellation',
        content: `Ticket cancelado: ${req.body.cancellationNote}`,
        userId: req.user ? req.user.id : null,
        clientContactId: null,
        createdAt: new Date()
      });
      
      // Enriquecer a atividade com informações do usuário
      const user = req.user ? await storage.getUser(req.user.id) : null;
      const enrichedActivity = {
        ...activity,
        userInfo: user ? {
          id: user.id,
          name: user.name || user.username,
        } : null,
        createdAtFormatted: formatDate(new Date(activity.createdAt)),
      };
      
      // Enviar notificação por email ao cliente sobre o cancelamento do ticket
      try {
        const client = ticket.clientId ? await storage.getClient(ticket.clientId) : null;
        
        if (client && client.email) {
          await notificationService.sendEmail({
            recipient: client.email,
            subject: `Ticket #${ticketId} - ${ticket.title} - Cancelado`,
            body: `
              <h2>Seu ticket foi cancelado</h2>
              <p><strong>Ticket #${ticketId}:</strong> ${ticket.title}</p>
              <p><strong>Motivo:</strong> ${req.body.cancellationNote}</p>
              <p>Se você acredita que isso foi um erro, por favor entre em contato conosco.</p>
            `
          });
        }
      } catch (emailError) {
        console.error('Erro ao enviar notificação por email:', emailError);
        // Não interromper o fluxo se a notificação falhar
      }
      
      res.json({ 
        success: true, 
        message: 'Ticket cancelado com sucesso', 
        ticket: cancelledTicket,
        activity: enrichedActivity
      });
    } catch (error) {
      console.error('Erro ao cancelar ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao cancelar ticket' });
    }
  });
  
  app.get('/api/tickets/:id/activities', isAuthenticated, async (req, res) => {
    try {
      const ticketId = parseInt(req.params.id);
      
      // Verificar se o ticket existe
      const ticket = await storage.getTicket(ticketId);
      if (!ticket) {
        return res.status(404).json({ success: false, message: 'Ticket não encontrado' });
      }
      
      const activities = await storage.getTicketActivities(ticketId);
      
      // Enriquecer atividades com informações do usuário
      const enrichedActivities = await Promise.all(activities.map(async (activity) => {
        const user = activity.userId ? await storage.getUser(activity.userId) : null;
        const contact = activity.clientContactId ? await storage.getClientContact(activity.clientContactId) : null;
        
        // Garantir que attachments seja um array
        let attachments = activity.attachments;
        if (typeof attachments === 'string') {
          try {
            // Se for uma string que parece um array PostgreSQL, converter
            if (attachments.startsWith('{') && attachments.endsWith('}')) {
              attachments = attachments.slice(1, -1).split(',').filter(item => item.trim());
            } else {
              attachments = [attachments];
            }
          } catch (e) {
            attachments = [];
          }
        }
        
        return {
          ...activity,
          attachments: attachments || [],
          userInfo: user ? {
            id: user.id,
            name: user.name || user.username,
          } : null,
          contactInfo: contact ? {
            id: contact.id,
            name: contact.name,
            clientId: contact.clientId
          } : null,
          createdAtFormatted: formatDate(new Date(activity.createdAt)),
        };
      }));
      
      res.json(enrichedActivities);
    } catch (error) {
      console.error('Erro ao buscar atividades do ticket:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar atividades do ticket' });
    }
  });
  
  // API Investimentos
  app.get('/api/investments', isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      const tenantId = getActiveTenantId(req);
      
      let investments = await storage.getInvestments(
        clientId ? parseInt(clientId as string) : undefined
      );
      if (tenantId !== null) {
        investments = investments.filter(i => i.tenantId === tenantId);
      }
      
      // Enriquecer investimentos com informações do cliente
      const enrichedInvestments = await Promise.all(investments.map(async (investment) => {
        const client = investment.clientId ? await storage.getClient(investment.clientId) : null;
        
        return {
          ...investment,
          clientName: client?.businessName || 'Cliente não encontrado',
          createdAtFormatted: formatDate(new Date(investment.createdAt)),
          investmentDateFormatted: formatDate(new Date(investment.investmentDate)),
        };
      }));
      
      res.json(enrichedInvestments);
    } catch (error) {
      console.error('Erro ao buscar investimentos:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar investimentos' });
    }
  });
  
  app.get('/api/investments/:id', isAuthenticated, async (req, res) => {
    try {
      const investmentId = parseInt(req.params.id);
      const investment = await storage.getInvestment(investmentId);
      
      if (!investment) {
        return res.status(404).json({ success: false, message: 'Investimento não encontrado' });
      }
      
      // Enriquecer com informações do cliente
      const client = investment.clientId ? await storage.getClient(investment.clientId) : null;
      
      const enrichedInvestment = {
        ...investment,
        clientName: client?.businessName || 'Cliente não encontrado',
        createdAtFormatted: formatDate(new Date(investment.createdAt)),
        investmentDateFormatted: formatDate(new Date(investment.investmentDate)),
      };
      
      res.json(enrichedInvestment);
    } catch (error) {
      console.error('Erro ao buscar investimento:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar investimento' });
    }
  });
  
  app.post('/api/investments', isAuthenticated, async (req, res) => {
    try {
      // Verificar campos obrigatórios
      if (!req.body.clientId || !req.body.amount || !req.body.description) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cliente, valor e descrição são obrigatórios' 
        });
      }
      
      // Verificar se o cliente existe
      const client = await storage.getClient(parseInt(req.body.clientId));
      if (!client) {
        return res.status(400).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Verificar se é um fornecedor
      if (client.type !== 'supplier') {
        return res.status(400).json({ 
          success: false, 
          message: 'Só é possível registrar investimentos para fornecedores' 
        });
      }
      
      // Preparar dados do investimento
      const investmentData = {
        clientId: parseInt(req.body.clientId),
        description: req.body.description,
        amount: parseFloat(req.body.amount),
        investmentDate: req.body.investmentDate ? new Date(req.body.investmentDate) : new Date(),
        notes: req.body.notes || null,
        createdBy: req.user ? req.user.id : null,
        createdAt: new Date(),
        updatedAt: new Date(),
        tenantId: getActiveTenantId(req),
      };
      
      // Criar o investimento
      const newInvestment = await storage.createInvestment(investmentData as any);
      
      res.status(201).json(newInvestment);
    } catch (error) {
      console.error('Erro ao criar investimento:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar investimento' });
    }
  });
  
  // API Receitas
  app.get('/api/revenues', isAuthenticated, async (req, res) => {
    try {
      const { clientId } = req.query;
      
      const tenantId = getActiveTenantId(req);
      let revenues = await storage.getRevenues(
        clientId ? parseInt(clientId as string) : undefined
      );
      if (tenantId !== null) {
        revenues = revenues.filter(r => r.tenantId === tenantId);
      }
      
      // Enriquecer receitas com informações do cliente
      const enrichedRevenues = await Promise.all(revenues.map(async (revenue) => {
        const client = revenue.clientId ? await storage.getClient(revenue.clientId) : null;
        
        return {
          ...revenue,
          clientName: client?.businessName || 'Cliente não encontrado',
          createdAtFormatted: formatDate(new Date(revenue.createdAt)),
          revenueDateFormatted: formatDate(new Date(revenue.revenueDate)),
        };
      }));
      
      res.json(enrichedRevenues);
    } catch (error) {
      console.error('Erro ao buscar receitas:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar receitas' });
    }
  });
  
  app.get('/api/revenues/:id', isAuthenticated, async (req, res) => {
    try {
      const revenueId = parseInt(req.params.id);
      const revenue = await storage.getRevenue(revenueId);
      
      if (!revenue) {
        return res.status(404).json({ success: false, message: 'Receita não encontrada' });
      }
      
      // Enriquecer com informações do cliente
      const client = revenue.clientId ? await storage.getClient(revenue.clientId) : null;
      
      const enrichedRevenue = {
        ...revenue,
        clientName: client?.businessName || 'Cliente não encontrado',
        createdAtFormatted: formatDate(new Date(revenue.createdAt)),
        revenueDateFormatted: formatDate(new Date(revenue.revenueDate)),
      };
      
      res.json(enrichedRevenue);
    } catch (error) {
      console.error('Erro ao buscar receita:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar receita' });
    }
  });
  
  app.post('/api/revenues', isAuthenticated, async (req, res) => {
    try {
      // Verificar campos obrigatórios
      if (!req.body.clientId || !req.body.amount || !req.body.description || !req.body.type) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cliente, valor, tipo e descrição são obrigatórios' 
        });
      }
      
      // Verificar se o cliente existe
      const client = await storage.getClient(parseInt(req.body.clientId));
      if (!client) {
        return res.status(400).json({ success: false, message: 'Cliente não encontrado' });
      }
      
      // Verificar se é um cliente e não um fornecedor para receitas de serviço
      if (req.body.type === 'service' && client.businessType === 'Fornecedor') {
        return res.status(400).json({ 
          success: false, 
          message: 'Receitas de serviço só podem ser registradas para clientes' 
        });
      }
      
      const revenueData = {
        clientId: parseInt(req.body.clientId),
        description: req.body.description,
        category: req.body.category || 'Serviço',
        amount: parseFloat(req.body.amount),
        type: req.body.type || 'service',
        date: req.body.date ? new Date(req.body.date) : (req.body.revenueDate ? new Date(req.body.revenueDate) : new Date()),
        paymentStatus: req.body.paymentStatus || 'pending',
        paymentMethod: req.body.paymentMethod || null,
        isRecurring: req.body.isRecurring || false,
        notes: req.body.notes || null,
        ticketId: req.body.ticketId ? parseInt(req.body.ticketId) : null,
        tenantId: getActiveTenantId(req),
      };
      
      // Criar a receita
      const newRevenue = await storage.createRevenue(revenueData as any);
      
      res.status(201).json(newRevenue);
    } catch (error) {
      console.error('Erro ao criar receita:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar receita' });
    }
  });
  
  app.put('/api/revenues/:id', isAuthenticated, async (req, res) => {
    try {
      const revenueId = parseInt(req.params.id);
      
      // Verificar se a receita existe
      const existingRevenue = await storage.getRevenue(revenueId);
      if (!existingRevenue) {
        return res.status(404).json({ success: false, message: 'Receita não encontrada' });
      }
      
      const updateData = {
        description: req.body.description !== undefined ? req.body.description : existingRevenue.description,
        category: req.body.category !== undefined ? req.body.category : existingRevenue.category,
        amount: req.body.amount !== undefined ? parseFloat(req.body.amount) : existingRevenue.amount,
        type: req.body.type !== undefined ? req.body.type : existingRevenue.type,
        date: req.body.date ? new Date(req.body.date) : existingRevenue.date,
        paymentStatus: req.body.paymentStatus !== undefined ? req.body.paymentStatus : existingRevenue.paymentStatus,
        paymentMethod: req.body.paymentMethod !== undefined ? req.body.paymentMethod : existingRevenue.paymentMethod,
        isRecurring: req.body.isRecurring !== undefined ? req.body.isRecurring : existingRevenue.isRecurring,
        notes: req.body.notes !== undefined ? req.body.notes : existingRevenue.notes,
        ticketId: req.body.ticketId !== undefined ? (req.body.ticketId ? parseInt(req.body.ticketId) : null) : existingRevenue.ticketId,
      };
      
      // Atualizar a receita
      const updatedRevenue = await storage.updateRevenue(revenueId, updateData);
      
      res.json(updatedRevenue);
    } catch (error) {
      console.error('Erro ao atualizar receita:', error);
      res.status(500).json({ success: false, message: 'Erro ao atualizar receita' });
    }
  });
  
  // Teste de notificação para administrador
  app.post('/api/test-admin-notification', isAuthenticated, async (req, res) => {
    try {
      const result = await notificationService.sendTicketNotificationToAdmin({
        ticketId: 9999,
        title: '🧪 TESTE DE NOTIFICAÇÃO',
        description: 'Esta é uma mensagem de teste para verificar se as notificações estão funcionando corretamente.',
        category: 'Teste',
        priority: 'normal',
        clientName: 'Sistema de Teste',
        clientPhone: '5562992771254'
      });
      
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar notificação de teste:', error);
      res.status(500).json({ success: false, message: String(error) });
    }
  });
  
  // API Dashboard
  app.get('/api/dashboard/metrics', isAuthenticated, async (req, res) => {
    try {
      const { timeframe } = req.query;
      const tenantId = getActiveTenantId(req);
      const metrics = await storage.getDashboardMetrics(timeframe as string, tenantId);
      
      // Fetch actual customer satisfaction from service ratings
      try {
        const { pool } = await import('./db');
        const ratingsResult = await pool.query(`
          SELECT AVG(rating) as average, COUNT(*) as total 
          FROM service_ratings
        `);
        
        if (ratingsResult.rows.length > 0 && ratingsResult.rows[0].total > 0) {
          const avgRating = parseFloat(ratingsResult.rows[0].average || 0);
          // Convert from 1-5 scale to 0-100 scale
          metrics.customerSatisfaction = (avgRating / 5) * 100;
        }
      } catch (ratingsError) {
        console.log('Using default satisfaction value:', ratingsError);
      }
      
      res.json(metrics);
    } catch (error) {
      console.error('Erro ao buscar métricas do dashboard:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar métricas do dashboard' });
    }
  });
  
  app.get('/api/dashboard/tickets-by-category', isAuthenticated, async (req, res) => {
    try {
      const { timeframe } = req.query;
      const tenantId = getActiveTenantId(req);
      const data = await storage.getTicketsByCategory(timeframe as string, tenantId);
      res.json(data);
    } catch (error) {
      console.error('Erro ao buscar distribuição de tickets por categoria:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao buscar distribuição de tickets por categoria' 
      });
    }
  });
  
  app.get('/api/dashboard/resolution-time-history', isAuthenticated, async (req, res) => {
    try {
      const { timeframe } = req.query;
      const tenantId = getActiveTenantId(req);
      const data = await storage.getResolutionTimeHistory(timeframe as string, tenantId);
      res.json(data);
    } catch (error) {
      console.error('Erro ao buscar histórico de tempo de resolução:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao buscar histórico de tempo de resolução' 
      });
    }
  });

  // Relatório por empresa com tempo em aberto
  app.get('/api/dashboard/tickets-by-company', isAuthenticated, async (req, res) => {
    try {
      const { timeframe } = req.query;
      const tenantId = getActiveTenantId(req);
      const data = await storage.getTicketsByCompany(timeframe as string, tenantId);
      res.json(data);
    } catch (error) {
      console.error('Erro ao buscar relatório por empresa:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao buscar relatório por empresa' 
      });
    }
  });
  
  // API WhatsApp - Status, inicialização e desconexão
  app.get('/api/whatsapp/status', isAuthenticated, async (req, res) => {
    const status = await whatsappBaileysService.getStatus();
    res.json(status);
  });

  app.post('/api/whatsapp/initialize', isAuthenticated, async (req, res) => {
    try {
      const result = await whatsappBaileysService.initialize();
      res.json(result);
    } catch (error) {
      console.error('Erro ao inicializar WhatsApp:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao inicializar WhatsApp' 
      });
    }
  });

  app.post('/api/whatsapp/disconnect', isAuthenticated, async (req, res) => {
    const result = await whatsappBaileysService.disconnect();
    res.json(result);
  });
  
  // Rotas administrativas para WhatsApp (compatíveis com o painel de administração)
  app.get('/api/admin/whatsapp/status', isAuthenticated, async (req, res) => {
    const status = await whatsappBaileysService.getStatus();
    res.json(status);
  });
  
  // Rotas públicas para WhatsApp (apenas para monitoramento e testes)
  app.get('/api/monitor/whatsapp/status', async (req, res) => {
    const status = await whatsappBaileysService.getStatus();
    res.json(status);
  });
  
  app.post('/api/monitor/whatsapp/initialize', async (req, res) => {
    try {
      // Sempre inicializa em modo real, sem opção de simulação
      const result = await whatsappBaileysService.initialize();
      res.json(result);
    } catch (error) {
      console.error('Erro ao inicializar WhatsApp:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao inicializar WhatsApp' 
      });
    }
  });
  
  app.get('/api/monitor/whatsapp/qrcode', async (req, res) => {
    try {
      const result = await whatsappBaileysService.getQrCode();
      res.json(result);
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao obter QR code' 
      });
    }
  });
  
  app.get('/api/monitor/whatsapp/contacts', async (req, res) => {
    try {
      const contacts = await whatsappBaileysService.getContacts();
      res.json({ success: true, contacts });
    } catch (error) {
      res.status(500).json({ success: false, contacts: [], message: String(error) });
    }
  });
  
  app.get('/api/monitor/whatsapp/chat/:contactId', async (req, res) => {
    try {
      const { contactId } = req.params;
      const messages = await whatsappBaileysService.getMessages(contactId);
      whatsappBaileysService.markAsRead(contactId);
      res.json({ success: true, messages });
    } catch (error) {
      res.status(500).json({ success: false, messages: [], message: String(error) });
    }
  });
  
  app.post('/api/monitor/whatsapp/message', async (req, res) => {
    try {
      const { to, message } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({ 
          success: false, 
          message: 'Destinatário e mensagem são obrigatórios' 
        });
      }
      
      const result = await whatsappBaileysService.sendMessage(to, message);
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao enviar mensagem' 
      });
    }
  });
  


  app.post('/api/admin/whatsapp/initialize', isAuthenticated, async (req, res) => {
    try {
      // Sempre inicializa em modo real, sem opção de simulação
      const result = await whatsappBaileysService.initialize();
      res.json(result);
    } catch (error) {
      console.error('Erro ao inicializar WhatsApp:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao inicializar WhatsApp' 
      });
    }
  });

  app.post('/api/admin/whatsapp/disconnect', isAuthenticated, async (req, res) => {
    const result = await whatsappBaileysService.disconnect();
    res.json(result);
  });
  
  // Rota para reiniciar WhatsApp (desconectar e inicializar novamente)
  app.post('/api/admin/whatsapp/restart', isAuthenticated, async (req, res) => {
    console.log('Iniciando processo de reinicialização do WhatsApp...');
    try {
      await whatsappBaileysService.disconnect();
      const result = await whatsappBaileysService.initialize();
      console.log('WhatsApp reiniciado com sucesso');
      res.json(result);
    } catch (error) {
      console.error('Erro ao reiniciar WhatsApp:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao reiniciar WhatsApp: ' + (error instanceof Error ? error.message : 'erro desconhecido')
      });
    }
  });
  
  app.get('/api/admin/whatsapp/qrcode', isAuthenticated, async (req, res) => {
    try {
      const result = await whatsappBaileysService.getQrCode();
      res.json(result);
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao obter QR code' 
      });
    }
  });
  
  // API WhatsApp - Contatos e conversas
  app.get('/api/whatsapp/contacts', isAuthenticated, async (req, res) => {
    try {
      const contacts = await whatsappBaileysService.getContacts();
      res.json({ success: true, contacts });
    } catch (error) {
      res.status(500).json({ success: false, contacts: [], message: String(error) });
    }
  });
  
  app.get('/api/whatsapp/chat/:contactId', isAuthenticated, async (req, res) => {
    try {
      const { contactId } = req.params;
      const messages = await whatsappBaileysService.getMessages(contactId);
      whatsappBaileysService.markAsRead(contactId);
      res.json({ success: true, messages });
    } catch (error) {
      res.status(500).json({ success: false, messages: [], message: String(error) });
    }
  });
  
  app.post('/api/whatsapp/message', isAuthenticated, async (req, res) => {
    try {
      const { to, message } = req.body;
      
      if (!to || !message) {
        return res.status(400).json({ 
          success: false, 
          message: 'Destinatário e mensagem são obrigatórios' 
        });
      }
      
      const result = await whatsappBaileysService.sendMessage(to, message);
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao enviar mensagem' 
      });
    }
  });

  // API WhatsApp - QR Code
  app.get('/api/whatsapp/qrcode', isAuthenticated, async (_req, res) => {
    try {
      const result = await whatsappBaileysService.getQrCode();
      res.json(result);
    } catch (error) {
      console.error('Erro ao obter QR code:', error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : 'Erro ao obter QR code' 
      });
    }
  });

  // API WhatsApp - Listar conversas por status
  app.get('/api/whatsapp/conversations', isAuthenticated, async (req, res) => {
    try {
      const { status } = req.query;
      const tenantId = getActiveTenantId(req);
      let conversations;
      if (status && typeof status === 'string') {
        conversations = await whatsappBaileysService.getConversationsByStatus(status, tenantId);
      } else {
        conversations = await whatsappBaileysService.getAllConversations(tenantId);
      }
      res.json({ success: true, conversations });
    } catch (error) {
      console.error('Erro ao listar conversas:', error);
      res.status(500).json({ success: false, message: 'Erro ao listar conversas' });
    }
  });

  // API WhatsApp - Obter mensagens de uma conversa
  app.get('/api/whatsapp/conversations/:id/messages', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const messages = await whatsappBaileysService.getConversationMessages(conversationId);
      res.json({ success: true, messages });
    } catch (error) {
      console.error('Erro ao obter mensagens:', error);
      res.status(500).json({ success: false, message: 'Erro ao obter mensagens' });
    }
  });

  // API WhatsApp - Iniciar atendimento
  app.post('/api/whatsapp/conversations/:id/start', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const user = req.user as any;
      if (!user?.id) {
        return res.status(401).json({ success: false, message: 'Usuário não autenticado' });
      }
      const attendantName = user.name || user.username || 'Atendente';
      const tenantId = getActiveTenantId(req);
      const result = await whatsappBaileysService.startAttending(conversationId, user.id, attendantName, tenantId);
      res.json(result);
    } catch (error) {
      console.error('Erro ao iniciar atendimento:', error);
      res.status(500).json({ success: false, message: 'Erro ao iniciar atendimento' });
    }
  });

  // API WhatsApp - Finalizar conversa
  app.post('/api/whatsapp/conversations/:id/finish', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { sendFarewellMessage, clientName, rating, comment } = req.body;
      const user = req.user as any;
      
      // Finaliza a conversa — despedida imediata só se NÃO houver ticket vinculado
      const { pool } = await import('./db');
      const convRow = await pool.query(
        `SELECT phone_number, ticket_id, contact_name FROM whatsapp_conversations WHERE id = $1`,
        [conversationId]
      );
      const conv = convRow.rows[0] || {};
      const ticketId: number | null = conv.ticket_id || null;
      const phoneNumber: string = conv.phone_number || '';
      const contactName: string = clientName || conv.contact_name || 'Cliente';

      // Passa sendFarewellMessage=false para finishConversation; a despedida é controlada aqui
      const result = await whatsappBaileysService.finishConversation(conversationId, false, clientName);

      if (rating && rating >= 1 && rating <= 5) {
        await whatsappBaileysService.saveRating({
          conversationId,
          attendantId: user?.id,
          rating,
          comment
        });
      }

      // Enviar link de avaliação ao cliente via WhatsApp se houver ticket vinculado
      let ratingLinkSent = false;
      let ratingLinkWarning: string | null = null;
      try {
        if (ticketId && phoneNumber) {
          // Gerar token único de avaliação para este ticket
          const ratingToken = uuidv4();
          // Salva token + flag de despedida pós-avaliação no ticket
          await storage.updateTicket(ticketId, {
            ratingToken,
            ratingRequestedAt: new Date(),
            sendFarewellAfterRating: sendFarewellMessage || false,
          } as any);

          const ticket = await storage.getTicket(ticketId);
          const baseUrl = process.env.REPLIT_DEV_DOMAIN
            ? `https://${process.env.REPLIT_DEV_DOMAIN}`
            : process.env.APP_URL || null;

          if (baseUrl && whatsappBaileysService.isConnected()) {
            const ratingUrl = `${baseUrl}/avaliacao/${ratingToken}`;
            const ratingMessage =
              `⭐ *Avalie nosso atendimento!*\n\n` +
              `Olá, ${contactName}! O atendimento do chamado *#${ticketId}${ticket ? ' - ' + ticket.title : ''}* foi finalizado.\n\n` +
              `Por favor, dedique um momento para avaliar o nosso suporte clicando no link abaixo:\n` +
              `${ratingUrl}\n\n` +
              `Sua opinião é muito importante para nós! 🙏`;

            const sendResult = await whatsappBaileysService.sendMessage(phoneNumber, ratingMessage, false);
            ratingLinkSent = sendResult.success;
            if (!sendResult.success) ratingLinkWarning = 'Falha ao enviar link de avaliação via WhatsApp';
          } else if (!baseUrl) {
            ratingLinkWarning = 'URL do sistema não configurada — link de avaliação não enviado';
          } else {
            ratingLinkWarning = 'WhatsApp não conectado — link de avaliação não enviado';
          }
        } else if (!ticketId) {
          ratingLinkWarning = 'Nenhum chamado vinculado — link de avaliação não enviado';
          // Sem ticket: envia despedida imediatamente se o atendente solicitou
          if (sendFarewellMessage && phoneNumber && whatsappBaileysService.isConnected()) {
            const farewellMsg = `👋🏻 Atendimento finalizado!\n${contactName}, obrigado por escolher a RedeG7 Soluções em TI 🔰🔐\nEstamos sempre à disposição 😉`;
            await whatsappBaileysService.sendMessage(phoneNumber, farewellMsg, false);
          }
        }
      } catch (ratingErr) {
        console.error('Erro ao enviar link de avaliação após finalizar conversa:', ratingErr);
        ratingLinkWarning = 'Erro ao enviar link de avaliação';
      }

      res.json({ ...result, ratingLinkSent, ratingLinkWarning });
    } catch (error) {
      console.error('Erro ao finalizar conversa:', error);
      res.status(500).json({ success: false, message: 'Erro ao finalizar conversa' });
    }
  });

  // API WhatsApp - Estatísticas de avaliações
  app.get('/api/whatsapp/ratings/stats', isAuthenticated, async (_req, res) => {
    try {
      const stats = await whatsappBaileysService.getRatingsStats();
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
    }
  });

  // API WhatsApp - Vincular chamado à conversa
  app.post('/api/whatsapp/conversations/:id/link-ticket', isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { ticketId } = req.body;
      if (!ticketId) {
        return res.status(400).json({ success: false, message: 'ticketId é obrigatório' });
      }
      const result = await whatsappBaileysService.linkTicketToConversation(conversationId, ticketId);
      res.json(result);
    } catch (error) {
      console.error('Erro ao vincular chamado:', error);
      res.status(500).json({ success: false, message: 'Erro ao vincular chamado' });
    }
  });

  // Rotas para configurações de integração
  app.post('/api/settings/integration', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const settings = req.body;
      
      console.log('Configurações de integração recebidas:', settings);
      
      // Salvar cada configuração no banco de dados
      const { pool } = await import('./db');
      for (const [key, value] of Object.entries(settings)) {
        await pool.query(`
          INSERT INTO system_settings (key, value, updated_at) 
          VALUES ($1, $2, NOW()) 
          ON CONFLICT (key) 
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `, [key, String(value)]);
      }
      
      res.json({ 
        success: true, 
        message: 'Configurações de integração salvas com sucesso' 
      });
    } catch (error) {
      console.error('Erro ao salvar configurações de integração:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao salvar configurações de integração' 
      });
    }
  });

  // Rota para carregar configurações de integração
  app.get('/api/settings/integration', isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Carregar configurações do banco de dados
      const { pool } = await import('./db');
      const settingsResult = await pool.query('SELECT key, value FROM system_settings');
      const settings: Record<string, any> = {};
      
      // Converter resultado do banco para objeto
      settingsResult.rows.forEach((row: { key: string; value: string }) => {
        let value: any = row.value;
        
        // Converter valores boolean
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        
        settings[row.key] = value;
      });
      
      // Configurações padrão se não existir no banco
      const defaultSettings = {
        emailService: "smtp",
        smtpHost: "",
        smtpPort: "587",
        smtpUser: "",
        smtpPassword: "",
        whatsappEnabled: false,
        whatsappNumber: "",
        whatsappApiKey: "",
        whatsappAdminNumber: "",
        callmebotApiKey: "",
        cnpjApiEnabled: true,
        cnpjApiKey: ""
      };
      
      // Mesclar configurações do banco com padrões
      const finalSettings = { ...defaultSettings, ...settings };
      
      res.json(finalSettings);
    } catch (error) {
      console.error('Erro ao carregar configurações de integração:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao carregar configurações de integração' 
      });
    }
  });

  // Rota para testar envio de email
  app.post('/api/settings/test-email', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({
          success: false,
          message: 'Email de teste é obrigatório'
        });
      }

      // Buscar configurações SMTP do banco
      const { pool } = await import('./db');
      const settingsResult = await pool.query('SELECT key, value FROM system_settings');
      const settings: Record<string, any> = {};
      
      settingsResult.rows.forEach((row: { key: string; value: string }) => {
        settings[row.key] = row.value;
      });

      // Verificar se configurações SMTP estão definidas
      if (!settings.smtpHost || !settings.smtpUser || !settings.smtpPassword) {
        return res.status(400).json({
          success: false,
          message: 'Configurações SMTP não estão completas'
        });
      }

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

      // Verificar conexão
      await transporter.verify();

      // Enviar email de teste
      const mailOptions = {
        from: `"Suporte RedeG7" <${settings.smtpUser}>`,
        to: testEmail,
        subject: 'Teste de Configuração SMTP - Suporte RedeG7',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0078D4;">🎉 Teste de Email Bem-Sucedido!</h2>
            <p>Parabéns! As configurações SMTP do sistema Suporte RedeG7 estão funcionando corretamente.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #333; margin-top: 0;">Configurações Testadas:</h3>
              <ul>
                <li><strong>Servidor SMTP:</strong> ${settings.smtpHost}</li>
                <li><strong>Porta:</strong> ${settings.smtpPort}</li>
                <li><strong>Usuário:</strong> ${settings.smtpUser}</li>
                <li><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</li>
              </ul>
            </div>
            
            <p>O sistema está pronto para enviar notificações por email para seus clientes.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Este é um email automático gerado pelo sistema Suporte RedeG7.<br>
              Se você recebeu este email por engano, pode ignorá-lo com segurança.
            </p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);

      res.json({
        success: true,
        message: `Email de teste enviado com sucesso para ${testEmail}`
      });

    } catch (error: any) {
      console.error('Erro no teste de email:', error);
      res.status(500).json({
        success: false,
        message: `Erro ao enviar email de teste: ${error.message}`
      });
    }
  });

  const httpServer = createServer(app);
  
  // Configurar WebSocket Server para atualizações em tempo real
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('Nova conexão WebSocket estabelecida');
    
    // Enviar mensagem de boas-vindas
    ws.send(JSON.stringify({ type: 'connected', message: 'Conectado ao servidor WebSocket' }));
    
    // Registrar handler para mensagens recebidas
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('Mensagem WebSocket recebida:', data);
      } catch (e) {
        console.error('Erro ao processar mensagem WebSocket:', e);
      }
    });
    
    // Registrar callback para QR Code do WhatsApp
    whatsappBaileysService.onQrCodeUpdate(async (qrCode) => {
      try {
        const qrImageDataUrl = await QRCode.toDataURL(qrCode, {
          errorCorrectionLevel: 'H',
          margin: 1,
          scale: 8
        });
        
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'whatsapp_qrcode', 
            qrCode: qrImageDataUrl 
          }));
        }
      } catch (e) {
        console.error('Erro ao enviar QR code via WebSocket:', e);
      }
    });
    
    ws.on('close', () => {
      console.log('Conexão WebSocket fechada');
    });
  });

  // Rota para atualizar a senha de um contato do cliente
  app.post('/api/client-contacts/:id/update-password', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      const { password } = req.body;
      
      if (!contactId || isNaN(contactId)) {
        return res.status(400).json({ success: false, message: "ID de contato inválido" });
      }
      
      if (!password || password.trim() === '') {
        return res.status(400).json({ success: false, message: "Senha não pode estar vazia" });
      }
      
      const contact = await storage.getClientContact(contactId);
      if (!contact) {
        return res.status(404).json({ success: false, message: "Contato não encontrado" });
      }
      
      const success = await storage.changeClientContactPassword(contactId, password);
      
      if (success) {
        return res.json({ success: true, message: "Senha atualizada com sucesso" });
      } else {
        return res.status(500).json({ success: false, message: "Erro ao atualizar senha" });
      }
    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      return res.status(500).json({ success: false, message: "Erro interno ao atualizar senha" });
    }
  });
  
  // Rota para criar um novo contato de cliente com credenciais
  app.post('/api/client-contacts', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { clientId, name, email, role, phone, whatsapp, isPrimary, isActive, credentials } = req.body;
      
      if (!clientId || !name) {
        return res.status(400).json({ 
          success: false, 
          message: 'ID do cliente e nome são obrigatórios' 
        });
      }
      
      // Verificar se o cliente existe
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ 
          success: false, 
          message: 'Cliente não encontrado' 
        });
      }
      
      // Criar contato
      const contactData: InsertClientContact = {
        clientId,
        name,
        email: email || null,
        role: role || null,
        phone: phone || null,
        whatsapp: whatsapp || null,
        isPrimary: isPrimary || false,
        isActive: isActive !== undefined ? isActive : true
      };
      
      const newContact = await storage.createClientContact(contactData);
      
      // Se tiver credenciais, criar acesso ao portal
      if (credentials && credentials.username && credentials.password) {
        const success = await storage.createClientCredentials(
          newContact.id,
          credentials.username,
          credentials.password
        );
        
        if (!success) {
          return res.status(400).json({ 
            success: false, 
            message: 'Não foi possível criar credenciais para o contato. O nome de usuário pode já estar em uso.' 
          });
        }
        
        // Buscar contato atualizado com credenciais
        const updatedContact = await storage.getClientContact(newContact.id);
        if (updatedContact) {
          return res.status(200).json(updatedContact);
        }
      }
      
      res.status(201).json(newContact);
    } catch (error) {
      console.error('Erro ao criar contato:', error);
      res.status(500).json({ success: false, message: 'Erro ao criar contato' });
    }
  });
  
  // Rota para atualizar as credenciais de um contato
  app.put('/api/client-contacts/:id/credentials', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      const { username, password } = req.body;
      
      if (!contactId || isNaN(contactId)) {
        return res.status(400).json({ success: false, message: "ID de contato inválido" });
      }
      
      if (!username || username.trim() === '') {
        return res.status(400).json({ success: false, message: "Nome de usuário não pode estar vazio" });
      }
      
      // Verificar se o contato existe
      const contact = await storage.getClientContact(contactId);
      if (!contact) {
        return res.status(404).json({ success: false, message: "Contato não encontrado" });
      }
      
      // Atualizar as credenciais
      const success = await storage.updateClientCredentials(contactId, username, password);
      
      if (success) {
        // Buscar contato atualizado
        const updatedContact = await storage.getClientContact(contactId);
        return res.json({ success: true, message: "Credenciais atualizadas com sucesso", contact: updatedContact });
      } else {
        return res.status(400).json({ 
          success: false, 
          message: "Não foi possível atualizar as credenciais. O nome de usuário pode já estar em uso." 
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar credenciais:', error);
      return res.status(500).json({ success: false, message: "Erro interno ao atualizar credenciais" });
    }
  });
  
  // Rota para alternar o status ativo/inativo de um contato
  app.put('/api/client-contacts/:id/toggle-status', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const contactId = parseInt(req.params.id);
      
      if (!contactId || isNaN(contactId)) {
        return res.status(400).json({ success: false, message: "ID de contato inválido" });
      }
      
      // Verificar se o contato existe
      const contact = await storage.getClientContact(contactId);
      if (!contact) {
        return res.status(404).json({ success: false, message: "Contato não encontrado" });
      }
      
      let updatedContact;
      if (contact.isActive) {
        updatedContact = await storage.deactivateClientContact(contactId);
      } else {
        updatedContact = await storage.activateClientContact(contactId);
      }
      
      if (updatedContact) {
        return res.json({ 
          success: true, 
          message: updatedContact.isActive ? "Contato ativado com sucesso" : "Contato desativado com sucesso",
          contact: updatedContact 
        });
      } else {
        return res.status(500).json({ success: false, message: "Erro ao alternar status do contato" });
      }
    } catch (error) {
      console.error('Erro ao alternar status do contato:', error);
      return res.status(500).json({ success: false, message: "Erro interno ao alternar status do contato" });
    }
  });
  
  // Rota para obter todos os contatos de cliente com credenciais
  app.get('/api/client-contacts/with-credentials', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const tenantId = getActiveTenantId(req);
      const contacts = await storage.getAllClientContacts();
      
      // Filtrar apenas contatos com credenciais
      const contactsWithCredentials = contacts.filter(contact => contact.hasCredentials);
      
      // Para cada contato, buscar o nome do cliente e aplicar filtro de tenant
      const contactsWithClientInfo = (await Promise.all(contactsWithCredentials.map(async (contact) => {
        const client = await storage.getClient(contact.clientId);
        if (!client) return null;
        if (tenantId !== null && client.tenantId !== tenantId) return null;
        return {
          ...contact,
          clientName: client.businessName
        };
      }))).filter(Boolean);
      
      res.json(contactsWithClientInfo);
    } catch (error) {
      console.error('Erro ao buscar contatos com credenciais:', error);
      res.status(500).json({ success: false, message: 'Erro ao buscar contatos com credenciais' });
    }
  });

  // ========================================
  // ROTAS PÚBLICAS DE AVALIAÇÃO DE CHAMADOS
  // ========================================
  
  // ── Branding público global (sem autenticação — tela de login padrão) ──
  app.get('/api/public/branding', async (_req: Request, res: Response) => {
    try {
      const { pool } = await import('./db');
      const result = await pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo_url')"
      );
      const data: Record<string, string> = {};
      result.rows.forEach((row: { key: string; value: string }) => {
        data[row.key] = row.value;
      });
      res.json({
        companyName: data['company_name'] || 'Suporte RedeG7',
        companyLogoUrl: data['company_logo_url'] || null,
      });
    } catch (error) {
      res.json({ companyName: 'Suporte RedeG7', companyLogoUrl: null });
    }
  });

  // ── Branding de licenciado por slug (sem autenticação — tela de login personalizada) ──
  app.get('/api/public/branding/:slug', async (req: Request, res: Response) => {
    try {
      const { slug } = req.params;
      const { pool } = await import('./db');
      const result = await pool.query(
        "SELECT company_name, company_logo_url, slug FROM tenant_branding WHERE slug = $1",
        [slug]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Licenciado não encontrado' });
      }
      const row = result.rows[0];
      res.json({
        companyName: row.company_name || 'Suporte RedeG7',
        companyLogoUrl: row.company_logo_url || null,
        slug: row.slug,
      });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar branding' });
    }
  });

  // ── Obter branding do usuário atual (autenticado) ──
  app.get('/api/settings/branding', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { pool } = await import('./db');
      if (user.role === 'super_admin') {
        const result = await pool.query(
          "SELECT key, value FROM system_settings WHERE key IN ('company_name', 'company_logo_url')"
        );
        const data: Record<string, string> = {};
        result.rows.forEach((row: { key: string; value: string }) => { data[row.key] = row.value; });
        return res.json({
          companyName: data['company_name'] || 'Suporte RedeG7',
          companyLogoUrl: data['company_logo_url'] || null,
          slug: null,
        });
      } else if (user.role === 'admin') {
        const result = await pool.query(
          "SELECT company_name, company_logo_url, slug FROM tenant_branding WHERE tenant_id = $1",
          [user.id]
        );
        if (result.rows.length === 0) {
          return res.json({ companyName: '', companyLogoUrl: null, slug: null });
        }
        const row = result.rows[0];
        return res.json({
          companyName: row.company_name || '',
          companyLogoUrl: row.company_logo_url || null,
          slug: row.slug || null,
        });
      }
      res.json({ companyName: '', companyLogoUrl: null, slug: null });
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar branding' });
    }
  });

  // ── Salvar configurações de branding (autenticado) ──
  app.post('/api/settings/branding', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { companyName, slug } = req.body;
      const user = req.user as any;
      const { pool } = await import('./db');
      if (user.role === 'super_admin') {
        if (companyName !== undefined) {
          await pool.query(
            `INSERT INTO system_settings (key, value, updated_at) VALUES ('company_name', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [companyName]
          );
        }
      } else if (user.role === 'admin') {
        const cleanSlug = slug ? String(slug).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60) : null;
        await pool.query(
          `INSERT INTO tenant_branding (tenant_id, company_name, slug, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET company_name = $2, slug = $3, updated_at = NOW()`,
          [user.id, companyName || null, cleanSlug]
        );
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Erro ao salvar branding:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar configurações' });
    }
  });

  // ── Upload de logo (autenticado, por tenant) ──
  const logoUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (req, file, cb) => {
        const user = (req as any).user;
        const ext = path.extname(file.originalname);
        if (user && user.role === 'admin') {
          cb(null, `company_logo_tenant_${user.id}${ext}`);
        } else {
          cb(null, `company_logo${ext}`);
        }
      },
    }),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'].includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Apenas imagens são permitidas'));
      }
    },
  });

  app.post('/api/settings/branding/logo', isAuthenticated, logoUpload.single('logo'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Nenhum arquivo enviado' });
      }
      const user = req.user as any;
      const logoUrl = `/uploads/${req.file.filename}`;
      const { pool } = await import('./db');
      if (user.role === 'super_admin') {
        await pool.query(
          `INSERT INTO system_settings (key, value, updated_at) VALUES ('company_logo_url', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
          [logoUrl]
        );
      } else if (user.role === 'admin') {
        await pool.query(
          `INSERT INTO tenant_branding (tenant_id, company_logo_url, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (tenant_id) DO UPDATE SET company_logo_url = $2, updated_at = NOW()`,
          [user.id, logoUrl]
        );
      }
      res.json({ success: true, logoUrl });
    } catch (error) {
      console.error('Erro ao salvar logo:', error);
      res.status(500).json({ success: false, message: 'Erro ao salvar logo' });
    }
  });

  // ── Remover logo ──
  app.delete('/api/settings/branding/logo', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      const { pool } = await import('./db');
      if (user.role === 'super_admin') {
        await pool.query("DELETE FROM system_settings WHERE key = 'company_logo_url'");
      } else if (user.role === 'admin') {
        await pool.query(
          "UPDATE tenant_branding SET company_logo_url = NULL, updated_at = NOW() WHERE tenant_id = $1",
          [user.id]
        );
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Erro ao remover logo' });
    }
  });

  // ── Retornar branding de todos os licenciados (super_admin) ──
  app.get('/api/admin/tenant-brandings', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (user.role !== 'super_admin') return res.status(403).json({ message: 'Acesso negado' });
      const { pool } = await import('./db');
      const result = await pool.query(
        "SELECT tenant_id, company_name, company_logo_url, slug FROM tenant_branding"
      );
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ message: 'Erro ao buscar brandings' });
    }
  });

  app.get('/api/public/ticket-rating/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ message: 'Token de avaliação não fornecido' });
      }
      
      // Buscar ticket pelo token de avaliação
      const ticket = await storage.getTicketByRatingToken(token);
      
      if (!ticket) {
        return res.status(404).json({ message: 'Link de avaliação inválido ou expirado' });
      }
      
      // Buscar informações do cliente
      const client = await storage.getClient(ticket.clientId);
      
      res.json({
        ticketId: ticket.id,
        title: ticket.title,
        clientName: client?.businessName || 'Cliente',
        rating: ticket.rating,
        feedback: ticket.feedback,
        alreadyRated: !!ticket.rating
      });
    } catch (error) {
      console.error('Erro ao buscar ticket para avaliação:', error);
      res.status(500).json({ message: 'Erro ao carregar informações do chamado' });
    }
  });
  
  // Salvar avaliação do cliente (rota pública)
  app.post('/api/public/ticket-rating/:token', async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const { rating, feedback } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Token de avaliação não fornecido' });
      }
      
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Avaliação inválida. Selecione de 1 a 5 estrelas.' });
      }
      
      // Buscar ticket pelo token de avaliação
      const ticket = await storage.getTicketByRatingToken(token);
      
      if (!ticket) {
        return res.status(404).json({ message: 'Link de avaliação inválido ou expirado' });
      }
      
      // Atualizar ticket com avaliação e desativar flag de despedida pós-avaliação
      const shouldSendFarewell = (ticket as any).sendFarewellAfterRating || false;
      await storage.updateTicket(ticket.id, {
        rating: rating,
        feedback: feedback || null,
        sendFarewellAfterRating: false,
      } as any);
      
      // Registrar atividade de avaliação
      await storage.createTicketActivity({
        ticketId: ticket.id,
        activityType: 'rating',
        content: `Cliente avaliou o atendimento: ${rating} estrela(s)${feedback ? ` - "${feedback}"` : ''}`,
        userId: null,
        clientContactId: null,
        createdAt: new Date()
      });

      // Enviar mensagem automática de despedida via WhatsApp após avaliação
      if (shouldSendFarewell) {
        try {
          const { pool } = await import('./db');
          const convRow = await pool.query(
            `SELECT phone_number, contact_name FROM whatsapp_conversations WHERE ticket_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [ticket.id]
          );
          if (convRow.rows.length > 0) {
            const { phone_number, contact_name } = convRow.rows[0];
            const clientName = contact_name || 'Cliente';
            const starsMap: Record<number, string> = { 1: '⭐', 2: '⭐⭐', 3: '⭐⭐⭐', 4: '⭐⭐⭐⭐', 5: '⭐⭐⭐⭐⭐' };
            const stars = starsMap[rating] || '⭐';
            const farewellMsg =
              `👋🏻 Obrigado pela avaliação, ${clientName}! ${stars}\n\n` +
              `Ficamos muito felizes em poder ajudá-lo. Obrigado por escolher a RedeG7 Soluções em TI 🔰🔐\n` +
              `Estamos sempre à disposição! 😉`;
            await whatsappBaileysService.sendMessage(phone_number, farewellMsg, false);
            console.log(`[RATING] Mensagem de despedida enviada para ${phone_number} após avaliação do ticket #${ticket.id}`);
          }
        } catch (farewellErr) {
          console.error('[RATING] Erro ao enviar despedida após avaliação:', farewellErr);
        }
      }
      
      res.json({ success: true, message: 'Avaliação registrada com sucesso' });
    } catch (error) {
      console.error('Erro ao salvar avaliação:', error);
      res.status(500).json({ message: 'Erro ao salvar avaliação' });
    }
  });

  // Rota do chatbot IA (Claude com tool use)
  app.post('/api/chat', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { message, history } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ message: 'Mensagem inválida' });
      }
      const previousMessages: { role: string; content: string }[] = Array.isArray(history) ? history : [];
      const user = req.user as any;
      const tenantId = getActiveTenantId(req);
      const result = await aiService.generateResponseWithTools(
        message,
        previousMessages,
        storage,
        tenantId,
        user?.id
      );
      res.json(result);
    } catch (error) {
      console.error('Erro no /api/chat:', error);
      res.status(500).json({ message: 'Erro ao processar mensagem' });
    }
  });

  // Test endpoint: simula mensagem WhatsApp recebida para testar o fluxo do bot
  app.post('/api/test-wa-bot', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { message, phone, contactName, clientId, clientName } = req.body;
      if (!message) return res.status(400).json({ message: 'Campo message obrigatório' });

      const context = {
        history: [] as { role: 'user' | 'assistant'; content: string }[],
        identifiedClientId: clientId || null,
        identifiedClientName: clientName || null,
      };

      const result = await aiService.handleWhatsAppMessage(
        message,
        context,
        storage,
        contactName || 'Cliente Teste'
      );

      res.json({
        reply: result.reply,
        identifiedClientId: result.updatedContext.identifiedClientId,
        identifiedClientName: result.updatedContext.identifiedClientName,
        ticketCreated: result.ticketCreated || null,
      });
    } catch (error: any) {
      console.error('Erro no /api/test-wa-bot:', error);
      res.status(500).json({ message: error?.message || 'Erro ao processar' });
    }
  });

  return httpServer;
}
