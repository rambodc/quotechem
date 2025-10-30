// src/Chat.js
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TopBar from '../components/TopBar';
import layoutStyles from '../styles/layout.module.css';

function Chat() {
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = React.useState(() => (typeof window !== 'undefined' ? window.innerWidth < 900 : false));
  React.useEffect(() => {
    const update = () => {
      const mobile = (window.innerWidth || 0) < 900;
      setIsMobile(mobile);
    };
    window.addEventListener('resize', update);
    update();
    return () => window.removeEventListener('resize', update);
  }, []);
  const [messages, setMessages] = useState([
    { id: 'm1', role: 'assistant', content: "Hi! I'm your Razzberry helper. Ask me anything." },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-resize the textarea
  const autosize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    const next = Math.min(180, ta.scrollHeight); // cap height
    ta.style.height = next + 'px';
  };

  useEffect(() => {
    autosize();
  }, [input]);

  // Send message handler (dummy)
  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      role: 'user',
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Simulate a streaming assistant reply
    const fullReply =
      "Got it! (Dummy reply) — In the next step we’ll wire this up to the real ChatGPT API. " +
      "For now I’m just here so you can test the chat layout, typing, and scrolling. 🎛️";

    // Optional: make the reply feel like streaming text
    let idx = 0;
    const chunkMs = 18; // smaller = faster "typing"
    const replyId = `a_${Date.now()}`;

    // Seed an empty message for the assistant
    setMessages((prev) => [...prev, { id: replyId, role: 'assistant', content: '' }]);

    const typer = setInterval(() => {
      idx++;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === replyId ? { ...m, content: fullReply.slice(0, idx) } : m
        )
      );
      if (idx >= fullReply.length) {
        clearInterval(typer);
        setIsTyping(false);
      }
    }, chunkMs);
  };

  // Handle Enter = send; Shift+Enter = newline
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle mobile focus (ensure input visible above keyboard)
  const onFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 50);
  };

  const handleBack = useCallback(() => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/home');
    }
  }, [navigate]);

  return (
    <div className={layoutStyles.detailPage} style={styles.page}>
      {/* Fixed TopBar with Back */}
      <TopBar variant="back" backLabel="Back" onBack={handleBack} />

      {/* No sidebar */}

      {/* Messages list */}
      <main ref={listRef} style={styles.list}>
        <div style={styles.listInner}>
          <h1 style={styles.title}>Chat</h1>
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}

          {isTyping && (
            <div style={styles.row}>
              <div style={{ ...styles.bubble, ...styles.assistant }}>
                <TypingDots />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Composer */}
      <div ref={inputRef} style={styles.composerWrap}>
        <div style={styles.composer}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            placeholder="Message Razzberry…"
            rows={1}
            style={styles.textarea}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            style={{
              ...styles.send,
              ...(input.trim() && !isTyping ? {} : styles.sendDisabled),
            }}
            aria-label="Send message"
            title="Send"
          >
            ➤
          </button>
        </div>
        <p style={styles.hint}>
          Press <kbd>Enter</kbd> to send • <kbd>Shift</kbd> + <kbd>Enter</kbd> for a newline
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ role, content }) {
  const mine = role === 'user';
  return (
    <div style={styles.row}>
      <div
        style={{
          ...styles.bubble,
          ...(mine ? styles.user : styles.assistant),
        }}
      >
        <div style={styles.label}>{mine ? 'You' : 'Assistant'}</div>
        <div style={styles.content}>{content}</div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={styles.typing}>
      <span style={{ ...styles.dot, animationDelay: '0ms' }} />
      <span style={{ ...styles.dot, animationDelay: '120ms' }} />
      <span style={{ ...styles.dot, animationDelay: '240ms' }} />
    </span>
  );
}

/* ===== Inline styles (uses your global CSS variables if present) ===== */
const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    background: 'var(--bg-color, #f2f2f2)',
    color: 'var(--text-color, #111)',
    fontFamily: 'var(--font-family, system-ui, -apple-system, Segoe UI, Roboto, Arial)',
  },
  title: { fontSize: '1.1rem', fontWeight: 700 },
  list: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  listInner: {
    maxWidth: 920,
    width: '100%',
    margin: '0 auto',
    padding: '64px 12px 140px', // top offset under TopBar + bottom space for composer
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    width: '100%',
    borderRadius: 14,
    padding: '12px 14px',
    boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
  },
  assistant: {
    background: '#fff',
    border: '1px solid #eee',
  },
  user: {
    background: '#e8f0ff',
    border: '1px solid #d6e3ff',
  },
  label: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
    fontWeight: 600,
  },
  content: {
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    lineHeight: 1.55,
  },
  composerWrap: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    padding: '12px 12px calc(12px + env(safe-area-inset-bottom, 0px))',
    background: 'linear-gradient(to top, rgba(242,242,242,1) 40%, rgba(242,242,242,0.7))',
    backdropFilter: 'blur(6px)',
  },
  composer: {
    maxWidth: 920,
    margin: '0 auto',
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: 18,
    padding: 10,
    boxShadow: 'var(--box-shadow, 0 10px 30px rgba(0,0,0,0.06))',
  },
  textarea: {
    flex: 1,
    minHeight: 24,
    maxHeight: 180,
    border: 'none',
    outline: 'none',
    resize: 'none',
    fontSize: 16,
    lineHeight: 1.4,
    background: 'transparent',
    color: 'inherit',
  },
  send: {
    border: 'none',
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 700,
    color: '#fff',
    background: 'var(--primary-color, #007aff)',
    transition: 'transform .12s ease, opacity .12s ease',
  },
  sendDisabled: {
    opacity: 0.5,
    cursor: 'default',
  },
  hint: {
    maxWidth: 920,
    margin: '8px auto 0',
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  typing: {
    display: 'inline-flex',
    gap: 6,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#999',
    display: 'inline-block',
    animation: 'chatDot 900ms infinite ease-in-out',
  },
};

// Keyframes injected once
const keyframeId = 'chat-typing-dot-kf';
if (typeof document !== 'undefined' && !document.getElementById(keyframeId)) {
  const style = document.createElement('style');
  style.id = keyframeId;
  style.textContent = `
@keyframes chatDot {
  0% { transform: translateY(0); opacity: .6; }
  50% { transform: translateY(-3px); opacity: 1; }
  100% { transform: translateY(0); opacity: .6; }
}`;
  document.head.appendChild(style);
}

export default Chat;
