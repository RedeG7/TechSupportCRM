import { useState } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { TicketNotificationType } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

// UI Components
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, Mail, MessageSquare, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

/**
 * Componente para testar envio de notificações
 */
export default function NotificationTester() {
  const [activeTab, setActiveTab] = useState("email");
  const { toast } = useToast();
  const { 
    sendEmail, 
    sendWhatsApp, 
    isEmailLoading, 
    isWhatsAppLoading 
  } = useNotifications();

  // Estado do formulário de email
  const [emailForm, setEmailForm] = useState({
    recipient: "",
    subject: "Teste de notificação",
    body: "Esta é uma mensagem de teste do sistema de notificações."
  });

  // Estado do formulário de WhatsApp
  const [whatsappForm, setWhatsappForm] = useState({
    recipient: "", // Número de telefone com DDD, ex: 11987654321
    message: "Esta é uma mensagem de teste do sistema de notificações."
  });

  // Estado do formulário de teste de ticket
  const [ticketForm, setTicketForm] = useState({
    notificationType: TicketNotificationType.CREATED as string,
    email: "",
    whatsapp: "",
    ticketId: 1,
    ticketTitle: "Problema com impressora",
    clientName: "Cliente Teste",
    status: "Em andamento",
    message: "Esta é uma mensagem de resposta de teste",
    resolutionNote: "Problema resolvido com reinicialização do equipamento",
    cancellationReason: "Cliente resolveu o problema por conta própria"
  });

  // Manipulador para alterações no formulário de email
  const handleEmailFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEmailForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Manipulador para alterações no formulário de WhatsApp
  const handleWhatsAppFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setWhatsappForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Manipulador para alterações no formulário de ticket
  const handleTicketFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTicketForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Manipulador para alteração do tipo de notificação
  const handleNotificationTypeChange = (value: string) => {
    setTicketForm(prev => ({
      ...prev,
      notificationType: value
    }));
  };

  // Enviar teste de email
  const handleSendEmailTest = async () => {
    if (!emailForm.recipient) {
      toast({
        title: "Destinatário obrigatório",
        description: "Por favor, forneça um endereço de email para enviar o teste.",
        variant: "destructive"
      });
      return;
    }

    try {
      await sendEmail({
        recipient: emailForm.recipient,
        subject: emailForm.subject,
        body: emailForm.body
      });

      toast({
        title: "Notificação enviada",
        description: `Email de teste enviado para ${emailForm.recipient} com sucesso.`
      });
    } catch (error) {
      // O erro já é tratado no hook useNotifications
    }
  };

  // Enviar teste de WhatsApp
  const handleSendWhatsAppTest = async () => {
    if (!whatsappForm.recipient) {
      toast({
        title: "Destinatário obrigatório",
        description: "Por favor, forneça um número de telefone para enviar o teste.",
        variant: "destructive"
      });
      return;
    }

    try {
      await sendWhatsApp({
        recipient: whatsappForm.recipient,
        message: whatsappForm.message
      });

      toast({
        title: "Notificação enviada",
        description: `Mensagem de teste enviada para ${whatsappForm.recipient} com sucesso.`
      });
    } catch (error) {
      // O erro já é tratado no hook useNotifications
    }
  };

  // Enviar teste de notificação de ticket
  const handleSendTicketTest = async () => {
    if (!ticketForm.email && !ticketForm.whatsapp) {
      toast({
        title: "Destinatário obrigatório",
        description: "Por favor, forneça pelo menos um email ou número de WhatsApp para enviar o teste.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Enviar para URL diferente baseado no tipo de notificação
      const response = await fetch("/api/notifications/test-ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: ticketForm.notificationType,
          data: {
            ticketId: ticketForm.ticketId,
            ticketTitle: ticketForm.ticketTitle,
            clientName: ticketForm.clientName,
            status: ticketForm.status,
            message: ticketForm.message,
            resolutionNote: ticketForm.resolutionNote,
            cancellationReason: ticketForm.cancellationReason
          },
          email: ticketForm.email || undefined,
          whatsapp: ticketForm.whatsapp || undefined
        })
      });

      if (response.ok) {
        toast({
          title: "Notificação de ticket enviada",
          description: "Teste de notificação de ticket enviado com sucesso."
        });
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao enviar notificação de ticket");
      }
    } catch (error) {
      toast({
        title: "Erro ao enviar notificação",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao enviar a notificação de teste.",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Teste de Notificações</CardTitle>
          <CardDescription>
            Envie notificações de teste para verificar a configuração do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-1 md:grid-cols-3 w-full">
              <TabsTrigger value="email" className="flex items-center">
                <Mail className="h-4 w-4 mr-2" /> Email
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex items-center">
                <MessageSquare className="h-4 w-4 mr-2" /> WhatsApp
              </TabsTrigger>
              <TabsTrigger value="ticket" className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" /> Chamados
              </TabsTrigger>
            </TabsList>

            {/* Email Notification Test */}
            <TabsContent value="email">
              <div className="space-y-4">
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">Teste de Notificação por Email</AlertTitle>
                  <AlertDescription className="text-blue-700">
                    Envie um email de teste para verificar a configuração do sistema de notificações.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipient">Email do Destinatário</Label>
                    <Input
                      id="recipient"
                      name="recipient"
                      type="email"
                      placeholder="usuario@exemplo.com"
                      value={emailForm.recipient}
                      onChange={handleEmailFormChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subject">Assunto</Label>
                    <Input
                      id="subject"
                      name="subject"
                      value={emailForm.subject}
                      onChange={handleEmailFormChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="body">Mensagem</Label>
                    <Textarea
                      id="body"
                      name="body"
                      rows={5}
                      value={emailForm.body}
                      onChange={handleEmailFormChange}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSendEmailTest} disabled={isEmailLoading} className="flex items-center">
                  {isEmailLoading ? (
                    <>Enviando...</>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" /> Enviar Email de Teste
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* WhatsApp Notification Test */}
            <TabsContent value="whatsapp">
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <AlertCircle className="h-4 w-4 text-green-600" />
                  <AlertTitle className="text-green-800">Teste de Notificação por WhatsApp</AlertTitle>
                  <AlertDescription className="text-green-700">
                    Envie uma mensagem de WhatsApp de teste para verificar a configuração do sistema de notificações.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="whatsappRecipient">Número do WhatsApp (com DDD)</Label>
                    <Input
                      id="whatsappRecipient"
                      name="recipient"
                      placeholder="11987654321"
                      value={whatsappForm.recipient}
                      onChange={handleWhatsAppFormChange}
                    />
                    <p className="text-sm text-neutral-500">
                      Digite apenas números, sem parênteses, traços ou espaços.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsappMessage">Mensagem</Label>
                    <Textarea
                      id="whatsappMessage"
                      name="message"
                      rows={5}
                      value={whatsappForm.message}
                      onChange={handleWhatsAppFormChange}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSendWhatsAppTest} disabled={isWhatsAppLoading} className="flex items-center">
                  {isWhatsAppLoading ? (
                    <>Enviando...</>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" /> Enviar WhatsApp de Teste
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Ticket Notification Test */}
            <TabsContent value="ticket">
              <div className="space-y-4">
                <Alert className="bg-purple-50 border-purple-200">
                  <AlertCircle className="h-4 w-4 text-purple-600" />
                  <AlertTitle className="text-purple-800">Teste de Notificação de Chamados</AlertTitle>
                  <AlertDescription className="text-purple-700">
                    Envie notificações de chamados para testar as diferentes situações de notificação.
                  </AlertDescription>
                </Alert>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="notificationType">Tipo de Notificação</Label>
                    <Select
                      value={ticketForm.notificationType}
                      onValueChange={handleNotificationTypeChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o tipo de notificação" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={TicketNotificationType.CREATED}>Criação de Chamado</SelectItem>
                        <SelectItem value={TicketNotificationType.STATUS_UPDATED}>Atualização de Status</SelectItem>
                        <SelectItem value={TicketNotificationType.REPLIED}>Resposta ao Chamado</SelectItem>
                        <SelectItem value={TicketNotificationType.RESOLVED}>Chamado Resolvido</SelectItem>
                        <SelectItem value={TicketNotificationType.CLOSED}>Chamado Fechado</SelectItem>
                        <SelectItem value={TicketNotificationType.CANCELED}>Chamado Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email para Notificação (opcional)</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="usuario@exemplo.com"
                        value={ticketForm.email}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsapp">WhatsApp para Notificação (opcional)</Label>
                      <Input
                        id="whatsapp"
                        name="whatsapp"
                        placeholder="11987654321"
                        value={ticketForm.whatsapp}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  </div>

                  <Separator className="my-2" />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="ticketId">ID do Chamado</Label>
                      <Input
                        id="ticketId"
                        name="ticketId"
                        type="number"
                        value={ticketForm.ticketId.toString()}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ticketTitle">Título do Chamado</Label>
                      <Input
                        id="ticketTitle"
                        name="ticketTitle"
                        value={ticketForm.ticketTitle}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="clientName">Nome do Cliente</Label>
                      <Input
                        id="clientName"
                        name="clientName"
                        value={ticketForm.clientName}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Input
                        id="status"
                        name="status"
                        value={ticketForm.status}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  </div>

                  {(ticketForm.notificationType === TicketNotificationType.REPLIED) && (
                    <div className="space-y-2">
                      <Label htmlFor="message">Mensagem de Resposta</Label>
                      <Textarea
                        id="message"
                        name="message"
                        rows={3}
                        value={ticketForm.message}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  )}

                  {(ticketForm.notificationType === TicketNotificationType.RESOLVED || 
                    ticketForm.notificationType === TicketNotificationType.CLOSED) && (
                    <div className="space-y-2">
                      <Label htmlFor="resolutionNote">Nota de Resolução</Label>
                      <Textarea
                        id="resolutionNote"
                        name="resolutionNote"
                        rows={3}
                        value={ticketForm.resolutionNote}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  )}

                  {(ticketForm.notificationType === TicketNotificationType.CANCELED) && (
                    <div className="space-y-2">
                      <Label htmlFor="cancellationReason">Motivo do Cancelamento</Label>
                      <Textarea
                        id="cancellationReason"
                        name="cancellationReason"
                        rows={3}
                        value={ticketForm.cancellationReason}
                        onChange={handleTicketFormChange}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={handleSendTicketTest} className="flex items-center">
                  <Send className="h-4 w-4 mr-2" /> Enviar Notificação de Teste
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="bg-neutral-50 border-t px-6 py-4 text-sm text-neutral-600">
          <p>
            Certifique-se de que as configurações de notificação estejam corretamente definidas
            na aba de Integrações antes de enviar testes. Os testes enviarão notificações reais
            para os destinatários especificados.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}