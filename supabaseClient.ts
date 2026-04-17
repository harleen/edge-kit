// supabase/functions/_shared/supabaseClient.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js";

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
