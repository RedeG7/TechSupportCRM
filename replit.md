# Suporte RedeG7 - Sistema de Helpdesk e CRM

## Overview

This is a full-stack helpdesk and CRM system for RedeG7, a Brazilian IT support company. The application provides ticket management, client relationship management, WhatsApp integration for customer communication, AI-powered chatbot support using OpenAI GPT-4, and financial tracking for investments and revenues.

The system supports two types of users: internal staff (admin, support agents) and external clients who can access a dedicated portal to view and manage their support tickets.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite with hot module replacement
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with CSS variables for theming
- **State Management**: TanStack React Query for server state
- **Forms**: React Hook Form with Zod validation
- **Routing**: Wouter for client-side routing
- **Path Aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Authentication**: Passport.js with local strategy, session-based auth using memorystore
- **Password Hashing**: Node.js crypto module with scrypt
- **File Uploads**: Multer with disk storage in `uploads/` directory
- **Real-time Communication**: WebSocket server for live updates

### Data Storage
- **Database**: PostgreSQL via node-postgres (pg)
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` defines all database tables using Drizzle's pgTable
- **Migrations**: Drizzle Kit for schema migrations (`drizzle-kit push`)

### Key Data Models
- **Users**: Internal staff accounts with roles (super_admin, admin/licensee, supervisor, operacional). All non-admin users have a `tenantId` linking them to their admin/licensee.
- **Clients**: Business entities with CNPJ/CPF. Each client has a `tenantId` (null = master/RedeG7 data, or the admin user's ID who owns the client).
- **Client Contacts**: Individual contacts per client, can have portal login credentials
- **Tickets**: Support tickets with `tenantId` for multi-tenancy isolation
- **Ticket Activities**: Comments, status changes, attachments on tickets
- **Investments & Revenues**: Financial tracking per client, with `tenantId`
- **Ticket Categories**: Support categories, with `tenantId` (null = global visible to all)

### Multi-Tenancy Architecture
- `tenantId` column added to: users, clients, tickets, investments, revenues, ticket_categories
- `getActiveTenantId(req)` helper in routes.ts determines the effective tenant:
  - `super_admin` → `null` (sees ALL data across all tenants)
  - `admin` (licensee) → `user.id` (sees only their own tenant's data)
  - `supervisor` / `operacional` → `user.tenantId` (sees their licensee's data)
- New licensee accounts start with a clean slate (no data)
- Data created by a tenant is tagged with their tenantId
- Ticket categories with `tenantId = null` are global (visible to all)
- Client portal tickets inherit the client's tenantId

### Per-Tenant Branding (Identidade Visual)
- Each admin/licensee can set their own company name, logo and a unique URL slug
- Branding stored in `tenant_branding` table: `tenant_id`, `company_name`, `company_logo_url`, `slug`
- Global/super_admin branding stored in `system_settings` (keys: `company_name`, `company_logo_url`)
- Logos saved as `company_logo_tenant_<id>.<ext>` per tenant; global as `company_logo.<ext>`
- Login URL per licensee: `/login/:slug` — loads the licensee's logo and name on the login screen
- `GET /api/public/branding` — global branding (unauthenticated)
- `GET /api/public/branding/:slug` — tenant branding by slug (unauthenticated)
- `GET /api/settings/branding` — current user's branding (authenticated)
- `GET /api/admin/tenant-brandings` — all tenant brandings (super_admin only)
- SuperAdmin panel shows each licensee's login URL from their configured slug

### Authentication Flow
- Internal users authenticate via `/api/login` with username/password
- Client contacts authenticate via `/api/client-auth/login` with separate session handling
- Both use express-session with memorystore for session persistence

### WhatsApp Integration
- **Primary Implementation**: Baileys library (`@whiskeysockets/baileys`) for WhatsApp Web API
- **Session Storage**: Authentication state persisted in `whatsapp-auth/` directory
- **Features**: QR code authentication, message sending/receiving, contact sync
- **AI Chatbot**: OpenAI GPT-4 integration for automated responses

## External Dependencies

### Third-Party Services
- **OpenAI API**: GPT-4o model for AI chatbot responses (requires `OPENAI_API_KEY`)
- **Stripe**: Payment processing integration (optional, requires Stripe keys)
- **Email**: Nodemailer for email notifications (configurable via environment variables)
- **CallMeBot**: Alternative WhatsApp notification service

### Database
- **PostgreSQL**: Primary database (requires `DATABASE_URL` environment variable)
- Connection managed via node-postgres Pool with Drizzle ORM layer

### Key Environment Variables
- `DATABASE_URL`: PostgreSQL connection string (required)
- `SESSION_SECRET`: Express session secret
- `OPENAI_API_KEY`: For AI chatbot functionality
- `EMAIL_SERVICE`, `EMAIL_USER`, `EMAIL_PASSWORD`: For email notifications

### Development Tools
- **TypeScript**: Strict mode enabled across all code
- **ESBuild**: For production server bundling
- **Drizzle Kit**: Database migration tooling