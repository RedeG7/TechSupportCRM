import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { clientApiRequest } from "@/lib/clientApi";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  BarChart, 
  Clock, 
  TicketCheck, 
  ClipboardList, 
  Loader2, 
  HelpCircle, 
  AlertCircle, 
  CheckCircle2, 
  XCircle,
  PlusCircle
} from "lucide-react";

// Tipo para os tickets
type Ticket = {
  id: number;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

// Tipo para categorias
type Category = {
  id: number;
  name: string;
  description: string;
  color: string;
};

// Schema de validação para criação de ticket
const ticketSchema = z.object({
  title: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
  description: z.string().min(10, "A descrição deve ter pelo menos 10 caracteres"),
  category: z.string().min(1, "Selecione uma categoria"),
  priority: z.string().min(1, "Selecione uma prioridade"),
});

export default function ClientDashboard() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    waiting: 0,
    closed: 0
  });
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  
  // Estados para o modal de criação de chamado
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      priority: "medium",
    },
  });

  useEffect(() => {
    // Obter dados do cliente do localStorage
    const storedClientName = localStorage.getItem("client_name") || "";
    const storedContactName = localStorage.getItem("contact_name") || "";
    
    setClientName(storedClientName);
    setContactName(storedContactName);
    
    loadTickets();
    loadCategories();
  }, []);

  useEffect(() => {
    // Calcular estatísticas dos tickets
    if (tickets.length > 0) {
      calculateStats();
    }
  }, [tickets]);

  const loadTickets = async () => {
    try {
      setIsLoading(true);
      
      // Adicionar token de autenticação nos headers
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("client-auth-token")}`,
      };
      
      const response = await fetch("/api/client/tickets", { 
        method: "GET",
        headers
      });
      
      if (!response.ok) {
        throw new Error("Falha ao carregar chamados");
      }
      
      const data = await response.json();
      setTickets(data);
    } catch (error) {
      console.error("Erro ao carregar tickets:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar seus chamados.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await clientApiRequest("/api/client/ticket-categories");
      
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
    }
  };

  const onSubmitTicket = async (values: z.infer<typeof ticketSchema>) => {
    try {
      setIsSubmitting(true);
      
      const response = await clientApiRequest("/api/client/tickets", "POST", values);
      
      if (response.ok) {
        const newTicket = await response.json();
        
        toast({
          title: "Chamado criado",
          description: `Chamado #${newTicket.id} criado com sucesso!`,
        });
        
        setCreateModalOpen(false);
        form.reset();
        loadTickets(); // Recarregar lista de tickets
      } else {
        const errorData = await response.json();
        toast({
          variant: "destructive",
          title: "Erro ao criar chamado",
          description: errorData.message || "Ocorreu um erro ao criar o chamado.",
        });
      }
    } catch (error) {
      console.error("Erro ao criar chamado:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível criar o chamado. Tente novamente.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculateStats = () => {
    const total = tickets.length;
    const open = tickets.filter(t => 
      t.status === "aberto" || 
      t.status === "new" || 
      t.status === "em_andamento" || 
      t.status === "in_progress" || 
      t.status === "reaberto"
    ).length;
    const waiting = tickets.filter(t => 
      t.status === "waiting_client" || 
      t.status === "aguardando_cliente"
    ).length;
    const closed = tickets.filter(t => 
      t.status === "resolved" || 
      t.status === "closed" || 
      t.status === "resolvido" || 
      t.status === "fechado" ||
      t.status === "cancelado" ||
      t.status === "cancelled"
    ).length;
    
    setStats({ total, open, waiting, closed });
  };

  // Função para formatar a data
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  // Traduzir status para português
  const translateStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
      "new": "Novo",
      "aberto": "Aberto",
      "in_progress": "Em andamento",
      "waiting_client": "Aguardando cliente",
      "resolved": "Resolvido",
      "closed": "Fechado",
      "reaberto": "Reaberto"
    };

    return statusMap[status] || status;
  };

  // Obter cor do status
  const getStatusColor = (status: string): string => {
    const colorMap: Record<string, string> = {
      "new": "text-blue-500",
      "aberto": "text-blue-500",
      "in_progress": "text-yellow-500",
      "waiting_client": "text-purple-500",
      "resolved": "text-green-500",
      "closed": "text-green-500",
      "reaberto": "text-orange-500"
    };

    return colorMap[status] || "text-gray-500";
  };

  // Obter ícone do status
  const getStatusIcon = (status: string) => {
    const statusIconMap: Record<string, React.ReactNode> = {
      "new": <HelpCircle className="h-4 w-4 text-blue-500" />,
      "aberto": <HelpCircle className="h-4 w-4 text-blue-500" />,
      "in_progress": <Loader2 className="h-4 w-4 text-yellow-500" />,
      "waiting_client": <AlertCircle className="h-4 w-4 text-purple-500" />,
      "resolved": <CheckCircle2 className="h-4 w-4 text-green-500" />,
      "closed": <CheckCircle2 className="h-4 w-4 text-green-500" />,
      "reaberto": <XCircle className="h-4 w-4 text-orange-500" />
    };

    return statusIconMap[status] || <HelpCircle className="h-4 w-4" />;
  };

  // Ir para a página de tickets
  const goToTickets = () => {
    navigate("/client/tickets");
  };

  // Abrir modal para criar novo ticket
  const createNewTicket = () => {
    setCreateModalOpen(true);
  };

  // Ir para a página de detalhes do ticket
  const goToTicketDetail = (ticketId: number) => {
    navigate(`/client/tickets/${ticketId}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base break-words">
            Bem-vindo, {contactName} - {clientName}
          </p>
        </div>
        <Button onClick={createNewTicket} className="w-full sm:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" />
          Novo Chamado
        </Button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Chamados</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              Todos os chamados registrados
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Andamento</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.open}</div>
            <p className="text-xs text-muted-foreground">
              Chamados abertos ou em progresso
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando Você</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.waiting}</div>
            <p className="text-xs text-muted-foreground">
              Chamados que precisam da sua atenção
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídos</CardTitle>
            <TicketCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.closed}</div>
            <p className="text-xs text-muted-foreground">
              Chamados resolvidos ou fechados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chamados recentes */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <div>
            <CardTitle>Chamados Recentes</CardTitle>
            <CardDescription>
              Seus últimos 5 chamados de suporte
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={goToTickets} className="w-full sm:w-auto">
            Ver todos
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum chamado encontrado</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={createNewTicket}>
                Criar seu primeiro chamado
              </Button>
            </div>
          ) : (
            <div className="space-y-4 overflow-hidden">
              {tickets.slice(0, 5).map(ticket => (
                <div 
                  key={ticket.id} 
                  className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-lg hover:bg-secondary/10 cursor-pointer gap-2"
                  onClick={() => goToTicketDetail(ticket.id)}
                >
                  <div className="flex items-start sm:items-center gap-3 w-full">
                    <div className="flex-shrink-0 mt-1 sm:mt-0">
                      {getStatusIcon(ticket.status)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate">#{ticket.id} - {ticket.title}</h3>
                      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        <span className="truncate">Categoria: {ticket.category}</span>
                        <span className="hidden sm:inline">•</span>
                        <span>Criado em: {formatDate(ticket.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center self-end sm:self-auto mt-1 sm:mt-0">
                    <span className={`text-sm font-medium px-2 py-1 rounded-full ${getStatusColor(ticket.status)} bg-secondary/20`}>
                      {translateStatus(ticket.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de criação de chamado */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Criar Novo Chamado</DialogTitle>
            <DialogDescription>
              Preencha as informações abaixo para criar um novo chamado de suporte.
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitTicket)} className="space-y-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título do Chamado</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Descreva brevemente o problema..." 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoria</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma categoria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.name}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a prioridade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Baixa</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição Detalhada</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Descreva o problema em detalhes..."
                        className="min-h-[100px]"
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setCreateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                      Criando...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Criar Chamado
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}