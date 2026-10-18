"use client";

import { motion } from "motion/react";
import { Copy, Mail, Printer, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useReducedMotionSafe } from "@/components/motion/useReducedMotionSafe";
import { Button, buttonClasses } from "@/components/ui/Button";
import type { ComplaintLetter } from "@/lib/ai/schemas";

type LetterCardProps = {
  issueId: number;
  initialLetter: ComplaintLetter | null;
  /** The responsible body's address for the mailto: link; null leaves "To" for the user. */
  toEmail: string | null;
  /** Copied in: the zone's Deputy Commissioner and the corporation's Commissioner. */
  cc?: string[];
  /** Who toEmail reaches, e.g. "Joint Commissioner, Bommanahalli zone". */
  toName?: string | null;
};

/** F6: the complaint letter in a paper style card, with copy, print, email and refresh. */
export function LetterCard({ issueId, initialLetter, toEmail, cc = [], toName = null }: LetterCardProps) {
  const reduce = useReducedMotionSafe();
  const [letter, setLetter] = useState(initialLetter);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // A new issue's letter is drafted after the report is filed; poll for it for up to two minutes.
  useEffect(() => {
    if (letter) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      if (tries > 24) return clearInterval(timer);
      try {
        const res = await fetch(`/api/issues/${issueId}`);
        if (!res.ok) return;
        const issue = (await res.json()) as { letter: ComplaintLetter | null };
        if (issue.letter) {
          setLetter(issue.letter);
          clearInterval(timer);
        }
      } catch {
        // keep polling
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [issueId, letter]);

  const refresh = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/issues/${issueId}/letter`, { method: "POST" });
      const body = (await res.json()) as ComplaintLetter | { error: string };
      if (!res.ok || "error" in body) setMessage("error" in body ? body.error : "Could not refresh the letter.");
      else setLetter(body);
    } catch {
      setMessage("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!letter) return;
    try {
      await navigator.clipboard.writeText(`Subject: ${letter.subject}\n\n${letter.body}`);
      setMessage("Copied.");
    } catch {
      setMessage("Could not copy. Select the text and copy it instead.");
    }
  };

  const mailto = letter
    ? `mailto:${toEmail ?? ""}?${cc.length ? `cc=${encodeURIComponent(cc.join(","))}&` : ""}subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`
    : undefined;
  // Many people only have webmail on their phone; Gmail's compose link opens it filled in.
  const gmail =
    letter && toEmail
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(toEmail)}${cc.length ? `&cc=${encodeURIComponent(cc.join(","))}` : ""}&su=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`
      : undefined;

  return (
    <section className="flex flex-col gap-3" style={{ perspective: 1200 }}>
      {/* the paper unfolds from its top edge when it opens, and again when the draft arrives */}
      <motion.div
        key={`${reduce}-${letter ? letter.subject : "drafting"}`}
        className="print-letter origin-top rounded-card bg-chalk-50 p-6 text-asphalt-950"
        initial={reduce ? { opacity: 0 } : { opacity: 0, rotateX: -24 }}
        whileInView={{ opacity: 1, rotateX: 0 }}
        viewport={{ once: true }}
        transition={reduce ? { duration: 0.15 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {letter ? (
          <>
            <p className="kicker text-slate-500">Subject</p>
            <p className="mb-4 font-semibold">{letter.subject}</p>
            <div className="text-[15px] leading-relaxed whitespace-pre-line">{letter.body}</div>
          </>
        ) : (
          <p className="text-slate-500">{busy ? "Drafting the letter…" : "The letter is being drafted. It appears here in a moment."}</p>
        )}
      </motion.div>
      {letter && (
        <p className="no-print text-xs text-fog-300">
          {toEmail ? (
            <>
              To <span className="font-mono text-fog-100">{toEmail}</span>
              {toName ? ` (${toName})` : ""}
              {cc.length > 0 && (
                <>
                  {" "}· Cc <span className="font-mono text-fog-100">{cc.join(", ")}</span>
                </>
              )}
              . Addresses as published on the corporation&apos;s website.
            </>
          ) : (
            "No published email for this body yet; add the address in your mail app, or call the helpline 1533."
          )}
        </p>
      )}
      <div className="no-print flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={copy} disabled={!letter}>
          <Copy size={16} strokeWidth={1.75} aria-hidden /> Copy
        </Button>
        <Button variant="secondary" onClick={() => window.print()} disabled={!letter}>
          <Printer size={16} strokeWidth={1.75} aria-hidden /> Print or PDF
        </Button>
        {mailto ? (
          <a href={mailto} className={buttonClasses(toEmail ? "primary" : "secondary")}>
            <Mail size={16} strokeWidth={1.75} aria-hidden /> {toEmail ? "Email the ward office" : "Email"}
          </a>
        ) : null}
        {gmail && (
          <a href={gmail} target="_blank" rel="noreferrer" className={buttonClasses("secondary")}>
            Open in Gmail
          </a>
        )}
        <Button variant="ghost" onClick={refresh} disabled={busy}>
          <RefreshCw size={16} strokeWidth={1.75} aria-hidden /> {busy ? "Refreshing…" : "Refresh letter"}
        </Button>
        {message && (
          <span role="status" className="text-sm text-mist-300">
            {message}
          </span>
        )}
      </div>
    </section>
  );
}
