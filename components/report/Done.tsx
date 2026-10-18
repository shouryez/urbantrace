import dynamic from "next/dynamic";
import Link from "next/link";
import { BackerCount } from "@/components/ui/BackerCount";
import { Button, buttonClasses } from "@/components/ui/Button";
import type { LatLng } from "@/lib/geo";
import type { SubmitResult } from "@/lib/reports";

const DoneMap = dynamic(() => import("./DoneMap"), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" />,
});

type DoneProps = {
  result: SubmitResult;
  position: LatLng;
  onAnother: () => void;
};

/** Done: the pin drops onto a small map, the backer count rolls up, and the routed body is named. */
export function Done({ result, position, onAnother }: DoneProps) {
  return (
    <div className="flex flex-col items-start gap-5 py-6">
      <div className="h-40 w-full overflow-hidden rounded-card border border-white/6">
        <DoneMap position={position} />
      </div>
      <h2 className="font-display text-[32px] leading-tight font-semibold">
        {result.merged ? "Your support was added" : "Report filed"}
      </h2>
      <p className="text-mist-300">
        {result.merged ? "Someone already reported this. " : "This is a new issue. "}
        Issue <span className="font-mono text-chalk-50">#{result.issueId}</span> now has{" "}
        <BackerCount value={result.backerCount} fromZero className="text-chalk-50" />{" "}
        {result.backerCount === 1 ? "backer" : "backers"}.
      </p>
      {result.bodyName && (
        <div className="flex w-full flex-col gap-1 rounded-card border border-white/6 bg-asphalt-800 p-4">
          <p className="kicker text-mist-300">Routed to</p>
          <p className="font-medium">{result.bodyName}</p>
          {!result.merged && <p className="text-sm text-mist-300">A complaint letter is being drafted for them.</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href={`/issue/${result.issueId}`} className={buttonClasses("primary")}>
          View issue and letter
        </Link>
        <Link href="/map" className={buttonClasses("secondary")}>
          See the map
        </Link>
        <Button variant="ghost" onClick={onAnother}>
          Report another
        </Button>
      </div>
    </div>
  );
}
