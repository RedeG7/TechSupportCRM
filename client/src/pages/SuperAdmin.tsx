import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Shield, Users, Building2, Plus, Pencil, Trash2, Lock, Unlock,
  Key, Calendar, CheckCircle, XCircle, Loader2, AlertTriangle,
  UserCheck, Globe, Laptop, CreditCard, Info, ChevronRight
} from "lucide-react";

// ─── Role definitions ───────────────────────────────────────────────────────
const INTERNAL_ROLES = [
  { value: "super_admin", label: "Super Admin", color: "bg-purple-100 text-purple-800", desc: "Acesso total ao sistema, gerencia licenciados" },
  { value: "admin", label: "Administrador (Licenciado)", color: "bg-blue-100 text-blue-800", desc: "Administra o próprio ambiente e usuários" },
  { value: "supervisor", label: "Supervisor", color: "bg-green-100 text-green-800", desc: "Supervisiona equipe e chamados" },
  { value: "operacional", label: "Usuário Operacional", color: "bg-gray-100 text-gray-700", desc: "Acesso operacional ao sistema" },
];

const LICENSE_STATUS = [
  { value: "active", label: "Ativa", color: "bg-green-100 text-green-800" },
  { value: "trial", label: "Trial", color: "bg-yellow-100 text-yellow-800" },
  { value: "expired", label: "Expirada", color: "bg-red-100 text-red-800" },
  { value: "suspended", label: "Suspensa", color: "bg-orange-100 text-orange-800" },
];

const PLANS = ["Básico", "Profissional", "Empresarial", "Personalizado"];

function roleBadge(role: string) {
  const found = INTERNAL_ROLES.find(r => r.value === role);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${found?.color || "bg-gray-100 text-gray-600"}`}>
      {found?.label || role}
    </span>
  );
}

function licenseBadge(status: string) {
  const found = LICENSE_STATUS.find(s => s.value === status);
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${found?.color || "bg-gray-100 text-gray-600"}`}>
      {found?.label || status || "Ativa"}
    </span>
  );
}

// ─── Default form states ─────────────────────────────────────────────────────
const defaultLicenseForm = {
  name: "", username: "", email: "", phone: "", password: "",
  companyName: "", subscriptionPlan: "Básico",
  licenseStatus: "active", licenseExpiresAt: "", licenseNotes: "",
  isActive: true, isBlocked: false,
};

const defaultUserForm = {
  name: "", username: "", email: "", password: "", role: "operacional",
  isActive: true, isBlocked: false,
};

const defaultLicMgmtForm = {
  licenseStatus: "active", licenseExpiresAt: "", licenseNotes: "",
  subscriptionPlan: "Básico", isBlocked: false,
};

// ─── Main component ──────────────────────────────────────────────────────────
export default function SuperAdmin() {
  const { toast } = useToast();

  // Licensees
  const [licenseDialogOpen, setLicenseDialogOpen] = useState(false);
  const [licMgmtOpen, setLicMgmtOpen] = useState(false);
  const [selectedLicensee, setSelectedLicensee] = useState<any>(null);
  const [licenseForm, setLicenseForm] = useState({ ...defaultLicenseForm });
  const [licMgmtForm, setLicMgmtForm] = useState({ ...defaultLicMgmtForm });

  // Internal users
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [userForm, setUserForm] = useState({ ...defaultUserForm });
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const { data: allUsers = [], isLoading: loadingUsers } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: tenantBrandings = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/tenant-brandings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenant-brandings", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const getBrandingForLicensee = (userId: number) =>
    (tenantBrandings as any[]).find((b: any) => b.tenant_id === userId);

  const PORTAL_ROLES = ["client", "user"];
  const licensees = (allUsers as any[]).filter((u: any) => u.role === "admin");
  const internalStaff = (allUsers as any[]).filter((u: any) => u.role !== "admin" && !PORTAL_ROLES.includes(u.role));

  // ── Licensee mutations ──────────────────────────────────────────────────
  const createLicenseeMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Licenciado cadastrado", description: "Novo licenciado criado com sucesso." });
      setLicenseDialogOpen(false);
      setLicenseForm({ ...defaultLicenseForm });
    },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  const updateLicMgmtMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/users/${selectedLicensee?.id}`, { ...selectedLicensee, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Licença atualizada", description: "Configurações salvas com sucesso." });
      setLicMgmtOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  const toggleBlockLicensee = useMutation({
    mutationFn: (user: any) => apiRequest("PUT", `/api/users/${user.id}`, { ...user, isBlocked: !user.isBlocked }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users"] }); toast({ title: "Status atualizado" }); },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  // ── Internal user mutations ─────────────────────────────────────────────
  const createUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário criado", description: "Conta criada com sucesso." });
      setUserDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  const updateUserMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", `/api/users/${editingUser?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário atualizado" });
      setUserDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuário excluído" });
      setDeleteConfirm(null);
    },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  const toggleBlockUser = useMutation({
    mutationFn: (user: any) => apiRequest("PUT", `/api/users/${user.id}`, { ...user, isBlocked: !user.isBlocked }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/users"] }); toast({ title: "Status atualizado" }); },
    onError: (e: any) => toast({ title: "Erro", description: `${e}`, variant: "destructive" }),
  });

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleCreateLicensee = () => {
    if (!licenseForm.name || !licenseForm.username || !licenseForm.email || !licenseForm.password || !licenseForm.companyName) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    createLicenseeMutation.mutate({
      name: licenseForm.name,
      username: licenseForm.username,
      email: licenseForm.email,
      phone: licenseForm.phone,
      password: licenseForm.password,
      role: "admin",
      companyName: licenseForm.companyName,
      subscriptionPlan: licenseForm.subscriptionPlan,
      licenseStatus: licenseForm.licenseStatus,
      licenseExpiresAt: licenseForm.licenseExpiresAt || null,
      licenseNotes: licenseForm.licenseNotes,
      isActive: true,
      isBlocked: false,
    });
  };

  const handleUpdateLicMgmt = () => {
    updateLicMgmtMutation.mutate({
      licenseStatus: licMgmtForm.licenseStatus,
      licenseExpiresAt: licMgmtForm.licenseExpiresAt || null,
      licenseNotes: licMgmtForm.licenseNotes,
      subscriptionPlan: licMgmtForm.subscriptionPlan,
      isBlocked: licMgmtForm.isBlocked,
    });
  };

  const openLicMgmt = (user: any) => {
    setSelectedLicensee(user);
    setLicMgmtForm({
      licenseStatus: user.licenseStatus || "active",
      licenseExpiresAt: user.licenseExpiresAt ? format(new Date(user.licenseExpiresAt), "yyyy-MM-dd") : "",
      licenseNotes: user.licenseNotes || "",
      subscriptionPlan: user.subscriptionPlan || "Básico",
      isBlocked: user.isBlocked ?? false,
    });
    setLicMgmtOpen(true);
  };

  const openNewUser = () => {
    setEditingUser(null);
    setUserForm({ ...defaultUserForm });
    setUserDialogOpen(true);
  };

  const openEditUser = (user: any) => {
    setEditingUser(user);
    setUserForm({
      name: user.name, username: user.username, email: user.email,
      password: "", role: user.role, isActive: user.isActive ?? true, isBlocked: user.isBlocked ?? false,
    });
    setUserDialogOpen(true);
  };

  const handleUserSubmit = () => {
    if (!userForm.name || !userForm.username || !userForm.email || !userForm.role) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    if (!editingUser && !userForm.password) {
      toast({ title: "Erro", description: "Senha obrigatória para novos usuários.", variant: "destructive" });
      return;
    }
    const data: any = { name: userForm.name, username: userForm.username, email: userForm.email, role: userForm.role, isActive: userForm.isActive, isBlocked: userForm.isBlocked };
    if (userForm.password) data.password = userForm.password;
    if (editingUser) updateUserMutation.mutate(data);
    else createUserMutation.mutate(data);
  };

  const currentUserId = parseInt(localStorage.getItem("user_id") || "0");

  return (
    <section className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-purple-100">
          <Shield className="h-6 w-6 text-purple-700" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-neutral-700">Painel Super Admin</h2>
          <p className="text-sm text-muted-foreground">Gestão central de licenciados, equipe e controle de acesso</p>
        </div>
      </div>

      {/* Access overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4 flex gap-4 items-start">
            <div className="p-2 rounded-lg bg-blue-100 flex-shrink-0">
              <Globe className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Portal do Cliente</h3>
              <p className="text-xs text-blue-700">Acesso externo e limitado. Os clientes visualizam chamados, documentos e serviços disponibilizados. Gerenciados pela aba <strong>Clientes</strong> no menu principal.</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">Visualizar chamados</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">Abrir chamados</span>
                <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">Documentos</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-4 flex gap-4 items-start">
            <div className="p-2 rounded-lg bg-purple-100 flex-shrink-0">
              <Laptop className="h-5 w-5 text-purple-700" />
            </div>
            <div>
              <h3 className="font-semibold text-purple-900 mb-1">Sistema Administrativo</h3>
              <p className="text-xs text-purple-700">Acesso interno com permissões configuráveis. Cada perfil tem um nível de acesso diferente às funcionalidades operacionais.</p>
              <div className="flex gap-1 mt-2 flex-wrap">
                {INTERNAL_ROLES.map(r => (
                  <span key={r.value} className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.color}`}>{r.label}</span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="licensees">
        <TabsList className="mb-6">
          <TabsTrigger value="licensees" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Licenciados
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 font-medium">{licensees.length}</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Equipe Interna
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700 font-medium">{internalStaff.length}</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Key className="h-4 w-4" /> Perfis de Acesso
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: LICENCIADOS ─────────────────────────────────────────────────── */}
        <TabsContent value="licensees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Licenciados do Sistema</CardTitle>
                <CardDescription>
                  Empresas e pessoas que adquiriram licença de uso da plataforma. Cada licenciado tem acesso de Administrador ao seu próprio ambiente.
                </CardDescription>
              </div>
              <Button onClick={() => { setLicenseForm({ ...defaultLicenseForm }); setLicenseDialogOpen(true); }} className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Cadastrar Licenciado
              </Button>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : licensees.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground font-medium">Nenhum licenciado cadastrado</p>
                  <p className="text-sm text-muted-foreground mt-1">Clique em "Cadastrar Licenciado" para adicionar o primeiro.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Empresa / Responsável</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>URL de Login</TableHead>
                        <TableHead className="text-center">Plano</TableHead>
                        <TableHead className="text-center">Licença</TableHead>
                        <TableHead className="text-center">Expiração</TableHead>
                        <TableHead className="text-center">Acesso</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {licensees.map((user: any) => {
                        const branding = getBrandingForLicensee(user.id);
                        const loginSlug = branding?.slug;
                        const loginUrl = loginSlug ? `${window.location.origin}/login/${loginSlug}` : null;
                        return (
                        <TableRow key={user.id} className={user.isBlocked ? "bg-red-50/50" : ""}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.companyName || user.name}</p>
                              {user.companyName && <p className="text-xs text-muted-foreground">{user.name}</p>}
                              <p className="text-xs text-muted-foreground font-mono">@{user.username}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <div>
                              <p>{user.email}</p>
                              {user.phone && <p>{user.phone}</p>}
                            </div>
                          </TableCell>
                          <TableCell>
                            {loginUrl ? (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-mono text-primary truncate max-w-[160px]" title={loginUrl}>
                                  /login/{loginSlug}
                                </span>
                                <button
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Copiar URL"
                                  onClick={() => navigator.clipboard.writeText(loginUrl)}
                                >
                                  <Globe className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Não configurado</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs text-muted-foreground">{user.subscriptionPlan || "—"}</span>
                          </TableCell>
                          <TableCell className="text-center">{licenseBadge(user.licenseStatus)}</TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {user.licenseExpiresAt ? format(new Date(user.licenseExpiresAt), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            {user.isBlocked
                              ? <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
                              : <Badge variant="outline" className="text-xs text-green-700 border-green-300">Ativo</Badge>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => openLicMgmt(user)} className="h-8 text-xs flex items-center gap-1">
                                <CreditCard className="h-3 w-3" /> Licença
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => toggleBlockLicensee.mutate(user)}
                                className={`h-8 w-8 p-0 ${user.isBlocked ? "text-green-600" : "text-orange-500"}`}
                                title={user.isBlocked ? "Desbloquear" : "Bloquear"}
                              >
                                {user.isBlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB: EQUIPE INTERNA ──────────────────────────────────────────────── */}
        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Equipe Interna</CardTitle>
                <CardDescription>
                  Usuários com acesso ao sistema administrativo. Defina o perfil de acesso de cada membro da equipe.
                </CardDescription>
              </div>
              <Button onClick={openNewUser} className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> Novo Usuário
              </Button>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Login</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead className="text-center">Perfil</TableHead>
                        <TableHead className="text-center">Ativo</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {internalStaff.map((user: any) => (
                        <TableRow key={user.id} className={user.isBlocked ? "bg-red-50/50" : ""}>
                          <TableCell className="font-medium">
                            {user.name}
                            {user.id === currentUserId && <span className="ml-2 text-xs text-muted-foreground">(você)</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground font-mono text-sm">@{user.username}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{user.email}</TableCell>
                          <TableCell className="text-center">{roleBadge(user.role)}</TableCell>
                          <TableCell className="text-center">
                            {user.isActive
                              ? <CheckCircle className="h-4 w-4 text-green-500 inline" />
                              : <XCircle className="h-4 w-4 text-red-400 inline" />}
                          </TableCell>
                          <TableCell className="text-center">
                            {user.isBlocked
                              ? <Badge variant="destructive" className="text-xs">Bloqueado</Badge>
                              : <span className="text-xs text-muted-foreground">Normal</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => openEditUser(user)} className="h-8 w-8 p-0">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => toggleBlockUser.mutate(user)}
                                className={`h-8 w-8 p-0 ${user.isBlocked ? "text-green-600" : "text-orange-500"}`}
                                title={user.isBlocked ? "Desbloquear" : "Bloquear"}
                              >
                                {user.isBlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                              </Button>
                              {user.id !== currentUserId && (
                                <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(user.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
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

        {/* ── TAB: PERFIS DE ACESSO ────────────────────────────────────────────── */}
        <TabsContent value="roles">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Internal system */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Laptop className="h-5 w-5 text-purple-600" />
                  <CardTitle className="text-lg">Sistema Administrativo</CardTitle>
                </div>
                <CardDescription>Usuários internos que operam o sistema. Login em <strong>/login</strong></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {INTERNAL_ROLES.map(role => (
                  <div key={role.value} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                    <span className={`mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${role.color}`}>{role.label}</span>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">{role.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Client portal */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <CardTitle className="text-lg">Portal do Cliente</CardTitle>
                </div>
                <CardDescription>Clientes com acesso externo e limitado. Login em <strong>/client/login</strong></CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <span className="mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-blue-100 text-blue-800">Contato Cliente</span>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground">Acessa o portal para visualizar e abrir chamados, documentos e acompanhar serviços.</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <p>Os usuários do Portal do Cliente são gerenciados na aba <strong>Clientes</strong> do menu principal, em "Contatos / Acessos ao Portal". Cada empresa pode ter múltiplos contatos com acesso.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {["Visualizar chamados da empresa", "Abrir novos chamados", "Acompanhar status em tempo real", "Avaliar atendimentos", "Acessar documentos compartilhados"].map(item => (
                    <div key={item} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG: CADASTRAR LICENCIADO ──────────────────────────────────────── */}
      <Dialog open={licenseDialogOpen} onOpenChange={setLicenseDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-600" /> Cadastrar Novo Licenciado
            </DialogTitle>
            <DialogDescription>
              O licenciado terá acesso ao sistema com perfil de Administrador, podendo gerenciar usuários e configurações do seu próprio ambiente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <p className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> Dados da Empresa</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome da Empresa <span className="text-red-500">*</span></Label>
                  <Input className="mt-1" value={licenseForm.companyName} onChange={e => setLicenseForm({ ...licenseForm, companyName: e.target.value })} placeholder="Ex.: Tech Solutions Ltda" />
                </div>
                <div>
                  <Label>Plano de Assinatura</Label>
                  <Select value={licenseForm.subscriptionPlan} onValueChange={v => setLicenseForm({ ...licenseForm, subscriptionPlan: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status da Licença</Label>
                  <Select value={licenseForm.licenseStatus} onValueChange={v => setLicenseForm({ ...licenseForm, licenseStatus: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{LICENSE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Vencimento</Label>
                  <Input type="date" className="mt-1" value={licenseForm.licenseExpiresAt} onChange={e => setLicenseForm({ ...licenseForm, licenseExpiresAt: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input className="mt-1" value={licenseForm.phone} onChange={e => setLicenseForm({ ...licenseForm, phone: e.target.value })} placeholder="(11) 9..." />
                </div>
                <div className="col-span-2">
                  <Label>Observações da Licença</Label>
                  <Input className="mt-1" value={licenseForm.licenseNotes} onChange={e => setLicenseForm({ ...licenseForm, licenseNotes: e.target.value })} placeholder="Notas sobre contrato, pagamento..." />
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
              <p className="text-xs font-semibold text-purple-800 mb-2 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> Conta do Administrador</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do Responsável <span className="text-red-500">*</span></Label>
                  <Input className="mt-1" value={licenseForm.name} onChange={e => setLicenseForm({ ...licenseForm, name: e.target.value })} placeholder="Ex.: João da Silva" />
                </div>
                <div>
                  <Label>Usuário (login) <span className="text-red-500">*</span></Label>
                  <Input className="mt-1" value={licenseForm.username} onChange={e => setLicenseForm({ ...licenseForm, username: e.target.value })} placeholder="joaosilva" />
                </div>
                <div>
                  <Label>Senha <span className="text-red-500">*</span></Label>
                  <Input type="password" className="mt-1" value={licenseForm.password} onChange={e => setLicenseForm({ ...licenseForm, password: e.target.value })} placeholder="Senha de acesso" />
                </div>
                <div className="col-span-2">
                  <Label>E-mail <span className="text-red-500">*</span></Label>
                  <Input type="email" className="mt-1" value={licenseForm.email} onChange={e => setLicenseForm({ ...licenseForm, email: e.target.value })} placeholder="admin@empresa.com" />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setLicenseDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateLicensee} disabled={createLicenseeMutation.isPending}>
              {createLicenseeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cadastrar Licenciado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: GERENCIAR LICENÇA ─────────────────────────────────────────── */}
      <Dialog open={licMgmtOpen} onOpenChange={setLicMgmtOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" /> Gerenciar Licença
            </DialogTitle>
            <DialogDescription>
              {selectedLicensee?.companyName || selectedLicensee?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status da Licença</Label>
                <Select value={licMgmtForm.licenseStatus} onValueChange={v => setLicMgmtForm({ ...licMgmtForm, licenseStatus: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{LICENSE_STATUS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={licMgmtForm.subscriptionPlan} onValueChange={v => setLicMgmtForm({ ...licMgmtForm, subscriptionPlan: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Data de Vencimento</Label>
              <Input type="date" className="mt-1" value={licMgmtForm.licenseExpiresAt} onChange={e => setLicMgmtForm({ ...licMgmtForm, licenseExpiresAt: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Deixe em branco para licença sem prazo.</p>
            </div>
            <div>
              <Label>Observações (pagamento, contrato...)</Label>
              <Textarea className="mt-1 h-20 text-sm" value={licMgmtForm.licenseNotes} onChange={e => setLicMgmtForm({ ...licMgmtForm, licenseNotes: e.target.value })} placeholder="Notas sobre a licença..." />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Switch id="licBlocked" checked={licMgmtForm.isBlocked} onCheckedChange={v => setLicMgmtForm({ ...licMgmtForm, isBlocked: v })} />
              <Label htmlFor="licBlocked" className="cursor-pointer text-red-600">Bloquear acesso deste licenciado</Label>
            </div>
            {licMgmtForm.isBlocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Este licenciado não conseguirá acessar o sistema enquanto estiver bloqueado.
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setLicMgmtOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateLicMgmt} disabled={updateLicMgmtMutation.isPending}>
              {updateLicMgmtMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: USUÁRIO INTERNO ───────────────────────────────────────────── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingUser ? "Editar Usuário" : "Novo Usuário da Equipe"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "Edite as informações e perfil de acesso." : "Crie um novo usuário para acessar o sistema administrativo."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome completo <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={userForm.name} onChange={e => setUserForm({ ...userForm, name: e.target.value })} placeholder="Ex.: Ana Souza" />
              </div>
              <div>
                <Label>Usuário (login) <span className="text-red-500">*</span></Label>
                <Input className="mt-1" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} placeholder="anasouza" />
              </div>
            </div>
            <div>
              <Label>E-mail <span className="text-red-500">*</span></Label>
              <Input type="email" className="mt-1" value={userForm.email} onChange={e => setUserForm({ ...userForm, email: e.target.value })} placeholder="ana@empresa.com" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Perfil de Acesso <span className="text-red-500">*</span></Label>
                <Select value={userForm.role} onValueChange={v => setUserForm({ ...userForm, role: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="operacional">Usuário Operacional</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{editingUser ? "Nova Senha (opcional)" : "Senha *"}</Label>
                <Input type="password" className="mt-1" value={userForm.password} onChange={e => setUserForm({ ...userForm, password: e.target.value })} placeholder={editingUser ? "Deixe em branco" : "Senha"} />
              </div>
            </div>
            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch id="uActive" checked={userForm.isActive} onCheckedChange={v => setUserForm({ ...userForm, isActive: v })} />
                <Label htmlFor="uActive" className="cursor-pointer">Conta ativa</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="uBlocked" checked={userForm.isBlocked} onCheckedChange={v => setUserForm({ ...userForm, isBlocked: v })} />
                <Label htmlFor="uBlocked" className="cursor-pointer text-red-600">Bloqueado</Label>
              </div>
            </div>
            {userForm.isBlocked && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Este usuário não poderá fazer login enquanto estiver bloqueado.
              </div>
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUserSubmit} disabled={createUserMutation.isPending || updateUserMutation.isPending}>
              {(createUserMutation.isPending || updateUserMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingUser ? "Salvar" : "Criar Usuário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DIALOG: CONFIRMAR EXCLUSÃO ────────────────────────────────────────── */}
      <Dialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Usuário</DialogTitle>
            <DialogDescription>Tem certeza? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && deleteUserMutation.mutate(deleteConfirm)} disabled={deleteUserMutation.isPending}>
              {deleteUserMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
