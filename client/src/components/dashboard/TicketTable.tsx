import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import type { Ticket } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import TicketModal from "../tickets/TicketModal";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Upload, File, FileText, FileImage, X, ChevronUp, ChevronDown, Calendar } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type TicketStatusProps = {
  status: string;
};

const TicketStatus = ({ status }: TicketStatusProps) => {
  let bgColor = "";
  let textColor = "";
  let label = "";

  switch (status) {
    case "new":
      bgColor = "bg-blue-100";
      textColor = "text-blue-800";
      label = "Novo";
      break;
    case "in_progress":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-800";
      label = "Em Progresso";
      break;
    case "waiting_client":
      bgColor = "bg-purple-100";
      textColor = "text-purple-800";
      label = "Aguardando Cliente";
      break;
    case "resolved":
      bgColor = "bg-green-100";
      textColor = "text-green-800";
      label = "Resolvido";
      break;
    case "closed":
      bgColor = "bg-neutral-100";
      textColor = "text-neutral-800";
      label = "Fechado";
      break;
    case "cancelled":
      bgColor = "bg-red-100";
      textColor = "text-red-800";
      label = "Cancelado";
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-800";
      label = status;
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
};

type TicketPriorityProps = {
  priority: string;
};

const TicketPriority = ({ priority }: TicketPriorityProps) => {
  let bgColor = "";
  let textColor = "";
  let label = "";

  switch (priority) {
    case "low":
      bgColor = "bg-green-100";
      textColor = "text-green-800";
      label = "Baixa";
      break;
    case "medium":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-800";
      label = "Média";
      break;
    case "high":
      bgColor = "bg-red-100";
      textColor = "text-red-800";
      label = "Alta";
      break;
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-800";
      label = priority;
  }

  return (
    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${bgColor} ${textColor}`}>
      {label}
    </span>
  );
};

export default function TicketTable({ 
  limit, 
  statusFilter, 
  priorityFilter, 
  searchTerm 
}: { 
  limit?: number,
  statusFilter?: string,
  priorityFilter?: string,
  searchTerm?: string
}) {
  const { toast } = useToast();
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null);
  const [ticketToClose, setTicketToClose] = useState<number | null>(null);
  const [ticketToCancel, setTicketToCancel] = useState<number | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [cancellationNote, setCancellationNote] = useState("");
  const [resolutionFile, setResolutionFile] = useState<File | null>(null);
  const [resolutionDate, setResolutionDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  
  // Estados para ordenação
  const [sortField, setSortField] = useState<string>('default');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["/api/tickets"],
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  
  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
  });
  
  // Mutação para finalizar chamado
  const closeTicketMutation = useMutation({
    mutationFn: async (params: { id: number, resolutionNote: string, resolvedAt?: string }) => {
      return apiRequest("POST", `/api/tickets/${params.id}/close`, {
        resolutionNote: params.resolutionNote,
        resolvedAt: params.resolvedAt,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Chamado finalizado",
        description: "O chamado foi finalizado com sucesso.",
      });
      setTicketToClose(null);
      setResolutionNote("");
      setResolutionDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao finalizar chamado: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  // Mutação para finalizar chamado com anexo
  const closeTicketWithAttachmentMutation = useMutation({
    mutationFn: async (params: { id: number, formData: FormData }) => {
      const response = await fetch(`/api/tickets/${params.id}/close-with-attachment`, {
        method: "POST",
        body: params.formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || 'Erro ao finalizar chamado');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Chamado finalizado",
        description: "O chamado foi finalizado com sucesso.",
      });
      setTicketToClose(null);
      setResolutionNote("");
      setResolutionFile(null);
      setResolutionDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao finalizar chamado: ${error}`,
        variant: "destructive",
      });
    },
  });

  // Mutação para cancelar chamado
  const cancelTicketMutation = useMutation({
    mutationFn: async (params: { id: number, cancellationNote: string }) => {
      return apiRequest("POST", `/api/tickets/${params.id}/cancel`, {
        cancellationNote: params.cancellationNote,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Chamado cancelado",
        description: "O chamado foi cancelado com sucesso.",
      });
      setTicketToCancel(null);
      setCancellationNote("");
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao cancelar chamado: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  const getClientName = (clientId: number) => {
    const client = clients.find((c: any) => c.id === clientId);
    return client ? client.businessName : "Cliente desconhecido";
  };
  
  const formatOpenTime = (createdAt: string) => {
    return formatDistanceToNow(new Date(createdAt), { locale: ptBR });
  };

  // Função para manipular clique no cabeçalho da coluna
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Função para ordenar os tickets
  const sortTickets = (ticketsToSort: Ticket[]) => {
    return [...ticketsToSort].sort((a, b) => {
      // Primeiro, ordenar por status - chamados ativos sempre no topo
      const closedStatuses = ['resolved', 'cancelled', 'closed', 'resolvido', 'cancelado', 'fechado'];
      const aIsActive = !closedStatuses.includes(a.status);
      const bIsActive = !closedStatuses.includes(b.status);
      
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      
      // Se ambos têm o mesmo tipo de status (ativo/inativo), aplicar ordenação personalizada
      if (sortField === 'default') {
        // Para ordenação padrão, dentro do mesmo grupo de status, ordenar por data de criação (mais recente primeiro)
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      // Aplicar ordenação por campo específico
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'id':
          aValue = a.id;
          bValue = b.id;
          break;
        case 'client':
          aValue = getClientName(a.clientId).toLowerCase();
          bValue = getClientName(b.clientId).toLowerCase();
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'priority':
          aValue = a.priority;
          bValue = b.priority;
          break;
        case 'createdAt':
          aValue = new Date(a.createdAt);
          bValue = new Date(b.createdAt);
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortDirection === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };
  
  const filteredTickets = tickets.filter((ticket: Ticket) => {
    let matchesStatus = true;
    let matchesPriority = true;
    let matchesSearch = true;
    
    // Apply status filter
    if (statusFilter && statusFilter !== "all") {
      matchesStatus = ticket.status === statusFilter;
    }
    
    // Apply priority filter
    if (priorityFilter && priorityFilter !== "all") {
      matchesPriority = ticket.priority === priorityFilter;
    }
    
    // Apply search term
    if (searchTerm) {
      const client = clients.find((c: any) => c.id === ticket.clientId);
      const clientName = client ? client.businessName : "";
      const search = searchTerm.toLowerCase();
      
      matchesSearch = (
        ticket.title.toLowerCase().includes(search) ||
        clientName.toLowerCase().includes(search) ||
        ticket.description.toLowerCase().includes(search)
      );
    }
    
    return matchesStatus && matchesPriority && matchesSearch;
  });
  
  // Aplicar ordenação aos tickets filtrados
  const sortedTickets = sortTickets(filteredTickets);
  
  const displayedTickets = limit ? sortedTickets.slice(0, limit) : sortedTickets;
  
  if (isLoading) {
    return <div className="p-4 text-center">Carregando...</div>;
  }
  
  // Componente para cabeçalho clicável
  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isActive = sortField === field;
    const isAsc = sortDirection === 'asc';
    
    return (
      <th 
        className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider cursor-pointer hover:bg-neutral-200 dark:hover:bg-neutral-700 select-none"
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center space-x-1">
          <span>{children}</span>
          {isActive && (
            isAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          )}
        </div>
      </th>
    );
  };

  return (
    <>
      <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin" style={{ scrollbarWidth: 'thin' }}>
        <table className="w-full">
          <thead className="bg-neutral-100 dark:bg-neutral-800">
            <tr>
              <SortableHeader field="id">ID</SortableHeader>
              <SortableHeader field="client">Cliente</SortableHeader>
              <SortableHeader field="title">Título</SortableHeader>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Criado por</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Responsável</th>
              <SortableHeader field="status">Status</SortableHeader>
              <SortableHeader field="priority">Prioridade</SortableHeader>
              <SortableHeader field="createdAt">Aberto em</SortableHeader>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">Tempo Aberto</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
                <button
                  onClick={() => {
                    setSortField('default');
                    setSortDirection('asc');
                  }}
                  className="text-xs text-primary hover:text-blue-700"
                  title="Resetar ordenação"
                >
                  Resetar
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-neutral-900 divide-y divide-neutral-200 dark:divide-neutral-700">
            {displayedTickets.map((ticket: Ticket) => (
              <tr key={ticket.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900 dark:text-neutral-100">#{ticket.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                  {getClientName(ticket.clientId)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">{ticket.title}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                  {(ticket as any).createdByContactName
                    ? (ticket as any).createdByContactName
                    : (ticket as any).openedByName
                      ? (ticket as any).openedByName
                      : <span className="text-neutral-300 dark:text-neutral-600">—</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500 dark:text-neutral-400">
                  {(ticket as any).assignedUserName && (ticket as any).assignedUserName !== 'Não atribuído'
                    ? (ticket as any).assignedUserName
                    : <span className="text-neutral-300 dark:text-neutral-600">—</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TicketStatus status={ticket.status} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <TicketPriority priority={ticket.priority} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                  {format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm")}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                  {formatOpenTime(ticket.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium flex space-x-3 justify-end items-center">
                  <button
                    onClick={() => setSelectedTicket(ticket.id)}
                    className="text-primary hover:text-blue-900"
                  >
                    Ver
                  </button>
                  
                  {/* Só mostrar botão de finalizar para chamados que não estejam fechados ou cancelados */}
                  {!["closed", "cancelled"].includes(ticket.status) && (
                    <Button 
                      size="sm"
                      variant="outline"
                      className="text-green-700 border-green-200 hover:bg-green-50 hover:text-green-800"
                      onClick={() => {
                        setTicketToClose(ticket.id);
                        setResolutionDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
                      }}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Finalizar
                    </Button>
                  )}
                  
                  {/* Só mostrar botão de cancelar para chamados que não estejam fechados ou cancelados */}
                  {!["closed", "cancelled"].includes(ticket.status) && (
                    <Button 
                      size="sm"
                      variant="outline"
                      className="text-red-700 border-red-200 hover:bg-red-50 hover:text-red-800"
                      onClick={() => setTicketToCancel(ticket.id)}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Cancelar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {selectedTicket && (
        <TicketModal
          ticketId={selectedTicket}
          isOpen={!!selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
      
      {/* Modal para finalizar chamado */}
      <Dialog open={!!ticketToClose} onOpenChange={(open) => !open && setTicketToClose(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar Chamado</DialogTitle>
            <DialogDescription>
              Descreva a solução aplicada para o chamado. Esta informação será enviada ao cliente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4 space-y-4">
            <div>
              <Label htmlFor="resolutionNote">Solução aplicada</Label>
              <Textarea
                id="resolutionNote"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                className="h-32"
                placeholder="Descreva a solução aplicada..."
              />
            </div>
            
            <div>
              <Label htmlFor="resolutionDate" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Data de finalização
              </Label>
              <Input
                id="resolutionDate"
                type="datetime-local"
                value={resolutionDate}
                onChange={(e) => setResolutionDate(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Informe a data e hora em que o chamado foi efetivamente resolvido.
              </p>
            </div>
            
            <div>
              <Label htmlFor="resolutionFile">Anexo (opcional)</Label>
              <div className="mt-2">
                <Input
                  id="resolutionFile"
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast({
                          title: "Erro",
                          description: "O arquivo deve ter no máximo 5MB.",
                          variant: "destructive",
                        });
                        e.target.value = "";
                        return;
                      }
                      setResolutionFile(file);
                    } else {
                      setResolutionFile(null);
                    }
                  }}
                  className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {resolutionFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    {resolutionFile.type.startsWith('image/') ? (
                      <FileImage className="h-4 w-4" />
                    ) : resolutionFile.type === 'application/pdf' ? (
                      <File className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span>{resolutionFile.name}</span>
                    <span className="text-gray-400">({Math.round(resolutionFile.size / 1024)} KB)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setResolutionFile(null)}
                      className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, TXT, RTF, JPG, PNG, GIF, BMP, WebP (máx. 5MB)
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setTicketToClose(null);
                setResolutionNote("");
                setResolutionFile(null);
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (resolutionNote.trim()) {
                  if (resolutionFile) {
                    const formData = new FormData();
                    formData.append('resolutionNote', resolutionNote);
                    formData.append('attachment', resolutionFile);
                    if (resolutionDate) {
                      formData.append('resolvedAt', new Date(resolutionDate).toISOString());
                    }
                    
                    closeTicketWithAttachmentMutation.mutate({
                      id: ticketToClose!,
                      formData
                    });
                  } else {
                    closeTicketMutation.mutate({
                      id: ticketToClose!,
                      resolutionNote,
                      resolvedAt: resolutionDate ? new Date(resolutionDate).toISOString() : undefined
                    });
                  }
                } else {
                  toast({
                    title: "Erro",
                    description: "Por favor, descreva a solução aplicada.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={closeTicketMutation.isPending || closeTicketWithAttachmentMutation.isPending}
            >
              {closeTicketMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Finalizar Chamado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Modal para cancelar chamado */}
      <Dialog open={!!ticketToCancel} onOpenChange={(open) => !open && setTicketToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Chamado</DialogTitle>
            <DialogDescription>
              Descreva o motivo para o cancelamento do chamado. Esta informação será enviada ao cliente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <Textarea
              value={cancellationNote}
              onChange={(e) => setCancellationNote(e.target.value)}
              className="h-32"
              placeholder="Descreva o motivo do cancelamento..."
            />
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setTicketToCancel(null);
                setCancellationNote("");
              }}
            >
              Voltar
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (cancellationNote.trim()) {
                  cancelTicketMutation.mutate({
                    id: ticketToCancel!,
                    cancellationNote
                  });
                } else {
                  toast({
                    title: "Erro",
                    description: "Por favor, descreva o motivo do cancelamento.",
                    variant: "destructive",
                  });
                }
              }}
              disabled={cancelTicketMutation.isPending}
            >
              {cancelTicketMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Cancelar Chamado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
