import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import logoImage from "@/assets/RedeG7.png";
// Não importamos clientApiRequest aqui pois o login não precisa de autenticação prévia

const loginSchema = z.object({
  username: z.string().min(3, {
    message: "O nome de usuário deve ter pelo menos 3 caracteres",
  }),
  password: z.string().min(4, {
    message: "A senha deve ter pelo menos 4 caracteres",
  }),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function ClientLogin() {
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Verificar se já está logado
  useEffect(() => {
    const clientId = localStorage.getItem("client_id");
    const userType = localStorage.getItem("user_type");
    
    if (clientId && userType === "client") {
      navigate("/client/dashboard");
    }
  }, [navigate]);

  // Configuração do formulário
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleLogin = async (data: LoginFormData) => {
    try {
      setLoading(true);
      
      const response = await fetch("/api/client/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Falha ao fazer login");
      }
      
      const userData = await response.json();
      
      // Salvar dados no localStorage
      localStorage.setItem("client_id", userData.client.id.toString());
      localStorage.setItem("client_contact_id", userData.id.toString());
      localStorage.setItem("client_name", userData.client.businessName);
      localStorage.setItem("contact_name", userData.name);
      localStorage.setItem("user_type", "client");
      
      // Armazenar o token de autenticação para ser usado nas requisições
      if (userData.authToken) {
        localStorage.setItem("client-auth-token", userData.authToken);
      } else {
        console.error("Token de autenticação não retornado pelo servidor");
      }
      
      toast({
        title: "Login realizado com sucesso",
        description: `Bem-vindo, ${userData.name}!`,
      });
      
      // Redirecionar para o dashboard
      navigate("/client/dashboard");
    } catch (error: any) {
      console.error("Erro ao fazer login:", error);
      toast({
        variant: "destructive",
        title: "Erro de autenticação",
        description: error.message || "Usuário ou senha inválidos",
      });
    } finally {
      setLoading(false);
    }
  };

  const goToAdminLogin = () => {
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background relative">
      {/* Theme Toggle no canto superior direito */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>
      
      {/* Coluna esquerda - Formulário */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8 sm:py-12 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-36 sm:w-48 mx-auto mb-3 sm:mb-4">
              <img src={logoImage} alt="RedeG7 Logo" className="w-full" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-primary mb-1">
              Suporte RedeG7
            </h1>
            <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground">
              Portal do Cliente
            </h2>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Acesse sua conta</CardTitle>
              <CardDescription>
                Entre com suas credenciais para acessar o sistema
              </CardDescription>
            </CardHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleLogin)}>
                <CardContent>
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nome de usuário</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Seu nome de usuário" 
                              {...field} 
                              autoComplete="username"
                            />
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
                            <Input 
                              type="password" 
                              placeholder="Sua senha" 
                              {...field}
                              autoComplete="current-password"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
                
                <CardFooter className="flex flex-col">
                  <Button 
                    className="w-full" 
                    type="submit" 
                    disabled={loading}
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                  
                  <div className="mt-4 text-center text-sm text-muted-foreground">
                    <span>É funcionário? </span>
                    <button 
                      type="button"
                      onClick={goToAdminLogin}
                      className="underline text-primary hover:text-primary/80"
                    >
                      Acesse a área administrativa
                    </button>
                  </div>
                </CardFooter>
              </form>
            </Form>
          </Card>
        </div>
      </div>
      
      {/* Coluna direita - Banner */}
      <div className="hidden md:flex md:flex-1 bg-primary-950 text-primary-50">
        <div className="flex flex-col justify-center px-4 py-12 sm:px-6 lg:px-20 xl:px-24">
          <div className="mx-auto w-full max-w-md">
            <div className="space-y-6">
              <h2 className="text-2xl font-bold">Central de Suporte e Atendimento</h2>
              <p className="text-primary-200">
                Gerencie seus chamados, acompanhe o status das suas solicitações e tenha acesso às informações da sua empresa.
              </p>
              
              <div className="pt-4">
                <h3 className="text-lg font-semibold mb-3">No portal você pode:</h3>
                <ul className="space-y-2">
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Abrir novos chamados de suporte</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Acompanhar o progresso das suas solicitações</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Visualizar dados cadastrais da sua empresa</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Avaliar os serviços prestados</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}