import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { filterPlatformsByName } from "@/lib/platformCombobox";

export interface PlatformComboboxOption {
  name: string;
  slug: string;
}

interface PlatformComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: PlatformComboboxOption[];
  /** When true, appends a Custom / Other choice that sets value to `customValue`. */
  allowCustom?: boolean;
  customValue?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  id?: string;
  "aria-label"?: string;
  className?: string;
}

export function PlatformCombobox({
  value,
  onValueChange,
  options,
  allowCustom = false,
  customValue = "custom",
  placeholder = "Select a platform...",
  searchPlaceholder = "Search platforms...",
  id,
  "aria-label": ariaLabel,
  className,
}: PlatformComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...options].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [options],
  );

  const filtered = useMemo(() => filterPlatformsByName(sorted, query), [sorted, query]);

  const displayLabel =
    value === customValue
      ? "Custom / Other"
      : sorted.find((o) => o.name === value)?.name ?? (value || placeholder);

  const qLower = query.trim().toLowerCase();
  const showCustom =
    allowCustom &&
    (!qLower || "custom / other".includes(qLower) || "other".includes(qLower) || "custom".includes(qLower));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel ?? "Select a platform"}
          className={cn(
            "w-full justify-between bg-secondary border-border font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ? displayLabel : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
            aria-label="Filter platforms by name"
          />
          <CommandList>
            <CommandEmpty>No platform matches “{query}”.</CommandEmpty>
            <CommandGroup>
              {filtered.map((opt) => (
                <CommandItem
                  key={opt.slug}
                  value={opt.name}
                  onSelect={() => {
                    onValueChange(opt.name);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === opt.name ? "opacity-100" : "opacity-0")} />
                  {opt.name}
                </CommandItem>
              ))}
              {showCustom && (
                <CommandItem
                  value={customValue}
                  onSelect={() => {
                    onValueChange(customValue);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === customValue ? "opacity-100" : "opacity-0")} />
                  Custom / Other
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
