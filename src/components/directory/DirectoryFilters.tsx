import { Check } from "lucide-react";
import {
  categoryLabels,
  categoryDescriptions,
  type Category,
} from "@/data/chatbots";
import {
  CATEGORIES,
  contentKeys,
  contentLabels,
  featureKeys,
  featureLabels,
  accessKeys,
  accessLabels,
  cardKeys,
  cardLabels,
  type CategoryFilter,
  type ContentFilter,
  type FeatureKey,
  type AccessTag,
  type CardSpec,
} from "@/lib/filters";

interface DirectoryFiltersProps {
  category: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  content: ContentFilter;
  onContentChange: (content: ContentFilter) => void;
  features: FeatureKey[];
  onToggleFeature: (feature: FeatureKey) => void;
  access: AccessTag[];
  onToggleAccess: (tag: AccessTag) => void;
  cards: CardSpec[];
  onToggleCard: (spec: CardSpec) => void;
  categoryCounts: Record<CategoryFilter, number>;
}

const singleClass = (selected: boolean) =>
  `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    selected
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
  }`;

const multiClass = (selected: boolean) =>
  `inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    selected
      ? "border-primary bg-primary/10 text-primary"
      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
  }`;

const groupLabelClass = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full border ${
        selected ? "border-primary-foreground bg-primary-foreground" : "border-muted-foreground"
      }`}
    />
  );
}

export function DirectoryFilters({
  category,
  onCategoryChange,
  content,
  onContentChange,
  features,
  onToggleFeature,
  access,
  onToggleAccess,
  cards,
  onToggleCard,
  categoryCounts,
}: DirectoryFiltersProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Category — single-select (radio) */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${groupLabelClass} mr-1`}>Category</legend>
        <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
          <button
            type="button"
            role="radio"
            aria-checked={category === "all"}
            onClick={() => onCategoryChange("all")}
            className={singleClass(category === "all")}
          >
            <RadioDot selected={category === "all"} />
            All ({categoryCounts.all})
          </button>
          {CATEGORIES.map((cat: Category) => (
            <button
              key={cat}
              type="button"
              role="radio"
              aria-checked={category === cat}
              title={categoryDescriptions[cat]}
              onClick={() => onCategoryChange(cat)}
              className={singleClass(category === cat)}
            >
              <RadioDot selected={category === cat} />
              {categoryLabels[cat]} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      </fieldset>

      {/* Content — single-select (radio) */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${groupLabelClass} mr-1`}>Content</legend>
        <div role="radiogroup" aria-label="Content" className="flex flex-wrap gap-2">
          {contentKeys.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={content === value}
              onClick={() => onContentChange(value)}
              className={singleClass(content === value)}
            >
              <RadioDot selected={content === value} />
              {contentLabels[value]}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Features — multi-select (AND) */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${groupLabelClass} mr-1`}>Features</legend>
        <div role="group" aria-label="Features" className="flex flex-wrap gap-2">
          {featureKeys.map((feature) => {
            const selected = features.includes(feature);
            return (
              <button
                key={feature}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleFeature(feature)}
                className={multiClass(selected)}
              >
                <Check aria-hidden="true" className={`h-3 w-3 ${selected ? "opacity-100" : "opacity-0"}`} />
                {featureLabels[feature]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Access — multi-select (AND) */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${groupLabelClass} mr-1`}>Access</legend>
        <div role="group" aria-label="Access" className="flex flex-wrap gap-2">
          {accessKeys.map((tag) => {
            const selected = access.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleAccess(tag)}
                className={multiClass(selected)}
              >
                <Check aria-hidden="true" className={`h-3 w-3 ${selected ? "opacity-100" : "opacity-0"}`} />
                {accessLabels[tag]}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Cards — multi-select (AND) */}
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className={`${groupLabelClass} mr-1`}>Cards</legend>
        <div role="group" aria-label="Cards" className="flex flex-wrap gap-2">
          {cardKeys.map((spec) => {
            const selected = cards.includes(spec);
            return (
              <button
                key={spec}
                type="button"
                aria-pressed={selected}
                onClick={() => onToggleCard(spec)}
                className={multiClass(selected)}
              >
                <Check aria-hidden="true" className={`h-3 w-3 ${selected ? "opacity-100" : "opacity-0"}`} />
                {cardLabels[spec]}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
