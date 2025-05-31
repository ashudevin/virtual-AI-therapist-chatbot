// components/ChatInterface.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as apiService from '../services/api';
import ReactMarkdown from 'react-markdown';
import '../App.css';

const ChatInterface = ({ onLogout, userInfo }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(userInfo);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null); // Reference to the input element
  const [typingMessage, setTypingMessage] = useState({ content: '', isComplete: true });
  const typingSpeed = 15; // Increased speed (lower value means faster typing)
  const [resetting, setResetting] = useState(false);
  const typingTimerRef = useRef(null); // Reference to store the typing timer
 
  // Update user info when the prop changes
  useEffect(() => {
    if (userInfo) {
      console.log('ChatInterface received userInfo prop:', userInfo);
      setUser(userInfo);
    }
  }, [userInfo]);
  
  // Debug user state
  useEffect(() => {
    console.log('Current user state:', user);
    const storedUser = localStorage.getItem('user');
    console.log('User from localStorage:', storedUser);
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        console.log('Parsed user from localStorage:', parsedUser);
      } catch (e) {
        console.error('Failed to parse user from localStorage:', e);
      }
    }
  }, [user]);
  
  // Function to focus the input field
  const focusInput = useCallback(() => {
    if (inputRef.current && !loading && typingMessage.isComplete) {
      inputRef.current.focus();
    }
  }, [loading, typingMessage.isComplete]);
  
  // Optimized function to handle typing animation
  const startTypingAnimation = useCallback((content, messageIndex) => {
    // Clear any existing typing timers
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    
    setTypingMessage({
      content,
      isComplete: false,
      messageIndex
    });
    
    // For long messages, use a different approach to avoid React rendering issues
    const isLongMessage = content.length > 300;
    
    if (isLongMessage) {
      // For long messages, update in larger chunks with fixed intervals
      let currentPosition = 0;
      const chunkSize = content.length > 1000 ? 30 : 15; // Larger chunks for very long messages
      
      const updateInChunks = () => {
        if (currentPosition >= content.length) {
          // Animation complete
          setMessages(prevMessages => {
            const updatedMessages = [...prevMessages];
            if (messageIndex < updatedMessages.length) {
              updatedMessages[messageIndex].displayContent = content;
            }
            return updatedMessages;
          });
          setTypingMessage(prev => ({ ...prev, isComplete: true }));
          return;
        }
        
        const nextPosition = Math.min(currentPosition + chunkSize, content.length);
        const currentChunk = content.substring(0, nextPosition);
        
        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages];
          if (messageIndex < updatedMessages.length) {
            updatedMessages[messageIndex].displayContent = currentChunk;
          }
          return updatedMessages;
        });
        
        currentPosition = nextPosition;
        typingTimerRef.current = setTimeout(updateInChunks, 20);
      };
      
      updateInChunks();
    } else {
      // For shorter messages, use character-by-character animation
      let currentPosition = 0;
      
      const updateCharByChar = () => {
        if (currentPosition >= content.length) {
          // Animation complete
          setTypingMessage(prev => ({ ...prev, isComplete: true }));
          return;
        }
        
        currentPosition++;
        const currentText = content.substring(0, currentPosition);
        
        setMessages(prevMessages => {
          const updatedMessages = [...prevMessages];
          if (messageIndex < updatedMessages.length) {
            updatedMessages[messageIndex].displayContent = currentText;
          }
          return updatedMessages;
        });
        
        typingTimerRef.current = setTimeout(updateCharByChar, typingSpeed);
      };
      
      updateCharByChar();
    }
  }, [typingSpeed]);
  
  // Memoize the initiateChatSession function to prevent unnecessary re-renders
  const initiateChatSession = useCallback(async () => {
    setLoading(true);
    try {
      // Always send an empty message to trigger the greeting state
      const response = await apiService.initiateChat();
      
      // Use the greeting message from the backend
      const welcomeMessage = response.data && response.data.message 
        ? response.data.message 
        : "Hello, how are you feeling today?";  // Fallback message if API fails
      
      // Add the bot message with empty display content first
      setMessages([{ 
        type: 'bot', 
        content: welcomeMessage,
        timestamp: new Date().toISOString(),
        displayContent: '' // Initial empty content for typing effect
      }]);
      
      // Start the typing effect after a short delay
      setTimeout(() => {
        startTypingAnimation(welcomeMessage, 0);
      }, 10);
      
    } catch (error) {
      console.error('Failed to initiate chat:', error);
      if (error.response?.status === 401) {
        onLogout();
      }
    } finally {
      setLoading(false);
    }
  }, [onLogout, startTypingAnimation]);

  // Handle resetting the chat
  const handleResetChat = async () => {
    if (loading || !typingMessage.isComplete) return;
    
    // Clear any ongoing typing animation
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    
    setResetting(true);
    setLoading(true);
    
    try {
      // Clear existing messages immediately for better UX
      setMessages([]);
      setTypingMessage({ content: '', isComplete: true });
      
      // Call the reset-chat API
      await apiService.resetChat();
      
      // Wait a short delay for the backend to process
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Start a completely new chat session
      await initiateChatSession();
    } catch (error) {
      console.error('Failed to reset chat:', error);
      
      // If there's an error, still try to start a new chat
      try {
        await initiateChatSession();
      } catch (secondError) {
        console.error('Failed to restart chat after reset error:', secondError);
      }
    } finally {
      setResetting(false);
      setLoading(false);
    }
  };
  
  // Clean up the typing timer when component unmounts
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);
          
  // Focus input after component mounts and when loading state changes
  useEffect(() => {
    if (!loading && typingMessage.isComplete) {
      focusInput();
    }
  }, [loading, typingMessage.isComplete, focusInput]);
  
  // Get user information from local storage as fallback and initialize chat
  useEffect(() => {
    // Get user info if not provided through props
    if (!user) {
      const userInfo = localStorage.getItem('user');
      console.log('Raw user info from localStorage (fallback):', userInfo);
      if (userInfo) {
        const parsedUser = JSON.parse(userInfo);
        console.log('Parsed user info (fallback):', parsedUser);
        setUser(parsedUser);
      }
    }
    
    // Always initiate a new chat session when the component mounts
    // This ensures we start with a greeting message every time
    initiateChatSession();

    // Cleanup function
    return () => {
      console.log('ChatInterface component unmounting');
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, [user, initiateChatSession]); // Include user in the dependency array

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
    // Focus the input box after scrolling
    setTimeout(() => focusInput(), 100);
  }, [messages, focusInput]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const userMessage = {
      type: 'user',
      content: input,
      displayContent: input, // User messages show immediately
      timestamp: new Date().toISOString()
    };
    
    // Add user message to the messages array
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      const response = await apiService.sendMessage(input);
      
      if (!response.data || !response.data.message) {
        throw new Error('Invalid response from server');
      }
      
      // Safely handle the response message
      const botMessageContent = typeof response.data.message === 'string' 
        ? response.data.message 
        : "I understand what you're saying. Let me think about that.";
      
      // Add the bot message with empty display content first
      setMessages(prevMessages => {
      const botMessage = {
        type: 'bot',
          content: botMessageContent,
        displayContent: '', // Start with empty content for typing effect
        timestamp: new Date().toISOString()
      };
      
        return [...prevMessages, botMessage];
      });
      
      // Start the typing animation for the new message
      setTimeout(() => {
        const newMessageIndex = messages.length + 1; // +1 for the message we just added
        startTypingAnimation(botMessageContent, newMessageIndex);
      }, 50);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Add a fallback bot message in case of error
      setMessages(prevMessages => {
        const errorMessage = {
          type: 'bot',
          content: 'I apologize, but I encountered an issue processing your message. Could you try again?',
          displayContent: 'I apologize, but I encountered an issue processing your message. Could you try again?',
          timestamp: new Date().toISOString()
        };
        return [...prevMessages, errorMessage];
      });
      
      if (error.response?.status === 401) {
        onLogout();
      }
    } finally {
      setLoading(false);
      // Refocus the input field after sending a message
      setTimeout(focusInput, 50);
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Custom renderers for markdown components
  const renderers = {
    h3: ({ children }) => {
      const text = children.toString();
      let className = "markdown-h3";
      
      if (text.includes("Summary")) {
        className += " summary-heading";
      } else if (text.includes("Practical Suggestions") || text.includes("Suggestions")) {
        className += " suggestions-heading";
      } else if (text.includes("Closing Thoughts")) {
        className += " closing-heading";
      }
      
      return <h3 className={className}>{children}</h3>;
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="logo-container">
          <div className="logo-wrapper">
            <div className="logo-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M12 2C6.486 2 2 6.486 2 12c0 5.513 4.486 10 10 10s10-4.487 10-10c0-5.514-4.486-10-10-10zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"/>
                <path d="M12 16.5c.827 0 1.5-.673 1.5-1.5s-.673-1.5-1.5-1.5-1.5.673-1.5 1.5.673 1.5 1.5 1.5zm2.5-5.5h-5c0-1.103.897-2 2-2h1c1.103 0 2 .897 2 2z"/>
              </svg>
            </div>
            <h1>CareMind</h1>
          </div>
          <p className="tagline">Your Mindful Companion</p>
        </div>
        <div className="user-info">
          <span className="user-greeting">
            <span className="greeting-prefix">Welcome,</span>
            <span className="user-name">
              {user?.name ? user.name : (user?.email ? user.email.split('@')[0] : 'Guest')}
            </span>
          </span>
          <div className="header-buttons">
            <button onClick={handleResetChat} className="reset-button" disabled={loading || resetting || !typingMessage.isComplete}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
              New Chat
            </button>
            <button onClick={onLogout} className="logout-button">Logout</button>
          </div>
        </div>
      </div>
      <div className="chat-messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.type} ${
            message.type === 'bot' && message.content === message.displayContent ? 'typing-complete' : ''
          }`}>
            <div className="message-content">
              <div className="markdown-content">
                {message.type === 'bot' ? (
                  <ReactMarkdown components={renderers}>{message.displayContent || ''}</ReactMarkdown>
                ) : (
                  <ReactMarkdown components={renderers}>{message.content}</ReactMarkdown>
                )}
              </div>
              <span className="timestamp">{formatTimestamp(message.timestamp)}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message bot">
            <div className="message-content typing">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <form onSubmit={handleSendMessage} className="chat-input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Tell CareMind how you're feeling..."
          disabled={loading || !typingMessage.isComplete}
          ref={inputRef}
        />
        <button type="submit" disabled={loading || !input.trim() || !typingMessage.isComplete}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path>
          </svg>
        </button>
      </form>
    </div>
  );
};

export default ChatInterface;