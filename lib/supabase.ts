import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// If env vars absent, supabase is null — App.tsx already wraps all db calls
// in .catch(() => {}) so the app silently falls back to localStorage.
export const supabase = (url && key ? createClient(url, key) : null) as SupabaseClient;
