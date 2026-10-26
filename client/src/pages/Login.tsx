import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Eye, EyeOff, LockKeyhole, User } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import logoImage from "@/assets/RedeG7.png";
import { useBranding } from "@/hooks/useBranding";

// Esquema de validação do formulário de login
const loginSchema = z.object({
  username: z.string().min(1, "O nome de usuário é obrigatório"),
  password: z.string().min(1, "A senha é obrigatória"),
  rememberMe: z.boolean().optional()
});

// Tipos
type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const params = useParams<{ slug?: string }>();
  const slug = params?.slug || null;
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { data: branding } = useBranding(slug);

  // Form para login de administrador/suporte
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false
    }
  });

  const handleLogin = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      // Limpar localStorage
      localStorage.clear();
      
      // Fazer requisição ao backend para autenticar
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: data.username,
          password: data.password
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        setLoginError(responseData.message || "Erro ao fazer login. Verifique suas credenciais.");
        return;
      }

      // Login bem-sucedido
      // Agora o responseData é o próprio objeto do usuário
      localStorage.setItem("user_role", responseData.role || "admin");
      localStorage.setItem("user_id", responseData.id.toString());
      localStorage.setItem("user_name", responseData.name);
      
      console.log("Login bem-sucedido:", responseData);
      
      // Redirecionar para o dashboard
      navigate("/dashboard");
      
    } catch (error) {
      setLoginError("Erro ao conectar ao servidor. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 relative">
      {/* Theme Toggle no canto superior direito */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-48 mb-4">
            <img
              src={branding?.companyLogoUrl || logoImage}
              alt={branding?.companyName || "Logo"}
              className="w-full object-contain max-h-32"
            />
          </div>
          <h1 className="text-2xl font-bold text-center text-foreground">
            {branding?.companyName || "Suporte RedeG7"}
          </h1>
          <p className="text-muted-foreground mt-2 text-center">
            Entre para acessar o sistema de suporte
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Login Administrativo</CardTitle>
            <CardDescription>
              Acesse o painel administrativo do sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loginError && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{loginError}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome de Usuário</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            className="pl-10" 
                            placeholder="Digite seu nome de usuário" 
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <LockKeyhole className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input 
                            className="pl-10" 
                            type={showPassword ? "text" : "password"} 
                            placeholder="Digite sua senha" 
                            {...field} 
                          />
                          <button 
                            type="button"
                            onClick={toggleShowPassword}
                            className="absolute right-3 top-2.5 text-muted-foreground"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full mt-2" 
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </Form>
            
            {/* Link para acesso ao portal do cliente */}
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                Você é um cliente? 
                <Link href="/client/login" className="ml-1 text-primary font-medium hover:underline">
                  Acesse o portal do cliente
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}