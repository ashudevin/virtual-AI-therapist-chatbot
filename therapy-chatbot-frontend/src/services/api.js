// services/api.js
import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000';

// Create an axios instance with default configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// Request interceptor to add auth token when available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Helper functions for common API operations
export const login = async (username, password) => {
  const formParams = new URLSearchParams();
  formParams.append('username', username);
  formParams.append('password', password);
  
  return api.post('/login', formParams, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
};

export const initiateChat = async () => {
  // We send an empty message object to trigger the initial greeting
  // Using undefined allows it to be omitted from the JSON
  return api.post('/chat', {});
};

export const sendMessage = async (message) => {
  return api.post('/chat', { message });
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

export const resetOnLogin = async () => {
  try {
    // Reset the chat state when user logs in
    const response = await api.post('/reset-on-login');
    return response.data;
  } catch (error) {
    console.error('Error resetting chat on login:', error);
    return { error: true };
  }
};

export default api; 