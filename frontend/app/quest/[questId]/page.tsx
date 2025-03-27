'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import ChatInput from '@/components/ChatInput';
import ChatMessages from '@/components/ChatMessages';
import LoadingDots from '@/components/LoadingDots';
import { createClient } from '@/lib/supabaseClient';
import { useParams, useRouter } from 'next/navigation';
import { FiMessageSquare, FiTrash2, FiX } from 'react-icons/fi'; // Added FiTrash2

// Define Message and QuestDetail types
interface Message { id: string; quest_id: string; user_id: string; role: 'user' | 'model' | 'system'; content: any; created_at: string; metadata?: { suggestions?: string[] } | null; }
interface QuestDetail { id: string; user_id: string; title: string | null; created_at: string; last_updated_at: string; messages: Message[]; }

// Simple confirmation dialog
const confirmDelete = () => {
    return window.confirm("Are you sure you want to delete this quest and all its messages?");
};

export default function QuestPage() {
  const params = useParams();
  const router = useRouter();
  const questId = params.questId as string;

  const [questDetails, setQuestDetails] = useState<QuestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [sessionChecked, setSessionChecked] = useState(false);
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false); // State for delete button
  const [toastMessage, setToastMessage] = useState<string | null>(null); // State for toast
  const supabase = createClient();
  const triggerChatSubmit = useRef<(() => Promise<void>) | null>(null);

  // Fetch initial quest data
  useEffect(() => {
    // ... (keep existing fetch logic) ...
    const fetchInitialData = async () => { setIsLoading(true); setFetchError(null); const { data: { session }, error: sessionError } = await supabase.auth.getSession(); setSessionChecked(true); if (sessionError) { setFetchError(sessionError.message); setIsLoading(false); return; } if (!session) { router.push('/signin'); return; } try { const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'; const response = await fetch(`${backendUrl}/quests/${questId}`, { headers: { 'Authorization': `Bearer ${session.access_token}` }, cache: 'no-store', }); if (response.status === 404) { setFetchError("Quest not found or access denied."); setQuestDetails(null); } else if (!response.ok) { const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` })); throw new Error(errorData.detail || `Failed to fetch quest details: ${response.statusText}`); } else { const data: QuestDetail = await response.json(); setQuestDetails(data); } } catch (error: any) { console.error("Error fetching quest details:", error); setFetchError(error.message || "Could not load quest details."); setQuestDetails(null); } finally { setIsLoading(false); } }; fetchInitialData();
  }, [questId, supabase, router]);


  // Handler for suggestion clicks
  const handleSuggestionClick = async (suggestionText: string) => {
    // ... (keep existing logic) ...
    setInputValue(suggestionText); setIsAiResponding(true); setTimeout(() => { if (triggerChatSubmit.current) { console.log("Triggering submit via suggestion click..."); triggerChatSubmit.current(); } else { console.error("triggerChatSubmit ref is not set!"); setIsAiResponding(false); } }, 50);
  };

  // Handler for ChatInput submit completion
  const handleMessageSent = () => {
    // ... (keep existing logic) ...
    setInputValue(''); setIsAiResponding(true);
  };

  // Handler for new messages received via Realtime from ChatMessages
  const handleRealtimeMessage = (newMessage: Message) => {
    // ... (keep existing logic) ...
    console.log("QuestPage received new message via prop:", newMessage); if (newMessage.role === 'model') { setIsAiResponding(false); } setQuestDetails(prevDetails => { if (!prevDetails || !prevDetails.messages) { return { ...prevDetails, messages: [newMessage] } as QuestDetail; } if (prevDetails.messages.some(msg => msg.id === newMessage.id)) { return prevDetails; } return { ...prevDetails, messages: [...prevDetails.messages, newMessage] }; });
  };

  // --- Delete Quest Handler ---
  const handleDeleteQuest = async () => {
    if (!confirmDelete()) return;

    setIsDeleting(true);
    setFetchError(null); // Clear previous errors

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';
        const response = await fetch(`${backendUrl}/quests/${questId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
        });

        if (!response.ok) {
            // Handle specific errors like 401 or 404 if needed
            const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
            throw new Error(errorData.detail || `Failed to delete quest: ${response.statusText}`);
        }

        console.log(`Quest ${questId} deleted successfully.`);
        // Show toast and redirect
        setToastMessage("Quest deleted successfully!");
        setTimeout(() => {
            router.push('/'); // Redirect to dashboard after a short delay
        }, 1500); // 1.5 second delay

    } catch (err: any) {
        console.error("Error deleting quest:", err);
        setFetchError(err.message || "Failed to delete quest.");
        setIsDeleting(false); // Re-enable button on error
    }
    // No finally needed as redirect handles loading state implicitly
  };

  // Get Suggestions from Latest Message in state
  const latestMessage = questDetails?.messages?.[questDetails.messages.length - 1];
  const suggestions = (latestMessage?.role === 'model' && latestMessage.metadata?.suggestions) || [];


  // --- Render Logic ---
  if (!sessionChecked || isLoading) { return ( <div className="flex items-center justify-center h-screen"> Loading Quest... </div> ); }

  return (
    <main className="flex flex-col h-screen bg-gray-100">
      {/* Toast Message Display */}
      {toastMessage && (
          <div className="fixed top-5 right-5 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
              {toastMessage}
          </div>
      )}

      <header className="flex justify-between items-center p-4 bg-white border-b border-gray-200 sticky top-0 z-10 flex-shrink-0">
        <div className="flex items-center space-x-4">
           <Link href="/" className="text-indigo-600 hover:text-indigo-800">&larr; Back to Quests</Link>
           <h1 className="text-xl font-semibold text-gray-800 truncate"> {questDetails?.title || `Quest ${questId?.substring(0, 6)}...`} </h1>
        </div>
        {/* Right side header buttons */}
        <div className="flex items-center space-x-3">
            <button
                onClick={handleDeleteQuest}
                disabled={isDeleting || !questDetails} // Disable if deleting or no quest loaded
                title="Delete Quest"
                className="p-1 text-red-500 hover:text-red-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
                {isDeleting ? <LoadingDots /> : <FiTrash2 size={18} />}
            </button>
            <LogoutButton />
        </div>
      </header>

      {/* Container for the main chat area */}
      <div className="flex flex-col flex-grow overflow-hidden">
          {fetchError && ( <div className="flex-grow flex items-center justify-center"> <p className="text-red-600 p-4">Error: {fetchError}</p> </div> )}
          {!fetchError && questDetails && (
            <>
              {/* Message list */}
              <div className="flex-grow overflow-y-auto">
                 <ChatMessages initialMessages={questDetails.messages} questId={questId} onNewMessage={handleRealtimeMessage} />
              </div>
              {/* Suggestions OR Loading Area */}
              <div className="px-4 pt-2 pb-2 border-t border-gray-200 bg-gray-50 flex flex-nowrap gap-2 overflow-x-auto flex-shrink-0 min-h-[44px]">
                 {isAiResponding ? ( <div className="flex items-center justify-center w-full"> <LoadingDots /> </div> )
                 : suggestions.length > 0 ? ( suggestions.map((suggestion, index) => ( <button key={index} onClick={() => handleSuggestionClick(suggestion)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-full text-sm text-gray-700 hover:bg-gray-100 hover:border-gray-400 transition-colors shadow-sm whitespace-nowrap flex-shrink-0" > <FiMessageSquare className="inline mr-1.5 mb-0.5" size={14}/> {suggestion} </button> )) )
                 : ( <div className="w-full h-[1px]"></div> )}
              </div>
              {/* ChatInput */}
              <div className="flex-shrink-0">
                 <ChatInput questId={questId} inputValue={inputValue} onInputChange={setInputValue} onMessageSent={handleMessageSent} triggerSubmitRef={triggerChatSubmit} />
              </div>
            </>
          )}
           {!fetchError && !questDetails && ( <div className="flex-grow flex items-center justify-center"> <p className="text-gray-600 p-4">Quest data could not be loaded.</p> </div> )}
      </div>
    </main>
  );
}