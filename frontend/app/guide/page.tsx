'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton'; // Re-use logout button

export default function GuidePage() {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  // Fetch initial prompt
  useEffect(() => {
    const fetchGuide = async () => {
      setIsLoading(true);
      setError(null);
      setSuccessMessage(null);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      setSessionChecked(true);

      if (sessionError) { setError(sessionError.message); setIsLoading(false); return; }
      if (!session) { router.push('/signin'); return; }

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';
        const response = await fetch(`${backendUrl}/guide`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
          throw new Error(errorData.detail || 'Failed to fetch guide prompt');
        }
        const data = await response.json();
        setPrompt(data.prompt || ''); // Set empty string if null
      } catch (err: any) {
        setError(err.message || 'Could not load guide prompt.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchGuide();
  }, [supabase, router]);

  // Handle Save
  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not authenticated."); setIsSaving(false); return; }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';
      const response = await fetch(`${backendUrl}/guide`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ prompt: prompt }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
        throw new Error(errorData.detail || 'Failed to save guide prompt');
      }
      setSuccessMessage('Guide updated successfully!');
      // Clear success message after a delay
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Could not save guide prompt.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!sessionChecked) {
     return <div className="flex items-center justify-center h-screen">Checking session...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
       <header className="flex justify-between items-center p-4 bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center space-x-4">
           <Link href="/" className="text-indigo-600 hover:text-indigo-800">&larr; Back to Dashboard</Link>
           <h1 className="text-xl font-semibold text-gray-800 truncate">Customize Your AI Guide</h1>
        </div>
        <LogoutButton />
      </header>

      <main className="flex-grow p-6 md:p-10">
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800">Guide Persona & Style</h2>
          <p className="text-sm text-gray-600 mb-4">
            Describe how you want the AI to act. You can specify its role (like a friendly tutor, a curious explorer),
            its tone (playful, serious), preferred language style, and how it should interact (e.g., always ask questions).
            If left blank, a default nurturing parent persona will be used.
          </p>

          {isLoading && <p>Loading current guide...</p>}
          {error && <p className="text-red-600 mb-4">Error: {error}</p>} {/* Use 'error' state variable */}

          {!isLoading && !error && ( // Use 'error' state variable
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Act like a funny space captain explaining planets..."
              rows={15}
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900 mb-4"
              disabled={isSaving}
            />
          )}

          {successMessage && <p className="text-green-600 mb-4">{successMessage}</p>}

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={isLoading || isSaving}
              className="px-5 py-2 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Guide'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}