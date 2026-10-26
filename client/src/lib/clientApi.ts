/**
 * Funções de API para o portal do cliente com autenticação
 */

// Função de chamada de API para o cliente com autorização automaticamente incluída
export async function clientApiRequest(
  url: string, 
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
) {
  const authToken = localStorage.getItem('client-auth-token');
  
  if (!authToken) {
    throw new Error('Usuário não autenticado. Por favor, faça login novamente.');
  }
  
  const headers: HeadersInit = {
    'Authorization': `Bearer ${authToken}`
  };
  
  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  
  const options: RequestInit = {
    method,
    headers
  };
  
  if (body) {
    if (body instanceof FormData) {
      options.body = body;
    } else {
      options.body = JSON.stringify(body);
    }
  }
  
  const response = await fetch(url, options);
  
  if (response.status === 401) {
    localStorage.removeItem('client-auth-token');
    localStorage.removeItem('client_id');
    localStorage.removeItem('client_contact_id');
    localStorage.removeItem('user_type');
    
    throw new Error('Sua sessão expirou. Por favor, faça login novamente.');
  }
  
  return response;
}