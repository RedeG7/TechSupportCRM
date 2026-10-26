import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, FileImage, File, FileSpreadsheet, X } from "lucide-react";
import { InsertTicket } from "@shared/schema";

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateTicketModal({ isOpen, onClose }: CreateTicketModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("new");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("Suporte");
  const [clientId, setClientId] = useState<number | null>(null);
  const [clientContactId, setClientContactId] = useState<number | null>(null);
  const [clientContacts, setClientContacts] = useState<any[]>([]);
  const [fileAttachment, setFileAttachment] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();

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
  
  // Fetch current user information
  const { data: currentUser } = useQuery({
    queryKey: ["/api/users/1"], // Assumindo que o usuário admin tem ID 1
    queryFn: async () => {
      const response = await fetch("/api/users/1");
      if (!response.ok) throw new Error("Failed to fetch current user");
      return response.json();
    },
    enabled: isOpen,
  });

  // Fetch clients for dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
    enabled: isOpen,
  });
  
  // Fetch ticket categories
  const { data: categories = [] } = useQuery({
    queryKey: ["/api/ticket-categories"],
    queryFn: async () => {
      const response = await fetch("/api/ticket-categories");
      if (!response.ok) throw new Error("Failed to fetch ticket categories");
      console.log("Categories response:", await response.clone().json());
      return response.json();
    },
    enabled: isOpen,
  });

  // Função para carregar contatos do cliente selecionado
  const loadClientContacts = async (selectedClientId: number) => {
    setContactsLoaded(false);
    setClientContacts([]);
    setClientContactId(null);
    try {
      const response = await fetch(`/api/client-contacts?clientId=${selectedClientId}`);
      if (!response.ok) throw new Error("Failed to fetch client contacts");
      const contacts = await response.json();
      setClientContacts(contacts);
      // Auto-select first contact if only one exists
      if (contacts.length === 1) {
        setClientContactId(contacts[0].id);
      }
    } catch (error) {
      console.error("Error loading client contacts:", error);
      setClientContacts([]);
    } finally {
      setContactsLoaded(true);
    }
  };
  
  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setStatus("new");
      setPriority("medium");
      setCategory("");
      setClientId(null);
      setClientContactId(null);
      setClientContacts([]);
      setContactsLoaded(false);
      setFileAttachment(null);
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      
      // Set default category if available
      if (categories && categories.length > 0) {
        setCategory(categories[0].name);
      }
    }
  }, [isOpen, categories]);
  
  const createTicketMutation = useMutation({
    mutationFn: async (ticketData: Partial<InsertTicket>) => {
      if (fileAttachment) {
        // Cria FormData para envio de arquivo
        const formData = new FormData();
        formData.append('title', ticketData.title || '');
        formData.append('description', ticketData.description || '');
        formData.append('status', ticketData.status || 'new');
        formData.append('priority', ticketData.priority || 'medium');
        formData.append('category', ticketData.category || '');
        formData.append('clientId', ticketData.clientId?.toString() || '');
        formData.append('assignedTo', ticketData.assignedTo?.toString() || '1');
        if (clientContactId) {
          formData.append('contactId', clientContactId.toString());
        }
        formData.append('attachment', fileAttachment);

        const response = await fetch('/api/tickets/with-attachment', {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Erro ao criar chamado com anexo';
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            errorMessage = errorText || errorMessage;
          }
          throw new Error(errorMessage);
        }
        
        const responseText = await response.text();
        try {
          return JSON.parse(responseText);
        } catch (parseError) {
          console.error('Erro ao fazer parse da resposta:', parseError);
          console.error('Resposta recebida:', responseText);
          throw new Error('Resposta inválida do servidor');
        }
      } else {
        return apiRequest("POST", "/api/tickets", ticketData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({
        title: "Chamado criado",
        description: "O chamado foi criado com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao criar chamado: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  const handleCreateTicket = () => {
    if (!title.trim()) {
      toast({
        title: "Erro",
        description: "O título do chamado não pode estar vazio.",
        variant: "destructive",
      });
      return;
    }
    
    if (!description.trim()) {
      toast({
        title: "Erro",
        description: "A descrição do chamado não pode estar vazia.",
        variant: "destructive",
      });
      return;
    }
    
    if (!clientId) {
      toast({
        title: "Erro",
        description: "Por favor, selecione um cliente.",
        variant: "destructive",
      });
      return;
    }

    if (clientContacts.length > 0 && !clientContactId) {
      toast({
        title: "Erro",
        description: "Por favor, selecione o contato do cliente que está criando o chamado.",
        variant: "destructive",
      });
      return;
    }
    
    createTicketMutation.mutate({
      title,
      description,
      status,
      priority,
      category,
      clientId,
      assignedTo: currentUser?.id || 1,
      contactId: clientContactId || null,
    } as any);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-neutral-700">
            Criar Novo Chamado
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 gap-4 mt-4">
          <div>
            <Label htmlFor="client">Cliente</Label>
            <Select onValueChange={(value) => {
              const selectedClientId = Number(value);
              setClientId(selectedClientId);
              loadClientContacts(selectedClientId);
            }}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client: any) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.businessName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campo de seleção de contato do cliente como "Criado por" */}
          <div>
            <Label htmlFor="createdBy">Criado por</Label>
            {!clientId ? (
              <div className="w-full p-2 border rounded-md bg-gray-50 text-gray-700 text-sm">
                {currentUser ? `${currentUser.name} (Suporte)` : 'Carregando...'}
              </div>
            ) : !contactsLoaded ? (
              <div className="w-full p-2 border rounded-md bg-gray-50 text-gray-500 text-sm">
                Carregando contatos...
              </div>
            ) : clientContacts.length > 0 ? (
              <Select
                value={clientContactId?.toString() || ""}
                onValueChange={(value) => setClientContactId(Number(value))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o contato do cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientContacts.map((contact: any) => (
                    <SelectItem key={contact.id} value={contact.id.toString()}>
                      {contact.name}{contact.email ? ` (${contact.email})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="w-full p-2 border rounded-md bg-gray-50 text-gray-500 text-sm">
                Nenhum contato cadastrado para este cliente
              </div>
            )}
          </div>
          
          <div>
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do chamado"
            />
          </div>
          
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva em detalhes o problema ou solicitação"
              className="h-24"
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="category">Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories && categories.length > 0 ? (
                    categories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="Sem Categoria">Sem Categoria</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Novo</SelectItem>
                  <SelectItem value="in_progress">Em Progresso</SelectItem>
                  <SelectItem value="waiting_client">Aguardando Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="priority">Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="low">Baixa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-4">
            <Label htmlFor="admin-attachment">Anexo (opcional)</Label>
            <div className="mt-1.5">
              {!fileAttachment ? (
                <div className="flex items-center">
                  <Input
                    id="admin-attachment"
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.bmp,.webp,.doc,.docx,.xls,.xlsx,.txt,.rtf"
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
              Formatos aceitos: PDF, imagens (JPG, PNG, GIF, BMP, WebP), documentos (DOC, DOCX, XLS, XLSX, TXT, RTF). Tamanho máximo: 5MB.
            </p>
          </div>
        </div>
        
        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleCreateTicket} 
            disabled={createTicketMutation.isPending}
          >
            {createTicketMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Chamado"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}