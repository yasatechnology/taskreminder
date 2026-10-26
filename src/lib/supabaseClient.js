import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Salin .env.example menjadi .env dan isi nilai VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.'
  )
}

/**
 * Klien Supabase untuk digunakan di seluruh aplikasi frontend.
 * Menggunakan anon key yang dilindungi Row Level Security (RLS).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
