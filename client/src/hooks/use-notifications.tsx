import { useState } from "react";
import { notificationsAPI } from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

/**
 * Interface para dados de notificação por email
 */
export interface EmailNotificationData {
  recipient: string;
  subject: string;
  body: string;
}

/**
 * Interface para dados de notificação por WhatsApp
 */
export interface WhatsAppNotificationData {
  recipient: string;
  message: string;
}

/**
 * Hook para utilizar o serviço de notificações
 */
export function useNotifications() {
  const { toast } = useToast();
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isWhatsAppLoading, setIsWhatsAppLoading] = useState(false);
  const [emailError, setEmailError] = useState<Error | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<Error | null>(null);

  /**
   * Função para enviar notificação por email
   */
  const sendEmail = async (data: EmailNotificationData) => {
    setIsEmailLoading(true);
    setEmailError(null);
    
    try {
      const result = await notificationsAPI.sendEmail(
        data.recipient,
        data.subject,
        data.body
      );
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Falha ao enviar email");
      setEmailError(err);
      toast({
        title: "Erro ao enviar email",
        description: err.message || "Não foi possível enviar a notificação por email.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsEmailLoading(false);
    }
  };

  /**
   * Função para enviar notificação por WhatsApp
   */
  const sendWhatsApp = async (data: WhatsAppNotificationData) => {
    setIsWhatsAppLoading(true);
    setWhatsAppError(null);
    
    try {
      const result = await notificationsAPI.sendWhatsApp(
        data.recipient,
        data.message
      );
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Falha ao enviar WhatsApp");
      setWhatsAppError(err);
      toast({
        title: "Erro ao enviar WhatsApp",
        description: err.message || "Não foi possível enviar a notificação por WhatsApp.",
        variant: "destructive",
      });
      throw err;
    } finally {
      setIsWhatsAppLoading(false);
    }
  };

  return {
    sendEmail,
    sendWhatsApp,
    isEmailLoading,
    isWhatsAppLoading,
    emailError,
    whatsAppError
  };
}