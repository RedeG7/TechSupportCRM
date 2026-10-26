import { apiRequest } from "./queryClient";

/**
 * API functions for tickets
 */
export const ticketsAPI = {
  getAll: async () => {
    const response = await fetch("/api/tickets");
    if (!response.ok) throw new Error("Failed to fetch tickets");
    return response.json();
  },
  
  getById: async (id: number) => {
    const response = await fetch(`/api/tickets/${id}`);
    if (!response.ok) throw new Error("Failed to fetch ticket");
    return response.json();
  },
  
  create: async (data: any) => {
    return apiRequest("POST", "/api/tickets", data);
  },
  
  update: async (id: number, data: any) => {
    return apiRequest("PUT", `/api/tickets/${id}`, data);
  },
  
  close: async (id: number, resolutionNote: string) => {
    return apiRequest("POST", `/api/tickets/${id}/close`, { resolutionNote });
  },
  
  addActivity: async (ticketId: number, data: any) => {
    return apiRequest("POST", `/api/tickets/${ticketId}/activities`, data);
  },
  
  getActivities: async (ticketId: number) => {
    const response = await fetch(`/api/tickets/${ticketId}/activities`);
    if (!response.ok) throw new Error("Failed to fetch ticket activities");
    return response.json();
  }
};

/**
 * API functions for clients
 */
export const clientsAPI = {
  getAll: async () => {
    const response = await fetch("/api/clients");
    if (!response.ok) throw new Error("Failed to fetch clients");
    return response.json();
  },
  
  getById: async (id: number) => {
    const response = await fetch(`/api/clients/${id}`);
    if (!response.ok) throw new Error("Failed to fetch client");
    return response.json();
  },
  
  create: async (data: any) => {
    return apiRequest("POST", "/api/clients", data);
  },
  
  update: async (id: number, data: any) => {
    return apiRequest("PUT", `/api/clients/${id}`, data);
  },
  
  getContacts: async (clientId: number) => {
    const response = await fetch(`/api/clients/${clientId}/contacts`);
    if (!response.ok) throw new Error("Failed to fetch client contacts");
    return response.json();
  },
  
  addContact: async (clientId: number, data: any) => {
    return apiRequest("POST", `/api/clients/${clientId}/contacts`, data);
  }
};

/**
 * API functions for investments
 */
export const investmentsAPI = {
  getAll: async (clientId?: number) => {
    const url = clientId 
      ? `/api/investments?clientId=${clientId}` 
      : "/api/investments";
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch investments");
    return response.json();
  },
  
  getById: async (id: number) => {
    const response = await fetch(`/api/investments/${id}`);
    if (!response.ok) throw new Error("Failed to fetch investment");
    return response.json();
  },
  
  create: async (data: any) => {
    return apiRequest("POST", "/api/investments", data);
  },
  
  update: async (id: number, data: any) => {
    return apiRequest("PUT", `/api/investments/${id}`, data);
  }
};

/**
 * API functions for dashboard metrics
 */
export const dashboardAPI = {
  getMetrics: async () => {
    const response = await fetch("/api/dashboard/metrics");
    if (!response.ok) throw new Error("Failed to fetch dashboard metrics");
    return response.json();
  },
  
  getTicketsByCategory: async () => {
    const response = await fetch("/api/dashboard/tickets-by-category");
    if (!response.ok) throw new Error("Failed to fetch tickets by category");
    return response.json();
  },
  
  getResolutionTimeHistory: async () => {
    const response = await fetch("/api/dashboard/resolution-time-history");
    if (!response.ok) throw new Error("Failed to fetch resolution time history");
    return response.json();
  }
};
