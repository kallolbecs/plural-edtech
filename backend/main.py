import logging # Import logging
from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Union
import uuid
import google.generativeai as genai

# Configure basic logging to show INFO level messages and exceptions
logging.basicConfig(level=logging.INFO, format='%(levelname)s:     %(asctime)s - %(message)s')

# Import local modules using absolute paths from 'backend' directory
import schemas
import database
import auth
import clients
import config
import llm # Import the llm module as well
from gotrue.types import User # For type hinting the user object

app = FastAPI()

# Configure CORS
origins = [
    "http://localhost:3000",  # Allow frontend dev server
    "http://plural.dexterslab.site", # Allow production frontend
    "https://plural.dexterslab.site",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def read_root():
    return {"message": "Plural Backend is running!"}


# --- Quest Endpoints ---

@app.post("/quests", response_model=schemas.Quest, status_code=status.HTTP_201_CREATED)
async def create_new_quest(
    quest_data: schemas.QuestCreate,
    background_tasks: BackgroundTasks, # Inject background tasks
    current_user: User = Depends(auth.get_current_user)
):
    """
    Creates a new quest for the logged-in user, saves the initial prompt
    (if provided), and schedules the first AI response generation.
    Optionally takes an initial text prompt.
    """
    user_id = str(current_user.id)
    quest = await database.create_quest(user_id=user_id, quest_data=quest_data)
    if not quest:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not create quest")

    # REMOVED scheduling of AI response here, as no initial message is created.
    # The first AI response will be triggered when the user sends the first message
    # via the POST /quests/{quest_id}/messages endpoint.

    # Return the created quest details
    return quest

@app.get("/quests", response_model=List[schemas.Quest])
async def get_user_quests(current_user: User = Depends(auth.get_current_user)):
    """
    Retrieves all quests belonging to the logged-in user.
    """
    user_id = str(current_user.id)
    quests = await database.get_quests_by_user(user_id=user_id)
    return quests

@app.get("/quests/{quest_id}", response_model=schemas.QuestDetail)
async def get_quest_details(
    quest_id: uuid.UUID,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Retrieves a specific quest and all its messages for the logged-in user.
    """
    user_id = str(current_user.id)
    quest = await database.get_quest_by_id(user_id=user_id, quest_id=quest_id)
    if not quest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found or access denied")

    messages = await database.get_messages_by_quest(user_id=user_id, quest_id=quest_id)
    return schemas.QuestDetail(**quest.model_dump(), messages=messages)


# --- Message / Interaction Endpoints ---

@app.post("/quests/{quest_id}/messages", response_model=schemas.Message)
async def add_new_message(
    quest_id: uuid.UUID,
    message_data: schemas.MessageCreate, # Expects user message content
    background_tasks: BackgroundTasks, # Add background_tasks parameter
    current_user: User = Depends(auth.get_current_user)
):
    """
    Adds a user message to a quest and triggers the AI response generation.
    Handles text and potentially image uploads later.
    """
    user_id = str(current_user.id)

    # Verify user owns the quest before adding a message
    quest = await database.get_quest_by_id(user_id=user_id, quest_id=quest_id)
    if not quest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found or access denied")

    # Add the user's message to the database
    user_message = await database.add_message(
        user_id=user_id,
        quest_id=quest_id,
        role="user",
        content=message_data.content # Pass content directly (text or multimodal list)
    )
    if not user_message:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not save user message")

    # Schedule the AI response generation as a background task
    background_tasks.add_task(llm.generate_ai_response, user_id=user_id, quest_id=quest_id)
    print(f"AI response generation scheduled for Quest {quest_id}")

    # Return the user's message immediately (HTTP 202 Accepted)
    return user_message

# TODO: Add endpoint for image upload to a message (Handled via POST /messages)

# --- Image Generation Endpoint ---

@app.post("/quests/{quest_id}/generate-image", status_code=status.HTTP_202_ACCEPTED)
async def generate_image_for_quest(
    quest_id: uuid.UUID,
    request_data: schemas.ImageGenerationRequest, # Contains the prompt
    background_tasks: BackgroundTasks,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Accepts a prompt and schedules image generation as a background task.
    """
    user_id = str(current_user.id)

    # Verify user owns the quest
    quest = await database.get_quest_by_id(user_id=user_id, quest_id=quest_id)
    if not quest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quest not found or access denied")

    # Schedule the image generation and saving task
    background_tasks.add_task(
        llm.handle_image_generation_request, # We'll create this function next
        user_id=user_id,
        quest_id=quest_id,
        prompt=request_data.prompt
    )

    logging.info(f"Image generation task scheduled for quest {quest_id} with prompt: {request_data.prompt[:50]}...")
    return {"message": "Image generation request received."}


# --- Guide/Persona Endpoints ---

@app.get("/guide", response_model=schemas.GuideResponse)
async def get_user_guide(current_user: User = Depends(auth.get_current_user)):
    """Retrieves the custom guide prompt for the logged-in user."""
    user_id = str(current_user.id)
    try:
        # Fetch user metadata using the admin client (service key)
        response = clients.supabase_client.auth.admin.get_user_by_id(user_id)
        user_data = response.user
        if not user_data or not user_data.user_metadata:
            return schemas.GuideResponse(prompt=None)
        prompt = user_data.user_metadata.get("custom_guide_prompt")
        logging.info(f"Retrieved guide prompt for user {user_id}: {'Exists' if prompt else 'None'}")
        return schemas.GuideResponse(prompt=prompt)
    except Exception as e:
        logging.exception(f"Error fetching guide for user {user_id}:")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve guide information")

@app.put("/guide", response_model=schemas.GuideResponse)
async def update_user_guide(
    guide_data: schemas.GuideUpdateRequest,
    current_user: User = Depends(auth.get_current_user)
):
    """Updates the custom guide prompt for the logged-in user."""
    user_id = str(current_user.id)
    new_prompt = guide_data.prompt
    try:
        # Update user metadata using the admin client (service key)
        response = clients.supabase_client.auth.admin.update_user_by_id(
            user_id, {"user_metadata": {"custom_guide_prompt": new_prompt}}
        )
        updated_user = response.user
        if not updated_user or not updated_user.user_metadata or updated_user.user_metadata.get("custom_guide_prompt") != new_prompt:
             logging.error(f"Failed to verify guide update for user {user_id}. Response: {response}")
             raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update guide information")
        logging.info(f"Successfully updated guide prompt for user {user_id}")
        return schemas.GuideResponse(prompt=new_prompt)
    except Exception as e:
        logging.exception(f"Error updating guide for user {user_id}:")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update guide information")


# --- Quest Deletion Endpoint ---

@app.delete("/quests/{quest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_single_quest(
    quest_id: uuid.UUID,
    current_user: User = Depends(auth.get_current_user)
):
    """
    Deletes a specific quest and all its associated messages for the logged-in user.
    """
    user_id = str(current_user.id)
    success = await database.delete_quest(user_id=user_id, quest_id=quest_id)
    if not success:
        # Although delete_quest logs specifics, raise a generic error here
        # Or check if quest existed first with get_quest_by_id if 404 is desired
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete quest")
    # No content returned on successful deletion
    return


# TODO: Add endpoint or mechanism (like WebSockets) to stream AI response back to frontend