import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:8000';

function Research() {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isResearching, setIsResearching] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('');
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingSteps]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadSessions = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/research/sessions`);
      const data = await response.json();
      setSessions(data);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const loadSession = async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/api/research/sessions/${sessionId}`);
      const data = await response.json();
      setCurrentSession(data);
      setMessages(data.messages);
      setThinkingSteps([]);
      setCurrentStatus('');
      setAwaitingClarification(false);
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const createNewSession = async () => {
    if (!inputMessage.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/research/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initial_query: inputMessage })
      });

      const session = await response.json();
      setCurrentSession(session);
      setMessages([{ role: 'user', content: inputMessage, created_at: new Date() }]);
      setInputMessage('');
      setThinkingSteps([]);
      setAwaitingClarification(false);

      // Start research stream
      startResearchStream(session.id);
      loadSessions();
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentSession) return;

    try {
      await fetch(`${API_BASE}/api/research/sessions/${currentSession.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputMessage })
      });

      setMessages(prev => [...prev, { role: 'user', content: inputMessage, created_at: new Date() }]);
      setInputMessage('');
      setAwaitingClarification(false);

      // Start research stream
      startResearchStream(currentSession.id);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const startResearchStream = (sessionId) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsResearching(true);
    setThinkingSteps([]);
    setCurrentStatus('Initializing...');

    const eventSource = new EventSource(`${API_BASE}/api/research/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setCurrentStatus(data.message || data.status);
    });

    eventSource.addEventListener('clarification', (e) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, created_at: new Date() }]);
      setAwaitingClarification(true);
    });

    eventSource.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      setThinkingSteps(prev => [...prev, { type: 'thinking', text: data.text }]);
    });

    eventSource.addEventListener('web_search', (e) => {
      const data = JSON.parse(e.data);
      setThinkingSteps(prev => [...prev, { type: 'search', text: `Searching: ${data.query}` }]);
    });

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: data.report, created_at: new Date() }]);
      setCurrentStatus('Research completed!');
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setIsResearching(false);

      if (data.status === 'awaiting_response') {
        setCurrentStatus('Awaiting your response...');
      } else {
        setCurrentStatus('');
      }

      eventSource.close();
      loadSessions();
      loadSession(sessionId);
    });

    eventSource.addEventListener('error', (e) => {
      console.error('SSE error:', e);
      const data = e.data ? JSON.parse(e.data) : {};
      setCurrentStatus(`Error: ${data.error || 'Connection failed'}`);
      setIsResearching(false);
      eventSource.close();
    });

    eventSource.onerror = () => {
      setIsResearching(false);
      eventSource.close();
    };
  };

  const downloadResult = async (sessionId) => {
    window.open(`${API_BASE}/api/research/sessions/${sessionId}/download`, '_blank');
  };

  const clearConversation = () => {
    setCurrentSession(null);
    setMessages([]);
    setThinkingSteps([]);
    setCurrentStatus('');
    setAwaitingClarification(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
  };

  const deleteSession = async (sessionId) => {
    if (!confirm('Delete this research session?')) return;

    try {
      await fetch(`${API_BASE}/api/research/sessions/${sessionId}`, {
        method: 'DELETE'
      });

      if (currentSession?.id === sessionId) {
        clearConversation();
      }

      loadSessions();
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (currentSession) {
        sendMessage();
      } else {
        createNewSession();
      }
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left Panel - Conversation */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            {currentSession ? currentSession.title : 'Deep Research'}
          </h2>
          {currentSession && (
            <button
              onClick={clearConversation}
              className="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              New Research
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !currentSession && (
            <div className="text-center py-12">
              <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
                Start a Deep Research
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Ask anything and I'll conduct thorough research with web searches and analysis
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl px-4 py-3 rounded-lg ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {isResearching && currentStatus && (
            <div className="flex justify-center">
              <div className="px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-lg">
                {currentStatus}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t dark:border-gray-700">
          <div className="flex gap-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                currentSession
                  ? 'Send a follow-up message...'
                  : 'What would you like to research?'
              }
              className="flex-1 px-4 py-2 border dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-white resize-none"
              rows="3"
              disabled={isResearching}
            />
            <button
              onClick={currentSession ? sendMessage : createNewSession}
              disabled={!inputMessage.trim() || isResearching}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isResearching ? 'Researching...' : currentSession ? 'Send' : 'Start'}
            </button>
          </div>
          {currentSession && messages.length > 0 && (
            <button
              onClick={() => downloadResult(currentSession.id)}
              disabled={!currentSession.has_result}
              className="mt-2 px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Download Result (.txt)
            </button>
          )}
        </div>
      </div>

      {/* Right Panel - Thinking & History */}
      <div className="w-96 flex flex-col gap-4">
        {/* Thinking Panel */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Thinking Process
          </h3>

          {isResearching && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="bg-indigo-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }}></div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Research in progress...</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {thinkingSteps.map((step, idx) => (
              <div
                key={idx}
                className={`p-2 rounded text-sm ${
                  step.type === 'search'
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {step.type === 'search' && (
                  <span className="font-semibold mr-1">🔍</span>
                )}
                {step.text}
              </div>
            ))}
          </div>
        </div>

        {/* History Panel */}
        <div className="h-64 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Research History
          </h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-2 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1" onClick={() => loadSession(session.id)}>
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {session.title}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(session.created_at).toLocaleDateString()}
                    </div>
                    {session.has_result && (
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">
                        Completed
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 dark:text-red-400"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Research;
