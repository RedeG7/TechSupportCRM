import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { clientApiRequest } from "@/lib/clientApi";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Star, 
  PlusCircle, 
  RefreshCw, 
  Search, 
  Paperclip, 
  X, 
  ChevronLeft, 
  MessageSquare, 
  Clock, 
  FileText,
  CheckCircle,
  ArrowRight,
  Send,
  Circle,
  Plus,
  User,
  AlertCircle,
  XCircle,
  FileImage,
  File,
  FileSpreadsheet
} from "lucide-react";

import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  CardFooter
} from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import ClientLayout from "../components/layouts/ClientLayout";
import { apiRequest } from "../lib/queryClient";

type Ticket = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
  rating?: number;
  feedback?: string;
};

type TicketCategory = {
  id: number;
  name: string;
  description: string;
  color: string;
  createdAt: string;
  updatedAt: string;
};

type TicketActivity = {
  id: number;
  ticketId: number;
  type: string;
  description: string;
  createdAt: string;
  userName?: string;
};

const ticketSchema = z.object({
  title: z.string().min(5, "O título deve ter pelo menos 5 caracteres"),
  description: z.string().min(10, "A descrição deve ter pelo menos 10 caracteres"),
  category: z.string().min(1, "Selecione uma categoria"),
  priority: z.string().min(1, "Selecione uma prioridade")
});

type TicketFormData = z.infer<typeof ticketSchema>;

// Função para verificar se um ticket está resolvido ou fechado
const isTicketClosedOrResolved = (status: string): boolean => {
  const normalizedStatus = status.toLowerCase();
  return ['resolved', 'closed', 'resolvido', 'fechado'].includes(normalizedStatus);
};

// Função para verificar se um ticket está aberto (não fechado/resolvido)
const isTicketOpen = (status: string): boolean => {
  return !isTicketClosedOrResolved(status);
};

// Função para obter a cor do status do ticket
const getStatusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case "aberto":
      return "text-blue-600 bg-blue-50";
    case "em_andamento":
      return "text-amber-600 bg-amber-50";
    case "aguardando_cliente":
      return "text-purple-600 bg-purple-50";
    case "resolvido":
    case "resolved":
      return "text-green-600 bg-green-50";
    case "fechado":
    case "closed":
      return "text-gray-600 bg-gray-50";
    case "cancelado":
      return "text-red-600 bg-red-50";
    default:
      return "text-gray-600 bg-gray-50";
  }
};

// Função para traduzir o status
const translateStatus = (status: string) => {
  switch (status.toLowerCase()) {
    case "aberto":
      return "Aberto";
    case "em_andamento":
      return "Em Andamento";
    case "aguardando_cliente":
      return "Aguardando Você";
    case "resolvido":
    case "resolved":
      return "Resolvido";
    case "fechado":
    case "closed":
      return "Fechado";
    case "cancelado":
      return "Cancelado";
    default:
      return status;
  }
};

// Função para traduzir a prioridade
const translatePriority = (priority: string) => {
  switch (priority.toLowerCase()) {
    case "baixa":
      return "Prioridade Baixa";
    case "média":
    case "media":
      return "Prioridade Média";
    case "alta":
      return "Prioridade Alta";
    default:
      return priority;
  }
};

export default function ClientTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewTicketDialog, setShowNewTicketDialog] = useState(false);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [fileAttachment, setFileAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  
  // Estados para o painel lateral e avaliação
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [ticketActivities, setTicketActivities] = useState<TicketActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [replyText, setReplyText] = useState("");
  
  const form = useForm<TicketFormData>({
    resolver: zodResolver(ticketSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      priority: "média"
    }
  });

  // Função para obter o ícone apropriado baseado no tipo de arquivo
  const getFileIcon = (fileName: string) => {
    const extension = fileName.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'pdf':
        return <FileText className="h-4 w-4 text-red-500" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
      case 'tiff':
      case 'svg':
        return <FileImage className="h-4 w-4 text-blue-500" />;
      case 'xls':
      case 'xlsx':
        return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
      case 'doc':
      case 'docx':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'txt':
      case 'rtf':
        return <FileText className="h-4 w-4 text-gray-600" />;
      default:
        return <File className="h-4 w-4 text-gray-500" />;
    }
  };

  useEffect(() => {
    loadCurrentUser();
    loadTickets();
    loadCategories();
    
    // Verificar se temos um parâmetro tab na URL
    const urlSearchParams = new URLSearchParams(window.location.search);
    const tabParam = urlSearchParams.get('tab');
    if (tabParam && ['all', 'open', 'waiting', 'closed'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, []);

  useEffect(() => {
    // Filtrar mesmo se não houver tickets (array vazio)
    filterTickets();
  }, [activeTab, searchQuery, tickets]);

  const loadCategories = async () => {
    try {
      // Não é necessário token de autenticação para esta rota, então podemos usar fetch diretamente
      const response = await fetch("/api/client/ticket-categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
        console.log("Categories response:", data);
      } else {
        console.error("Erro ao carregar categorias");
      }
    } catch (error) {
      console.error("Erro ao carregar categorias:", error);
    }
  };

  // Função para carregar informações do cliente logado
  const loadCurrentUser = async () => {
    try {
      const clientContactId = localStorage.getItem('client_contact_id');
      
      if (!clientContactId) {
        return;
      }
      
      const response = await clientApiRequest(`/api/client/contact/${clientContactId}`);
      
      if (response.ok) {
        const userData = await response.json();
        setCurrentUser(userData);
      }
    } catch (error) {
      console.error("Erro ao carregar dados do usuário:", error);
    }
  };

  const loadTickets = async () => {
    setIsLoading(true);
    try {
      const clientContactId = localStorage.getItem("client_contact_id");
      
      if (!clientContactId) {
        console.error("ID do contato do cliente não encontrado");
        toast({
          variant: "destructive",
          title: "Erro de autenticação",
          description: "Sua sessão expirou. Por favor, faça login novamente."
        });
        return;
      }
      
      const response = await clientApiRequest("/api/client/tickets");
      
      if (response.ok) {
        const data = await response.json();
        setTickets(data);
      } else {
        console.error("Erro ao carregar chamados");
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Não foi possível carregar os chamados. Tente novamente mais tarde."
        });
      }
    } catch (error) {
      console.error("Erro ao carregar chamados:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Houve um problema ao se comunicar com o servidor."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterTickets = () => {
    let filtered = [...tickets];
    
    // Filtrar por status
    if (activeTab === "open") {
      filtered = filtered.filter(ticket => 
        ticket.status === "aberto" || ticket.status === "em_andamento");
    } else if (activeTab === "waiting") {
      filtered = filtered.filter(ticket => 
        ticket.status === "aguardando_cliente");
    } else if (activeTab === "closed") {
      filtered = filtered.filter(ticket => 
        isTicketClosedOrResolved(ticket.status) || ticket.status === "cancelado");
    }
    
    // Filtrar por texto de busca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(ticket => 
        ticket.title.toLowerCase().includes(query) || 
        ticket.description.toLowerCase().includes(query) ||
        ticket.category.toLowerCase().includes(query) ||
        String(ticket.id).includes(query)
      );
    }
    
    setFilteredTickets(filtered);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Verifica o tamanho do arquivo (limite de 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB em bytes
      if (file.size > maxSize) {
        toast({
          variant: "destructive",
          title: "Arquivo muito grande",
          description: "O tamanho máximo permitido é 5MB."
        });
        e.target.value = '';
        return;
      }

      // Verifica o tipo de arquivo
      const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'tiff', 'svg', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'rtf'];
      const fileExtension = file.name.toLowerCase().split('.').pop();
      
      if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
        toast({
          variant: "destructive",
          title: "Tipo de arquivo não suportado",
          description: "Aceitos: PDF, imagens (JPG, PNG, GIF, BMP, WebP, etc.) e documentos (DOC, DOCX, XLS, XLSX, TXT, RTF)."
        });
        e.target.value = '';
        return;
      }
      
      setFileAttachment(file);
    } else {
      setFileAttachment(null);
    }
  };
  
  const removeAttachment = () => {
    setFileAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  const handleCreateTicket = async (data: TicketFormData) => {
    if (isUploading) return;
    
    try {
      const authToken = localStorage.getItem("client-auth-token");
      
      if (!authToken) {
        toast({
          variant: "destructive",
          title: "Erro de autenticação",
          description: "Sua sessão expirou. Por favor, faça login novamente."
        });
        return;
      }
      
      setIsUploading(true);
      
      if (fileAttachment) {
        
        // Criar formData com os dados do formulário e o arquivo
        const formData = new FormData();
        formData.append('title', data.title);
        formData.append('description', data.description);
        formData.append('category', data.category);
        formData.append('priority', data.priority);
        formData.append('attachment', fileAttachment);
        
        // Para upload de arquivos, usamos nossa função clientApiRequest que já adiciona os headers de autenticação
        const response = await clientApiRequest(
          "/api/client/tickets/with-attachment",
          "POST",
          formData
        );
        
        setIsUploading(false);
        
        if (response.ok) {
          const newTicket = await response.json();
          // Fecha a tela imediatamente
          setShowNewTicketDialog(false);
          
          // Limpa o formulário e o anexo
          form.reset();
          setFileAttachment(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
          
          // Atualiza a lista de chamados
          loadTickets();
          
          // Mostra notificação de sucesso
          toast({
            title: "Chamado criado",
            description: `Chamado #${newTicket.id} foi criado com sucesso com anexo.`
          });
        } else {
          const errorData = await response.json();
          toast({
            variant: "destructive",
            title: "Erro ao criar chamado",
            description: errorData.message || "Ocorreu um erro ao criar o chamado."
          });
        }
      } else {
        // Se não tiver anexo, envia normalmente como JSON
        const response = await clientApiRequest(
          "/api/client/tickets", 
          "POST", 
          data
        );
        
        if (response.ok) {
          const newTicket = await response.json();
          // Fecha a tela imediatamente
          setShowNewTicketDialog(false);
          
          // Limpa o formulário
          form.reset();
          
          // Atualiza a lista de chamados
          loadTickets();
          
          // Mostra notificação de sucesso
          toast({
            title: "Chamado criado",
            description: `Chamado #${newTicket.id} foi criado com sucesso.`
          });
        } else {
          const errorData = await response.json();
          toast({
            variant: "destructive",
            title: "Erro ao criar chamado",
            description: errorData.message || "Ocorreu um erro ao criar o chamado."
          });
        }
      }
    } catch (error) {
      console.error("Erro ao criar chamado:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível criar o chamado. Tente novamente mais tarde."
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Função para abrir o painel lateral com detalhes do chamado
  const selectTicket = async (ticketId: number) => {
    // Encontrar o chamado na lista existente
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    
    // Definir o chamado selecionado
    setSelectedTicket(ticket);
    
    // Carregar atividades do chamado
    setLoadingActivities(true);
    try {
      const response = await fetch(`/api/client/tickets/${ticketId}/activities`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('client-auth-token')}`,
        }
      });
      
      if (response.ok) {
        const activities = await response.json();
        setTicketActivities(activities);
      } else {
        console.error("Erro ao carregar atividades do chamado");
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Não foi possível carregar as atividades do chamado"
        });
      }
    } catch (error) {
      console.error("Erro ao carregar atividades do chamado:", error);
    } finally {
      setLoadingActivities(false);
    }
  };
  
  // Função para fechar o painel lateral
  const closeTicketDetail = () => {
    setSelectedTicket(null);
    setTicketActivities([]);
  };
  
  // Função para abrir o diálogo de avaliação
  const openRatingDialog = (ticketId: number) => {
    const ticket = tickets.find(t => t.id === ticketId);
    if (ticket) {
      setSelectedTicket(ticket);
      setRating(0);
      setFeedback("");
      setShowRatingDialog(true);
    }
  };
  
  // Função para enviar a avaliação
  const submitRating = async () => {
    if (!selectedTicket) return;
    
    try {
      const response = await fetch(`/api/client/tickets/${selectedTicket.id}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('client-auth-token')}`
        },
        body: JSON.stringify({
          rating,
          feedback
        })
      });
      
      if (response.ok) {
        toast({
          title: "Avaliação enviada",
          description: "Obrigado por avaliar o atendimento!",
        });
        setShowRatingDialog(false);
        
        // Atualizar o chamado na lista
        loadTickets();
        
        // Se o painel lateral estiver aberto, atualizar o chamado selecionado
        if (selectedTicket) {
          const updatedTicket = {...selectedTicket, rating, feedback};
          setSelectedTicket(updatedTicket);
        }
      } else {
        const errorData = await response.json();
        toast({
          variant: "destructive",
          title: "Erro ao enviar avaliação",
          description: errorData.message || "Ocorreu um erro ao enviar sua avaliação."
        });
      }
    } catch (error) {
      console.error("Erro ao enviar avaliação:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível enviar sua avaliação. Tente novamente mais tarde."
      });
    }
  };

  // Função para enviar resposta ao chamado
  const submitReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    
    try {
      const response = await clientApiRequest(
        `/api/client/tickets/${selectedTicket.id}/reply`,
        'POST',
        { content: replyText }
      );
      
      if (response.ok) {
        toast({
          title: "Resposta enviada",
          description: "Sua resposta foi enviada com sucesso.",
        });
        
        // Limpar campo de resposta
        setReplyText("");
        
        // Atualizar atividades do chamado
        selectTicket(selectedTicket.id);
      } else {
        const errorData = await response.json();
        toast({
          variant: "destructive",
          title: "Erro ao enviar resposta",
          description: errorData.message || "Ocorreu um erro ao enviar sua resposta."
        });
      }
    } catch (error) {
      console.error("Erro ao enviar resposta:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível enviar sua resposta. Tente novamente mais tarde."
      });
    }
  };
  
  // Renderizar a lista de chamados
  const renderTicketsList = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
        </div>
      );
    }
    
    if (!filteredTickets.length) {
      return (
        <div className="text-center py-8">
          <div className="mx-auto h-12 w-12 text-muted-foreground mb-3 opacity-20">
            <FileText className="h-12 w-12" />
          </div>
          <h3 className="font-medium text-lg mb-2">Nenhum chamado encontrado</h3>
          <p className="text-muted-foreground mb-6">
            {searchQuery ? "Tente usar outros termos de busca." : "Você não possui chamados nesta categoria."}
          </p>
          <Button onClick={() => setShowNewTicketDialog(true)}>
            <PlusCircle className="mr-2 h-4 w-4" />
            Criar Novo Chamado
          </Button>
        </div>
      );
    }
    
    return (
      <div className="space-y-3">
        {filteredTickets.map((ticket) => (
          <div 
            key={ticket.id}
            className="border rounded-lg p-3 sm:p-4 hover:border-primary/50 hover:bg-secondary/20 transition-colors cursor-pointer"
            onClick={() => selectTicket(ticket.id)}
          >
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:items-center justify-between mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs font-normal">#{ticket.id}</Badge>
                <Badge className={getStatusColor(ticket.status)}>
                  {translateStatus(ticket.status)}
                </Badge>
              </div>
              <Badge variant="outline" className="text-xs self-start sm:self-auto">{ticket.category}</Badge>
            </div>
            
            <div className="space-y-2">
              <div className="flex flex-col">
                <h3 className="font-semibold text-sm sm:text-base md:text-lg line-clamp-1 mb-1">
                  {ticket.title}
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                  {ticket.description}
                </p>
              </div>
              
              <div className="flex flex-wrap gap-1.5 sm:gap-2 text-[0.65rem] sm:text-xs text-muted-foreground">
                <span className="inline-flex items-center bg-secondary/20 px-1.5 sm:px-2 py-0.5 rounded-md">
                  {translatePriority(ticket.priority)}
                </span>
                <span className="inline-flex items-center bg-secondary/20 px-1.5 sm:px-2 py-0.5 rounded-md">
                  <span className="truncate">Criado em: {formatDate(ticket.createdAt)}</span>
                </span>
              </div>
            </div>
            
            {/* Mensagem de avaliação para chamados fechados/resolvidos sem avaliação */}
            {isTicketClosedOrResolved(ticket.status) && !ticket.rating && (
              <div className="mt-2 p-3 bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center text-yellow-800 text-sm gap-3">
                  <Star className="h-6 w-6 text-yellow-500 fill-yellow-400 shrink-0 hidden sm:block" />
                  <div className="flex-1">
                    <div className="flex items-center mb-1">
                      <Star className="h-5 w-5 mr-2 text-yellow-500 fill-yellow-400 sm:hidden" />
                      <p className="font-medium">Sua avaliação é importante para nós!</p>
                    </div>
                    <p className="mb-3 text-xs sm:text-sm">Ajude-nos a melhorar nosso atendimento avaliando este chamado.</p>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="w-full sm:w-auto bg-yellow-100 border-yellow-400 text-yellow-700 hover:bg-yellow-200 hover:text-yellow-800"
                      onClick={(e) => {
                        e.stopPropagation();
                        openRatingDialog(ticket.id);
                      }}
                    >
                      <Star className="h-4 w-4 mr-2 fill-yellow-500" />
                      Avaliar Atendimento
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Exibir avaliação se o ticket já foi avaliado */}
            {ticket.rating && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">Avaliação:</span>
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star 
                      key={star} 
                      className={`h-4 w-4 ${star <= (ticket.rating || 0) ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
          <h1 className="text-xl sm:text-2xl font-bold">Meus Chamados</h1>
          <Dialog open={showNewTicketDialog} onOpenChange={setShowNewTicketDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="sm:size-md">
                <PlusCircle className="mr-2 h-4 w-4" />
                Novo Chamado
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Criar Novo Chamado</DialogTitle>
                <DialogDescription>
                  Preencha os dados abaixo para abrir um novo chamado de suporte.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleCreateTicket)} className="space-y-6">
                  {/* Campo de informação do usuário criando o chamado */}
                  <div>
                    <Label htmlFor="createdBy">Criado por</Label>
                    <div className="w-full p-2 border rounded-md bg-gray-50 text-gray-700">
                      {currentUser ? `${currentUser.name} (${currentUser.email})` : 'Carregando...'}
                    </div>
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Título*</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Resumo do problema" 
                            {...field} 
                            autoComplete="off"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Descrição*</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Descreva o problema em detalhes..." 
                            {...field} 
                            className="min-h-[120px]" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Categoria*</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                          >
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
                          <FormLabel>Prioridade*</FormLabel>
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value || "média"}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione uma prioridade" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="baixa">Baixa</SelectItem>
                              <SelectItem value="média">Média</SelectItem>
                              <SelectItem value="alta">Alta</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="attachment">Anexo (opcional)</Label>
                    <div className="mt-1.5">
                      {!fileAttachment ? (
                        <div className="flex items-center">
                          <Input
                            id="attachment"
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.doc,.docx,.xls,.xlsx"
                            className="w-full"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between p-2 border rounded-md">
                          <div className="flex items-center">
                            {getFileIcon(fileAttachment.name)}
                            <span className="text-sm truncate max-w-[200px] ml-2">{fileAttachment.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({Math.round(fileAttachment.size / 1024)} KB)
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={removeAttachment}
                            className="h-8 w-8 p-0"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Remover anexo</span>
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Formatos aceitos: PDF, imagens (JPG, PNG, GIF, BMP, WebP), documentos (DOC, DOCX, XLS, XLSX). Tamanho máximo: 5MB.
                    </p>
                  </div>
                  
                  <DialogFooter>
                    <Button type="submit" disabled={isUploading}>
                      {isUploading ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                          Enviando...
                        </>
                      ) : "Criar Chamado"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar chamados..." 
              className="pl-9 w-full h-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 rounded-md"
              onClick={loadTickets}
              title="Atualizar lista de chamados"
            >
              <RefreshCw className="h-4 w-4" />
              <span className="sr-only">Atualizar</span>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg sm:text-xl">Lista de Chamados</CardTitle>
            <CardDescription className="text-sm">
              Gerencie seus chamados de suporte
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 w-full grid grid-cols-2 sm:grid-cols-4 gap-1">
                <TabsTrigger value="all" className="text-xs sm:text-sm">Todos</TabsTrigger>
                <TabsTrigger value="open" className="text-xs sm:text-sm">Em Aberto</TabsTrigger>
                <TabsTrigger value="waiting" className="text-xs sm:text-sm">Aguardando</TabsTrigger>
                <TabsTrigger value="closed" className="text-xs sm:text-sm">Resolvidos</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="mt-0">
                {renderTicketsList()}
              </TabsContent>
              <TabsContent value="open" className="mt-0">
                {renderTicketsList()}
              </TabsContent>
              <TabsContent value="waiting" className="mt-0">
                {renderTicketsList()}
              </TabsContent>
              <TabsContent value="closed" className="mt-0">
                {renderTicketsList()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
      
      {/* Painel lateral de detalhes de chamado (responsivo para dispositivos móveis) */}
      <Sheet open={selectedTicket !== null} onOpenChange={(open) => !open && closeTicketDetail()}>
        <SheetContent className="sm:max-w-md w-full overflow-y-auto p-4 sm:p-6" side="right">
          <SheetHeader className="mb-4 sm:mb-5">
            <SheetTitle className="flex flex-wrap items-center gap-2 text-lg sm:text-xl">
              <span>Chamado #{selectedTicket?.id}</span>
              {selectedTicket && (
                <Badge variant="outline" className={getStatusColor(selectedTicket.status)}>
                  {translateStatus(selectedTicket.status)}
                </Badge>
              )}
            </SheetTitle>
            <SheetDescription className="text-xs sm:text-sm">
              Detalhes e histórico do chamado
            </SheetDescription>
          </SheetHeader>
          
          {selectedTicket && (
            <ScrollArea className="h-[calc(100vh-150px)] pr-3 sm:pr-4">
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="font-semibold text-base sm:text-lg mb-2">{selectedTicket.title}</h3>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
                    <Badge variant="secondary" className="text-xs">{selectedTicket.category}</Badge>
                    <Badge variant="outline" className="text-xs">{translatePriority(selectedTicket.priority)}</Badge>
                  </div>
                  <Card className="bg-secondary/5 border-none">
                    <CardContent className="p-2 sm:p-3 text-xs sm:text-sm">
                      <div className="whitespace-pre-wrap">{selectedTicket.description}</div>
                    </CardContent>
                  </Card>
                  <div className="flex items-center justify-between mt-2 sm:mt-3 text-xs sm:text-sm text-muted-foreground">
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" />
                      {formatDate(selectedTicket.createdAt)}
                    </span>
                  </div>
                </div>
                
                {/* Campo de resposta para chamados abertos */}
                {isTicketOpen(selectedTicket.status) && (
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium flex items-center mb-2 sm:mb-3">
                      <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                      Responder
                    </h4>
                    <div className="space-y-2">
                      <Textarea 
                        placeholder="Digite sua resposta..." 
                        className="min-h-[80px] sm:min-h-[100px] text-xs sm:text-sm"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                      />
                      <Button 
                        onClick={submitReply} 
                        disabled={!replyText.trim()}
                        className="w-full text-xs sm:text-sm py-1.5 sm:py-2"
                        size="sm"
                      >
                        Enviar Resposta
                      </Button>
                    </div>
                  </div>
                )}
                
                <div>
                  <h4 className="text-xs sm:text-sm font-medium flex items-center mb-2 sm:mb-3">
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                    Histórico do chamado
                  </h4>
                  
                  {loadingActivities ? (
                    <div className="flex justify-center py-6 sm:py-8">
                      <div className="h-6 w-6 sm:h-8 sm:w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    </div>
                  ) : ticketActivities.length > 0 ? (
                    <div className="space-y-3 sm:space-y-4">
                      {ticketActivities.map((activity, index) => (
                        <div key={index} className="relative pl-4 sm:pl-5 pb-3 sm:pb-4">
                          {/* Linha vertical conectando eventos */}
                          {index < ticketActivities.length - 1 && (
                            <div className="absolute left-1.5 sm:left-2 top-2 bottom-0 w-0.5 bg-border"></div>
                          )}
                          {/* Ponto marcando cada evento */}
                          <div className={`absolute left-0 top-1.5 sm:top-2 h-3 w-3 sm:h-4 sm:w-4 rounded-full 
                            ${activity.type === 'comment' ? 'bg-blue-100 border-blue-400' : 
                              activity.type === 'status_change' ? 'bg-amber-100 border-amber-400' : 
                              activity.type === 'creation' ? 'bg-green-100 border-green-400' : 
                              activity.type === 'rate' ? 'bg-yellow-100 border-yellow-400' : 
                              'bg-primary/20 border-primary'} 
                            border-2`}></div>
                          <Card className="bg-card border-border">
                            <CardContent className="p-2 sm:p-3">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-0.5 sm:gap-1 mb-1 sm:mb-2">
                                <h5 className="font-medium text-xs sm:text-sm flex items-center">
                                  {activity.type === 'comment' ? (
                                    <><MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-blue-500" /> Comentário</>
                                  ) : activity.type === 'status_change' ? (
                                    <><RefreshCw className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-amber-500" /> Mudança de Status</>
                                  ) : activity.type === 'creation' ? (
                                    <><Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-green-500" /> Criação do Chamado</>
                                  ) : activity.type === 'rate' ? (
                                    <><Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5 text-yellow-500" /> Avaliação</>
                                  ) : (
                                    <><Circle className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1 sm:mr-1.5" /> Atividade</>
                                  )}
                                </h5>
                                <span className="text-[0.65rem] sm:text-xs text-muted-foreground">{formatDate(activity.createdAt)}</span>
                              </div>
                              <p className="text-xs sm:text-sm whitespace-pre-wrap">{activity.description}</p>
                              {activity.userName && (
                                <div className="text-[0.65rem] sm:text-xs text-muted-foreground mt-1 sm:mt-1.5 flex items-center">
                                  <User className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-1 opacity-70" /> {activity.userName}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-2 opacity-20" />
                      <p>Sem atividades registradas para este chamado.</p>
                    </div>
                  )}
                </div>
                
                {/* Seção de resolução quando o chamado estiver fechado/resolvido */}
                {selectedTicket.resolutionNote && (
                  <div>
                    <h4 className="text-sm font-medium flex items-center mb-3">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Resolução
                    </h4>
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="p-3">
                        <p className="text-sm whitespace-pre-wrap">{selectedTicket.resolutionNote}</p>
                        {selectedTicket.resolvedAt && (
                          <div className="text-xs text-muted-foreground mt-2">
                            Resolvido em: {formatDate(selectedTicket.resolvedAt)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {/* Avaliação existente */}
                {selectedTicket.rating && (
                  <div>
                    <h4 className="text-xs sm:text-sm font-medium flex items-center mb-2 sm:mb-3">
                      <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                      Sua avaliação
                    </h4>
                    <Card className="bg-yellow-50 border-yellow-200">
                      <CardContent className="p-2 sm:p-3">
                        <div className="flex items-center gap-0.5 sm:gap-1 mb-1.5 sm:mb-2">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star 
                              key={star} 
                              className={`h-4 w-4 sm:h-5 sm:w-5 ${star <= (selectedTicket.rating || 0) ? 'fill-yellow-500 text-yellow-500' : 'text-gray-300'}`} 
                            />
                          ))}
                        </div>
                        {selectedTicket.feedback && (
                          <p className="text-xs sm:text-sm text-gray-700 whitespace-pre-wrap">
                            "{selectedTicket.feedback}"
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
                
                {/* Botão de avaliação (se o chamado estiver fechado sem avaliação) */}
                {isTicketClosedOrResolved(selectedTicket.status) && !selectedTicket.rating && (
                  <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-border">
                    <Card className="bg-yellow-50 border-yellow-200">
                      <CardContent className="p-3 sm:p-4">
                        <h3 className="font-medium mb-1.5 sm:mb-2 flex items-center text-sm sm:text-base">
                          <Star className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 text-yellow-500 fill-yellow-400" />
                          Avalie o atendimento
                        </h3>
                        <p className="text-xs sm:text-sm mb-3 sm:mb-4">Sua avaliação nos ajuda a melhorar nosso serviço e identificar pontos de melhoria.</p>
                        <Button 
                          onClick={() => openRatingDialog(selectedTicket.id)}
                          className="w-full bg-yellow-100 border-yellow-400 text-yellow-700 hover:bg-yellow-200 hover:text-yellow-800 text-xs sm:text-sm"
                          variant="outline"
                          size="sm"
                        >
                          <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 fill-yellow-500" />
                          Avaliar Agora
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          
          <SheetFooter className="mt-4 flex-row justify-between sm:justify-between gap-2">
            <SheetClose asChild>
              <Button variant="outline" className="w-full">
                <ChevronLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            </SheetClose>
            
            {selectedTicket && isTicketClosedOrResolved(selectedTicket.status) && !selectedTicket.rating && (
              <Button 
                variant="default" 
                className="w-full" 
                onClick={() => selectedTicket && openRatingDialog(selectedTicket.id)}
              >
                <Star className="mr-2 h-4 w-4" />
                Avaliar
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
      
      {/* Diálogo de avaliação */}
      <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
        <DialogContent className="sm:max-w-md max-w-[95vw] p-4 sm:p-6">
          <DialogHeader className="space-y-1 sm:space-y-2 pb-2 sm:pb-4">
            <DialogTitle className="text-lg sm:text-xl">Avaliar Atendimento</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Sua opinião é muito importante para melhorarmos nosso serviço.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 sm:space-y-6 py-3 sm:py-4">
            <div className="flex flex-col items-center gap-1 sm:gap-2">
              <h3 className="text-center font-medium text-sm sm:text-base">Chamado #{selectedTicket?.id}: {selectedTicket?.title}</h3>
              <div className="flex items-center justify-center gap-1 sm:gap-2 py-3 sm:py-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className="focus:outline-none transition-all duration-100 hover:scale-110"
                    onClick={() => setRating(star)}
                  >
                    <Star
                      className={`h-6 w-6 sm:h-8 sm:w-8 ${
                        star <= rating
                          ? "fill-yellow-500 text-yellow-500"
                          : "text-gray-300"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-center text-xs sm:text-sm text-muted-foreground">
                {rating === 1 && "Péssimo atendimento"}
                {rating === 2 && "Abaixo do esperado"}
                {rating === 3 && "Regular"}
                {rating === 4 && "Bom atendimento"}
                {rating === 5 && "Excelente atendimento"}
              </p>
            </div>
            
            <div>
              <Label htmlFor="feedback" className="text-xs sm:text-sm">Comentários (opcional)</Label>
              <Textarea
                id="feedback"
                placeholder="Conte-nos mais sobre sua experiência..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                className="mt-1 text-xs sm:text-sm min-h-[80px] sm:min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => setShowRatingDialog(false)}
              className="w-full sm:w-auto text-xs sm:text-sm py-1.5 sm:py-2"
              size="sm"
            >
              Cancelar
            </Button>
            <Button 
              type="button" 
              onClick={submitRating} 
              disabled={rating === 0}
              className="w-full sm:w-auto text-xs sm:text-sm py-1.5 sm:py-2"
              size="sm"
            >
              Enviar Avaliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
}