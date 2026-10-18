"use client";

import { useEffect, useState } from "react";
import { BackerCount } from "@/components/ui/BackerCount";
import { supabaseBrowser } from "@/lib/supabase/client";

/** The issue's backer count; it rolls when someone backs the issue (Realtime on its row). */
export function LiveBackers({ issueId, initial }: { issueId: number; initial: number }) {
  const [count, setCount] = useState(initial);
  useEffect(() => {
    const db = supabaseBrowser();
    const channel = db
      .channel(`issue-${issueId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "issues", filter: `id=eq.${issueId}` }, (payload) => {
        const next = (payload.new as { backer_count?: unknown }).backer_count;
        if (typeof next === "number") setCount(next);
      })
      .subscribe();
    return () => {
      void db.removeChannel(channel);
    };
  }, [issueId]);

  return (
    <span>
      <BackerCount value={count} className="text-chalk-50" /> {count === 1 ? "backer" : "backers"}
    </span>
  );
}
