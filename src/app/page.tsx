"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { ChatResponse, GeminiFailureCategory } from "@/lib/types";

const suggestions = [
  "How is our mining pipeline looking?",
  "Compare pipeline by sector.",
  "Which work orders are overdue?",
  "Show billed, collected and receivable amounts.",
  "Where are the biggest data-quality gaps?",
  "Prepare a leadership update.",
];

type SuccessResponse = Extract<ChatResponse, { status: "success" }>;
type PlanningStatus = "pending" | "gemini" | "fallback";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  response?: ChatResponse;
  question?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasNearBottomRef = useRef(true);

  const latestSuccess = useMemo(
    () => [...messages].reverse().find((message) => message.response?.status === "success")?.response as SuccessResponse | undefined,
    [messages],
  );
  const latestPlanning = useMemo(
    () => [...messages].reverse().find((message) => message.response && "planning" in message.response)?.response,
    [messages],
  );
  const userQuestions = useMemo(() => messages.filter((message) => message.role === "user"), [messages]);
  const history = useMemo(
    () => messages.slice(-8).map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );
  const conversationTitle = userQuestions.at(-1)?.content ?? "New BI conversation";

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !wasNearBottomRef.current) return;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, loading]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [input]);

  async function ask(question: string) {
    const cleaned = question.trim();
    if (!cleaned || loading) return;

    const userMessage: Message = {
      id: makeId("user"),
      role: "user",
      content: cleaned,
      createdAt: new Date().toISOString(),
    };

    setLoading(true);
    setInput("");
    setSidebarOpen(false);
    setMessages((current) => [...current, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: cleaned, history }),
      });
      const data = (await response.json()) as ChatResponse;
      const content = data.status === "success" ? data.answer : data.status === "clarification" ? data.question : data.message;
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          content,
          createdAt: new Date().toISOString(),
          response: data,
          question: cleaned,
        },
      ]);
    } catch {
      setInput((current) => current || cleaned);
      setMessages((current) => [
        ...current,
        {
          id: makeId("assistant"),
          role: "assistant",
          content: "Connection failed. Please try again.",
          createdAt: new Date().toISOString(),
          response: { status: "error", message: "Connection failed. Please try again.", retryable: true },
          question: cleaned,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function onScroll() {
    const node = scrollRef.current;
    if (!node) return;
    wasNearBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 220;
  }

  async function copyAnswer(message: Message) {
    if (!message.response || message.response.status !== "success") return;
    await navigator.clipboard.writeText(formatForClipboard(message.response));
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(null), 1400);
  }

  return (
    <main className="flex h-screen overflow-hidden bg-[#F7F8FA] text-[#111827]">
      <Sidebar
        collapsed={sidebarCollapsed}
        latestSuccess={latestSuccess}
        messages={userQuestions}
        open={sidebarOpen}
        onAsk={ask}
        onClose={() => setSidebarOpen(false)}
        onNewChat={() => {
          setMessages([]);
          setInput("");
          setSidebarOpen(false);
        }}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          conversationTitle={conversationTitle}
          latestPlanning={latestPlanning}
          latestSuccess={latestSuccess}
          sidebarCollapsed={sidebarCollapsed}
          onClear={() => setMessages([])}
          onMenu={() => setSidebarOpen(true)}
          onToggleSidebar={() => setSidebarCollapsed((current) => !current)}
        />

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-[900px] flex-col px-4 py-6 sm:px-6 lg:px-8">
            {messages.length === 0 ? <EmptyChatState onAsk={ask} /> : null}
            <div className="space-y-6">
              {messages.map((message) =>
                message.role === "user" ? (
                  <UserMessage key={message.id} message={message} />
                ) : (
                  <AssistantMessage
                    copied={copiedId === message.id}
                    key={message.id}
                    message={message}
                    onClarify={ask}
                    onCopy={() => copyAnswer(message)}
                    onRetry={() => message.question && ask(message.question)}
                  />
                ),
              )}
              {loading ? <ThinkingMessage /> : null}
            </div>
          </div>
        </div>

        <ChatComposer input={input} loading={loading} textareaRef={textareaRef} onInput={setInput} onSubmit={submit} />
      </section>
    </main>
  );
}

function Sidebar({
  collapsed,
  latestSuccess,
  messages,
  open,
  onAsk,
  onClose,
  onNewChat,
}: {
  collapsed: boolean;
  latestSuccess?: SuccessResponse;
  messages: Message[];
  open: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
  onNewChat: () => void;
}) {
  return (
    <>
      <div className={`fixed inset-0 z-30 bg-[#111827]/30 transition-opacity lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-[#E2E8F0] bg-white transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-[76px]" : "lg:w-[260px]"}`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-[#E2E8F0] px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#0F766E] text-sm font-black text-white">SD</div>
          {!collapsed ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold uppercase text-[#0F766E]">Skylark Drones</p>
              <p className="truncate text-xs text-[#64748B]">Live BI Agent</p>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <button
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#E2E8F0] bg-[#111827] px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#172033] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            onClick={onNewChat}
            title="New conversation"
          >
            <span className="text-lg leading-none">+</span>
            {!collapsed ? <span>New conversation</span> : null}
          </button>

          {!collapsed ? (
            <>
              <SidebarSection title="Ask next">
                <div className="space-y-2">
                  {suggestions.map((question) => (
                    <button
                      className="w-full rounded-md border border-[#E2E8F0] px-3 py-2 text-left text-sm text-[#172033] hover:border-[#0F766E] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
                      key={question}
                      onClick={() => onAsk(question)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </SidebarSection>

              <SidebarSection title="Recent">
                {messages.length === 0 ? (
                  <p className="rounded-md bg-[#F7F8FA] px-3 py-2 text-sm text-[#64748B]">Questions appear here after you ask them.</p>
                ) : (
                  <div className="space-y-1">
                    {[...messages].reverse().slice(0, 6).map((message) => (
                      <div className="truncate rounded-md px-3 py-2 text-sm text-[#172033] hover:bg-[#F7F8FA]" key={message.id} title={message.content}>
                        {message.content}
                      </div>
                    ))}
                  </div>
                )}
              </SidebarSection>
            </>
          ) : null}
        </div>

        <div className="border-t border-[#E2E8F0] p-3">
          <ConnectionSummary collapsed={collapsed} latestSuccess={latestSuccess} />
        </div>
      </aside>
    </>
  );
}

function SidebarSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-[#64748B]">{title}</h2>
      {children}
    </section>
  );
}

function ConnectionSummary({ collapsed, latestSuccess }: { collapsed: boolean; latestSuccess?: SuccessResponse }) {
  const live = Boolean(latestSuccess);
  return (
    <div className={`rounded-md border border-[#E2E8F0] bg-[#F7F8FA] p-3 ${collapsed ? "px-2" : ""}`} title={live ? "Monday data fetched successfully" : "No live fetch yet"}>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${live ? "bg-[#0F766E]" : "bg-[#F59E0B]"}`} aria-hidden />
        {!collapsed ? <p className="text-sm font-semibold text-[#172033]">{live ? "Live Monday data" : "Awaiting fetch"}</p> : null}
      </div>
      {!collapsed && latestSuccess ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#64748B]">
          <div>
            <dt>Deals</dt>
            <dd className="font-bold text-[#111827]">{latestSuccess.recordCounts.deals ?? "-"}</dd>
          </div>
          <div>
            <dt>Work orders</dt>
            <dd className="font-bold text-[#111827]">{latestSuccess.recordCounts.workOrders ?? "-"}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function ChatHeader({
  conversationTitle,
  latestPlanning,
  latestSuccess,
  sidebarCollapsed,
  onClear,
  onMenu,
  onToggleSidebar,
}: {
  conversationTitle: string;
  latestPlanning?: ChatResponse;
  latestSuccess?: SuccessResponse;
  sidebarCollapsed: boolean;
  onClear: () => void;
  onMenu: () => void;
  onToggleSidebar: () => void;
}) {
  const planning = getPlanningStatus(latestPlanning, latestSuccess);
  return (
    <header className="sticky top-0 z-20 border-b border-[#E2E8F0] bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-[1100px] items-center gap-3">
        <button className="rounded-md border border-[#E2E8F0] px-2.5 py-2 text-sm font-bold text-[#172033] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0F766E] lg:hidden" onClick={onMenu} title="Open sidebar">
          =
        </button>
        <button className="hidden rounded-md border border-[#E2E8F0] px-2.5 py-2 text-sm font-bold text-[#172033] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0F766E] lg:inline-flex" onClick={onToggleSidebar} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {sidebarCollapsed ? ">" : "<"}
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-[#111827]">{conversationTitle}</h1>
          <p className="truncate text-xs text-[#64748B]">
            {latestSuccess ? `Data fetched ${new Date(latestSuccess.fetchedAt).toLocaleString()}` : "Ask a question to fetch live Monday data"}
          </p>
        </div>
        <GeminiBadge category={planning.category} status={planning.status} />
        <button className="hidden rounded-md border border-[#E2E8F0] px-3 py-2 text-sm font-semibold text-[#172033] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0F766E] sm:inline-flex" onClick={onClear}>
          Clear
        </button>
      </div>
    </header>
  );
}

function GeminiBadge({ category, status }: { category?: GeminiFailureCategory; status: PlanningStatus }) {
  const config = {
    pending: { label: "Gemini pending", className: "border-[#E2E8F0] bg-white text-[#64748B]", dot: "bg-[#F59E0B]" },
    gemini: { label: "Gemini active", className: "border-[#99F6E4] bg-[#ECFDF5] text-[#0F766E]", dot: "bg-[#0F766E]" },
    fallback: { label: `Fallback${category ? `: ${category}` : ""}`, className: "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]", dot: "bg-[#F59E0B]" },
  }[status];

  return (
    <span className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold sm:inline-flex ${config.className}`} title={config.label}>
      <span className={`h-2 w-2 rounded-full ${config.dot}`} aria-hidden />
      {config.label}
    </span>
  );
}

function EmptyChatState({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <section className="flex flex-1 flex-col justify-center py-10">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-md bg-[#0F766E] text-sm font-black text-white">BI</div>
        <h2 className="mt-5 text-3xl font-bold tracking-normal text-[#111827] sm:text-4xl">Ask Skylark BI anything.</h2>
        <p className="mt-3 text-base leading-7 text-[#64748B]">
          Live Monday.com data comes in first, TypeScript calculates the numbers, and Gemini only turns your question into a safe query plan.
        </p>
      </div>
      <div className="mx-auto mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-2">
        {suggestions.map((question) => (
          <button
            className="min-h-[76px] rounded-md border border-[#E2E8F0] bg-white p-4 text-left text-sm font-semibold text-[#172033] shadow-sm hover:border-[#0F766E] hover:bg-[#F7F8FA] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            key={question}
            onClick={() => onAsk(question)}
          >
            {question}
          </button>
        ))}
      </div>
    </section>
  );
}

function UserMessage({ message }: { message: Message }) {
  return (
    <article className="flex justify-end">
      <div className="max-w-[78%] rounded-lg bg-[#111827] px-4 py-3 text-sm leading-6 text-white shadow-sm">
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </article>
  );
}

function AssistantMessage({
  copied,
  message,
  onClarify,
  onCopy,
  onRetry,
}: {
  copied: boolean;
  message: Message;
  onClarify: (question: string) => void;
  onCopy: () => void;
  onRetry: () => void;
}) {
  const response = message.response;
  return (
    <article className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#0F766E] text-xs font-black text-white">SD</div>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg border border-[#E2E8F0] bg-white p-4 shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-7 text-[#172033]">{message.content}</p>
          {response?.status === "success" ? <ResultDetails response={response} /> : null}
          {response?.status === "clarification" ? <Clarification response={response} onClarify={onClarify} /> : null}
          {response?.status === "error" ? <ErrorState response={response} onRetry={onRetry} /> : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {response?.status === "success" ? (
            <button className="rounded-md px-2 py-1 text-xs font-semibold text-[#64748B] hover:bg-[#E2E8F0] hover:text-[#172033] focus:outline-none focus:ring-2 focus:ring-[#0F766E]" onClick={onCopy}>
              {copied ? "Copied" : "Copy answer"}
            </button>
          ) : null}
          {response?.status === "error" && response.retryable ? (
            <button className="rounded-md px-2 py-1 text-xs font-semibold text-[#0F766E] hover:bg-[#ECFDF5] focus:outline-none focus:ring-2 focus:ring-[#0F766E]" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ResultDetails({ response }: { response: SuccessResponse }) {
  const [primaryMetric, ...otherMetrics] = response.metrics;
  return (
    <div className="mt-5 space-y-4">
      {primaryMetric ? <MetricCard metric={primaryMetric} primary /> : null}
      {otherMetrics.length > 0 ? (
        <details className="rounded-md border border-[#E2E8F0] bg-[#F7F8FA] p-3" open={otherMetrics.length <= 3}>
          <summary className="cursor-pointer text-sm font-semibold text-[#172033]">Related metrics</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {otherMetrics.map((metric) => (
              <MetricCard key={metric.label} metric={metric} />
            ))}
          </div>
        </details>
      ) : null}
      {response.table ? <ResultTable table={response.table} /> : null}
      <CaveatPanel caveats={response.caveats} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
        <span>Sources: {response.sources.join(", ")}</span>
        <span aria-hidden>|</span>
        <span>
          Records: {response.recordCounts.deals ?? 0} deals, {response.recordCounts.workOrders ?? 0} work orders
        </span>
      </div>
    </div>
  );
}

function MetricCard({ metric, primary = false }: { metric: SuccessResponse["metrics"][number]; primary?: boolean }) {
  return (
    <section className={`rounded-md border p-4 ${primary ? "border-[#99F6E4] bg-[#ECFDF5]" : "border-[#E2E8F0] bg-white"}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{metric.label}</p>
      <p className={`${primary ? "text-3xl" : "text-xl"} mt-2 break-words font-bold text-[#111827]`}>{metric.value}</p>
      {metric.context ? <p className="mt-2 text-sm leading-6 text-[#64748B]">{metric.context}</p> : null}
    </section>
  );
}

function ResultTable({ table }: { table: NonNullable<SuccessResponse["table"]> }) {
  return (
    <div className="overflow-hidden rounded-md border border-[#E2E8F0] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="bg-[#F7F8FA] text-xs uppercase text-[#64748B]">
            <tr>
              {table.columns.map((column) => (
                <th className={`px-3 py-3 font-bold ${isNumericColumn(table.rows, column) ? "text-right" : "text-left"}`} key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr className="border-t border-[#E2E8F0]" key={index}>
                {table.columns.map((column) => (
                  <td className={`px-3 py-3 text-[#172033] ${isNumericColumn(table.rows, column) ? "text-right tabular-nums" : "text-left"}`} key={column}>
                    {row[column]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CaveatPanel({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <details className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] p-3" open>
      <summary className="cursor-pointer text-sm font-bold text-[#92400E]">Caveats and data quality notes</summary>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-[#92400E]">
        {caveats.map((caveat) => (
          <li className="flex gap-2" key={caveat}>
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F59E0B]" aria-hidden />
            <span>{caveat}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Clarification({ response, onClarify }: { response: Extract<ChatResponse, { status: "clarification" }>; onClarify: (question: string) => void }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {response.options.map((option) => (
          <button
            className="rounded-md border border-[#0F766E] px-3 py-2 text-sm font-semibold text-[#0F766E] hover:bg-[#ECFDF5] focus:outline-none focus:ring-2 focus:ring-[#0F766E]"
            key={option}
            onClick={() => onClarify(option)}
          >
            {option}
          </button>
        ))}
      </div>
      {response.planning?.mode === "fallback" && response.planning.failureCategory ? <FallbackNote category={response.planning.failureCategory} /> : null}
    </div>
  );
}

function ErrorState({ response, onRetry }: { response: Extract<ChatResponse, { status: "error" }>; onRetry: () => void }) {
  return (
    <div className="mt-4 rounded-md border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
      <p className="font-semibold">The request failed.</p>
      <p className="mt-1">{response.retryable ? "This looks retryable." : "This needs configuration or board mapping attention."}</p>
      {response.retryable ? (
        <button className="mt-3 rounded-md bg-[#B91C1C] px-3 py-2 text-sm font-semibold text-white hover:bg-[#991B1B] focus:outline-none focus:ring-2 focus:ring-[#B91C1C]" onClick={onRetry}>
          Retry failed message
        </button>
      ) : null}
    </div>
  );
}

function FallbackNote({ category }: { category: GeminiFailureCategory }) {
  return <p className="rounded-md bg-[#FFFBEB] px-3 py-2 text-xs font-semibold text-[#92400E]">Gemini fallback: {category}</p>;
}

function ThinkingMessage() {
  return (
    <article className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[#0F766E] text-xs font-black text-white">SD</div>
      <div className="rounded-lg border border-[#E2E8F0] bg-white px-4 py-3 text-sm text-[#64748B] shadow-sm">Reading Monday boards and calculating results...</div>
    </article>
  );
}

function ChatComposer({
  input,
  loading,
  textareaRef,
  onInput,
  onSubmit,
}: {
  input: string;
  loading: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="border-t border-[#E2E8F0] bg-white px-4 py-3 sm:px-6" onSubmit={onSubmit}>
      <div className="mx-auto max-w-[900px]">
        <div className="flex items-end gap-2 rounded-lg border border-[#E2E8F0] bg-white p-2 shadow-sm focus-within:border-[#0F766E] focus-within:ring-2 focus-within:ring-[#99F6E4]">
          <textarea
            className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-3 text-sm leading-6 text-[#111827] outline-none placeholder:text-[#64748B]"
            maxLength={1000}
            onChange={(event) => onInput(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask about pipeline, overdue work orders, billing, collections or data quality..."
            ref={textareaRef}
            rows={1}
            value={input}
          />
          <button
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#111827] text-sm font-bold text-white hover:bg-[#172033] focus:outline-none focus:ring-2 focus:ring-[#0F766E] disabled:cursor-not-allowed disabled:bg-[#94A3B8]"
            disabled={loading || !input.trim()}
            title="Send"
            type="submit"
          >
            ^
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-[#64748B]">Enter sends. Shift+Enter adds a new line. Credentials stay on the server.</p>
      </div>
    </form>
  );
}

function getPlanningStatus(latestPlanning?: ChatResponse, latestSuccess?: SuccessResponse): { status: PlanningStatus; category?: GeminiFailureCategory } {
  if (latestSuccess?.planning?.mode === "gemini") return { status: "gemini" };
  if (latestPlanning && "planning" in latestPlanning && latestPlanning.planning?.mode === "fallback") {
    return { status: "fallback", category: latestPlanning.planning.failureCategory };
  }
  return { status: "pending" };
}

function formatForClipboard(response: SuccessResponse) {
  const metrics = response.metrics.map((metric) => `${metric.label}: ${metric.value}${metric.context ? ` (${metric.context})` : ""}`).join("\n");
  const caveats = response.caveats.length ? `\n\nCaveats:\n${response.caveats.map((caveat) => `- ${caveat}`).join("\n")}` : "";
  return `${response.answer}\n\n${metrics}${caveats}`;
}

function isNumericColumn(rows: Array<Record<string, string | number>>, column: string) {
  return rows.some((row) => typeof row[column] === "number" || /^[-₹$0-9,.% ]+$/.test(String(row[column] ?? "")));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
