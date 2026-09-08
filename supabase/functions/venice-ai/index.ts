const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};


const MES_EXAMPLE_FORMAT_RULES = `Format mes_example EXACTLY like SillyTavern example dialogue:

- Produce exactly THREE separate example blocks.
- Each block starts with <START> alone on its own line.
- Immediately after <START>, use {{user}}: and {{char}}: speaker labels (never User:, never the character's real name as a label, never Name:).
- Do NOT wrap entire lines in quotes.
- Put actions and inner thoughts in single asterisks, SillyTavern-style: *giggles* *she leans in close*
- Do NOT mash actions with semicolons or put the whole exchange on one line.
- Steer tone/length from the character's name, personality, scenario, first message, and description.
- Prefer richer, longer examples that model high chat quality — UNLESS personality/description clearly indicates quiet/silent/not-a-talker (then shorter replies are OK).

Good shape (3 blocks; keep each exchange multi-line but concise):
<START>
{{user}}: Hey — ready to start?
{{char}}: *smiles* Absolutely. *leans in* Follow my lead and we'll make magic.

`;


/** CCV2/V3 field bible baked into every character generate call. */
const CARD_FIELD_BIBLE = `CHARACTER CARD FIELD BIBLE (CCV2/V3 - follow exactly):

You are an EXPERT CHARACTER CARD AUTHOR, not an RP partner. Never mid-scene roleplay in system_prompt.
Never write {{user}} first-person into personality, description, scenario, creator_notes, or tags.
Personality/description = {{char}} traits from an authorial/third-person (or {{char}}-centric) POV.

FIELDS & LENGTH BUDGETS (hard ceilings for finished text - stay under):
- name: character display name. Keep if provided. Budget ~40 chars.
- description: appearance, background, abilities, key traits. 2-4 paragraphs. Budget <=2000 chars. Authorial POV about {{char}}.
- personality: {{char}} traits, behavioral patterns, quirks - NOT the user's traits. Prefer concise trait list or short prose. Budget <=1000 chars.
- scenario: setting/situation framing the chat. Budget <=1000 chars. Do not write as {{user}} diary.
- first_mes: {{char}} opening message. Use *asterisks for actions* and natural dialogue. Budget <=2000 chars.
- mes_example: EXACTLY three SillyTavern example blocks:
  * Each block starts with <START> alone on its own line
  * Then {{user}}: / {{char}}: labels (never User:, never the real name as a label)
  * *actions* in single asterisks; multi-line exchanges OK
  * Prefer richer examples unless personality says quiet/silent
  Encode as ONE JSON string with real newlines. Budget <=5000 chars.
- alternate_greetings: JSON array of EXACTLY 3 distinct full opening messages (same style as first_mes). Each <=2000 chars.
- group_only_greetings: JSON array of 1-3 group-chat openers acknowledging other characters; or [].
- system_prompt: Instructions FOR the eventual chat model on how to portray THIS character in THIS scenario.
  Fill LAST in reasoning order (most inferential). Reinforce strong traits (e.g. dominant brat) when the card screams them.
  NOT mid-scene Venice roleplay. NOT first-person {{user}}. Budget <=1500 chars.
- post_history_instructions: short after-history reminder for the chat model. Budget <=500 chars.
- creator_notes: notes for OTHER creators/users on how to use the card. Budget <=1000 chars.
- tags: comma-separated categorization tags. Budget <=300 chars.
- nickname: alias if useful; else "".
- source: array of source URL strings if known; else [].
- creator: creator handle if known; else "".
- character_version: version string if useful; else "".

REORGANIZE: ingest ALL labeled current field text even if messy/wrong boxes/overflow. Redistribute into the correct fields. Enrich gaps. Invent ONLY what is missing given context density. Stay consistent across fields.
`;

const CARD_FIELD_ORDER = [
  'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
  'alternate_greetings', 'group_only_greetings', 'creator_notes', 'tags', 'nickname',
  'source', 'creator', 'character_version', 'post_history_instructions', 'system_prompt',
];

/** Exact blank Hub Gen All response shape (V2-flat strings; V3 array fields kept as arrays). */
const RESPONSE_SCHEMA_TEMPLATE = `{
  "name": "",
  "description": "",
  "personality": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": "",
  "alternate_greetings": ["", "", ""],
  "group_only_greetings": [],
  "creator_notes": "",
  "tags": "",
  "nickname": "",
  "source": [],
  "creator": "",
  "character_version": "",
  "post_history_instructions": "",
  "system_prompt": ""
}`;

const ARRAY_CARD_FIELDS = new Set([
  'alternate_greetings',
  'group_only_greetings',
  'source',
]);

function joinStringOrArray(value: unknown, sep = ", "): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map((v) => String(v ?? "").trim()).filter(Boolean).join(sep);
  }
  if (value == null) return "";
  return String(value);
}

function rewriteSpeakerLabels(text: string, charName: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(/(^|\n)\s*User\s*:/g, "$1{{user}}:");
  const name = (charName || "").trim();
  if (!name) return out;
  const variants = new Set<string>();
  variants.add(name);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    variants.add(parts[0]);
    variants.add(parts[parts.length - 1]);
  }
  for (const variant of variants) {
    const esc = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp("(^|\\n)\\s*" + esc + "\\s*:", "gi"), "$1{{char}}:");
  }
  return out;
}

/**
 * Normalize foreign / nested whole-card JSON into flat Hub CardData keys only.
 * Does NOT invent character_book from lore; skips unknown wrappers after unwrap.
 */
function normalizeWholeCardToHub(card: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return {};

  let root: Record<string, unknown> = { ...card };

  const wrapped = root.character_card;
  if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
    root = { ...(wrapped as Record<string, unknown>) };
  }

  const dataObj = root.data;
  const dataRec = dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)
    ? (dataObj as Record<string, unknown>)
    : null;
  const dataLooksLikeCard = !!(dataRec && (
    typeof dataRec.name === 'string' ||
    typeof dataRec.description === 'string' ||
    typeof dataRec.personality === 'string' ||
    typeof dataRec.first_mes === 'string'
  ));

  const merged: Record<string, unknown> = { ...root };
  if (dataLooksLikeCard && dataRec) {
    for (const key of CARD_FIELD_ORDER) {
      if (key in dataRec && dataRec[key] !== undefined && dataRec[key] !== null) {
        merged[key] = dataRec[key];
      }
    }
  }

  // lore is not a Hub flat field — skip (do not invent character_book)
  if (Array.isArray(merged.personality)) {
    merged.personality = joinStringOrArray(merged.personality, ", ");
  }
  if (Array.isArray(merged.tags)) {
    merged.tags = joinStringOrArray(merged.tags, ", ");
  }

  const charName = joinStringOrArray(merged.name).trim();
  const result: Record<string, unknown> = {};

  for (const key of CARD_FIELD_ORDER) {
    if (!(key in merged) || merged[key] === undefined) {
      result[key] = ARRAY_CARD_FIELDS.has(key) ? [] : "";
      continue;
    }
    let value = merged[key];

    if (key === 'personality' || key === 'tags') {
      value = joinStringOrArray(value, ", ");
    } else if (ARRAY_CARD_FIELDS.has(key)) {
      if (typeof value === 'string') {
        const t = value.trim();
        value = t ? [t] : [];
      } else if (!Array.isArray(value)) {
        value = value == null ? [] : [String(value)];
      } else {
        value = value.map((v) => String(v ?? ""));
      }
    } else if (typeof value !== 'string' && !Array.isArray(value)) {
      value = value == null ? "" : String(value);
    }

    if (key === 'mes_example' || key === 'first_mes') {
      value = rewriteSpeakerLabels(String(value ?? ""), charName);
    } else if (key === 'alternate_greetings' && Array.isArray(value)) {
      value = value.map((v) => rewriteSpeakerLabels(String(v ?? ""), charName));
    }

    result[key] = value;
  }

  return result;
}

function parseWholeCardJson(raw: string): { card: Record<string, unknown> | null; parseError: boolean } {
  if (!raw || typeof raw !== 'string') return { card: null, parseError: true };
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { card: null, parseError: true };
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { card: null, parseError: true };
    return { card: parsed as Record<string, unknown>, parseError: false };
  } catch {
    return { card: null, parseError: true };
  }
}

/** True when raw looks like an unfinished JSON object (common Venice truncation). */
function looksLikeTruncatedCardJson(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return true;
  const t = raw.trim();
  if (!t.includes('{')) return true;
  const opens = (t.match(/\{/g) || []).length;
  const closes = (t.match(/\}/g) || []).length;
  if (closes < opens) return true;
  if (!/\}\s*$/.test(t) && !/```\s*$/.test(t)) return true;
  return false;
}

/**
 * Provider cascade that only accepts parseable whole-card JSON.
 * Venice often returns truncated/invalid JSON; treat that as a soft failure and fall through.
 */
async function callLLMForWholeCard(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = CARD_JSON_MAX_TOKENS,
  temperature = 0.7,
): Promise<{ content: string; provider: string; card: Record<string, unknown> }> {
  const veniceKey = Deno.env.get('VENICE_API_KEY');
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const failures: string[] = [];

  const accept = (content: string, provider: string) => {
    if (!content || !String(content).trim()) {
      throw new Error('returned empty (0 chars)');
    }
    const { card, parseError } = parseWholeCardJson(content);
    if (!parseError && card) {
      const flat = normalizeWholeCardToHub(card);
      return { content, provider, card: flat };
    }
    const why = looksLikeTruncatedCardJson(content) ? 'truncated/incomplete JSON' : 'invalid JSON';
    throw new Error(`${why} (${content?.length || 0} chars)`);
  };

  if (veniceKey) {
    for (let attempt = 1; attempt <= VENICE_MAX_ATTEMPTS; attempt++) {
      try {
        const content = await callVeniceStreaming(
          veniceKey,
          VENICE_CARD_MODEL,
          systemPrompt,
          userPrompt,
          maxTokens,
          temperature,
        );
        return accept(content, 'venice');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Venice card attempt ${attempt}/${VENICE_MAX_ATTEMPTS} failed:`, msg);
        failures.push(clarifyFailure('Venice', msg));
        if (!isVeniceRetryable(msg) || attempt >= VENICE_MAX_ATTEMPTS) break;
        const backoff = VENICE_RETRY_BASE_MS * attempt;
        console.log(`Venice card retry backoff ${backoff}ms after:`, msg);
        await sleepMs(backoff);
      }
    }
  }

  if (openrouterKey) {
    try {
      const content = await callProvider(
        'https://openrouter.ai/api/v1/chat/completions',
        openrouterKey,
        OPENROUTER_CARD_MODEL,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        false,
      );
      return accept(content, 'openrouter');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('OpenRouter card failed:', msg);
      failures.push(clarifyFailure('OpenRouter', msg));
    }
  }

  if (lovableKey) {
    try {
      const content = await callProvider(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        lovableKey,
        'google/gemini-2.5-flash',
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        false,
      );
      return accept(content, 'lovable');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Lovable card failed:', msg);
      failures.push(clarifyFailure('Lovable', msg));
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (VENICE_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY)');
  }
  throw new Error(formatCascadeFailure('whole-card', failures));
}

function extractCardField(card: Record<string, unknown>, fieldName: string): unknown {
  if (!card || typeof card !== 'object') return undefined;
  if (fieldName in card) return card[fieldName];
  const data = card.data;
  if (data && typeof data === 'object' && !Array.isArray(data) && fieldName in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[fieldName];
  }
  return undefined;
}

function buildWholeCardUserPrompt(existingFields: Record<string, unknown> | null | undefined, isV3: boolean): string {
  const contextParts = collectContextParts(existingFields, CARD_FIELD_ORDER);
  const contextBlock = contextParts.length > 0
    ? `LABELED CURRENT CARD TEXT (ingest ALL of it - even messy / wrong boxes / overflow. Reorganize into proper fields):\n${contextParts.join('\n\n')}`
    : 'No fields filled - create a completely original character from scratch.';

  return `${CARD_FIELD_BIBLE}

${MES_EXAMPLE_FORMAT_RULES}

TASK: Build a COMPLETE proper Character Card as a single FLAT JSON object (SillyTavern CCV2/V3 Hub keys — NOT a foreign playground envelope).

This is the ONLY valid response shape (fill every key; use "" or [] when empty):
${RESPONSE_SCHEMA_TEMPLATE}

${contextBlock}

REASONING ORDER: flesh out name -> description -> personality -> scenario -> first_mes -> mes_example -> alternate_greetings -> group_only_greetings -> creator_notes -> tags -> nickname/source/creator/version -> post_history_instructions -> system_prompt LAST (most inferential instructions for the chat model given the finished card).

OUTPUT RULES (STRICT — Hub Gen All / import expect ONLY this flat schema):
- Respond with VALID JSON ONLY (no markdown fences, no commentary). ONLY the schema above.
- FORBIDDEN wrappers / dialects: character_card, spec, spec_version, spec_url, data envelopes, lore as a top-level replacement for fields, book, personality as a JSON array, Name:/Roxy:-style speaker labels.
- personality MUST be ONE string (comma-separated traits OK). NEVER a JSON array.
- tags MUST be ONE comma-separated string (Hub UI). V3 export may later split tags; Gen All still returns a string.
- first_mes must be a SINGLE opening message for {{char}} — never multi-<START> dialogue dumps.
- mes_example must be a single string with real newlines and exactly three <START> blocks; use {{user}}:/{{char}}: labels only — NEVER real character name labels, never User:.
- alternate_greetings must be an array of exactly 3 strings (each a full opener like first_mes).
- group_only_greetings must be an array (1-3 strings preferred; [] if not useful).
- source must be an array of strings (or []).
- Respect length budgets so Gen All does not blow limits.
- Personality = {{char}} traits only. Never {{user}} first-person in personality/description/etc.
- system_prompt = instructions FOR the chat model, not mid-scene RP.
${isV3 ? '- V3 note: keep source / group_only_greetings / alternate_greetings as arrays; tags still a string in this Hub response.' : '- V2-flat: same schema; include group_only_greetings as an array when useful; otherwise [].'}`;
}

const CARD_AUTHOR_SYSTEM = `You are an expert Character Card author for SillyTavern / TavernAI / Chub (CCV2/V3) for the AI Companion Hub Gen All pipeline.
You reorganize and enrich incomplete cards into ONE flat JSON object matching the Hub RESPONSE SCHEMA exactly (keys listed in the user prompt blank template).
You are NOT an RP partner and you do not write mid-scene roleplay into system_prompt.
ALWAYS respond with valid JSON only — no markdown, no explanation.

OUTPUT RULES (non-negotiable):
- ONLY the Hub flat schema. Fill every key; use "" or [] when empty.
- FORBIDDEN: character_card wrappers, spec / spec_version / spec_url, nested data-only envelopes as the sole payload, lore as a top-level field replacing card fields, personality as a JSON array, real-name speaker labels (e.g. Roxy:), User: labels.
- personality = ONE string. first_mes = one opening (not multi-<START>). mes_example uses {{user}}/{{char}} only.`;


function formatExistingFieldValue(value: unknown): string | null {
  if (typeof value === 'string') {
    const t = value.trim();
    return t ? t : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v).trim()).filter(Boolean);
    return parts.length ? parts.join('\n') : null;
  }
  return null;
}

function collectContextParts(existingFields: Record<string, unknown> | null | undefined, fieldOrder?: string[]): string[] {
  const contextParts: string[] = [];
  if (!existingFields || typeof existingFields !== 'object') return contextParts;
  const keys = fieldOrder && fieldOrder.length
    ? fieldOrder
    : Object.keys(existingFields);
  for (const key of keys) {
    const formatted = formatExistingFieldValue(existingFields[key]);
    if (formatted) contextParts.push(`${key}: ${formatted}`);
  }
  if (fieldOrder) {
    for (const [key, value] of Object.entries(existingFields)) {
      if (fieldOrder.includes(key)) continue;
      const formatted = formatExistingFieldValue(value);
      if (formatted) contextParts.push(`${key}: ${formatted}`);
    }
  }
  return contextParts;
}

// Card-authoring models: prefer strong general instruct (GLM/Qwen), not RP/uncensored Venice personas.
// Venice whole-card uses streaming: wait while chunks arrive; abort only on stall/hung or wall clock.
// include_venice_system_prompt stays false. OpenRouter fallback: current free Gemma 4 instruct.
const VENICE_CARD_MODEL = 'zai-org-glm-4.7-flash';
const OPENROUTER_CARD_MODEL = 'google/gemma-4-31b-it:free';
/** No chunk for this long => hung (not a blunt hard kill while tokens are flowing). */
const VENICE_STALL_MS = 20_000;
/** Absolute ceiling even if chunks keep arriving (edge-friendly). */
const VENICE_MAX_WALL_MS = 110_000;
/** One Venice retry after stall/hung/429/connection death, then OpenRouter -> Lovable. */
const VENICE_MAX_ATTEMPTS = 2;
/** Short backoff between Venice retries (429 / transient). */
const VENICE_RETRY_BASE_MS = 700;

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isVeniceRetryable(msg: string): boolean {
  return /stall|hung|timeout|wall|network|connection|abort|fetch|5\d\d|429|rate.?limit|truncated|incomplete|invalid JSON|returned empty/i.test(msg);
}

function clarifyFailure(provider: string, msg: string): string {
  if (/429|rate.?limit/i.test(msg)) return `${provider}: rate-limited (429)`;
  if (/returned empty|\(0 chars\)/i.test(msg)) return `${provider}: returned empty (0 chars)`;
  if (/truncated|incomplete JSON/i.test(msg)) return `${provider}: truncated/incomplete JSON`;
  return `${provider}: ${msg}`;
}

function formatCascadeFailure(kind: 'whole-card' | 'generic', failures: string[]): string {
  const joined = failures.join(' | ');
  if (kind === 'whole-card') return `All LLM providers failed whole-card JSON. ${joined}`;
  return `All LLM providers failed. ${joined}`;
}
const CARD_JSON_MAX_TOKENS = 4096;
/** Prompt Builder var gen: smaller completions than whole-card JSON (do not inherit CARD_JSON_MAX_TOKENS). */
const PROMPT_VAR_MAX_TOKENS = 512;
const PROMPT_ALL_VARS_MAX_TOKENS = 2048;
/** Deno/safety ceiling only — not a light-tool throttle. Full card + prompt instructions allowed. */
const RAW_CONTEXT_MAX_CHARS = 120_000;
/** Fast/cheap models for prompt-var path (same flash stack; separate constants so card defaults cannot silently apply). */
const VENICE_PROMPT_MODEL = VENICE_CARD_MODEL;
const OPENROUTER_PROMPT_MODEL = OPENROUTER_CARD_MODEL;

function trimRawContext(raw: unknown, max = RAW_CONTEXT_MAX_CHARS): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = CARD_JSON_MAX_TOKENS, temperature = 0.3, models?: { venice?: string; openrouter?: string }) {
  const veniceKey = Deno.env.get('VENICE_API_KEY');
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');
  const failures: string[] = [];

  // Venice first: stream-aware (extend while active; abort on stall / wall / disconnect)
  if (veniceKey) {
    for (let attempt = 1; attempt <= VENICE_MAX_ATTEMPTS; attempt++) {
      try {
        const content = await callVeniceStreaming(
          veniceKey,
          models?.venice || VENICE_CARD_MODEL,
          systemPrompt,
          userPrompt,
          maxTokens,
          temperature,
        );
        if (!content || !String(content).trim()) {
          throw new Error('returned empty (0 chars)');
        }
        return { content, provider: 'venice' };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Venice attempt ${attempt}/${VENICE_MAX_ATTEMPTS} failed:`, msg);
        failures.push(clarifyFailure('Venice', msg));
        if (!isVeniceRetryable(msg) || attempt >= VENICE_MAX_ATTEMPTS) break;
        const backoff = VENICE_RETRY_BASE_MS * attempt;
        console.log(`Venice retry backoff ${backoff}ms after:`, msg);
        await sleepMs(backoff);
      }
    }
  }

  // Fallback to OpenRouter
  if (openrouterKey) {
    try {
      const content = await callProvider(
        'https://openrouter.ai/api/v1/chat/completions',
        openrouterKey,
        models?.openrouter || OPENROUTER_CARD_MODEL,
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        false,
      );
      return { content, provider: 'openrouter' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('OpenRouter failed:', msg);
      failures.push(clarifyFailure('OpenRouter', msg));
    }
  }

  // Final fallback: Lovable AI Gateway
  if (lovableKey) {
    try {
      const content = await callProvider(
        'https://ai.gateway.lovable.dev/v1/chat/completions',
        lovableKey,
        'google/gemini-2.5-flash',
        systemPrompt,
        userPrompt,
        maxTokens,
        temperature,
        false,
      );
      return { content, provider: 'lovable' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('Lovable AI Gateway failed:', msg);
      failures.push(clarifyFailure('Lovable', msg));
    }
  }

  if (failures.length === 0) {
    throw new Error('No API keys configured (VENICE_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY)');
  }
  throw new Error(formatCascadeFailure('generic', failures));
}

/** Stream Venice chat completions; abort only if stalled or past max wall clock. */
async function callVeniceStreaming(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const payload = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    stream: true,
    venice_parameters: { include_venice_system_prompt: false },
  };

  const controller = new AbortController();
  const started = Date.now();
  let lastChunkAt = started;
  let settled = false;

  const watchdog = setInterval(() => {
    if (settled) return;
    const now = Date.now();
    if (now - started > VENICE_MAX_WALL_MS) {
      settled = true;
      controller.abort('venice-wall');
      return;
    }
    if (now - lastChunkAt > VENICE_STALL_MS) {
      settled = true;
      controller.abort('venice-stall');
    }
  }, 1000);

  let response: Response;
  try {
    response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    clearInterval(watchdog);
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || '');
      if (reason.includes('wall')) {
        throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms`);
      }
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms (stall before headers)`);
    }
    throw e;
  }

  if (!response.ok) {
    clearInterval(watchdog);
    const errorData = await response.text();
    console.error('Venice LLM API error:', errorData);
    throw new Error(`LLM API error: ${response.status}`);
  }

  if (!response.body) {
    clearInterval(watchdog);
    throw new Error('hung: empty Venice stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let sawChunk = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      lastChunkAt = Date.now();
      sawChunk = true;
      buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line || line.startsWith(':')) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          settled = true;
          clearInterval(watchdog);
          return content;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length) {
            content += delta;
            lastChunkAt = Date.now();
          }
          const full = parsed?.choices?.[0]?.message?.content;
          if (!delta && typeof full === 'string' && full.length) {
            content = full;
            lastChunkAt = Date.now();
          }
        } catch {
          // ignore partial JSON
        }
      }
    }
  } catch (e) {
    clearInterval(watchdog);
    if (controller.signal.aborted) {
      const reason = String(controller.signal.reason || '');
      if (reason.includes('wall')) {
        throw new Error(`hung: wall clock exceeded ${VENICE_MAX_WALL_MS}ms after ${content.length} chars`);
      }
      throw new Error(`hung: no chunk for ${VENICE_STALL_MS}ms after ${content.length} chars`);
    }
    throw e;
  } finally {
    settled = true;
    clearInterval(watchdog);
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  if (!content) {
    throw new Error(sawChunk ? 'hung: stream ended with empty content' : 'hung: connection died with no chunks');
  }
  return content;
}

async function callProvider(
  url: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  temperature: number,
  isVenice = false,
  timeoutMs?: number,
) {
  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
  };
  if (isVenice) {
    payload.venice_parameters = { include_venice_system_prompt: false };
  }

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });
  } catch (e) {
    if (controller?.signal.aborted) {
      throw new Error(`timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const errorData = await response.text();
    console.error('LLM API error:', errorData);
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  if (!content || !String(content).trim()) {
    throw new Error('returned empty (0 chars)');
  }
  return content;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // === HEALTH CHECK ===
    if (action === 'health') {
      // Never report healthy unless at least one provider key is configured.
      // A configured key is still not a guarantee it is valid, but reporting
      // healthy with no key would enable AI buttons that are guaranteed to fail.
      const hasProviderKey = Boolean(
        Deno.env.get('VENICE_API_KEY') || Deno.env.get('OPENROUTER_API_KEY') || Deno.env.get('LOVABLE_API_KEY'),
      );
      const payload = hasProviderKey
        ? { ok: true }
        : { ok: false, reason: 'No provider API key is configured (VENICE_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY).' };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === FETCH URL (Doc Consolidator) ===
    if (action === 'fetch-url') {
      const { url } = body;
      if (!url || typeof url !== 'string') {
        return new Response(JSON.stringify({ error: 'url is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return new Response(JSON.stringify({ error: 'Only http/https URLs are supported' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const response = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DocConsolidator/1.0; +https://nsfw-ai-directory.local)',
          'Accept': 'text/html,text/plain,application/xhtml+xml,*/*',
        },
        redirect: 'follow',
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch URL (HTTP ${response.status})` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();

      // Strip HTML to readable text (best effort) when the response is HTML
      let text = raw;
      if (contentType.includes('text/html') || raw.trimStart().startsWith('<!doctype') || raw.trimStart().startsWith('<html')) {
        text = raw
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&quot;/gi, '"')
          .replace(/&#39;/gi, "'")
          .replace(/\s+/g, ' ')
          .trim();
      }

      const truncated = text.length > 32000;
      const finalText = truncated ? text.slice(0, 32000) : text;

      return new Response(JSON.stringify({ text: finalText, truncated, url: parsedUrl.toString() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === DOC CONSOLIDATOR ===
    if (action === 'consolidate') {
      const { serviceName, text } = body;
      if (!serviceName || !text) {
        return new Response(JSON.stringify({ error: 'serviceName and text are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const prompt = `Consolidate this documentation into a structured markdown expert file for ${serviceName}. Include:
1. **Overview** - Brief description
2. **Setup Steps** - Step-by-step guide
3. **Character Creation Guide**
4. **API Configuration**
5. **NSFW Settings**
6. **Features**
7. **Troubleshooting**

Format with clear markdown headings, bullet points, and code blocks. Be comprehensive but concise.

Documentation:
${text}`;

      const { content: result, provider } = await callLLM('You are a technical documentation specialist. Consolidate raw documentation into clean, structured markdown.', prompt);
      const trimmed = typeof result === 'string' ? result.trim() : '';
      if (!trimmed) {
        return new Response(JSON.stringify({ error: 'AI returned an empty result' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: trimmed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE SINGLE FIELD ===
    // Whole-card rebuild then slice: ingest ALL labeled fields (including F), return ONLY F.
    if (action === 'generate-field') {
      const { fieldName, existingFields, specVersion } = body;
      if (!fieldName) {
        return new Response(JSON.stringify({ error: 'fieldName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const prompt = buildWholeCardUserPrompt(existingFields, isV3) +
        `\n\nSINGLE-FIELD MODE: After building the complete card JSON, the client will keep ONLY "${fieldName}". Still produce the FULL card JSON (all keys). The current text in "${fieldName}" is labeled context above and must be digested like every other field.`;

      const { content: result, provider, card } = await callLLMForWholeCard(CARD_AUTHOR_SYSTEM, prompt, CARD_JSON_MAX_TOKENS, 0.7);

      const flatCard = normalizeWholeCardToHub(card);
      const fieldValue = extractCardField(flatCard, String(fieldName));
      if (fieldValue === undefined) {
        return new Response(JSON.stringify({ result, parseError: true, error: `Full card parsed but missing field ${fieldName}`, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Return ONLY the requested field value - client must not apply other fields.
      return new Response(JSON.stringify({ result: fieldValue, fieldName, wholeCardBuilt: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE ALL FIELDS ===
    // Same whole-card rebuild; client applies all fields like import.
    if (action === 'generate-all') {
      const { existingFields, specVersion } = body;
      const isV3 = specVersion === 'v3' || specVersion === 'V3';
      const prompt = buildWholeCardUserPrompt(existingFields, isV3) +
        `\n\nGENERATE-ALL MODE: Return the complete card JSON. Client will apply every field.`;

      const { content: result, provider, card } = await callLLMForWholeCard(CARD_AUTHOR_SYSTEM, prompt, CARD_JSON_MAX_TOKENS, 0.7);

      const flatHubCard = normalizeWholeCardToHub(card);
      return new Response(JSON.stringify({ result: flatHubCard, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: CONVERT / IMPORT ===
    if (action === 'convert-character') {
      const { inputText, outputFormat } = body;
      if (!inputText) {
        return new Response(JSON.stringify({ error: 'inputText is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const prompt = `You are given character data in an unknown format. Parse ALL the information and convert it into a ${outputFormat || 'V2/V3 compatible'} character card format.

INPUT DATA:
${inputText}

INSTRUCTIONS:
1. Identify all character information regardless of format (Character.AI, Pygmalion, W++, SBF, plain text, JSON, YAML, CCv2, CCv3, or any other format)
2. Map every piece of information to the most appropriate field
3. If info doesn't map directly, place it in the most logical field (description or personality usually)
4. ALL input text must be accounted for — nothing should be discarded
5. Return ONLY valid JSON

OUTPUT FORMAT:
{
  "name": "",
  "description": "",
  "personality": "",
  "scenario": "",
  "first_mes": "",
  "mes_example": "",
  "creator_notes": "",
  "system_prompt": "",
  "post_history_instructions": "",
  "tags": "",
  "creator": "",
  "nickname": "",
  "source": "",
  "group_only_greetings": ""
}

Return ONLY the JSON object, no explanation.`;

      const { content: result, provider } = await callLLM(
        'You are a character card format conversion expert. You can parse any character format and convert to V2/V3 spec. You NEVER discard information. Respond with valid JSON only.',
        prompt, 4096, 0.3
      );

      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return new Response(JSON.stringify({ result, parseError: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE VARIABLE ===
    if (action === 'generate-prompt-variable') {
      const { variableName, variableDescription, templateContext, existingVariables, rawContext } = body;
      if (!variableName) {
        return new Response(JSON.stringify({ error: 'variableName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) {
            contextParts.push(`${key}: ${value}`);
          }
        }
      }

      const prompt = `Generate creative content for the template variable "${variableName}".
${variableDescription ? `Purpose: ${variableDescription}` : ''}
${templateContext ? `This variable is used in this template:\n${templateContext}` : ''}
${contextParts.length > 0 ? `Other filled variables:\n${contextParts.join('\n')}` : ''}
${cappedRaw ? `\nADDITIONAL RAW CONTEXT (use this as source material — extract relevant details for this variable):\n${cappedRaw}` : ''}

Write ONLY the variable value — no labels, no quotes around it, no explanation. Be creative and stay consistent with any existing context. If raw context is provided, extract and adapt relevant information for this specific variable.`;

      const { content: result, provider } = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, and character definitions. Generate concise, fitting content for prompt template variables. When given raw context, intelligently extract and distribute relevant information.',
        prompt,
        PROMPT_VAR_MAX_TOKENS,
        0.8,
        { venice: VENICE_PROMPT_MODEL, openrouter: OPENROUTER_PROMPT_MODEL },
      );

      return new Response(JSON.stringify({ result: result.trim(), provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE ALL VARIABLES ===
    if (action === 'generate-all-prompt-variables') {
      const { templateId, templateName, templateDescription, template, variables, existingVariables, rawContext } = body;
      if (!variables || !Array.isArray(variables)) {
        return new Response(JSON.stringify({ error: 'variables array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const cappedRaw = trimRawContext(rawContext);
      const contextParts: string[] = [];
      if (existingVariables) {
        for (const [key, value] of Object.entries(existingVariables)) {
          if (value && typeof value === 'string' && (value as string).trim()) {
            contextParts.push(`${key}: ${value}`);
          }
        }
      }

      type PromptVariable = { name: string; description: string; placeholder: string };
      const promptVariables = variables.filter((variable: unknown): variable is PromptVariable => {
        if (!variable || typeof variable !== 'object') return false;
        const candidate = variable as Record<string, unknown>;
        return typeof candidate.name === 'string'
          && typeof candidate.description === 'string'
          && typeof candidate.placeholder === 'string';
      });
      const varList = promptVariables.map((variable) => `- ${variable.name}: ${variable.description} (example: ${variable.placeholder})`).join('\n');

      const prompt = `Generate ALL variables for the "${templateName}" prompt template.
Template description: ${templateDescription}

Template:
${template}

Variables to generate:
${varList}

${contextParts.length > 0 ? `EXISTING CONTENT (use as foundation — expand, enhance, stay consistent. Treat existing text as seeds to build from):\n${contextParts.join('\n')}` : 'No variables filled yet — create original, compelling content.'}
${cappedRaw ? `\nRAW CONTEXT (use this as primary source material — extract, adapt, and distribute relevant information into the most appropriate variables):\n${cappedRaw}` : ''}

RESPOND IN VALID JSON FORMAT ONLY. The JSON should have each variable name as a key and the generated content as the value.
Generate ALL variables listed above. Every variable must have a value. Stay consistent across all variables. If raw context or existing content is provided, use it as the foundation — enhance and flesh out, don't just copy.`;

      const { content: result, provider } = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, lorebook entries, and character definitions. Generate rich, detailed, consistent content for all prompt template variables. When given raw context, intelligently extract and distribute relevant information into appropriate variables. ALWAYS respond with valid JSON only — no markdown, no explanation.',
        prompt,
        PROMPT_ALL_VARS_MAX_TOKENS,
        0.8,
        { venice: VENICE_PROMPT_MODEL, openrouter: OPENROUTER_PROMPT_MODEL },
      );

      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return new Response(JSON.stringify({ result, parseError: true, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed, provider }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const upstream = /LLM API error|timeout|All LLM providers failed|No API keys configured/i.test(message);
    const status = upstream ? 502 : 500;
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
