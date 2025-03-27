'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabaseClient';
import ReactMarkdown from 'react-markdown';
import { FiCopy, FiCheck, FiX } from 'react-icons/fi';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

// Define Message type
interface Message { id: string; quest_id: string; user_id: string; role: 'user' | 'model' | 'system'; content: any; created_at: string; metadata?: { suggestions?: string[] } | null; }

interface ChatMessagesProps { initialMessages: Message[]; questId: string; onNewMessage: (newMessage: Message) => void; }

// Helper function to extract text content for copying
const extractTextContent = (content: any): string => { if (typeof content === 'string') { return content; } if (Array.isArray(content)) { return content.filter(part => part.type === 'text').map(part => part.text).join('\n'); } try { return JSON.stringify(content); } catch { return ''; } };

export default function ChatMessages({ initialMessages, questId, onNewMessage }: ChatMessagesProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [isClient, setIsClient] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null);
  const supabase = createClient();
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => { setIsClient(true); }, []);

  useEffect(() => { console.log("Messages updated, scrolling to bottom."); messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Realtime subscription effect
  useEffect(() => {
    if (!questId) { return; }; console.log(`Realtime effect: Attempting to subscribe... ${questId}`);
    const channel = supabase.channel(`quest_messages_${questId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `quest_id=eq.${questId}` }, (payload) => {
      console.log('Realtime INSERT received raw payload:', payload);
      if (payload.new && typeof payload.new === 'object') {
          const newMessage = payload.new as Message; console.log('Realtime INSERT processed newMessage:', newMessage); let messageAdded = false;
          setMessages((currentMessages) => { if (!currentMessages.some(msg => msg.id === newMessage.id)) { console.log('Adding new message via Realtime state update:', newMessage.id); messageAdded = true; return [...currentMessages, newMessage]; } return currentMessages; });
          if (messageAdded) { console.log("New message added via Realtime, calling onNewMessage prop."); onNewMessage(newMessage); }
      } else { console.warn('Realtime INSERT received unexpected payload format:', payload); }
    }).subscribe((status, err) => { if (err) { console.error(`Realtime subscription error for quest ${questId}:`, err); } else { console.log(`Realtime channel status for quest ${questId}: ${status}`); } });
    return () => { console.log(`Realtime effect cleanup: Unsubscribing... ${questId}`); supabase.removeChannel(channel); };
  }, [questId, supabase, onNewMessage, router]);

  // Copy handler with detailed logging
  const handleCopy = (message: Message) => {
    const textToCopy = extractTextContent(message.content);
    console.log("Attempting to copy text:", textToCopy); // Log text being copied
    if (!navigator.clipboard) {
        console.error("navigator.clipboard API is not available.");
        alert("Clipboard API not available in this browser or context."); // User feedback
        return;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      console.log("Text successfully copied to clipboard!"); // Log success
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 1500);
    }).catch(err => {
        // Log the specific error during writeText
        console.error('Failed to copy text to clipboard:', err);
        alert(`Failed to copy: ${err}`); // User feedback
    });
  };


  // --- Render Logic ---
  const renderTextMessageBubble = (message: Message, textParts: any[]) => {
    if (textParts.length === 0) return null;
    // Always visible copy button style
    return ( <div className={`relative group max-w-xs md:max-w-md lg:max-w-2xl px-4 py-3 rounded-xl shadow-md ${ message.role === 'user' ? 'bg-indigo-500 text-white' : 'bg-white text-gray-800 border border-gray-100' }`} > {textParts.map((part, index) => ( message.role === 'model' ? ( <div key={`text-${index}`} className="prose prose-sm max-w-none prose-p:my-1"> <ReactMarkdown>{part.text || ''}</ReactMarkdown> </div> ) : ( <p key={`text-${index}`}>{part.text || ''}</p> ) ))} {isClient && ( <div className={`text-xs mt-1 ${message.role === 'user' ? 'text-indigo-200' : 'text-gray-400'} text-right`}> {new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} </div> )} {message.role === 'model' && isClient && ( <button onClick={() => handleCopy(message)} title="Copy text" className="absolute top-1 right-1 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors duration-150" aria-label="Copy message text" > {copiedMessageId === message.id ? <FiCheck size={14} className="text-green-500" /> : <FiCopy size={14} />} </button> )} </div> );
  };
  const renderImageThumbnail = (part: any, index: number) => { if (part.type === 'image_url' && part.image_url?.url) { const imageUrl = part.image_url.url; return ( <button key={`image-${index}`} onClick={() => setModalImageUrl(imageUrl)} className="relative block w-48 h-48 aspect-square overflow-hidden rounded-lg border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity shadow-md" > <Image src={imageUrl} alt="Uploaded content thumbnail" layout="fill" objectFit="cover" /> </button> ); } return null; };

  console.log("Rendering ChatMessages with message count:", messages.length);

  return (
    <>
      {/* Message Display Area */}
      <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg) => {
          const contentParts = Array.isArray(msg.content) ? msg.content : (typeof msg.content === 'string' ? [{ type: 'text', text: msg.content }] : []);
          const imageParts = contentParts.filter(part => part.type === 'image_url');
          const textParts = contentParts.filter(part => part.type === 'text');
          return ( <div key={msg.id} className={`flex flex-col gap-2 ${ msg.role === 'user' ? 'items-end' : 'items-start' }`} > {imageParts.map((part, index) => renderImageThumbnail(part, index))} {renderTextMessageBubble(msg, textParts)} </div> );
        })}
        <div ref={messagesEndRef} />
      </div>
      {/* Image Modal */}
      {modalImageUrl && ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" onClick={() => setModalImageUrl(null)} > <div className="relative max-w-3xl max-h-[80vh]" onClick={(e) => e.stopPropagation()}> <Image src={modalImageUrl} alt="Enlarged content" layout="intrinsic" width={1000} height={800} objectFit="contain" /> <button onClick={() => setModalImageUrl(null)} className="absolute top-2 right-2 p-1 bg-white rounded-full text-gray-800 hover:bg-gray-200" aria-label="Close image viewer" > <FiX size={20} /> </button> </div> </div> )}
    </>
  );
}