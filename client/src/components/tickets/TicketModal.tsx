import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send, CheckCircle, Printer, Bell, X, Paperclip } from "lucide-react";

interface TicketModalProps {
  ticketId: number;
  isOpen: boolean;
  onClose: () => void;
}

export default function TicketModal({ ticketId, isOpen, onClose }: TicketModalProps) {
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { toast } = useToast();

  const { data: ticket, isLoading: isLoadingTicket } = useQuery({
    queryKey: ["/api/tickets", ticketId],
    queryFn: async () => {
      const response = await fetch(`/api/tickets/${ticketId}`);
      if (!response.ok) throw new Error("Failed to fetch ticket");
      return response.json();
    },
    enabled: isOpen && !!ticketId,
  });

  const { data: client } = useQuery({
    queryKey: ["/api/clients", ticket?.clientId],
    queryFn: async () => {
      const response = await fetch(`/api/clients/${ticket.clientId}`);
      if (!response.ok) throw new Error("Failed to fetch client");
      return response.json();
    },
    enabled: !!ticket?.clientId,
  });

  const { data: activities = [], isLoading: isLoadingActivities } = useQuery({
    queryKey: ["/api/tickets", ticketId, "activities"],
    queryFn: async () => {
      const response = await fetch(`/api/tickets/${ticketId}/activities`);
      if (!response.ok) throw new Error("Failed to fetch activities");
      return response.json();
    },
    enabled: isOpen && !!ticketId,
  });

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status || "");
      setPriority(ticket.priority || "");
      setAssignedTo(ticket.assignedTo ? String(ticket.assignedTo) : "");
      setReminderDate(ticket.reminderDate ? format(new Date(ticket.reminderDate), "yyyy-MM-dd'T'HH:mm") : "");
      setReminderNote(ticket.reminderNote || "");
    }
  }, [ticket?.id]);

  const reminderMutation = useMutation({
    mutationFn: (data: { date: string | null; note?: string }) =>
      apiRequest("PUT", `/api/tickets/${ticketId}/reminder`, {
        reminderDate: data.date ? new Date(data.date).toISOString() : null,
        reminderNote: data.note ?? reminderNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/reminders"] });
      toast({ title: "Lembrete salvo", description: "Lembrete configurado com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro", description: `${error}`, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", `/api/tickets/${ticketId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId] });
      toast({ title: "Chamado atualizado", description: "O chamado foi atualizado com sucesso." });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Erro", description: `Erro ao atualizar chamado: ${error}`, variant: "destructive" });
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest("POST", `/api/tickets/${ticketId}/comment`, {
        comment: content,
      });
    },
    onSuccess: () => {
      setComment("");
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId, "activities"] });
      toast({ title: "Comentário adicionado", description: "Seu comentário foi adicionado com sucesso." });
    },
    onError: (error) => {
      toast({ title: "Erro", description: `Erro ao adicionar comentário: ${error}`, variant: "destructive" });
    },
  });

  const closeTicketMutation = useMutation({
    mutationFn: async (resolutionNote: string) => {
      return apiRequest("POST", `/api/tickets/${ticketId}/close`, { resolutionNote });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/metrics"] });
      toast({ title: "Chamado finalizado", description: "O chamado foi finalizado com sucesso." });
      onClose();
    },
    onError: (error) => {
      toast({ title: "Erro", description: `Erro ao finalizar chamado: ${error}`, variant: "destructive" });
    },
  });

  const handleUpdate = () => {
    const updatedData: any = {};
    if (status !== ticket.status) updatedData.status = status;
    if (priority !== ticket.priority) updatedData.priority = priority;
    const currentAssigned = ticket.assignedTo ? String(ticket.assignedTo) : "";
    if (assignedTo !== currentAssigned) {
      updatedData.assignedTo = assignedTo ? parseInt(assignedTo) : null;
    }
    if (Object.keys(updatedData).length > 0) updateMutation.mutate(updatedData);
    if (comment.trim()) addCommentMutation.mutate(comment);
  };

  const handleCloseTicket = () => {
    if (resolution.trim()) {
      closeTicketMutation.mutate(resolution);
    } else {
      toast({
        title: "Erro",
        description: "Por favor, descreva a solução aplicada antes de finalizar o chamado.",
        variant: "destructive",
      });
    }
  };

  // Helper: normalizes an attachment (object or string) into a URL
  const getAttachmentUrl = (attachment: any): string => {
    if (typeof attachment === 'string') return attachment;
    if (attachment && typeof attachment === 'object') {
      if (attachment.filePath) return attachment.filePath;
      if (attachment.filename) return `/uploads/${attachment.filename}`;
      if (attachment.url) return attachment.url;
    }
    return '';
  };

  const getAttachmentName = (attachment: any): string => {
    if (typeof attachment === 'string') return attachment.split('/').pop() || 'Arquivo';
    if (attachment && typeof attachment === 'object') {
      return attachment.originalName || attachment.filename || 'Arquivo';
    }
    return 'Arquivo';
  };

  const isImageAttachment = (attachment: any): boolean => {
    const url = getAttachmentUrl(attachment);
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(url);
  };

  const handlePrint = () => {
    if (!ticket) return;

    const statusLabels: Record<string, string> = {
      new: "Novo", novo: "Novo", aberto: "Aberto", open: "Aberto",
      in_progress: "Em Andamento", em_andamento: "Em Andamento",
      waiting_client: "Aguardando Cliente", respondido: "Respondido",
      resolved: "Resolvido", resolvido: "Resolvido",
      closed: "Fechado", fechado: "Fechado",
      cancelled: "Cancelado", cancelado: "Cancelado",
    };

    const priorityLabels: Record<string, string> = {
      high: "Alta", alta: "Alta",
      medium: "Média", media: "Média", média: "Média",
      low: "Baixa", baixa: "Baixa",
    };

    const baseUrl = window.location.origin;

    const activitiesHtml = (activities as any[]).map((act: any) => {
      const attachmentsArr: any[] = Array.isArray(act.attachments) ? act.attachments : [];
      const attachmentsHtml = attachmentsArr.length > 0 ? `
        <div style="margin-top:8px;">
          <p style="font-size:11px;color:#6b7280;font-weight:600;margin-bottom:4px;">Anexos:</p>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${attachmentsArr.map((att: any) => {
              const url = getAttachmentUrl(att);
              const name = getAttachmentName(att);
              const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
              if (isImageAttachment(att)) {
                return `<div style="border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">
                  <img src="${fullUrl}" alt="${name}" style="max-width:200px;max-height:150px;object-fit:contain;display:block;" />
                  <p style="font-size:10px;color:#6b7280;padding:2px 4px;margin:0;">${name}</p>
                </div>`;
              } else {
                return `<a href="${fullUrl}" style="font-size:11px;color:#2563eb;text-decoration:underline;">📎 ${name}</a>`;
              }
            }).join('')}
          </div>
        </div>
      ` : '';
      return `
        <div style="border-bottom: 1px solid #e5e7eb; padding: 10px 0;">
          <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
            <strong>${act.userInfo ? `${act.userInfo.name} (Suporte)` : act.contactInfo ? `${act.contactInfo.name} (Cliente)` : "Sistema"}</strong>
            <span>${format(new Date(act.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 13px; white-space: pre-wrap;">${act.content}</p>
          ${attachmentsHtml}
        </div>
      `;
    }).join("");

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Chamado #${ticket.id}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; padding: 30px; color: #111827; }
          .header { background: #8B1A1A; color: white; padding: 20px 24px; margin-bottom: 24px; }
          .header h1 { font-size: 20px; font-weight: 700; }
          .header p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
          .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .info-table td { padding: 6px 10px; font-size: 13px; border: 1px solid #e5e7eb; vertical-align: top; }
          .info-table .lbl { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; display: block; }
          .info-table .val { font-weight: 600; color: #111827; }
          .section { margin-bottom: 20px; }
          .section h3 { font-size: 12px; color: #8B1A1A; text-transform: uppercase; letter-spacing: .06em; border-bottom: 2px solid #8B1A1A; padding-bottom: 5px; margin-bottom: 10px; font-weight: 700; }
          .content-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; font-size: 13px; line-height: 1.6; }
          .resolution-box { background: #ecfdf5; border: 1px solid #86efac; border-radius: 4px; padding: 12px; font-size: 13px; }
          .activity { border-bottom: 1px solid #e5e7eb; padding: 10px 0; }
          .activity-meta { display: flex; justify-content: space-between; font-size: 11px; color: #6b7280; margin-bottom: 4px; }
          .attach-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
          .footer { text-align: center; font-size: 10px; color: #9ca3af; padding: 12px; border-top: 1px solid #e5e7eb; margin-top: 20px; }
          @media print { body { padding: 15px; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RedeG7 Solu&ccedil;&otilde;es em TI &mdash; Chamado #${ticket.id}</h1>
          <p>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>

        <table class="info-table">
          <tr>
            <td><span class="lbl">Cliente</span><span class="val">${client?.businessName || "—"}</span></td>
            <td><span class="lbl">Status</span><span class="val">${statusLabels[ticket.status] || ticket.status}</span></td>
            <td><span class="lbl">Prioridade</span><span class="val">${priorityLabels[ticket.priority] || ticket.priority}</span></td>
          </tr>
          <tr>
            <td><span class="lbl">Categoria</span><span class="val">${ticket.category || "—"}</span></td>
            <td><span class="lbl">Aberto em</span><span class="val">${format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></td>
            <td><span class="lbl">Finalizado em</span><span class="val">${ticket.resolvedAt ? format(new Date(ticket.resolvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}</span></td>
          </tr>
        </table>

        <div class="section">
          <h3>T&iacute;tulo</h3>
          <div class="content-box">${ticket.title}</div>
        </div>

        <div class="section">
          <h3>Descri&ccedil;&atilde;o</h3>
          <div class="content-box" style="white-space:pre-wrap">${ticket.description || "—"}</div>
        </div>

        ${Array.isArray(ticket.attachments) && ticket.attachments.length > 0 ? `
        <div class="section">
          <h3>Anexos do Chamado (${ticket.attachments.length})</h3>
          <div class="attach-grid">
            ${(ticket.attachments as any[]).map((att: any) => {
              const url = getAttachmentUrl(att);
              const name = getAttachmentName(att);
              const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
              if (isImageAttachment(att)) {
                return `<div style="border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;display:inline-block">
                  <img src="${fullUrl}" alt="${name}" style="max-width:200px;max-height:150px;object-fit:contain;display:block" />
                  <p style="font-size:10px;color:#6b7280;padding:3px 6px;margin:0;background:#f9fafb">${name}</p>
                </div>`;
              }
              return `<a href="${fullUrl}" style="font-size:12px;color:#8B1A1A;border:1px solid #fca5a5;border-radius:4px;padding:4px 8px;text-decoration:none;background:#fff7f7">&#128206; ${name}</a>`;
            }).join('')}
          </div>
        </div>` : ''}

        ${ticket.resolutionNote ? `
        <div class="section">
          <h3>Solu&ccedil;&atilde;o Aplicada</h3>
          <div class="resolution-box">${ticket.resolutionNote}</div>
        </div>` : ""}

        ${activitiesHtml ? `
        <div class="section">
          <h3>Hist&oacute;rico de Atividades</h3>
          ${activitiesHtml}
        </div>` : ""}

        <div class="footer">RedeG7 Solu&ccedil;&otilde;es em TI &middot; Sistema de Helpdesk</div>
      </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  if (isLoadingTicket) {
    return (
      <Dialog open={isOpen} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-3xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin mr-2" />
            <span>Carregando...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!ticket) return null;

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh] w-[95vw] sm:w-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="text-lg font-semibold text-neutral-700">
              Detalhes do Chamado #{ticket.id}
            </DialogTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="flex items-center gap-1 text-xs h-8"
            >
              <Printer className="h-3 w-3" />
              Imprimir PDF
            </Button>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
          <div>
            <p className="text-sm text-neutral-500 mb-1">Cliente</p>
            <p className="font-medium">{client?.businessName || "Carregando..."}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Contato</p>
            <p className="font-medium">{client?.email || "Carregando..."}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Aberto em</p>
            <p className="font-medium">
              {format(new Date(ticket.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </p>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Criado por</p>
            <p className="font-medium">{(ticket as any).openedByName || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Responsável</p>
            <Select
              value={assignedTo || (ticket.assignedTo ? String(ticket.assignedTo) : "__none__")}
              onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Não atribuído</SelectItem>
                {(users as any[]).map((u: any) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Status</p>
            <Select value={status || ticket.status} onValueChange={(value) => setStatus(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione o status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="in_progress">Em Progresso</SelectItem>
                <SelectItem value="waiting_client">Aguardando Cliente</SelectItem>
                <SelectItem value="resolved">Resolvido</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Categoria</p>
            <p className="font-medium">{ticket.category}</p>
          </div>
          <div>
            <p className="text-sm text-neutral-500 mb-1">Prioridade</p>
            <Select value={priority || ticket.priority} onValueChange={(value) => setPriority(value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione a prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mb-4 sm:mb-6">
          <p className="text-sm text-neutral-500 mb-1">Título</p>
          <p className="font-medium text-sm sm:text-base break-words">{ticket.title}</p>
        </div>

        <div className="mb-4 sm:mb-6">
          <p className="text-sm text-neutral-500 mb-1">Descrição</p>
          <p className="text-neutral-700 text-sm sm:text-base break-words whitespace-pre-wrap">{ticket.description}</p>
        </div>

        {/* Ticket-level attachments */}
        {Array.isArray((ticket as any).attachments) && (ticket as any).attachments.length > 0 && (
          <div className="mb-4 sm:mb-6">
            <p className="text-sm text-neutral-500 mb-2 flex items-center gap-1">
              <Paperclip className="h-3.5 w-3.5" />
              Anexos do Chamado ({(ticket as any).attachments.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {((ticket as any).attachments as any[]).map((attachment: any, index: number) => {
                const url = getAttachmentUrl(attachment);
                const name = getAttachmentName(attachment);
                const isImg = isImageAttachment(attachment);
                if (!url) return null;
                return (
                  <div key={index} className="flex flex-col items-center bg-gray-100 rounded p-1 max-w-[120px]">
                    {isImg ? (
                      <>
                        <img
                          src={url}
                          alt={name}
                          className="w-20 h-20 rounded object-cover hover:opacity-80 transition-opacity cursor-pointer border border-gray-200"
                          onClick={() => setPreviewImage(url)}
                          onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                        />
                        <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">{name}</span>
                      </>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 py-2 px-1">
                        <Paperclip className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[90px]">{name}</span>
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-4 sm:mb-6">
          <p className="text-sm text-neutral-500 mb-2">Histórico de Atividades</p>
          <div className="space-y-3 max-h-32 sm:max-h-40 overflow-y-auto p-2 sm:p-3 bg-neutral-50 rounded-md">
            {isLoadingActivities ? (
              <div className="flex items-center justify-center py-3">
                <Loader2 className="animate-spin mr-2 h-4 w-4" />
                <span className="text-xs sm:text-sm">Carregando atividades...</span>
              </div>
            ) : activities.length > 0 ? (
              (activities as any[]).map((activity: any) => (
                <div key={activity.id} className="pb-2 sm:pb-3 border-b border-neutral-200 last:border-0">
                  <div className="flex flex-wrap justify-between">
                    <p className="text-xs sm:text-sm font-medium">
                      {activity.userInfo ?
                        `${activity.userInfo.name} (Suporte)` :
                        activity.contactInfo ?
                          `${activity.contactInfo.name} (Cliente)` :
                          "Sistema"
                      }
                    </p>
                    <p className="text-xs text-neutral-500">
                      {format(new Date(activity.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <p className="text-xs sm:text-sm mt-1 break-words whitespace-pre-wrap">{activity.content}</p>

                  {activity.attachments && activity.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-gray-600">Anexos:</p>
                      <div className="flex flex-wrap gap-2">
                        {activity.attachments.map((attachment: any, index: number) => {
                          const url = getAttachmentUrl(attachment);
                          const name = getAttachmentName(attachment);
                          const isImg = isImageAttachment(attachment);
                          if (!url) return null;
                          return (
                            <div key={index} className="flex flex-col items-center bg-gray-100 rounded p-1 max-w-[120px]">
                              {isImg ? (
                                <>
                                  <img
                                    src={url}
                                    alt={name}
                                    className="w-20 h-20 rounded object-cover hover:opacity-80 transition-opacity cursor-pointer border border-gray-200"
                                    onClick={() => setPreviewImage(url)}
                                    onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
                                  />
                                  <span className="text-[10px] text-gray-500 mt-1 truncate w-full text-center">{name}</span>
                                </>
                              ) : (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 py-1">
                                  <span>📎</span>
                                  <span className="truncate max-w-[90px]">{name}</span>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-center text-xs sm:text-sm text-neutral-500 py-2">Nenhuma atividade registrada</p>
            )}
          </div>
        </div>

        <div className="mb-4 sm:mb-6">
          <p className="text-sm text-neutral-500 mb-1 sm:mb-2">Adicionar Comentário</p>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="h-20 sm:h-24 text-xs sm:text-sm"
            placeholder="Digite seu comentário aqui..."
          />
        </div>

        <div className="mb-4 sm:mb-6">
          <p className="text-sm text-neutral-500 mb-1 sm:mb-2">Solução (para finalizar o chamado)</p>
          <Textarea
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            className="h-20 sm:h-24 text-xs sm:text-sm"
            placeholder="Descreva a solução aplicada..."
            disabled={ticket.status === "closed"}
          />
        </div>

        <div className="mb-4 sm:mb-6 p-3 rounded-lg border border-amber-200 bg-amber-50 space-y-2">
          <Label className="flex items-center gap-1.5 text-sm text-amber-800 font-medium">
            <Bell className="h-3.5 w-3.5" /> Lembrete
          </Label>
          <div>
            <p className="text-xs text-amber-700 mb-1">O que precisa ser lembrado?</p>
            <Textarea
              value={reminderNote}
              onChange={(e) => setReminderNote(e.target.value)}
              placeholder="Ex.: Ligar para o cliente, verificar se o problema foi resolvido, aguardar retorno..."
              className="text-xs bg-white h-16 resize-none border-amber-200"
            />
          </div>
          <div>
            <p className="text-xs text-amber-700 mb-1">Quando lembrar?</p>
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="text-xs sm:text-sm h-8 bg-white border-amber-200 flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs flex-shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100"
                onClick={() => reminderMutation.mutate({ date: reminderDate || null })}
                disabled={reminderMutation.isPending}
              >
                {reminderMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
              </Button>
              {ticket.reminderDate && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs flex-shrink-0 text-red-500 hover:bg-red-50"
                  onClick={() => { setReminderDate(""); setReminderNote(""); reminderMutation.mutate({ date: null, note: "" }); }}
                >
                  Limpar
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-amber-600">
            A notificação aparecerá em todas as telas do sistema na data e hora definidas.
          </p>
        </div>

        {/* Lightbox de imagem */}
        {previewImage && (
          <div
            className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center"
            onClick={() => setPreviewImage(null)}
          >
            <button
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 rounded-full p-2 text-white transition-colors"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={previewImage}
              alt="Visualização do anexo"
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-10"
          >
            Cancelar
          </Button>
          <Button
            variant="default"
            onClick={handleUpdate}
            disabled={updateMutation.isPending || addCommentMutation.isPending}
            className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-10"
          >
            {(updateMutation.isPending || addCommentMutation.isPending) && (
              <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
            )}
            {!(updateMutation.isPending || addCommentMutation.isPending) && (
              <Send className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            )}
            Atualizar
          </Button>
          <Button
            variant="secondary"
            onClick={handleCloseTicket}
            disabled={closeTicketMutation.isPending || ticket.status === "closed"}
            className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-10"
          >
            {closeTicketMutation.isPending && (
              <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
            )}
            {!closeTicketMutation.isPending && (
              <CheckCircle className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
            )}
            Finalizar Chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
