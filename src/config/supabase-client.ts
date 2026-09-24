import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Variáveis de ambiente ou fallback para o projeto ativo
export const SUPABASE_URL = 
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) || 
  'https://griohqwryktqupvcfskh.supabase.co';

export const SUPABASE_ANON_KEY = 
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) || 
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyaW9ocXdyeWt0cXVwdmNmc2toIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAwMTcxMzUsImV4cCI6MjEwNTU5MzEzNX0.IfJ-NX3OMmx-RZt72H2ZkrHPXyTAUbe3GYk7Dbom0T8';

let supabaseInstance: SupabaseClient | null = null;

/**
 * Retorna a instância do cliente Supabase configurada com persistência de sessão
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseInstance) {
    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return supabaseInstance;
}

export const supabase = getSupabaseClient();
