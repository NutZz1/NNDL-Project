import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, Lock } from 'lucide-react';
import { api } from '../../services/api';
import { INK, Card, Button, ErrorBanner } from './ui';

/*
 * The CivicScan Assistant (role-scoped search agent). It answers from the real data, and the
 * server limits every lookup to what the signed-in user may see: a team manager can only
 * ever get their own team's work.
 */
const SUGGESTIONS = {
  litter: ['Which litter items are overdue?', 'What is still open with high or critical severity?', 'How did my team do this week?'],
  roads: ['Which manhole reports are open?', 'Show overdue potholes', 'How did my team do this week?'],
  officer: ['What is waiting in triage?', 'Compare the two teams this week', 'How accurate was the dispatch agent this month?', 'Which team requests are pending?'],
};

const CODE_RE = /(CS-[A-Z2-9]{4}-[A-Z2-9]{4})/g;

export default function AssistantPanel({ user, onOpen }) {
  const key = user.role === 'municipal_officer' ? 'officer' : user.team;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  const send = async (text) => {
    const q = String(text || '').trim();
    if (!q || busy) return;
    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    try {
      const res = await api.chat(next);
      setMessages([...next, { role: 'assistant', content: res.reply, tools: res.toolCalls || [] }]);
    } catch (e) {
      setError(e.message);
      setMessages(next);
    } finally {
      setBusy(false);
    }
  };

  // Tracking IDs in an answer become buttons that open the work item
  // Inline text: **bold**, `code`, and tracking IDs as buttons that open the item
  const inline = (text, keyBase) =>
    String(text)
      .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
      .flatMap((chunk, ci) => {
        if (/^\*\*[^*]+\*\*$/.test(chunk)) return [<strong key={`${keyBase}-b${ci}`}>{inlineCodes(chunk.slice(2, -2), `${keyBase}-b${ci}`)}</strong>];
        if (/^`[^`]+`$/.test(chunk)) return [<code key={`${keyBase}-c${ci}`} style={{ fontFamily: 'monospace', background: '#f1f5f9', padding: '0 4px', borderRadius: 4 }}>{chunk.slice(1, -1)}</code>];
        return inlineCodes(chunk, `${keyBase}-t${ci}`);
      });
  const inlineCodes = (text, keyBase) =>
    text.split(CODE_RE).map((part, i) =>
      /^CS-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(part) ? (
        <button key={`${keyBase}-${i}`} onClick={() => onOpen(part)} style={{ fontFamily: 'monospace', fontWeight: 800, color: '#047857', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 5, padding: '0 5px', cursor: 'pointer' }}>
          {part}
        </button>
      ) : (
        <React.Fragment key={`${keyBase}-${i}`}>{part}</React.Fragment>
      )
    );

  // Small Markdown renderer for the assistant's answers: tables, bullet and numbered lists,
  // headings, bold, code and tracking-ID links. Anything else is shown as plain text.
  const render = (text) => {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const out = [];
    const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const isSeparator = (row) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row.trim());
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      if (t.startsWith('|')) {
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
        const body = rows.filter((r) => !isSeparator(r)).map(cells);
        const [head, ...rest] = body;
        if (!head) continue;
        out.push(
          <div key={`t${i}`} style={{ overflowX: 'auto', margin: '6px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: '0.86rem', minWidth: 260 }}>
              <thead>
                <tr>
                  {head.map((h, hi) => (
                    <th key={hi} style={{ textAlign: hi ? 'right' : 'left', padding: '5px 10px', borderBottom: `2px solid ${INK.line}`, color: INK.muted, fontWeight: 800 }}>{inline(h, `h${i}-${hi}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rest.map((r, ri) => (
                  <tr key={ri} style={{ borderTop: `1px solid ${INK.line}` }}>
                    {r.map((c, cj) => (
                      <td key={cj} style={{ textAlign: cj ? 'right' : 'left', padding: '5px 10px', fontWeight: cj ? 700 : 500 }}>{inline(c, `c${i}-${ri}-${cj}`)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
      if (/^[-*•]\s+/.test(t) || /^\d+[.)]\s+/.test(t)) {
        const ordered = /^\d+[.)]\s+/.test(t);
        const items = [];
        while (i < lines.length && (ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/).test(lines[i].trim())) {
          items.push(lines[i].trim().replace(ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/, ''));
          i += 1;
        }
        const List = ordered ? 'ol' : 'ul';
        out.push(
          <List key={`l${i}`} style={{ margin: '4px 0', paddingLeft: 20 }}>
            {items.map((it, k) => (
              <li key={k} style={{ margin: '2px 0' }}>{inline(it, `li${i}-${k}`)}</li>
            ))}
          </List>
        );
        continue;
      }
      if (/^#{1,4}\s+/.test(t)) {
        out.push(<div key={`h${i}`} style={{ fontWeight: 800, marginTop: 6 }}>{inline(t.replace(/^#{1,4}\s+/, ''), `hd${i}`)}</div>);
      } else if (t) {
        out.push(<div key={`p${i}`} style={{ margin: '3px 0' }}>{inline(line, `p${i}`)}</div>);
      } else {
        out.push(<div key={`s${i}`} style={{ height: 6 }} />);
      }
      i += 1;
    }
    return out;
  };

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 480 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Bot size={20} aria-hidden="true" style={{ color: '#047857' }} />
        <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: INK.primary }}>CivicScan Assistant</h2>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: INK.muted }}>
        <Lock size={13} aria-hidden="true" />
        {key === 'officer' ? 'You can ask about both teams, triage, requests and the AI agents.' : `Answers only cover your team's work (${user.team === 'litter' ? 'litter' : 'roads, cracks and manholes'}).`}
      </div>

      <div aria-live="polite" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', maxHeight: 520, padding: 2 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS[key].map((s) => (
              <button key={s} onClick={() => send(s)} style={{ padding: '7px 11px', borderRadius: 999, border: `1px solid ${INK.line}`, background: '#fff', color: INK.secondary, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ padding: '10px 13px', borderRadius: 12, fontSize: '0.9rem', lineHeight: 1.55, background: m.role === 'user' ? '#0f172a' : '#fff', color: m.role === 'user' ? '#fff' : INK.primary, border: m.role === 'user' ? 'none' : `1px solid ${INK.line}` }}>
              {m.role === 'user' ? m.content : render(m.content)}
            </div>
            {m.tools && m.tools.length > 0 && <div style={{ fontSize: '0.72rem', color: INK.faint, marginTop: 3 }}>Looked up: {[...new Set(m.tools)].join(', ').replace(/_/g, ' ')}</div>}
          </div>
        ))}
        {busy && <div style={{ fontSize: '0.86rem', color: INK.muted }}>Looking that up…</div>}
        <div ref={endRef} />
      </div>

      <ErrorBanner error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        <label htmlFor="assistant-input" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Ask the assistant
        </label>
        <input id="assistant-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about your work, a tracking ID, or your numbers" maxLength={1000} style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: '0.9rem' }} />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send size={15} /> Ask
        </Button>
      </form>
    </Card>
  );
}
