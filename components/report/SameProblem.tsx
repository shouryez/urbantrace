"use client";

import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { CategoryChip } from "@/components/ui/CategoryChip";
import { PHOTO_BLUR } from "@/lib/blur";
import type { NearbyIssue } from "@/lib/reports";

type SameProblemProps = {
  match: NearbyIssue;
  /** F12: matched by meaning, so its category differs from the user's. */
  similar: boolean;
  photoUrl: string;
  submitting: boolean;
  error: string | null;
  onSame: () => void;
  onDifferent: () => void;
};

/** F4 and F12: an unverified issue within 30 m that looks like the same problem. Back it, or file a separate one. */
export function SameProblem({ match, similar, photoUrl, submitting, error, onSame, onDifferent }: SameProblemProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-semibold">
          {similar ? (
            <>
              Is this the same as issue <span className="font-mono">#{match.id}</span>?
            </>
          ) : (
            "Same problem?"
          )}
        </h2>
        <p className="text-sm text-mist-300">
          Issue <span className="font-mono text-chalk-50">#{match.id}</span> was reported{" "}
          <span className="font-mono text-chalk-50">{match.distanceM} m</span> away and has{" "}
          <span className="font-mono text-chalk-50">{match.backerCount}</span> {match.backerCount === 1 ? "backer" : "backers"}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <figure className="flex flex-col gap-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-photo bg-asphalt-700">
            {match.photoUrl && <Image placeholder="blur" blurDataURL={PHOTO_BLUR} src={match.photoUrl} alt={`Photo of issue ${match.id}`} fill sizes="50vw" className="object-cover" />}
          </div>
          <figcaption className="kicker text-mist-300">Issue #{match.id}</figcaption>
        </figure>
        <figure className="flex flex-col gap-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-photo bg-asphalt-700">
            {/* A blob: URL from the camera, so next/image does not apply here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="Your photo" className="h-full w-full object-cover" />
          </div>
          <figcaption className="kicker text-mist-300">Your photo</figcaption>
        </figure>
      </div>

      <div className="flex flex-col gap-2">
        <CategoryChip category={match.category} className="self-start" />
        <p className="text-sm">{match.summary}</p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-chalk-50">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onSame} disabled={submitting}>
          {submitting ? "Filing…" : "Yes, add my support"}
        </Button>
        <Button variant="secondary" onClick={onDifferent} disabled={submitting}>
          No, it&apos;s different
        </Button>
      </div>
    </div>
  );
}
