import clients # Use absolute import
import schemas # Use absolute import
import uuid
from typing import List, Optional, Dict, Any, Union
from datetime import datetime, timezone
import logging # Import logging module

QUESTS_TABLE = "quests"
MESSAGES_TABLE = "messages"
async def create_quest(user_id: str, quest_data: schemas.QuestCreate) -> Optional[schemas.Quest]:
    """Creates a new quest entry in the database."""
    logging.info(f"Attempting to create quest for user {user_id} with prompt: {quest_data.initial_prompt[:30]}...")
    try:
        # Generate a title if needed (e.g., from the first few words of the prompt)
        # For now, we'll rely on an explicit title or leave it null if not provided
        # For now, we'll rely on an explicit title or leave it null if not provided
        # in future versions of QuestCreate.
        title = quest_data.initial_prompt[:50] + "..." if quest_data.initial_prompt else "New Quest"

        insert_data = {
            "user_id": user_id,
            "title": title,
            # created_at and last_updated_at will be set by DB defaults (if configured)
            # or we can set them here:
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_updated_at": datetime.now(timezone.utc).isoformat(),
        }
        # REMOVED await: .execute() is synchronous in supabase-py v1/v2
        response = clients.supabase_client.table(QUESTS_TABLE).insert(insert_data).execute()
        if response.data:
            new_quest_data = response.data[0]
            logging.info(f"Successfully inserted quest {new_quest_data['id']} for user {user_id}.")

            # REMOVED automatic creation of first message from initial prompt.
            # The frontend will now send the first message via the /messages endpoint.

            quest_uuid = uuid.UUID(new_quest_data['id']) # Cast to UUID
            logging.info(f"Fetching newly created quest {quest_uuid} to return.")

            # Fetch the created quest again to ensure all fields are present
            # Note: get_quest_by_id itself is async, so await is needed here
            return await get_quest_by_id(user_id, quest_uuid)
        else:
            # Raise HTTPException instead of returning None for better error reporting
            # Need to import HTTPException and status from fastapi
            from fastapi import HTTPException, status
            error_detail = f"Failed to insert quest into database. Supabase error: {response.error}"
            print(error_detail)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=error_detail)
    except Exception as e:
        # Catch other potential errors (e.g., in add_message, get_quest_by_id, UUID casting)
        # Need to import HTTPException and status from fastapi
        from fastapi import HTTPException, status
        # Log the full exception traceback for detailed debugging
        logging.exception(f"Exception caught during quest creation process for user {user_id}:")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred during quest creation: {e}")

async def get_quests_by_user(user_id: str) -> List[schemas.Quest]:
    """Retrieves all quests for a specific user using RPC to include message counts."""
    try:
        # Call the RPC function, passing the user_id explicitly
        # Note: rpc().execute() is synchronous
        response = clients.supabase_client.rpc(
            'get_user_quests_with_counts',
            {'p_user_id': user_id} # Pass user_id as parameter
        ).execute()

        if response.data:
            # Map the results to the Quest schema (message_count still commented out)
            return [schemas.Quest(**quest) for quest in response.data]
        else:
            # Log potential RPC errors if data is empty (though RPC might raise exception on actual error)
            logging.info(f"No quests found or RPC error for user {user_id}. Response: {response}")
            return []
    except Exception as e:
        logging.exception(f"Exception calling get_user_quests_with_counts RPC for user {user_id}:")
        return []

async def get_quest_by_id(user_id: str, quest_id: uuid.UUID) -> Optional[schemas.Quest]:
    """Retrieves a specific quest by its ID, ensuring it belongs to the user."""
    try:
        # REMOVED await from start of chain
        response = clients.supabase_client.table(QUESTS_TABLE)\
            .select("*")\
            .eq("id", str(quest_id))\
            .eq("user_id", user_id)\
            .maybe_single()\
            .execute() # REMOVED await
        if response.data:
            return schemas.Quest(**response.data)
        else:
            if response.error:
                 print(f"Error fetching quest {quest_id}:", response.error)
            return None # Quest not found or doesn't belong to user
    except Exception as e:
        print(f"Error in get_quest_by_id: {e}")
        return None

async def add_message(
    user_id: str,
    quest_id: uuid.UUID,
    role: str,
    content: Union[str, List[Dict[str, Any]]],
    embedding: Optional[List[float]] = None,
    metadata: Optional[Dict[str, Any]] = None # Add optional metadata parameter
) -> Optional[schemas.Message]:
    """Adds a message to a specific quest, optionally including embedding and metadata."""
    try:
        insert_data = {
            "quest_id": str(quest_id),
            "user_id": user_id,
            "role": role,
            "content": content, # Supabase client handles JSON serialization
            "embedding": embedding, # Include embedding if provided
            "metadata": metadata, # Include metadata if provided
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # REMOVED await: insert().execute() is synchronous
        response = clients.supabase_client.table(MESSAGES_TABLE).insert(insert_data).execute()

        if response.data:
            # Also update the quest's last_updated_at timestamp
            # REMOVED await from here as well, chain before execute is likely sync
            clients.supabase_client.table(QUESTS_TABLE)\
                .update({"last_updated_at": datetime.now(timezone.utc).isoformat()})\
                .eq("id", str(quest_id))\
                .execute() # REMOVED await
            return schemas.Message(**response.data[0])
        else:
            print("Error adding message:", response.error)
            return None
    except Exception as e:
        print(f"Error in add_message: {e}")
        return None

async def get_messages_by_quest(user_id: str, quest_id: uuid.UUID) -> List[schemas.Message]:
    """Retrieves all messages for a specific quest, ensuring user ownership."""
    try:
        # First verify the user owns the quest
        # Note: get_quest_by_id itself is async, so await is needed here
        quest = await get_quest_by_id(user_id, quest_id)
        if not quest:
            return [] # Return empty if quest doesn't exist or user doesn't own it

        # REMOVED await from start of chain
        response = clients.supabase_client.table(MESSAGES_TABLE)\
            .select("*")\
            .eq("quest_id", str(quest_id))\
            .order("created_at", desc=False)\
            .execute() # REMOVED await

        if response.data:
            return [schemas.Message(**msg) for msg in response.data]
        else:
            # If data is empty or None, just return empty list (not an error)
            # Removed check for response.error
            logging.info(f"No messages found for quest {quest_id}. Response data: {response.data}")
            return []
    except Exception as e:
        # Catch potential exceptions during the select query itself
        print(f"Error in get_messages_by_quest: {e}")
        return []

async def find_relevant_messages(
    quest_id: uuid.UUID,
    query_embedding: List[float],
    match_threshold: float = 0.7, # Default threshold
    match_count: int = 5 # Default count
) -> List[schemas.Message]:
    """Calls the match_quest_messages RPC function in Supabase."""
    try:
        # Note: rpc().execute() is also synchronous
        response = clients.supabase_client.rpc(
            "match_quest_messages",
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": match_count,
                "target_quest_id": str(quest_id),
            },
        ).execute()

        if response.data:
            # The RPC function returns message data, convert to Message schema
            # Note: The RPC result might not include the 'embedding' field itself
            relevant_docs = [schemas.Message(**msg) for msg in response.data]
            logging.info(f"Found {len(relevant_docs)} relevant messages for quest {quest_id} using similarity search.")
            return relevant_docs
        else:
            # If data is empty or None, log that no matches were found (not necessarily an error)
            logging.info(f"No relevant messages found via RPC for quest {quest_id} (threshold: {match_threshold}). Response data: {response.data}")
            return []
    except Exception as e:
        # Catch potential exceptions during the RPC call itself
        logging.exception(f"Exception during similarity search for quest {quest_id}:")
        return []

async def delete_quest(user_id: str, quest_id: uuid.UUID) -> bool:
    """Deletes a specific quest and its messages, ensuring user ownership."""
    try:
        # Delete the quest belonging to the user.
        # RLS policy ensures user can only delete their own.
        # CASCADE constraint on messages table handles deleting associated messages.
        response = clients.supabase_client.table(QUESTS_TABLE)\
            .delete()\
            .eq("id", str(quest_id))\
            .eq("user_id", user_id)\
            .execute()

        # Check if deletion was successful (usually response.data is empty on successful delete)
        # A more robust check might involve seeing if data exists *before* delete,
        # but RLS handles the authorization check. If execute doesn't raise an error,
        # and RLS passed, it likely succeeded or the quest didn't exist for that user.
        logging.info(f"Delete quest attempt result for quest {quest_id}, user {user_id}. Response: {response.data}")
        # Consider response.count for delete operations if available and needed
        return True # Assume success if no exception

    except Exception as e:
        logging.exception(f"Exception during quest deletion for quest {quest_id}, user {user_id}:")
        return False


# --- Placeholder for Embedding Generation ---
# async def generate_embedding(text_content: str):
#     # Replace with actual call to an embedding model (e.g., via Gemini API)
#     print(f"Placeholder: Generating embedding for: {text_content[:50]}...")
#     # Example: return list of floats
#     return [0.1] * 768 # Dimension depends on the model used