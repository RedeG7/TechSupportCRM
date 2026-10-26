import { useLocation, Link } from 'wouter';
import { useEffect, useRef, useState } from 'react';
import { 
  BarChart2, 
  TicketIcon, 
  Users, 
  FileText, 
  PieChart, 
  Settings,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Phone,
  Shield,
  Bell,
  Clock,
  ExternalLink,
  X,
  Bot
} from 'lucide-react';
import logoImage from "@/assets/logo.png";
import iconImage from "@/assets/icon.jpg";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Slider } from "@/components/ui/slider";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import TicketModal from "@/components/tickets/TicketModal";
import { useBranding } from "@/hooks/useBranding";

type SidebarProps = {
  onItemClick?: () => void;
};

export default function Sidebar({ onItemClick }: SidebarProps) {
  const [location] = useLocation();
  const [userName, setUserName] = useState("Usuário");
  const [userRole, setUserRole] = useState("Usuário");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [showWidthSlider, setShowWidthSlider] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<number | null>(null);
  const [dismissedIds, setDismissedIds] = useState<number[]>([]);
  const [pendingDismissIds, setPendingDismissIds] = useState<number[]>([]);
  const prevReminderIds = useRef<number[]>([]);

  const { data: branding } = useBranding();

  const dismissReminderMutation = useMutation({
    mutationFn: (ticketId: number) =>
      apiRequest("PUT", `/api/tickets/${ticketId}/reminder`, { reminderDate: null, reminderNote: "" }),
    onSuccess: (_data, ticketId) => {
      setDismissedIds(prev => [...prev, ticketId]);
      setPendingDismissIds(prev => prev.filter(id => id !== ticketId));
      queryClient.invalidateQueries({ queryKey: ["/api/tickets/reminders"] });
    },
  });

  // Buscar lembretes vencidos (popup)
  const { data: reminders = [] } = useQuery<any[]>({
    queryKey: ["/api/tickets/reminders"],
    refetchInterval: 30 * 1000,
  });

  // Buscar lembretes futuros (agendados mas não vencidos — exibição na sidebar)
  const { data: upcomingReminders = [] } = useQuery<any[]>({
    queryKey: ["/api/tickets/upcoming-reminders"],
    refetchInterval: 60 * 1000,
  });

  const pendingReminders = (reminders as any[]).filter(r => !dismissedIds.includes(r.id));
  const allSidebarReminders = [
    ...(upcomingReminders as any[]),
    ...pendingReminders.filter(r => !(upcomingReminders as any[]).find((u: any) => u.id === r.id)),
  ];

  // Auto-abre o modal do ticket quando um NOVO lembrete chega pela primeira vez
  useEffect(() => {
    if (!pendingReminders.length) {
      prevReminderIds.current = [];
      return;
    }
    const currentIds = pendingReminders.map((r: any) => r.id);
    const newIds = currentIds.filter((id: number) => !prevReminderIds.current.includes(id));
    if (newIds.length > 0 && prevReminderIds.current.length > 0) {
      // Novo lembrete apareceu – abre automaticamente o primeiro
      setOpenTicketId(newIds[0]);
    }
    prevReminderIds.current = currentIds;
  }, [pendingReminders.length]);
  
  // Carregar informações do usuário quando o componente for montado
  useEffect(() => {
    // Tentar buscar os dados do usuário logado
    const fetchUserData = async () => {
      const userId = localStorage.getItem("user_id");
      if (!userId) return;
      
      try {
        const response = await fetch(`/api/users/${userId}`);
        if (response.ok) {
          const userData = await response.json();
          setUserName(userData.name || "Usuário");
          
          // Definir role formatado
          if (userData.role === "super_admin") {
            setUserRole("Super Admin");
            setIsSuperAdmin(true);
          } else if (userData.role === "admin") {
            setUserRole("Administrador");
          } else if (userData.role === "supervisor") {
            setUserRole("Supervisor");
          } else if (userData.role === "operacional") {
            setUserRole("Usuário Operacional");
          } else if (userData.role === "support") {
            setUserRole("Suporte");
          } else {
            setUserRole(userData.role || "Usuário");
          }
        }
      } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
      }
    };
    
    // Também verificar se há informações no localStorage
    const checkLocalStorage = () => {
      const storedName = localStorage.getItem("user_name");
      const storedRole = localStorage.getItem("user_role");
      
      if (storedName) {
        setUserName(storedName);
      }
      
      if (storedRole) {
        if (storedRole === "super_admin") {
          setUserRole("Super Admin");
          setIsSuperAdmin(true);
        } else if (storedRole === "admin") {
          setUserRole("Administrador");
        } else if (storedRole === "supervisor") {
          setUserRole("Supervisor");
        } else if (storedRole === "operacional") {
          setUserRole("Usuário Operacional");
        } else if (storedRole === "support") {
          setUserRole("Suporte");
        } else {
          setUserRole(storedRole);
        }
      }
    };
    
    checkLocalStorage();
    fetchUserData();
  }, []);
  
  const isActive = (path: string) => {
    if (path === '/' && location === '/') return true;
    if (path === '/') return false;
    return location === path || location.startsWith(`${path}/`);
  };

  // Função para alternar o estado de collapse do sidebar
  const toggleCollapse = () => {
    const newCollapsedState = !collapsed;
    setCollapsed(newCollapsedState);
    
    // Se está expandindo, restaurar o tamanho anterior (se era maior que o mínimo)
    if (newCollapsedState === false) {
      // Restaurar largura anterior do localStorage ou usar padrão
      const savedWidth = localStorage.getItem("sidebar_width_expanded");
      if (savedWidth && !isNaN(Number(savedWidth))) {
        setSidebarWidth(Number(savedWidth));
      } else {
        setSidebarWidth(256); // largura padrão expandida
      }
    } else {
      // Se está colapsando, salvar largura atual e definir largura mínima
      localStorage.setItem("sidebar_width_expanded", String(sidebarWidth));
      setSidebarWidth(80);
    }
  };
  
  // Função para atualizar a largura do sidebar
  const handleWidthChange = (newWidth: number[]) => {
    // Limitar a largura mínima e máxima
    setSidebarWidth(Math.max(180, Math.min(400, newWidth[0])));
  };
  
  // Função para alternar a exibição do slider
  const toggleWidthSlider = () => {
    if (!collapsed) {
      setShowWidthSlider(!showWidthSlider);
    }
  };

  // Por padrão, em telas menores o menu fica colapsado
  useEffect(() => {
    const handleResize = () => {
      const isSmallScreen = window.innerWidth < 1024;
      if (isSmallScreen && !collapsed) {
        setCollapsed(true);
      }
    };

    // Verificar tamanho inicial da tela
    handleResize();

    // Adicionar listener para redimensionamento
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [collapsed]);

  // Recuperar estado de collapse e largura do localStorage ao iniciar
  useEffect(() => {
    const savedCollapsed = localStorage.getItem("sidebar_collapsed");
    const savedWidth = localStorage.getItem("sidebar_width");
    
    if (savedCollapsed) {
      setCollapsed(savedCollapsed === "true");
    } else {
      // Por padrão, em telas menores o menu fica colapsado
      const isSmallScreen = window.innerWidth < 1024;
      setCollapsed(isSmallScreen);
    }
    
    if (savedWidth && !isNaN(Number(savedWidth))) {
      setSidebarWidth(Number(savedWidth));
    }
  }, []);
  
  // Salvar estado de collapse e largura no localStorage quando mudar
  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", String(collapsed));
    localStorage.setItem("sidebar_width", String(sidebarWidth));
    
    // Disparar evento para notificar outros componentes sobre mudanças
    const event = new CustomEvent('sidebar-updated');
    window.dispatchEvent(event);
  }, [collapsed, sidebarWidth]);

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <BarChart2 className="w-5 h-5" /> },
    { path: '/tickets', label: 'Chamados', icon: <TicketIcon className="w-5 h-5" /> },
    { path: '/clients', label: 'Clientes', icon: <Users className="w-5 h-5" /> },
    { path: '/investments', label: 'Financeiro', icon: <PieChart className="w-5 h-5" /> },
    { path: '/reports', label: 'Relatórios', icon: <FileText className="w-5 h-5" /> },
    { path: '/whatsapp-contacts', label: 'Chat WhatsApp', icon: <MessageSquare className="w-5 h-5" /> },
    { path: '/whatsapp-setup', label: 'Config. WhatsApp', icon: <Phone className="w-5 h-5" /> },
    { path: '/chatbot', label: 'G7Bot (IA)', icon: <Bot className="w-5 h-5" /> },
    { path: '/settings', label: 'Configurações', icon: <Settings className="w-5 h-5" /> },
    ...(isSuperAdmin ? [{ path: '/super-admin', label: 'Super Admin', icon: <Shield className="w-5 h-5" />, highlight: true }] : []),
  ];
  
  // Função para realizar o logout
  const handleLogout = () => {
    // Remover todos os dados do usuário do localStorage
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_name");
    window.location.href = "/login";
  };
  
  // Função para acessar o painel do cliente
  const goToClientPanel = () => {
    window.location.href = "/client/login";
  };

  // Estilo dinâmico para a largura da barra lateral
  const sidebarStyle = {
    width: collapsed ? '80px' : `${sidebarWidth}px`,
    transition: 'width 0.3s ease'
  };

  return (
    <>
    <aside 
      className="bg-neutral-700 text-white h-screen flex-shrink-0 flex flex-col relative overflow-hidden"
      style={sidebarStyle}
    >
      {/* Botão para mostrar/esconder a barra lateral */}
      <button 
        onClick={toggleCollapse} 
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-12 
                  bg-primary text-white rounded-r-md shadow-md z-10 focus:outline-none
                  hidden lg:flex"
      >
        {collapsed 
          ? <ChevronRight className="w-4 h-4" /> 
          : <ChevronLeft className="w-4 h-4" />
        }
      </button>
      
      {/* Cabeçalho */}
      <div className="p-4 border-b border-neutral-600">
        <div className={`flex ${collapsed ? 'justify-center' : 'flex-col items-center'}`}>
          <img
            src={branding?.companyLogoUrl || logoImage}
            alt={branding?.companyName || "Logo"}
            className={`h-12 ${collapsed ? '' : 'mb-2'} object-contain`}
          />
          {!collapsed && (
            <h1 className="text-xl font-semibold text-center">{branding?.companyName || "Suporte RedeG7"}</h1>
          )}
        </div>
      </div>
      
      {/* Controle de largura (somente visível quando expandido) */}
      {!collapsed && (
        <div className="px-4 py-2 hidden lg:block">
          <div 
            className="flex items-center justify-between cursor-pointer text-xs"
            onClick={toggleWidthSlider}
          >
            <span>Ajustar largura</span>
            {showWidthSlider ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </div>
          {showWidthSlider && (
            <div className="mt-2">
              <Slider 
                defaultValue={[sidebarWidth]} 
                min={180} 
                max={400} 
                step={10}
                onValueChange={handleWidthChange}
                className="my-2"
              />
            </div>
          )}
        </div>
      )}
      
      {/* Menu de navegação */}
      <nav className="mt-2 flex-1 overflow-y-auto scrollbar-thin">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.path} className="px-2">
              <Link 
                href={item.path}
                onClick={onItemClick}
                className={`flex items-center ${collapsed ? 'justify-center' : ''} px-3 py-2.5 rounded-md transition-colors ${
                  isActive(item.path) 
                    ? 'bg-primary text-white' 
                    : (item as any).highlight
                    ? 'text-purple-300 hover:bg-purple-900/40 hover:text-purple-200 border border-purple-500/30'
                    : 'text-white/80 hover:bg-neutral-600 hover:text-white'
                }`}
              >
                <div className={collapsed ? '' : 'mr-3'}>
                  {item.icon}
                </div>
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      
      {/* ── Widget de Lembretes ── */}
      {allSidebarReminders.length > 0 && (
        <div className="mx-2 mb-2">
          {collapsed ? (
            /* Modo recolhido: só ícone com badge */
            <button
              onClick={() => setOpenTicketId(allSidebarReminders[0].id)}
              className="w-full flex justify-center items-center relative py-2 rounded-md bg-amber-500/20 hover:bg-amber-500/30 transition-colors"
            >
              <Bell className={`h-5 w-5 text-amber-400 ${pendingReminders.length > 0 ? 'animate-pulse' : ''}`} />
              <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {allSidebarReminders.length}
              </span>
            </button>
          ) : (
            /* Modo expandido: quadro completo de lembretes */
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 overflow-hidden">
              {/* Cabeçalho do widget */}
              <div className="flex items-center justify-between px-3 py-2 bg-amber-500/20 border-b border-amber-500/30">
                <div className="flex items-center gap-2">
                  <Bell className={`h-3.5 w-3.5 text-amber-400 flex-shrink-0 ${pendingReminders.length > 0 ? 'animate-pulse' : ''}`} />
                  <span className="text-xs font-semibold text-amber-300">
                    {allSidebarReminders.length} lembrete{allSidebarReminders.length > 1 ? "s" : ""}
                    {pendingReminders.length > 0 && (
                      <span className="ml-1 text-red-400">({pendingReminders.length} vencido{pendingReminders.length > 1 ? "s" : ""})</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Lista de lembretes */}
              <div className="max-h-56 overflow-y-auto divide-y divide-amber-500/20">
                {allSidebarReminders.map((ticket: any) => (
                  <div key={ticket.id} className="px-3 py-2 group hover:bg-amber-500/10 transition-colors">
                    {/* Título do chamado */}
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <p className="text-xs font-medium text-white/90 leading-tight line-clamp-2 flex-1">
                        #{ticket.id} {ticket.title}
                      </p>
                      {/* X entra em modo "confirmar dispensa" */}
                      {!pendingDismissIds.includes(ticket.id) ? (
                        <button
                          onClick={() => setPendingDismissIds(prev => [...prev, ticket.id])}
                          className="text-neutral-500 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                          title="Dispensar lembrete"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : (
                        /* Modo confirmação */
                        <button
                          onClick={() => setPendingDismissIds(prev => prev.filter(id => id !== ticket.id))}
                          className="text-neutral-500 hover:text-neutral-300 transition-colors flex-shrink-0 mt-0.5"
                          title="Cancelar"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Banner de confirmação de dispensa */}
                    {pendingDismissIds.includes(ticket.id) && (
                      <div className="mb-2 flex items-center gap-1.5 bg-red-500/20 border border-red-500/30 rounded px-2 py-1">
                        <span className="text-[10px] text-red-300 flex-1">Dispensar este lembrete?</span>
                        <button
                          onClick={() => dismissReminderMutation.mutate(ticket.id)}
                          disabled={dismissReminderMutation.isPending}
                          className="text-[10px] font-semibold text-red-300 hover:text-red-200 border border-red-400/50 rounded px-1.5 py-0.5 transition-colors"
                        >
                          Dispensar
                        </button>
                      </div>
                    )}

                    {/* O que lembrar */}
                    {ticket.reminderNote && (
                      <p className="text-[11px] text-amber-300/90 leading-tight mb-1 line-clamp-2">
                        {ticket.reminderNote}
                      </p>
                    )}

                    {/* Horário + botão abrir */}
                    <div className="flex items-center justify-between gap-1">
                      {ticket.reminderDate && (() => {
                        const isOverdue = new Date(ticket.reminderDate) <= new Date();
                        return (
                          <div className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-red-400 font-semibold' : 'text-blue-300'}`}>
                            <Clock className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>
                              {isOverdue ? '⚠ ' : ''}{format(new Date(ticket.reminderDate), "dd/MM HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        );
                      })()}
                      <button
                        onClick={() => setOpenTicketId(ticket.id)}
                        className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-medium transition-colors ml-auto"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Abrir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé */}
      <div className="p-3 border-t border-neutral-600">
        {collapsed ? (
          <div className="flex flex-col items-center py-2 space-y-3">
            <div className="w-8 h-8 rounded-full overflow-hidden">
              <img src={iconImage} alt="RedeG7 Icon" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col gap-2 items-center">
              <Button 
                variant="destructive" 
                size="icon" 
                onClick={handleLogout}
                className="h-8 w-8"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center flex-1">
                <div className="w-8 h-8 rounded-full overflow-hidden mr-3">
                  <img src={iconImage} alt="RedeG7 Icon" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{userName}</p>
                  <p className="text-xs text-neutral-400 truncate">{userRole}</p>
                </div>
              </div>
              <div className="ml-2">
                <ThemeToggle />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleLogout}
                className="flex items-center justify-center"
              >
                <LogOut className="mr-1 h-4 w-4" />
                <span className="text-xs">SAIR</span>
              </Button>
              
              <Button
                variant="secondary"
                size="sm"
                onClick={goToClientPanel}
                className="flex items-center justify-center"
              >
                <User className="mr-1 h-4 w-4" />
                <span className="text-xs">CLIENTE</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </aside>

    {/* Modal do chamado aberto pelo lembrete */}
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
