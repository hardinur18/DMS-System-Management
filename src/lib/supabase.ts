import { createClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !String(supabaseUrl).includes("your-project-ref") &&
    !String(supabaseAnonKey).includes("your-anon-public-key"),
)

export const supabaseConfigError = isSupabaseConfigured
  ? ""
  : "Supabase env belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env."

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-anon-key",
  {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  },
)

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession()

  if (error) {
    throw error
  }

  return data.session
}
