from pydantic import BaseModel, Field
from typing import List, Optional, Union, Dict, Any
from datetime import datetime
import uuid

# --- Quest Schemas ---

class QuestBase(BaseModel):
    """Base schema for quest data."""
    title: Optional[str] = Field(None, description="Short title/summary of the quest")
    # user_id will be inferred from the authenticated request on the backend

class QuestCreate(BaseModel):
    """Schema for creating a new quest."""
    initial_prompt: Optional[str] = Field(None, description="Initial text prompt from the user")
    # We might add initial_image_url later if starting with an image
    # user_id will be added on the backend based on auth token

class Quest(QuestBase):
    """Schema for representing a quest retrieved from the DB."""
    id: uuid.UUID = Field(..., description="Unique identifier for the quest")
    user_id: uuid.UUID = Field(..., description="ID of the user who owns the quest")
    created_at: datetime = Field(..., description="Timestamp when the quest was created")
    last_updated_at: datetime = Field(..., description="Timestamp when the quest was last updated")
    # message_count: Optional[int] = Field(None, description="Number of messages in the quest") # Temporarily commented out

    class Config:
        from_attributes = True # Allows creating Pydantic model from ORM object

# --- Message Schemas ---

class MessageBase(BaseModel):
    """Base schema for message data."""
    content: Union[str, List[Dict[str, Any]]] # Can be text or multimodal content (e.g., [{'type': 'text', 'text': '...'}, {'type': 'image_url', 'image_url': '...'}])
    role: str = Field(..., description="'user' or 'model'") # Or 'system' if needed

class MessageCreate(BaseModel):
    """Schema for creating a new message within a quest."""
    content: Union[str, List[Dict[str, Any]]] # Allow text or multimodal input from user
    # role will be 'user' for messages created via this schema
    # quest_id will be part of the URL path
    # user_id will be added on the backend based on auth token

class Message(MessageBase):
    """Schema for representing a message retrieved from the DB."""
    id: uuid.UUID = Field(..., description="Unique identifier for the message")
    quest_id: uuid.UUID = Field(..., description="ID of the quest this message belongs to")
    user_id: uuid.UUID = Field(..., description="ID of the user associated with the quest")
    created_at: datetime = Field(..., description="Timestamp when the message was created")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Optional metadata like suggestions") # Added metadata
    # Optional: Add embedding field if we retrieve it, though maybe not needed in API response
    # embedding: Optional[List[float]] = None

    class Config:
        from_attributes = True

# --- API Response Schemas ---

class QuestDetail(Quest):
    """Schema for representing a quest with its messages."""
    messages: List[Message] = Field([], description="List of messages in the quest")

class ImageGenerationRequest(BaseModel):
    """Schema for requesting image generation."""
    prompt: str = Field(..., description="Text prompt for image generation")
    # quest_id will be part of the URL path

class ImageGenerationResponse(BaseModel):
    """Schema for the response containing the generated image URL."""
    image_url: str = Field(..., description="URL of the generated image")

# --- Guide Schemas ---

class GuideUpdateRequest(BaseModel):
    """Schema for updating the user's guide prompt."""
    prompt: str = Field(..., description="The custom system prompt text")

class GuideResponse(BaseModel):
    """Schema for returning the user's guide prompt."""
    prompt: Optional[str] = Field(None, description="The custom system prompt text")