import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, Plus, X } from "lucide-react";
import { lookupCNPJ } from "@/lib/cnpj";

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
}

export default function ClientModal({ isOpen, onClose, initialData }: ClientModalProps) {
  const { toast } = useToast();
  const [isLookingUp, setIsLookingUp] = useState(false);
  
  // Estado dos contatos com campos para credenciais
  const [contacts, setContacts] = useState<Array<{
    name: string;
    email: string;
    whatsapp: string;
    isNew?: boolean;
    createPortalAccess?: boolean;
    username?: string;
    password?: string;
  }>>([{ name: "", email: "", whatsapp: "", isNew: true, createPortalAccess: true, username: "", password: "" }]);
  
  const [formData, setFormData] = useState({
    cnpj: initialData?.cnpj || "",
    cpf: initialData?.cpf || "",
    businessType: initialData?.businessType || "Empresa",
    businessName: initialData?.businessName || "",
    tradeName: initialData?.tradeName || "",
    email: initialData?.email || "",
    phone: initialData?.phone || "",
    address: {
      zip: initialData?.address?.zip || "",
      street: initialData?.address?.street || "",
      number: initialData?.address?.number || "",
      complement: initialData?.address?.complement || "",
      district: initialData?.address?.district || "",
      city: initialData?.address?.city || "",
      state: initialData?.address?.state || "",
    }
  });
  
  const mutation = useMutation({
    mutationFn: (data: any) => {
      return initialData?.id 
        ? apiRequest("PUT", `/api/clients/${initialData.id}`, data)
        : apiRequest("POST", "/api/clients", data);
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      
      // Save contacts
      if (data && contacts.length > 0) {
        const clientId = initialData?.id || data.id;
        
        for (const contact of contacts) {
          if (contact.name && (contact.email || contact.whatsapp)) {
            if (contact.isNew) {
              const contactData: any = {
                name: contact.name,
                email: contact.email,
                whatsapp: contact.whatsapp,
                isPrimary: contacts.indexOf(contact) === 0, // First contact is primary
              };
              
              // Se o contato tem a opção de criar login ativada
              if (contact.createPortalAccess && contact.username && contact.password) {
                contactData.createPortalAccess = true;
                contactData.username = contact.username;
                contactData.password = contact.password;
              }
              
              await apiRequest("POST", `/api/clients/${clientId}/contacts`, contactData);
            }
          }
        }
      }
      
      toast({
        title: initialData ? "Cliente atualizado" : "Cliente cadastrado",
        description: initialData 
          ? "O cliente foi atualizado com sucesso" 
          : "O cliente foi cadastrado com sucesso",
      });
      
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: `Erro ao ${initialData ? "atualizar" : "cadastrar"} cliente: ${error}`,
        variant: "destructive",
      });
    },
  });
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    if (name.includes('.')) {
      const [parent, child] = name.split('.');
      setFormData(prev => ({
        ...prev,
        [parent]: {
          ...prev[parent as keyof typeof prev],
          [child]: value,
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }));
      
      // Se o campo modificado for o CNPJ e tiver 14 dígitos (sem pontuação), 
      // ou 18 caracteres (com pontuação XX.XXX.XXX/XXXX-XX),
      // busca automática dos dados
      if (name === 'cnpj') {
        const cnpjValue = value.replace(/[^\d]/g, '');
        if (cnpjValue.length === 14 || (value.includes('/') && value.includes('-') && value.length >= 18)) {
          // Adicionamos um pequeno delay para dar tempo ao usuário terminar de digitar
          setTimeout(() => {
            handleCNPJLookup();
          }, 500);
        }
      }
    }
  };
  
  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleContactChange = (index: number, field: string, value: any) => {
    const updatedContacts = [...contacts];
    updatedContacts[index] = {
      ...updatedContacts[index],
      [field]: value,
    };
    setContacts(updatedContacts);
  };
  
  const addContact = () => {
    setContacts([...contacts, { name: "", email: "", whatsapp: "", isNew: true, createPortalAccess: true, username: "", password: "" }]);
  };
  
  const removeContact = (index: number) => {
    const updatedContacts = [...contacts];
    updatedContacts.splice(index, 1);
    setContacts(updatedContacts);
  };
  
  const handleCNPJLookup = async () => {
    if (!formData.cnpj) {
      toast({
        title: "CNPJ inválido",
        description: "Por favor, informe um CNPJ válido",
        variant: "destructive",
      });
      return;
    }
    
    // Se já estiver buscando, evita múltiplas requisições
    if (isLookingUp) return;
    
    setIsLookingUp(true);
    
    try {
      const data = await lookupCNPJ(formData.cnpj);
      
      // Preenche o formulário com os dados retornados da API
      setFormData({
        ...formData,
        businessName: data.businessName || formData.businessName,
        tradeName: data.tradeName || formData.tradeName,
        email: data.email || formData.email,
        phone: data.phone || formData.phone,
        address: {
          zip: data.address.zip || formData.address.zip,
          street: data.address.street || formData.address.street,
          number: data.address.number || formData.address.number,
          complement: data.address.complement || formData.address.complement,
          district: data.address.district || formData.address.district,
          city: data.address.city || formData.address.city,
          state: data.address.state || formData.address.state,
        }
      });
      
      // Atualiza também o primeiro contato com o email principal da empresa, se existir
      if (data.email && contacts.length > 0 && !contacts[0].email) {
        const updatedContacts = [...contacts];
        updatedContacts[0] = {
          ...updatedContacts[0],
          email: data.email,
        };
        setContacts(updatedContacts);
      }
      
      toast({
        title: "CNPJ encontrado",
        description: "Os dados da empresa foram preenchidos automaticamente",
      });
    } catch (error) {
      console.error("Erro ao buscar CNPJ:", error);
      // Extrair e formatar a mensagem de erro
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Para erros de limite de consulta, informar claramente o usuário
      if (errorMessage.includes('Limite de consultas')) {
        toast({
          title: "Limite de Consultas",
          description: errorMessage,
          variant: "destructive",
        });
      } 
      // Para erros de CNPJ inválido, informar de forma amigável
      else if (errorMessage.includes('CNPJ inválido')) {
        toast({
          title: "CNPJ Inválido",
          description: "O CNPJ informado não é válido ou não foi encontrado na Receita Federal",
          variant: "destructive",
        });
      }
      // Outros erros
      else {
        toast({
          title: "Erro",
          description: `Erro ao buscar dados do CNPJ: ${errorMessage}`,
          variant: "destructive",
        });
      }
    } finally {
      setIsLookingUp(false);
    }
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-neutral-700">
            {initialData ? "Editar Cliente" : "Cadastro de Cliente"}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="mb-6">
            <div className="flex mb-4 flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Label htmlFor="cnpj" className="block text-sm font-medium text-neutral-700 mb-1">CNPJ</Label>
                <div className="flex">
                  <Input
                    id="cnpj"
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleInputChange}
                    placeholder="00.000.000/0000-00"
                    className="rounded-r-none"
                  />
                  <Button
                    type="button"
                    onClick={handleCNPJLookup}
                    className="rounded-l-none"
                    disabled={isLookingUp}
                  >
                    {isLookingUp ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-neutral-500 mt-1">Digite o CNPJ para buscar os dados automaticamente</p>
              </div>
              <div className="flex-1">
                <Label htmlFor="businessType" className="block text-sm font-medium text-neutral-700 mb-1">Tipo de Cliente</Label>
                <Select 
                  value={formData.businessType} 
                  onValueChange={(value) => handleSelectChange("businessType", value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Empresa">Empresa</SelectItem>
                    <SelectItem value="Pessoa Física">Pessoa Física</SelectItem>
                    <SelectItem value="Fornecedor">Fornecedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="businessName" className="block text-sm font-medium text-neutral-700 mb-1">Razão Social</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  placeholder="Nome completo da empresa"
                />
              </div>
              <div>
                <Label htmlFor="tradeName" className="block text-sm font-medium text-neutral-700 mb-1">Nome Fantasia</Label>
                <Input
                  id="tradeName"
                  name="tradeName"
                  value={formData.tradeName}
                  onChange={handleInputChange}
                  placeholder="Nome comercial"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor="phone" className="block text-sm font-medium text-neutral-700 mb-1">Telefone</Label>
                <Input
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  placeholder="(00) 0000-0000"
                />
              </div>
              <div>
                <Label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">E-mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="contato@empresa.com.br"
                />
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-4 mt-4">
              <h4 className="font-medium text-neutral-700 mb-4">Endereço</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <Label htmlFor="address.zip" className="block text-sm font-medium text-neutral-700 mb-1">CEP</Label>
                  <Input
                    id="address.zip"
                    name="address.zip"
                    value={formData.address.zip}
                    onChange={handleInputChange}
                    placeholder="00000-000"
                  />
                </div>
                <div className="col-span-1 sm:col-span-2">
                  <Label htmlFor="address.street" className="block text-sm font-medium text-neutral-700 mb-1">Logradouro</Label>
                  <Input
                    id="address.street"
                    name="address.street"
                    value={formData.address.street}
                    onChange={handleInputChange}
                    placeholder="Rua, Avenida, etc."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="address.number" className="block text-sm font-medium text-neutral-700 mb-1">Número</Label>
                  <Input
                    id="address.number"
                    name="address.number"
                    value={formData.address.number}
                    onChange={handleInputChange}
                    placeholder="123"
                  />
                </div>
                <div>
                  <Label htmlFor="address.complement" className="block text-sm font-medium text-neutral-700 mb-1">Complemento</Label>
                  <Input
                    id="address.complement"
                    name="address.complement"
                    value={formData.address.complement}
                    onChange={handleInputChange}
                    placeholder="Sala, Andar, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="address.district" className="block text-sm font-medium text-neutral-700 mb-1">Bairro</Label>
                  <Input
                    id="address.district"
                    name="address.district"
                    value={formData.address.district}
                    onChange={handleInputChange}
                    placeholder="Bairro"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Label htmlFor="address.city" className="block text-sm font-medium text-neutral-700 mb-1">Cidade/UF</Label>
                  <div className="flex gap-2">
                    <Input
                      id="address.city"
                      name="address.city"
                      value={formData.address.city}
                      onChange={handleInputChange}
                      placeholder="Cidade"
                      className="flex-1"
                    />
                    <Input
                      id="address.state"
                      name="address.state"
                      value={formData.address.state}
                      onChange={handleInputChange}
                      placeholder="UF"
                      className="w-16"
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-neutral-200 pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-neutral-700">Contatos</h4>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm" 
                  onClick={addContact}
                  className="text-primary text-sm font-medium hover:bg-primary/10"
                >
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-4">
                {contacts.map((contact, index) => (
                  <div key={index} className="bg-neutral-50 p-4 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium">Contato {index + 1}</span>
                      {index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeContact(index)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div className="col-span-1">
                        <Label htmlFor={`contact-name-${index}`} className="block text-sm font-medium text-neutral-700 mb-1">Nome</Label>
                        <Input
                          id={`contact-name-${index}`}
                          value={contact.name}
                          onChange={(e) => handleContactChange(index, "name", e.target.value)}
                          placeholder="Nome completo"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label htmlFor={`contact-email-${index}`} className="block text-sm font-medium text-neutral-700 mb-1">E-mail</Label>
                        <Input
                          id={`contact-email-${index}`}
                          type="email"
                          value={contact.email}
                          onChange={(e) => handleContactChange(index, "email", e.target.value)}
                          placeholder="email@empresa.com.br"
                        />
                      </div>
                      <div className="col-span-1">
                        <Label htmlFor={`contact-whatsapp-${index}`} className="block text-sm font-medium text-neutral-700 mb-1">WhatsApp</Label>
                        <Input
                          id={`contact-whatsapp-${index}`}
                          value={contact.whatsapp}
                          onChange={(e) => handleContactChange(index, "whatsapp", e.target.value)}
                          placeholder="(11) 98765-4321"
                        />
                      </div>
                    </div>
                  
                    {/* Opção para criar credenciais */}
                    <div className="mt-4 border-t border-dashed border-neutral-200 pt-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id={`create-credentials-${index}`}
                          checked={contact.createPortalAccess || false}
                          onCheckedChange={(checked) => handleContactChange(index, "createPortalAccess", Boolean(checked))}
                        />
                        <Label 
                          htmlFor={`create-credentials-${index}`}
                          className="text-sm font-semibold text-primary cursor-pointer"
                        >
                          Criar credenciais para acesso ao portal do cliente
                        </Label>
                      </div>
                      <p className="text-xs text-neutral-500 ml-6 mt-1">
                        Permite que o contato acesse o portal para abrir chamados, acompanhar status e ver informações
                      </p>
                    
                      {contact.createPortalAccess && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4 pl-2 sm:pl-6 border p-3 rounded-md bg-primary/5">
                          <div>
                            <Label htmlFor={`contact-username-${index}`} className="block text-sm font-medium text-neutral-700 mb-1">Nome de usuário</Label>
                            <Input
                              id={`contact-username-${index}`}
                              value={contact.username || ''}
                              onChange={(e) => handleContactChange(index, "username", e.target.value)}
                              placeholder="nome.sobrenome"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`contact-password-${index}`} className="block text-sm font-medium text-neutral-700 mb-1">Senha</Label>
                            <Input
                              id={`contact-password-${index}`}
                              type="password"
                              value={contact.password || ''}
                              onChange={(e) => handleContactChange(index, "password", e.target.value)}
                              placeholder="Senha segura"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter className="space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData ? "Atualizar Cliente" : "Salvar Cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}