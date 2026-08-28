import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Previously this only console.warn'd and then called createClient(undefined,
// undefined), which fails later with an opaque network error. Fail loudly here
// instead — a missing env var is always a setup mistake, never a runtime state.
export const configError =
  !supabaseUrl || !supabaseAnonKey
    ? "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values, then restart the dev server."
    : null;

export const supabase = configError
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Needed so the password-recovery link's hash tokens are picked up.
        detectSessionInUrl: true,
      },
    });
