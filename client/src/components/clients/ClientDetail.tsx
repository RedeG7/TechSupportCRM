import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { 
  User, 
  Building, 
  Phone, 
  Mail, 
  MapPin, 
  Key,
  Users,
  ClipboardList,
  Trash,
  Power
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import type { Client, ClientContact } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface ClientDetailProps {
  clientId: number;
}

function CredentialRow({ contact, clientId, onStatusChange }: { contact: any; clientId: number; onStatusChange: () => void }) {
  const { toast } = useToast();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleStatus = async () => {
    setIsToggling(true);
    try {
      const response = await fetch(`/api/client-contacts/${contact.id}/toggle-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao alterar status');
      }
      
      const result = await response.json();
      const isActive = result.contact?.isActive ?? !contact.isActive;
      toast({
        title: isActive ? "Credencial ativada" : "Credencial inativada",
        description: isActive 
          ? "O usuário agora pode acessar o portal do cliente."
          : "O usuário não pode mais acessar o portal do cliente.",
        variant: "default",
      });
      onStatusChange();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível alterar o status da credencial.",
        variant: "destructive",
      });
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <TableRow key={contact.id}>
      <TableCell className="font-medium">{contact.name}</TableCell>
      <TableCell>{contact.username}</TableCell>
      <TableCell>{contact.email}</TableCell>
      <TableCell>
        {contact.isActive !== false ? (
          <Badge variant="outline" className="border-green-500 text-green-600">
            Ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="border-red-500 text-red-600">
            Inativo
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {isToggling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Switch
              checked={contact.isActive !== false}
              onCheckedChange={handleToggleStatus}
              title={contact.isActive !== false ? "Inativar credencial" : "Ativar credencial"}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function ClientDetail({ clientId }: ClientDetailProps) {
  const [activeTab, setActiveTab] = useState("info");
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [isInactivateAlertOpen, setIsInactivateAlertOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Buscar dados do cliente
  const { data: client, isLoading: clientLoading } = useQuery<Client>({
    queryKey: [`/api/clients/${clientId}`],
    enabled: !!clientId,
  });
  
  // Buscar contatos do cliente
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<ClientContact[]>({
    queryKey: [`/api/clients/${clientId}/contacts`],
    enabled: !!clientId,
  });

  // Filtrar contatos com credenciais
  const contactsWithCredentials = contacts.filter((contact) => 'hasCredentials' in contact && contact.hasCredentials);
  
  // Mutação para inativar cliente
  const inactivateClientMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/clients/${clientId}/inactivate`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao inativar cliente');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Cliente inativado",
        description: "O cliente foi inativado com sucesso.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível inativar o cliente.",
        variant: "destructive",
      });
    }
  });
  
  // Mutação para excluir cliente
  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Erro ao excluir cliente');
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Cliente excluído",
        description: "O cliente foi excluído com sucesso.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      // Fechar o diálogo de detalhes (será tratado pelo componente pai)
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível excluir o cliente.",
        variant: "destructive",
      });
    }
  });
  
  if (clientLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!client) {
    return (
      <div className="text-center py-8">
        <h3 className="text-lg font-semibold text-neutral-700">Cliente não encontrado</h3>
      </div>
    );
  }
  
  return (
    <div>
      {/* Diálogo de confirmação para inativar cliente */}
      <AlertDialog open={isInactivateAlertOpen} onOpenChange={setIsInactivateAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja inativar o cliente <strong>{client?.businessName}</strong>?<br />
              Clientes inativos não podem abrir novos chamados nem acessar o sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => inactivateClientMutation.mutate()}
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              {inactivateClientMutation.isPending ? "Inativando..." : "Inativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de confirmação para excluir cliente */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir permanentemente o cliente <strong>{client?.businessName}</strong>?<br />
              Esta ação também excluirá todos os contatos associados e <strong>não pode ser desfeita</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deleteClientMutation.mutate()}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {deleteClientMutation.isPending ? "Excluindo..." : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Building className="h-5 w-5 mr-2" />
              {client?.businessName}
              {client?.tradeName && <span className="ml-2 text-sm text-neutral-500">({client.tradeName})</span>}
              {client?.isActive === false && (
                <Badge variant="outline" className="ml-2 bg-red-100 text-red-800 border-red-200">
                  Inativo
                </Badge>
              )}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsInactivateAlertOpen(true)}
                disabled={client?.isActive === false}
                className="text-amber-600 border-amber-200 hover:bg-amber-50"
              >
                <Power className="h-4 w-4 mr-2" />
                Inativar
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsDeleteAlertOpen(true)}
                className="text-red-600 border-red-200 hover:bg-red-50"
              >
                <Trash className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="info" className="flex items-center">
                <User className="h-4 w-4 mr-2" /> Informações
              </TabsTrigger>
              <TabsTrigger value="contacts" className="flex items-center">
                <Users className="h-4 w-4 mr-2" /> Contatos
              </TabsTrigger>
              <TabsTrigger value="credentials" className="flex items-center">
                <Key className="h-4 w-4 mr-2" /> Credenciais
              </TabsTrigger>
            </TabsList>
          
          {/* Informações do cliente */}
          <TabsContent value="info">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">
                  {client.businessType === "Empresa" ? "CNPJ" : "CPF"}
                </p>
                <p className="text-base">{client.cnpj || client.cpf}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Tipo</p>
                <p className="text-base">{client.businessType}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">
                  <span className="flex items-center">
                    <Phone className="h-4 w-4 mr-1" /> Telefone
                  </span>
                </p>
                <p className="text-base">{client.phone || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">
                  <span className="flex items-center">
                    <Mail className="h-4 w-4 mr-1" /> E-mail
                  </span>
                </p>
                <p className="text-base">{client.email || "Não informado"}</p>
              </div>
            </div>
            
            <Separator className="my-4" />
            
            <h3 className="text-lg font-medium mb-3">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">CEP</p>
                <p className="text-base">{client.address?.zip || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Logradouro</p>
                <p className="text-base">{client.address?.street || "Não informado"}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Número</p>
                <p className="text-base">{client.address?.number || "S/N"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Complemento</p>
                <p className="text-base">{client.address?.complement || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Bairro</p>
                <p className="text-base">{client.address?.district || "Não informado"}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Cidade</p>
                <p className="text-base">{client.address?.city || "Não informado"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-500 mb-1">Estado</p>
                <p className="text-base">{client.address?.state || "Não informado"}</p>
              </div>
            </div>
          </TabsContent>
          
          {/* Contatos do cliente */}
          <TabsContent value="contacts">
            {contactsLoading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                <h3 className="text-lg font-semibold text-neutral-700">Nenhum contato cadastrado</h3>
                <p className="text-neutral-500 mt-1">
                  Edite o cliente para adicionar contatos.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {contacts.map((contact: ClientContact) => (
                  <Card key={contact.id} className="overflow-hidden border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="flex flex-col md:flex-row md:items-center justify-between">
                        <div>
                          <h4 className="text-base font-semibold">{contact.name}</h4>
                          <div className="mt-1 space-y-1">
                            {contact.email && (
                              <p className="text-sm flex items-center text-neutral-600">
                                <Mail className="h-3.5 w-3.5 mr-1 text-neutral-400" />
                                {contact.email}
                              </p>
                            )}
                            {contact.whatsapp && (
                              <p className="text-sm flex items-center text-neutral-600">
                                <Phone className="h-3.5 w-3.5 mr-1 text-neutral-400" />
                                {contact.whatsapp}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        <div className="mt-3 md:mt-0">
                          {contact.isPrimary && (
                            <Badge variant="default" className="bg-primary">
                              Principal
                            </Badge>
                          )}
                          {contact.hasCredentials && (
                            <Badge variant="outline" className="ml-2 border-green-500 text-green-600">
                              <Key className="h-3 w-3 mr-1" /> Acesso
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          {/* Credenciais de acesso */}
          <TabsContent value="credentials">
            {contactsLoading ? (
              <div className="flex items-center justify-center min-h-[200px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : contactsWithCredentials.length === 0 ? (
              <div className="text-center py-8">
                <Key className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                <h3 className="text-lg font-semibold text-neutral-700">Nenhuma credencial cadastrada</h3>
                <p className="text-neutral-500 mt-1">
                  Edite o cliente para adicionar credenciais de acesso.
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contato</TableHead>
                      <TableHead>Nome de usuário</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactsWithCredentials.map((contact: any) => (
                      <CredentialRow 
                        key={contact.id} 
                        contact={contact} 
                        clientId={clientId}
                        onStatusChange={() => queryClient.invalidateQueries({ queryKey: [`/api/clients/${clientId}/contacts`] })}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
    </div>
  );
}