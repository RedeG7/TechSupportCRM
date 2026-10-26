import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

// Tipos para os dados do cliente
type ClientContact = {
  id: number;
  name: string;
  email: string;
  whatsapp: string;
  isPrimary: boolean;
  username: string;
};

type ClientData = {
  id: number;
  businessName: string;
  tradeName: string;
  cnpj: string;
  cpf: string;
  businessType: string;
  email: string;
  phone: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  createdAt: string;
};

type ClientProfile = {
  client: ClientData;
  clientContact: ClientContact;
};

export default function ClientProfile() {
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setIsLoading(true);
      
      // Adicionar ID do contato do cliente nos headers
      const headers = {
        "Content-Type": "application/json",
        "client-contact-id": localStorage.getItem("client_contact_id") || "",
      };
      
      const response = await fetch("/api/client/profile", { 
        method: "GET",
        headers
      });
      
      if (!response.ok) {
        throw new Error("Falha ao carregar perfil");
      }
      
      const data = await response.json();
      setProfile(data);
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar seus dados de perfil.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Função para formatar CNPJ
  const formatCNPJ = (cnpj?: string) => {
    if (!cnpj) return "";
    cnpj = cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) return cnpj;
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  };

  // Função para formatar CPF
  const formatCPF = (cpf?: string) => {
    if (!cpf) return "";
    cpf = cpf.replace(/\D/g, '');
    if (cpf.length !== 11) return cpf;
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  // Função para obter iniciais do nome
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Função para formatar a data
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>Erro ao carregar dados do perfil. Tente novamente mais tarde.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Meu Perfil</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Informações de Contato</CardTitle>
            <CardDescription>
              Seus dados de usuário
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center">
              <Avatar className="h-24 w-24 mb-4">
                <AvatarFallback className="text-lg">
                  {getInitials(profile.clientContact.name)}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-xl font-semibold text-center">
                {profile.clientContact.name}
              </h2>
              <p className="text-sm text-muted-foreground">
                Usuário: {profile.clientContact.username}
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">E-mail</h3>
                <p>{profile.clientContact.email || "Não informado"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">WhatsApp</h3>
                <p>{profile.clientContact.whatsapp || "Não informado"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Tipo de contato</h3>
                <p>{profile.clientContact.isPrimary ? "Contato principal" : "Contato adicional"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Dados da Empresa</CardTitle>
            <CardDescription>
              Informações cadastrais
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Razão Social</h3>
                <p>{profile.client.businessName}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Nome Fantasia</h3>
                <p>{profile.client.tradeName || "Não informado"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Tipo</h3>
                <p>{profile.client.businessType}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">
                  {profile.client.businessType === "Empresa" ? "CNPJ" : "CPF"}
                </h3>
                <p>
                  {profile.client.businessType === "Empresa" 
                    ? formatCNPJ(profile.client.cnpj) 
                    : formatCPF(profile.client.cpf)}
                </p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">E-mail</h3>
                <p>{profile.client.email || "Não informado"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Telefone</h3>
                <p>{profile.client.phone || "Não informado"}</p>
              </div>
              
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Data de Cadastro</h3>
                <p>{formatDate(profile.client.createdAt)}</p>
              </div>
            </div>
            
            <Separator />
            
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Endereço</h3>
              
              {profile.client.address ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs text-muted-foreground">Logradouro</h4>
                    <p>{profile.client.address.street || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">Número</h4>
                    <p>{profile.client.address.number || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">Complemento</h4>
                    <p>{profile.client.address.complement || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">Bairro</h4>
                    <p>{profile.client.address.district || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">Cidade</h4>
                    <p>{profile.client.address.city || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">Estado</h4>
                    <p>{profile.client.address.state || "Não informado"}</p>
                  </div>
                  
                  <div>
                    <h4 className="text-xs text-muted-foreground">CEP</h4>
                    <p>{profile.client.address.zip || "Não informado"}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">Endereço não cadastrado</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}