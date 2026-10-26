import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ClientModal from "@/components/clients/ClientModal";
import ClientDetail from "@/components/clients/ClientDetail";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Edit, Eye, Building, Users, Printer } from "lucide-react";
import type { Client } from "@shared/schema";

export default function Clients() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  
  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    onSuccess: (data) => {
      // Verificar se há clientes na lista
      if (data.length > 0 && activeFilter === "all") {
        // Verificar se há algum cliente com tipo Empresa
        const hasEmpresa = data.some(client => client.businessType === "Empresa");
        const hasPessoaFisica = data.some(client => client.businessType === "Pessoa Física");
        
        // Se tiver cliente tipo Empresa, redirecionar para a aba "cliente"
        if (hasEmpresa || hasPessoaFisica) {
          setActiveFilter("cliente");
        }
      }
    }
  });
  
  const filteredClients = clients.filter((client: Client) => {
    // Primeiro aplicar o filtro de tipo
    if (activeFilter !== "all") {
      if (activeFilter === "cliente" && 
          client.businessType !== "Cliente" && 
          client.businessType !== "Empresa" && 
          client.businessType !== "Pessoa Física") return false;
      if (activeFilter === "fornecedor" && client.businessType !== "Fornecedor") return false;
    }
    
    // Depois aplicar o filtro de busca
    if (!searchTerm) return true;
    
    const search = searchTerm.toLowerCase();
    return (
      (client.businessName && client.businessName.toLowerCase().includes(search)) ||
      (client.tradeName && client.tradeName.toLowerCase().includes(search)) ||
      (client.cnpj && client.cnpj.includes(search)) ||
      (client.email && client.email.toLowerCase().includes(search))
    );
  });
  
  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsModalOpen(true);
  };
  
  const handleViewClient = (client: Client) => {
    setSelectedClientId(client.id);
    setIsDetailOpen(true);
  };
  
  const handleCreateClient = () => {
    setSelectedClient(null);
    setIsModalOpen(true);
  };
  
  const handlePrint = () => {
    const now = new Date().toLocaleDateString('pt-BR');
    const rowsHtml = filteredClients.map((c, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#fdf8f8'}">
        <td style="padding:7px 10px;font-size:12px;font-weight:600">${c.businessName}</td>
        <td style="padding:7px 10px;font-size:12px">${c.cnpj || c.cpf || "—"}</td>
        <td style="padding:7px 10px;font-size:12px">${c.businessType || "—"}</td>
        <td style="padding:7px 10px;font-size:12px">${c.email || "—"}</td>
        <td style="padding:7px 10px;font-size:12px">${c.phone || "—"}</td>
        <td style="padding:7px 10px;font-size:12px">${c.address?.city ? `${c.address.city}/${c.address.state}` : "—"}</td>
      </tr>
    `).join('');

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Lista de Clientes - RedeG7 Suporte</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: Arial, sans-serif; color: #111827; }
            .header { background: #8B1A1A; color: white; padding: 20px 30px; }
            .header h1 { font-size: 18px; font-weight: 700; }
            .header p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
            .summary { padding: 10px 30px; background: #fdf8f8; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
            .summary strong { color: #8B1A1A; }
            .table-wrap { padding: 16px 30px 30px; }
            table { width: 100%; border-collapse: collapse; }
            thead tr { background: #8B1A1A; color: white; }
            thead th { padding: 9px 10px; font-size: 11px; font-weight: 600; text-align: left; }
            tbody td { border-bottom: 1px solid #e5e7eb; }
            .footer { text-align: center; font-size: 10px; color: #9ca3af; padding: 12px; border-top: 1px solid #e5e7eb; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RedeG7 Solu&ccedil;&otilde;es em TI &mdash; Lista de Clientes</h1>
            <p>Gerado em ${now} &nbsp;|&nbsp; Total: ${filteredClients.length} registro(s)</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome / Raz&atilde;o Social</th>
                  <th>CNPJ / CPF</th>
                  <th>Tipo</th>
                  <th>E-mail</th>
                  <th>Telefone</th>
                  <th>Cidade / UF</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="footer">RedeG7 Solu&ccedil;&otilde;es em TI &middot; Sistema de Helpdesk &middot; ${now}</div>
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 400);
    } else {
      alert('Por favor, permita popups para imprimir.');
    }
  };
  
  return (
    <section className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-neutral-700">Clientes</h2>
        <Button onClick={handleCreateClient} className="flex items-center">
          <Plus className="h-4 w-4 mr-2" /> Novo Cliente
        </Button>
      </div>
      
      {/* Tabs Filter */}
      <div className="flex justify-between items-center mb-6">
        <Tabs value={activeFilter} onValueChange={setActiveFilter} className="w-full">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            <TabsTrigger value="cliente">Clientes</TabsTrigger>
            <TabsTrigger value="fornecedor">Fornecedores</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <Button variant="outline" className="ml-4 flex items-center" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-2" />
          Imprimir
        </Button>
      </div>
      
      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
            <Input
              placeholder="Pesquisar clientes por nome, CNPJ ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>
      
      {/* Clients List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-neutral-700">Lista de Clientes</CardTitle>
          <div className="text-sm text-neutral-500">
            {filteredClients.length} {filteredClients.length === 1 ? 'registro' : 'registros'}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Carregando...</div>
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">
              Nenhum cliente encontrado. {searchTerm && "Tente ajustar sua pesquisa."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Nome</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">CNPJ/CPF</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Telefone</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Cidade/UF</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-neutral-200">
                  {filteredClients.map((client: Client) => (
                    <tr key={client.id} className="hover:bg-neutral-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-neutral-200 rounded-full flex items-center justify-center">
                            <Building className="h-5 w-5 text-neutral-500" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-neutral-900">{client.businessName}</div>
                            <div className="text-sm text-neutral-500">{client.tradeName}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {client.cnpj || client.cpf || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {client.email || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {client.phone || "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                        {client.address?.city ? `${client.address.city}/${client.address.state}` : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewClient(client)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClient(client)}
                            className="text-primary hover:text-blue-900"
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Client Modal */}
      {isModalOpen && (
        <ClientModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          initialData={selectedClient}
        />
      )}
      
      {/* Client Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Cliente</DialogTitle>
          </DialogHeader>
          {selectedClientId && <ClientDetail clientId={selectedClientId} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
