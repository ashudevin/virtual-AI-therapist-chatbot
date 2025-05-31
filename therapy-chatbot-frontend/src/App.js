// App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Signup from './components/SignUp';
import ChatInterface from './components/ChatInterface';
import LandingPage from './components/LandingPage';
import * as apiService from './services/api';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem('token') ? true : false
  );
  const [userInfo, setUserInfo] = useState(null);

  useEffect(() => {
    // Load user info when app starts
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        console.log('App loaded user from storage:', parsedUser);
        setUserInfo(parsedUser);
      } catch (e) {
        console.error('Failed to parse user info:', e);
      }
    }
  }, []);

  const handleLogin = async (token, userData) => {
    console.log('Login successful, userData:', userData);
    
    // Ensure we have a name
    if (!userData.name && userData.email) {
      userData.name = userData.email.split('@')[0]; // Use part before @ as fallback name
    }
    
    localStorage.setItem('token', token);
    if (userData) {
      localStorage.setItem('user', JSON.stringify(userData));
      setUserInfo(userData);
      console.log('User info set in App state:', userData);
    }
    setIsAuthenticated(true);
    
    // Reset chat state to greeting after successful login
    // We do this after setting isAuthenticated to true so the token is available
    try {
      await apiService.resetOnLogin();
      console.log('Chat state reset to greeting on login');
    } catch (error) {
      console.error('Failed to reset chat state on login:', error);
    }
  };

  const handleLogout = async () => {
    try {
      // Call the logout API to clear server-side state
      await apiService.logout();
    } catch (error) {
      console.error("Error during logout:", error);
    } finally {
      // Clear local storage regardless of API success/failure
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUserInfo(null);
    setIsAuthenticated(false);
    }
  };

  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={isAuthenticated ? <Navigate to="/chat" /> : <Login onLogin={handleLogin} />} />
          <Route path="/signup" element={isAuthenticated ? <Navigate to="/chat" /> : <Signup />} />
          <Route path="/chat" element={isAuthenticated ? <ChatInterface onLogout={handleLogout} userInfo={userInfo} /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;