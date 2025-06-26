import os
import asyncio
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from pymongo import MongoClient
from bson import ObjectId
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm

import nltk
from nltk.sentiment import SentimentIntensityAnalyzer
from motor.motor_asyncio import AsyncIOMotorClient
import google.generativeai as genai

from dotenv import load_dotenv
load_dotenv()

# Download VADER lexicon
nltk.download("vader_lexicon")

# ---------------------------
# Configuration & Initialization
# ---------------------------
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

# --- Synchronous MongoDB for Users ---
database_url = os.getenv("DATABASE_URL")
client_sync = MongoClient(database_url)
db_sync = client_sync["chatbot_db"]
users_collection = db_sync["users"]

# --- Asynchronous MongoDB for Chats ---
MONGO_URL = os.getenv("MONGO_URL")
client_async = AsyncIOMotorClient(MONGO_URL)
db_async = client_async["chatbot_db"]
chats_collection = db_async["chats"]

# --- Gemini Configuration ---
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
model = genai.GenerativeModel('gemini-2.0-flash')

# --- Initialize FastAPI app and Sentiment Analyzer ---
app = FastAPI()
sia = SentimentIntensityAnalyzer()

# Add this after creating your FastAPI app instance (app = FastAPI())
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://virtual-ai-therapist-chatbot.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Authorization"],  # Explicitly allow Authorization header
)

# --- Password Hashing ---
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user = users_collection.find_one({"email": email})
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        return {"id": str(user["_id"]), "name": user["name"], "email": user["email"]}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# ---------------------------
# Pydantic Models
# ---------------------------
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserResponseSignup(BaseModel):
    id: str
    name: str
    email: str

class ChatMessage(BaseModel):
    message: str = None  # Optional for the initial greeting

# ---------------------------
# User Endpoints: Signup, Login, Protected
# ---------------------------
@app.post("/signup", response_model=UserResponseSignup)
def signup(user: UserCreate):
    existing_user = users_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(user.password)
    user_data = {"name": user.name, "email": user.email, "password": hashed}
    result = users_collection.insert_one(user_data)
    return {"id": str(result.inserted_id), "name": user.name, "email": user.email}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends()):
    user = users_collection.find_one({"email": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    # Print user info for debugging
    print(f"Login request for: {form_data.username}")
    print(f"User found: {user}")
    print(f"User name: {user.get('name', 'NOT FOUND')}")
    
    # Make sure name field exists
    user_name = user.get("name", form_data.username.split('@')[0])  # Default to username if name not found
    
    access_token = create_access_token({"sub": user["email"]}, timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "name": user_name  # Include the user's name in the response
    }

@app.post("/reset-on-login")
async def reset_on_login(current_user: dict = Depends(get_current_user)):
    """Reset the user's chat state to greeting when they log in"""
    user_id = current_user["id"]
    username = current_user["name"]
    
    # Update any existing chat sessions to reset to greeting state
    # Add a special flag force_greeting that will be checked in chat_handler
    await chats_collection.update_many(
        {"user_id": user_id},
        {
            "$set": {
                "state": "greeting",
                "history": [],
                "mood": None,
                "issue": None,
                "followup_count": 0,
                "force_greeting": True  # Special flag to ensure greeting is shown
            }
        }
    )
    
    # Check if this is a returning user (had previous sessions)
    previous_sessions = await chats_collection.find(
        {"user_id": user_id}
    ).to_list(length=100)
    
    is_returning = len(previous_sessions) > 1  # More than just the session we just reset
    
    # If no sessions exist at all, create one
    if len(previous_sessions) == 0:
        new_chat = {
            "user_id": user_id,
            "username": username,
            "state": "greeting",
            "mood": None,
            "issue": None,
            "followup_count": 0,
            "history": [],
            "is_returning": is_returning,
            "is_new_user": len(previous_sessions) == 0,
            "force_greeting": True,  # Force greeting for new users too
            "created_at": datetime.now(timezone.utc)
        }
        await chats_collection.insert_one(new_chat)
    
    return {"message": "Chat state reset to greeting", "is_returning": is_returning}

@app.get("/protected")
def protected_route(user: dict = Depends(get_current_user)):
    return {"message": "You are authenticated", "user": user}

@app.post("/reset-chat")
async def reset_chat(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    username = current_user["name"]
    
    # Delete all previous chat sessions for this user
    await chats_collection.delete_many({"user_id": user_id})
    
    # Create a new chat session with empty history
    new_chat = {
        "user_id": user_id,
        "username": username,
        "state": "greeting",
        "mood": None,
        "issue": None,
        "followup_count": 0,
        "history": [],
        "is_returning": False,  # Set to False as we're starting fresh
        "created_at": datetime.now(timezone.utc)
    }
    
    # Insert the new session
    await chats_collection.insert_one(new_chat)
    
    # Return success message
    return {"message": "Chat history deleted and new session started"}

@app.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    
    # Clear the user's current chat state
    # We'll update any existing chat session to reset its state to "greeting"
    # and empty the history
    await chats_collection.update_many(
        {"user_id": user_id},
        {
            "$set": {
                "state": "greeting",
                "history": [],
                "mood": None,
                "issue": None,
                "followup_count": 0
            }
        }
    )
    
    return {"message": "Logged out successfully, chat state cleared"}

# ---------------------------
# Chat Helpers for Conversation Flow
# ---------------------------
async def get_chat_session(user_id: str, username: str) -> dict:
    # Check if this user is a completely new user (no sessions at all)
    all_user_sessions = await chats_collection.find({"user_id": user_id}).to_list(length=1)
    is_completely_new_user = len(all_user_sessions) == 0
    
    # Get current active chat session
    chat = await chats_collection.find_one({"user_id": user_id})
    
    if not chat:
        # Check if this user has had previous sessions that were completed
        previous_sessions = await chats_collection.find(
            {"user_id": user_id, "state": {"$ne": "greeting"}}
        ).to_list(length=1)
        
        is_returning = len(previous_sessions) > 0
        
        chat = {
            "user_id": user_id,
            "username": username,
            "state": "greeting",   # Possible states: greeting, mood, issue, followup, final
            "mood": None,
            "issue": None,
            "followup_count": 0,
            "history": [],
            "is_returning": is_returning,
            "is_new_user": is_completely_new_user,
            "created_at": datetime.now(timezone.utc)
        }
        result = await chats_collection.insert_one(chat)
        chat["_id"] = result.inserted_id
    
    # Check if the chat was just created (has no history)
    # This happens after a reset or for first-time users
    if not chat.get("history"):
        # Force the state to greeting to trigger the welcome message
        if chat.get("state") != "greeting":
            chat["state"] = "greeting"
            await update_chat_session(user_id, {"state": "greeting"})
    
    return chat

async def update_chat_session(user_id: str, update_data: dict):
    await chats_collection.update_one({"user_id": user_id}, {"$set": update_data}, upsert=True)

async def generate_followup_question(issue: str, mood: str, history: list) -> str:
    prompt = (
        f"You are a highly empathetic virtual therapist. The user is feeling {mood} and is dealing with the issue: '{issue}'. "
        f"The conversation history so far is: {history}. "
        f"Continue the conversation in a gentle, supportive, and very polite way. Instead of asking direct questions, use statements or gentle reflections that encourage the user to share more, as a real therapist would. Do not use question marks. Do not thank the user for sharing. Respond as if you are sympathizing and inviting them to open up further."
    )
    response = model.generate_content(prompt)
    return response.text.strip()

async def generate_final_solution(history: list) -> str:
    try:
        prompt = (f"You are a virtual therapist. Based on the following conversation history, "
                    f"provide a final summary and practical suggestions to help the user: {history},"
                    f"also make sure the formatting is correct of the response")
        
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"Error generating final solution: {e}")
        # Return a fallback solution to avoid rendering errors
        return "Thank you for sharing your thoughts with me. Here's a summary of our conversation and some practical suggestions that might help you move forward."
 
# ---------------------------
# Chat Endpoint: Conversation Flow
# ---------------------------
@app.get("/")
def root():
    return {"message": "Hello Humans"}

@app.post("/chat")
async def chat_handler(chat: ChatMessage, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    username = current_user["name"]
    
    # Check if user has previous completed chat sessions (returning user)
    previous_sessions = await chats_collection.find(
        {"user_id": user_id, "state": {"$ne": "greeting"}}
    ).to_list(length=100)
    
    is_returning_user = len(previous_sessions) > 0
    
    # Get or create the current chat session
    chat_session = await get_chat_session(user_id, username)
    
    # Check if we should force a greeting (user just logged in)
    force_greeting = chat_session.get("force_greeting", False)
    
    # If force_greeting is True, override the state to greeting
    if force_greeting:
        chat_session["state"] = "greeting"
        # Clear the force_greeting flag so it only happens once
        await update_chat_session(user_id, {"force_greeting": False})
    
    # Always reset to greeting state for a new session if the user is returning
    if is_returning_user and chat_session.get("state") == "greeting" and not chat_session.get("history"):
        await update_chat_session(user_id, {"state": "greeting", "is_returning": True})
        chat_session["is_returning"] = True
    
    state = chat_session.get("state", "greeting")
    history = chat_session.get("history", [])
    
    # State: Greeting – if no message is provided or force_greeting is True, greet the user
    if state == "greeting" and (force_greeting or chat.message is None or (chat.message and chat.message.strip() == "")):
        if is_returning_user or chat_session.get("is_returning"):
            greeting_msg = f"Hello, I am CareMind, your personal healthcare companion. Welcome back, {username}! It's great to see you again. How have you been since our last session?"
        elif chat_session.get("is_new_user"):
            greeting_msg = f"Hello {username}, I am CareMind, your personal healthcare companion. I'm here to provide a safe space for you to share your thoughts and feelings. How are you feeling today?"
        else:
            greeting_msg = f"Hey {username}, How are you feeling today?"
        
        # Create a new history if force_greeting is True
        if force_greeting:
            history = []
            
        history.append({"role": "bot", "state": "greeting", "message": greeting_msg})
        
        # Critical change: DON'T update state to mood yet
        # Keep it in greeting state until the user responds with their mood
        # Only update the history, not the state
        await update_chat_session(user_id, {"history": history})
        return {"message": greeting_msg}
    
    # State: Greeting with user response – transition to mood state
    if state == "greeting" and chat.message and chat.message.strip():
        # User has responded to the greeting, now transition to mood state
        user_response = chat.message.strip()
        history.append({"role": "user", "state": "greeting_response", "message": user_response})
        
        # Now perform sentiment analysis as we move to mood state
        sentiment_scores = sia.polarity_scores(user_response)
        mood = "neutral"
        if sentiment_scores["compound"] >= 0.05:
            mood = "positive"
        elif sentiment_scores["compound"] <= -0.05:
            mood = "negative"
             
        mood_msg = f"I see you're feeling {mood}. Can you please share what is bothering you today?"
        history.append({"role": "bot", "state": "issue_prompt", "message": mood_msg})
        
        # Now transition to issue state
        await update_chat_session(user_id, {"state": "issue", "mood": mood, "history": history})
        return {"message": mood_msg}
    
    # State: Mood – perform sentiment analysis on user's response
    # This state is now deprecated but kept for backward compatibility
    if state == "mood":
        user_response = chat.message.strip() if chat.message else ""
        sentiment_scores = sia.polarity_scores(user_response)
        mood = "neutral"
        if sentiment_scores["compound"] >= 0.05:
            mood = "positive"
        elif sentiment_scores["compound"] <= -0.05:
            mood = "negative"
        history.append({"role": "user", "state": "mood", "message": user_response})
        mood_msg = f"Got it {username}, I see you're feeling {mood}. Can you please share what is bothering you today?"
        history.append({"role": "bot", "state": "issue_prompt", "message": mood_msg})
        await update_chat_session(user_id, {"state": "issue", "mood": mood, "history": history})
        return {"message": mood_msg}
    
    # State: Issue – capture user's core issue
    if state == "issue":
        user_issue = chat.message.strip() if chat.message else ""
        history.append({"role": "user", "state": "issue", "message": user_issue})
        # Generate empathetic validation message
        validation_prompt = (
            f"The user has shared the following issue: '{user_issue}'. "
            f"Respond as a supportive virtual therapist by validating their feelings and showing empathy. "
            f"Do not offer solutions or ask follow-up questions yet. Just acknowledge and validate their experience in a warm, human way."
        )
        response = model.generate_content(validation_prompt)
        validation_message = response.text.strip()
        history.append({"role": "bot", "state": "empathetic_validation", "message": validation_message})
        await update_chat_session(user_id, {"state": "empathetic_validation", "issue": user_issue, "history": history})
        return {"message": validation_message}

    # State: Empathetic Validation – after validation, move to followup
    if state == "empathetic_validation":
        user_response = chat.message.strip() if chat.message else ""
        history.append({"role": "user", "state": "empathetic_validation_response", "message": user_response})
        # Now proceed to followup (cross-questioning)
        question = await generate_followup_question(chat_session.get("issue"), chat_session.get("mood"), history)
        history.append({"role": "bot", "state": "followup", "message": question})
        await update_chat_session(user_id, {"state": "followup", "history": history})
        return {"message": question}
    
    # State: Followup – iterative conversation rounds
    if state == "followup":
        history.append({"role": "user", "state": "followup_response", "message": chat.message.strip() if chat.message else ""})
        followup_count = chat_session.get("followup_count", 0) + 1
        if followup_count <= 3:
            question = await generate_followup_question(chat_session.get("issue"), chat_session.get("mood"), history)
            history.append({"role": "bot", "state": "followup", "message": question})
            await update_chat_session(user_id, {"state": "followup", "followup_count": followup_count, "history": history})
            return {"message": question}
        else:
            final_solution = await generate_final_solution(history)
            history.append({"role": "bot", "state": "final", "message": final_solution})
            # When reaching final state, user is no longer a new user
            await update_chat_session(user_id, {
                "state": "final", 
                "history": history,
                "is_new_user": False  # Set is_new_user to False when reaching final state
            })
            return {"message": final_solution}
    
    # State: Final – restart conversation automatically by asking for new issue
    if state == "final":
        restart_msg = f"Our session is completed, {username}. You can start a New Chat or Is there anything else on your mind regarding the above situation that you'd like to discuss? I'm here to help."
        # Reset state to "issue" and reset followup count
        history.append({"role": "bot", "state": "issue_prompt", "message": restart_msg})
        # Ensure is_new_user remains False in new conversations
        await update_chat_session(user_id, {
            "state": "issue", 
            "followup_count": 0, 
            "history": history,
            "is_new_user": False  # Maintain is_new_user as False
        })
        return {"message": restart_msg}
    
    return {"message": "I'm not sure how to proceed. Let's try again."}