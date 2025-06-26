// services/api.js
import axios from 'axios';
 
const API_BASE_URL = 'https://virtual-ai-therapist-chatbot.onrender.com';

// Create an axios instance with default configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  // Increase timeout to 30 seconds
  timeout: 30000, // 30 seconds timeout
});

// Request interceptor to add auth token when available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;  // Make sure to add 'Bearer ' prefix
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return Promise.reject(error);
  }
);

// Update the login function to store the token
export const login = async (username, password) => {
  try {
    const formParams = new URLSearchParams();
    formParams.append('username', username);
    formParams.append('password', password);
    
    const response = await api.post('/login', formParams, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Store the token in localStorage
    if (response.data.access_token) {
      localStorage.setItem('token', response.data.access_token);
    }
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// Update initiateChat with longer timeout
export const initiateChat = async () => {
  try {
    return await api.post('/chat', {}, {
      timeout: 30000  // 30 seconds timeout for initial chat
    });
  } catch (error) {
    console.error('Error initiating chat:', error);
    throw error;
  }
};

// Update sendMessage function with a longer timeout
export const sendMessage = async (message) => {
  try {
    return await api.post('/chat', { message }, {
      timeout: 45000  // 45 seconds timeout for chat messages
    });
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

export const resetChat = async () => {
  return api.post('/reset-chat');
};

export const logout = async () => {
  try {
    // Call the backend logout endpoint to clear chat state
    await api.post('/logout');
    return true;
  } catch (error) {
    console.error('Error during logout:', error);
    return false;
  }
};

// Update resetOnLogin to include error handling
export const resetOnLogin = async () => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No token found');
    }
    
    const response = await api.post('/reset-on-login', {}, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error resetting chat on login:', error);
    throw error;
  }
};

export default api; 