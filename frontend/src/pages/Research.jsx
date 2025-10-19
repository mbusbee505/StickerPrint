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
  const [researchProgress, setResearchProgress] = useState(0);
  const messagesEndRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    loadSessionsAndRestoreState();

    // Cleanup function for page unload/refresh
    const handleBeforeUnload = () => {
      if (eventSourceRef.current) {
        console.log('Page unloading - closing research stream');
        eventSourceRef.current.close();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount or page navigation
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (eventSourceRef.current) {
        console.log('Component unmounting - closing research stream');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const loadSessionsAndRestoreState = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/research/sessions`);
      const data = await response.json();
      setSessions(data);

      // Auto-restore the most recent active session (but don't auto-reconnect stream)
      const activeSession = data.find(s => s.status === 'active');
      if (activeSession) {
        loadSession(activeSession.id);

        // DON'T auto-reconnect streams on page load to avoid rate limits
        // User must manually click to resume research
        console.log('Active session found, but NOT auto-reconnecting to avoid rate limits');
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

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
    // Prevent multiple simultaneous streams
    if (eventSourceRef.current) {
      console.warn('Stream already active, closing existing stream first');
      eventSourceRef.current.close();
      eventSourceRef.current = null;

      // Wait a moment for cleanup before starting new stream
      setTimeout(() => startResearchStreamInternal(sessionId), 500);
      return;
    }

    startResearchStreamInternal(sessionId);
  };

  const startResearchStreamInternal = (sessionId) => {
    console.log(`Starting research stream for session ${sessionId}`);
    setIsResearching(true);
    setThinkingSteps([]);
    setCurrentStatus('Initializing...');
    setResearchProgress(5);

    const eventSource = new EventSource(`${API_BASE}/api/research/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('status', (e) => {
      const data = JSON.parse(e.data);
      setCurrentStatus(data.message || data.status);

      // Update progress based on status
      if (data.status === 'analyzing_query') {
        setResearchProgress(10);
      } else if (data.status === 'starting_research') {
        setResearchProgress(20);
      } else if (data.status === 'researching') {
        setResearchProgress(30);
      } else if (data.status === 'finalizing') {
        setResearchProgress(90);
      }
    });

    eventSource.addEventListener('clarification', (e) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message, created_at: new Date() }]);
      setAwaitingClarification(true);
    });

    eventSource.addEventListener('thinking', (e) => {
      const data = JSON.parse(e.data);
      setThinkingSteps(prev => [...prev, { type: 'thinking', text: data.text }]);
      // Increment progress slightly with each thinking step (cap at 85%)
      setResearchProgress(prev => Math.min(prev + 2, 85));
    });

    eventSource.addEventListener('web_search', (e) => {
      const data = JSON.parse(e.data);
      setThinkingSteps(prev => [...prev, { type: 'search', text: data.query }]);
      // Increment progress with each search (cap at 85%)
      setResearchProgress(prev => Math.min(prev + 3, 85));
    });

    eventSource.addEventListener('web_page', (e) => {
      const data = JSON.parse(e.data);
      setThinkingSteps(prev => [...prev, { type: 'page', url: data.url, text: data.title }]);
      // Increment progress with each page view (cap at 85%)
      setResearchProgress(prev => Math.min(prev + 2, 85));
    });

    eventSource.addEventListener('result', (e) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, { role: 'assistant', content: data.report, created_at: new Date() }]);
      setCurrentStatus('Research completed!');
      setResearchProgress(100);
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setIsResearching(false);

      if (data.status === 'awaiting_response') {
        setCurrentStatus('Awaiting your response...');
        setResearchProgress(0);
      } else {
        setCurrentStatus('');
        setResearchProgress(100);
        // Reset progress after a delay
        setTimeout(() => setResearchProgress(0), 2000);
      }

      eventSource.close();
      loadSessions();
      loadSession(sessionId);
    });

    eventSource.addEventListener('error', (e) => {
      console.error('SSE error event:', e);
      try {
        const data = e.data ? JSON.parse(e.data) : {};
        const errorMsg = data.error || 'Connection failed';
        setCurrentStatus(`❌ Error: ${errorMsg}`);
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errorMsg}`, created_at: new Date() }]);
      } catch (err) {
        console.error('Error parsing SSE error:', err);
        setCurrentStatus('❌ Error: Unknown error occurred');
      }
      setIsResearching(false);
      eventSource.close();
    });

    eventSource.onerror = (e) => {
      console.error('SSE connection error:', e);
      if (eventSource.readyState === EventSource.CLOSED) {
        setCurrentStatus('❌ Connection lost. Please try again.');
        setMessages(prev => [...prev, { role: 'assistant', content: 'Connection lost. Please try again.', created_at: new Date() }]);
      }
      setIsResearching(false);
      eventSource.close();
    };
  };

  const downloadResult = async (sessionId) => {
    window.open(`${API_BASE}/api/research/sessions/${sessionId}/download`, '_blank');
  };

  const clearConversation = async () => {
    // Close any active research stream
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Delete the current session from database if it exists and is active
    if (currentSession && currentSession.status === 'active') {
      try {
        await fetch(`${API_BASE}/api/research/sessions/${currentSession.id}`, {
          method: 'DELETE'
        });
        console.log(`Deleted active session ${currentSession.id}`);
      } catch (error) {
        console.error('Failed to delete session:', error);
      }
    }

    // Reset all state
    setCurrentSession(null);
    setMessages([]);
    setThinkingSteps([]);
    setCurrentStatus('');
    setAwaitingClarification(false);
    setIsResearching(false);
    setResearchProgress(0);

    // Reload sessions to update history
    loadSessions();
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
            {currentSession ? currentSession.title : 'Research Target Demographic'}
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
                Discover Your Target Demographic
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Enter any audience type to generate a comprehensive sticker design profile
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <p>Examples:</p>
                <p className="text-indigo-600 dark:text-indigo-400">"college students" • "nurses" • "anime fans" • "dog owners"</p>
              </div>
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
                  : 'Enter a demographic (e.g., "gamers", "Gen Z", "Taylor Swift fans")...'
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
            Research Activity
          </h3>

          {(isResearching || researchProgress > 0) && (
            <div className="mb-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${researchProgress}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {researchProgress === 100 ? 'Complete!' : 'Research in progress...'}
                </p>
                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  {researchProgress}%
                </p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2">
            {thinkingSteps.length === 0 && !isResearching && (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                Research activity will appear here
              </p>
            )}
            {thinkingSteps.map((step, idx) => {
              if (step.type === 'search') {
                return (
                  <div key={idx} className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">🔍</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          Web Search
                        </div>
                        <div className="text-sm text-blue-800 dark:text-blue-200 break-words">
                          {step.text}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              } else if (step.type === 'page') {
                return (
                  <div key={idx} className="p-3 rounded-lg bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">🌐</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-green-900 dark:text-green-100 mb-1">
                          Viewing Page
                        </div>
                        <a
                          href={step.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-green-800 dark:text-green-200 hover:underline break-all"
                        >
                          {step.text}
                        </a>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={idx} className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800">
                    <div className="flex items-start gap-2">
                      <span className="text-lg flex-shrink-0">💭</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-purple-900 dark:text-purple-100 mb-1">
                          Thinking
                        </div>
                        <div className="text-sm text-purple-800 dark:text-purple-200 break-words">
                          {step.text}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
            })}
          </div>
        </div>

        {/* History Panel */}
        <div className="h-96 bg-white dark:bg-gray-800 rounded-lg shadow p-4 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Research History
            </h3>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              {sessions.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                No research yet
              </p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className="p-3 bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 cursor-pointer" onClick={() => loadSession(session.id)}>
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {session.title}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {session.has_result ? (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Completed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            {session.status}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {new Date(session.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                  {session.has_result && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadResult(session.id);
                        }}
                        className="flex-1 px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                      >
                        Download
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Placeholder for future functionality
                        }}
                        className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                      >
                        Queue
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Research;
