"use client";

import { FormEvent, useMemo, useState } from "react";
import type { ChatResponse } from "@/lib/types";

const suggestions = [
  "How is our mining pipeline looking?",
  "Compare pipeline by sector.",
  "Which work orders are overdue?",
  "Show billed, collected and receivable amounts.",
  "Where are the biggest data-quality gaps?",
];

type Message = { role: "user" | "assistant"; content: string; response?: ChatResponse };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const latestSuccess = [...messages].reverse().find((message) => message.response?.status === "success")?.response;
  const history = useMemo(
    () => messages.slice(-6).map((message) => ({ role: message.role, content: message.content })),
    [messages],
  );

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    setLoading(true);
    setInput("");
    setMessages((current) => [...current, { role: "user", content: question }]);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, history }),
      });
      const data = (await response.json()) as ChatResponse;
      const content = data.status === "success" ? data.answer : data.status === "clarification" ? data.question : data.message;
      setMessages((current) => [...current, { role: "assistant", content, response: data }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "Connection failed. Please try again.", response: { status: "error", message: "Connection failed. Please try again.", retryable: true } }]);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-slate-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">Skylark Drones</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Skylark BI Agent</h1>
            <p className="mt-2 max-w-2xl text-base text-slate-600">
              Conversational business intelligence for live Monday.com deal and work-order boards.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <Badge label="Connection" value={latestSuccess ? "Live data" : "Awaiting check"} />
            <Badge label="Deals" value={latestSuccess?.status === "success" ? String(latestSuccess.recordCounts.deals ?? "-") : "-"} />
            <Badge label="Work orders" value={latestSuccess?.status === "success" ? String(latestSuccess.recordCounts.workOrders ?? "-") : "-"} />
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-h-[620px] rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-500" aria-hidden />
                <span className="text-sm font-medium text-slate-700">
                  Data as of {latestSuccess?.status === "success" ? new Date(latestSuccess.fetchedAt).toLocaleString() : "not fetched yet"}
                </span>
                {latestSuccess?.status === "success" && latestSuccess.planning?.mode === "gemini" ? <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">Gemini active</span> : null}
                {latestSuccess?.status === "success" && latestSuccess.planning?.mode === "fallback" ? (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                    Gemini fallback{latestSuccess.planning.failureCategory ? `: ${latestSuccess.planning.failureCategory}` : ""}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex h-[520px] flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-5">
              {messages.length === 0 ? (
                <div className="my-auto max-w-xl">
                  <h2 className="text-xl font-semibold">Ask about pipeline, delivery, billing, collections or data quality.</h2>
                  <p className="mt-2 text-sm text-slate-600">Numbers are calculated by TypeScript functions after live Monday.com data is normalized.</p>
                </div>
              ) : (
                messages.map((message, index) => <ChatBubble key={`${message.role}-${index}`} message={message} onClarify={ask} />)
              )}
              {loading ? <div className="w-fit rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">Analyzing live boards...</div> : null}
            </div>

            <form onSubmit={submit} className="border-t border-slate-200 p-4 sm:p-5">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={1000}
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  placeholder="Ask a founder-level BI question..."
                />
                <button disabled={loading} className="rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                  Ask
                </button>
              </div>
            </form>
          </section>

          <aside className="space-y-4">
            <Panel title="Suggested Questions">
              <div className="flex flex-col gap-2">
                {suggestions.map((question) => (
                  <button key={question} onClick={() => ask(question)} className="rounded-md border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:border-teal-500 hover:bg-teal-50">
                    {question}
                  </button>
                ))}
                <button onClick={() => ask("Prepare a leadership update.")} className="rounded-md bg-teal-700 px-3 py-2 text-left text-sm font-semibold text-white hover:bg-teal-800">
                  Prepare leadership update
                </button>
              </div>
            </Panel>

            {latestSuccess?.status === "success" ? (
              <Panel title="Latest Metrics">
                <div className="grid gap-3">
                  {latestSuccess.metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-slate-200 p-3">
                      <p className="text-xs font-semibold uppercase text-slate-500">{metric.label}</p>
                      <p className="mt-1 text-xl font-bold text-slate-950">{metric.value}</p>
                      {metric.context ? <p className="mt-1 text-xs text-slate-500">{metric.context}</p> : null}
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
}

function Badge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-bold uppercase text-slate-700">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChatBubble({ message, onClarify }: { message: Message; onClarify: (question: string) => void }) {
  const response = message.response;
  const user = message.role === "user";
  return (
    <article className={`max-w-3xl rounded-lg px-4 py-3 ${user ? "ml-auto bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="whitespace-pre-wrap text-sm leading-6">{message.content}</div>
      {response?.status === "success" ? <ResultDetails response={response} /> : null}
      {response?.status === "clarification" ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {response.options.map((option) => (
              <button key={option} onClick={() => onClarify(option)} className="rounded-md border border-teal-600 px-3 py-1.5 text-sm font-semibold text-teal-700 hover:bg-teal-50">
                {option}
              </button>
            ))}
          </div>
          {response.planning?.mode === "fallback" && response.planning.failureCategory ? <p className="mt-2 text-xs font-semibold text-amber-700">Gemini fallback: {response.planning.failureCategory}</p> : null}
        </>
      ) : null}
      {response?.status === "error" ? <p className="mt-2 text-xs font-semibold text-red-700">Retryable: {response.retryable ? "yes" : "no"}</p> : null}
    </article>
  );
}

function ResultDetails({ response }: { response: Extract<ChatResponse, { status: "success" }> }) {
  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {response.metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase text-slate-500">{metric.label}</p>
            <p className="mt-1 text-lg font-bold">{metric.value}</p>
          </div>
        ))}
      </div>
      {response.table ? (
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>{response.table.columns.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}</tr>
            </thead>
            <tbody>
              {response.table.rows.map((row, index) => (
                <tr key={index} className="border-t border-slate-100">
                  {response.table!.columns.map((column) => <td key={column} className="px-3 py-2">{row[column]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs font-bold uppercase text-amber-800">Caveats</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">
          {response.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
        </ul>
      </div>
    </div>
  );
}
