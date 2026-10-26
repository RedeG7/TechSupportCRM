import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import InvestmentModal from "@/components/investments/InvestmentModal";
import RevenueModal from "@/components/investments/RevenueModal";
import { Pie, Bar } from "react-chartjs-2";
import { 
  Plus, 
  Search, 
  Filter, 
  Edit,
  Trash2,
  Calendar,
  DollarSign,
  Calculator,
  TrendingUp,
  CreditCard,
  CheckCircle,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import type { Investment, Revenue } from "@shared/schema";

export default function Investments() {
  const [activeTab, setActiveTab] = useState("investments");
  const [isInvestmentModalOpen, setIsInvestmentModalOpen] = useState(false);
  const [isRevenueModalOpen, setIsRevenueModalOpen] = useState(false);
  const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);
  const [selectedRevenue, setSelectedRevenue] = useState<Revenue | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [revenueSearchTerm, setRevenueSearchTerm] = useState("");
  const [revenueCategoryFilter, setRevenueCategoryFilter] = useState("all");
  const [revenueStatusFilter, setRevenueStatusFilter] = useState("all");
  const [revenueTypeFilter, setRevenueTypeFilter] = useState("all");
  
  const { toast } = useToast();
  
  const { data: investments = [], isLoading: isLoadingInvestments } = useQuery({
    queryKey: ["/api/investments"],
  });
  
  const { data: revenues = [], isLoading: isLoadingRevenues } = useQuery({
    queryKey: ["/api/revenues"],
  });
  
  const { data: clients = [] } = useQuery({
    queryKey: ["/api/clients"],
  });
  
  // Type assertions for data coming from the API
  const typedInvestments = investments as Investment[];
  const typedRevenues = revenues as Revenue[];
  const typedClients = clients as any[];
  
  const filteredInvestments = typedInvestments.filter((investment: Investment) => {
    if (!searchTerm && categoryFilter === "all") return true;
    
    let matchesSearch = true;
    let matchesCategory = true;
    
    if (searchTerm) {
      const client = typedClients.find((c: any) => c.id === investment.clientId);
      const clientName = client ? client.businessName : "";
      const search = searchTerm.toLowerCase();
      
      matchesSearch = (
        clientName.toLowerCase().includes(search) ||
        investment.description?.toLowerCase().includes(search) ||
        investment.category.toLowerCase().includes(search)
      );
    }
    
    if (categoryFilter !== "all") {
      matchesCategory = investment.category === categoryFilter;
    }
    
    return matchesSearch && matchesCategory;
  });
  
  // Calculate total investment amount
  const totalInvestment = filteredInvestments.reduce((total: number, inv: Investment) => 
    total + (inv.amount || 0), 0);
  
  // Prepare data for investment by category chart
  const investmentsByCategory = filteredInvestments.reduce((acc: any, inv: Investment) => {
    if (!acc[inv.category]) {
      acc[inv.category] = 0;
    }
    acc[inv.category] += inv.amount;
    return acc;
  }, {});
  
  const categoryChartData = {
    labels: Object.keys(investmentsByCategory),
    datasets: [
      {
        data: Object.values(investmentsByCategory),
        backgroundColor: [
          '#0078D4',  // primary
          '#107C10',  // secondary
          '#5C2D91',  // accent
          '#FFB900',  // warning
          '#D83B01',  // error
        ],
        borderWidth: 1,
      }
    ],
  };
  
  // Get unique categories for filter - converting Set to Array
  const categories = Array.from(new Set(typedInvestments.map(inv => inv.category)));
  
  // Filter revenues
  const filteredRevenues = typedRevenues.filter((revenue: Revenue) => {
    if (!revenueSearchTerm && revenueCategoryFilter === "all" && revenueStatusFilter === "all" && revenueTypeFilter === "all") return true;
    
    let matchesSearch = true;
    let matchesCategory = true;
    let matchesStatus = true;
    let matchesType = true;
    
    if (revenueSearchTerm) {
      const client = typedClients.find((c: any) => c.id === revenue.clientId);
      const clientName = client ? client.businessName : "";
      const search = revenueSearchTerm.toLowerCase();
      
      matchesSearch = (
        clientName.toLowerCase().includes(search) ||
        revenue.description.toLowerCase().includes(search) ||
        revenue.category.toLowerCase().includes(search)
      );
    }
    
    if (revenueCategoryFilter !== "all") {
      matchesCategory = revenue.category === revenueCategoryFilter;
    }
    
    if (revenueStatusFilter !== "all") {
      matchesStatus = revenue.paymentStatus === revenueStatusFilter;
    }
    
    if (revenueTypeFilter !== "all") {
      matchesType = revenueTypeFilter === "recurring" ? revenue.isRecurring : !revenue.isRecurring;
    }
    
    return matchesSearch && matchesCategory && matchesStatus && matchesType;
  });
  
  // Calculate total revenue amount
  const totalRevenue = filteredRevenues.reduce((total: number, rev: Revenue) => 
    total + rev.amount, 0);
  
  // Get unique revenue categories for filter - converting Set to Array
  const revenueCategories = Array.from(new Set(typedRevenues.map(rev => rev.category)));
  
  const handleCreateInvestment = () => {
    setSelectedInvestment(null);
    setIsInvestmentModalOpen(true);
  };
  
  const handleEditInvestment = (investment: Investment) => {
    setSelectedInvestment(investment);
    setIsInvestmentModalOpen(true);
  };
  
  const handleCreateRevenue = () => {
    setSelectedRevenue(null);
    setIsRevenueModalOpen(true);
  };
  
  const handleEditRevenue = (revenue: Revenue) => {
    setSelectedRevenue(revenue);
    setIsRevenueModalOpen(true);
  };
  
  const getClientName = (clientId: number) => {
    const client = typedClients.find((c: any) => c.id === clientId);
    return client ? client.businessName : "Cliente desconhecido";
  };
  
  const getPaymentStatusText = (status: string) => {
    switch(status) {
      case "paid": return "Pago";
      case "pending": return "Pendente";
      case "overdue": return "Atrasado";
      default: return status;
    }
  };
  
  const getPaymentStatusColor = (status: string) => {
    switch(status) {
      case "paid": return "text-green-600";
      case "pending": return "text-amber-600";
      case "overdue": return "text-red-600";
      default: return "text-neutral-600";
    }
  };
  
  return (
    <section className="p-4 md:p-8">
      <Tabs defaultValue="investments" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center justify-between mb-6">
          <TabsList>
            <TabsTrigger value="investments">Despesas</TabsTrigger>
            <TabsTrigger value="revenues">Receitas</TabsTrigger>
          </TabsList>
          
          {activeTab === "investments" ? (
            <Button onClick={handleCreateInvestment} className="flex items-center">
              <Plus className="h-4 w-4 mr-2" /> Nova Despesa
            </Button>
          ) : (
            <Button onClick={handleCreateRevenue} className="flex items-center">
              <Plus className="h-4 w-4 mr-2" /> Nova Receita
            </Button>
          )}
        </div>
      
        <TabsContent value="investments" className="mt-0">
          {/* Investment Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Despesa Total</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">
                      R$ {totalInvestment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-md">
                    <DollarSign className="text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">ROI Médio</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">18.5%</p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-md">
                    <Calculator className="text-secondary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Despesas Ativas</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">{filteredInvestments.length}</p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-md">
                    <TrendingUp className="text-accent" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Investment Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-neutral-700">Despesas por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Pie
                    data={categoryChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          position: 'right',
                        },
                        tooltip: {
                          callbacks: {
                            label: function(context) {
                              const label = context.label || '';
                              const value = context.raw as number;
                              const total = context.dataset.data.reduce((acc: any, data: any) => acc + data, 0);
                              const percentage = Math.round((value / total) * 100);
                              return `${label}: R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${percentage}%)`;
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-neutral-700">ROI por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Bar
                    data={{
                      labels: categories,
                      datasets: [
                        {
                          label: 'ROI Esperado (%)',
                          data: categories.map(() => Math.floor(Math.random() * 25) + 10), // Sample data
                          backgroundColor: '#0078D4',
                        }
                      ]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        y: {
                          beginAtZero: true,
                          title: {
                            display: true,
                            text: 'ROI (%)',
                          }
                        }
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Investment Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Pesquisar despesas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {categories.map((category: string) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          
          {/* Investments Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-neutral-700">Lista de Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingInvestments ? (
                <div className="text-center py-8">Carregando...</div>
              ) : filteredInvestments.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  Nenhuma despesa encontrada.
                  {(searchTerm || categoryFilter !== "all") && " Tente ajustar seus filtros."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Cliente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Categoria</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Valor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">ROI Esperado</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Prazo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {filteredInvestments.map((investment: Investment) => (
                        <tr key={investment.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                            {getClientName(investment.clientId)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {investment.category}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                            R$ {investment.amount?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {format(new Date(investment.date), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {investment.expectedRoi ? `${investment.expectedRoi}%` : "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {investment.returnPeriod || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditInvestment(investment)}
                              className="text-primary hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="revenues" className="mt-0">
          {/* Revenue Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Receita Total</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">
                      R$ {totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-md">
                    <DollarSign className="text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Clientes com Receitas</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">
                      {new Set(filteredRevenues.map(rev => rev.clientId)).size}
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-md">
                    <CheckCircle className="text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-neutral-500 text-sm font-medium">Receitas Pendentes</p>
                    <p className="text-3xl font-semibold mt-1 text-neutral-700">
                      {filteredRevenues.filter(rev => rev.paymentStatus === "pending").length}
                    </p>
                  </div>
                  <div className="p-3 bg-amber-100 rounded-md">
                    <Clock className="text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Revenue Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <Input
                    placeholder="Pesquisar receitas..."
                    value={revenueSearchTerm}
                    onChange={(e) => setRevenueSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={revenueCategoryFilter} onValueChange={setRevenueCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as categorias</SelectItem>
                    {revenueCategories.map((category: string) => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={revenueStatusFilter} onValueChange={setRevenueStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status de Pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="overdue">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={revenueTypeFilter} onValueChange={setRevenueTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo de Receita" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="recurring">Recorrente</SelectItem>
                    <SelectItem value="single">Única</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          
          {/* Revenues Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-neutral-700">Lista de Receitas</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingRevenues ? (
                <div className="text-center py-8">Carregando...</div>
              ) : filteredRevenues.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  Nenhuma receita encontrada.
                  {(revenueSearchTerm || revenueCategoryFilter !== "all" || revenueStatusFilter !== "all" || revenueTypeFilter !== "all") && " Tente ajustar seus filtros."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Cliente</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Descrição</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Categoria</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Valor</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Data</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Tipo</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-neutral-200">
                      {filteredRevenues.map((revenue: Revenue) => (
                        <tr key={revenue.id} className="hover:bg-neutral-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-900">
                            {getClientName(revenue.clientId)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {revenue.description}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {revenue.category}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-neutral-900">
                            R$ {revenue.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {format(new Date(revenue.date), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm ${getPaymentStatusColor(revenue.paymentStatus)}`}>
                            {getPaymentStatusText(revenue.paymentStatus)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-neutral-500">
                            {revenue.isRecurring ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Recorrente
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-800">
                                Única
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditRevenue(revenue)}
                              className="text-primary hover:text-blue-900"
                            >
                              <Edit className="h-4 w-4 mr-1" />
                              Editar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Investment Modal */}
      {isInvestmentModalOpen && (
        <InvestmentModal
          isOpen={isInvestmentModalOpen}
          onClose={() => setIsInvestmentModalOpen(false)}
          initialData={selectedInvestment}
        />
      )}
      
      {/* Revenue Modal */}
      {isRevenueModalOpen && (
        <RevenueModal
          isOpen={isRevenueModalOpen}
          onClose={() => setIsRevenueModalOpen(false)}
          initialData={selectedRevenue}
        />
      )}
    </section>
  );
}
