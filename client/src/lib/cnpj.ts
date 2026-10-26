/**
 * Interface for CNPJ data returned from the API
 */
export interface CNPJData {
  cnpj: string;
  businessName: string;
  tradeName: string;
  address: {
    zip: string;
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    state: string;
  };
  phone: string;
  email: string;
}

/**
 * Validates a CNPJ string
 * @param cnpj The CNPJ string to validate
 * @returns true if the CNPJ is valid, false otherwise
 */
export function validateCNPJ(cnpj: string): boolean {
  // Remove non-numeric characters
  cnpj = cnpj.replace(/[^\d]/g, '');
  
  // CNPJ must have 14 digits
  if (cnpj.length !== 14) return false;
  
  // Check for known invalid patterns
  if (/^(\d)\1+$/.test(cnpj)) return false;
  
  // Validate first check digit
  let sum = 0;
  let weight = 2;
  for (let i = 11; i >= 0; i--) {
    sum += parseInt(cnpj.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  let mod = sum % 11;
  let digit1 = mod < 2 ? 0 : 11 - mod;
  if (parseInt(cnpj.charAt(12)) !== digit1) return false;
  
  // Validate second check digit
  sum = 0;
  weight = 2;
  for (let i = 12; i >= 0; i--) {
    sum += parseInt(cnpj.charAt(i)) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  mod = sum % 11;
  let digit2 = mod < 2 ? 0 : 11 - mod;
  if (parseInt(cnpj.charAt(13)) !== digit2) return false;
  
  return true;
}

/**
 * Formats a CNPJ string into the standard format XX.XXX.XXX/XXXX-XX
 * @param cnpj The CNPJ string to format
 * @returns The formatted CNPJ string
 */
export function formatCNPJ(cnpj: string): string {
  // Remove non-numeric characters
  cnpj = cnpj.replace(/[^\d]/g, '');
  
  // Ensure it has 14 digits
  if (cnpj.length !== 14) return cnpj;
  
  // Format as XX.XXX.XXX/XXXX-XX
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/**
 * Looks up CNPJ data from the API
 * @param cnpj The CNPJ to look up
 * @returns Promise with the CNPJ data
 */
export async function lookupCNPJ(cnpj: string): Promise<CNPJData> {
  // Remove formatting
  const cleanCnpj = cnpj.replace(/[^\d]/g, '');
  
  // Validate CNPJ
  if (!validateCNPJ(cleanCnpj)) {
    throw new Error("CNPJ inválido");
  }
  
  try {
    const response = await fetch(`/api/lookup/cnpj/${cleanCnpj}`);
    
    if (!response.ok) {
      // Tenta obter a mensagem de erro do corpo da resposta
      try {
        const errorData = await response.json();
        if (errorData && errorData.message) {
          throw new Error(errorData.message);
        }
      } catch (jsonError) {
        // Se não conseguir obter o JSON, usa o status HTTP
        throw new Error(`Erro na consulta: ${response.status} ${response.statusText}`);
      }
      
      // Fallback se o try/catch interno não lançar um erro
      throw new Error(`Erro na consulta: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error("Erro ao consultar CNPJ:", error);
    // Passa o erro original para frente para exibir ao usuário
    if (error instanceof Error) {
      throw error;
    }
    // Fallback para erro genérico
    throw new Error("Falha ao consultar dados do CNPJ. Por favor, tente novamente.");
  }
}

/**
 * Utility functions for working with CNPJ
 */
export const cnpjUtils = {
  validate: validateCNPJ,
  format: formatCNPJ,
  lookup: lookupCNPJ
};

export default cnpjUtils;
