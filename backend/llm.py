import google.generativeai as genai
from typing import List, Dict, Any, Union, Optional
import schemas
import database
import clients
import uuid
from datetime import datetime, timezone
import logging
import httpx
import mimetypes
import io
import random
import base64
import json

# --- Default System Prompt (Fallback) ---
DEFAULT_SYSTEM_PROMPT = """**Role**: You are a nurturing parent guiding a curious child (age 6–12) in a dialogue. Your goal is to foster critical thinking and sustained curiosity.

**Style**:
- **Conversational**: Use simple words, contractions ("Let's", "don't"). Aim for around 3-6 sentences when explaining something new, shorter otherwise.
- **Playful**: Sprinkle humor and enthusiasm ("Ooh, great thought! What if...?").
- **Topic Exploration**: Gradually explore related subtopics (e.g., from "why stars twinkle" to "how telescopes work" to "alien life").

**Core Principles**:
1. **Explain then Prompt**: When explaining a concept, provide a clear but concise explanation (3-6 sentences), then *always* ask a question to encourage interaction or check understanding. For simple acknowledgements or confirmations, keep it very short (1-2 sentences) before asking.
2. **Scaffolding**: Build on the child's last idea. "You mentioned [X]—how does that connect to [Y]?"
3. **Branching**: Introduce new angles of the topic naturally. "That's about [A]! Did you know [B] is also part of this?"

**Rules**:
1. **Start with the child's interest**:
   - If they mention dinosaurs: "Great question! Let's imagine a T-Rex trying to [topic]..."
2. **Balance Explanation & Interaction**: Don't just give facts. Explain clearly (3-6 sentences if needed), then immediately ask a related question. Avoid long paragraphs.
3. **Prolong the dialogue**:
   - After explaining, ask: "Does that make sense? What part sounds most interesting?" or "Should we explore [subtopic 1] or [subtopic 2] next?"
   - Use their answers to branch deeper: "You said [child's idea]—what happens if we change [variable]?"
4. **Metaphors & examples**: Tie ideas to their world: "Clouds are like sponges. What happens when they get too full?"

**Example Flow**:
Child: "Why is the sky blue?"
Parent:
1. "Awesome question! What color do you think it is on Mars? *(Assess knowledge)*"
2. (After child guesses) "It's red there! On Earth, sunlight plays a game—imagine it's a ball bouncing off air! *(Metaphor)*"
3. "Want to explore how light bends or why sunsets are red? *(Branching)*"
"""

# Use the configured Gemini client
chat_model = genai.GenerativeModel('gemini-2.0-flash')
embedding_model_name = 'text-embedding-004'

# --- Embedding Generation (keep existing code) ---
async def generate_embedding(text_content: str) -> Optional[List[float]]:
    try:
        if not text_content or text_content.isspace(): return None
        result = await genai.embed_content_async(model=f"models/{embedding_model_name}", content=text_content, task_type="RETRIEVAL_DOCUMENT")
        if 'embedding' in result and isinstance(result['embedding'], list): return result['embedding']
        else: logging.error(f"Failed to generate valid embedding. API Result: {result}"); return None
    except Exception as e: logging.exception(f"Error generating embedding for content: {text_content[:50]}..."); return None

# --- Helper Functions for Multimodal (keep existing code) ---
async def fetch_image_data(image_url: str) -> Optional[Dict[str, Any]]:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url, follow_redirects=True); response.raise_for_status()
            image_bytes = response.content
            mime_type = mimetypes.guess_type(image_url)[0] or response.headers.get('content-type')
            if not mime_type or not mime_type.startswith('image/'): logging.error(f"Invalid mime type for URL: {image_url}"); return None
            return { "mime_type": mime_type, "data": image_bytes }
    except Exception as e: logging.exception(f"Failed to fetch image data from URL: {image_url}"); return None

async def format_content_for_gemini(content: Any) -> List[Dict[str, Any]]:
    parts = []
    if isinstance(content, str): parts.append({'text': content})
    elif isinstance(content, list):
        for item in content:
            if isinstance(item, dict):
                if item.get('type') == 'text' and item.get('text'): parts.append({'text': item.get('text')})
                elif item.get('type') == 'image_url' and isinstance(item.get('image_url'), dict) and item['image_url'].get('url'):
                    image_url = item['image_url']['url']; logging.info(f"Fetching image data for URL: {image_url}")
                    image_data = await fetch_image_data(image_url)
                    if image_data: parts.append({'inline_data': image_data})
                    else: parts.append({'text': '[Image could not be loaded]'})
            else: parts.append({'text': str(item)})
    else: parts.append({'text': str(content)})
    return parts

def format_history_for_gemini(db_messages: List[schemas.Message]) -> List[Dict[str, Any]]:
    history = []
    for msg in db_messages:
        role = msg.role; text_content = extractTextContent(msg.content)
        if text_content: history.append({'role': role, 'parts': [{'text': text_content}]})
    return history

# --- Suggestion Generation (keep existing code) ---
async def generate_followup_suggestions(history: List[Dict[str, Any]], latest_response: str) -> List[str]:
    suggestion_prompt = [*history, {'role': 'model', 'parts': [{'text': latest_response}]}, {'role': 'user', 'parts': [{'text': "Based on our conversation and my last response, suggest 3 brief, relevant follow-up questions a curious child might ask next. Format the response ONLY as a JSON list of strings, like: [\"Question 1?\", \"Question 2?\", \"Question 3?\"]"}]}]
    try:
        logging.info("Generating follow-up suggestions...")
        suggestion_response = await chat_model.generate_content_async(suggestion_prompt, generation_config=genai.types.GenerationConfig(response_mime_type="application/json"))
        raw_json = suggestion_response.text.strip().lstrip('```json').rstrip('```').strip()
        suggestions = json.loads(raw_json)
        if isinstance(suggestions, list) and all(isinstance(s, str) for s in suggestions): logging.info(f"Generated suggestions: {suggestions}"); return suggestions[:4]
        else: logging.error(f"Suggestion response not valid JSON list: {raw_json}"); return []
    except Exception as e: logging.exception("Error generating suggestions:"); return []

# --- Function to get effective system prompt ---
def get_system_prompt(user_id: str) -> str:
    """Fetches custom prompt from user metadata, falls back to default."""
    try:
        # Use admin client to get metadata (synchronous)
        response = clients.supabase_client.auth.admin.get_user_by_id(user_id)
        user_data = response.user
        custom_prompt = user_data.user_metadata.get("custom_guide_prompt") if user_data and user_data.user_metadata else None

        if custom_prompt and isinstance(custom_prompt, str) and custom_prompt.strip():
            logging.info(f"Using custom guide prompt for user {user_id}.")
            return custom_prompt.strip()
        else:
            logging.info(f"Using default system prompt for user {user_id}.")
            return DEFAULT_SYSTEM_PROMPT
    except Exception as e:
        logging.exception(f"Error fetching custom prompt for user {user_id}, using default.")
        return DEFAULT_SYSTEM_PROMPT


# --- Main AI Response Generation ---
async def generate_ai_response(user_id: str, quest_id: uuid.UUID):
    logging.info(f"Generating AI response for Quest {quest_id}")
    try:
        messages_db = await database.get_messages_by_quest(user_id, quest_id)
        if not messages_db: return logging.warning(f"No messages for Quest {quest_id}.")
        latest_user_message = next((msg for msg in reversed(messages_db) if msg.role == 'user'), None)
        if not latest_user_message: return logging.warning(f"No user message for Quest {quest_id}.")

        # --- Prepare Context (keep existing logic) ---
        latest_user_content_text = extractTextContent(latest_user_message.content)
        query_embedding = await generate_embedding(latest_user_content_text)
        relevant_messages: List[schemas.Message] = []
        if query_embedding: relevant_messages = await database.find_relevant_messages(quest_id=quest_id, query_embedding=query_embedding, match_threshold=0.75, match_count=3)
        else: logging.warning(f"No query embedding for quest {quest_id}, skipping similarity search.")
        recent_messages = messages_db[-3:]
        combined_context_ids = set(); context_messages_for_history: List[schemas.Message] = []
        for msg in relevant_messages:
            if msg.id not in combined_context_ids: context_messages_for_history.append(msg); combined_context_ids.add(msg.id)
        for msg in recent_messages:
             if msg.id not in combined_context_ids: context_messages_for_history.append(msg); combined_context_ids.add(msg.id)
        MAX_CONTEXT_MSGS = 7
        if len(context_messages_for_history) > MAX_CONTEXT_MSGS: context_messages_for_history = context_messages_for_history[-MAX_CONTEXT_MSGS:]
        logging.info(f"Using {len(context_messages_for_history)} messages (text only) as history context.")
        formatted_history = format_history_for_gemini(context_messages_for_history) # Text only history

        # --- Prepare Latest User Input (Potentially Multimodal) ---
        latest_user_parts = await format_content_for_gemini(latest_user_message.content)
        if not latest_user_parts: return logging.warning(f"Could not format latest user message parts.")

        # --- Construct Final Prompt with System Instruction ---
        # Fetch the effective system prompt (custom or default)
        effective_system_prompt = get_system_prompt(user_id) # Call the new function

        final_prompt = [
            {'role': 'user', 'parts': [{'text': effective_system_prompt}]}, # Use fetched prompt
            {'role': 'model', 'parts': [{'text': "Understood. I'm ready to guide the child."}]},
        ]
        history_to_append = formatted_history
        if history_to_append and history_to_append[0]['role'] == 'user': history_to_append = history_to_append[1:]
        last_role = 'model'
        for msg in history_to_append:
            if msg['role'] == last_role: logging.warning(f"Skipping message due to non-alternating role: {msg}"); continue
            final_prompt.append(msg); last_role = msg['role']
        if final_prompt[-1]['role'] == 'user': final_prompt.append({'role': 'model', 'parts': [{'text': "Okay."}]})
        final_prompt.append({'role': 'user', 'parts': latest_user_parts})

        # --- Call Gemini API for Main Response ---
        logging.info(f"Calling Gemini chat model for Quest {quest_id}...")
        response = await chat_model.generate_content_async(final_prompt)
        ai_response_text = response.text
        logging.info(f"Gemini response generated: {ai_response_text[:100]}...")

        # --- Call Gemini API for Suggestions ---
        history_for_suggestions = formatted_history
        if not any(p.get('text') == latest_user_content_text for p in history_for_suggestions[-1].get('parts',[])):
             history_for_suggestions.append({'role': 'user', 'parts': [{'text': latest_user_content_text}]})
        suggestions = await generate_followup_suggestions(history_for_suggestions, ai_response_text)

        # --- Save Response ---
        ai_response_embedding = await generate_embedding(ai_response_text)
        metadata = {"suggestions": suggestions} if suggestions else None
        await database.add_message(user_id=user_id, quest_id=quest_id, role="model", content=ai_response_text, embedding=ai_response_embedding, metadata=metadata)
        logging.info(f"AI response, embedding, and suggestions saved for Quest {quest_id}")

    except Exception as e:
        logging.exception(f"Error generating AI response for Quest {quest_id}:")

# Helper function (Corrected Python version)
def extractTextContent(content: any) -> str:
    if isinstance(content, str): return content
    if isinstance(content, list):
        text_parts = [ part.get('text', '') for part in content if isinstance(part, dict) and part.get('type') == 'text' ]
        return '\n'.join(text_parts)
    try: import json; return json.dumps(content)
    except: return ''

# --- Image Generation Logic (keep existing placeholder code) ---
async def handle_image_generation_request(user_id: str, quest_id: uuid.UUID, prompt: str):
    # ... (keep existing placeholder implementation) ...
    logging.info(f"Starting image generation for quest {quest_id} with prompt: {prompt[:50]}...")
    generated_image_url = None; error_message = None
    try:
        from PIL import Image as PILImage
        img = PILImage.new('RGB', (60, 30), color = 'red'); img_byte_arr = io.BytesIO(); img.save(img_byte_arr, format='PNG'); image_bytes = img_byte_arr.getvalue(); mime_type = "image/png"
        if image_bytes and mime_type:
            file_ext = mime_type.split('/')[-1] or 'png'; timestamp = int(datetime.now(timezone.utc).timestamp() * 1000); fileName = f"generated_{timestamp}_{random.randint(100,999)}.{file_ext}"; filePath = f"{user_id}/{fileName}"
            logging.info(f"Uploading generated image to: {filePath}")
            response = clients.supabase_client.storage.from_('quest-images').upload(filePath, image_bytes, {"content-type": mime_type})
            url_response = clients.supabase_client.storage.from_('quest-images').get_public_url(filePath)
            if isinstance(url_response, str) and url_response: generated_image_url = url_response; logging.info(f"Generated image uploaded successfully: {generated_image_url}")
            else: error_message = "Image uploaded, but failed to get public URL."; logging.error(f"{error_message} Response: {url_response}")
        else: error_message = error_message or "Image generation failed (no image data received)."
    except Exception as e: logging.exception(f"Error during image generation task for quest {quest_id}:"); error_message = f"An unexpected error occurred: {e}"
    message_content: List[Dict[str, Any]] = []; message_content.append({"type": "text", "text": f"Image generation request: \"{prompt}\""})
    if generated_image_url: message_content.append({"type": "image_url", "image_url": {"url": generated_image_url}})
    elif error_message: message_content.append({"type": "text", "text": f"Sorry, image generation failed: {error_message}"})
    else: message_content.append({"type": "text", "text": "Sorry, image generation failed unexpectedly."})
    await database.add_message(user_id=user_id, quest_id=quest_id, role="model", content=message_content, embedding=None)
    logging.info(f"Image generation result message saved for quest {quest_id}")