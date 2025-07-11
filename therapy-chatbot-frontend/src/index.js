// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import axios from 'axios';

// Set base URL for API requests
axios.defaults.baseURL = 'https://virtual-ai-therapist-chatbot.onrender.com'; // Update this with your FastAPI server URL

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 