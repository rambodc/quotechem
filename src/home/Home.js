import React, { useMemo, useState } from 'react';
import './Home.css';

const suggestedPrompts = [
  'Draft a cold outreach email for a chemistry startup partner intro.',
  'Summarize what QuoteChem should ship in MVP week one.',
  'Give me 5 product experiment ideas for user growth.',
  'Help me write release notes for the next production deployment.',
];

function buildAssistantReply(text) {
  const trimmed = text.trim();
  if (!trimmed) return 'Share a goal and I will help you break it into executable steps.';

  return [
    'Solid direction. Here is a practical response:',
    `1) Intent: ${trimmed}`,
    '2) MVP output: define one measurable result for today.',
    '3) Execution: split into frontend, backend, and deploy checkpoints.',
    '4) Risk control: add logging, validation, and rollback notes before release.',
    'If you want, I can generate the exact implementation checklist next.',
  ].join('\n');
}

export default function Home() {
  const [messages, setMessages] = useState([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'Welcome to QuoteChem. This is your production copilot space. Ask for plans, code, or deployment steps and I will structure the work.',
    },
  ]);
  const [draft, setDraft] = useState('');

  const chatCount = useMemo(
    () => messages.filter((message) => message.role !== 'system').length,
    [messages]
  );

  const sendMessage = (input) => {
    const value = input.trim();
    if (!value) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: value,
    };

    const assistantMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: buildAssistantReply(value),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setDraft('');
  };

  return (
    <section className="chat-page">
      <header className="chat-header">
        <div>
          <h2>QuoteChem Assistant</h2>
          <p>Interactive workspace for product execution, coding, and production decisions.</p>
        </div>
        <span className="chat-count">{chatCount} messages</span>
      </header>

      <div className="chat-suggestions" aria-label="Quick prompts">
        {suggestedPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="suggestion-pill"
            onClick={() => sendMessage(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="chat-thread" role="log" aria-live="polite">
        {messages.map((message) => (
          <article
            key={message.id}
            className={`chat-message ${message.role === 'user' ? 'user' : 'assistant'}`}
          >
            <span className="chat-role">{message.role === 'user' ? 'You' : 'QuoteChem AI'}</span>
            <p>{message.content}</p>
          </article>
        ))}
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          sendMessage(draft);
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask for product strategy, code updates, or deployment guidance..."
          rows={2}
        />
        <div className="composer-actions">
          <span>Enter to send</span>
          <button type="submit">Send</button>
        </div>
      </form>
    </section>
  );
}
