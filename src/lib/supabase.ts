import { createClient } from "@supabase/supabase-js";

// Your Supabase info
const supabaseUrl = "https://jpphthbbawkxbhzonvyz.supabase.co";

const supabaseKey =
  "sb_publishable_b6cy5vUSAFkVxWkRyYJSUw_FagY1_5D";

// Make the connection
export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
