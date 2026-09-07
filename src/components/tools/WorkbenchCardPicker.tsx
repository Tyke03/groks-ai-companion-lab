import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadCardLibrary, type StoredCardSlot } from "@/lib/cardStorage";
import {
  formatSlotContext,
  formatSlotJson,
  slotToFieldRecord,
} from "@/lib/workbenchCardContext";

export type WorkbenchCardPick = {
  slot: StoredCardSlot;
  /** Full labeled field dump for raw/context areas */
  contextText: string;
  /** V2 envelope JSON string */
  jsonText: string;
  /** Flat field record for variable mapping */
  fields: Record<string, unknown>;
};

type Props = {
  onSelect: (pick: WorkbenchCardPick) => void;
  /** When false, show disabled chrome + banner instead of picker */
  benefitsFromCardContext?: boolean;
  className?: string;
  buttonLabel?: string;
  /** Prefer injecting labeled context (default) or JSON */
  preferJson?: boolean;
};

/**
 * Shared "Populate from Workbench card" control.
 * Same spirit as Lorebook bind-to-card: pick a local library card without copy/paste.
 */
export function WorkbenchCardPicker({
  onSelect,
  benefitsFromCardContext = true,
  className,
  buttonLabel = "Populate from Workbench card",
  preferJson = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<StoredCardSlot[]>([]);

  useEffect(() => {
    if (!open) return;
    setSlots(loadCardLibrary().cards);
  }, [open]);

  if (!benefitsFromCardContext) {
    return (
      <div className={className} data-testid="card-context-unsupported">
        <Button variant="outline" size="sm" disabled className="opacity-50" aria-disabled="true">
          <Layers className="h-4 w-4" />
          {buttonLabel}
        </Button>
        <p className="neon-callout mt-2 text-xs" role="note">
          This tool does not benefit from card context.
        </p>
      </div>
    );
  }

  return (
    <div className={className} data-testid="workbench-card-picker">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        aria-controls="workbench-card-picker-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <Layers className="h-4 w-4" />
        {buttonLabel}
      </Button>
      {open && (
        <div
          id="workbench-card-picker-panel"
          className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/30 p-3"
          data-testid="workbench-card-picker-panel"
        >
          <p className="neon-callout text-xs" role="note">
            Inject a card from your Character Card Builder library (no JSON copy/paste).
          </p>
          {slots.length === 0 ? (
            <p className="neon-callout text-xs" role="note">No local cards yet. Create one in Character Card Builder.</p>
          ) : (
            <ul className="max-h-48 space-y-1 overflow-auto" aria-label="Workbench cards">
              {slots.map((slot) => (
                <li key={slot.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-left text-sm text-foreground hover:border-primary/40 hover:text-primary"
                    onClick={() => {
                      const pick: WorkbenchCardPick = {
                        slot,
                        contextText: formatSlotContext(slot),
                        jsonText: formatSlotJson(slot),
                        fields: slotToFieldRecord(slot),
                      };
                      onSelect(pick);
                      setOpen(false);
                    }}
                    data-testid={`workbench-card-pick-${slot.id}`}
                  >
                    <span className="truncate font-medium">{slot.label || "Untitled card"}</span>
                    <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {preferJson ? "JSON" : "Fields"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </div>
  );
}

export function NeonSectionDivider({ className = "" }: { className?: string }) {
  return <div role="separator" aria-hidden="true" className={`neon-section-divider ${className}`.trim()} data-testid="neon-section-divider" />;
}
