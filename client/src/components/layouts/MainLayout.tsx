import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import { Menu, X } from 'lucide-react';
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import ReminderOverlay from "./ReminderOverlay";

type MainLayoutProps = {
  children: React.ReactNode;
};

export default function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<boolean>(false);

  // Buscar largura atual da sidebar quando o componente montar
  useEffect(() => {
    const getSidebarState = () => {
      const isCollapsed = localStorage.getItem("sidebar_collapsed") === "true";
      const width = isCollapsed 
        ? 80 
        : Number(localStorage.getItem("sidebar_width")) || 256;
      
      setSidebarWidth(width);
      setCollapsed(isCollapsed);
    };

    getSidebarState();
    
    // Adicionar um listener para mudanças no localStorage
    const handleStorageChange = () => {
      getSidebarState();
    };
    
    window.addEventListener('storage', handleStorageChange);
    // Listener personalizado para atualizações do sidebar
    window.addEventListener('sidebar-updated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sidebar-updated', handleStorageChange);
    };
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="font-sans bg-background min-h-screen flex flex-col">
      {/* Sidebar para desktop - posicionada fixamente */}
      <div className="hidden md:block fixed top-0 left-0 bottom-0 z-30">
        <Sidebar />
      </div>

      {/* Theme Toggle para desktop - posicionado no canto superior direito */}
      <div className="hidden md:block fixed top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden bg-neutral-700 text-white p-3 fixed top-0 left-0 right-0 z-10">
        <div className="flex justify-between items-center">
          <h1 className="text-lg font-semibold truncate">Suporte RedeG7</h1>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar} 
            className="text-white hover:bg-neutral-600"
          >
            <Menu size={24} />
          </Button>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden" 
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Mobile Sidebar */}
      <div className={`
        fixed top-0 left-0 bottom-0 z-50 w-[280px] bg-neutral-700 transform transition-transform duration-300 md:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex justify-between items-center p-4 border-b border-neutral-600">
          <h2 className="text-white font-semibold text-lg">Menu</h2>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="text-white hover:bg-neutral-600"
          >
            <X size={18} />
          </Button>
        </div>
        <div className="h-[calc(100%-60px)] overflow-y-auto">
          <Sidebar onItemClick={toggleSidebar} />
        </div>
      </div>

      {/* Main Content - com padding dinâmico baseado na largura atual da sidebar */}
      <main 
        style={{ paddingLeft: sidebarWidth > 0 ? `${sidebarWidth}px` : '0' }}
        className={`
          flex-1 transition-all duration-300
          pt-16 md:pt-6
          px-3 sm:px-4 md:px-6
          pb-4 md:pb-6
        `}
      >
        <div className="max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>

      {/* Notificações de lembrete – aparece em todas as telas */}
      <ReminderOverlay />
    </div>
  );
}
