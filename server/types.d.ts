import { User, Client, ClientContact } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      user?: User;
      client?: Client;
      clientContact?: ClientContact;
    }
  }
}

declare module 'qrcode' {
  export function toDataURL(
    text: string, 
    options?: {
      errorCorrectionLevel?: string;
      margin?: number;
      scale?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    }
  ): Promise<string>;
}