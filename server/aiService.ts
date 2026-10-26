import Anthropic from "@anthropic-ai/sdk";
import type { IStorage } from "./storage";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `Você é o G7Bot, assistente de suporte técnico de TI da RedeG7.
Você deve se comunicar em português brasileiro de forma educada, prestativa e clara.
Sua função principal é ajudar os atendentes a gerenciar chamados de suporte.

Você PODE:
- Criar chamados no sistema para clientes específicos
- Consultar lista de clientes, usuários e categorias disponíveis
- Responder dúvidas sobre suporte técnico de TI
- Encaminhar problemas complexos para técnicos

Ao criar um chamado:
1. Pergunte os detalhes necessários se não fornecidos (cliente, título, descrição, prioridade)
2. Use as ferramentas para buscar o cliente e usuário corretos
3. Confirme os dados antes de criar
4. Informe o número do chamado criado

Prioridades disponíveis: low (baixa), medium (média), high (alta)
Status inicial dos chamados: new (novo)

Mantenha respostas concisas. Não discuta assuntos fora de suporte técnico de TI.`;

// Tools Claude can call
const TOOLS: Anthropic.Tool[] = [
  {
    name: "listar_clientes",
    description: "Lista todos os clientes cadastrados no sistema. Use para encontrar o ID do cliente ao criar um chamado.",
    input_schema: {
      type: "object" as const,
      properties: {
        filtro: {
          type: "string",
          description: "Texto opcional para filtrar clientes pelo nome"
        }
      },
      required: []
    }
  },
  {
    name: "listar_usuarios",
    description: "Lista todos os usuários/agentes de suporte disponíveis para atribuição de chamados.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "listar_categorias",
    description: "Lista todas as categorias de chamados disponíveis no sistema.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: []
    }
  },
  {
    name: "criar_chamado",
    description: "Cria um novo chamado de suporte no sistema e o registra no banco de dados.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: {
          type: "number",
          description: "ID do cliente (obtenha via listar_clientes)"
        },
        title: {
          type: "string",
          description: "Título resumido do chamado (máximo 100 caracteres)"
        },
        description: {
          type: "string",
          description: "Descrição detalhada do problema ou solicitação"
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Prioridade: low=baixa, medium=média, high=alta"
        },
        category: {
          type: "string",
          description: "Categoria do chamado (obtenha via listar_categorias)"
        },
        assignedTo: {
          type: "number",
          description: "ID do usuário/agente responsável (opcional, obtenha via listar_usuarios)"
        },
        createdBy: {
          type: "number",
          description: "ID do usuário que está criando o chamado (opcional)"
        }
      },
      required: ["clientId", "title", "description", "priority", "category"]
    }
  },
  {
    name: "buscar_chamado",
    description: "Busca informações sobre um chamado específico pelo ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        ticketId: {
          type: "number",
          description: "ID do chamado a ser consultado"
        }
      },
      required: ["ticketId"]
    }
  }
];

// WhatsApp-specific tools (includes identificar_empresa to capture the client)
const WA_TOOLS: Anthropic.Tool[] = [
  ...TOOLS,
  {
    name: "identificar_empresa",
    description: "Registra a empresa do cliente após identificá-la na lista de clientes. SEMPRE chame esta ferramenta assim que o cliente confirmar a empresa.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "number", description: "ID do cliente conforme retornado por listar_clientes" },
        clientName: { type: "string", description: "Nome da empresa do cliente" }
      },
      required: ["clientId", "clientName"]
    }
  }
];

export interface WhatsAppConversationContext {
  history: { role: "user" | "assistant"; content: string }[];
  identifiedClientId: number | null;
  identifiedClientName: string | null;
}

class AIService {
  // WhatsApp agentic response — identifies client company, then opens tickets
  async handleWhatsAppMessage(
    userMessage: string,
    context: WhatsAppConversationContext,
    storage: IStorage,
    contactName: string
  ): Promise<{
    reply: string;
    updatedContext: WhatsAppConversationContext;
    ticketCreated?: { id: number; title: string };
  }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        reply: "Serviço temporariamente indisponível. Por favor, entre em contato pelo telefone.",
        updatedContext: context,
      };
    }

    const { identifiedClientId, identifiedClientName } = context;
    const isIdentified = identifiedClientId !== null;

    const systemPrompt = `Você é o G7Bot, assistente de suporte da RedeG7 atendendo clientes pelo WhatsApp.
Você está conversando com: ${contactName}

ESTADO ATUAL:
${isIdentified ? `✅ Empresa identificada: ${identifiedClientName} (ID: ${identifiedClientId})` : "❌ Empresa ainda NÃO identificada"}

FLUXO OBRIGATÓRIO:

${!isIdentified ? `PASSO 1 — IDENTIFICAÇÃO DA EMPRESA (OBRIGATÓRIO ANTES DE QUALQUER OUTRA COISA):
- Cumprimente o cliente pelo nome de forma simpática
- Pergunte o nome da empresa onde ele trabalha ou está ligando
- Use listar_clientes para buscar a empresa mencionada
- Se encontrar: chame identificar_empresa com o clientId e clientName corretos
- Se não encontrar: peça para confirmar o nome da empresa e tente novamente
- NUNCA pule este passo` : `PASSO 2 — ATENDIMENTO (empresa já identificada: ${identifiedClientName}):
- Use o clientId ${identifiedClientId} ao criar chamados
- Identifique o problema do cliente
- Colete título e descrição do problema
- Use criar_chamado para registrar no sistema com clientId = ${identifiedClientId}
- Informe o número do chamado criado e que um técnico entrará em contato em breve`}

REGRAS:
- Respostas curtas e diretas (máximo 3 parágrafos)
- Comunicação amigável e profissional em português brasileiro
- Não discuta assuntos fora de suporte técnico`;

    const messages: Anthropic.MessageParam[] = [
      ...context.history.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    let ticketCreated: { id: number; title: string } | undefined;
    let newIdentifiedClientId = identifiedClientId;
    let newIdentifiedClientName = identifiedClientName;
    let iterations = 0;
    const MAX_ITERATIONS = 8;

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 512,
        system: systemPrompt,
        tools: WA_TOOLS,
        messages,
      });

      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        const reply = textBlock
          ? (textBlock as { type: "text"; text: string }).text
          : "Desculpe, não consegui processar sua solicitação.";

        const updatedContext: WhatsAppConversationContext = {
          history: [
            ...context.history,
            { role: "user", content: userMessage },
            { role: "assistant", content: reply },
          ],
          identifiedClientId: newIdentifiedClientId,
          identifiedClientName: newIdentifiedClientName,
        };
        return { reply, updatedContext, ticketCreated };
      }

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b) => b.type === "text");
        const reply = textBlock
          ? (textBlock as { type: "text"; text: string }).text
          : "Processamento concluído.";
        const updatedContext: WhatsAppConversationContext = {
          history: [
            ...context.history,
            { role: "user", content: userMessage },
            { role: "assistant", content: reply },
          ],
          identifiedClientId: newIdentifiedClientId,
          identifiedClientName: newIdentifiedClientName,
        };
        return { reply, updatedContext, ticketCreated };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let toolResult: string;
        try {
          const input = block.input as Record<string, any>;

          if (block.name === "identificar_empresa") {
            newIdentifiedClientId = input.clientId;
            newIdentifiedClientName = input.clientName;
            toolResult = JSON.stringify({ sucesso: true, clientId: input.clientId, clientName: input.clientName });
          } else if (block.name === "listar_clientes") {
            const clients = await storage.getClients();
            const filtered = input.filtro
              ? clients.filter((c) =>
                  c.companyName?.toLowerCase().includes(input.filtro.toLowerCase()) ||
                  c.tradeName?.toLowerCase().includes(input.filtro.toLowerCase())
                )
              : clients;
            toolResult = JSON.stringify(
              filtered.map((c) => ({
                id: c.id,
                nome: c.companyName || c.tradeName || `Cliente #${c.id}`,
                cnpj: c.cnpj,
              }))
            );
          } else if (block.name === "listar_usuarios") {
            const users = await storage.getUsers();
            toolResult = JSON.stringify(
              users.filter((u) => u.isActive && u.role !== "client")
                   .map((u) => ({ id: u.id, nome: u.name, cargo: u.role }))
            );
          } else if (block.name === "listar_categorias") {
            const categories = await storage.getTicketCategories();
            toolResult = JSON.stringify(categories.map((c) => ({ id: c.id, nome: c.name })));
          } else if (block.name === "criar_chamado") {
            const clientId = input.clientId || newIdentifiedClientId;
            const ticket = await storage.createTicket({
              clientId,
              title: input.title,
              description: input.description,
              status: "new",
              priority: input.priority || "medium",
              category: input.category,
              assignedTo: input.assignedTo || null,
              createdBy: null,
              tenantId: null,
            });
            ticketCreated = { id: ticket.id, title: ticket.title };
            toolResult = JSON.stringify({ sucesso: true, chamado: { id: ticket.id, titulo: ticket.title, status: ticket.status } });
          } else if (block.name === "buscar_chamado") {
            const ticket = await storage.getTicket(input.ticketId);
            toolResult = ticket
              ? JSON.stringify({ id: ticket.id, titulo: ticket.title, status: ticket.status, prioridade: ticket.priority })
              : JSON.stringify({ erro: `Chamado #${input.ticketId} não encontrado.` });
          } else {
            toolResult = JSON.stringify({ erro: `Ferramenta desconhecida: ${block.name}` });
          }
        } catch (err: any) {
          toolResult = JSON.stringify({ erro: err.message || "Erro ao executar a ferramenta" });
        }

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: toolResult });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return {
      reply: "Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.",
      updatedContext: context,
    };
  }

  // Simple response without tools (for WhatsApp auto-reply)
  async generateResponse(
    userMessage: string,
    previousMessages: { role: string; content: string }[] = [],
    clientName?: string
  ): Promise<string> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("Chave de API da Anthropic não configurada");
      }

      const systemPrompt = `Você é um assistente de suporte técnico de TI da empresa RedeG7.
Seu nome é G7Bot e você deve se comunicar em português brasileiro.
${clientName ? `Você está falando com ${clientName}.` : ""}
Você deve ser educado, prestativo e claro nas suas explicações.
Sua função é ajudar os clientes com problemas técnicos de TI, fornecer informações sobre os serviços da RedeG7
e encaminhar problemas mais complexos para um atendente humano.
Se você não souber a resposta para uma pergunta, admita isso e ofereça para abrir um chamado com um técnico.
Mantenha suas respostas concisas (máximo 3 parágrafos) e fáceis de entender.
Não discuta assuntos não relacionados a suporte técnico de TI.`;

      const messages = [
        ...previousMessages.map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
        })),
        { role: "user" as const, content: userMessage },
      ];

      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 500,
        system: systemPrompt,
        messages,
      });

      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock
        ? (textBlock as { type: "text"; text: string }).text
        : "Desculpe, não consegui processar sua solicitação.";
    } catch (error: any) {
      console.error("Erro ao gerar resposta da IA:", error);
      return "Desculpe, estou enfrentando dificuldades técnicas no momento. Por favor, tente novamente mais tarde ou entre em contato com o suporte.";
    }
  }

  // Full agentic response with tool use — can create tickets, list clients, etc.
  async generateResponseWithTools(
    userMessage: string,
    previousMessages: { role: string; content: string }[] = [],
    storage: IStorage,
    tenantId?: number | null,
    currentUserId?: number
  ): Promise<{ response: string; ticketCreated?: { id: number; title: string } }> {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { response: "Chave de API da Anthropic não configurada." };
    }

    const messages: Anthropic.MessageParam[] = [
      ...previousMessages.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    let ticketCreated: { id: number; title: string } | undefined;
    let iterations = 0;
    const MAX_ITERATIONS = 8;

    // Agentic loop: keep calling Claude until no more tool calls
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      // If no tool calls, return the text response
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        return {
          response: textBlock
            ? (textBlock as { type: "text"; text: string }).text
            : "Desculpe, não consegui processar sua solicitação.",
          ticketCreated,
        };
      }

      // Add assistant's response (may contain text + tool_use blocks)
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const textBlock = response.content.find((b) => b.type === "text");
        return {
          response: textBlock
            ? (textBlock as { type: "text"; text: string }).text
            : "Processamento concluído.",
          ticketCreated,
        };
      }

      // Execute each tool call and collect results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        let toolResult: string;

        try {
          const input = block.input as Record<string, any>;

          if (block.name === "listar_clientes") {
            const clients = await storage.getClients();
            const filtered = input.filtro
              ? clients.filter((c) =>
                  c.companyName?.toLowerCase().includes(input.filtro.toLowerCase()) ||
                  c.tradeName?.toLowerCase().includes(input.filtro.toLowerCase())
                )
              : clients;
            toolResult = JSON.stringify(
              filtered.map((c) => ({
                id: c.id,
                nome: c.companyName || c.tradeName || `Cliente #${c.id}`,
                cnpj: c.cnpj,
                email: c.email,
              }))
            );
          } else if (block.name === "listar_usuarios") {
            const users = await storage.getUsers();
            toolResult = JSON.stringify(
              users
                .filter((u) => u.isActive && u.role !== "client")
                .map((u) => ({
                  id: u.id,
                  nome: u.name,
                  cargo: u.role,
                  email: u.email,
                }))
            );
          } else if (block.name === "listar_categorias") {
            const categories = await storage.getTicketCategories();
            toolResult = JSON.stringify(
              categories.map((cat) => ({
                id: cat.id,
                nome: cat.name,
                descricao: cat.description,
              }))
            );
          } else if (block.name === "criar_chamado") {
            const ticket = await storage.createTicket({
              clientId: input.clientId,
              title: input.title,
              description: input.description,
              status: "new",
              priority: input.priority || "medium",
              category: input.category,
              assignedTo: input.assignedTo || null,
              createdBy: input.createdBy || currentUserId || null,
              tenantId: tenantId ?? null,
            });
            ticketCreated = { id: ticket.id, title: ticket.title };
            toolResult = JSON.stringify({
              sucesso: true,
              chamado: {
                id: ticket.id,
                titulo: ticket.title,
                status: ticket.status,
                prioridade: ticket.priority,
                categoria: ticket.category,
                criadoEm: ticket.createdAt,
              },
            });
          } else if (block.name === "buscar_chamado") {
            const ticket = await storage.getTicket(input.ticketId);
            if (!ticket) {
              toolResult = JSON.stringify({ erro: `Chamado #${input.ticketId} não encontrado.` });
            } else {
              toolResult = JSON.stringify({
                id: ticket.id,
                titulo: ticket.title,
                status: ticket.status,
                prioridade: ticket.priority,
                categoria: ticket.category,
                clienteId: ticket.clientId,
                responsavelId: ticket.assignedTo,
                criadoEm: ticket.createdAt,
              });
            }
          } else {
            toolResult = JSON.stringify({ erro: `Ferramenta desconhecida: ${block.name}` });
          }
        } catch (err: any) {
          console.error(`Erro ao executar ferramenta ${block.name}:`, err);
          toolResult = JSON.stringify({ erro: err.message || "Erro ao executar a ferramenta" });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: toolResult,
        });
      }

      // Send tool results back to Claude
      messages.push({ role: "user", content: toolResults });
    }
  }

  async analyzeSentiment(text: string): Promise<{ score: number; confidence: number }> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("Chave de API da Anthropic não configurada");
      }

      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 100,
        system:
          "Você é um analisador de sentimento especializado. Avalie o sentimento do texto em uma escala de 1 a 5, onde 1 é muito negativo e 5 é muito positivo. Forneça também um nível de confiança entre 0 e 1. Responda apenas com um objeto JSON contendo as propriedades 'score' e 'confidence'. Sem markdown, apenas JSON puro.",
        messages: [{ role: "user", content: text }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const raw = textBlock ? (textBlock as { type: "text"; text: string }).text : "{}";
      const result = JSON.parse(raw);

      return {
        score: Math.max(1, Math.min(5, Math.round(result.score || 3))),
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      };
    } catch (error) {
      console.error("Erro ao analisar sentimento:", error);
      return { score: 3, confidence: 0 };
    }
  }

  async suggestTicketCategory(
    description: string,
    availableCategories: string[]
  ): Promise<{ category: string; confidence: number }> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("Chave de API da Anthropic não configurada");
      }

      const categoriesText = availableCategories.join(", ");

      const response = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 100,
        system: `Você é um especialista em categorização de chamados de suporte.
Analise a descrição do problema e determine qual categoria melhor se aplica.
Escolha exatamente uma categoria da seguinte lista: ${categoriesText}.
Forneça também um nível de confiança entre 0 e 1.
Responda apenas com um objeto JSON contendo as propriedades 'category' e 'confidence'. Sem markdown, apenas JSON puro.`,
        messages: [{ role: "user", content: description }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      const raw = textBlock ? (textBlock as { type: "text"; text: string }).text : "{}";
      const result = JSON.parse(raw);

      const suggestedCategory = result.category || availableCategories[0];
      const category = availableCategories.includes(suggestedCategory)
        ? suggestedCategory
        : availableCategories[0];

      return {
        category,
        confidence: Math.max(0, Math.min(1, result.confidence || 0.5)),
      };
    } catch (error) {
      console.error("Erro ao sugerir categoria:", error);
      return { category: availableCategories[0], confidence: 0 };
    }
  }
}

export const aiService = new AIService();
