// Declare adicional para tipos do WhatsApp
declare module 'whatsapp-web.js' {
  interface Client {
    getContacts(): Promise<Contact[]>;
    getChatById(chatId: string): Promise<Chat>;
  }

  interface Chat {
    fetchMessages(options: { limit: number }): Promise<Message[]>;
    name: string;
    pushname: string;
  }

  interface Contact {
    id: {
      _serialized: string;
    };
    name: string;
    pushname: string;
    number: string;
    isGroup: boolean;
    isBusiness: boolean;
    isMyContact: boolean;
    profilePicUrl: string | null;
  }

  interface Message {
    id: {
      _serialized: string;
    };
    body: string;
    fromMe: boolean;
    timestamp: number;
    from: string;
  }
}