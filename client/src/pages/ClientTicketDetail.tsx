import React, { useState, useEffect } from 'react';
import { useLocation, useParams, useRoute } from 'wouter';
import { clientApiRequest } from '@/lib/clientApi';
import { 
  Send, Clock, Star, Award, 
  CornerUpLeft, AlertCircle, CheckCircle2,
  FileText, MessageCircle, XCircle, Paperclip, X, Upload
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import ClientLayout from '@/components/layouts/ClientLayout';
import { Separator } from "@/components/ui/separator";

// Definição dos tipos
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
  clientId: number;
  assignedTo?: number;
  assignedUserName?: string;
  openedByName?: string;
  openedByEmail?: string;
};

type TicketActivity = {
  id: number;
  ticketId: number;
  userId?: number;
  userName?: string;
  type: string;
  content: string;
  createdAt: string;
  isInternal: boolean;
  attachments?: string[];
};

export default function ClientTicketDetail() {
  const [_, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const ticketId = params.id ? parseInt(params.id) : 0;
  
  const { toast } = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<TicketActivity[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [sendingRating, setSendingRating] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  
  // Função para atualizar dados do ticket
  const refreshTicket = async () => {
    try {
      if (!ticketId) return;
      
      const res = await clientApiRequest(`/api/client/tickets/${ticketId}`);
      
      if (!res.ok) {
        throw new Error(`Erro ao buscar ticket: ${res.status}`);
      }
      
      const data = await res.json();
      setTicket(data);
      
      // Buscar atividades do ticket
      const activitiesRes = await clientApiRequest(`/api/client/tickets/${ticketId}/activities`);
      
      if (!activitiesRes.ok) {
        throw new Error(`Erro ao buscar atividades: ${activitiesRes.status}`);
      }
      
      const activitiesData = await activitiesRes.json();
      setActivities(activitiesData.filter((activity: TicketActivity) => !activity.isInternal));
      
      return true;
    } catch (error) {
      console.error('Erro ao atualizar dados do ticket:', error);
      return false;
    }
  };

  // Carregar dados do ticket na inicialização
  useEffect(() => {
    if (!ticketId) return;
    
    const fetchTicket = async () => {
      try {
        setLoading(true);
        await refreshTicket();
      } catch (error) {
        console.error('Erro ao carregar ticket:', error);
        toast({
          title: "Erro",
          description: "Não foi possível carregar os dados do chamado",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    
    fetchTicket();
  }, [ticketId, setLocation, toast]);
  
  // Função para gerenciar seleção de arquivos
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "Atenção",
        description: "Apenas imagens são permitidas",
        variant: "destructive"
      });
    }
    
    setSelectedFiles(prev => [...prev, ...imageFiles]);
  };

  // Função para remover arquivo selecionado
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Função para enviar mensagem com anexos
  const handleSendMessage = async () => {
    if (!newMessage.trim() && selectedFiles.length === 0) {
      toast({
        title: "Erro",
        description: "Digite uma mensagem ou selecione ao menos uma imagem",
        variant: "destructive"
      });
      return;
    }
    
    if (!ticket) return;
    
    setSendingMessage(true);
    setUploadingFiles(true);
    
    try {
      let attachments: string[] = [];
      
      // Upload dos arquivos se houver
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        selectedFiles.forEach((file, index) => {
          formData.append(`files`, file);
        });
        
        const uploadRes = await clientApiRequest(
          `/api/client/tickets/${ticketId}/upload`,
          'POST',
          formData
        );
        
        if (!uploadRes.ok) {
          throw new Error(`Erro ao fazer upload dos arquivos: ${uploadRes.status}`);
        }
        
        const uploadData = await uploadRes.json();
        attachments = uploadData.files || [];
      }
      
      // Enviar a resposta usando o clientApi
      const res = await clientApiRequest(
        `/api/client/tickets/${ticketId}/reply`,
        'POST',
        { 
          content: newMessage.trim() || "Imagem anexada",
          attachments 
        }
      );
      
      if (!res.ok) {
        throw new Error(`Erro ao enviar mensagem: ${res.status}`);
      }
      
      // Limpar os campos
      setNewMessage('');
      setSelectedFiles([]);
      
      // Atualizar dados do ticket
      await refreshTicket();
      
      toast({
        title: "Mensagem enviada",
        description: "Sua resposta foi enviada com sucesso",
      });
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar sua mensagem",
        variant: "destructive"
      });
    } finally {
      setSendingMessage(false);
      setUploadingFiles(false);
    }
  };
  
  // Função para avaliar o ticket
  const handleRateTicket = async () => {
    if (!rating || !ticket) return;
    
    setSendingRating(true);
    try {
      const authToken = localStorage.getItem('client-auth-token');
      if (!authToken) {
        setLocation('/client/login');
        return;
      }
      
      const res = await fetch(`/api/client/tickets/${ticketId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ rating, feedback })
      });
      
      if (!res.ok) {
        throw new Error(`Erro ao avaliar ticket: ${res.status}`);
      }
      
      toast({
        title: "Avaliação enviada",
        description: "Obrigado por avaliar o atendimento",
      });
      
      // Redirecionar para a lista de chamados resolvidos após a avaliação
      setLocation('/client/tickets?tab=closed');
      return;
      
    } catch (error) {
      console.error('Erro ao avaliar ticket:', error);
      toast({
        title: "Erro",
        description: "Não foi possível registrar sua avaliação",
        variant: "destructive"
      });
    } finally {
      setSendingRating(false);
    }
  };
  
  // Função para reabrir um ticket
  const handleReopenTicket = async () => {
    if (!reopenReason.trim() || !ticket) return;
    
    setReopening(true);
    try {
      // Usar a nova API de reabertura
      const reopenRes = await clientApiRequest(
        `/api/client/tickets/${ticketId}/reopen`, 
        'POST',
        { reason: reopenReason }
      );
      
      if (!reopenRes.ok) {
        const errorData = await reopenRes.json();
        throw new Error(errorData.message || `Erro ao reabrir chamado: ${reopenRes.status}`);
      }
      
      // Atualizar interface com dados mais recentes
      await refreshTicket();
      
      // Fechar o diálogo de reabertura
      setReopenDialogOpen(false);
      setReopenReason('');
      
      toast({
        title: "Chamado reaberto",
        description: "O chamado foi reaberto com sucesso",
      });
    } catch (error) {
      console.error('Erro ao reabrir ticket:', error);
      toast({
        title: "Erro",
        description: "Não foi possível reabrir o chamado",
        variant: "destructive"
      });
    } finally {
      setReopening(false);
    }
  };
  
  // Função para renderizar as estrelas da avaliação
  const renderStars = (count: number) => {
    return Array.from({ length: 5 }, (_, index) => (
      <Star
        key={index}
        className={`h-6 w-6 cursor-pointer ${
          index < count ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
        }`}
        onClick={() => count !== rating && setRating(index + 1)}
      />
    ));
  };
  
  // Função para mostrar a cor do status do ticket e traduzir para português
  const getStatusBadge = (status: string) => {
    // Normalizar o status para lowercase
    const normalizedStatus = status.toLowerCase();
    
    switch (normalizedStatus) {
      case 'new':
      case 'novo':
        return <Badge variant="default">Novo</Badge>;
      case 'open':
      case 'aberto':
        return <Badge variant="default">Aberto</Badge>;
      case 'in_progress':
      case 'em_andamento':
      case 'em andamento':
        return <Badge className="bg-blue-500">Em Andamento</Badge>;
      case 'waiting_client':
      case 'aguardando_cliente':
      case 'aguardando cliente':
        return <Badge variant="outline" className="text-amber-500 border-amber-500">Aguardando Cliente</Badge>;
      case 'resolved':
      case 'resolvido':
        return <Badge variant="outline" className="text-green-500 border-green-500">Resolvido</Badge>;
      case 'closed':
      case 'fechado':
        return <Badge variant="outline" className="text-gray-500 border-gray-500">Fechado</Badge>;
      default:
        // Tradução genérica para status desconhecidos
        return <Badge variant="outline">{normalizedStatus === status ? status : normalizedStatus}</Badge>;
    }
  };
  
  // Função para mostrar a cor da prioridade do ticket
  const getPriorityBadge = (priority: string) => {
    // Normalizar a prioridade para lowercase
    const normalizedPriority = priority.toLowerCase();
    
    switch (normalizedPriority) {
      case 'low':
      case 'baixa':
        return <Badge variant="outline" className="text-green-500 border-green-500">Baixa</Badge>;
      case 'medium':
      case 'média':
      case 'media':
        return <Badge variant="outline" className="text-amber-500 border-amber-500">Média</Badge>;
      case 'high':
      case 'alta':
        return <Badge variant="outline" className="text-red-500 border-red-500">Alta</Badge>;
      default:
        // Tradução genérica para prioridades desconhecidas
        return <Badge variant="outline">{normalizedPriority === priority ? priority : normalizedPriority}</Badge>;
    }
  };
  
  // Função para calcular o tempo de espera do ticket
  const calculateWaitTime = (ticket: Ticket) => {
    if (!ticket) return null;
    
    if (isTicketClosedOrResolved(ticket.status)) {
      if (ticket.resolvedAt) {
        const createdDate = parseISO(ticket.createdAt);
        const resolvedDate = parseISO(ticket.resolvedAt);
        
        const days = differenceInDays(resolvedDate, createdDate);
        const formattedTime = formatDistanceToNow(createdDate, { locale: ptBR, addSuffix: false });
        
        return {
          days,
          formattedTime,
          isResolved: true
        };
      }
    }
    
    // Ticket ainda está aberto
    const createdDate = parseISO(ticket.createdAt);
    const days = differenceInDays(new Date(), createdDate);
    const formattedTime = formatDistanceToNow(createdDate, { locale: ptBR, addSuffix: false });
    
    return {
      days,
      formattedTime,
      isResolved: false
    };
  };
  
  // Formatação de datas em português
  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch (e) {
      return dateString;
    }
  };
  
  // Função auxiliar para verificar se um ticket está resolvido ou fechado
  const isTicketClosedOrResolved = (status: string): boolean => {
    const normalizedStatus = status.toLowerCase();
    return ['resolved', 'closed', 'resolvido', 'fechado'].includes(normalizedStatus);
  };
  
  // Função auxiliar para verificar se um ticket está aberto (não fechado/resolvido)
  const isTicketOpen = (status: string): boolean => {
    return !isTicketClosedOrResolved(status);
  };
  
  if (loading) {
    return (
      <ClientLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-4 border-t-blue-500 border-blue-200 rounded-full animate-spin"></div>
        </div>
      </ClientLayout>
    );
  }
  
  if (!ticket) {
    return (
      <ClientLayout>
        <div className="flex flex-col items-center justify-center min-h-screen">
          <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Chamado não encontrado</h1>
          <p className="text-gray-500 mb-4">O chamado solicitado não existe ou você não tem permissão para acessá-lo.</p>
          <Button onClick={() => setLocation('/client/tickets')}>
            Voltar para a lista de chamados
          </Button>
        </div>
      </ClientLayout>
    );
  }
  
  // Calcular tempo de espera
  const waitTime = calculateWaitTime(ticket);
  
  return (
    <ClientLayout>
      <div className="max-w-full md:max-w-6xl mx-auto py-4 sm:py-6 px-2 sm:px-4 md:px-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
          <div className="w-full sm:w-auto">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold break-words">
              #{ticket.id}: {ticket.title}
            </h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {getStatusBadge(ticket.status)}
              {getPriorityBadge(ticket.priority)}
              <Badge variant="outline">{ticket.category}</Badge>
            </div>
          </div>
          <div className="w-full sm:w-auto flex justify-start sm:justify-end">
            <Button size="sm" variant="outline" onClick={() => setLocation('/client/tickets')}>
              Voltar para lista
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 order-2 lg:order-1 w-full overflow-x-hidden">
            <Tabs defaultValue="discussion">
              <TabsList className="grid grid-cols-2 w-full mb-4 text-xs sm:text-sm">
                <TabsTrigger value="discussion">Discussão</TabsTrigger>
                <TabsTrigger value="details">Detalhes</TabsTrigger>
              </TabsList>
              
              <TabsContent value="discussion" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2 sm:pb-4">
                    <CardTitle className="text-base sm:text-lg">Descrição Original</CardTitle>
                    <CardDescription className="text-xs sm:text-sm">
                      {formatDate(ticket.createdAt)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs sm:text-sm whitespace-pre-wrap break-words overflow-hidden">{ticket.description}</p>
                  </CardContent>
                </Card>
                
                {activities.length > 0 && (
                  <div className="space-y-3 sm:space-y-4">
                    {activities.map((activity) => (
                      <Card key={activity.id}>
                        <CardHeader className="py-2 sm:py-3">
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1">
                            <div className="font-medium text-xs sm:text-sm flex flex-wrap items-center">
                              {activity.userName || "Cliente"}
                              {activity.type === 'comment' && (
                                <span className="ml-1.5 sm:ml-2 text-gray-500 flex items-center">
                                  <MessageCircle className="h-3 w-3 mr-1 inline" />
                                  comentou
                                </span>
                              )}
                              {activity.type === 'status_change' && (
                                <span className="ml-1.5 sm:ml-2 text-blue-500 flex items-center">
                                  <Clock className="h-3 w-3 mr-1 inline" />
                                  alterou o status
                                </span>
                              )}
                              {activity.type === 'rate' && (
                                <span className="ml-1.5 sm:ml-2 text-yellow-500 flex items-center">
                                  <Star className="h-3 w-3 mr-1 inline fill-yellow-400" />
                                  avaliou o atendimento
                                </span>
                              )}
                            </div>
                            <span className="text-[0.65rem] sm:text-xs text-gray-500">
                              {formatDate(activity.createdAt)}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="py-2">
                          <p className="text-xs sm:text-sm whitespace-pre-wrap break-words overflow-hidden">{activity.content}</p>
                          
                          {/* Exibir anexos se existirem */}
                          {activity.attachments && activity.attachments.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium text-gray-600">Anexos:</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {activity.attachments.map((attachment, index) => (
                                  <div key={index} className="border rounded-lg p-2 bg-gray-50">
                                    <div className="flex items-center space-x-2">
                                      {attachment.startsWith('/uploads/') && (attachment.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) ? (
                                        <>
                                          <div className="flex-shrink-0">
                                            <img 
                                              src={attachment} 
                                              alt="Anexo" 
                                              className="w-8 h-8 rounded object-cover"
                                              onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                              }}
                                            />
                                          </div>
                                          <div className="flex-grow min-w-0">
                                            <a 
                                              href={attachment} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 hover:text-blue-800 truncate block"
                                            >
                                              {attachment.split('/').pop() || 'Imagem'}
                                            </a>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex-shrink-0">
                                            {attachment.match(/\.pdf$/i) ? (
                                              <FileText className="h-6 w-6 text-red-500" />
                                            ) : attachment.match(/\.(doc|docx)$/i) ? (
                                              <FileText className="h-6 w-6 text-blue-500" />
                                            ) : attachment.match(/\.(xls|xlsx)$/i) ? (
                                              <FileText className="h-6 w-6 text-green-500" />
                                            ) : (
                                              <FileText className="h-6 w-6 text-gray-500" />
                                            )}
                                          </div>
                                          <div className="flex-grow min-w-0">
                                            <a 
                                              href={attachment} 
                                              target="_blank" 
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 hover:text-blue-800 truncate block"
                                            >
                                              {attachment.split('/').pop() || 'Documento'}
                                            </a>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                
                {/* Formulário de resposta (apenas para tickets que não estão fechados/resolvidos) */}
                {isTicketOpen(ticket.status) && (
                  <Card>
                    <CardHeader className="pb-2 sm:pb-4">
                      <CardTitle className="text-base sm:text-lg flex items-center">
                        <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                        Adicionar resposta
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Envie uma resposta para este chamado
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        id="new-message-textarea"
                        placeholder="Digite sua mensagem aqui..."
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        rows={4}
                        className="mb-3 text-xs sm:text-sm"
                      />
                      
                      {/* Preview dos arquivos selecionados */}
                      {selectedFiles.length > 0 && (
                        <div className="mb-3 space-y-2">
                          <Label className="text-xs font-medium">Imagens selecionadas:</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {selectedFiles.map((file, index) => (
                              <div key={index} className="relative group">
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={`Preview ${index + 1}`}
                                  className="w-full h-20 object-cover rounded border"
                                />
                                <button
                                  onClick={() => removeFile(index)}
                                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 rounded-b truncate">
                                  {file.name}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Botão de upload */}
                      <div className="mb-3">
                        <input
                          id="file-upload"
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => document.getElementById('file-upload')?.click()}
                          className="text-xs sm:text-sm h-8 sm:h-9"
                        >
                          <Paperclip className="h-3 w-3 sm:h-4 sm:w-4 mr-1.5" />
                          Anexar Imagens
                        </Button>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between items-center pt-0 sm:pt-2">
                      <div className="text-xs text-muted-foreground">
                        {selectedFiles.length > 0 && (
                          <span>{selectedFiles.length} imagem(ns) selecionada(s)</span>
                        )}
                      </div>
                      <Button 
                        onClick={handleSendMessage} 
                        disabled={(!newMessage.trim() && selectedFiles.length === 0) || sendingMessage || uploadingFiles}
                        size="sm"
                        className="text-xs sm:text-sm h-8 sm:h-10"
                      >
                        {sendingMessage || uploadingFiles ? (
                          <>
                            <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-1.5 sm:mr-2"></div>
                            {uploadingFiles ? "Enviando..." : "Enviando..."}
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Enviar Resposta
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                )}
                
                {/* Formulário de avaliação (apenas para tickets resolvidos/fechados) */}
                {isTicketClosedOrResolved(ticket.status) && !ticket.rating && (
                  <Card className="border-yellow-400 shadow-lg">
                    <CardHeader className="bg-yellow-50 pb-2 sm:pb-4">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <Star className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500 fill-yellow-400" />
                        <div>
                          <CardTitle className="text-base sm:text-xl">Avaliar Atendimento</CardTitle>
                          <CardDescription className="text-xs sm:text-sm">
                            <strong>Sua avaliação é importante para nós!</strong> Ajude-nos a melhorar nosso atendimento.
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="mb-4 sm:mb-6">
                        <Label htmlFor="rating" className="text-sm sm:text-lg font-medium">Como você avalia o atendimento recebido?</Label>
                        <div className="flex space-x-1.5 sm:space-x-2 mt-2 sm:mt-3" id="rating">
                          {Array.from({ length: 5 }, (_, index) => (
                            <Star
                              key={index}
                              className={`h-6 w-6 sm:h-7 sm:w-7 cursor-pointer transition-colors ${
                                index < (rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                              }`}
                              onClick={() => rating !== index + 1 && setRating(index + 1)}
                            />
                          ))}
                        </div>
                      </div>
                      
                      <div className="mb-3 sm:mb-4">
                        <Label htmlFor="feedback" className="text-sm sm:text-base font-medium">Comentário (opcional)</Label>
                        <Textarea
                          id="feedback"
                          placeholder="Digite seu feedback sobre o atendimento..."
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          rows={3}
                          className="mt-1.5 sm:mt-2 border-yellow-200 focus:border-yellow-400 text-xs sm:text-sm"
                        />
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-end bg-yellow-50/50 pt-1 sm:pt-2">
                      <Button 
                        onClick={handleRateTicket} 
                        disabled={!rating || sendingRating}
                        className={!rating 
                          ? "w-full sm:w-auto opacity-70 text-xs sm:text-sm h-8 sm:h-10" 
                          : "w-full sm:w-auto bg-yellow-500 hover:bg-yellow-600 text-white text-xs sm:text-sm h-8 sm:h-10"
                        }
                      >
                        {sendingRating ? (
                          <>
                            <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-1.5 sm:mr-2"></div>
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Star className="h-4 w-4 sm:h-5 sm:w-5 mr-1.5 sm:mr-2 fill-white" />
                            Enviar Avaliação
                          </>
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                )}
                
                {/* Exibição da avaliação já feita */}
                {ticket.rating && (
                  <Card className="bg-green-50 border-green-200">
                    <CardHeader>
                      <CardTitle className="flex items-center">
                        <Award className="h-5 w-5 mr-2 text-yellow-500" />
                        Avaliação do Atendimento
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center mb-2">
                        <div className="flex space-x-1">
                          {Array.from({ length: 5 }, (_, index) => (
                            <Star
                              key={index}
                              className={`h-5 w-5 ${
                                index < (ticket.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="ml-2 font-medium">
                          {ticket.rating}/5
                        </span>
                      </div>
                      
                      {ticket.feedback && (
                        <div className="mt-2">
                          <Label className="text-sm text-gray-500">Seu comentário:</Label>
                          <p className="mt-1 text-gray-700 break-words overflow-hidden">{ticket.feedback}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
                
                {/* Botão para reabrir chamado (apenas se estiver resolvido/fechado) */}
                {isTicketClosedOrResolved(ticket.status) && (
                  <div className="pt-2">
                    <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <CornerUpLeft className="h-4 w-4 mr-2" />
                          Reabrir este chamado
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md w-[95vw] max-h-[90vh] overflow-auto">
                        <DialogHeader>
                          <DialogTitle>Reabrir chamado</DialogTitle>
                          <DialogDescription>
                            Por favor, informe o motivo da reabertura deste chamado.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <Textarea
                            placeholder="Explique por que você precisa reabrir este chamado..."
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            rows={4}
                            className="w-full min-h-[100px]"
                          />
                        </div>
                        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
                          <Button 
                            variant="secondary" 
                            onClick={() => setReopenDialogOpen(false)}
                            disabled={reopening}
                            className="w-full sm:w-auto"
                          >
                            Cancelar
                          </Button>
                          <Button 
                            onClick={handleReopenTicket} 
                            disabled={!reopenReason.trim() || reopening}
                            className="w-full sm:w-auto"
                          >
                            {reopening ? (
                              <>
                                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                Reabrindo...
                              </>
                            ) : (
                              <>
                                <CornerUpLeft className="h-4 w-4 mr-2" />
                                Reabrir Chamado
                              </>
                            )}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}
              </TabsContent>
              
              {/* Aba de detalhes */}
              <TabsContent value="details">
                <Card>
                  <CardHeader>
                    <CardTitle>Informações do Chamado</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">ID do Chamado</h3>
                        <p className="mt-1">{ticket.id}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Status</h3>
                        <p className="mt-1">{getStatusBadge(ticket.status)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Prioridade</h3>
                        <p className="mt-1">{getPriorityBadge(ticket.priority)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Categoria</h3>
                        <p className="mt-1">{ticket.category}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Criado em</h3>
                        <p className="mt-1">{formatDate(ticket.createdAt)}</p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Aberto por</h3>
                        <p className="mt-1">
                          {ticket.openedByName
                            ? ticket.openedByEmail
                              ? `${ticket.openedByName} (${ticket.openedByEmail})`
                              : ticket.openedByName
                            : <span className="text-gray-400 text-sm">—</span>}
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-500">Última atualização</h3>
                        <p className="mt-1">{formatDate(ticket.updatedAt)}</p>
                      </div>
                      {ticket.resolvedAt && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Resolvido em</h3>
                          <p className="mt-1">{formatDate(ticket.resolvedAt)}</p>
                        </div>
                      )}
                      {ticket.assignedUserName && (
                        <div>
                          <h3 className="text-sm font-medium text-gray-500">Atendente responsável</h3>
                          <p className="mt-1">{ticket.assignedUserName}</p>
                        </div>
                      )}
                    </div>
                    
                    <Separator className="my-4" />
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-2">Descrição</h3>
                      <p className="whitespace-pre-wrap break-words overflow-hidden">{ticket.description}</p>
                    </div>
                    
                    {ticket.resolutionNote && (
                      <>
                        <Separator className="my-4" />
                        <div>
                          <h3 className="text-sm font-medium text-gray-500 mb-2">Nota de resolução</h3>
                          <p className="whitespace-pre-wrap break-words overflow-hidden">{ticket.resolutionNote}</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
          
          {/* Coluna lateral */}
          <div className="space-y-6 order-1 lg:order-2 w-full">
            {/* Card do tempo de espera */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-blue-500" />
                  Tempo de Chamado
                </CardTitle>
              </CardHeader>
              <CardContent>
                {waitTime && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4 sm:gap-2">
                    <div className="flex justify-between items-center sm:flex-col sm:items-start lg:flex-row lg:items-center sm:space-y-1 lg:space-y-0">
                      <span className="text-sm text-gray-500">Dias em aberto:</span>
                      <Badge variant={waitTime.isResolved ? "outline" : "default"}>
                        {waitTime.days} {waitTime.days === 1 ? 'dia' : 'dias'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center sm:flex-col sm:items-start lg:flex-row lg:items-center sm:space-y-1 lg:space-y-0">
                      <span className="text-sm text-gray-500">Tempo total:</span>
                      <span className="font-medium">{waitTime.formattedTime}</span>
                    </div>
                    <div className="flex justify-between items-center sm:flex-col sm:items-start lg:flex-row lg:items-center pt-0 sm:pt-2 lg:pt-0 sm:space-y-1 lg:space-y-0">
                      <span className="text-sm text-gray-500">Estado:</span>
                      {waitTime.isResolved ? (
                        <Badge className="bg-green-500">Concluído</Badge>
                      ) : (
                        <Badge className="bg-amber-500">Em andamento</Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {/* Card de ações rápidas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2">
                  {isTicketOpen(ticket.status) && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start" 
                      onClick={() => {
                        document.getElementById('new-message-textarea')?.focus();
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Responder
                    </Button>
                  )}
                  
                  {isTicketClosedOrResolved(ticket.status) && !ticket.rating && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start text-yellow-600"
                      onClick={() => {
                        // Implementação simplificada: apenas rola até o elemento de avaliação
                        // sem tentar mudar de aba programaticamente
                        document.getElementById('rating')?.scrollIntoView({ 
                          behavior: 'smooth', 
                          block: 'center' 
                        });
                      }}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Avaliar atendimento
                    </Button>
                  )}
                  
                  {isTicketClosedOrResolved(ticket.status) && (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setReopenDialogOpen(true)}
                    >
                      <CornerUpLeft className="h-4 w-4 mr-2" />
                      Reabrir chamado
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => setLocation('/client/tickets')}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Voltar para lista
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Card de estado */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Estado do Chamado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-3">
                  <div className="flex flex-col sm:flex-row lg:flex-row justify-between items-start sm:items-center">
                    <span className="text-sm mb-1 sm:mb-0">Status:</span>
                    <div>{getStatusBadge(ticket.status)}</div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row lg:flex-row justify-between items-start sm:items-center">
                    <span className="text-sm mb-1 sm:mb-0">Prioridade:</span>
                    <div>{getPriorityBadge(ticket.priority)}</div>
                  </div>
                  
                  {ticket.rating && (
                    <div className="flex flex-col sm:flex-row lg:flex-row justify-between items-start sm:items-center">
                      <span className="text-sm mb-1 sm:mb-0">Avaliação:</span>
                      <div className="flex items-center">
                        <span className="mr-1">{ticket.rating}</span>
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}