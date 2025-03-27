'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { FiCamera, FiX, FiUpload, FiSend } from 'react-icons/fi';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

interface ChatInputProps {
  questId: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  onMessageSent: () => void;
  // Add prop to trigger send from parent
  triggerSubmitRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

const IMAGE_GEN_COMMAND = "/generate";

export default function ChatInput({
  questId,
  inputValue,
  onInputChange,
  onMessageSent,
  triggerSubmitRef // Receive ref from parent
}: ChatInputProps) {
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
  // const router = useRouter(); // Keep router if needed for other things

  // Effect for clicks outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node) && triggerButtonRef.current && !triggerButtonRef.current.contains(event.target as Node)) {
        setShowUploadOptions(false);
      }
    }
    if (showUploadOptions) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUploadOptions]);

  // handleFileChange (compression logic)
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setShowUploadOptions(false);
    setError(null);
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file.');
        clearFileSelection(event.target);
        return;
      }
      console.log(`Original file size: ${Math.round(file.size / 1024)} KB`);
      const options = { maxSizeMB: 0.19, maxWidthOrHeight: 1024, useWebWorker: true, initialQuality: 0.8 };
      try {
        setLoading(true); setError("Compressing image...");
        const compressedFile = await imageCompression(file, options);
        console.log(`Compressed file size: ${Math.round(compressedFile.size / 1024)} KB`);
        if (compressedFile.size > 200 * 1024) { console.warn("Compression didn't reach target size."); }
        setSelectedFile(compressedFile);
        const reader = new FileReader();
        reader.onloadend = () => { setPreviewUrl(reader.result as string); };
        reader.readAsDataURL(compressedFile);
        setError(null);
      } catch (compressionError) {
        console.error('Image compression error:', compressionError);
        setError('Failed to compress image.');
        clearFileSelection(event.target);
      } finally {
        setLoading(false);
      }
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

  // --- Core Send Logic ---
  const sendMessage = async () => {
    // Use local variable inside function to ensure latest inputValue is used
    const currentInputValue = inputValue;
    const trimmedMessage = currentInputValue.trim();
    const isImageGenCommand = trimmedMessage.startsWith(IMAGE_GEN_COMMAND);
    const promptForGen = isImageGenCommand ? trimmedMessage.substring(IMAGE_GEN_COMMAND.length).trim() : '';

    // Use currentInputValue for checks
    if (!trimmedMessage && !selectedFile) { setError('Please enter a message or select an image.'); return; }
    if (isImageGenCommand && !promptForGen) { setError('Please provide a prompt after /generate.'); return; }
    if (isImageGenCommand && selectedFile) { setError('Cannot upload an image when using /generate command.'); return; }

    setLoading(true); setError(null);
    let uploadedImageUrl: string | null = null;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';
      let endpoint = ''; let body = {};

      if (isImageGenCommand) {
        endpoint = `${backendUrl}/quests/${questId}/generate-image`; body = { prompt: promptForGen }; console.log(`Sending image generation request: ${promptForGen}`);
      } else {
        endpoint = `${backendUrl}/quests/${questId}/messages`;
        if (selectedFile) {
          const fileExt = selectedFile.name.split('.').pop() || 'jpg'; const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`; const filePath = `${session.user.id}/${fileName}`; console.log(`Uploading to: ${filePath}`);
          const { error: uploadError } = await supabase.storage.from('quest-images').upload(filePath, selectedFile);
          if (uploadError) { console.error("Upload Error:", uploadError); throw uploadError; }
          const { data: urlData } = supabase.storage.from('quest-images').getPublicUrl(filePath);
          if (!urlData?.publicUrl) throw new Error("Could not get public URL."); uploadedImageUrl = urlData.publicUrl; console.log(`Upload success: ${uploadedImageUrl}`);
        }
        const messageContent: any[] = [];
        if (uploadedImageUrl) messageContent.push({ type: 'image_url', image_url: { url: uploadedImageUrl } });
        if (trimmedMessage) messageContent.push({ type: 'text', text: trimmedMessage }); // Use trimmedMessage from currentInputValue
        body = { content: messageContent }; console.log("Sending message content:", messageContent);
      }

      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
      if (!response.ok) { if (response.status === 401) throw new Error("Authentication error."); const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` })); throw new Error(errorData.detail || `Failed to process request: ${response.statusText}`); }

      clearFileSelection();
      onMessageSent(); // Call parent handler (which should clear inputValue)
      if (isImageGenCommand) { console.log("Image generation request accepted."); } else { console.log("User message sent, AI response triggered."); }

    } catch (err: any) {
      console.error("Raw error object:", err); const errorMessage = err?.message || err?.error_description || err?.error || "Failed to send message or upload image."; console.error("Processed error message:", errorMessage); setError(errorMessage);
    } finally { setLoading(false); }
  };

  // Expose the sendMessage function via the ref passed from parent
  useEffect(() => {
    if (triggerSubmitRef) {
      triggerSubmitRef.current = sendMessage;
    }
    return () => { // Cleanup function
      if (triggerSubmitRef) {
        triggerSubmitRef.current = null;
      }
    };
    // IMPORTANT: Include inputValue in dependencies if sendMessage relies on it directly
    // However, we made sendMessage read inputValue inside itself to avoid stale closures
  }, [triggerSubmitRef, inputValue]); // Re-run if ref changes, or inputValue changes (to ensure closure has latest value if needed, though internal read helps)


  // Form submit handler just calls the core logic
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage();
  };

  return (
    <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0">
      {/* Image Preview */}
      {previewUrl && ( <div className="mb-2 relative w-20 h-20 border rounded overflow-hidden"> <Image src={previewUrl} alt="Selected preview" layout="fill" objectFit="cover" /> <button onClick={() => clearFileSelection()} className="absolute top-0 right-0 p-0.5 bg-red-500 text-white rounded-full text-xs" aria-label="Remove image"> <FiX size={12} /> </button> </div> )}
      <form onSubmit={handleSubmit} className="flex items-center space-x-2 relative">
        {/* Hidden File Inputs */}
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <input type="file" ref={cameraInputRef} onChange={handleFileChange} accept="image/*" capture="environment" className="hidden" />
        {/* Upload Options Menu */}
        {showUploadOptions && ( <div ref={optionsMenuRef} className="absolute bottom-full left-0 mb-2 w-48 bg-white border rounded shadow-lg z-10"> <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"> <FiCamera className="mr-2"/> Take Photo </button> <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"> <FiUpload className="mr-2"/> Upload from Gallery </button> </div> )}
        {/* Main Trigger Button */}
        <button ref={triggerButtonRef} type="button" onClick={() => setShowUploadOptions(!showUploadOptions)} disabled={loading || !!selectedFile} className="p-2 text-gray-500 hover:text-indigo-600 disabled:text-gray-300 disabled:cursor-not-allowed" aria-label="Attach image"> <FiCamera size={20} /> </button>
        {/* Text Input - Controlled */}
        <input type="text" value={inputValue} onChange={(e) => onInputChange(e.target.value)} placeholder={`Ask or type "${IMAGE_GEN_COMMAND} prompt..."`} disabled={loading} className="flex-grow px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100 text-gray-900" />
        {/* Send Button */}
        <button type="submit" disabled={loading || (!inputValue.trim() && !selectedFile)} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"> <FiSend size={18} /> </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}