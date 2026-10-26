import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TicketRating() {
  const [, params] = useRoute("/avaliacao/:token");
  const token = params?.token;
  
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketInfo, setTicketInfo] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    if (token) {
      fetchTicketInfo();
    }
  }, [token]);

  const fetchTicketInfo = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/public/ticket-rating/${token}`);
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao carregar informações");
      }
      
      const data = await response.json();
      setTicketInfo(data);
      
      if (data.rating) {
        setRating(data.rating);
        setFeedback(data.feedback || "");
        setSubmitted(true);
      }
    } catch (err: any) {
      setError(err.message || "Link de avaliação inválido ou expirado");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        variant: "destructive",
        title: "Avaliação obrigatória",
        description: "Por favor, selecione uma nota de 1 a 5 estrelas."
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/public/ticket-rating/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, feedback })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Erro ao enviar avaliação");
      }

      setSubmitted(true);
      toast({
        title: "Avaliação enviada!",
        description: "Obrigado pelo seu feedback."
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err.message || "Erro ao enviar avaliação"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-neutral-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-neutral-800 mb-2">Link Inválido</h2>
            <p className="text-neutral-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-neutral-800 mb-2">Obrigado!</h2>
            <p className="text-neutral-600 mb-4">Sua avaliação foi registrada com sucesso.</p>
            
            <div className="flex justify-center gap-1 mb-4">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-8 w-8 ${star <= rating ? "text-yellow-400 fill-yellow-400" : "text-neutral-300"}`}
                />
              ))}
            </div>
            
            {feedback && (
              <div className="bg-neutral-50 rounded-lg p-4 text-left">
                <p className="text-sm text-neutral-500 mb-1">Seu comentário:</p>
                <p className="text-neutral-700">{feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <img src="/logo.png" alt="RedeG7" className="h-12 mx-auto" onError={(e) => e.currentTarget.style.display = 'none'} />
          </div>
          <CardTitle className="text-2xl">Avalie nosso atendimento</CardTitle>
          <CardDescription>
            Chamado #{ticketInfo?.ticketId}: {ticketInfo?.title}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <div className="bg-neutral-50 rounded-lg p-4">
            <p className="text-sm text-neutral-500 mb-1">Cliente</p>
            <p className="font-medium">{ticketInfo?.clientName}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-neutral-700 mb-3 text-center">
              Como você avalia o atendimento recebido?
            </p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-10 w-10 transition-colors ${
                      star <= (hoveredRating || rating)
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-neutral-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-neutral-500 mt-2">
              {rating === 1 && "Muito insatisfeito"}
              {rating === 2 && "Insatisfeito"}
              {rating === 3 && "Neutro"}
              {rating === 4 && "Satisfeito"}
              {rating === 5 && "Muito satisfeito"}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-neutral-700 mb-2 block">
              Comentários (opcional)
            </label>
            <Textarea
              placeholder="Deixe um comentário sobre o atendimento..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
          </div>

          <Button 
            onClick={handleSubmit} 
            className="w-full" 
            size="lg"
            disabled={isSubmitting || rating === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Avaliação"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
