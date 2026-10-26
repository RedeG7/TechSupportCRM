import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import TicketModal from "@/components/tickets/TicketModal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bar, Line, Pie, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import {
  Download, Calendar, BarChart2, PieChart, TrendingUp, Clock,
  Users, FileText, CheckCircle2, AlertCircle, Printer,
  FileSpreadsheet, Search, Filter, X, Building2, Timer,
  ArrowUpDown, TicketIcon, Eye,
} from "lucide-react";
import { format, subDays, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, Title, Tooltip, Legend, Filler
);

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "bottom" as const } },
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo", novo: "Novo", aberto: "Aberto", open: "Aberto",
  in_progress: "Em Andamento", em_andamento: "Em Andamento",
  waiting_client: "Aguardando Cliente", respondido: "Respondido",
  resolved: "Resolvido", resolvido: "Resolvido",
  closed: "Fechado", fechado: "Fechado",
  cancelled: "Cancelado", cancelado: "Cancelado",
};
const PRIORITY_LABEL: Record<string, string> = {
  high: "Alta", alta: "Alta",
  medium: "Média", media: "Média", média: "Média",
  low: "Baixa", baixa: "Baixa",
};

const CLOSED_STATUSES = ["resolved", "closed", "resolvido", "fechado", "cancelled", "cancelado"];

const isClosedStatus = (s: string) => CLOSED_STATUSES.includes(s?.toLowerCase());

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  if (isClosedStatus(status)) return <Badge className="bg-green-100 text-green-800 border-0 text-xs">{label}</Badge>;
  if (["in_progress", "em_andamento"].includes(status)) return <Badge className="bg-blue-100 text-blue-800 border-0 text-xs">{label}</Badge>;
  if (["waiting_client", "respondido"].includes(status)) return <Badge className="bg-amber-100 text-amber-800 border-0 text-xs">{label}</Badge>;
  return <Badge className="bg-red-100 text-red-900 border-0 text-xs">{label}</Badge>;
}

function KPICard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <Card className={`border-l-4 ${color}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="p-2 rounded-lg bg-muted">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const [timeRange, setTimeRange] = useState("month");
  const [filterAssunto, setFilterAssunto] = useState("");
  const [filterCliente, setFilterCliente] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null);

  const { data: allTickets = [] } = useQuery({ queryKey: ["/api/tickets"] });
  const { data: clients = [] } = useQuery({ queryKey: ["/api/clients"] });
  const { data: ticketsByCategory = [] } = useQuery({ queryKey: ["/api/dashboard/tickets-by-category"] });
  const { data: resolutionHistory = [] } = useQuery({ queryKey: ["/api/dashboard/resolution-time-history"] });
  const { data: ticketsByCompany = [] } = useQuery({
    queryKey: ["/api/dashboard/tickets-by-company", timeRange],
    queryFn: async () => {
      const r = await fetch(`/api/dashboard/tickets-by-company?timeframe=${timeRange}`);
      return r.json();
    },
  });
  const { data: metrics } = useQuery({
    queryKey: ["/api/dashboard/metrics", timeRange],
    queryFn: async () => {
      const r = await fetch(`/api/dashboard/metrics?timeframe=${timeRange}`);
      return r.json();
    },
  });

  const tickets = allTickets as any[];
  const clientList = clients as any[];

  const timeFiltered = useMemo(() => {
    return tickets.filter((t: any) => {
      if (!t.createdAt) return false;
      const created = new Date(t.createdAt);
      if (filterDateFrom && filterDateTo) {
        const from = new Date(filterDateFrom + "T00:00:00");
        const to = new Date(filterDateTo + "T23:59:59");
        return created >= from && created <= to;
      }
      const days = timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90;
      return created >= subDays(new Date(), days);
    });
  }, [tickets, timeRange, filterDateFrom, filterDateTo]);

  const filtered = useMemo(() => {
    return timeFiltered.filter((t: any) => {
      if (filterAssunto && !t.title?.toLowerCase().includes(filterAssunto.toLowerCase())) return false;
      if (filterCliente !== "all" && String(t.clientId) !== filterCliente) return false;
      if (filterStatus === "open" && isClosedStatus(t.status)) return false;
      if (filterStatus === "closed" && !isClosedStatus(t.status)) return false;
      return true;
    });
  }, [timeFiltered, filterAssunto, filterCliente, filterStatus]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va = a[sortField] ?? "";
      let vb = b[sortField] ?? "";
      if (typeof va === "string") va = va.toLowerCase();
      if (typeof vb === "string") vb = vb.toLowerCase();
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortField, sortDir]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const totalTickets = filtered.length;
  const openTickets = filtered.filter((t: any) => !isClosedStatus(t.status)).length;
  const closedTickets = filtered.filter((t: any) => isClosedStatus(t.status)).length;

  const avgResolutionHours = useMemo(() => {
    const withTime = filtered.filter((t: any) => t.resolutionTimeHours != null);
    if (!withTime.length) return 0;
    return withTime.reduce((s: number, t: any) => s + (t.resolutionTimeHours || 0), 0) / withTime.length;
  }, [filtered]);

  const pieData = {
    labels: ["Abertos", "Fechados"],
    datasets: [{ data: [openTickets, closedTickets], backgroundColor: ["#8B1A1A", "#10b981"], borderWidth: 1 }],
  };

  const categoryData = useMemo(() => {
    const cats = ticketsByCategory as any[];
    return {
      labels: cats.map((c: any) => c.category),
      datasets: [{
        label: "Chamados",
        data: cats.map((c: any) => c.count),
        backgroundColor: ["#8B1A1A", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#06b6d4", "#f97316"].slice(0, cats.length),
        borderWidth: 1,
      }],
    };
  }, [ticketsByCategory]);

  const companyChartData = useMemo(() => {
    const comp = (ticketsByCompany as any[]).slice(0, 10);
    return {
      labels: comp.map((c: any) => c.companyName),
      datasets: [
        { label: "Abertos", data: comp.map((c: any) => c.openTickets), backgroundColor: "#8B1A1A" },
        { label: "Fechados", data: comp.map((c: any) => c.closedTickets), backgroundColor: "#10b981" },
      ],
    };
  }, [ticketsByCompany]);

  const resolutionChartData = useMemo(() => {
    const hist = resolutionHistory as any[];
    return {
      labels: hist.map((h: any) => h.date),
      datasets: [{
        label: "Tempo médio (h)",
        data: hist.map((h: any) => h.hours),
        borderColor: "#8B1A1A",
        backgroundColor: "rgba(139,26,26,0.1)",
        fill: true,
        tension: 0.4,
      }],
    };
  }, [resolutionHistory]);

  const startDate = format(subDays(new Date(), timeRange === "week" ? 7 : timeRange === "month" ? 30 : 90), "dd/MM/yyyy", { locale: ptBR });
  const endDate = format(new Date(), "dd/MM/yyyy", { locale: ptBR });

  const handlePrintTickets = () => {
    if (!sorted.length) { alert("Nenhum chamado para imprimir."); return; }

    const periodLabel = filterDateFrom && filterDateTo
      ? `${filterDateFrom.split("-").reverse().join("/")} a ${filterDateTo.split("-").reverse().join("/")}`
      : `${startDate} — ${endDate}`;

    const clientLabel = filterCliente !== "all"
      ? clientList.find((c: any) => String(c.id) === filterCliente)?.businessName || "—"
      : "Todos";
    const statusLabel = filterStatus === "open" ? "Apenas abertos" : filterStatus === "closed" ? "Apenas fechados" : "Todos";

    const BRAND = "#8B1A1A";
    const origin = window.location.origin;

    const getAttachments = (t: any): Array<{ name: string; url: string; isImage: boolean }> => {
      const raw = t.attachments;
      if (!raw || !Array.isArray(raw) || raw.length === 0) return [];
      return raw.map((a: any) => {
        const filename = typeof a === "string" ? a : (a.filename || a.name || String(a));
        const name = filename.split("/").pop() || filename;
        const url = `${origin}/uploads/${name}`;
        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
        return { name, url, isImage };
      });
    };

    const rowsHtml = sorted.map((t: any, i: number) => {
      const desc = t.description ? t.description.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
      const attachments = getAttachments(t);
      const attachHtml = attachments.length
        ? `<div style="margin-top:6px;border-top:1px dashed #e5e7eb;padding-top:5px">
            <span style="font-size:10px;color:#8B1A1A;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Anexos (${attachments.length})</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              ${attachments.map(a => a.isImage
                ? `<div style="display:inline-block;vertical-align:top;text-align:center">
                    <img src="${a.url}" alt="${a.name}" style="width:64px;height:64px;object-fit:cover;border-radius:4px;border:1px solid #e5e7eb;display:block" onerror="this.style.display='none'" />
                    <span style="font-size:9px;color:#6b7280;display:block;max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.name}</span>
                  </div>`
                : `<a href="${a.url}" style="font-size:10px;color:#8B1A1A;text-decoration:none;background:#fff7f7;border:1px solid #fca5a5;border-radius:4px;padding:2px 6px;display:inline-block">${a.name}</a>`
              ).join("")}
            </div>
          </div>`
        : "";
      return `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#fdf8f8'}">
        <td style="padding:8px 10px;font-size:12px;color:#6b7280;font-family:monospace;white-space:nowrap;vertical-align:top">#${t.id}</td>
        <td style="padding:8px 10px;font-size:12px;vertical-align:top">
          <div style="font-weight:600;color:#111827">${t.title || "—"}</div>
          ${desc ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">${desc.substring(0, 300)}${desc.length > 300 ? "..." : ""}</div>` : ""}
          ${attachHtml}
        </td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;vertical-align:top">${t.clientName || "—"}</td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;vertical-align:top">${STATUS_LABEL[t.status] || t.status}</td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;vertical-align:top">${PRIORITY_LABEL[t.priority] || t.priority || "—"}</td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;vertical-align:top">${t.category || "—"}</td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;text-align:center;vertical-align:top">
          ${t.resolutionTimeHours != null ? `${t.resolutionTimeHours.toFixed(1)}h` : t.openTimeHours != null ? `${t.openTimeHours.toFixed(1)}h` : "—"}
        </td>
        <td style="padding:8px 10px;font-size:12px;white-space:nowrap;vertical-align:top">
          ${t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
        </td>
      </tr>
    `}).join("");

    const summaryOpen = sorted.filter((t: any) => !isClosedStatus(t.status)).length;
    const summaryClosed = sorted.filter((t: any) => isClosedStatus(t.status)).length;

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Relatório de Chamados</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #111827; background: #fff; }
          .header { background: ${BRAND}; color: white; padding: 24px 30px; }
          .header h1 { font-size: 20px; font-weight: 700; }
          .header p { font-size: 12px; opacity: 0.85; margin-top: 4px; }
          .summary-wrap { padding: 16px 30px; background: #fafafa; border-bottom: 2px solid #e5e7eb; }
          .summary-table { width: 100%; border-collapse: collapse; }
          .summary-table td { padding: 8px 16px; text-align: center; }
          .s-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; display: block; }
          .s-value { font-size: 22px; font-weight: 700; display: block; margin-top: 2px; }
          .filters-wrap { padding: 10px 30px; background: #fff7f7; border-bottom: 1px solid #e5e7eb; }
          .filters-table { width: 100%; border-collapse: collapse; }
          .filters-table td { padding: 4px 16px; font-size: 11px; color: #6b7280; }
          .filters-table td strong { color: #374151; }
          .table-wrap { padding: 16px 30px 30px; }
          table.main { width: 100%; border-collapse: collapse; }
          table.main thead tr { background: ${BRAND}; color: white; }
          table.main thead th { padding: 9px 10px; font-size: 11px; font-weight: 600; text-align: left; white-space: nowrap; }
          table.main tbody td { border-bottom: 1px solid #e5e7eb; }
          .footer { text-align: center; font-size: 10px; color: #9ca3af; padding: 12px; border-top: 1px solid #e5e7eb; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RedeG7 Solu&ccedil;&otilde;es em TI &mdash; Relat&oacute;rio de Chamados</h1>
          <p>Gerado em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} &nbsp;|&nbsp; Per&iacute;odo: ${periodLabel}</p>
        </div>

        <div class="summary-wrap">
          <table class="summary-table">
            <tr>
              <td style="border-right:1px solid #e5e7eb">
                <span class="s-label">Total de Chamados</span>
                <span class="s-value" style="color:${BRAND}">${sorted.length}</span>
              </td>
              <td style="border-right:1px solid #e5e7eb">
                <span class="s-label">Em Aberto</span>
                <span class="s-value" style="color:#d97706">${summaryOpen}</span>
              </td>
              <td style="border-right:1px solid #e5e7eb">
                <span class="s-label">Finalizados</span>
                <span class="s-value" style="color:#059669">${summaryClosed}</span>
              </td>
              <td>
                <span class="s-label">Tempo M&eacute;dio de Resolu&ccedil;&atilde;o</span>
                <span class="s-value" style="color:#374151;font-size:18px">${avgResolutionHours > 0 ? `${avgResolutionHours.toFixed(1)}h` : "—"}</span>
              </td>
            </tr>
          </table>
        </div>

        <div class="filters-wrap">
          <table class="filters-table">
            <tr>
              <td><strong>Per&iacute;odo:</strong> ${periodLabel}</td>
              <td><strong>Cliente:</strong> ${clientLabel}</td>
              <td><strong>Status:</strong> ${statusLabel}</td>
              ${filterAssunto ? `<td><strong>Assunto:</strong> ${filterAssunto}</td>` : "<td></td>"}
            </tr>
          </table>
        </div>

        <div class="table-wrap">
          <table class="main">
            <thead>
              <tr>
                <th>#</th>
                <th>Assunto / Descri&ccedil;&atilde;o</th>
                <th>Cliente</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Categoria</th>
                <th>Tempo</th>
                <th>Abertura</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <div class="footer">
          RedeG7 Solu&ccedil;&otilde;es em TI &middot; Sistema de Helpdesk &middot; ${format(new Date(), "dd/MM/yyyy", { locale: ptBR })}
        </div>
      </body>
      </html>
    `;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(printHtml);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 600);
    }
  };

  const handleExportExcel = () => {
    if (!sorted.length) { alert("Nenhum chamado para exportar."); return; }
    const rows = sorted.map((t: any) => ({
      "ID": t.id,
      "Assunto": t.title,
      "Cliente": t.clientName || t.clientId,
      "Status": STATUS_LABEL[t.status] || t.status,
      "Prioridade": PRIORITY_LABEL[t.priority] || t.priority,
      "Categoria": t.category,
      "Responsável": t.assignedUserName || "—",
      "Aberto em": t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
      "Atualizado em": t.updatedAt ? format(new Date(t.updatedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
      "Finalizado em": t.resolvedAt ? format(new Date(t.resolvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
      "Tempo resolução (h)": t.resolutionTimeHours != null ? t.resolutionTimeHours.toFixed(1) : "",
      "Tempo em aberto (h)": t.openTimeHours != null ? t.openTimeHours.toFixed(1) : "",
      "Solução": t.resolutionNote || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Array(13).fill({ wch: 20 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chamados");

    const comp = ticketsByCompany as any[];
    if (comp.length) {
      const wsc = XLSX.utils.json_to_sheet(comp.map((c: any) => ({
        "Empresa": c.companyName,
        "Total": c.totalTickets,
        "Abertos": c.openTickets,
        "Fechados": c.closedTickets,
        "Tempo médio (h)": c.avgResolutionTime || 0,
      })));
      XLSX.utils.book_append_sheet(wb, wsc, "Por Empresa");
    }

    XLSX.writeFile(wb, `relatorio_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: <BarChart2 className="h-4 w-4" /> },
    { id: "tickets", label: "Chamados", icon: <TicketIcon className="h-4 w-4" /> },
    { id: "companies", label: "Por Empresa", icon: <Building2 className="h-4 w-4" /> },
  ];

  return (
    <section className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">Relatórios</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
            <Calendar className="h-3.5 w-3.5" />
            {startDate} — {endDate}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Última semana</SelectItem>
              <SelectItem value="month">Último mês</SelectItem>
              <SelectItem value="quarter">Último trimestre</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-2" />Imprimir
          </Button>
          <Button onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Excel
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard icon={<TicketIcon className="h-5 w-5 text-[#8B1A1A]" />} label="Total de Chamados" value={totalTickets} color="border-l-[#8B1A1A]" sub="no período filtrado" />
        <KPICard icon={<AlertCircle className="h-5 w-5 text-amber-500" />} label="Em Aberto" value={openTickets} color="border-l-amber-500" sub={`${totalTickets ? Math.round((openTickets / totalTickets) * 100) : 0}% do total`} />
        <KPICard icon={<CheckCircle2 className="h-5 w-5 text-green-500" />} label="Finalizados" value={closedTickets} color="border-l-green-500" sub={`${totalTickets ? Math.round((closedTickets / totalTickets) * 100) : 0}% do total`} />
        <KPICard icon={<Timer className="h-5 w-5 text-blue-500" />} label="Tempo Médio" value={avgResolutionHours > 0 ? `${avgResolutionHours.toFixed(1)}h` : "—"} color="border-l-blue-500" sub="de resolução" />
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por assunto..."
                value={filterAssunto}
                onChange={e => setFilterAssunto(e.target.value)}
                className="pl-9"
              />
              {filterAssunto && (
                <button onClick={() => setFilterAssunto("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <Select value={filterCliente} onValueChange={setFilterCliente}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clientList.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.businessName || c.tradeName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="open">Apenas abertos</SelectItem>
                <SelectItem value="closed">Apenas fechados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(filterAssunto || filterCliente !== "all" || filterStatus !== "all") && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{filtered.length} resultado(s) encontrado(s)</span>
              <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => { setFilterAssunto(""); setFilterCliente("all"); setFilterStatus("all"); }}>
                Limpar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Abas de conteúdo */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Aba Dashboard */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Abertos vs Fechados */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Abertos × Fechados</CardTitle>
                <CardDescription>Distribuição no período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Doughnut data={pieData} options={{ ...CHART_OPTS, cutout: "65%" }} />
                </div>
              </CardContent>
            </Card>

            {/* Por Categoria */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chamados por Categoria</CardTitle>
                <CardDescription>Total por tipo de suporte</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <Bar data={categoryData} options={{ ...CHART_OPTS, indexAxis: "y" as const, plugins: { legend: { display: false } } }} />
                </div>
              </CardContent>
            </Card>

            {/* Tempo médio de resolução */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tempo Médio de Atendimento</CardTitle>
                <CardDescription>Histórico de horas para resolução</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {resolutionHistory && (resolutionHistory as any[]).length > 0 ? (
                    <Line data={resolutionChartData} options={{ ...CHART_OPTS, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: "Horas" } } } }} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Dados insuficientes para o período</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Chamados por empresa */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Chamados por Empresa</CardTitle>
                <CardDescription>Top 10 empresas com mais chamados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {(ticketsByCompany as any[]).length > 0 ? (
                    <Bar data={companyChartData} options={{ ...CHART_OPTS, scales: { x: { stacked: false }, y: { beginAtZero: true } } }} />
                  ) : (
                    <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Nenhum dado no período</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Aba Chamados */}
      {activeTab === "tickets" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">Lista de Chamados</CardTitle>
                <CardDescription>{sorted.length} chamado(s) • use os filtros acima para refinar</CardDescription>
              </div>
              <Button
                onClick={handlePrintTickets}
                className="bg-[#8B1A1A] hover:bg-[#6b1414] text-white shrink-0"
                size="sm"
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir PDF
              </Button>
            </div>

            {/* Filtro de período por data */}
            <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Filtrar por data:
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">De:</label>
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={e => setFilterDateFrom(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Até:</label>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={e => setFilterDateTo(e.target.value)}
                  className="h-8 text-xs w-36"
                />
              </div>
              {(filterDateFrom || filterDateTo) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs px-2 text-muted-foreground"
                  onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }}
                >
                  <X className="h-3 w-3 mr-1" /> Limpar datas
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {[
                      { key: "id", label: "#" },
                      { key: "title", label: "Assunto" },
                      { key: "clientName", label: "Cliente" },
                      { key: "status", label: "Status" },
                      { key: "priority", label: "Prioridade" },
                      { key: "category", label: "Categoria" },
                      { key: "resolutionTimeHours", label: "Tempo Atend." },
                      { key: "createdAt", label: "Abertura" },
                    ].map(col => (
                      <th
                        key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                      >
                        <span className="flex items-center gap-1">
                          {col.label}
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </span>
                      </th>
                    ))}
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sorted.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        Nenhum chamado encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  ) : sorted.map((t: any) => (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono">#{t.id}</td>
                      <td className="px-4 py-3 max-w-xs truncate font-medium" title={t.title}>{t.title}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.clientName || "—"}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3">
                        {t.priority && (
                          <span className={`text-xs font-medium ${
                            ["high","alta"].includes(t.priority) ? "text-red-600" :
                            ["medium","media","média"].includes(t.priority) ? "text-amber-600" : "text-green-600"
                          }`}>
                            {PRIORITY_LABEL[t.priority] || t.priority}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{t.category || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {t.resolutionTimeHours != null
                          ? <span className="flex items-center gap-1 text-blue-600"><Timer className="h-3.5 w-3.5" />{t.resolutionTimeHours.toFixed(1)}h</span>
                          : t.openTimeHours != null
                          ? <span className="flex items-center gap-1 text-amber-600"><Clock className="h-3.5 w-3.5" />{t.openTimeHours.toFixed(1)}h em aberto</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                          title="Ver chamado"
                          onClick={() => setSelectedTicketId(t.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aba Por Empresa */}
      {activeTab === "companies" && (
        <div className="space-y-4">
          {(ticketsByCompany as any[]).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma empresa com chamados no período selecionado.
              </CardContent>
            </Card>
          ) : (ticketsByCompany as any[]).map((c: any) => {
            const health = c.openTickets === 0 ? { label: "Ótimo", color: "text-green-600", bg: "bg-green-50 border-green-200" }
              : c.avgTimeOpen > 7 ? { label: "Atenção", color: "text-red-600", bg: "bg-red-50 border-red-200" }
              : c.avgTimeOpen > 3 ? { label: "Moderado", color: "text-amber-600", bg: "bg-amber-50 border-amber-200" }
              : { label: "Bom", color: "text-green-600", bg: "bg-green-50 border-green-200" };

            return (
              <Card key={c.companyName} className={`border ${c.openTickets > 5 ? "border-red-200" : ""}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      <span className="font-semibold">{c.companyName}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${health.bg} ${health.color}`}>{health.label}</span>
                    </div>
                    <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => {
                      const compTickets = tickets.filter((t: any) => t.clientId === c.clientId || t.clientName === c.companyName);
                      const rows = compTickets.map((t: any) => ({
                        "ID": t.id, "Assunto": t.title,
                        "Status": STATUS_LABEL[t.status] || t.status,
                        "Prioridade": PRIORITY_LABEL[t.priority] || t.priority,
                        "Categoria": t.category,
                        "Abertura": t.createdAt ? format(new Date(t.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
                        "Fechamento": t.resolvedAt ? format(new Date(t.resolvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "",
                        "Tempo (h)": t.resolutionTimeHours?.toFixed(1) ?? "",
                      }));
                      const ws = XLSX.utils.json_to_sheet(rows);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Chamados");
                      XLSX.writeFile(wb, `${c.companyName}_chamados.xlsx`);
                    }}>
                      <Download className="h-3.5 w-3.5 mr-1" />Excel
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Total</p>
                      <p className="text-xl font-bold text-primary">{c.totalTickets}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Abertos</p>
                      <p className={`text-xl font-bold ${c.openTickets > 5 ? "text-red-600" : c.openTickets > 2 ? "text-amber-600" : "text-green-600"}`}>{c.openTickets}</p>
                    </div>
                    <div className="rounded-lg bg-green-50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Fechados</p>
                      <p className="text-xl font-bold text-green-700">{c.closedTickets}</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">Tempo médio em aberto</p>
                      <p className={`text-xl font-bold ${c.avgTimeOpen > 7 ? "text-red-600" : c.avgTimeOpen > 3 ? "text-amber-600" : "text-blue-600"}`}>
                        {(c.avgTimeOpen ?? 0).toFixed(1)} d
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <TicketModal
        ticketId={selectedTicketId}
        isOpen={selectedTicketId !== null}
        onClose={() => setSelectedTicketId(null)}
      />
    </section>
  );
}
