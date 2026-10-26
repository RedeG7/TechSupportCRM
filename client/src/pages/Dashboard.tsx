import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketIcon, Clock, CheckCircle, Star, Download } from "lucide-react";
import MetricCard from "@/components/dashboard/MetricCard";
import TicketTable from "@/components/dashboard/TicketTable";
import ChartSection from "@/components/dashboard/ChartSection";
import { Link } from "wouter";

export default function Dashboard() {
  const [timeframe, setTimeframe] = useState("month");
  
  // Mapeamento dos valores do select para parâmetros da API
  const timeframeMap: Record<string, string> = {
    "day": "day",
    "week": "week",
    "month": "month",
    "year": "year"
  };
  
  const apiTimeframe = timeframeMap[timeframe];
  
  const { data: metrics, isLoading: isLoadingMetrics } = useQuery({
    queryKey: ["/api/dashboard/metrics", apiTimeframe],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/metrics?timeframe=${apiTimeframe}`);
      if (!response.ok) {
        throw new Error("Erro ao carregar métricas");
      }
      return response.json();
    },
    refetchInterval: 3000,
    refetchIntervalInBackground: true,
  });
  
  const handleExport = () => {
    // This would handle exporting dashboard data in a real application
    alert("Exportação de dados não disponível nesta versão demo");
  };
  
  // Obter texto do período selecionado para exibição
  const getTimeframeText = (timeframe: string): string => {
    switch(timeframe) {
      case 'day': return 'hoje';
      case 'week': return 'esta semana';
      case 'month': return 'este mês';
      case 'year': return 'este ano';
      default: return 'este período';
    }
  };
  
  return (
    <section className="p-4 md:p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-neutral-700">Dashboard</h2>
        <div className="flex space-x-2">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="bg-white border border-neutral-300 rounded-md text-sm w-40">
              <SelectValue placeholder="Selecione período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Hoje</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} className="flex items-center">
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {isLoadingMetrics ? (
          // Loading state
          Array(4).fill(0).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-5 w-2/3 mb-2" />
              <Skeleton className="h-10 w-1/3 mb-4" />
              <Skeleton className="h-4 w-4/5" />
            </Card>
          ))
        ) : (
          // Loaded state
          <>
            <MetricCard
              title="Chamados Abertos"
              value={typeof metrics?.openTickets === 'number' ? metrics.openTickets : 0}
              icon={<TicketIcon className="text-primary" />}
              change={0}
              changeText={getTimeframeText(timeframe)}
              iconBgColor="bg-blue-100"
            />
            <MetricCard
              title="Tempo Médio de Resolução"
              value={`${typeof metrics?.avgResolutionTime === 'number' ? metrics.avgResolutionTime.toFixed(1) : '0.0'}h`}
              icon={<Clock className="text-secondary" />}
              change={0}
              changeText={getTimeframeText(timeframe)}
              iconBgColor="bg-green-100"
            />
            <MetricCard
              title="Taxa de Resolução"
              value={`${typeof metrics?.resolutionRate === 'number' ? metrics.resolutionRate.toFixed(0) : '0'}%`}
              icon={<CheckCircle className="text-accent" />}
              change={0}
              changeText={getTimeframeText(timeframe)}
              iconBgColor="bg-purple-100"
            />
            <MetricCard
              title="Satisfação do Cliente"
              value={`${typeof metrics?.customerSatisfaction === 'number' ? metrics.customerSatisfaction.toFixed(1) : '0.0'}/100`}
              icon={<Star className="text-warning" />}
              change={0}
              changeText={getTimeframeText(timeframe)}
              iconBgColor="bg-yellow-100"
            />
          </>
        )}
      </div>

      {/* Charts */}
      <ChartSection timeframe={apiTimeframe} />

      {/* Recent Tickets */}
      <Card className="mb-8">
        <div className="p-6 border-b border-neutral-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-neutral-700">Chamados Recentes</h3>
            <Link href="/tickets">
              <Button variant="link" className="text-primary">
                Ver Todos
              </Button>
            </Link>
          </div>
        </div>
        <TicketTable limit={5} />
      </Card>
    </section>
  );
}
