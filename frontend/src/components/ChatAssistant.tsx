import React, { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  text: string;
  sender: 'ai' | 'user';
  timestamp: Date;
}

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

const ChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      text: "Hello! I'm Homer Baba, your SimPredict guide. 🔮 How can I help you today?",
      sender: 'ai',
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/assistant/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });

      const result = await response.json();
      
      if (result.status === 'success') {
        const aiMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: result.data.answer,
          sender: 'ai',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error('Failed to get answer');
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm having trouble connecting to my brain right now. Please try again later! 🔮",
        sender: 'ai',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="chat-assistant-container">
      {isOpen && (
        <div className="chat-window">
          <div className="chat-header">
            <div className="chat-bubble active" onClick={() => setIsOpen(false)} style={{ width: 40, height: 40, fontSize: '1.2rem', boxShadow: 'none' }}>
              ✕
            </div>
            <div className="chat-header-info">
              <h4>Homer Baba Assistant</h4>
              <p>● Always Online</p>
            </div>
          </div>
          
          <div className="chat-messages">
            {messages.map((m) => (
              <div key={m.id} className={`chat-message ${m.sender}`}>
                {m.text}
              </div>
            ))}
            {isLoading && (
              <div className="chat-message ai" style={{ opacity: 0.7 }}>
                Homer is thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              placeholder="Ask anything about SimPredict..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
            />
            <button 
              className="chat-send-btn" 
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              ➔
            </button>
          </div>
        </div>
      )}
      
      {!isOpen && (
        <div className="chat-bubble" onClick={() => setIsOpen(true)}>
          🔮
        </div>
      )}
    </div>
  );
};

export default ChatAssistant;
