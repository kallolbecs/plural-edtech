import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import LogoutButton from '@/components/LogoutButton';
import Link from 'next/link';
import NewQuestForm from '@/components/NewQuestForm';
import QuestIcon from '@/components/QuestIcon'; // New component for the icon itself

// Define Quest type based on backend schema (including message_count)
interface Quest {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  last_updated_at: string;
  message_count: number | null; // Added message count
}

export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get(name: string) { return cookieStore.get(name)?.value } } }
  );

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  let quests: Quest[] = [];
  let fetchError: string | null = sessionError?.message || null;

  console.log("[Server Component - Home Page] Session Error:", sessionError);
  console.log("[Server Component - Home Page] Session Data:", session ? `User ID: ${session.user.id}, Token Exists: ${!!session.access_token}` : "No session");

  if (session && !fetchError) {
    if (!session.access_token) {
        fetchError = "Access token missing in session.";
        console.error("[Server Component - Home Page] Access token missing!");
    } else {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const apiUrl = `${baseUrl}/api/quests`;
          console.log(`Fetching quests from: ${apiUrl}`);
          const response = await fetch(apiUrl, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
            cache: 'no-store',
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
            fetchError = errorData.detail || `Failed to fetch quests: ${response.statusText}`;
            console.error("Error response from /api/quests:", fetchError);
            quests = [];
          } else {
             quests = await response.json();
             console.log("Fetched quests:", quests.length);
          }
        } catch (error: any) {
          console.error("Error fetching quests:", error);
          fetchError = error.message || "Could not load quests.";
        }
    }
  } else if (!fetchError && !session) {
     fetchError = "Not authenticated.";
     console.log("Home page: No session found.");
  }

  // --- Main Component Return ---
  return (
    // Changed layout: Full screen, relative positioning for icons, form at bottom
    <div className="relative flex flex-col h-screen w-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-white to-blue-50"> {/* Added gradient bg */}

      {/* Header Area */}
      <header className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20">
         {/* Link to Guide Page */}
         <Link href="/guide" className="text-sm text-indigo-600 hover:underline">
            Customize AI Guide
         </Link>
         {session && <LogoutButton />}
      </header>

      {/* Main Content Area - Quest Icons */}
      <main className="flex-grow relative w-full h-full p-4 md:p-8 lg:p-12"> {/* Relative for positioning icons */}
        {fetchError && (
          <div className="absolute inset-0 flex items-center justify-center">
             <p className="text-red-600 bg-white p-4 rounded shadow">Error loading quests: {fetchError}</p>
          </div>
        )}
        {!fetchError && quests.length === 0 && session && (
           <div className="absolute inset-0 flex items-center justify-center">
             <p className="text-gray-600">Start your first quest below!</p>
           </div>
        )}
        {!fetchError && quests.length > 0 && (
          // Container for quest icons with flex wrap
          <div className="flex flex-wrap gap-4 p-4 justify-start items-start">
            {quests.map((quest, index) => (
              <QuestIcon key={quest.id} quest={quest} index={index} />
            ))}
          </div>
        )}
         {/* Decorative Blurs (Example) */}
         <div className="absolute top-1/4 left-1/4 w-40 h-40 bg-blue-200 rounded-full filter blur-3xl opacity-30 animate-pulse"></div>
         <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-indigo-200 rounded-full filter blur-3xl opacity-30 animate-pulse animation-delay-2000"></div>
         <div className="absolute top-1/2 right-1/3 w-24 h-24 bg-green-200 rounded-full filter blur-2xl opacity-20 animate-pulse animation-delay-4000"></div>

      </main>

      {/* Bottom Input Area */}
      <footer className="w-full p-4 z-20 bg-white bg-opacity-80 backdrop-blur-sm border-t border-gray-200">
        <div className="max-w-2xl mx-auto">
          {session && <NewQuestForm />}
          {!session && <p className="text-center text-gray-600">Please <Link href="/signin"><a className="text-indigo-600 hover:underline">sign in</a></Link> to start a quest.</p>}
        </div>
      </footer>
    </div>
  );
}

// Add animation delay utility class if not already in globals.css or tailwind config
// You might need to add this to globals.css:
/*
@layer utilities {
  .animation-delay-2000 { animation-delay: 2s; }
  .animation-delay-4000 { animation-delay: 4s; }
}
*/
