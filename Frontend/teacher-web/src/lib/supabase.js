import { createClient } from "@supabase/supabase-js";

// Only the public anon key lives in the browser. Never put a service key here.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
