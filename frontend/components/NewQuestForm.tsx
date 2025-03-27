'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { FiCamera, FiX, FiUpload, FiSend } from 'react-icons/fi';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

interface ChatInputProps { // Renaming interface for clarity might be good later
  questId?: string; // Make questId optional as it's not used here
}

// Command prefix for image generation (Keep for consistency if needed elsewhere)
// const IMAGE_GEN_COMMAND = "/generate";

export default function NewQuestForm({ questId }: ChatInputProps) { // Keep prop for consistency? Or remove? Let's remove for now.
// export default function NewQuestForm() { // Simpler signature
  const [prompt, setPrompt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUploadOptions, setShowUploadOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const supabase = createClient();
  const router = useRouter();

  // Effect for clicks outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node) && triggerButtonRef.current && !triggerButtonRef.current.contains(event.target as Node)) { setShowUploadOptions(false); }
    }
    if (showUploadOptions) { document.addEventListener('mousedown', handleClickOutside); }
    else { document.removeEventListener('mousedown', handleClickOutside); }
    return () => { document.removeEventListener('mousedown', handleClickOutside); };
  }, [showUploadOptions]);

  // handleFileChange (compression logic)
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setShowUploadOptions(false);
    setError(null);
    if (file) {
      if (!file.type.startsWith('image/')) { setError('Please select an image file.'); clearFileSelection(event.target); return; }
      console.log(`Original file size: ${Math.round(file.size / 1024)} KB`);
      const options = { maxSizeMB: 0.19, maxWidthOrHeight: 1024, useWebWorker: true, initialQuality: 0.8 };
      try {
        setLoading(true); setError("Compressing image...");
        const compressedFile = await imageCompression(file, options);
        console.log(`Compressed file size: ${Math.round(compressedFile.size / 1024)} KB`);
        if (compressedFile.size > 200 * 1024) { console.warn("Compression didn't reach target size."); }
        setSelectedFile(compressedFile); // Keep the compressed file ready
        const reader = new FileReader();
        reader.onloadend = () => { setPreviewUrl(reader.result as string); };
        reader.readAsDataURL(compressedFile);
        setError(null);
      } catch (compressionError) { console.error('Image compression error:', compressionError); setError('Failed to compress image.'); clearFileSelection(event.target);
      } finally { setLoading(false); }
    }
     if (event.target) event.target.value = '';
  };

  // clearFileSelection
  const clearFileSelection = (inputElement?: HTMLInputElement | null) => {
    setSelectedFile(null); setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (inputElement) inputElement.value = '';
  };

  // handleCreateQuest - Modified
  const handleCreateQuest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt && !selectedFile) {
        setError("Please enter a prompt or select an image to start your quest.");
        return;
    };

    setLoading(true);
    setError(null);

    // Note: We upload the image here BUT DON'T pass the URL to the /quests endpoint.
    // The user will send the image/text again using ChatInput on the quest page.
    // This simplifies the backend creation logic significantly.
    let tempUploadedImageUrl: string | null = null; // We might not even need to upload here anymore? Let's keep it for now.

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // --- Upload Image if selected (Optional - could be deferred to first message) ---
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop() || 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `${session.user.id}/${fileName}`;
        console.log(`(New Quest) Attempting upload for user ${session.user.id} to path: ${filePath}`);
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('quest-images')
          .upload(filePath, selectedFile);
        if (uploadError) { console.error("(New Quest) Supabase Storage Upload Error:", uploadError); throw uploadError; }
        const { data: urlData } = supabase.storage.from('quest-images').getPublicUrl(filePath);
        if (!urlData?.publicUrl) throw new Error("(New Quest) Could not get public URL.");
        tempUploadedImageUrl = urlData.publicUrl; // Store temporarily if needed, but not sent to /quests
        console.log(`(New Quest) Image uploaded successfully: ${tempUploadedImageUrl}`);
      }

      // --- Prepare data for backend - ONLY SEND PROMPT FOR TITLE GENERATION ---
      // Backend will no longer create the first message automatically.
      const questData = { initial_prompt: trimmedPrompt || null }; // Send prompt for title, or null

      // --- Call Backend to Create Quest ---
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
      console.log(`Creating quest with initial prompt for title: ${questData.initial_prompt}`);
      const response = await fetch(`${backendUrl}/quests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify(questData),
      });

      if (!response.ok) {
         const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
         throw new Error(errorData.detail || `Failed to create quest: ${response.statusText}`);
      }

      const newQuest = await response.json();
      console.log("New quest container created:", newQuest);
      setPrompt('');
      clearFileSelection();

      // Redirect user to the newly created (empty) quest's detail page
      // The user will then send the first message (text/image) using ChatInput
      router.push(`/quest/${newQuest.id}`);

    } catch (err: any) {
      console.error("(New Quest) Raw error object:", err);
      const errorMessage = err?.message || err?.error_description || err?.error || "Failed to start quest.";
      console.error("(New Quest) Processed error message:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Image Preview */}
      {previewUrl && ( <div className="mb-2 relative w-20 h-20 border rounded overflow-hidden"> <Image src={previewUrl} alt="Selected preview" layout="fill" objectFit="cover" /> <button onClick={() => clearFileSelection()} className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-full text-xs" aria-label="Remove image"> <FiX size={12} /> </button> </div> )}
      <form onSubmit={handleCreateQuest} className="space-y-3">
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What do you want to explore today? Start your quest here..." rows={3} disabled={loading} className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100 text-gray-900" />
        <div className="flex justify-between items-center relative">
            {/* Hidden File Inputs */}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
            {/* Upload Options Menu */}
            {showUploadOptions && ( <div ref={optionsMenuRef} className="absolute bottom-full left-0 mb-2 w-48 bg-white border rounded shadow-lg z-10"> <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"> <FiCamera className="mr-2"/> Take Photo </button> <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"> <FiUpload className="mr-2"/> Upload from Gallery </button> </div> )}
            {/* Upload Trigger Button */}
            <button ref={triggerButtonRef} type="button" onClick={() => setShowUploadOptions(!showUploadOptions)} disabled={loading || !!selectedFile} className="p-2 text-gray-500 hover:text-indigo-600 disabled:text-gray-300 disabled:cursor-not-allowed" aria-label="Attach image"> <FiCamera size={20} /> </button>
            {/* Start Quest Button */}
            <button type="submit" disabled={loading || (!prompt.trim() && !selectedFile)} className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"> {loading ? 'Starting...' : 'Start Quest'} </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>
    </div>
  );
}