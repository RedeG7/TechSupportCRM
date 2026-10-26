import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Line, Doughnut } from "react-chartjs-2";

interface ChartProps {
  timeframe: string;
}

export function CategoryChart({ timeframe }: ChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/dashboard/tickets-by-category", timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/tickets-by-category?timeframe=${timeframe}`);
      if (!response.ok) {
        throw new Error("Erro ao carregar dados por categoria");
      }
      return response.json();
    },
    refetchInterval: 60000, // Atualiza a cada 1 minuto
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-neutral-500">Nenhum dado disponível para este período</p>
      </div>
    );
  }

  const chartData = {
    labels: data.map((item: any) => item.category),
    datasets: [
      {
        data: data.map((item: any) => item.count),
        backgroundColor: [
          '#0078D4', // primary
          '#107C10', // secondary
          '#5C2D91', // accent
          '#FFB900', // warning
          '#D83B01', // error
          '#605E5C'  // neutral
        ],
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right' as const,
      },
    },
  };

  return (
    <Doughnut data={chartData} options={options} />
  );
}

export function ResolutionTimeChart({ timeframe }: ChartProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/dashboard/resolution-time-history", timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/dashboard/resolution-time-history?timeframe=${timeframe}`);
      if (!response.ok) {
        throw new Error("Erro ao carregar histórico de tempo de resolução");
      }
      return response.json();
    },
    refetchInterval: 60000, // Atualiza a cada 1 minuto
    refetchIntervalInBackground: true,
  });

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center">
        <p className="text-neutral-500">Nenhum dado disponível para este período</p>
      </div>
    );
  }

  const chartData = {
    labels: data.map((item: any) => item.date),
    datasets: [
      {
        label: 'Tempo Médio (horas)',
        data: data.map((item: any) => item.hours),
        borderColor: '#0078D4',
        backgroundColor: 'rgba(0, 120, 212, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Horas',
        },
      },
    },
  };

  return (
    <Line data={chartData} options={options} />
  );
}

// Obter título apropriado para o gráfico baseado no timeframe
const getTimeframeTitle = (timeframe: string): string => {
  switch(timeframe) {
    case 'day': return 'hoje';
    case 'week': return 'últimos 7 dias';
    case 'month': return 'últimos 30 dias';
    case 'year': return 'último ano';
    default: return 'período selecionado';
  }
};

interface ChartSectionProps {
  timeframe: string;
}

export default function ChartSection({ timeframe = 'month' }: ChartSectionProps) {
  const timeframeTitle = getTimeframeTitle(timeframe);
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-neutral-700">
            Chamados por Categoria ({timeframeTitle})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <CategoryChart timeframe={timeframe} />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-neutral-700">
            Tempo de Resolução ({timeframeTitle})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <ResolutionTimeChart timeframe={timeframe} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
