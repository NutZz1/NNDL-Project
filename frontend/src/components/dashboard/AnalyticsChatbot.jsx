import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import {
  MessageSquare,
  Bot,
  Send,
  X,
  RotateCcw,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';


const QUICK_SUGGESTIONS = [
  'Top defect class?',
  'Critical hazards in Ettimadai?',
  'Current MTTR vs SLA?',
  'Crew recommendations?',
];

export default function AnalyticsChatbot({
  incidents = [],
  kpis = {},
  timeframe = '7d',
  analyticsContext = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        "Hey! 👋 I'm **CivicScan AI**. Ask me anything about defect volume, road damage hotspots, or MTTR in Ettimadai.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen, messages, isLoading]);

  const handleCopyText = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Cleared! What would you like to check in your civic data?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setErrorMsg(null);
  };

  const buildContextPayload = () => {
    const liveIncidentsCount = incidents.length || 149;
    const dominantDefect =
      analyticsContext.detectionClassesSummary?.split(',')[0] || 'Potholes (42%)';
    const wardData =
      analyticsContext.wardBreakdown ||
      'Ettimadai Corridor: 48 cases | Western Bypass: 38 cases | Academic Complex: 35 cases';
    const resolutionPct =
      analyticsContext.activeTimeframeMetrics?.resolutionRate || kpis.resolutionRate || '95.3%';
    const mttrVal = analyticsContext.activeTimeframeMetrics?.mttr || kpis.avgMttr || '24.6h';

    return {
      activeTimeframe: timeframe,
      totalLiveIncidents: liveIncidentsCount,
      dominantDefect,
      wardData,
      resolutionPct,
      mttrVal,
      detectionClassesSummary:
        analyticsContext.detectionClassesSummary ||
        'Potholes: 62 cases (42%), Litter: 36 cases (24%), Alligator Cracks: 27 cases (18%), Damaged Manhole: 13 cases (9%), Missing Manhole: 11 cases (7%)',
    };
  };

  const sendMessage = async (textToSend) => {
    const query = (textToSend || input).trim();
    if (!query || isLoading) return;

    setErrorMsg(null);
    setInput('');

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    const ctx = buildContextPayload();

    try {
      let replyText = null;

      // The role-scoped CivicScan Assistant on our server: login required, and the API key
      // never reaches the browser. Answers only cover what the signed-in user may see.
      const res = await api.chat(
        newMessages.filter((m) => !m.isError && (m.role === 'user' || m.role === 'assistant')).map((m) => ({ role: m.role, content: m.content }))
      );
      replyText = res.reply;

      const botMsg = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: replyText || 'No response returned.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      console.error('Chat error:', err);
      setErrorMsg(err.message || 'Error reaching AI assistant.');
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-err-${Date.now()}`,
          role: 'assistant',
          isError: true,
          content: 'Sorry, I had trouble connecting. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Quick inline markdown formatter
  const formatText = (text) => {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-size: 0.9em;">$1</code>');
  };

  return (
    <>
      {/* 1. Floating Launcher Button (Hidden/Docked in Bottom Right) */}
      {!isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {/* Subtle label pill */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '20px',
              padding: '6px 14px',
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              color: '#0f172a',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <Sparkles size={14} color="#059669" />
            <span>Chat with AI</span>
          </button>

          {/* Round Action Button */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-label="Open AI Copilot"
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 8px 24px rgba(5, 150, 105, 0.4)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <MessageSquare size={24} />
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #ffffff',
              }}
            />
          </button>
        </div>
      )}

      {/* 2. Messenger-Style Floating Chat Card */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            width: '370px',
            maxWidth: 'calc(100vw - 32px)',
            height: '520px',
            maxHeight: 'calc(100vh - 48px)',
            background: '#ffffff',
            borderRadius: '20px',
            boxShadow: '0 12px 40px -8px rgba(0, 0, 0, 0.22), 0 4px 16px -2px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeInUp 0.2s ease-out',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '14px 18px',
              background: '#0f172a',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  position: 'relative',
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Bot size={18} color="#ffffff" />
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0px',
                    right: '0px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '1.5px solid #0f172a',
                  }}
                />
              </div>

              <div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#f8fafc', lineHeight: 1.2 }}>
                  CivicScan AI
                </div>
                <div style={{ fontSize: '0.68rem', color: '#6ee7b7', fontWeight: 600 }}>
                  Claude Haiku • Online
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleClearHistory}
                title="Clear chat"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                <RotateCcw size={15} />
              </button>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div
            className="civic-copilot-feed"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              background: '#f8fafc',
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      background: isUser ? '#059669' : '#ffffff',
                      color: isUser ? '#ffffff' : '#1e293b',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '10px 14px',
                      fontSize: '0.86rem',
                      lineHeight: 1.45,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      border: isUser ? 'none' : '1px solid #e2e8f0',
                      wordBreak: 'break-word',
                      position: 'relative',
                    }}
                  >
                    {!isUser && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            color: '#059669',
                            textTransform: 'uppercase',
                          }}
                        >
                          Civic AI
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(msg.id, msg.content)}
                          title="Copy text"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: copiedId === msg.id ? '#059669' : '#94a3b8',
                            cursor: 'pointer',
                            padding: '0 2px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {copiedId === msg.id ? <Check size={11} /> : <Copy size={11} />}
                        </button>
                      </div>
                    )}

                    <div
                      dangerouslySetInnerHTML={{
                        __html: formatText(msg.content),
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontSize: '0.64rem',
                      color: '#94a3b8',
                      marginTop: '3px',
                      padding: '0 4px',
                    }}
                  >
                    {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {/* Typing Animation */}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '16px 16px 16px 4px',
                  padding: '10px 14px',
                  alignSelf: 'flex-start',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
                <span className="typing-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#047857', display: 'inline-block' }} />
              </div>
            )}

            {errorMsg && (
              <div
                style={{
                  padding: '6px 10px',
                  background: '#fee2e2',
                  color: '#b91c1c',
                  fontSize: '0.74rem',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <AlertCircle size={13} />
                <span>{errorMsg}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Chips (compact horizontal scroll) */}
          <div
            style={{
              padding: '8px 12px',
              background: '#ffffff',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {QUICK_SUGGESTIONS.map((sug, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => sendMessage(sug)}
                disabled={isLoading}
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#475569',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ecfdf5';
                  e.currentTarget.style.color = '#059669';
                  e.currentTarget.style.borderColor = '#a7f3d0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f1f5f9';
                  e.currentTarget.style.color = '#475569';
                  e.currentTarget.style.borderColor = '#e2e8f0';
                }}
              >
                {sug}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div
            style={{
              padding: '10px 14px',
              background: '#ffffff',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '24px',
                padding: '4px 6px 4px 14px',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '0.86rem',
                  color: '#0f172a',
                  background: 'transparent',
                }}
              />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: input.trim() && !isLoading ? '#059669' : '#e2e8f0',
                  color: input.trim() && !isLoading ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                }}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
