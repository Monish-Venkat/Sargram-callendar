import { FormEvent, useEffect, useState } from "react";
import type { MemberRole } from "../lib/supabase";
import { useMarkNoticesRead, useMessageRecipients, useNotices, useSendDirectMessage } from "../hooks/useSupabase";

type Member = { id: string; name: string; role: MemberRole };

export default function MessageCenter({ member }: { member: Member }) {
  const canMessage = member.role === "core" || member.role === "event_head";
  const { data: recipients = [], isPending: loadingRecipients } = useMessageRecipients();
  const { data: messages = [], isPending: loadingMessages, isError, refetch } = useNotices();
  const sendMessage = useSendDirectMessage();
  const markRead = useMarkNoticesRead();
  const [draft, setDraft] = useState({ recipientId: "", content: "" });

  useEffect(() => {
    if (canMessage && messages.some((message) => !message.read_at)) void markRead.mutateAsync();
  }, [canMessage, markRead, messages]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.recipientId || !draft.content.trim()) return;
    try {
      await sendMessage.mutateAsync({ recipientId: draft.recipientId, content: draft.content.trim() });
      setDraft({ recipientId: "", content: "" });
    } catch {
      // The inline error below keeps the recovery action next to the draft.
    }
  }

  if (!canMessage) return null;

  return <section className="message-center" aria-labelledby="messages-title">
    <header className="message-header">
      <div><h2 id="messages-title">Messages</h2><p>Private communication between Core and Event Heads.</p></div>
    </header>
    <div className="message-layout">
      <form className="message-compose" onSubmit={submit}>
        <h3>New message</h3>
        <label>To
          <select value={draft.recipientId} onChange={(event) => setDraft({ ...draft, recipientId: event.target.value })} required disabled={loadingRecipients}>
            <option value="">{loadingRecipients ? "Loading recipients…" : member.role === "core" ? "Choose an Event Head" : "Choose a Core member"}</option>
            {recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.name}{recipient.event_name ? ` · ${recipient.event_name}` : ""}</option>)}
          </select>
        </label>
        <label>Message
          <textarea value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Write a clear, private message…" rows={7} required />
        </label>
        <button className="btn btn-primary" type="submit" disabled={sendMessage.isPending || !recipients.length}>{sendMessage.isPending ? "Sending…" : "Send message"}</button>
        {sendMessage.isError && <p className="message-error" role="alert">Message could not be sent. Please check the recipient and try again.</p>}
      </form>
      <section className="message-inbox" aria-labelledby="inbox-title">
        <div className="message-inbox-heading"><div><h3 id="inbox-title">Inbox</h3><p>Messages sent directly to you</p></div><button className="link-btn" type="button" onClick={() => void refetch()}>Refresh</button></div>
        <div className="message-feed" aria-live="polite">
          {loadingMessages ? <p className="muted">Loading messages…</p> : isError ? <p className="muted">Messages could not load. Use Refresh to try again.</p> : messages.length === 0 ? <p className="muted">No messages yet.</p> : messages.map((message) => <article key={message.id}><p>{message.content}</p><small>From {message.sender_name} · {new Date(message.created_at).toLocaleString()}</small></article>)}
        </div>
      </section>
    </div>
  </section>;
}
