import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

export default function ReminderBanner() {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState<number[]>([]);

  const { data: reminders = [] } = useQuery<any[]>({
    queryKey: ["/api/tickets/reminders"],
    refetchInterval: 5 * 60 * 1000,
  });

  const clearReminderMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PUT", `/api/tickets/${id}/reminder`, { reminderDate: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/reminders"] });
    },
  });

  const visible = (reminders as any[]).filter((r: any) => !dismissed.includes(r.id));

  if (!visible || visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {visible.map((ticket: any) => (
        <div
          key={ticket.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 shadow-sm"
        >
          <Bell className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-900">
              Lembrete: Chamado #{ticket.id} — {ticket.title}
            </p>
            <p className="text-xs text-amber-700">
              Agendado para {ticket.reminderDate
                ? format(new Date(ticket.reminderDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100"
              onClick={() => navigate(`/tickets`)}
            >
              <ExternalLink className="h-3 w-3 mr-1" /> Ver
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-amber-700 hover:bg-amber-100"
              title="Dispensar e limpar lembrete"
              onClick={() => {
                clearReminderMutation.mutate(ticket.id);
                setDismissed((prev) => [...prev, ticket.id]);
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
