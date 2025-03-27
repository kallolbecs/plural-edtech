'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FiTrash2 } from 'react-icons/fi';
import { createClient } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';

// Re-define Quest type or import from shared location
interface Quest {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  last_updated_at: string;
  message_count: number | null;
}

interface QuestIconProps {
  quest: Quest;
  index: number; // Used for positioning
}

// Helper function to place icons roughly on a grid with jitter
const getRandomPosition = (index: number) => {
    const gridCols = 5; // How many columns in our conceptual grid
    const gridRows = 4; // How many rows

    // Determine grid cell based on index
    const totalCells = gridCols * gridRows;
    const cellIndex = index % totalCells; // Wrap around if more icons than cells
    const col = cellIndex % gridCols;
    const row = Math.floor(cellIndex / gridCols);

    // Calculate base position for the cell center (adjust percentages as needed)
    const baseX = (100 / (gridCols + 1)) * (col + 1);
    const baseY = (100 / (gridRows + 1)) * (row + 1);

    // Add pseudo-random jitter within the cell (based on index to be stable server-side)
    // Use smaller multipliers for jitter compared to base position
    const seed = index * 5 + 7;
    const jitterX = ((seed * 11) % 10) - 5; // Jitter between -5% and +5% horizontally
    const jitterY = ((seed * 13) % 8) - 4;  // Jitter between -4% and +4% vertically

    const finalX = Math.max(5, Math.min(95, baseX + jitterX)); // Clamp within 5-95%
    const finalY = Math.max(10, Math.min(90, baseY + jitterY)); // Clamp within 10-90%

    return { top: `${finalY}%`, left: `${finalX}%` };
};

// Simple confirmation dialog
const confirmDelete = () => {
    return window.confirm("Are you sure you want to delete this quest and all its messages?");
};

export default function QuestIcon({ quest, index }: QuestIconProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const position = getRandomPosition(index);
  const supabase = createClient();
  const router = useRouter();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirmDelete()) { return; }
    setIsDeleting(true); setError(null);

    try {
       const { data: { session } } = await supabase.auth.getSession();
       if (!session) throw new Error("Not authenticated");

       console.log(`Attempting to delete quest: ${quest.id}`);
       const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || '/api'; // Use relative path
       const response = await fetch(`${backendUrl}/quests/${quest.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${session.access_token}` },
       });

       if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `HTTP error ${response.status}` }));
            throw new Error(errorData.detail || `Failed to delete quest: ${response.statusText}`);
       }

       console.log(`Quest ${quest.id} deleted successfully.`);
       router.refresh();

    } catch (err: any) {
        console.error("Error deleting quest:", err);
        setError(err.message || "Failed to delete quest.");
        setIsDeleting(false);
    }
  };

  return (
    <div
      className="absolute transform -translate-x-1/2 -translate-y-1/2 group"
      style={position}
    >
      <Link href={`/quest/${quest.id}`} legacyBehavior>
        <a
          title={quest.title || `Quest ${quest.id.substring(0, 6)}...`}
          className="
            relative block w-16 h-16 /* Base size */
            md:w-20 md:h-20 /* Slightly larger on medium screens */
            bg-gradient-to-br from-indigo-200 to-blue-300
            rounded-full shadow-lg hover:shadow-xl
            cursor-pointer transition-all duration-200 ease-in-out
            hover:scale-110
          "
        >
          {/* Message Count Badge */}
          {(quest.message_count ?? 0) > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500 text-xs font-medium text-white">
              {quest.message_count}
            </span>
          )}
          {/* Inner Icon/Letter */}
           <div className="flex items-center justify-center h-full w-full text-indigo-700">
                <span className="text-xl font-bold">{quest.title ? quest.title[0].toUpperCase() : '?'}</span>
           </div>
           {/* Delete Button */}
           <button
             onClick={handleDelete}
             disabled={isDeleting}
             title="Delete Quest"
             className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 p-1 bg-red-500 text-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 hover:bg-red-600 disabled:opacity-50"
             aria-label="Delete quest"
           >
             {isDeleting ? '...' : <FiTrash2 size={12} />}
           </button>
        </a>
      </Link>
      {/* Title Label Below */}
      <div className="mt-2 text-center text-xs text-gray-600 bg-white bg-opacity-70 px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap">
        {quest.title || `Quest ${quest.id.substring(0, 6)}...`}
      </div>
      {/* Error Display */}
      {error && <p className="text-xs text-red-500 text-center mt-1">{error}</p>}
    </div>
  );
}