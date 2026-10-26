import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, 
  TicketCheck, 
  LogOut, 
  User,
  ChevronFirst,
  ChevronLast,
  MenuIcon,
  X
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [, navigate] = useLocation();
  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    // Obter dados do cliente do localStorage
    const storedClientName = localStorage.getItem("client_name") || "";
    const storedContactName = localStorage.getItem("contact_name") || "";
    
    setClientName(storedClientName);
    setContactName(storedContactName);
    
    // Verificar preferência de colapso do menu no localStorage
    const savedCollapsed = localStorage.getItem("client_sidebar_collapsed");
    if (savedCollapsed !== null) {
      setCollapsed(savedCollapsed === "true");
    } else {
      // Por padrão, colapsar em dispositivos menores que lg, mas manter expandido em lg e acima
      const isSmallScreen = window.innerWidth < 1024;
      setCollapsed(isSmallScreen);
      localStorage.setItem("client_sidebar_collapsed", isSmallScreen.toString());
    }

    // Fechar menu móvel quando a rota mudar
    setMobileOpen(false);
  }, [location]);

  // Adicionar listener para redimensionamento da janela
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // Em telas pequenas, sempre fechar o menu móvel ao redimensionar
        setMobileOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleLogout = () => {
    // Remover dados do localStorage
    localStorage.removeItem("client_id");
    localStorage.removeItem("client_contact_id");
    localStorage.removeItem("client_name");
    localStorage.removeItem("contact_name");
    localStorage.removeItem("user_role");
    
    // Redirecionar para login
    navigate("/client/login");
  };

  const toggleSidebar = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("client_sidebar_collapsed", newState.toString());
  };

  const toggleMobileMenu = () => {
    setMobileOpen(!mobileOpen);
  };

  // Navegação principal
  const navItems = [
    {
      icon: <LayoutDashboard className="h-5 w-5" />,
      label: "Dashboard",
      href: "/client/dashboard",
      active: location === "/client/dashboard"
    },
    {
      icon: <TicketCheck className="h-5 w-5" />,
      label: "Chamados",
      href: "/client/tickets",
      active: location.startsWith("/client/tickets")
    },
    {
      icon: <User className="h-5 w-5" />,
      label: "Perfil",
      href: "/client/profile",
      active: location === "/client/profile"
    },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar para desktop */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 bg-card border-r shadow-sm transition-all duration-300 hidden md:flex md:flex-col ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        {/* Logo e Toggle */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center overflow-hidden">
            {!collapsed && (
              <span className="font-semibold text-lg truncate">Suporte RedeG7</span>
            )}
            {collapsed && (
              <span className="font-semibold text-lg">SG7</span>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="h-8 w-8"
          >
            {collapsed ? <ChevronLast className="h-4 w-4" /> : <ChevronFirst className="h-4 w-4" />}
          </Button>
        </div>
        
        {/* Menu de navegação */}
        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/50"
              } px-3 py-2 rounded-md flex items-center transition-colors ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {item.icon}
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          ))}
        </nav>
        
        {/* Informações do usuário e logout */}
        <div className="p-4 border-t flex flex-col gap-2">
          {!collapsed && (
            <div className="truncate">
              <p className="text-sm font-medium truncate">{contactName}</p>
              <p className="text-xs text-muted-foreground truncate">{clientName}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <ThemeToggle />
            <Button 
              variant="outline" 
              size={collapsed ? "icon" : "default"}
              onClick={handleLogout}
              className={collapsed ? "w-full" : "flex-1"}
            >
              <LogOut className="h-4 w-4" />
              {!collapsed && <span className="ml-2">Sair</span>}
            </Button>
          </div>
        </div>
      </div>
      
      {/* Overlay para menu móvel */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden"
          onClick={toggleMobileMenu}
          aria-hidden="true"
        ></div>
      )}
      
      {/* Sidebar para mobile */}
      <div 
        className={`
          fixed inset-y-0 left-0 z-50 w-[280px] bg-card border-r shadow-lg transform transition-transform duration-300 md:hidden
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        aria-hidden={!mobileOpen}
      >
        {/* Cabeçalho do menu móvel */}
        <div className="p-4 border-b flex items-center justify-between">
          <span className="font-semibold text-lg">Suporte RedeG7</span>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleMobileMenu}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Menu de navegação */}
        <nav className="flex flex-col gap-1 p-2 flex-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={toggleMobileMenu}
              className={`${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary/50"
              } px-3 py-2 rounded-md flex items-center transition-colors`}
            >
              {item.icon}
              <span className="ml-3">{item.label}</span>
            </Link>
          ))}
        </nav>
        
        {/* Informações do usuário e logout */}
        <div className="p-4 border-t flex flex-col gap-2">
          <div>
            <p className="text-sm font-medium truncate">{contactName}</p>
            <p className="text-xs text-muted-foreground truncate">{clientName}</p>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex justify-start">
              <ThemeToggle />
            </div>
            <Button 
              variant="outline" 
              size="default"
              onClick={handleLogout}
              className="w-full"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>
      
      {/* Conteúdo principal - padding acompanha o estado da sidebar */}
      <div
        className={`flex-1 min-w-0 transition-all duration-300 ${
          collapsed ? "md:pl-[4.5rem]" : "md:pl-64"
        }`}
      >
        {/* Cabeçalho móvel - somente visível em telas pequenas */}
        <header className="sticky top-0 z-20 bg-card border-b px-4 py-3 flex justify-between items-center md:hidden">
          <span className="font-semibold text-lg truncate">Suporte RedeG7</span>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleMobileMenu}
            >
              <MenuIcon className="h-5 w-5" />
            </Button>
          </div>
        </header>
        
        {/* Área de conteúdo com padding consistente */}
        <main className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto">
          <div className="w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}