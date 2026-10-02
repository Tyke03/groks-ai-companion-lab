import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, RefreshCw } from "lucide-react";

const PRESETS = [
  "More sarcastic",
  "More subtle & grounded",
  "Increase tension",
  "Shorter & punchier",
] as const;

export type RefinePopoverProps = {
  onRefine: (notes: string) => void;
  disabled?: boolean;
  loading?: boolean;
  /** Visible trigger label. Default: Refine */
  label?: string;
  /** Trigger button size/variant tweaks for toolbar vs field row */
  compact?: boolean;
  "data-testid"?: string;
};

/**
 * Popover for "Regenerate with Notes" (Refine).
 * Preset chips append to the notes input; empty notes cannot submit.
 */
export function RefinePopover({
  onRefine,
  disabled = false,
  loading = false,
  label = "Refine",
  compact = true,
  "data-testid": testId = "refine-popover",
}: RefinePopoverProps) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const appendPreset = (preset: string) => {
    setNotes((prev) => {
      const t = prev.trim();
      return t ? `${t} ${preset}` : preset;
    });
  };

  const submit = () => {
    const trimmed = notes.trim();
    if (!trimmed) return;
    onRefine(trimmed);
    setNotes("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={compact ? "ghost" : "outline"}
          size={compact ? "sm" : "default"}
          disabled={disabled || loading}
          className={compact ? "h-7 px-2 text-xs text-muted-foreground hover:text-primary" : undefined}
          data-testid={`${testId}-trigger`}
          aria-label={label}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {loading ? "Refining..." : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="end" data-testid={`${testId}-content`}>
        <div>
          <p className="text-sm font-medium text-foreground">Regenerate with notes</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Critique the current draft. The AI revises it — it does not start from scratch.
          </p>
        </div>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. more teasing, keep the smirk"
          aria-label="Refinement notes"
          data-testid={`${testId}-notes`}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => appendPreset(preset)}
              data-testid={`${testId}-preset-${preset}`}
            >
              {preset}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          className="w-full"
          disabled={!notes.trim() || disabled || loading}
          onClick={submit}
          data-testid={`${testId}-submit`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Regenerate with Notes
        </Button>
      </PopoverContent>
    </Popover>
  );
}
