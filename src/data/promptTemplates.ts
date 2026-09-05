export type TemplateTarget = "Universal" | "SillyTavern";
export type TemplateLane = "universal" | "verified-platform";
export type TemplateArtifactType =
  | "character-definition"
  | "greeting"
  | "system-prompt"
  | "scenario"
  | "lorebook"
  | "authors-note"
  | "instruction-block"
  | "style-guide"
  | "genre-prompt";
export type TemplateFormat = "plain-text" | "platform-native";
export type TemplateConfidence = "Verified" | "Not applicable";
export type TemplateVariableKind = "author-placeholder";

export interface TemplateVariable {
  name: string;
  label: string;
  token: string;
  placeholder: string;
  description: string;
  kind: TemplateVariableKind;
}

export interface TemplateEvidence {
  url: string;
  title: string;
  note: string;
}

export interface TemplateCompatibility {
  lane: TemplateLane;
  target: TemplateTarget;
  artifactType: TemplateArtifactType;
  format: TemplateFormat;
  confidence: TemplateConfidence;
  runtimeMacros: string[];
  pasteInstructions: string;
  evidence: TemplateEvidence[];
  caveats?: string[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  /** Short guidance for when this template is the right fit. */
  useWhen: string;
  template: string;
  variables: TemplateVariable[];
  compatibility: TemplateCompatibility[];
  userCreated?: boolean;
}

const universal = (
  artifactType: TemplateArtifactType,
  pasteInstructions: string,
  caveats: string[] = [],
): TemplateCompatibility => ({
  lane: "universal",
  target: "Universal",
  artifactType,
  format: "plain-text",
  confidence: "Not applicable",
  runtimeMacros: [],
  pasteInstructions,
  evidence: [],
  caveats,
});

const sillyTavernAuthorsNote: TemplateCompatibility = {
  lane: "verified-platform",
  target: "SillyTavern",
  artifactType: "authors-note",
  format: "platform-native",
  confidence: "Verified",
  runtimeMacros: ["{{user}}"],
  pasteInstructions:
    "In a SillyTavern chat, open the Options menu beside the chat input, open Author's Note, paste the filled text, then choose its placement and insertion frequency.",
  evidence: [
    {
      url: "https://docs.sillytavern.app/usage/core-concepts/authors-note/",
      title: "Author's Note | docs.ST.app",
      note: "Documents the Author's Note panel, its Options-menu location, placement modes, and insertion frequency.",
    },
    {
      url: "https://docs.sillytavern.app/usage/core-concepts/macros/",
      title: "Macros | docs.ST.app",
      note: "Documents double-brace runtime macros and confirms {{user}} resolves to the current user/persona name.",
    },
  ],
  caveats: ["{{user}} is a runtime macro and is preserved literally; the Builder never substitutes it."],
};

const author = (name: string, label: string, placeholder: string, description: string): TemplateVariable => ({
  name,
  label,
  token: `[${label}]`,
  placeholder,
  description,
  kind: "author-placeholder",
});

export const promptTemplates: PromptTemplate[] = [
  {
    id: "system-roleplay",
    name: "System — Jailbreak-neutral RP",
    category: "System",
    description: "Median system prompt for API or SillyTavern: stay in character, no filter-override framing.",
    useWhen: "Paste into a system/instruction field when you want consistent RP without jailbreak or filter-override language.",
    template: `You are [Character Name], a [Character Role] in [Setting]. Stay in character and respond as [Character Name] would.

Personality: [Personality Traits]
Speaking style: [Speaking Style]

Rules:
- Stay in character; do not speak or decide for the user
- Prefer concrete actions and sensory detail over summaries
- Match length to about [Response Length] paragraphs
- Content boundaries follow the host and model you chose — do not claim special permissions`,
    variables: [
      author("character_name", "Character Name", "Luna", "Name of the character"),
      author("character_role", "Character Role", "mysterious sorceress", "Role/archetype of the character"),
      author("setting", "Setting", "a dark fantasy kingdom", "Setting/world for the roleplay"),
      author("personality_traits", "Personality Traits", "confident, witty, caring", "Comma-separated traits"),
      author("speaking_style", "Speaking Style", "elegant and teasing, with occasional arcane references", "How the character speaks"),
      author("response_length", "Response Length", "2-3", "Desired paragraph count"),
    ],
    compatibility: [universal("system-prompt", "Paste the filled plain-text block into a system or instruction field supported by your chosen product.", ["Jailbreak-neutral: no filter-override or unrestricted-mode claims."])],
  },
  {
    id: "character-card-fields",
    name: "Character Card Fields Pack",
    category: "Character",
    description: "Draft description, personality, and scenario text for a character card.",
    useWhen: "Fill description / personality / scenario fields before pasting into a card editor (ST, Risu, etc.).",
    template: `**Description**
[Description]

**Personality**
[Personality]

**Scenario**
[Scenario]

**Example dialogue (optional)**
[Example Dialogue]`,
    variables: [
      author("description", "Description", "A traveling archivist who collects forbidden maps and half-true legends.", "Appearance, background, and public facts"),
      author("personality", "Personality", "Curious, dry-humored, protective of secrets; softens when trusted.", "Traits, motives, and behavioral cues"),
      author("scenario", "Scenario", "You meet in a rain-slick archive after hours. A sealed atlas sits between you.", "Shared starting context"),
      author("example_dialogue", "Example Dialogue", "{{user}}: Why keep the atlas sealed?\n{{char}}: Because some roads rewrite the traveler.", "Optional sample exchange; keep {{user}}/{{char}} literal if your host supports them"),
    ],
    compatibility: [universal("character-definition", "Copy each section into the matching character-card fields of your chosen editor.", ["{{user}} and {{char}} are left literal for hosts that expand them; this pack does not verify runtime macro support."])],
  },
  {
    id: "greeting-first-mes",
    name: "Greeting / First Message",
    category: "Character",
    description: "First message (first_mes) draft with action, dialogue, and scene.",
    useWhen: "Draft the character's opening greeting / first_mes for a card.",
    template: `*[Character Name] [Action Description]*

"[Greeting Dialogue]"

*[Internal Thought]*

[Scene Description]`,
    variables: [
      author("character_name", "Character Name", "Aria", "Character name"),
      author("action_description", "Action Description", "leans against the doorframe, arms crossed, a smirk playing on her lips", "Physical action/pose"),
      author("greeting_dialogue", "Greeting Dialogue", "Well, well... I wasn't expecting company tonight. Come in, if you dare.", "Opening dialogue"),
      author("internal_thought", "Internal Thought", "She studies you with keen interest, curiosity barely hidden", "Character's inner thoughts"),
      author("scene_description", "Scene Description", "Candlelight pools across shelves of ancient tomes behind her.", "Scene setting"),
    ],
    compatibility: [universal("greeting", "Use the filled plain-text block as a greeting or first_mes draft in the product you choose.")],
  },
  {
    id: "rp-scene-starter",
    name: "RP Scene Starter",
    category: "Scenario",
    description: "Kick off a mid-scene beat with stakes, sensory detail, and a clear choice point.",
    useWhen: "Start or restart a roleplay scene with setting, pressure, and an opening beat.",
    template: `**Scene: [Scene Title]**

Place: [Place]
Atmosphere: [Atmosphere]
Immediate pressure: [Pressure]

Opening beat:
[Opening Beat]

Leave the next move open for {{user}}.`,
    variables: [
      author("scene_title", "Scene Title", "The West Gate", "Short scene label"),
      author("place", "Place", "rain-slick cobblestones under a half-raised portcullis", "Where the scene happens"),
      author("atmosphere", "Atmosphere", "tense, hushed, torchlight and wet stone", "Mood and sensory baseline"),
      author("pressure", "Pressure", "patrol boots echo closer; the sealed letter is still in hand", "What forces a choice soon"),
      author("opening_beat", "Opening Beat", "*[Character Name] braces the gate bar and glances back.* \"Decide — hide or run — before they round the corner.\"", "Concrete opening action/dialogue"),
    ],
    compatibility: [universal("scenario", "Paste into a scenario, chat, or instruction field to open a scene.", ["{{user}} is left literal for hosts that expand it; not registered as a verified runtime macro here."])],
  },
  {
    id: "lorebook-entry",
    name: "Lorebook / World-Info Entry",
    category: "World-Building",
    description: "Plain-text drafting aid for one lorebook or world-info entry.",
    useWhen: "Draft a single lorebook/world-info entry, then enter fields in your host's editor.",
    template: `**[Entry Name]**

Description: [Description]

Key facts:
- [Fact 1]
- [Fact 2]
- [Fact 3]

Trigger keywords: [Keywords]

Insertion position: [Insertion Position]`,
    variables: [
      author("entry_name", "Entry Name", "Crystal of Binding", "Name of the lore entry"),
      author("description", "Description", "A rare artifact that creates an unbreakable bond between two beings", "What this entry is about"),
      author("fact_1", "Fact 1", "Glows blue when activated", "Key fact 1"),
      author("fact_2", "Fact 2", "Requires mutual consent to function", "Key fact 2"),
      author("fact_3", "Fact 3", "Created by the Ancient Order 1000 years ago", "Key fact 3"),
      author("keywords", "Keywords", "crystal, binding, artifact, bond", "Words that trigger this entry"),
      author("position", "Insertion Position", "before character definition", "Where to insert in context"),
    ],
    compatibility: [universal("lorebook", "Use the filled text as a drafting aid, then manually enter its fields in your chosen lorebook editor.", ["This is not SillyTavern World Info JSON, RisuAI import JSON, Agnaistic native data, or another importable platform format."])],
  },
  {
    id: "sillytavern-authors-note",
    name: "SillyTavern — Author's Note Preset",
    category: "Platform",
    description: "Verified SillyTavern Author's Note text for steering style, pacing, and scene continuity.",
    useWhen: "Paste into SillyTavern Author's Note to steer tone, pacing, and continuity mid-chat.",
    template: `[Author's Note: [Tone]. Pacing: [Pacing]. Keep continuity with: [Continuity]. Do not narrate {{user}}'s choices.]`,
    variables: [
      author("tone", "Tone", "sensory, intimate, and grounded", "Desired tone"),
      author("pacing", "Pacing", "slow burn", "Scene pacing"),
      author("continuity", "Continuity", "the injured hand and the locked east door", "Facts to retain"),
    ],
    compatibility: [sillyTavernAuthorsNote],
  },
  {
    id: "ooc-story-framing",
    name: "OOC / Collaborative Story Framing",
    category: "Scenario",
    description: "Out-of-character planning plus a clean return to the scene.",
    useWhen: "Plan story beats OOC, then return to in-character play without claiming a host-specific Story Mode.",
    template: `[OOC: We are co-writing a fictional story. Story mode: [Story Mode]. Keep [Character Name] consistent with the established canon and ask before making major changes. Return to the scene after planning.]

[Scene Goal]`,
    variables: [
      author("story_mode", "Story Mode", "cinematic roleplay", "Story mode description"),
      author("character_name", "Character Name", "the character", "Character name"),
      author("scene_goal", "Scene Goal", "Continue the tense negotiation in the observatory.", "Goal for this turn"),
    ],
    compatibility: [universal("instruction-block", "Paste the filled plain-text block into a prompt or story-planning field only where your chosen product supports that type of text.", ["No Character.AI-specific OOC or Story Mode feature is claimed."])],
  },
  {
    id: "style-action-sensory",
    name: "Style Guide — Action + Sensory",
    category: "Style",
    description: "One median prose guide: concrete actions paired with sensory detail.",
    useWhen: "Add a style instruction that balances action beats with sensory grounding.",
    template: `Write the next reply with [Action Count] concrete action beats and at least one clear sensory detail per beat (sight, sound, touch, smell, or temperature). Prefer active verbs and visible body language. Keep dialogue natural. End on a choice, image, or unresolved motion — do not summarize the whole scene.`,
    variables: [author("action_count", "Action Count", "2-3", "Number of action beats")],
    compatibility: [universal("style-guide", "Paste the filled plain-text style instruction into a compatible system, style, or instruction field.")],
  },
  {
    id: "scenario-setup",
    name: "Scenario Setup",
    category: "Scenario",
    description: "Define the world, rules, and context for a roleplay scenario.",
    useWhen: "Set rules, context, and starting situation before a longer RP arc.",
    template: `**Scenario: [Scenario Title]**

**Setting:** [Setting Description]

**Context:** [Context]

**Rules:**
- [Rule 1]
- [Rule 2]
- [Rule 3]

**Characters involved:**
- [Character Name]: [Character Brief]
- User: [User Role]

**Starting situation:** [Starting Situation]`,
    variables: [
      author("scenario_title", "Scenario Title", "Forbidden Library", "Title of the scenario"),
      author("setting_description", "Setting Description", "An ancient library hidden beneath a university, accessible only at midnight", "Where the scene takes place"),
      author("context", "Context", "The user has discovered a secret passage leading to forbidden knowledge", "Background context"),
      author("rule_1", "Rule 1", "Magic is real but comes with a personal cost", "First rule of the world"),
      author("rule_2", "Rule 2", "No one can know about this place", "Second rule"),
      author("rule_3", "Rule 3", "The librarian is not what they seem", "Third rule"),
      author("character_name", "Character Name", "The Librarian", "NPC character name"),
      author("character_brief", "Character Brief", "Ancient being disguised as an elegant scholar", "Brief character description"),
      author("user_role", "User Role", "Curious graduate student", "User's role in the scenario"),
      author("starting_situation", "Starting Situation", "You've just opened the hidden door and see the Librarian waiting for you", "How the scene begins"),
    ],
    compatibility: [universal("scenario", "Paste the filled plain-text block into a scenario, context, or definition field supported by your chosen product.")],
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";

const humanizeVariableName = (name: string) =>
  name
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const variableNameFromLabel = (label: string) => label.toLowerCase().trim().replace(/\s+/g, "_");

/** Convert legacy local templates to the current Universal/plain-text model. */
export const normalizeLocalTemplate = (value: unknown): PromptTemplate | null => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.template !== "string") {
    return null;
  }

  const legacyVariables = Array.isArray(value.variables) ? value.variables : [];
  const legacyNames = legacyVariables.flatMap((variable) => {
    if (!isRecord(variable) || typeof variable.name !== "string") return [];
    return [variable.name];
  });
  const tokenNames = [...value.template.matchAll(/\{\{([A-Za-z][A-Za-z0-9_-]*)\}\}/g)].map((match) => match[1]);
  const bracketEntries = [...value.template.matchAll(/\[([A-Za-z][A-Za-z0-9 ]*)\]/g)].map((match) => ({
    name: variableNameFromLabel(match[1]),
    label: match[1],
    token: match[0],
  }));
  const names = [...new Set([...legacyNames, ...tokenNames, ...bracketEntries.map((entry) => entry.name)])];
  const variables: TemplateVariable[] = names.map((name) => {
    const legacy = legacyVariables.find((variable) => isRecord(variable) && variable.name === name);
    const bracket = bracketEntries.find((entry) => entry.name === name);
    const label = bracket?.label || humanizeVariableName(name);
    return {
      name,
      label,
      token: bracket?.token || `[${label}]`,
      placeholder: isRecord(legacy) && typeof legacy.placeholder === "string" ? legacy.placeholder : "",
      description: isRecord(legacy) && typeof legacy.description === "string" ? legacy.description : "Author-editable value",
      kind: "author-placeholder",
    };
  });

  let normalizedText = value.template;
  for (const variable of variables) {
    normalizedText = normalizedText.split(`{{${variable.name}}}`).join(variable.token);
  }

  return {
    id: value.id,
    name: value.name,
    category: typeof value.category === "string" ? value.category : "Custom",
    description: typeof value.description === "string" ? value.description : "User-created local template.",
    useWhen: typeof value.useWhen === "string" ? value.useWhen : "User-created local draft — paste into your chosen host where it fits.",
    template: normalizedText,
    variables,
    compatibility: [universal("instruction-block", "Use the filled plain-text template in the compatible prompt field of your choosing.", ["User-created local template; no platform compatibility is verified."])],
    userCreated: true,
  };
};

export const normalizeLocalTemplates = (value: unknown): PromptTemplate[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = normalizeLocalTemplate(item);
    return normalized ? [normalized] : [];
  });
};

export const getPrimaryCompatibility = (template: PromptTemplate): TemplateCompatibility =>
  template.compatibility[0] ?? universal("instruction-block", "Use the filled plain-text template in a compatible prompt field of your choosing.");

export const renderPromptTemplate = (template: PromptTemplate, values: Record<string, string>): string =>
  template.variables.reduce(
    (result, variable) => result.split(variable.token).join(values[variable.name] || variable.placeholder),
    template.template,
  );
