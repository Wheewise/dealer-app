"use client";

import { useState, useEffect, useCallback, useRef } from "react";

type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type Conversation = {
  id: string;
  listing: { id: string; title: string; photo: string | null };
  otherParty: { name: string; id: string };
  lastMessage: string | null;
  unread: number;
  updatedAt: string;
};

export function ChatWidget({
  listingId,
  userId,
}: {
  listingId?: string;
  userId?: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/chat/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  const fetchMessages = useCallback(async (convId: string) => {
    const res = await fetch(`/api/chat/messages?conversationId=${convId}`);
    if (res.ok) setMessages(await res.json());
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
    fetchConversations();
  }, [fetchConversations]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setActiveId(null);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      fetchMessages(id);
    },
    [fetchMessages],
  );

  // Poll conversations while open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchConversations, 5000);
    return () => clearInterval(interval);
  }, [open, fetchConversations]);

  // Poll messages when a conversation is active
  useEffect(() => {
    if (!activeId) return;
    const interval = setInterval(() => fetchMessages(activeId), 3000);
    return () => clearInterval(interval);
  }, [activeId, fetchMessages]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startConversation = useCallback(async () => {
    if (!listingId) return;
    setStarting(true);
    const res = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId }),
    });
    if (res.ok) {
      const { id } = await res.json();
      await fetchConversations();
      setActiveId(id);
    }
    setStarting(false);
  }, [listingId, fetchConversations]);

  const sendMessage = useCallback(async () => {
    if (!activeId || !input.trim()) return;
    setSending(true);
    const res = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: activeId, body: input.trim() }),
    });
    if (res.ok) {
      const msg = await res.json();
      setMessages((prev) => [...prev, msg]);
      setInput("");
    }
    setSending(false);
  }, [activeId, input]);

  const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        className="bg-brand-red hover:bg-brand-red-dark fixed right-6 bottom-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-white">
            {totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed right-6 bottom-6 z-50 flex h-[500px] w-[380px] max-w-[calc(100vw-2rem)] flex-col rounded-xl border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Messages</h3>
        <button onClick={handleClose} className="text-zinc-400 hover:text-zinc-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {activeId ? (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((m) => {
              const isMine = m.senderId === userId;
              return (
                <div
                  key={m.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      isMine
                        ? "bg-brand-red text-white"
                        : "bg-surface-muted text-zinc-800"
                    }`}
                  >
                    <p>{m.body}</p>
                    <p
                      className={`mt-0.5 text-right text-[10px] ${isMine ? "text-red-100" : "text-zinc-400"}`}
                    >
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEnd} />
          </div>
          <div className="border-t p-3">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
                placeholder="Type a message…"
                className="focus:border-brand-red flex-1 rounded-md border px-3 py-2 text-sm outline-none"
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim()}
                className="bg-brand-red hover:bg-brand-red-dark rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {sending ? "…" : "Send"}
              </button>
            </div>
            <button
              onClick={() => setActiveId(null)}
              className="mt-2 text-xs text-zinc-500 hover:underline"
            >
              ← All conversations
            </button>
          </div>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-zinc-500">
              {listingId ? (
                <button
                  onClick={startConversation}
                  disabled={starting}
                  className="text-brand-red font-medium hover:underline"
                >
                  {starting ? "Starting…" : "Message the dealer about this vehicle"}
                </button>
              ) : (
                "No conversations yet. Visit a vehicle listing to start a chat."
              )}
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectConversation(c.id)}
                className="hover:bg-surface-muted flex w-full items-start gap-3 border-b px-4 py-3 text-left"
              >
                {c.listing.photo ? (
                  <img
                    src={c.listing.photo}
                    alt=""
                    className="h-10 w-14 rounded object-cover"
                  />
                ) : (
                  <div className="bg-surface-muted h-10 w-14 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{c.listing.title}</span>
                    {c.unread > 0 && (
                      <span className="bg-brand-red rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {c.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">{c.otherParty.name}</p>
                  {c.lastMessage && (
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      {c.lastMessage}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ChatUnreadBadge() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      fetch("/api/chat/conversations")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: Conversation[] | null) => {
          if (!cancelled && data) setUnread(data.reduce((s, c) => s + c.unread, 0));
        })
        .catch(() => {});
    };
    const id = setTimeout(check, 0);
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearTimeout(id);
      clearInterval(interval);
    };
  }, []);

  if (unread === 0) return null;
  return (
    <span className="bg-brand-red ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white">
      {unread}
    </span>
  );
}
