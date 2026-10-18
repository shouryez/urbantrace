"use client";

// Follow-up questions after the AI reads the evidence: how long it has been there, then what only
// someone on the spot knows. Every question can be skipped; answers go into the case file and letter.
import { MessageCircleQuestion } from "lucide-react";
import { useEffect, useState } from "react";
import type { FollowUpAnswer, FollowUpQuestion } from "@/lib/ai/schemas";

type Props = {
  problems: string[];
  address: string | null;
  hazards: string[];
  accessibility: string;
  transcript: string | null;
  onChange: (answers: FollowUpAnswer[]) => void;
};

export function FollowUp({ problems, address, hazards, accessibility, transcript, onChange }: Props) {
  const [questions, setQuestions] = useState<FollowUpQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const key = problems.join("|");

  useEffect(() => {
    let live = true;
    fetch("/api/reports/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ problems: key.split("|"), address, hazards, accessibility, transcript }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("questions"))))
      .then((d: { questions: FollowUpQuestion[] }) => live && setQuestions(d.questions))
      .catch(() => live && setQuestions([]));
    return () => {
      live = false;
    };
    // hazards and the rest come from the same reading as the problems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = (q: FollowUpQuestion, value: string) => {
    const next = { ...answers, [q.id]: value };
    if (!value.trim()) delete next[q.id];
    setAnswers(next);
    onChange((questions ?? []).filter((x) => next[x.id]?.trim()).map((x) => ({ question: x.question, answer: next[x.id]!.trim() })));
  };

  if (questions === null) {
    return (
      <section className="flex flex-col gap-3 rounded-card panel p-5" aria-busy>
        <p className="flex items-center gap-2 text-sm font-bold">
          <MessageCircleQuestion size={17} className="text-violet" aria-hidden /> Preparing a few questions…
        </p>
        <div className="skeleton h-10 rounded-xl" />
        <div className="skeleton h-10 rounded-xl" />
      </section>
    );
  }
  if (!questions.length) return null;

  return (
    <section className="flex flex-col gap-5 rounded-card panel p-5">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-display text-lg font-semibold">
          <MessageCircleQuestion size={18} className="text-violet" aria-hidden /> A few questions the photo cannot answer
        </p>
        <p className="text-xs text-fog-300">Optional. Your answers go into the case file and the complaint to the ward.</p>
      </div>
      {questions.map((q) => (
        <fieldset key={q.id} className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-bold">{q.question}</legend>
          {q.kind === "choice" ? (
            <div className="flex flex-wrap gap-2">
              {q.options.map((o) => {
                const on = answers[q.id] === o;
                return (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set(q, on ? "" : o)}
                    className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${on ? "border-signal bg-signal font-bold text-ink-950" : "border-white/12 bg-white/4 text-fog-100 hover:border-white/25"}`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              value={answers[q.id] ?? ""}
              onChange={(e) => set(q, e.target.value)}
              maxLength={300}
              placeholder="Type a short answer"
              className="rounded-[14px] border border-white/8 bg-ink-700 px-4 py-2.5 text-sm"
            />
          )}
          <p className="text-[11px] text-fog-500">{q.why}</p>
        </fieldset>
      ))}
    </section>
  );
}
