import { useEffect, useRef, useState } from 'react';
import { sendChat } from './api';

const CHIPS = [
  'sold 2 Milk, 1 Atta',
  'Ramesh credit 200',
  'Ramesh paid 100',
  'received 20 rice bags',
  'damaged 1 Milk',
  'undo',
];

// A stable id per browser, so a "Which Maggi?" question stays with this person.
function getSender() {
  try {
    let id = localStorage.getItem('angadi_sender');
    if (!id) {
      id = 'web-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('angadi_sender', id);
    }
    return id;
  } catch {
    return 'web-anon';
  }
}

export default function Chat({ onChange }) {
  const [sender] = useState(getSender);
  const [messages, setMessages] = useState([
    {
      role: 'bot',
      kind: 'info',
      text: 'Namaste! Welcome to Angadi. Tell me what happened in plain words, for example:\n• "sold 2 milk, 1 atta"\n• "Ramesh credit 200" (gives udhar)\n• "Ramesh paid 100" (collects jama)\n• "received 20 rice bags"\n• "damaged 1 milk"',
    },
  ]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(raw, label) {
    const msg = raw.trim();
    if (!msg || sending) return;
    setSending(true);
    setText('');
    setMessages((m) => [...m, { role: 'user', text: label || msg }]);
    try {
      const r = await sendChat(sender, msg);
      setMessages((m) => [...m, { role: 'bot', kind: r.kind, text: r.reply, options: r.options }]);
      if (r.kind === 'updated' || r.kind === 'undo') {
        if (onChange) onChange();
      }
    } catch {
      setText(msg);
      setMessages((m) => [
        ...m,
        {
          role: 'bot',
          kind: 'error',
          text: "Couldn't reach the server, so nothing was saved. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  const last = messages.length - 1;

  return (
    <section className="chat">
      <div className="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role} ${m.kind || ''}`}>
            {m.text}
            {m.options && i === last && (
              <div className="options">
                {m.options.map((o, j) => (
                  <button
                    key={o.id}
                    type="button"
                    disabled={sending}
                    onClick={() => send(String(j + 1), o.name)}
                  >
                    {o.name} · ₹{o.price}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="chips">
        {CHIPS.map((c) => (
          <button key={c} type="button" disabled={sending} onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. sold 2 milk, 1 atta  OR  Ramesh credit 200"
          autoComplete="off"
          enterKeyHint="send"
        />
        <button type="submit" disabled={sending || !text.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}