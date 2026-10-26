import { pgTable, text, serial, integer, boolean, timestamp, doublePrecision, jsonb, date, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users schema
// Roles do sistema interno: super_admin, admin (licenciado), supervisor, operacional
// Portal do cliente: gerenciado por clientContacts (tabela separada)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("operacional"), // super_admin, admin, supervisor, operacional
  avatar: text("avatar"),
  isActive: boolean("is_active").default(true),
  isBlocked: boolean("is_blocked").default(false),
  // Campos específicos para licenciados (role = admin)
  companyName: text("company_name"),
  phone: text("phone"),
  licenseStatus: text("license_status").default("active"), // active, trial, expired, suspended
  licenseExpiresAt: timestamp("license_expires_at"),
  licenseNotes: text("license_notes"),
  subscriptionPlan: text("subscription_plan"),
  // Multi-tenancy: supervisor/operacional users pertencem a um admin (licenciado)
  tenantId: integer("tenant_id"), // ID do admin/licenciado que criou este usuário
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

// Clients schema
export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  cnpj: text("cnpj").unique(),
  cpf: text("cpf").unique(),
  businessType: text("business_type").notNull(), // Empresa, Pessoa Física, Fornecedor
  businessName: text("business_name").notNull(), // Razão Social
  tradeName: text("trade_name"), // Nome Fantasia
  email: text("email"),
  phone: text("phone"),
  address: jsonb("address"), // JSON with address details
  isActive: boolean("is_active").default(true),
  isBlocked: boolean("is_blocked").default(false),
  licenseStatus: text("license_status").default("active"), // active, expired, suspended, trial
  licenseExpiresAt: timestamp("license_expires_at"),
  licenseNotes: text("license_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  tenantId: integer("tenant_id"), // ID do usuário licenciado dono deste cliente (null = RedeG7/master)
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
});

// Client contacts schema
export const clientContacts = pgTable("client_contacts", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  whatsapp: text("whatsapp"),
  isPrimary: boolean("is_primary").default(false),
  username: text("username").unique(),
  password: text("password"),
  hasCredentials: boolean("has_credentials").default(false),
  isActive: boolean("is_active").default(true),
  isBlocked: boolean("is_blocked").default(false),
  authToken: text("auth_token"),
  role: text("role").default("user"), // "admin" para administrador da empresa, "user" para usuário comum
  phone: text("phone"),
});

export const insertClientContactSchema = createInsertSchema(clientContacts).omit({
  id: true,
});

// Tickets schema
export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull().default("new"), // new, in_progress, waiting_client, resolved, closed
  priority: text("priority").notNull().default("medium"), // low, medium, high
  category: text("category").notNull(),
  assignedTo: integer("assigned_to"),
  createdBy: integer("created_by"),
  createdByContactId: integer("created_by_contact_id"), // ID do contato cliente que criou o chamado
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  rating: integer("rating"),  // Avaliação do cliente (1-5 estrelas)
  feedback: text("feedback"), // Comentário da avaliação do cliente
  ratingToken: text("rating_token"), // Token único para link de avaliação
  ratingRequestedAt: timestamp("rating_requested_at"), // Data do envio do link de avaliação
  attachments: jsonb("attachments").$type<{id: number, filename: string, size: number}[]>(),
  reminderDate: timestamp("reminder_date"), // Data de lembrete para chamados em aberto
  reminderNote: text("reminder_note"), // O que precisa ser lembrado
  reminderNotifiedAt: timestamp("reminder_notified_at"), // Evita reenvio do mesmo lembrete no WhatsApp
  tenantId: integer("tenant_id"), // ID do licenciado dono deste chamado
  sendFarewellAfterRating: boolean("send_farewell_after_rating").default(false), // Enviar despedida após avaliação do cliente
});

export const insertTicketSchema = createInsertSchema(tickets)
  .omit({
    id: true,
    resolvedAt: true,
    rating: true,
    feedback: true,
  })
  .extend({
    createdAt: z.date().optional(),
    updatedAt: z.date().optional()
  });

// Esquema extendido para permitir atualizações de avaliação
export const updateTicketRatingSchema = createInsertSchema(tickets)
  .pick({
    rating: true,
    feedback: true,
  })
  .extend({
    rating: z.number().min(1).max(5),
    feedback: z.string().nullable().optional(),
  });

// Ticket activities schema
export const ticketActivities = pgTable("ticket_activities", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id").notNull(),
  userId: integer("user_id"),
  clientContactId: integer("client_contact_id"),
  activityType: text("activity_type").notNull(), // comment, status_change, priority_change, assignment
  content: text("content"),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isInternal: boolean("is_internal").default(false),
});

export const insertTicketActivitySchema = createInsertSchema(ticketActivities).omit({
  id: true,
}).extend({
  createdAt: z.date().optional(),
  attachments: z.array(z.string()).optional(),
});

// Investments schema
export const investments = pgTable("investments", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  category: text("category").notNull(),
  amount: doublePrecision("amount").notNull(),
  date: timestamp("date").notNull(),
  description: text("description"),
  installments: integer("installments").default(1),
  paymentType: text("payment_type").default("fixed"),
  documents: jsonb("documents"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  tenantId: integer("tenant_id"),
});

export const insertInvestmentSchema = createInsertSchema(investments).omit({
  id: true,
  createdAt: true,
}).extend({
  description: z.string().nullable().optional(),
  installments: z.number().default(1),
  paymentType: z.enum(["fixed", "variable"]).default("fixed"),
  documents: z.record(z.any()).optional().nullable(),
  date: z.union([z.string(), z.date()]).transform(val => val instanceof Date ? val : new Date(val))
});

// Revenues schema
export const revenues = pgTable("revenues", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  description: text("description").notNull(),
  amount: doublePrecision("amount").notNull(),
  date: timestamp("date").notNull(),
  category: text("category").notNull(),
  type: text("type").default("service"), // service, product, subscription, other
  paymentStatus: text("payment_status").notNull().default("pending"), // pending, paid, overdue
  paymentMethod: text("payment_method"),
  isRecurring: boolean("is_recurring").default(false),
  notes: text("notes"),
  ticketId: integer("ticket_id"), // optional link to a ticket
  createdAt: timestamp("created_at").notNull().defaultNow(),
  tenantId: integer("tenant_id"),
});

export const insertRevenueSchema = createInsertSchema(revenues).omit({
  id: true,
  createdAt: true,
}).extend({
  isRecurring: z.boolean().default(false).optional(),
  date: z.union([z.string(), z.date()]).transform(val => val instanceof Date ? val : new Date(val)),
  ticketId: z.number().nullable().optional(),
  type: z.string().optional(),
});

// Export types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export type InsertClientContact = z.infer<typeof insertClientContactSchema>;
export type ClientContact = typeof clientContacts.$inferSelect;

export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

export type InsertTicketActivity = z.infer<typeof insertTicketActivitySchema>;
export type TicketActivity = typeof ticketActivities.$inferSelect;

export type InsertInvestment = z.infer<typeof insertInvestmentSchema>;
export type Investment = typeof investments.$inferSelect;

export type InsertRevenue = z.infer<typeof insertRevenueSchema>;
export type Revenue = typeof revenues.$inferSelect;

// Ticket Categories schema
export const ticketCategories = pgTable("ticket_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#3B82F6"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  tenantId: integer("tenant_id"), // null = categoria global (do super_admin)
});

export const insertTicketCategorySchema = createInsertSchema(ticketCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTicketCategory = z.infer<typeof insertTicketCategorySchema>;
export type TicketCategory = typeof ticketCategories.$inferSelect;

// Tabela de configurações do sistema
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettings.$inferSelect;

// Tabela de conversas do WhatsApp
export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: serial("id").primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  contactName: text("contact_name"),
  status: text("status").notNull().default("aguardando"), // aguardando, atendendo, finalizado
  attendantId: integer("attendant_id").references(() => users.id),
  clientId: integer("client_id").references(() => clients.id),
  ticketId: integer("ticket_id").references(() => tickets.id),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWhatsappConversationSchema = createInsertSchema(whatsappConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWhatsappConversation = z.infer<typeof insertWhatsappConversationSchema>;
export type WhatsappConversation = typeof whatsappConversations.$inferSelect;

// Tabela de mensagens do WhatsApp
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => whatsappConversations.id).notNull(),
  phoneNumber: text("phone_number").notNull(),
  messageId: text("message_id"),
  body: text("body").notNull(),
  fromMe: boolean("from_me").notNull().default(false),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWhatsappMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertWhatsappMessage = z.infer<typeof insertWhatsappMessageSchema>;
export type WhatsappMessage = typeof whatsappMessages.$inferSelect;

// Tabela de avaliações de atendimento
export const serviceRatings = pgTable("service_ratings", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").references(() => whatsappConversations.id),
  ticketId: integer("ticket_id").references(() => tickets.id),
  clientId: integer("client_id").references(() => clients.id),
  attendantId: integer("attendant_id").references(() => users.id),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertServiceRatingSchema = createInsertSchema(serviceRatings).omit({
  id: true,
  createdAt: true,
});

export type InsertServiceRating = z.infer<typeof insertServiceRatingSchema>;
export type ServiceRating = typeof serviceRatings.$inferSelect;

// Tabela de branding por licenciado (tenant)
export const tenantBranding = pgTable("tenant_branding", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().unique(),
  companyName: text("company_name"),
  companyLogoUrl: text("company_logo_url"),
  slug: text("slug").unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertTenantBrandingSchema = createInsertSchema(tenantBranding).omit({
  id: true,
  updatedAt: true,
});

export type InsertTenantBranding = z.infer<typeof insertTenantBrandingSchema>;
export type TenantBranding = typeof tenantBranding.$inferSelect;
