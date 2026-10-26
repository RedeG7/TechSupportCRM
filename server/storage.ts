import { 
  users, 
  type User, 
  type InsertUser,
  clients,
  type Client,
  type InsertClient,
  clientContacts,
  type ClientContact,
  type InsertClientContact,
  tickets,
  type Ticket,
  type InsertTicket,
  ticketActivities,
  type TicketActivity,
  type InsertTicketActivity,
  ticketCategories,
  type TicketCategory,
  type InsertTicketCategory,
  investments,
  type Investment,
  type InsertInvestment,
  revenues,
  type Revenue,
  type InsertRevenue
} from "@shared/schema";

// Define storage interface
export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined>;
  
  // Client operations
  getClient(id: number): Promise<Client | undefined>;
  getClientByCNPJ(cnpj: string): Promise<Client | undefined>;
  getClientByCPF(cpf: string): Promise<Client | undefined>;
  getClients(): Promise<Client[]>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  inactivateClient(id: number): Promise<Client | undefined>;
  deleteClient(id: number): Promise<boolean>;
  
  // Client contact operations
  getClientContacts(clientId: number): Promise<ClientContact[]>;
  getAllClientContacts(): Promise<ClientContact[]>;
  getClientContact(contactId: number): Promise<ClientContact | undefined>;
  getClientContactByWhatsApp(whatsappNumber: string): Promise<ClientContact | undefined>;
  createClientContact(contact: InsertClientContact): Promise<ClientContact>;
  updateClientContact(contactId: number, contactData: Partial<InsertClientContact>): Promise<ClientContact | undefined>;
  createClientCredentials(contactId: number, username: string, password: string): Promise<boolean>;
  updateClientCredentials(contactId: number, username: string, password: string): Promise<boolean>;
  activateClientContact(contactId: number): Promise<ClientContact | undefined>;
  deactivateClientContact(contactId: number): Promise<ClientContact | undefined>;
  changeClientContactPassword(contactId: number, newPassword: string): Promise<boolean>;
  
  // Ticket operations
  getTicket(id: number): Promise<Ticket | undefined>;
  getTicketByRatingToken(token: string): Promise<Ticket | undefined>;
  getTickets(filter?: Partial<{ status: string, priority: string, clientId: number, assignedTo: number, createdByContactId: number }>): Promise<Ticket[]>;
  createTicket(ticket: InsertTicket): Promise<Ticket>;
  updateTicket(id: number, ticket: Partial<InsertTicket> & { rating?: number, feedback?: string | null }): Promise<Ticket | undefined>;
  closeTicket(id: number, resolutionNote: string): Promise<Ticket | undefined>;
  
  // Ticket activity operations
  getTicketActivities(ticketId: number): Promise<TicketActivity[]>;
  createTicketActivity(activity: InsertTicketActivity): Promise<TicketActivity>;
  
  // Ticket category operations
  getTicketCategory(id: number): Promise<TicketCategory | undefined>;
  getTicketCategories(): Promise<TicketCategory[]>;
  createTicketCategory(category: InsertTicketCategory): Promise<TicketCategory>;
  updateTicketCategory(id: number, category: Partial<InsertTicketCategory>): Promise<TicketCategory | undefined>;
  deleteTicketCategory(id: number): Promise<boolean>;
  
  // Investment operations
  getInvestment(id: number): Promise<Investment | undefined>;
  getInvestments(clientId?: number): Promise<Investment[]>;
  createInvestment(investment: InsertInvestment): Promise<Investment>;
  
  // Revenue operations
  getRevenue(id: number): Promise<Revenue | undefined>;
  getRevenues(clientId?: number): Promise<Revenue[]>;
  createRevenue(revenue: InsertRevenue): Promise<Revenue>;
  updateRevenue(id: number, revenue: Partial<InsertRevenue>): Promise<Revenue | undefined>;
  
  // Dashboard metrics
  getDashboardMetrics(timeframe?: string, tenantId?: number | null): Promise<{
    openTickets: number,
    avgResolutionTime: number,
    resolutionRate: number,
    customerSatisfaction: number
  }>;
  
  getTicketsByCategory(timeframe?: string, tenantId?: number | null): Promise<{ category: string, count: number }[]>;
  getResolutionTimeHistory(timeframe?: string, tenantId?: number | null): Promise<{ date: string, hours: number }[]>;
  getTicketsByCompany(timeframe?: string, tenantId?: number | null): Promise<{
    companyName: string,
    totalTickets: number,
    openTickets: number,
    avgTimeOpen: number,
    oldestTicketDays: number
  }[]>;
}

export class MemStorage implements IStorage {
  public users: Map<number, User>;
  private clients: Map<number, Client>;
  private clientContacts: Map<number, ClientContact>;
  private tickets: Map<number, Ticket>;
  private ticketActivities: Map<number, TicketActivity>;
  private ticketCategories: Map<number, TicketCategory>;
  private investments: Map<number, Investment>;
  private revenues: Map<number, Revenue>;
  
  private userIdCounter: number;
  private clientIdCounter: number;
  private contactIdCounter: number;
  private ticketIdCounter: number;
  private activityIdCounter: number;
  private categoryIdCounter: number;
  private investmentIdCounter: number;
  private revenueIdCounter: number;

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.clientContacts = new Map();
    this.tickets = new Map();
    this.ticketActivities = new Map();
    this.ticketCategories = new Map();
    this.investments = new Map();
    this.revenues = new Map();
    
    this.userIdCounter = 1;
    this.clientIdCounter = 1;
    this.contactIdCounter = 1;
    this.ticketIdCounter = 1;
    this.activityIdCounter = 1;
    this.categoryIdCounter = 1;
    this.investmentIdCounter = 1;
    this.revenueIdCounter = 1;
    
    // Add some initial data for testing
    (async () => {
      await this.seedData();
    })();
  }

  private async seedData() {
    // Create demo user
    const adminUser: InsertUser = {
      username: "admin",
      password: "admin123", // In a real app, this would be hashed
      name: "Admin User",
      email: "admin@example.com",
      role: "admin",
      avatar: "",
    };
    this.createUser(adminUser);
    
    // Create default ticket categories
    const defaultCategories = [
      { name: "Rede", description: "Problemas relacionados à rede e conectividade", color: "#3B82F6" },
      { name: "Hardware", description: "Problemas com equipamentos físicos", color: "#F59E0B" },
      { name: "Software", description: "Instalação, atualização e configuração de software", color: "#10B981" },
      { name: "E-mail", description: "Problemas com contas de e-mail", color: "#6366F1" },
      { name: "Acesso", description: "Problemas de acesso a sistemas ou contas", color: "#EC4899" },
      { name: "Servidor", description: "Problemas com servidores", color: "#8B5CF6" },
      { name: "Impressora", description: "Problemas com impressoras", color: "#F97316" }
    ];
    
    for (const category of defaultCategories) {
      this.createTicketCategory(category);
    }
    
    // Create demo clients
    const client1: InsertClient = {
      cnpj: "12345678000190",
      businessType: "Empresa",
      businessName: "TechCorp Brasil",
      tradeName: "TechCorp",
      email: "contato@techcorp.com.br",
      phone: "(11) 3456-7890",
      address: {
        zip: "01234-567",
        street: "Av. Paulista",
        number: "1000",
        complement: "Sala 123",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP"
      }
    };
    this.createClient(client1);
    
    // Add contacts
    const contact1: InsertClientContact = {
      clientId: 1,
      name: "João Silva",
      email: "joao.silva@techcorp.com.br",
      whatsapp: "(11) 98765-4321",
      isPrimary: true
    };
    const createdContact = await this.createClientContact(contact1);
    
    // Criar credenciais para o contato (usuário e senha para acesso)
    await this.createClientCredentials(createdContact.id, "joao.silva", "123456");
    
    // Create some tickets
    const ticket1: InsertTicket = {
      clientId: 1,
      title: "Falha na configuração de rede",
      description: "O roteador principal da empresa não está distribuindo endereços IP corretamente para as máquinas da rede. Cerca de 10 computadores estão sem acesso à Internet.",
      status: "in_progress",
      priority: "high",
      category: "Rede",
      assignedTo: 1,
      createdBy: 1
    };
    this.createTicket(ticket1);
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }
  
  async getUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userIdCounter++;
    // Garantindo que todos os campos necessários estejam presentes
    const user: User = { 
      ...insertUser, 
      id,
      role: insertUser.role || 'user', // Valor padrão para role
      avatar: insertUser.avatar ?? null // Garantir que avatar seja string ou null
    };
    this.users.set(id, user);
    return user;
  }
  
  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    // Se a senha não for alterada, mantemos a senha atual
    if (!userData.password) {
      const { password, ...userDataWithoutPassword } = userData;
      const updatedUser: User = { ...user, ...userDataWithoutPassword };
      this.users.set(id, updatedUser);
      return updatedUser;
    } else {
      // Se a senha for alterada, incluímos ela na atualização
      const updatedUser: User = { ...user, ...userData };
      this.users.set(id, updatedUser);
      return updatedUser;
    }
  }
  
  // Client operations
  async getClient(id: number): Promise<Client | undefined> {
    return this.clients.get(id);
  }
  
  async getClientByCNPJ(cnpj: string): Promise<Client | undefined> {
    return Array.from(this.clients.values()).find(
      (client) => client.cnpj === cnpj
    );
  }
  
  async getClientByCPF(cpf: string): Promise<Client | undefined> {
    return Array.from(this.clients.values()).find(
      (client) => client.cpf === cpf
    );
  }
  
  async getClients(): Promise<Client[]> {
    return Array.from(this.clients.values());
  }
  
  async createClient(insertClient: InsertClient): Promise<Client> {
    const id = this.clientIdCounter++;
    const now = new Date();
    const client: Client = { 
      id,
      createdAt: now,
      businessType: insertClient.businessType,
      businessName: insertClient.businessName,
      cnpj: insertClient.cnpj ?? null,
      cpf: insertClient.cpf ?? null,
      tradeName: insertClient.tradeName ?? null,
      email: insertClient.email ?? null,
      phone: insertClient.phone ?? null,
      address: insertClient.address ?? {}
    };
    this.clients.set(id, client);
    return client;
  }
  
  async updateClient(id: number, clientData: Partial<InsertClient>): Promise<Client | undefined> {
    const client = this.clients.get(id);
    if (!client) return undefined;
    
    const updatedClient: Client = { ...client, ...clientData };
    this.clients.set(id, updatedClient);
    return updatedClient;
  }
  
  // Client contact operations
  async getClientContacts(clientId: number): Promise<ClientContact[]> {
    return Array.from(this.clientContacts.values()).filter(
      (contact) => contact.clientId === clientId
    );
  }
  
  async getAllClientContacts(): Promise<ClientContact[]> {
    return Array.from(this.clientContacts.values());
  }
  
  async getClientContact(contactId: number): Promise<ClientContact | undefined> {
    return this.clientContacts.get(contactId);
  }
  
  async getClientContactByWhatsApp(whatsappNumber: string): Promise<ClientContact | undefined> {
    // Normalizar o número (remover qualquer não-dígito)
    const normalizedNumber = whatsappNumber.replace(/\D/g, '');
    
    return Array.from(this.clientContacts.values()).find(
      (contact) => contact.whatsapp && contact.whatsapp.replace(/\D/g, '').includes(normalizedNumber)
    );
  }
  
  async createClientContact(insertContact: InsertClientContact): Promise<ClientContact> {
    const id = this.contactIdCounter++;
    const contact: ClientContact = { 
      id,
      name: insertContact.name,
      clientId: insertContact.clientId,
      email: insertContact.email ?? null,
      whatsapp: insertContact.whatsapp ?? null,
      isPrimary: insertContact.isPrimary ?? null,
      username: insertContact.username ?? null,
      password: insertContact.password ?? null,
      hasCredentials: insertContact.hasCredentials ?? false,
      isActive: insertContact.isActive ?? true
    };
    this.clientContacts.set(id, contact);
    return contact;
  }
  
  async updateClientContact(contactId: number, contactData: Partial<InsertClientContact>): Promise<ClientContact | undefined> {
    const contact = this.clientContacts.get(contactId);
    if (!contact) return undefined;
    
    const updatedContact: ClientContact = { ...contact, ...contactData };
    this.clientContacts.set(contactId, updatedContact);
    return updatedContact;
  }
  
  async activateClientContact(contactId: number): Promise<ClientContact | undefined> {
    const contact = this.clientContacts.get(contactId);
    if (!contact) return undefined;
    
    const updatedContact: ClientContact = { ...contact, isActive: true };
    this.clientContacts.set(contactId, updatedContact);
    return updatedContact;
  }
  
  async deactivateClientContact(contactId: number): Promise<ClientContact | undefined> {
    const contact = this.clientContacts.get(contactId);
    if (!contact) return undefined;
    
    const updatedContact: ClientContact = { ...contact, isActive: false };
    this.clientContacts.set(contactId, updatedContact);
    return updatedContact;
  }
  
  async changeClientContactPassword(contactId: number, newPassword: string): Promise<boolean> {
    const contact = this.clientContacts.get(contactId);
    if (!contact || !contact.hasCredentials) return false;
    
    const updatedContact: ClientContact = { ...contact, password: newPassword };
    this.clientContacts.set(contactId, updatedContact);
    
    // Se o contato tem credenciais, também temos que atualizar o usuário correspondente
    if (contact.username) {
      const user = await this.getUserByUsername(contact.username);
      if (user) {
        await this.updateUser(user.id, { password: newPassword });
      }
    }
    
    return true;
  }
  
  // Ticket operations
  async getTicket(id: number): Promise<Ticket | undefined> {
    return this.tickets.get(id);
  }
  
  async getTickets(filter?: Partial<{ status: string, priority: string, clientId: number, assignedTo: number, createdByContactId: number }>): Promise<Ticket[]> {
    let tickets = Array.from(this.tickets.values());
    
    if (filter) {
      if (filter.status) {
        tickets = tickets.filter(ticket => ticket.status === filter.status);
      }
      
      if (filter.priority) {
        tickets = tickets.filter(ticket => ticket.priority === filter.priority);
      }
      
      if (filter.clientId) {
        tickets = tickets.filter(ticket => ticket.clientId === filter.clientId);
      }
      
      if (filter.assignedTo) {
        tickets = tickets.filter(ticket => ticket.assignedTo === filter.assignedTo);
      }
      
      if (filter.createdByContactId) {
        tickets = tickets.filter(ticket => ticket.createdByContactId === filter.createdByContactId);
      }
    }
    
    return tickets.sort((a, b) => {
      // Sort by creation date, newest first
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }
  
  async createTicket(insertTicket: InsertTicket): Promise<Ticket> {
    const id = this.ticketIdCounter++;
    const now = new Date();
    const ticket: Ticket = { 
      id, 
      clientId: insertTicket.clientId,
      title: insertTicket.title,
      description: insertTicket.description,
      category: insertTicket.category,
      status: insertTicket.status || 'new',
      priority: insertTicket.priority || 'normal',
      assignedTo: insertTicket.assignedTo ?? null,
      createdBy: insertTicket.createdBy ?? null,
      createdAt: now, 
      updatedAt: now,
      resolvedAt: null,
      resolutionNote: null,
      rating: null,
      feedback: null,
      attachments: []
    };
    this.tickets.set(id, ticket);
    
    // Create initial activity
    this.createTicketActivity({
      ticketId: id,
      userId: insertTicket.createdBy ?? null,
      clientContactId: null,
      activityType: "created",
      content: "Ticket created"
    });
    
    return ticket;
  }
  
  async updateTicket(id: number, ticketData: Partial<InsertTicket & { rating?: number | null, feedback?: string | null }>): Promise<Ticket | undefined> {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    
    const updatedTicket: Ticket = { 
      ...ticket, 
      ...ticketData, 
      updatedAt: new Date() 
    };
    this.tickets.set(id, updatedTicket);
    return updatedTicket;
  }
  
  async cancelTicket(id: number, cancellationNote: string): Promise<Ticket | undefined> {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    
    const now = new Date();
    const updatedTicket: Ticket = { 
      ...ticket, 
      status: "cancelled",
      updatedAt: now,
      resolvedAt: now,
      resolutionNote: cancellationNote
    };
    this.tickets.set(id, updatedTicket);
    
    // Add activity for cancellation
    this.createTicketActivity({
      ticketId: id,
      userId: ticket.assignedTo,
      activityType: "cancellation",
      content: cancellationNote
    });
    
    return updatedTicket;
  }
  
  async closeTicket(id: number, resolutionNote: string): Promise<Ticket | undefined> {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    
    const now = new Date();
    const updatedTicket: Ticket = { 
      ...ticket, 
      status: "closed",
      updatedAt: now,
      resolvedAt: now,
      resolutionNote 
    };
    this.tickets.set(id, updatedTicket);
    
    // Add activity for resolution
    this.createTicketActivity({
      ticketId: id,
      userId: ticket.assignedTo,
      activityType: "resolution",
      content: resolutionNote
    });
    
    return updatedTicket;
  }
  
  // Ticket activity operations
  async getTicketActivities(ticketId: number): Promise<TicketActivity[]> {
    return Array.from(this.ticketActivities.values())
      .filter(activity => activity.ticketId === ticketId)
      .sort((a, b) => {
        // Sort by creation date, newest first
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }
  
  async createTicketActivity(insertActivity: InsertTicketActivity): Promise<TicketActivity> {
    const id = this.activityIdCounter++;
    const now = new Date();
    const activity: TicketActivity = { 
      id, 
      ticketId: insertActivity.ticketId,
      activityType: insertActivity.activityType,
      userId: insertActivity.userId ?? null,
      clientContactId: insertActivity.clientContactId ?? null, 
      content: insertActivity.content ?? null,
      createdAt: now,
      isInternal: insertActivity.isInternal ?? false
    };
    this.ticketActivities.set(id, activity);
    return activity;
  }
  
  // Ticket category operations
  async getTicketCategory(id: number): Promise<TicketCategory | undefined> {
    return this.ticketCategories.get(id);
  }
  
  async getTicketCategories(): Promise<TicketCategory[]> {
    return Array.from(this.ticketCategories.values()).sort((a, b) => a.name.localeCompare(b.name));
  }
  
  async createTicketCategory(insertCategory: InsertTicketCategory): Promise<TicketCategory> {
    const id = this.categoryIdCounter++;
    const now = new Date();
    const category: TicketCategory = {
      id,
      name: insertCategory.name,
      color: insertCategory.color ?? null,
      description: insertCategory.description ?? null,
      createdAt: now,
      updatedAt: now
    };
    this.ticketCategories.set(id, category);
    return category;
  }
  
  async updateTicketCategory(id: number, categoryData: Partial<InsertTicketCategory>): Promise<TicketCategory | undefined> {
    const category = this.ticketCategories.get(id);
    if (!category) return undefined;
    
    const updatedCategory: TicketCategory = {
      ...category,
      ...categoryData,
      updatedAt: new Date()
    };
    this.ticketCategories.set(id, updatedCategory);
    return updatedCategory;
  }
  
  async deleteTicketCategory(id: number): Promise<boolean> {
    // Não permitir exclusão se existirem tickets usando esta categoria
    const hasTicketsWithCategory = Array.from(this.tickets.values())
      .some(ticket => ticket.category === this.ticketCategories.get(id)?.name);
    
    if (hasTicketsWithCategory) {
      return false;
    }
    
    return this.ticketCategories.delete(id);
  }
  
  // Investment operations
  async getInvestment(id: number): Promise<Investment | undefined> {
    return this.investments.get(id);
  }
  
  async getInvestments(clientId?: number): Promise<Investment[]> {
    let investments = Array.from(this.investments.values());
    
    if (clientId) {
      investments = investments.filter(inv => inv.clientId === clientId);
    }
    
    return investments.sort((a, b) => {
      // Sort by date, newest first
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }
  
  async createInvestment(insertInvestment: InsertInvestment): Promise<Investment> {
    const id = this.investmentIdCounter++;
    const now = new Date();
    const investment: Investment = { 
      id,
      date: insertInvestment.date,
      clientId: insertInvestment.clientId, 
      category: insertInvestment.category,
      amount: insertInvestment.amount,
      description: insertInvestment.description ?? null,
      installments: insertInvestment.installments ?? 1,
      paymentType: insertInvestment.paymentType ?? "fixed",
      documents: insertInvestment.documents ?? {},
      createdAt: now 
    };
    this.investments.set(id, investment);
    return investment;
  }
  
  // Revenue operations
  async getRevenue(id: number): Promise<Revenue | undefined> {
    return this.revenues.get(id);
  }
  
  async getRevenues(clientId?: number): Promise<Revenue[]> {
    let revenues = Array.from(this.revenues.values());
    
    if (clientId) {
      revenues = revenues.filter(rev => rev.clientId === clientId);
    }
    
    return revenues.sort((a, b) => {
      // Sort by date, newest first
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }
  
  async createRevenue(insertRevenue: InsertRevenue): Promise<Revenue> {
    const id = this.revenueIdCounter++;
    const now = new Date();
    const revenue: Revenue = { 
      id,
      clientId: insertRevenue.clientId,
      date: insertRevenue.date,
      category: insertRevenue.category,
      description: insertRevenue.description,
      amount: insertRevenue.amount,
      paymentStatus: insertRevenue.paymentStatus || 'pending',
      paymentMethod: insertRevenue.paymentMethod ?? null,
      isRecurring: insertRevenue.isRecurring ?? false,
      notes: insertRevenue.notes ?? null,
      createdAt: now
    };
    this.revenues.set(id, revenue);
    return revenue;
  }
  
  async updateRevenue(id: number, revenueData: Partial<InsertRevenue>): Promise<Revenue | undefined> {
    const revenue = this.revenues.get(id);
    if (!revenue) return undefined;
    
    const updatedRevenue: Revenue = { ...revenue, ...revenueData };
    this.revenues.set(id, updatedRevenue);
    return updatedRevenue;
  }
  
  // Cliente credentials para portal do cliente
  async createClientCredentials(contactId: number, username: string, password: string): Promise<boolean> {
    // Verificamos se o contato existe
    const contact = this.clientContacts.get(contactId);
    if (!contact) return false;
    
    // Verificamos se já existe um usuário com esse nome de usuário
    const existingUser = Array.from(this.users.values()).find(
      user => user.username === username
    );
    
    if (existingUser) return false;
    
    // Criptografar a senha
    let hashedPassword;
    try {
      const { hashPassword } = await import('./auth');
      hashedPassword = await hashPassword(password);
    } catch (error) {
      console.error("Erro ao criptografar senha:", error);
      return false;
    }
    
    // Atualizamos o contato para incluir as credenciais
    const updatedContact: ClientContact = {
      ...contact,
      username,
      password: hashedPassword,
      hasCredentials: true
    };
    this.clientContacts.set(contactId, updatedContact);
    
    // Criamos um novo usuário para o contato do cliente
    const user: InsertUser = {
      username,
      password: hashedPassword, // Usar a senha já criptografada
      name: contact.name,
      email: contact.email || "",
      role: "client", // Role especial para clientes
      avatar: null
    };
    
    try {
      const createdUser = await this.createUser(user);
      return true;
    } catch (error) {
      console.error("Erro ao criar credenciais para cliente:", error);
      return false;
    }
  }
  
  async updateClientCredentials(contactId: number, username: string, password: string): Promise<boolean> {
    // Verificamos se o contato existe
    const contact = this.clientContacts.get(contactId);
    if (!contact) return false;
    
    // Se o contato já tem credenciais, precisamos encontrar o usuário associado
    const existingUser = contact.username 
      ? Array.from(this.users.values()).find(user => user.username === contact.username)
      : null;
    
    // Se houver mudança de username, verificar se o novo já existe (e é diferente do atual)
    if (username !== contact.username) {
      const usernameExists = Array.from(this.users.values()).find(
        user => user.username === username && user.username !== contact.username
      );
      
      if (usernameExists) return false; // Nome de usuário já está em uso
    }

    // Criptografar a senha
    let hashedPassword;
    try {
      const { hashPassword } = await import('./auth');
      hashedPassword = await hashPassword(password);
    } catch (error) {
      console.error("Erro ao criptografar senha:", error);
      return false;
    }
    
    // Atualizamos o contato com as novas credenciais
    const updatedContact: ClientContact = {
      ...contact,
      username,
      password: hashedPassword,
      hasCredentials: true
    };
    this.clientContacts.set(contactId, updatedContact);
    
    // Se existir um usuário, atualizamos suas credenciais
    if (existingUser) {
      this.updateUser(existingUser.id, {
        username,
        password: hashedPassword,
        name: contact.name, // Mantém nome atualizado
        email: contact.email || existingUser.email
      });
      return true;
    } else {
      // Se não existir, criamos um novo
      const newUser: InsertUser = {
        username,
        password: hashedPassword,
        name: contact.name,
        email: contact.email || "",
        role: "client",
        avatar: null
      };
      
      try {
        await this.createUser(newUser);
        return true;
      } catch (error) {
        console.error("Erro ao atualizar credenciais do cliente:", error);
        return false;
      }
    }
  }
  
  // Dashboard metrics
  async getDashboardMetrics(_timeframe?: string, _tenantId?: number | null): Promise<{
    openTickets: number,
    avgResolutionTime: number,
    resolutionRate: number,
    customerSatisfaction: number
  }> {
    const tickets = Array.from(this.tickets.values());
    const openTickets = tickets.filter(ticket => 
      ['new', 'in_progress', 'waiting_client'].includes(ticket.status)
    ).length;
    
    const resolvedTickets = tickets.filter(ticket => 
      ['resolved', 'closed'].includes(ticket.status) && ticket.resolvedAt
    );
    
    let avgResolutionTime = 0;
    if (resolvedTickets.length > 0) {
      const totalTime = resolvedTickets.reduce((sum, ticket) => {
        const createdTime = new Date(ticket.createdAt).getTime();
        const resolvedTime = new Date(ticket.resolvedAt!).getTime();
        return sum + (resolvedTime - createdTime) / (1000 * 60 * 60); // Convert to hours
      }, 0);
      avgResolutionTime = totalTime / resolvedTickets.length;
    }
    
    const resolutionRate = tickets.length > 0 
      ? resolvedTickets.length / tickets.length * 100 
      : 0;
    
    // Mock satisfaction data (would be from surveys in a real system)
    const customerSatisfaction = 4.8;
    
    return {
      openTickets,
      avgResolutionTime,
      resolutionRate,
      customerSatisfaction
    };
  }
  
  async getTicketsByCategory(_timeframe?: string, tenantId?: number | null): Promise<{ category: string, count: number }[]> {
    const allTickets = Array.from(this.tickets.values());
    const filteredTickets = tenantId !== undefined && tenantId !== null
      ? allTickets.filter(t => t.tenantId === tenantId)
      : allTickets;
    const categories = new Map<string, number>();
    
    filteredTickets.forEach(ticket => {
      const count = categories.get(ticket.category) || 0;
      categories.set(ticket.category, count + 1);
    });
    
    return Array.from(categories.entries()).map(([category, count]) => ({
      category,
      count
    }));
  }
  
  async getResolutionTimeHistory(_timeframe?: string, tenantId?: number | null): Promise<{ date: string, hours: number }[]> {
    const allTickets = Array.from(this.tickets.values());
    const filteredTickets = (tenantId !== undefined && tenantId !== null
      ? allTickets.filter(t => t.tenantId === tenantId)
      : allTickets
    ).filter(t => t.resolvedAt);

    if (filteredTickets.length === 0) return [];

    const byDate = new Map<string, { sum: number; count: number }>();
    filteredTickets.forEach(ticket => {
      const d = new Date(ticket.resolvedAt!);
      const label = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
      const hours = (new Date(ticket.resolvedAt!).getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60);
      const entry = byDate.get(label) || { sum: 0, count: 0 };
      byDate.set(label, { sum: entry.sum + hours, count: entry.count + 1 });
    });

    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { sum, count }]) => ({ date, hours: Math.round(sum / count * 10) / 10 }));
  }

  async getTicketsByCompany(timeframe: string = 'month', tenantId?: number | null): Promise<{
    companyName: string,
    totalTickets: number,
    openTickets: number,
    avgTimeOpen: number,
    oldestTicketDays: number
  }[]> {
    const allTickets = Array.from(this.tickets.values());
    const allClients = Array.from(this.clients.values());
    const now = new Date();

    // Filtro multi-tenant
    const tickets = (tenantId !== undefined && tenantId !== null)
      ? allTickets.filter(t => t.tenantId === tenantId)
      : allTickets;
    const clients = (tenantId !== undefined && tenantId !== null)
      ? allClients.filter(c => c.tenantId === tenantId)
      : allClients;
    
    // Filtrar tickets baseado no timeframe
    let filteredTickets = tickets;
    if (timeframe !== 'all') {
      const cutoffDate = new Date();
      switch (timeframe) {
        case 'day':
          cutoffDate.setDate(cutoffDate.getDate() - 1);
          break;
        case 'week':
          cutoffDate.setDate(cutoffDate.getDate() - 7);
          break;
        case 'month':
          cutoffDate.setMonth(cutoffDate.getMonth() - 1);
          break;
        case 'year':
          cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
          break;
      }
      filteredTickets = tickets.filter(ticket => 
        new Date(ticket.createdAt) >= cutoffDate
      );
    }
    
    // Agrupar por empresa
    const companiesMap = new Map<number, {
      companyName: string,
      totalTickets: number,
      openTickets: number,
      timeOpenSum: number,
      oldestTicketDays: number
    }>();
    
    filteredTickets.forEach(ticket => {
      const client = clients.find(c => c.id === ticket.clientId);
      if (!client || !client.isActive) return;
      
      const company = companiesMap.get(client.id) || {
        companyName: client.businessName,
        totalTickets: 0,
        openTickets: 0,
        timeOpenSum: 0,
        oldestTicketDays: 0
      };
      
      company.totalTickets++;
      
      const isOpen = !['closed', 'fechado', 'resolvido', 'resolved'].includes(ticket.status);
      if (isOpen) {
        company.openTickets++;
        const daysOpen = (now.getTime() - new Date(ticket.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        company.timeOpenSum += daysOpen;
        company.oldestTicketDays = Math.max(company.oldestTicketDays, daysOpen);
      }
      
      companiesMap.set(client.id, company);
    });
    
    return Array.from(companiesMap.values())
      .filter(company => company.totalTickets > 0)
      .map(company => ({
        companyName: company.companyName,
        totalTickets: company.totalTickets,
        openTickets: company.openTickets,
        avgTimeOpen: company.openTickets > 0 ? company.timeOpenSum / company.openTickets : 0,
        oldestTicketDays: company.oldestTicketDays
      }))
      .sort((a, b) => b.openTickets - a.openTickets || b.avgTimeOpen - a.avgTimeOpen);
  }
}

// Importa a implementação DbStorage
import { dbStorage } from './db-storage';

// Atualiza o export para usar DbStorage em vez de MemStorage
export const storage = dbStorage;
