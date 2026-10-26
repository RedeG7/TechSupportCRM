import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, Search, Send, RefreshCw, QrCode, MessageCircle, 
  Plus, User, Clock, Headphones, CheckCircle, Phone,
  Play, Square, Ticket, Star, Users, MessageSquarePlus
} from "lucide-react";

interface WhatsAppContact {
  id: string;
  name: string;
  number: string;
  profilePictureUrl: string | null;
  lastMessageTime: number;
  unreadCount: number;
  status?: string;
  conversationId?: number | null;
}

interface Conversation {
  id: number;
  phone_number: string;
  contact_name: string | null;
  status: string;
  attendant_id: number | null;
  client_id: number | null;
  ticket_id: number | null;
  last_message_at: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface ChatMessage {
  id: string;
  remoteJid: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  contactName: string;
}

export default function WhatsAppContacts() {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState("aguardando");
  const [status, setStatus] = useState<{ isInitialized: boolean; connectionStatus: string; hasQrCode: boolean; totalContacts?: number; totalMessages?: number }>({ 
    isInitialized: false, 
    connectionStatus: 'disconnected',
    hasQrCode: false
  });
  const [contacts, setContacts] = useState<WhatsAppContact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [filteredConversations, setFilteredConversations] = useState<Conversation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQrCode, setShowQrCode] = useState(false);
  const [newContactNumber, setNewContactNumber] = useState("");
  const [showNewContact, setShowNewContact] = useState(false);
  const [showFinishDialog, setShowFinishDialog] = useState(false);
  const [finishRating, setFinishRating] = useState<number>(0);
  const [finishComment, setFinishComment] = useState("");
  const [sendFarewellMessage, setSendFarewellMessage] = useState(true);
  const [finishingConversation, setFinishingConversation] = useState(false);

  // Aba do painel esquerdo: conversas ou contatos
  const [leftPanel, setLeftPanel] = useState<"conversas" | "contatos">("conversas");
  const [waContacts, setWaContacts] = useState<WhatsAppContact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [startingFromContact, setStartingFromContact] = useState<string | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchConversations();
    fetchWaContacts();
    const interval = setInterval(() => {
      fetchStatus();
      if (status.connectionStatus === 'connected') {
        fetchConversations();
        if (selectedConversation) {
          loadConversationMessages(selectedConversation.id, false);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedConversation?.id, status.connectionStatus]);

  useEffect(() => {
    filterConversations();
  }, [searchTerm, conversations, activeTab]);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const fetchStatus = async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/status");
      const data = await response.json();
      setStatus(data);
      
      if (data.hasQrCode) {
        fetchQrCode();
      }
    } catch (error) {
      console.error("Erro ao obter status do WhatsApp:", error);
    }
  };

  const fetchQrCode = async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/qrcode");
      if (response.ok) {
        const data = await response.json();
        setQrCode(data.qrCode);
        if (data.qrCode) {
          setShowQrCode(true);
        }
      }
    } catch (error) {
      console.error("Erro ao obter QR code:", error);
    }
  };

  const initializeWhatsApp = async () => {
    setLoading(true);
    try {
      const response = await apiRequest("POST", "/api/whatsapp/initialize");
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sucesso",
          description: "WhatsApp inicializado. Escaneie o QR Code se solicitado.",
        });
        setTimeout(fetchQrCode, 2000);
        fetchStatus();
      } else {
        toast({
          title: "Erro",
          description: data.message || "Não foi possível inicializar o WhatsApp",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao inicializar WhatsApp:", error);
      toast({
        title: "Erro",
        description: "Não foi possível inicializar o WhatsApp",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWaContacts = async (showSpinner = false) => {
    if (showSpinner) setSyncingContacts(true);
    try {
      const response = await apiRequest("GET", "/api/whatsapp/contacts");
      if (response.ok) {
        const data = await response.json();
        setWaContacts(data.contacts || []);
      }
    } catch (error) {
      console.error("Erro ao buscar contatos:", error);
    } finally {
      if (showSpinner) setSyncingContacts(false);
    }
  };

  const startChatFromContact = async (contact: WhatsAppContact) => {
    // Se já tem conversa, abre diretamente
    if (contact.conversationId) {
      const conv = conversations.find(c => c.id === contact.conversationId);
      if (conv) {
        setLeftPanel("conversas");
        selectConversation(conv);
        return;
      }
    }
    setStartingFromContact(contact.id);
    try {
      const response = await apiRequest("POST", "/api/whatsapp/message", {
        to: contact.number,
        message: "Olá! Como posso ajudar?"
      });
      if (response.ok) {
        toast({ title: "Conversa iniciada", description: `Nova conversa com ${contact.name}` });
        setLeftPanel("conversas");
        setTimeout(() => fetchConversations(), 1200);
        setTimeout(() => fetchWaContacts(), 1200);
      } else {
        const err = await response.json();
        toast({ title: "Erro", description: err.message || "Não foi possível iniciar a conversa", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível iniciar a conversa", variant: "destructive" });
    } finally {
      setStartingFromContact(null);
    }
  };

  const filteredWaContacts = waContacts.filter(c => {
    if (!contactSearch) return true;
    const term = contactSearch.toLowerCase();
    return c.name.toLowerCase().includes(term) || c.number.includes(term);
  });

  const fetchConversations = async () => {
    try {
      const response = await apiRequest("GET", "/api/whatsapp/conversations");
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
        if (loading) setLoading(false);
      }
    } catch (error) {
      console.error("Erro ao buscar conversas:", error);
      if (loading) setLoading(false);
    }
  };

  const filterConversations = () => {
    let filtered = conversations;
    
    if (activeTab !== "todos") {
      filtered = conversations.filter(conv => conv.status === activeTab);
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        conv =>
          (conv.contact_name?.toLowerCase().includes(term)) ||
          conv.phone_number.includes(term)
      );
    }
    
    setFilteredConversations(filtered);
  };

  const loadConversationMessages = async (conversationId: number, showLoader = true) => {
    if (showLoader) setLoadingMessages(true);
    
    try {
      const response = await apiRequest("GET", `/api/whatsapp/conversations/${conversationId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setChatMessages(data.messages || []);
      }
    } catch (error) {
      console.error("Erro ao buscar mensagens:", error);
    } finally {
      if (showLoader) setLoadingMessages(false);
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setSelectedConversation(conv);
    await loadConversationMessages(conv.id);
  };

  const startNewChat = async () => {
    if (!newContactNumber.trim()) return;
    
    const cleanNumber = newContactNumber.replace(/\D/g, '');
    
    try {
      const response = await apiRequest("POST", "/api/whatsapp/message", {
        to: cleanNumber,
        message: "Olá! Como posso ajudar?"
      });
      
      if (response.ok) {
        toast({
          title: "Sucesso",
          description: "Nova conversa iniciada",
        });
        setNewContactNumber("");
        setShowNewContact(false);
        setTimeout(() => {
          fetchConversations();
        }, 1000);
      }
    } catch (error) {
      console.error("Erro ao iniciar conversa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível iniciar a conversa",
        variant: "destructive",
      });
    }
  };

  const startAttending = async () => {
    if (!selectedConversation) return;
    
    try {
      const response = await apiRequest("POST", `/api/whatsapp/conversations/${selectedConversation.id}/start`);
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Sucesso",
          description: "Atendimento iniciado",
        });
        fetchConversations();
        setSelectedConversation({ ...selectedConversation, status: 'atendendo' });
      }
    } catch (error) {
      console.error("Erro ao iniciar atendimento:", error);
      toast({
        title: "Erro",
        description: "Não foi possível iniciar o atendimento",
        variant: "destructive",
      });
    }
  };

  const openFinishDialog = () => {
    setFinishRating(0);
    setFinishComment("");
    setSendFarewellMessage(true);
    setShowFinishDialog(true);
  };

  const finishConversation = async () => {
    if (!selectedConversation) return;
    
    setFinishingConversation(true);
    
    try {
      const response = await apiRequest("POST", `/api/whatsapp/conversations/${selectedConversation.id}/finish`, {
        sendFarewellMessage,
        clientName: selectedConversation.contact_name,
        rating: finishRating > 0 ? finishRating : undefined,
        comment: finishComment || undefined
      });
      const data = await response.json();
      
      if (data.success) {
        const hasLinkedTicket = !!selectedConversation.ticket_id;
        let description = "Atendimento finalizado com sucesso.";
        if (hasLinkedTicket) {
          description += data.ratingLinkSent
            ? " ⭐ Link de avaliação enviado ao cliente pelo WhatsApp."
            : data.ratingLinkWarning
            ? ` Aviso: ${data.ratingLinkWarning}`
            : "";
        }
        toast({ title: "Atendimento finalizado", description });
        fetchConversations();
        setSelectedConversation({ ...selectedConversation, status: 'finalizado' });
        setShowFinishDialog(false);
      }
    } catch (error) {
      console.error("Erro ao finalizar conversa:", error);
      toast({
        title: "Erro",
        description: "Não foi possível finalizar a conversa",
        variant: "destructive",
      });
    } finally {
      setFinishingConversation(false);
    }
  };

  const sendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;
    
    setSendingMessage(true);
    
    try {
      const response = await apiRequest("POST", "/api/whatsapp/message", {
        to: selectedConversation.phone_number,
        message: newMessage.trim()
      });
      
      if (response.ok) {
        const newMsg: ChatMessage = {
          id: `local-${Date.now()}`,
          remoteJid: `${selectedConversation.phone_number}@s.whatsapp.net`,
          body: newMessage.trim(),
          fromMe: true,
          timestamp: Date.now(),
          contactName: 'Você'
        };
        
        setChatMessages(prev => [...prev, newMsg]);
        setNewMessage("");
        
        toast({
          title: "Sucesso",
          description: "Mensagem enviada com sucesso",
        });
        
        setTimeout(() => fetchConversations(), 1000);
      } else {
        const error = await response.json();
        toast({
          title: "Erro",
          description: error.message || "Não foi possível enviar a mensagem",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      toast({
        title: "Erro",
        description: "Não foi possível enviar a mensagem",
        variant: "destructive",
      });
    } finally {
      setSendingMessage(false);
    }
  };

  const formatTimestamp = (timestamp: number | string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatLastSeen = (timestamp: string | null) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aguardando':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />Aguardando</Badge>;
      case 'atendendo':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Headphones className="h-3 w-3 mr-1" />Atendendo</Badge>;
      case 'finalizado':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />Finalizado</Badge>;
      default:
        return null;
    }
  };

  const getTabCounts = () => {
    const counts = {
      aguardando: conversations.filter(c => c.status === 'aguardando').length,
      atendendo: conversations.filter(c => c.status === 'atendendo').length,
      finalizado: conversations.filter(c => c.status === 'finalizado').length,
      todos: conversations.length
    };
    return counts;
  };

  const tabCounts = getTabCounts();

  return (
    <div className="p-6 h-[calc(100vh-80px)]">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-semibold text-neutral-700">Chat WhatsApp</h2>
          <p className="text-sm text-muted-foreground">
            {status.connectionStatus === 'connected'
              ? `${conversations.length} conversa${conversations.length !== 1 ? 's' : ''}`
              : 'Conecte-se ao WhatsApp para começar'}
          </p>
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchConversations(); fetchStatus(); }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {status.connectionStatus !== 'connected' && (
            <Button
              size="sm"
              onClick={initializeWhatsApp}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
              Conectar WhatsApp
            </Button>
          )}
        </div>
      </div>

      {status.hasQrCode && showQrCode && qrCode && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-col items-center">
              <p className="text-sm text-muted-foreground mb-4">
                Escaneie o QR Code com seu WhatsApp para conectar
              </p>
              <img src={qrCode} alt="QR Code WhatsApp" className="max-w-[256px]" />
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowQrCode(false)}>
                Ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100%-100px)]">
        <Card className="md:col-span-1 flex flex-col">
          <CardHeader className="pb-2 space-y-3">
            {/* Toggle Conversas / Contatos */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => setLeftPanel("conversas")}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-md transition-all ${
                  leftPanel === "conversas"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Conversas
                {tabCounts.todos > 0 && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${leftPanel === "conversas" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"}`}>
                    {tabCounts.todos}
                  </span>
                )}
              </button>
              <button
                onClick={() => { setLeftPanel("contatos"); fetchWaContacts(true); }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-2 rounded-md transition-all ${
                  leftPanel === "contatos"
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                Contatos
                {waContacts.length > 0 && (
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${leftPanel === "contatos" ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"}`}>
                    {waContacts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Painel Conversas — controles */}
            {leftPanel === "conversas" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar conversa..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 text-sm h-8"
                    />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => setShowNewContact(!showNewContact)} title="Nova conversa">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {showNewContact && (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex: 5511999999999"
                      value={newContactNumber}
                      onChange={(e) => setNewContactNumber(e.target.value)}
                      className="text-sm h-8"
                    />
                    <Button size="sm" className="h-8 px-3" onClick={startNewChat}>
                      <Send className="h-3 w-3" />
                    </Button>
                  </div>
                )}

                <div className="flex gap-1 flex-wrap">
                  {[
                    { value: "todos", label: "Todas", count: tabCounts.todos },
                    { value: "aguardando", label: "Aguardando", count: tabCounts.aguardando },
                    { value: "atendendo", label: "Em atendimento", count: tabCounts.atendendo },
                    { value: "finalizado", label: "Finalizadas", count: tabCounts.finalizado },
                  ].map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => setActiveTab(value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        activeTab === value
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {label}
                      {count > 0 && (
                        <span className={`ml-1 font-semibold ${activeTab === value ? "text-primary-foreground" : "text-foreground"}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Painel Contatos — busca + sync */}
            {leftPanel === "contatos" && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato ou número..."
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    className="pl-8 text-sm h-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => fetchWaContacts(true)}
                  title="Sincronizar contatos"
                  disabled={syncingContacts}
                >
                  <RefreshCw className={`h-4 w-4 ${syncingContacts ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            )}
          </CardHeader>
          
          <CardContent className="flex-1 overflow-hidden p-0">
            <ScrollArea className="h-full">

              {/* Lista de Conversas */}
              {leftPanel === "conversas" && (
                loading && conversations.length === 0 ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredConversations.length === 0 ? (
                  <div className="text-center py-8 px-4 text-muted-foreground text-sm">
                    {conversations.length === 0
                      ? status.connectionStatus === 'connected'
                        ? "Nenhuma conversa ainda. Envie uma mensagem para começar!"
                        : "Conecte ao WhatsApp para ver suas conversas"
                      : "Nenhuma conversa encontrada nesta aba"}
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredConversations.map((conv) => (
                      <div
                        key={conv.id}
                        className={`p-3 flex items-center space-x-3 cursor-pointer hover:bg-muted transition ${
                          selectedConversation?.id === conv.id ? "bg-muted" : ""
                        }`}
                        onClick={() => selectConversation(conv)}
                      >
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            <User className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium truncate text-sm">
                              {conv.contact_name || conv.phone_number}
                            </p>
                            {conv.last_message_at && (
                              <span className="text-xs text-muted-foreground">
                                {formatLastSeen(conv.last_message_at)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <p className="text-xs text-muted-foreground truncate flex-1">
                              {conv.phone_number}
                            </p>
                            {getStatusBadge(conv.status)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Lista de Contatos */}
              {leftPanel === "contatos" && (
                syncingContacts && waContacts.length === 0 ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredWaContacts.length === 0 ? (
                  <div className="text-center py-10 px-4 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium mb-1">
                      {contactSearch ? "Nenhum contato encontrado" : "Nenhum contato sincronizado"}
                    </p>
                    <p className="text-xs">
                      {status.connectionStatus === 'connected'
                        ? "Os contatos aparecerão aqui conforme forem trocando mensagens"
                        : "Conecte ao WhatsApp para sincronizar contatos"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {filteredWaContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3 flex items-center space-x-3 hover:bg-muted transition group"
                      >
                        <Avatar className="h-10 w-10 flex-shrink-0">
                          {contact.profilePictureUrl ? (
                            <AvatarImage src={contact.profilePictureUrl} alt={contact.name} />
                          ) : null}
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {contact.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{contact.name}</p>
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            +{contact.number}
                          </p>
                          {contact.conversationId && (
                            <Badge variant="outline" className="text-[10px] mt-0.5 py-0 h-4 px-1.5 text-blue-600 border-blue-200 bg-blue-50">
                              Conversa ativa
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant={contact.conversationId ? "outline" : "default"}
                          className="h-8 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startChatFromContact(contact)}
                          disabled={startingFromContact === contact.id}
                          title={contact.conversationId ? "Abrir conversa" : "Iniciar conversa"}
                        >
                          {startingFromContact === contact.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MessageSquarePlus className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )
              )}

            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 flex flex-col">
          {selectedConversation ? (
            <>
              <CardHeader className="pb-2 border-b flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary">
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{selectedConversation.contact_name || selectedConversation.phone_number}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-muted-foreground">{selectedConversation.phone_number}</p>
                        {getStatusBadge(selectedConversation.status)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {selectedConversation.status === 'aguardando' && (
                      <Button size="sm" variant="default" onClick={startAttending}>
                        <Play className="h-4 w-4 mr-1" />
                        Iniciar Atendimento
                      </Button>
                    )}
                    {selectedConversation.status === 'atendendo' && (
                      <Button size="sm" variant="outline" onClick={openFinishDialog}>
                        <Square className="h-4 w-4 mr-1" />
                        Finalizar
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => loadConversationMessages(selectedConversation.id)}>
                      <RefreshCw className={`h-4 w-4 ${loadingMessages ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-hidden p-0" style={{ minHeight: "400px", maxHeight: "calc(100vh - 320px)" }}>
                <ScrollArea className="h-full p-4" style={{ height: "100%" }}>
                  {loadingMessages ? (
                    <div className="flex justify-center items-center h-40">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : chatMessages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Nenhuma mensagem ainda. Envie uma mensagem para começar!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {chatMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[75%] p-3 rounded-lg ${
                              message.fromMe
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {message.body}
                            </p>
                            <p
                              className={`text-xs mt-1 text-right ${
                                message.fromMe
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {formatTimestamp(message.timestamp)}
                            </p>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
              
              <div className="p-3 border-t flex-shrink-0">
                <div className="flex space-x-2">
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="min-h-[44px] max-h-[120px] resize-none text-sm"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                  />
                  <Button
                    className="self-end"
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sendingMessage || status.connectionStatus !== 'connected'}
                  >
                    {sendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageCircle className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">Selecione uma conversa</p>
              <p className="text-sm">ou inicie uma nova conversa clicando no +</p>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={showFinishDialog} onOpenChange={setShowFinishDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Finalizar Atendimento</DialogTitle>
            <DialogDescription>
              Finalize o atendimento e opcionalmente avalie ou envie mensagem de despedida.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Aviso de link de avaliação para cliente */}
            {selectedConversation?.ticket_id ? (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <Star className="h-4 w-4 text-amber-500 mt-0.5 shrink-0 fill-amber-500" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800">Link de avaliação será enviado ao cliente</p>
                  <p className="text-amber-700 mt-0.5">
                    O cliente receberá uma mensagem no WhatsApp com o link para avaliar o atendimento do chamado <span className="font-semibold">#{selectedConversation.ticket_id}</span>.
                    {sendFarewellMessage && <span className="block mt-1 font-medium">Após a avaliação, a mensagem de despedida será enviada automaticamente.</span>}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 bg-muted rounded-lg p-3">
                <Star className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium">Nenhum chamado vinculado</p>
                  <p className="mt-0.5">Para enviar link de avaliação ao cliente, vincule um chamado antes de finalizar.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Avaliação interna do atendimento (opcional)</Label>
              <p className="text-xs text-muted-foreground">Nota interna do atendente — não é enviada ao cliente.</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setFinishRating(star)}
                    className={`p-1 transition-colors ${
                      star <= finishRating
                        ? "text-yellow-400"
                        : "text-gray-300 hover:text-yellow-200"
                    }`}
                  >
                    <Star className={`h-8 w-8 ${star <= finishRating ? "fill-current" : ""}`} />
                  </button>
                ))}
                {finishRating > 0 && (
                  <span className="ml-2 text-sm text-muted-foreground">
                    {finishRating} de 5
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="finishComment">Comentário interno (opcional)</Label>
              <Textarea
                id="finishComment"
                placeholder="Adicione um comentário sobre o atendimento..."
                value={finishComment}
                onChange={(e) => setFinishComment(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sendFarewell"
                checked={sendFarewellMessage}
                onCheckedChange={(checked) => setSendFarewellMessage(checked as boolean)}
              />
              <Label htmlFor="sendFarewell" className="text-sm font-normal cursor-pointer">
                {selectedConversation?.ticket_id
                  ? "Enviar mensagem de despedida após a avaliação do cliente"
                  : "Enviar mensagem automática de despedida"}
              </Label>
            </div>

            {sendFarewellMessage && (
              <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
                <p className="font-medium mb-1 flex items-center gap-1">
                  {selectedConversation?.ticket_id ? "Prévia da mensagem de despedida (enviada após avaliação):" : "Prévia da mensagem de despedida:"}
                </p>
                <p className="whitespace-pre-line">
                  {selectedConversation?.ticket_id ? (
                    <>
                      👋🏻 Obrigado pela avaliação, {selectedConversation?.contact_name || "Cliente"}! ⭐⭐⭐⭐⭐{"\n\n"}
                      Ficamos muito felizes em poder ajudá-lo. Obrigado por escolher a RedeG7 Soluções em TI 🔰🔐{"\n"}
                      Estamos sempre à disposição! 😉
                    </>
                  ) : (
                    <>
                      👋🏻 Atendimento finalizado!{"\n"}
                      {selectedConversation?.contact_name || "Cliente"}, obrigado por escolher a RedeG7 Soluções em TI 🔰🔐{"\n"}
                      Estamos sempre à disposição 😉
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowFinishDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={finishConversation} disabled={finishingConversation}>
              {finishingConversation ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Finalizando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Finalizar Atendimento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
