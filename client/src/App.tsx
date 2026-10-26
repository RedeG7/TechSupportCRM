import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Tickets from "@/pages/Tickets";
import Clients from "@/pages/Clients";
import Reports from "@/pages/Reports";
import Investments from "@/pages/Investments";
import Settings from "@/pages/Settings";
import Login from "@/pages/Login";
import ClientLogin from "@/pages/ClientLogin";
import ClientDashboard from "@/pages/ClientDashboard";
import ClientTickets from "@/pages/ClientTickets";
import ClientTicketDetail from "@/pages/ClientTicketDetail";
import ClientProfile from "@/pages/ClientProfile";
import WhatsAppSetup from "@/pages/WhatsAppSetup";
import WhatsAppContacts from "@/pages/WhatsAppContacts";
import ChatbotPanel from "@/pages/ChatbotPanel";
import TicketRating from "@/pages/TicketRating";
import SuperAdmin from "@/pages/SuperAdmin";
import MainLayout from "@/components/layouts/MainLayout";
import ClientLayout from "@/components/layouts/ClientLayout";
import { useEffect } from "react";
import { ThemeProvider } from "@/hooks/use-theme";

// Componente para redirecionar baseado na autenticação administrativa
function AdminAuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  
  useEffect(() => {
    const userId = localStorage.getItem("user_id");
    const userRole = localStorage.getItem("user_role");
    
    if (!userId) {
      navigate("/login");
    } else if (userRole === "client") {
      navigate("/client/dashboard");
    }
  }, [navigate]);
  
  return <>{children}</>;
}

// Componente para redirecionar baseado na autenticação do cliente
function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  
  useEffect(() => {
    const clientId = localStorage.getItem("client_id");
    const userRole = localStorage.getItem("user_role");
    
    if (!clientId) {
      navigate("/client/login");
    } else if (userRole === "admin") {
      navigate("/dashboard");
    }
  }, [navigate]);
  
  return <>{children}</>;
}

function Router() {
  const [location] = useLocation();
  
  // Rota raiz - redirecionar para login do cliente
  if (location === "/") {
    return (
      <Switch>
        <Route path="/">
          <Redirect to="/client/login" />
        </Route>
      </Switch>
    );
  }
  
  // Rotas públicas de login administrativo (com e sem slug)
  if (location === "/login" || location.startsWith("/login/")) {
    return (
      <Switch>
        <Route path="/login/:slug" component={Login} />
        <Route path="/login" component={Login} />
        <Route path="*">
          <Login />
        </Route>
      </Switch>
    );
  }
  
  // Rotas públicas de login do cliente
  if (location === "/client/login") {
    return (
      <Switch>
        <Route path="/client/login" component={ClientLogin} />
        <Route path="*">
          <ClientLogin />
        </Route>
      </Switch>
    );
  }
  
  // Rota pública de avaliação de chamado
  if (location.startsWith("/avaliacao/")) {
    return (
      <Switch>
        <Route path="/avaliacao/:token" component={TicketRating} />
      </Switch>
    );
  }
  
  // Verifica se é uma rota de cliente
  if (location.startsWith("/client/")) {
    return (
      <ClientAuthGuard>
        <ClientLayout>
          <Switch>
            <Route path="/client/dashboard" component={ClientDashboard} />
            <Route path="/client/tickets" component={ClientTickets} />
            <Route path="/client/tickets/:id" component={ClientTicketDetail} />
            <Route path="/client/profile" component={ClientProfile} />
            <Route path="/client/*" component={NotFound} />
          </Switch>
        </ClientLayout>
      </ClientAuthGuard>
    );
  }
  
  // Rotas administrativas protegidas
  return (
    <AdminAuthGuard>
      <MainLayout>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/tickets" component={Tickets} />
          <Route path="/clients" component={Clients} />
          <Route path="/reports" component={Reports} />
          <Route path="/investments" component={Investments} />
          <Route path="/settings" component={Settings} />
          <Route path="/whatsapp-setup" component={WhatsAppSetup} />
          <Route path="/whatsapp-contacts" component={WhatsAppContacts} />
          <Route path="/chatbot" component={ChatbotPanel} />
          <Route path="/super-admin" component={SuperAdmin} />
          <Route component={NotFound} />
        </Switch>
      </MainLayout>
    </AdminAuthGuard>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <QueryClientProvider client={queryClient}>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
