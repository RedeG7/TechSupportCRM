import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Bell, X, ExternalLink, ChevronDown, ChevronUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import TicketModal from "@/components/tickets/TicketModal";

export default function ReminderOverlay() {
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);

  const { data: reminders = [] } = useQuery<any[]>({
    queryKey: ["/api/tickets/reminders"],
    refetchInterval: 30 * 1000, // verifica a cada 30 segundos
  });

  const clearReminderMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PUT", `/api/tickets/${id}/reminder`, { reminderDate: null, reminderNote: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/reminders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
    },
  });

  const visible = (reminders as any[]).filter((r: any) => !dismissed.includes(r.id));

  if (!visible || visible.length === 0) return null;

  return (
    <>
      {/* Painel fixo – canto inferior direito */}
      <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] flex flex-col gap-2 drop-shadow-xl">

        {/* Cabeçalho clicável para recolher/expandir */}
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-amber-500 text-white shadow-lg cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 animate-pulse" />
            <span className="text-sm font-semibold">
              {visible.length} lembrete{visible.length > 1 ? "s" : ""} pendente{visible.length > 1 ? "s" : ""}
            </span>
          </div>
          {collapsed
            ? <ChevronUp className="h-4 w-4 opacity-80" />
            : <ChevronDown className="h-4 w-4 opacity-80" />}
        </div>

        {/* Cartões de lembrete */}
        {!collapsed && (
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
            {visible.map((ticket: any) => (
              <div
                key={ticket.id}
                className="rounded-lg bg-white border border-amber-200 shadow-lg overflow-hidden"
              >
                {/* Faixa de título */}
                <div className="bg-amber-50 px-3 py-2 flex items-start justify-between gap-2 border-b border-amber-100">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Bell className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-amber-900 truncate">
                      Chamado #{ticket.id} — {ticket.title}
                    </p>
                  </div>
                  <button
                    className="p-0.5 rounded text-amber-400 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                    title="Dispensar lembrete"
                    onClick={() => {
                      clearReminderMutation.mutate(ticket.id);
                      setDismissed((prev) => [...prev, ticket.id]);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="px-3 pt-2 pb-3 space-y-2">
                  {/* O que precisa ser lembrado */}
                  {ticket.reminderNote && (
                    <div className="bg-amber-50 rounded p-2 border border-amber-100">
                      <p className="text-xs font-medium text-amber-800 mb-0.5">O que fazer:</p>
                      <p className="text-xs text-neutral-700 leading-relaxed">{ticket.reminderNote}</p>
                    </div>
                  )}

                  {/* Horário agendado */}
                  {ticket.reminderDate && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-600">
                      <Clock className="h-3 w-3 flex-shrink-0" />
                      <span>
                        Agendado para{" "}
                        <strong>
                          {format(new Date(ticket.reminderDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </strong>
                      </span>
                    </div>
                  )}

                  {/* Botão abrir chamado */}
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white border-0 flex items-center gap-1.5"
                    onClick={() => setOpenTicketId(ticket.id)}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Abrir chamado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal do chamado */}
      {openTicketId !== null && (
        <TicketModal
          ticketId={openTicketId}
          isOpen={true}
          onClose={() => setOpenTicketId(null)}
        />
      )}
    </>
  );
}
