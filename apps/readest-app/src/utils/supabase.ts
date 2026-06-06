import { createClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '@/services/runtimeConfig';

const CUSTOM_SERVER_LS_KEY = 'readest.customServer';

interface CustomServerSupabaseConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

const getCustomServerConfig = (): CustomServerSupabaseConfig => {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CUSTOM_SERVER_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      const { supabaseUrl, supabaseAnonKey } = parsed as CustomServerSupabaseConfig;
      return {
        supabaseUrl: typeof supabaseUrl === 'string' ? supabaseUrl : undefined,
        supabaseAnonKey: typeof supabaseAnonKey === 'string' ? supabaseAnonKey : undefined,
      };
    }
    return {};
  } catch {
    return {};
  }
};

const customServer = getCustomServerConfig();

const supabaseUrl =
  customServer.supabaseUrl ||
  getRuntimeConfig()?.supabaseUrl ||
  process.env['SUPABASE_URL'] ||
  process.env['NEXT_PUBLIC_SUPABASE_URL'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']!);
const supabaseAnonKey =
  customServer.supabaseAnonKey ||
  getRuntimeConfig()?.supabaseAnonKey ||
  process.env['SUPABASE_ANON_KEY'] ||
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ||
  atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_KEY_BASE64']!);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const createSupabaseClient = (accessToken?: string) => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: accessToken
        ? {
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    },
  });
};

export const createSupabaseAdminClient = () => {
  const supabaseAdminKey = process.env['SUPABASE_ADMIN_KEY'] || '';
  return createClient(supabaseUrl, supabaseAdminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
};
