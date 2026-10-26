import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Info, MessageSquare, QrCode, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter,
  DialogTrigger
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Message = {
  id: number;
  role: "user" | "bot";
  content: string;
  timestamp: Date;
};

export default function ChatbotPanel() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: "bot",
      content: "Olá! Sou o G7Bot, o assistente virtual da RedeG7. Como posso ajudar você hoje?",
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [whatsappStatus, setWhatsappStatus] = useState<{
    isInitialized: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    hasQrCode: boolean;
  } | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [showQrCodeDialog, setShowQrCodeDialog] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Verificar o status do WhatsApp periodicamente
  useEffect(() => {
    const checkWhatsAppStatus = async () => {
      try {
        const response = await fetch("/api/admin/whatsapp/status");
        if (response.ok) {
          const status = await response.json();
          setWhatsappStatus(status);
          
          // Se não estiver inicializado, tentar inicializar
          if (!status.isInitialized) {
            await fetch("/api/admin/whatsapp/init", { method: "POST" });
          }
        }
      } catch (error) {
        console.error("Erro ao verificar status do WhatsApp:", error);
      }
    };

    checkWhatsAppStatus();
    const interval = setInterval(checkWhatsAppStatus, 10000);
    
    return () => clearInterval(interval);
  }, []);

  // Obter QR Code quando necessário
  useEffect(() => {
    const fetchQrCode = async () => {
      if (whatsappStatus?.connectionStatus === 'connecting' || whatsappStatus?.hasQrCode) {
        try {
          const response = await fetch("/api/admin/whatsapp/qrcode");
          if (response.ok) {
            const data = await response.json();
            if (data.qrCode) {
              setQrCodeUrl(data.qrCode);
            }
          }
        } catch (error) {
          console.error("Erro ao obter QR code:", error);
        }
      }
    };

    fetchQrCode();
  }, [whatsappStatus]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    
    const userMessage: Message = {
      id: messages.length + 1,
      role: "user",
      content: inputValue,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          message: userMessage.content,
          history: messages.map(m => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content
          }))
        })
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error("Falha ao obter resposta do chatbot");
      }
      
      const data = await response.json();
      
      const botMessage: Message = {
        id: messages.length + 2,
        role: "bot",
        content: data.response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, botMessage]);

      // Se Claude criou um chamado, mostrar notificação
      if (data.ticketCreated) {
        toast({
          title: "✅ Chamado criado com sucesso!",
          description: `#${data.ticketCreated.id} — ${data.ticketCreated.title}`,
        });
      }
    } catch (error: any) {
      console.error("Erro ao processar mensagem:", error);
      const isTimeout = error?.name === "AbortError";
      toast({
        variant: "destructive",
        title: isTimeout ? "Tempo esgotado" : "Erro",
        description: isTimeout
          ? "O G7Bot demorou muito para responder. Tente novamente."
          : "Não foi possível obter uma resposta do chatbot. Tente novamente mais tarde.",
      });
      
      const errorMessage: Message = {
        id: messages.length + 2,
        role: "bot",
        content: isTimeout
          ? "Desculpe, levei muito tempo para processar. Por favor, tente novamente."
          : "Desculpe, estou enfrentando problemas técnicos no momento. Por favor, tente novamente mais tarde.",
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const handleSendTestWhatsApp = async () => {
    try {
      if (!inputValue.trim()) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Por favor, digite um número de telefone e uma mensagem.",
        });
        return;
      }
      
      // Split the input into phone number and message
      const [phone, ...messageParts] = inputValue.split(" ");
      const message = messageParts.join(" ");
      
      if (!phone || !message) {
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Formato inválido. Use: telefone mensagem",
        });
        return;
      }
      
      setIsLoading(true);
      
      const response = await fetch("/api/notifications/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          to: phone,
          message: message
        })
      });
      
      if (!response.ok) {
        throw new Error("Falha ao enviar mensagem");
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Sucesso",
          description: "Mensagem WhatsApp enviada com sucesso!",
        });
      } else {
        throw new Error(result.message || "Erro desconhecido");
      }
    } catch (error) {
      console.error("Erro ao enviar WhatsApp:", error);
      toast({
        variant: "destructive",
        title: "Erro no envio",
        description: error instanceof Error ? error.message : "Erro desconhecido ao enviar mensagem.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-4 flex items-center">
        <Button variant="ghost" onClick={() => navigate("/")} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold">Painel de Comunicação</h1>
      </div>
      
      <Tabs defaultValue="chatbot" className="w-full">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="chatbot">
            <MessageSquare className="h-4 w-4 mr-2" />
            Chatbot IA
          </TabsTrigger>
          <TabsTrigger value="whatsapp">
            <Phone className="h-4 w-4 mr-2" />
            WhatsApp
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="chatbot" className="w-full">
          <Card>
            <CardHeader>
              <CardTitle>Chatbot G7Bot</CardTitle>
              <CardDescription>
                Teste o chatbot alimentado por IA que pode ajudar seus clientes com dúvidas comuns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[500px] flex flex-col">
                <div className="flex-1 overflow-y-auto mb-4 p-4 border rounded-lg">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex mb-4 ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          message.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
                        <div className="text-sm">{message.content}</div>
                        <div className="text-xs mt-1 opacity-70 text-right">
                          {formatTime(message.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start mb-4">
                      <div className="max-w-[80%] p-3 rounded-lg bg-muted">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-100"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce delay-200"></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <div className="flex space-x-2">
                  <Input
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    disabled={isLoading}
                  />
                  <Button onClick={handleSendMessage} disabled={isLoading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="whatsapp" className="w-full">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>WhatsApp</CardTitle>
                  <CardDescription>
                    Gerencie a integração com WhatsApp e teste o envio de mensagens.
                  </CardDescription>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => setShowQrCodeDialog(true)}
                        disabled={!whatsappStatus?.hasQrCode}
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Mostrar QR Code para autenticação</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center mt-2">
                <div className={`w-3 h-3 rounded-full mr-2 ${
                  whatsappStatus?.connectionStatus === 'connected' 
                    ? 'bg-green-500' 
                    : whatsappStatus?.connectionStatus === 'connecting'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}></div>
                <p className="text-sm">
                  {whatsappStatus?.connectionStatus === 'connected' 
                    ? 'Conectado' 
                    : whatsappStatus?.connectionStatus === 'connecting'
                    ? 'Conectando...'
                    : 'Desconectado'}
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex items-center mb-2">
                    <Info className="h-4 w-4 mr-2" />
                    <h3 className="font-medium">Instruções para clientes</h3>
                  </div>
                  <p className="text-sm">
                    Seus clientes podem usar os seguintes comandos no WhatsApp:
                  </p>
                  <ul className="text-sm mt-2 space-y-1 list-disc pl-5">
                    <li><span className="font-mono">/chamado Título do problema</span> - Cria um novo chamado</li>
                    <li><span className="font-mono">/status 123</span> - Verifica o status do chamado com ID 123</li>
                    <li><span className="font-mono">/ajuda</span> - Exibe ajuda sobre os comandos disponíveis</li>
                  </ul>
                  <p className="text-sm mt-2">
                    Mensagens normais são respondidas pelo chatbot IA G7Bot, que ajuda com dúvidas comuns.
                  </p>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Teste de Envio</h3>
                  <p className="text-sm mb-4">
                    Digite o número de telefone seguido da mensagem para enviar um teste.
                    <br />
                    Exemplo: <span className="font-mono">5511987654321 Olá, esta é uma mensagem de teste!</span>
                  </p>
                  <div className="flex space-x-2">
                    <Input
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder="Telefone Mensagem"
                      disabled={isLoading || whatsappStatus?.connectionStatus !== 'connected'}
                    />
                    <Button 
                      onClick={handleSendTestWhatsApp} 
                      disabled={isLoading || whatsappStatus?.connectionStatus !== 'connected'}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <Dialog open={showQrCodeDialog} onOpenChange={setShowQrCodeDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Autenticação WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie este QR Code no WhatsApp do seu celular para conectar a aplicação.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            {qrCodeUrl ? (
              <img 
                src={qrCodeUrl} 
                alt="QR Code para autenticação do WhatsApp" 
                className="w-64 h-64"
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center border rounded">
                <p className="text-center text-muted-foreground">QR Code não disponível</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowQrCodeDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}