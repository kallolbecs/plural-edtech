import { createBrowserClient } from '@supabase/ssr';

// Define a function to create the client
// This function can be used in Client Components
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Note: For Server Components, Route Handlers, and Server Actions,
// you might need a different setup using `createServerClient`.
// We'll address that if needed later.