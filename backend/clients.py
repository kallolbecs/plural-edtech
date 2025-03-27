import google.generativeai as genai
from supabase import create_client, Client
import config # Use absolute import

# Initialize Supabase client (using Service Role Key for backend operations)
# Access config variables via config.VAR_NAME
supabase_client: Client = create_client(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY)

# Configure Google Generative AI
genai.configure(api_key=config.GOOGLE_API_KEY)

# You can add functions here later to get specific Gemini models if needed, e.g.:
# def get_gemini_flash_model():
#     return genai.GenerativeModel('gemini-1.5-flash-latest') # Or specific version

print("Supabase and Gemini clients configured.")