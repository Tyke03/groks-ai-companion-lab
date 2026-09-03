import { ExternalLink, CalendarDays } from "lucide-react";
import type { EvidenceMetadata } from "@/data/chatbots";

const STATUS_LABELS: Record<NonNullable<EvidenceMetadata["reviewStatus"]>, string> = {
  documented: "Documentation recorded",
  "needs-review": "Review needed",
  unverified: "Not yet reviewed",
};

const STATUS_CLASSES: Record<NonNullable<EvidenceMetadata["reviewStatus"]>, string> = {
  documented: "text-green-400",
  "needs-review": "text-yellow-400",
  unverified: "text-muted-foreground",
};

interface Props {
  metadata: EvidenceMetadata;
  /** Compact mode shows inline; full mode shows a card section */
  compact?: boolean;
}

export function EvidenceMetadataDisplay({ metadata, compact = false }: Props) {
  const hasAny =
    !!metadata.lastVerified ||
    !!metadata.sourceUrl ||
    !!metadata.reviewStatus;

  if (!hasAny) return null;

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {metadata.lastVerified && (
          <span className="inline-flex items-center gap-0.5">
            <CalendarDays className="h-3 w-3" aria-hidden="true" />
            {metadata.lastVerified}
          </span>
        )}
        {metadata.reviewStatus && (
          <span className={STATUS_CLASSES[metadata.reviewStatus]}>
            {STATUS_LABELS[metadata.reviewStatus]}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background/50 p-3 text-xs leading-relaxed text-muted-foreground space-y-1.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
        Record information
      </h3>
      <ul className="space-y-1">
        {metadata.lastVerified && (
          <li className="flex items-center gap-1.5">
            <CalendarDays className="h-3 w-3 shrink-0 text-foreground/50" aria-hidden="true" />
            <span>Last verified: <span className="text-foreground/80">{metadata.lastVerified}</span></span>
          </li>
        )}
        {metadata.sourceUrl && (
          <li className="flex items-center gap-1.5">
            <ExternalLink className="h-3 w-3 shrink-0 text-foreground/50" aria-hidden="true" />
            <span>Source:{" "}
              <a
                href={metadata.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {new URL(metadata.sourceUrl).hostname}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </span>
          </li>
        )}
        {metadata.reviewStatus && (
          <li>
            <span className={STATUS_CLASSES[metadata.reviewStatus]}>
              {STATUS_LABELS[metadata.reviewStatus]}
            </span>
          </li>
        )}
      </ul>
      <p className="text-[11px] text-muted-foreground/80 italic">
        Record details reflect information documented by this site and may need updating;
        verify important requirements with the platform directly.
      </p>
    </div>
  );
}
