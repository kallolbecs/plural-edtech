import logging # Import logging module
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
import jwt # PyJWT library, needs installation
import clients # Use absolute import

# This scheme expects the token to be sent in the Authorization header
# as "Bearer <token>"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token") # tokenUrl is not actually used here

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Dependency to verify Supabase JWT token and return user data.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Log received token (partial) + type/length
    logging.info(f"Auth: Received token type: {type(token)}, length: {len(token) if isinstance(token, str) else 'N/A'}")
    if isinstance(token, str) and len(token) > 20:
        logging.info(f"Auth: Received token starting with: {token[:10]}...")
        logging.info(f"Auth: Received token ending with: ...{token[-10:]}")
    else:
         logging.warning(f"Auth: Received token looks invalid or too short: {token}")
    try:
        logging.info("Auth: Attempting clients.supabase_client.auth.get_user(token)...")
        # Use the Supabase client's auth admin interface to get user by token
        # This verifies the token against Supabase
        # Access the client via the imported 'clients' module
        # REMOVED await as get_user(jwt) is likely synchronous
        response = clients.supabase_client.auth.get_user(token)
        user = response.user
        if user is None:
            logging.error("Auth: User not found for token by Supabase.")
            raise credentials_exception
        # Log success
        logging.info(f"Auth: Token validated successfully for user: {user.id}")
        return user
    except Exception as e:
        # Log the specific exception during validation
        logging.exception(f"Auth: Exception during token validation:")
        raise credentials_exception

# Example of how to get just the user ID if needed elsewhere
async def get_current_user_id(current_user = Depends(get_current_user)) -> str:
    """Dependency that returns only the user ID."""
    if not current_user or not current_user.id:
         raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user data")
    return str(current_user.id) # Return as string, consistent with UUID handling often