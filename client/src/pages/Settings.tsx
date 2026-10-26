import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Save, 
  User, 
  Mail, 
  Bell,
  MessageSquare, 
  Shield, 
  ExternalLink,
  HelpCircle,
  Plus,
  Pencil,
  Trash2,
  AlertCircle,
  Eye,
  EyeOff,
  Search,
  UserCheck,
  UserX,
  Building2,
  Upload,
  Trash,
  Copy,
  Check,
  Globe,
  Link2
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import NotificationTester from "@/components/notifications/NotificationTester";

// Definir interface para categorias de chamado
interface TicketCategory {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState("profile");
  const { toast } = useToast();

  // ── Identidade Visual (Branding) ──
  const [brandingName, setBrandingName] = useState("");
  const [brandingSlug, setBrandingSlug] = useState("");
  const [brandingLogoPreview, setBrandingLogoPreview] = useState<string | null>(null);
  const [brandingLogoFile, setBrandingLogoFile] = useState<File | null>(null);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingSlugCopied, setBrandingSlugCopied] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const currentUserRole = typeof window !== "undefined" ? localStorage.getItem("user_role") : null;

  // Carregar branding ao abrir aba (autenticado, por tenant)
  useEffect(() => {
    if (activeTab === "branding") {
      fetch("/api/settings/branding", { credentials: "include" })
        .then(r => r.json())
        .then(data => {
          setBrandingName(data.companyName || "");
          setBrandingSlug(data.slug || "");
          setBrandingLogoPreview(data.companyLogoUrl || null);
        })
        .catch(() => {});
    }
  }, [activeTab]);

  const handleBrandingSave = async () => {
    if (!brandingName.trim()) {
      toast({ title: "Nome obrigatório", description: "Informe o nome do sistema.", variant: "destructive" });
      return;
    }
    if (currentUserRole === "admin" && !brandingSlug.trim()) {
      toast({ title: "Slug obrigatório", description: "Defina uma URL de acesso para o seu sistema.", variant: "destructive" });
      return;
    }
    setBrandingSaving(true);
    try {
      const cleanSlug = brandingSlug.toLowerCase().replace(/[^a-z0-9-]/g, "");
      await fetch("/api/settings/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ companyName: brandingName, slug: cleanSlug }),
      });
      if (brandingLogoFile) {
        const formData = new FormData();
        formData.append("logo", brandingLogoFile);
        const res = await fetch("/api/settings/branding/logo", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const data = await res.json();
        if (data.logoUrl) setBrandingLogoPreview(data.logoUrl);
        setBrandingLogoFile(null);
      }
      setBrandingSlug(cleanSlug);
      queryClient.invalidateQueries({ queryKey: ["/api/public/branding"] });
      toast({ title: "Identidade visual salva", description: "As alterações foram aplicadas com sucesso." });
    } catch {
      toast({ title: "Erro", description: "Não foi possível salvar.", variant: "destructive" });
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBrandingLogoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setBrandingLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    await fetch("/api/settings/branding/logo", { method: "DELETE", credentials: "include" });
    setBrandingLogoPreview(null);
    setBrandingLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
    queryClient.invalidateQueries({ queryKey: ["/api/public/branding"] });
    toast({ title: "Logo removida" });
  };

  const handleCopyLoginUrl = () => {
    const url = `${window.location.origin}/login/${brandingSlug}`;
    navigator.clipboard.writeText(url).then(() => {
      setBrandingSlugCopied(true);
      setTimeout(() => setBrandingSlugCopied(false), 2000);
    });
  };
  
  // Profile settings state
  const [profileForm, setProfileForm] = useState({
    name: "Admin User",
    email: "admin@example.com",
    role: "admin",
    avatar: "",
  });
  
  // Formulário de criação de usuário
  const [newUserForm, setNewUserForm] = useState({
    username: "",
    password: "",
    name: "",
    email: "",
    role: "support",
    createPortalAccess: false,
    clientId: 0,
  });
  
  // Lista de usuários
  const [users, setUsers] = useState<any[]>([]);
  const [clientUsers, setClientUsers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [userSubTab, setUserSubTab] = useState<"active" | "inactive">("active");
  const [userFilter, setUserFilter] = useState("");
  
  // Filtrar usuários ativos e inativos
  const activeUsers = users.filter(u => u.isActive !== false);
  const inactiveUsers = users.filter(u => u.isActive === false);
  
  // Aplicar filtro de busca
  const filteredActiveUsers = activeUsers.filter(u => 
    userFilter === "" || 
    u.name?.toLowerCase().includes(userFilter.toLowerCase()) ||
    u.username?.toLowerCase().includes(userFilter.toLowerCase()) ||
    u.email?.toLowerCase().includes(userFilter.toLowerCase())
  );
  const filteredInactiveUsers = inactiveUsers.filter(u => 
    userFilter === "" || 
    u.name?.toLowerCase().includes(userFilter.toLowerCase()) ||
    u.username?.toLowerCase().includes(userFilter.toLowerCase()) ||
    u.email?.toLowerCase().includes(userFilter.toLowerCase())
  );
  
  // Filtro para usuários do portal do cliente
  const [clientUserFilter, setClientUserFilter] = useState("");
  const filteredClientUsers = clientUsers.filter(u => 
    clientUserFilter === "" || 
    u.name?.toLowerCase().includes(clientUserFilter.toLowerCase()) ||
    u.username?.toLowerCase().includes(clientUserFilter.toLowerCase()) ||
    u.email?.toLowerCase().includes(clientUserFilter.toLowerCase()) ||
    u.clientName?.toLowerCase().includes(clientUserFilter.toLowerCase())
  );
  const [editUserForm, setEditUserForm] = useState({
    id: 0,
    username: "",
    name: "",
    email: "",
    role: "",
    password: "",
    showPassword: false,
    isActive: true
  });
  const [showUserDialog, setShowUserDialog] = useState(false);
  
  // Estado para edição de usuário do portal
  const [editClientUserForm, setEditClientUserForm] = useState({
    id: 0,
    username: "",
    name: "",
    email: "",
    clientId: 0,
    isActive: true,
    password: "",
    showPassword: false
  });
  const [showClientUserDialog, setShowClientUserDialog] = useState(false);
  
  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    whatsappNotifications: true,
    ticketCreated: true,
    ticketUpdated: true,
    ticketResolved: true,
    dailyDigest: false,
    weeklyReport: true,
  });
  
  // Ticket categories state
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentCategory, setCurrentCategory] = useState<TicketCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    color: "#3B82F6", // Azul por padrão
  });
  
  // Integration settings state
  const [integrationSettings, setIntegrationSettings] = useState({
    emailService: "smtp",
    smtpHost: "smtp.example.com",
    smtpPort: "587",
    smtpUser: "support@example.com",
    smtpPassword: "••••••••",
    whatsappEnabled: true,
    whatsappNumber: "+5511987654321",
    whatsappApiKey: "••••••••••••••••",
    whatsappAdminNumber: "",
    callmebotApiKey: "",
    cnpjApiEnabled: true,
    cnpjApiKey: "••••••••••••••••",
  });
  
  // Buscar categorias e usuários ao carregar o componente
  useEffect(() => {
    if (activeTab === "categories") {
      fetchCategories();
    }
    if (activeTab === "profile") {
      fetchUsers();
      fetchClientPortalUsers();
      fetchClients();
    }
    if (activeTab === "integrations") {
      fetchIntegrationSettings();
    }
  }, [activeTab]);

  // Função para carregar configurações de integração
  const fetchIntegrationSettings = async () => {
    try {
      const response = await fetch("/api/settings/integration", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setIntegrationSettings(data);
      }
    } catch (error) {
      console.error("Erro ao carregar configurações de integração:", error);
    }
  };
  
  // Função para buscar clientes (empresas)
  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients");
      if (response.ok) {
        const data = await response.json();
        setClients(data);
      } else {
        console.error("Erro ao carregar dados de clientes");
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Não foi possível carregar a lista de clientes."
        });
      }
    } catch (error) {
      console.error("Erro ao buscar clientes:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Ocorreu um erro ao carregar a lista de clientes."
      });
    }
  };

  // Função para buscar usuários do portal de cliente
  const fetchClientPortalUsers = async () => {
    try {
      const response = await fetch("/api/client-contacts/with-credentials");
      if (response.ok) {
        const data = await response.json();
        setClientUsers(data);
      } else {
        throw new Error("Falha ao carregar usuários do portal");
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar usuários do portal",
        description: "Não foi possível carregar a lista de usuários do portal de cliente.",
        variant: "destructive",
      });
    }
  };
  
  // Função para buscar categorias da API
  const fetchCategories = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/ticket-categories");
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      } else {
        throw new Error("Falha ao carregar categorias");
      }
    } catch (error) {
      toast({
        title: "Erro ao carregar categorias",
        description: "Não foi possível carregar as categorias de chamados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfileForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleProfileSave = () => {
    toast({
      title: "Perfil atualizado",
      description: "Suas informações de perfil foram atualizadas com sucesso.",
    });
  };
  
  const handleNotificationToggle = (setting: string) => {
    setNotificationSettings(prev => ({
      ...prev,
      [setting]: !prev[setting as keyof typeof prev],
    }));
  };
  
  const handleNotificationSave = () => {
    toast({
      title: "Configurações de notificação salvas",
      description: "Suas preferências de notificação foram atualizadas com sucesso.",
    });
  };
  
  const handleIntegrationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setIntegrationSettings(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleIntegrationSelectChange = (name: string, value: string) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleIntegrationToggle = (setting: string) => {
    setIntegrationSettings(prev => ({
      ...prev,
      [setting]: !prev[setting as keyof typeof prev],
    }));
  };
  
  const handleIntegrationSave = async () => {
    try {
      const response = await fetch("/api/settings/integration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(integrationSettings),
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({
          title: "Configurações de integração salvas",
          description: "Suas configurações de integração foram atualizadas com sucesso.",
        });
      } else {
        throw new Error(data.message || "Erro ao salvar configurações");
      }
    } catch (error) {
      console.error("Erro ao salvar configurações de integração:", error);
      toast({
        title: "Erro ao salvar configurações",
        description: "Não foi possível salvar as configurações de integração. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleTestEmail = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ testEmail: "danielcarloscti@gmail.com" }),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error("JSON parsing error:", jsonError);
        throw new Error("Resposta inválida do servidor");
      }
      
      if (response.ok && data.success) {
        toast({
          title: "Teste de email bem-sucedido!",
          description: "Email de teste enviado para danielcarloscti@gmail.com com sucesso.",
        });
      } else {
        throw new Error(data.message || "Erro ao enviar email de teste");
      }
    } catch (error: any) {
      console.error("Erro no teste de email:", error);
      toast({
        title: "Erro no teste de email",
        description: error.message || "Não foi possível enviar o email de teste. Verifique as configurações SMTP.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Funções de gerenciamento de categorias
  const openCreateCategoryDialog = () => {
    setCurrentCategory(null);
    setCategoryForm({
      name: "",
      description: "",
      color: "#3B82F6", // Azul por padrão
    });
    setShowCategoryDialog(true);
  };
  
  const openEditCategoryDialog = (category: TicketCategory) => {
    setCurrentCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || "",
      color: category.color || "#3B82F6",
    });
    setShowCategoryDialog(true);
  };
  
  const openDeleteDialog = (category: TicketCategory) => {
    setCurrentCategory(category);
    setShowDeleteDialog(true);
  };
  
  const handleCategoryFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCategoryForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  const handleSaveCategory = async () => {
    try {
      if (!categoryForm.name) {
        toast({
          title: "Nome é obrigatório",
          description: "Por favor, forneça um nome para a categoria.",
          variant: "destructive",
        });
        return;
      }
      
      const data = {
        name: categoryForm.name,
        description: categoryForm.description || null,
        color: categoryForm.color || null
      };
      
      // Se estiver editando uma categoria existente
      if (currentCategory) {
        await fetch(`/api/ticket-categories/${currentCategory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        
        toast({
          title: "Categoria atualizada",
          description: `A categoria "${categoryForm.name}" foi atualizada com sucesso.`,
        });
      } 
      // Se estiver criando uma nova categoria
      else {
        await fetch("/api/ticket-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        
        toast({
          title: "Categoria criada",
          description: `A categoria "${categoryForm.name}" foi criada com sucesso.`,
        });
      }
      
      setShowCategoryDialog(false);
      fetchCategories();
    } catch (error) {
      toast({
        title: "Erro ao salvar categoria",
        description: "Ocorreu um erro ao salvar a categoria. Tente novamente.",
        variant: "destructive",
      });
    }
  };
  
  const handleDeleteCategory = async () => {
    if (!currentCategory) return;
    
    try {
      const response = await fetch(`/api/ticket-categories/${currentCategory.id}`, {
        method: "DELETE",
      });
      
      if (response.ok) {
        toast({
          title: "Categoria excluída",
          description: `A categoria "${currentCategory.name}" foi excluída com sucesso.`,
        });
        setShowDeleteDialog(false);
        fetchCategories();
      } else {
        const errorData = await response.json();
        toast({
          title: "Não foi possível excluir",
          description: errorData.message || "Esta categoria está em uso por chamados existentes e não pode ser excluída.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro ao excluir categoria",
        description: "Ocorreu um erro ao excluir a categoria. Tente novamente.",
        variant: "destructive",
      });
    }
  };
  
  // Função para buscar usuários
  const fetchUsers = async () => {
    try {
      console.log("Buscando lista de usuários...");
      const response = await fetch("/api/users");
      if (response.ok) {
        const data = await response.json();
        console.log("Usuários carregados:", data);
        setUsers(data);
      } else {
        throw new Error("Falha ao carregar usuários");
      }
    } catch (error) {
      console.error("Erro ao buscar usuários:", error);
      toast({
        title: "Erro ao carregar usuários",
        description: "Não foi possível carregar a lista de usuários.",
        variant: "destructive",
      });
    }
  };
  
  // Função para lidar com mudanças no formulário de novo usuário
  const handleNewUserChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setNewUserForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };
  
  // Função para lidar com mudanças no select de função do novo usuário
  const handleNewUserRoleChange = (value: string) => {
    setNewUserForm(prev => ({
      ...prev,
      role: value,
    }));
  };
  
  // Função para abrir modal de edição de usuário
  const openEditUserDialog = (user: any) => {
    setEditUserForm({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      password: "",
      showPassword: false,
      isActive: user.isActive
    });
    setShowUserDialog(true);
  };
  
  // Função para lidar com mudanças no formulário de edição de usuário
  const handleEditUserChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditUserForm(prev => ({
      ...prev,
      [name]: value,
    }));
  };
  
  // Função para ativar/inativar usuário
  const toggleUserActive = async (user: any) => {
    try {
      const newStatus = !user.isActive;
      const response = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: newStatus,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao ${newStatus ? 'ativar' : 'inativar'} usuário`);
      }
      
      // Atualiza a lista de usuários
      fetchUsers();
      
      toast({
        title: `Usuário ${newStatus ? 'ativado' : 'inativado'} com sucesso`,
        description: `O usuário ${user.name} foi ${newStatus ? 'ativado' : 'inativado'} com sucesso.`,
        variant: newStatus ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error(`Erro ao ${!user.isActive ? 'ativar' : 'inativar'} usuário:`, error);
      toast({
        title: `Erro ao ${!user.isActive ? 'ativar' : 'inativar'} usuário`,
        description: `Não foi possível ${!user.isActive ? 'ativar' : 'inativar'} o usuário ${user.name}.`,
        variant: 'destructive',
      });
    }
  };
  
  // Função para lidar com mudanças no select de função do usuário a ser editado
  const handleEditUserRoleChange = (value: string) => {
    setEditUserForm(prev => ({
      ...prev,
      role: value,
    }));
  };
  
  // Função para salvar alterações no usuário
  const handleUpdateUser = async () => {
    try {
      if (!editUserForm.username || !editUserForm.name || !editUserForm.email || !editUserForm.role) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha todos os campos obrigatórios.",
          variant: "destructive",
        });
        return;
      }
      
      const userData = {
        username: editUserForm.username,
        name: editUserForm.name,
        email: editUserForm.email,
        role: editUserForm.role,
        isActive: editUserForm.isActive
      };
      
      // Adicionar senha se foi fornecida
      if (editUserForm.password) {
        Object.assign(userData, { password: editUserForm.password });
      }
      
      const response = await fetch(`/api/users/${editUserForm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      
      if (response.ok) {
        toast({
          title: "Usuário atualizado",
          description: `As informações de ${editUserForm.name} foram atualizadas com sucesso.`,
        });
        
        // Resetar formulário e fechar diálogo
        setShowUserDialog(false);
        
        // Recarregar usuários
        fetchUsers();
      } else {
        throw new Error("Erro ao atualizar usuário");
      }
    } catch (error) {
      toast({
        title: "Erro ao atualizar usuário",
        description: "Não foi possível atualizar as informações do usuário. Tente novamente.",
        variant: "destructive",
      });
    }
  };
  
  // Função para criar novo usuário
  const handleCreateUser = async () => {
    try {
      // Validar campos obrigatórios
      if (!newUserForm.username || !newUserForm.password || !newUserForm.name || !newUserForm.email || !newUserForm.role) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha todos os campos obrigatórios.",
          variant: "destructive",
        });
        return;
      }
      
      // Validar seleção de cliente quando criando acesso ao portal
      if (newUserForm.createPortalAccess && newUserForm.clientId <= 0) {
        toast({
          title: "Empresa não selecionada",
          description: "Para criar acesso ao portal do cliente, selecione uma empresa.",
          variant: "destructive",
        });
        return;
      }
      
      // Preparar dados do usuário
      const userData = {
        username: newUserForm.username,
        password: newUserForm.password,
        name: newUserForm.name,
        email: newUserForm.email,
        role: newUserForm.role,
        isActive: true
      };
      
      // Criar usuário
      const response = await fetch("/api/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao criar usuário");
      }
      
      const newUser = await response.json();
      
      // Se for para criar acesso ao portal, associar o usuário a um cliente
      if (newUserForm.createPortalAccess && newUserForm.clientId > 0) {
        // Obter informações do cliente selecionado
        const clientResponse = await fetch(`/api/clients/${newUserForm.clientId}`);
        const clientData = await clientResponse.json();
        
        // Criar o contato do cliente associado ao usuário
        const contactData = {
          clientId: newUserForm.clientId,
          name: newUserForm.name,
          email: newUserForm.email,
          role: "Usuário do Portal",
          phone: "",
          whatsapp: "",
          isPrimary: false,
          isActive: true,
          credentials: {
            username: newUserForm.username,
            password: newUserForm.password
          }
        };
        
        const contactResponse = await fetch("/api/client-contacts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(contactData),
        });
        
        if (!contactResponse.ok) {
          const errorData = await contactResponse.json();
          throw new Error(errorData.message || "Erro ao criar contato do cliente");
        }
        
        toast({
          title: "Usuário criado com acesso ao portal",
          description: `O usuário ${newUserForm.name} foi criado com sucesso e vinculado à empresa ${clientData.businessName}.`,
        });
      } else {
        toast({
          title: "Usuário criado",
          description: `O usuário ${newUserForm.name} foi criado com sucesso.`,
        });
      }
      
      // Resetar formulário
      setNewUserForm({
        username: "",
        password: "",
        name: "",
        email: "",
        role: "support",
        createPortalAccess: false,
        clientId: 0,
      });
      
      // Recarregar usuários
      fetchUsers();
      if (newUserForm.createPortalAccess) {
        fetchClientPortalUsers();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      toast({
        title: "Erro ao criar usuário",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };
  
  // Função para lidar com select de cliente
  const handleClientSelectChange = (value: string) => {
    setNewUserForm(prev => ({
      ...prev,
      clientId: parseInt(value),
    }));
  };
  
  // Função para abrir diálogo de edição de usuário do portal
  const openEditClientUserDialog = (user: any) => {
    setEditClientUserForm({
      id: user.id,
      username: user.username || "",
      name: user.name,
      email: user.email || "",
      clientId: user.clientId,
      isActive: user.isActive,
      password: "",
      showPassword: false
    });
    setShowClientUserDialog(true);
  };
  
  // Função para atualizar usuário do portal
  const handleUpdateClientUser = async () => {
    try {
      if (!editClientUserForm.username || !editClientUserForm.name || !editClientUserForm.email) {
        toast({
          title: "Campos obrigatórios",
          description: "Por favor, preencha todos os campos obrigatórios.",
          variant: "destructive",
        });
        return;
      }
      
      // Dados básicos do usuário do portal
      const userData = {
        name: editClientUserForm.name,
        email: editClientUserForm.email,
        isActive: editClientUserForm.isActive
      };
      
      // Atualizar contato do cliente
      const contactResponse = await fetch(`/api/client-contacts/${editClientUserForm.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userData),
      });
      
      if (!contactResponse.ok) {
        throw new Error("Erro ao atualizar contato do cliente");
      }
      
      // Se uma senha foi fornecida, atualizar credenciais
      if (editClientUserForm.password) {
        const credentialsData = {
          username: editClientUserForm.username,
          password: editClientUserForm.password
        };
        
        const credentialsResponse = await fetch(`/api/client-contacts/${editClientUserForm.id}/credentials`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentialsData),
        });
        
        if (!credentialsResponse.ok) {
          throw new Error("Erro ao atualizar credenciais");
        }
      }
      // Se não há senha mas há alteração no nome de usuário
      else if (editClientUserForm.username !== clientUsers.find(u => u.id === editClientUserForm.id)?.username) {
        const credentialsData = {
          username: editClientUserForm.username,
          password: "" // Senha vazia indica que não deve ser alterada
        };
        
        const credentialsResponse = await fetch(`/api/client-contacts/${editClientUserForm.id}/credentials`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credentialsData),
        });
        
        if (!credentialsResponse.ok) {
          throw new Error("Erro ao atualizar credenciais");
        }
      }
      
      toast({
        title: "Usuário do portal atualizado",
        description: `As informações de ${editClientUserForm.name} foram atualizadas com sucesso.`,
      });
      
      // Resetar formulário e fechar diálogo
      setShowClientUserDialog(false);
      
      // Recarregar usuários do portal
      fetchClientPortalUsers();
    } catch (error) {
      toast({
        title: "Erro ao atualizar usuário",
        description: "Não foi possível atualizar as informações do usuário. Tente novamente.",
        variant: "destructive",
      });
    }
  };
  
  // Função para toggle de visualização da senha na edição
  const togglePasswordVisibility = () => {
    setEditUserForm(prev => ({
      ...prev,
      showPassword: !prev.showPassword
    }));
  };
  
  // Função para toggle de visualização da senha na edição de usuário do portal
  const toggleClientUserPasswordVisibility = () => {
    setEditClientUserForm(prev => ({
      ...prev,
      showPassword: !prev.showPassword
    }));
  };
  
  // Função para alternar o status ativo/inativo de usuários do portal
  const toggleClientUserActive = async (user: any) => {
    try {
      const newStatus = !user.isActive;
      const response = await fetch(`/api/client-contacts/${user.id}/toggle-status`, {
        method: 'PUT'
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao ${newStatus ? 'ativar' : 'inativar'} usuário do portal`);
      }
      
      // Atualiza a lista de usuários do portal
      fetchClientPortalUsers();
      
      toast({
        title: `Usuário do portal ${newStatus ? 'ativado' : 'inativado'} com sucesso`,
        description: `O acesso de ${user.name} foi ${newStatus ? 'ativado' : 'inativado'} com sucesso.`,
        variant: newStatus ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error(`Erro ao ${!user.isActive ? 'ativar' : 'inativar'} usuário do portal:`, error);
      toast({
        title: `Erro ao ${!user.isActive ? 'ativar' : 'inativar'} usuário do portal`,
        description: `Não foi possível ${!user.isActive ? 'ativar' : 'inativar'} o acesso de ${user.name}.`,
        variant: 'destructive',
      });
    }
  };
  
  return (
    <section className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Configurações do Sistema</h1>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex overflow-x-auto space-x-2 border-b w-full rounded-none pb-px justify-start">
          <TabsTrigger value="profile" className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            <span>Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center">
            <Bell className="w-4 h-4 mr-2" />
            <span>Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center">
            <MessageSquare className="w-4 h-4 mr-2" />
            <span>Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="notification-test" className="flex items-center">
            <HelpCircle className="w-4 h-4 mr-2" />
            <span>Testar Notificações</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center">
            <ExternalLink className="w-4 h-4 mr-2" />
            <span>Integrações</span>
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center">
            <Building2 className="w-4 h-4 mr-2" />
            <span>Identidade Visual</span>
          </TabsTrigger>
        </TabsList>
        
        {/* User Management Tab */}
        <TabsContent value="profile">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Meu Perfil</CardTitle>
                    <CardDescription>
                      Gerencie suas informações pessoais.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      name="name"
                      value={profileForm.name}
                      onChange={handleProfileChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={profileForm.email}
                      onChange={handleProfileChange}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Função</Label>
                    <Input
                      id="role"
                      value={profileForm.role === "admin" ? "Administrador" : "Suporte"}
                      readOnly
                      disabled
                    />
                  </div>
                  <Button
                    className="w-full mt-4 flex items-center justify-center"
                    onClick={handleProfileSave}
                  >
                    <Save className="h-4 w-4 mr-2" /> Salvar Alterações
                  </Button>
                </CardContent>
              </Card>
            </div>
            
            <div className="md:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Gerenciar Usuários</CardTitle>
                    <CardDescription>
                      Adicione novos usuários ao sistema e visualize os existentes.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor="username">Nome de Usuário</Label>
                      <Input
                        id="username"
                        name="username"
                        placeholder="usuario123"
                        value={newUserForm.username}
                        onChange={handleNewUserChange}
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor="password">Senha</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="********"
                        value={newUserForm.password}
                        onChange={handleNewUserChange}
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-1">
                      <Label htmlFor="role">Função</Label>
                      <Select
                        value={newUserForm.role}
                        onValueChange={handleNewUserRoleChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Administrador</SelectItem>
                          <SelectItem value="support">Suporte</SelectItem>
                          <SelectItem value="client">Portal do Cliente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 lg:col-span-3">
                      <Label htmlFor="name">Nome Completo</Label>
                      <Input
                        id="name"
                        name="name"
                        placeholder="João Silva"
                        value={newUserForm.name}
                        onChange={handleNewUserChange}
                      />
                    </div>
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        placeholder="usuario@exemplo.com"
                        value={newUserForm.email}
                        onChange={handleNewUserChange}
                      />
                    </div>
                    
                    <div className="flex items-center space-x-2 lg:col-span-5">
                      <Checkbox 
                        id="createPortalAccess" 
                        name="createPortalAccess"
                        checked={newUserForm.createPortalAccess}
                        onCheckedChange={(checked) => {
                          setNewUserForm(prev => ({
                            ...prev,
                            createPortalAccess: checked === true
                          }));
                        }}
                      />
                      <label
                        htmlFor="createPortalAccess"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        Criar acesso ao portal do cliente
                      </label>
                    </div>
                    
                    {newUserForm.createPortalAccess && (
                      <div className="space-y-2 lg:col-span-3">
                        <Label htmlFor="clientId">Empresa</Label>
                        <Select
                          value={newUserForm.clientId > 0 ? newUserForm.clientId.toString() : ""}
                          onValueChange={handleClientSelectChange}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a empresa" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map(client => (
                              <SelectItem key={client.id} value={client.id.toString()}>
                                {client.businessName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newUserForm.createPortalAccess && newUserForm.clientId === 0 && (
                          <p className="text-xs text-red-500 mt-1">
                            É necessário selecionar uma empresa para criar acesso ao portal
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
                
                <div className="flex justify-end p-4">
                  <Button onClick={handleCreateUser} className="flex items-center">
                    <Plus className="h-4 w-4 mr-2" /> Adicionar Usuário
                  </Button>
                </div>
                
                <Separator />
                
                <div className="p-4">
                  <h3 className="text-lg font-medium mb-4">Usuários do Sistema</h3>
                  
                  {/* Sub-abas e Filtro */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div className="flex space-x-2">
                      <Button
                        variant={userSubTab === "active" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserSubTab("active")}
                        className="flex items-center"
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Ativos ({activeUsers.length})
                      </Button>
                      <Button
                        variant={userSubTab === "inactive" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setUserSubTab("inactive")}
                        className="flex items-center"
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Inativos ({inactiveUsers.length})
                      </Button>
                    </div>
                    
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <Input
                        placeholder="Buscar usuário..."
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  
                  {/* Tabela de Usuários Ativos */}
                  {userSubTab === "active" && (
                    <>
                      {filteredActiveUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <UserCheck className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                          <p className="text-neutral-500">
                            {userFilter ? "Nenhum usuário ativo encontrado com esse filtro" : "Nenhum usuário ativo cadastrado"}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Função</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredActiveUsers.map(user => (
                                <TableRow key={user.id}>
                                  <TableCell>{user.username}</TableCell>
                                  <TableCell>{user.name}</TableCell>
                                  <TableCell>{user.email}</TableCell>
                                  <TableCell>
                                    {user.role === "admin" ? "Administrador" : 
                                     user.role === "support" ? "Suporte" : 
                                     user.role === "client" ? "Portal do Cliente" : user.role}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="default">Ativo</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex space-x-2">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => openEditUserDialog(user)}
                                      >
                                        <Pencil className="h-4 w-4 mr-1" /> Editar
                                      </Button>
                                      
                                      <Button 
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => toggleUserActive(user)}
                                      >
                                        <AlertCircle className="h-4 w-4 mr-1" /> Inativar
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </>
                  )}
                  
                  {/* Tabela de Usuários Inativos */}
                  {userSubTab === "inactive" && (
                    <>
                      {filteredInactiveUsers.length === 0 ? (
                        <div className="text-center py-8">
                          <UserX className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                          <p className="text-neutral-500">
                            {userFilter ? "Nenhum usuário inativo encontrado com esse filtro" : "Nenhum usuário inativo"}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Usuário</TableHead>
                                <TableHead>Nome</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Função</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Ações</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filteredInactiveUsers.map(user => (
                                <TableRow key={user.id}>
                                  <TableCell>{user.username}</TableCell>
                                  <TableCell>{user.name}</TableCell>
                                  <TableCell>{user.email}</TableCell>
                                  <TableCell>
                                    {user.role === "admin" ? "Administrador" : 
                                     user.role === "support" ? "Suporte" : 
                                     user.role === "client" ? "Portal do Cliente" : user.role}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="secondary">Inativo</Badge>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex space-x-2">
                                      <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => openEditUserDialog(user)}
                                      >
                                        <Pencil className="h-4 w-4 mr-1" /> Editar
                                      </Button>
                                      
                                      <Button 
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => toggleUserActive(user)}
                                      >
                                        <User className="h-4 w-4 mr-1" /> Ativar
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Card>
              
              {/* Usuários do Portal do Cliente */}
              <Card className="mt-6">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle>Usuários do Portal do Cliente</CardTitle>
                    <CardDescription>
                      Gerencie o acesso dos usuários ao portal do cliente.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Campo de Pesquisa */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <Input
                      placeholder="Buscar usuário do portal..."
                      value={clientUserFilter}
                      onChange={(e) => setClientUserFilter(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  
                  {filteredClientUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <Shield className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                      <p className="text-neutral-500">
                        {clientUserFilter ? "Nenhum usuário encontrado com esse filtro" : "Nenhum usuário do portal encontrado"}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Empresa</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredClientUsers.map(user => (
                            <TableRow key={user.id}>
                              <TableCell>{user.username}</TableCell>
                              <TableCell>{user.name}</TableCell>
                              <TableCell>{user.email}</TableCell>
                              <TableCell>{user.clientName}</TableCell>
                              <TableCell>
                                <Badge variant={user.isActive ? "default" : "secondary"}>
                                  {user.isActive ? "Ativo" : "Inativo"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex space-x-2">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => openEditClientUserDialog(user)}
                                  >
                                    <Pencil className="h-4 w-4 mr-1" /> Editar
                                  </Button>
                                  
                                  <Button 
                                    variant={user.isActive ? "destructive" : "secondary"}
                                    size="sm"
                                    onClick={() => toggleClientUserActive(user)}
                                  >
                                    {user.isActive ? (
                                      <>
                                        <AlertCircle className="h-4 w-4 mr-1" /> Inativar
                                      </>
                                    ) : (
                                      <>
                                        <User className="h-4 w-4 mr-1" /> Ativar
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
        
        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Preferências de Notificação</CardTitle>
              <CardDescription>
                Configure como e quando deseja receber notificações do sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">Email</Label>
                      <p className="text-sm text-muted-foreground">
                        Receber notificações por email.
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.emailNotifications}
                      onCheckedChange={() => handleNotificationToggle("emailNotifications")}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label className="text-base">WhatsApp</Label>
                      <p className="text-sm text-muted-foreground">
                        Receber notificações por WhatsApp.
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.whatsappNotifications}
                      onCheckedChange={() => handleNotificationToggle("whatsappNotifications")}
                    />
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Eventos</h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Novos Chamados</Label>
                        <p className="text-sm text-muted-foreground">
                          Quando um novo chamado for aberto.
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.ticketCreated}
                        onCheckedChange={() => handleNotificationToggle("ticketCreated")}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Atualizações de Chamados</Label>
                        <p className="text-sm text-muted-foreground">
                          Quando um chamado for atualizado.
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.ticketUpdated}
                        onCheckedChange={() => handleNotificationToggle("ticketUpdated")}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Chamados Resolvidos</Label>
                        <p className="text-sm text-muted-foreground">
                          Quando um chamado for resolvido.
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.ticketResolved}
                        onCheckedChange={() => handleNotificationToggle("ticketResolved")}
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Relatórios</h3>
                  <div className="grid gap-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Resumo Diário</Label>
                        <p className="text-sm text-muted-foreground">
                          Receber um resumo diário de atividades.
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.dailyDigest}
                        onCheckedChange={() => handleNotificationToggle("dailyDigest")}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Relatório Semanal</Label>
                        <p className="text-sm text-muted-foreground">
                          Receber um relatório semanal de desempenho.
                        </p>
                      </div>
                      <Switch
                        checked={notificationSettings.weeklyReport}
                        onCheckedChange={() => handleNotificationToggle("weeklyReport")}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end p-6 pt-0">
              <Button onClick={handleNotificationSave} className="flex items-center">
                <Save className="h-4 w-4 mr-2" /> Salvar Configurações
              </Button>
            </div>
          </Card>
        </TabsContent>
        
        {/* Categories Settings */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Categorias de Chamados</CardTitle>
                <CardDescription>
                  Gerencie as categorias para classificação de chamados.
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreateCategoryDialog}>
                <Plus className="h-4 w-4 mr-2" /> Nova Categoria
              </Button>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Carregando categorias...</p>
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="h-12 w-12 mx-auto text-neutral-300 mb-3" />
                  <p className="text-neutral-500">Nenhuma categoria encontrada</p>
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Cor</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map(category => (
                        <TableRow key={category.id}>
                          <TableCell>{category.name}</TableCell>
                          <TableCell>{category.description || "-"}</TableCell>
                          <TableCell>
                            {category.color ? (
                              <div className="flex items-center space-x-2">
                                <div
                                  className="w-6 h-6 rounded-full"
                                  style={{ backgroundColor: category.color }}
                                />
                                <span>{category.color}</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditCategoryDialog(category)}
                              >
                                <Pencil className="h-4 w-4 mr-1" /> Editar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => openDeleteDialog(category)}
                              >
                                <Trash2 className="h-4 w-4 mr-1" /> Excluir
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notification-test">
          <NotificationTester />
        </TabsContent>
        
        {/* Integration Settings */}
        <TabsContent value="integrations">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Integração</CardTitle>
              <CardDescription>
                Configure as integração com serviços externos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Email</h3>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2 col-span-1">
                        <Label htmlFor="emailService">Serviço</Label>
                        <Select
                          value={integrationSettings.emailService}
                          onValueChange={(value) => handleIntegrationSelectChange("emailService", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="smtp">SMTP</SelectItem>
                            <SelectItem value="sendgrid">SendGrid</SelectItem>
                            <SelectItem value="mailgun">Mailgun</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 col-span-3">
                        <Label htmlFor="smtpHost">Servidor SMTP</Label>
                        <Input
                          id="smtpHost"
                          name="smtpHost"
                          value={integrationSettings.smtpHost}
                          onChange={handleIntegrationChange}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="space-y-2 col-span-1">
                        <Label htmlFor="smtpPort">Porta</Label>
                        <Input
                          id="smtpPort"
                          name="smtpPort"
                          value={integrationSettings.smtpPort}
                          onChange={handleIntegrationChange}
                        />
                      </div>
                      <div className="space-y-2 col-span-3">
                        <Label htmlFor="smtpUser">Usuário</Label>
                        <Input
                          id="smtpUser"
                          name="smtpUser"
                          value={integrationSettings.smtpUser}
                          onChange={handleIntegrationChange}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPassword">Senha</Label>
                      <Input
                        id="smtpPassword"
                        name="smtpPassword"
                        type="password"
                        value={integrationSettings.smtpPassword}
                        onChange={handleIntegrationChange}
                      />
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">WhatsApp</h3>
                    <Switch
                      checked={integrationSettings.whatsappEnabled}
                      onCheckedChange={() => handleIntegrationToggle("whatsappEnabled")}
                    />
                  </div>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="whatsappNumber">Número WhatsApp</Label>
                      <Input
                        id="whatsappNumber"
                        name="whatsappNumber"
                        value={integrationSettings.whatsappNumber}
                        onChange={handleIntegrationChange}
                        disabled={!integrationSettings.whatsappEnabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsappApiKey">Chave de API</Label>
                      <Input
                        id="whatsappApiKey"
                        name="whatsappApiKey"
                        type="password"
                        value={integrationSettings.whatsappApiKey}
                        onChange={handleIntegrationChange}
                        disabled={!integrationSettings.whatsappEnabled}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="whatsappAdminNumber">WhatsApp do Administrador (Notificações)</Label>
                      <Input
                        id="whatsappAdminNumber"
                        name="whatsappAdminNumber"
                        value={integrationSettings.whatsappAdminNumber || ""}
                        onChange={handleIntegrationChange}
                        placeholder="5511999999999"
                      />
                      <p className="text-xs text-muted-foreground">
                        Número para receber notificações de novos chamados. Formato: código do país + DDD + número (ex: 5511999999999)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="callmebotApiKey">Chave API CallMeBot</Label>
                      <Input
                        id="callmebotApiKey"
                        name="callmebotApiKey"
                        type="password"
                        value={integrationSettings.callmebotApiKey || ""}
                        onChange={handleIntegrationChange}
                        placeholder="Sua chave API do CallMeBot"
                      />
                      <p className="text-xs text-muted-foreground">
                        Para obter a chave: 1) Envie do seu WhatsApp para +34 644 71 99 43 a mensagem "I allow callmebot to send me messages" 2) Você receberá sua chave API
                      </p>
                    </div>
                    <div className="pt-4">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const response = await fetch("/api/test-admin-notification", {
                              method: "POST",
                              credentials: "include",
                            });
                            const result = await response.json();
                            if (result.success) {
                              toast({
                                title: "Teste enviado!",
                                description: "Verifique o WhatsApp do administrador configurado.",
                              });
                            } else {
                              toast({
                                title: "Erro no teste",
                                description: result.message || "Não foi possível enviar a notificação de teste.",
                                variant: "destructive",
                              });
                            }
                          } catch (error) {
                            toast({
                              title: "Erro",
                              description: "Falha ao enviar notificação de teste.",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Bell className="h-4 w-4 mr-2" /> Testar Notificação
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Envia uma notificação de teste para o número do administrador configurado acima.
                      </p>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-medium">API de Consulta CNPJ</h3>
                    <Switch
                      checked={integrationSettings.cnpjApiEnabled}
                      onCheckedChange={() => handleIntegrationToggle("cnpjApiEnabled")}
                    />
                  </div>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="cnpjApiKey">Chave de API</Label>
                      <Input
                        id="cnpjApiKey"
                        name="cnpjApiKey"
                        type="password"
                        value={integrationSettings.cnpjApiKey}
                        onChange={handleIntegrationChange}
                        disabled={!integrationSettings.cnpjApiEnabled}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <div className="flex justify-end gap-3 p-6 pt-0">
              <Button 
                onClick={handleTestEmail} 
                variant="outline" 
                className="flex items-center"
                disabled={loading || !integrationSettings.smtpHost || !integrationSettings.smtpUser || !integrationSettings.smtpPassword}
              >
                <Mail className="h-4 w-4 mr-2" /> 
                {loading ? "Enviando..." : "Testar Email"}
              </Button>
              <Button onClick={handleIntegrationSave} className="flex items-center">
                <Save className="h-4 w-4 mr-2" /> Salvar Configurações
              </Button>
            </div>
          </Card>
        </TabsContent>

        {/* ── Identidade Visual ── */}
        <TabsContent value="branding">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" /> Identidade Visual
                </CardTitle>
                <CardDescription>
                  Personalize o nome, logo e URL de acesso do seu sistema. Cada licenciado tem sua própria página de login.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Nome do sistema */}
                <div className="space-y-2">
                  <Label htmlFor="branding-name">Nome do sistema</Label>
                  <Input
                    id="branding-name"
                    value={brandingName}
                    onChange={e => setBrandingName(e.target.value)}
                    placeholder="Ex.: Suporte Minha Empresa"
                    className="max-w-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este nome aparecerá na tela de login e no topo da barra lateral.
                  </p>
                </div>

                {/* Slug / URL de acesso — apenas para admin/licenciado */}
                {currentUserRole === "admin" && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <Label htmlFor="branding-slug" className="flex items-center gap-2">
                        <Globe className="h-4 w-4" /> URL de Acesso
                      </Label>
                      <div className="flex items-center gap-2 max-w-sm">
                        <span className="text-sm text-muted-foreground whitespace-nowrap">/login/</span>
                        <Input
                          id="branding-slug"
                          value={brandingSlug}
                          onChange={e => setBrandingSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                          placeholder="minha-empresa"
                          className="font-mono"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Apenas letras minúsculas, números e hífens. Ex.: <span className="font-mono">minha-empresa</span>
                      </p>

                      {/* URL gerada */}
                      {brandingSlug && (
                        <div className="mt-1 rounded-lg border bg-muted/40 p-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Link2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-sm font-mono truncate text-foreground">
                              {window.location.origin}/login/<span className="text-primary font-semibold">{brandingSlug}</span>
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 h-8 px-2 flex items-center gap-1"
                            onClick={handleCopyLoginUrl}
                          >
                            {brandingSlugCopied
                              ? <><Check className="h-3.5 w-3.5 text-green-500" /> <span className="text-xs text-green-600">Copiado!</span></>
                              : <><Copy className="h-3.5 w-3.5" /> <span className="text-xs">Copiar</span></>
                            }
                          </Button>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Compartilhe esse link com sua equipe. Ao acessar, verão a sua logo e nome do sistema.
                      </p>
                    </div>
                  </>
                )}

                <Separator />

                {/* Logo */}
                <div className="space-y-3">
                  <Label>Logo da empresa</Label>
                  {brandingLogoPreview ? (
                    <div className="flex items-start gap-4">
                      <div className="border rounded-lg p-3 bg-muted/30 flex items-center justify-center w-40 h-28">
                        <img
                          src={brandingLogoPreview}
                          alt="Preview da logo"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="flex flex-col gap-2 mt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2"
                          onClick={() => logoInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5" /> Trocar logo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex items-center gap-2 text-red-500 hover:text-red-600"
                          onClick={handleRemoveLogo}
                        >
                          <Trash className="h-3.5 w-3.5" /> Remover logo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar a logo</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG ou WebP — máx. 2 MB</p>
                    </div>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLogoChange}
                  />
                  {brandingLogoFile && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Upload className="h-3 w-3" /> Arquivo selecionado: {brandingLogoFile.name}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    A logo aparecerá na tela de login e no topo da barra lateral do sistema.
                  </p>
                </div>

                {/* Preview */}
                <Separator />
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs uppercase tracking-wider">Pré-visualização (sidebar)</Label>
                  <div className="border rounded-lg p-4 bg-neutral-700 flex flex-col items-center gap-2 w-48">
                    {brandingLogoPreview ? (
                      <img src={brandingLogoPreview} alt="preview" className="h-12 object-contain" />
                    ) : (
                      <div className="h-12 w-24 bg-neutral-600 rounded flex items-center justify-center">
                        <Building2 className="h-6 w-6 text-neutral-400" />
                      </div>
                    )}
                    <p className="text-white text-sm font-semibold text-center">{brandingName || "Nome do sistema"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Como ficará na barra lateral</p>
                </div>

                <div className="pt-2">
                  <Button onClick={handleBrandingSave} disabled={brandingSaving} className="flex items-center gap-2">
                    <Save className="h-4 w-4" />
                    {brandingSaving ? "Salvando..." : "Salvar identidade visual"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Edit User Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Nome de Usuário</Label>
              <Input
                id="edit-username"
                name="username"
                value={editUserForm.username}
                onChange={handleEditUserChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome Completo</Label>
              <Input
                id="edit-name"
                name="name"
                value={editUserForm.name}
                onChange={handleEditUserChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                value={editUserForm.email}
                onChange={handleEditUserChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-role">Função</Label>
              <Select
                value={editUserForm.role}
                onValueChange={handleEditUserRoleChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="support">Suporte</SelectItem>
                  <SelectItem value="client">Portal do Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="edit-password">Nova Senha (opcional)</Label>
                <Button variant="ghost" size="sm" onClick={togglePasswordVisibility} className="h-8 px-2">
                  {editUserForm.showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Input
                id="edit-password"
                name="password"
                type={editUserForm.showPassword ? "text" : "password"}
                placeholder="Deixe em branco para manter a senha atual"
                value={editUserForm.password}
                onChange={handleEditUserChange}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="edit-isActive" 
                checked={editUserForm.isActive}
                onCheckedChange={(checked) => {
                  setEditUserForm(prev => ({
                    ...prev,
                    isActive: checked === true
                  }));
                }}
              />
              <label
                htmlFor="edit-isActive"
                className="text-sm font-medium leading-none"
              >
                Usuário ativo
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateUser}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Edit Client User Dialog */}
      <Dialog open={showClientUserDialog} onOpenChange={setShowClientUserDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário do Portal</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário do portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-client-username">Nome de Usuário</Label>
              <Input
                id="edit-client-username"
                name="username"
                value={editClientUserForm.username}
                onChange={(e) => setEditClientUserForm(prev => ({
                  ...prev,
                  username: e.target.value
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-name">Nome Completo</Label>
              <Input
                id="edit-client-name"
                name="name"
                value={editClientUserForm.name}
                onChange={(e) => setEditClientUserForm(prev => ({
                  ...prev,
                  name: e.target.value
                }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-client-email">Email</Label>
              <Input
                id="edit-client-email"
                name="email"
                type="email"
                value={editClientUserForm.email}
                onChange={(e) => setEditClientUserForm(prev => ({
                  ...prev,
                  email: e.target.value
                }))}
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="edit-client-password">Nova Senha (opcional)</Label>
                <Button variant="ghost" size="sm" onClick={toggleClientUserPasswordVisibility} className="h-8 px-2">
                  {editClientUserForm.showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Input
                id="edit-client-password"
                name="password"
                type={editClientUserForm.showPassword ? "text" : "password"}
                placeholder="Deixe em branco para manter a senha atual"
                value={editClientUserForm.password}
                onChange={(e) => setEditClientUserForm(prev => ({
                  ...prev,
                  password: e.target.value
                }))}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="edit-client-isActive" 
                checked={editClientUserForm.isActive}
                onCheckedChange={(checked) => {
                  setEditClientUserForm(prev => ({
                    ...prev,
                    isActive: checked === true
                  }));
                }}
              />
              <label
                htmlFor="edit-client-isActive"
                className="text-sm font-medium leading-none"
              >
                Usuário ativo
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClientUserDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateClientUser}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Category Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {currentCategory ? "Editar Categoria" : "Nova Categoria"}
            </DialogTitle>
            <DialogDescription>
              {currentCategory
                ? "Atualize as informações da categoria."
                : "Adicione uma nova categoria para classificar chamados."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Nome</Label>
              <Input
                id="category-name"
                name="name"
                value={categoryForm.name}
                onChange={handleCategoryFormChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-description">Descrição (opcional)</Label>
              <Input
                id="category-description"
                name="description"
                value={categoryForm.description}
                onChange={handleCategoryFormChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-color">Cor (opcional)</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="category-color"
                  name="color"
                  type="color"
                  className="w-12 h-10 p-1"
                  value={categoryForm.color}
                  onChange={handleCategoryFormChange}
                />
                <Input
                  value={categoryForm.color}
                  onChange={handleCategoryFormChange}
                  name="color"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveCategory}>
              {currentCategory ? "Atualizar" : "Criar"} Categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Categoria</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir a categoria "{currentCategory?.name}"?
              Esta ação não poderá ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteCategory}>
              Sim, Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}