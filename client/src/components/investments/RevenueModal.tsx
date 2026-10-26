import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, HelpCircle, Link, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Revenue } from "@shared/schema";

interface RevenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: Revenue;
}

export default function RevenueModal({ isOpen, onClose, initialData }: RevenueModalProps) {
  const [clientId, setClientId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [type, setType] = useState("service");
  const [ticketId, setTicketId] = useState<number | null>(null);
  const [linkedTicket, setLinkedTicket] = useState<any>(null);

  const { toast } = useToast();

  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const response = await fetch("/api/clients");
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    },
  });

  const { data: ticketCategories = [] } = useQuery({
    queryKey: ["/api/ticket-categories"],
    queryFn: async () => {
      const response = await fetch("/api/ticket-categories");
      if (!response.ok) throw new Error("Failed to fetch categories");
      return response.json();
    },
  });

  const { data: tickets = [] } = useQuery({
    queryKey: ["/api/tickets"],
    queryFn: async () => {
      const response = await fetch("/api/tickets");
      if (!response.ok) throw new Error("Failed to fetch tickets");
      return response.json();
    },
    enabled: isOpen,
  });

  const filteredTickets = clientId
    ? (tickets as any[]).filter((t: any) => t.clientId === clientId)
    : (tickets as any[]);

  useEffect(() => {
    if (ticketId) {
      const found = (tickets as any[]).find((t: any) => t.id === ticketId);
      setLinkedTicket(found || null);
    } else {
      setLinkedTicket(null);
    }
  }, [ticketId, tickets]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setClientId(initialData.clientId);
        setDescription(initialData.description);
        setCategory(initialData.category);
        const categoryExists = ticketCategories.some((cat: any) => cat.name === initialData.category);
        setIsCustomCategory(!categoryExists);
        setAmount(initialData.amount.toString());
        setDate(format(new Date(initialData.date), "yyyy-MM-dd"));
        setPaymentStatus(initialData.paymentStatus);
        setPaymentMethod(initialData.paymentMethod || "");
        setIsRecurring(initialData.isRecurring || false);
        setNotes(initialData.notes || "");
        setType((initialData as any).type || "service");
        setTicketId((initialData as any).ticketId || null);
      } else {
        setClientId(null);
        setDescription("");
        setCategory("");
        setIsCustomCategory(false);
        setAmount("");
        setDate(format(new Date(), "yyyy-MM-dd"));
        setPaymentStatus("pending");
        setPaymentMethod("");
        setIsRecurring(false);
        setNotes("");
        setType("service");
        setTicketId(null);
        setLinkedTicket(null);
      }
    }
  }, [isOpen, initialData, ticketCategories]);

  const createRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/revenues", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenues"] });
      toast({
        title: "Receita criada",
        description: "A receita foi registrada com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao criar receita: ${error}`,
        variant: "destructive",
      });
    },
  });

  const updateRevenueMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/revenues/${initialData!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/revenues"] });
      toast({
        title: "Receita atualizada",
        description: "A receita foi atualizada com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao atualizar receita: ${error}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!clientId) {
      toast({ title: "Erro", description: "Por favor, selecione um cliente.", variant: "destructive" });
      return;
    }
    if (!description.trim()) {
      toast({ title: "Erro", description: "Por favor, forneça uma descrição.", variant: "destructive" });
      return;
    }
    if (!category.trim()) {
      toast({ title: "Erro", description: "Por favor, selecione uma categoria.", variant: "destructive" });
      return;
    }
    const amountValue = parseFloat(amount.replace(",", "."));
    if (isNaN(amountValue) || amountValue <= 0) {
      toast({ title: "Erro", description: "Por favor, informe um valor válido.", variant: "destructive" });
      return;
    }

    const data = {
      clientId,
      description,
      category,
      type,
      amount: amountValue,
      date: new Date(date),
      paymentStatus,
      paymentMethod: paymentMethod || null,
      isRecurring,
      notes: notes || null,
      ticketId: ticketId || null,
    };

    if (initialData) {
      updateRevenueMutation.mutate(data);
    } else {
      createRevenueMutation.mutate(data);
    }
  };

  const isLoading = createRevenueMutation.isPending || updateRevenueMutation.isPending;

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      aberto: "Aberto", novo: "Novo", em_andamento: "Em Andamento",
      closed: "Fechado", cancelled: "Cancelado", resolved: "Resolvido",
    };
    return map[status] || status;
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-neutral-700">
            {initialData ? "Editar Receita" : "Cadastrar Nova Receita"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            Registre receitas e associe-as às categorias de serviços do sistema
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 mt-4">
          <div>
            <Label htmlFor="client" className="flex items-center gap-1">
              Cliente <span className="text-red-500">*</span>
            </Label>
            <Select
              value={clientId?.toString() || ""}
              onValueChange={(value) => {
                setClientId(Number(value));
                setTicketId(null);
                setLinkedTicket(null);
              }}
            >
              <SelectTrigger className="w-full mt-1">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {clients.map((client: any) => (
                  <SelectItem key={client.id} value={client.id.toString()}>
                    {client.businessName || client.tradeName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="description" className="flex items-center gap-1">
              Descrição <span className="text-red-500">*</span>
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição da receita"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <Label htmlFor="category" className="flex items-center gap-1">
                  Categoria <span className="text-red-500">*</span>
                </Label>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline w-auto"
                  onClick={() => setIsCustomCategory(!isCustomCategory)}
                >
                  {isCustomCategory ? "Usar categoria existente" : "Categoria personalizada"}
                </button>
              </div>

              {isCustomCategory ? (
                <Input
                  id="customCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Digite a categoria personalizada"
                  className="mt-1"
                />
              ) : (
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {ticketCategories.length > 0 ? (
                      ticketCategories.map((cat: any) => (
                        <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="Serviço de TI">Serviço de TI</SelectItem>
                        <SelectItem value="Suporte">Suporte</SelectItem>
                        <SelectItem value="Venda de produto">Venda de produto</SelectItem>
                        <SelectItem value="Consultoria">Consultoria</SelectItem>
                        <SelectItem value="Manutenção">Manutenção</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div>
              <Label htmlFor="type" className="flex items-center gap-1">
                Tipo de Receita <span className="text-red-500">*</span>
              </Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Serviço</SelectItem>
                  <SelectItem value="product">Produto</SelectItem>
                  <SelectItem value="subscription">Assinatura</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <Label htmlFor="amount" className="flex items-center gap-1">
                Valor (R$) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex.: 1500,00"
                className="mt-1"
              />
            </div>

            <div className="sm:col-span-1 md:col-span-2">
              <Label htmlFor="date" className="flex items-center gap-1">
                Data <span className="text-red-500">*</span>
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="paymentStatus">Status de Pagamento</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue placeholder="Status de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="overdue">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="paymentMethod">Forma de Pagamento</Label>
              <Input
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                placeholder="Ex.: PIX, Boleto, Cartão de Crédito"
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div className="flex items-center space-x-2 py-2">
              <Switch
                id="isRecurring"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
              <Label htmlFor="isRecurring" className="cursor-pointer">
                Receita recorrente/fixa
              </Label>
            </div>

            <div className="flex items-center text-xs text-muted-foreground">
              <HelpCircle className="h-3 w-3 mr-1 flex-shrink-0" />
              <span>Marque se for uma receita que se repete todo mês</span>
            </div>
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Link className="h-4 w-4 text-primary" />
              <Label className="font-medium">Vincular Chamado (opcional)</Label>
            </div>

            <Select
              value={ticketId?.toString() || "none"}
              onValueChange={(value) => {
                if (value === "none") {
                  setTicketId(null);
                  setLinkedTicket(null);
                } else {
                  setTicketId(Number(value));
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione um chamado para vincular" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                <SelectItem value="none">Nenhum chamado</SelectItem>
                {filteredTickets.map((t: any) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    #{t.id} - {t.title} ({getStatusLabel(t.status)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {linkedTicket && (
              <div className="mt-3 p-3 bg-white border rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-2">
                    <FileText className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">#{linkedTicket.id} - {linkedTicket.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Status: <span className="font-medium">{getStatusLabel(linkedTicket.status)}</span>
                        {" · "}Categoria: <span className="font-medium">{linkedTicket.category}</span>
                      </p>
                      {linkedTicket.description && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">{linkedTicket.description}</p>
                      )}
                      {linkedTicket.resolutionNote && (
                        <div className="mt-2 p-2 bg-green-50 rounded text-xs text-green-800">
                          <span className="font-medium">Solução: </span>{linkedTicket.resolutionNote}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setTicketId(null); setLinkedTicket(null); }}
                    className="text-gray-400 hover:text-gray-600 ml-2"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {!clientId && (
              <p className="text-xs text-muted-foreground mt-2">
                Selecione um cliente para ver os chamados disponíveis para vincular.
              </p>
            )}
            {clientId && filteredTickets.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Nenhum chamado encontrado para este cliente.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observações adicionais"
              className="h-16 sm:h-24 mt-1"
            />
          </div>
        </div>

        <DialogFooter className="mt-6 flex-col sm:flex-row gap-2">
          <Button variant="outline" className="w-full sm:w-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {initialData ? "Atualizando..." : "Cadastrando..."}
              </>
            ) : (
              initialData ? "Atualizar" : "Cadastrar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
