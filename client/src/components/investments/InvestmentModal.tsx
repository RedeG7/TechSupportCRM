import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Upload } from "lucide-react";

interface InvestmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
}

export default function InvestmentModal({ isOpen, onClose, initialData }: InvestmentModalProps) {
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    clientId: initialData?.clientId || "",
    category: initialData?.category || "Hardware",
    amount: initialData?.amount ? String(initialData.amount) : "0",
    date: initialData?.date ? new Date(initialData.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    description: initialData?.description || "",
    installments: initialData?.installments ? String(initialData.installments) : "1",
    paymentType: initialData?.paymentType || "fixed",
    documents: initialData?.documents || null
  });
  
  const { data: clients = [] } = useQuery<any[]>({
    queryKey: ["/api/clients"],
  });
  
  const mutation = useMutation({
    mutationFn: (data: any) => {
      // Format number values
      const formattedData = {
        ...data,
        clientId: Number(data.clientId),
        amount: data.amount && data.amount.trim() !== "" ? Number(data.amount.replace(',', '.')) : 0,
        installments: Number(data.installments),
        paymentType: data.paymentType,
        date: new Date(data.date), // Converter string para objeto Date
      };
      
      return initialData?.id 
        ? apiRequest("PUT", `/api/investments/${initialData.id}`, formattedData)
        : apiRequest("POST", "/api/investments", formattedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/investments"] });
      
      toast({
        title: initialData ? "Despesa atualizada" : "Despesa registrada",
        description: initialData 
          ? "A despesa foi atualizada com sucesso" 
          : "A despesa foi registrada com sucesso",
      });
      
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao ${initialData ? "atualizar" : "registrar"} despesa: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.clientId) {
      toast({
        title: "Fornecedor obrigatório",
        description: "Por favor, selecione um fornecedor para a despesa",
        variant: "destructive",
      });
      return;
    }
    
    if (!formData.amount) {
      toast({
        title: "Valor obrigatório",
        description: "Por favor, informe o valor da despesa",
        variant: "destructive",
      });
      return;
    }
    
    mutation.mutate(formData);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-neutral-700">
            {initialData ? "Editar Despesa" : "Registrar Despesa"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="clientId" className="block text-sm font-medium text-neutral-700 mb-1">Fornecedor</Label>
              <Select 
                value={formData.clientId.toString()} 
                onValueChange={(value) => handleSelectChange("clientId", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {clients
                    .filter((client: any) => client.businessType === "Fornecedor")
                    .map((client: any) => (
                      <SelectItem key={client.id} value={client.id.toString()}>
                        {client.businessName}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="category" className="block text-sm font-medium text-neutral-700 mb-1">Categoria</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value) => handleSelectChange("category", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hardware">Hardware</SelectItem>
                  <SelectItem value="Software">Software</SelectItem>
                  <SelectItem value="Serviços">Serviços</SelectItem>
                  <SelectItem value="Treinamento">Treinamento</SelectItem>
                  <SelectItem value="Consultoria">Consultoria</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="amount" className="block text-sm font-medium text-neutral-700 mb-1">Valor (R$)</Label>
              <Input
                id="amount"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="0,00"
                type="text"
                required
              />
            </div>
            <div>
              <Label htmlFor="date" className="block text-sm font-medium text-neutral-700 mb-1">Data</Label>
              <Input
                id="date"
                name="date"
                type="date"
                value={formData.date}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="mb-4">
            <Label htmlFor="description" className="block text-sm font-medium text-neutral-700 mb-1">Descrição</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Detalhes da despesa..."
              className="h-24"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="installments" className="block text-sm font-medium text-neutral-700 mb-1">Quantidade de Parcelas</Label>
              <Input
                id="installments"
                name="installments"
                value={formData.installments}
                onChange={handleInputChange}
                placeholder="1"
                type="number"
                min="1"
              />
            </div>
            <div>
              <Label htmlFor="paymentType" className="block text-sm font-medium text-neutral-700 mb-1">Tipo de Pagamento</Label>
              <Select 
                value={formData.paymentType} 
                onValueChange={(value) => handleSelectChange("paymentType", value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixo</SelectItem>
                  <SelectItem value="variable">Variável</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mb-4">
            <Label className="block text-sm font-medium text-neutral-700 mb-1">Documentos</Label>
            <div className="border-2 border-dashed border-neutral-300 rounded-md p-6 text-center">
              <div className="mb-3">
                <Upload className="mx-auto h-10 w-10 text-neutral-400" />
              </div>
              <p className="text-sm text-neutral-500 mb-1">Arraste arquivos aqui ou</p>
              <Button type="button" variant="link" className="text-primary text-sm font-medium">
                selecione no seu computador
              </Button>
              <p className="text-xs text-neutral-400 mt-2">
                (Funcionalidade de upload não disponível nesta versão demo)
              </p>
            </div>
          </div>
          
          <DialogFooter className="space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Atualizar Despesa" : "Registrar Despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
