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

Good shape:
<START>
{{user}}: Hey Riley, I'm so excited to be working with you.
{{char}}: *giggles* I'm excited to have you on board, too! I think we're going to make some magic happen. *she leans in close* But first, let's get one thing straight - I'm the boss, and you're going to have to do what I say. *she winks*

<START>
{{user}}: ...
{{char}}: ...
`;

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

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = 4096, temperature = 0.3) {
  const veniceKey = Deno.env.get('VENICE_API_KEY');
  const openrouterKey = Deno.env.get('OPENROUTER_API_KEY');
  const lovableKey = Deno.env.get('LOVABLE_API_KEY');

  // Try Venice first
  if (veniceKey) {
    try {
      return await callProvider('https://api.venice.ai/api/v1/chat/completions', veniceKey, 'llama-3.3-70b', systemPrompt, userPrompt, maxTokens, temperature);
    } catch (e) {
      console.error('Venice failed:', e);
    }
  }

  // Fallback to OpenRouter
  if (openrouterKey) {
    try {
      return await callProvider('https://openrouter.ai/api/v1/chat/completions', openrouterKey, 'meta-llama/llama-3.3-70b-instruct:free', systemPrompt, userPrompt, maxTokens, temperature);
    } catch (e) {
      console.error('OpenRouter failed:', e);
    }
  }

  // Final fallback: Lovable AI Gateway
  if (lovableKey) {
    try {
      return await callProvider('https://ai.gateway.lovable.dev/v1/chat/completions', lovableKey, 'google/gemini-2.5-flash', systemPrompt, userPrompt, maxTokens, temperature);
    } catch (e) {
      console.error('Lovable AI Gateway failed:', e);
      throw e;
    }
  }

  throw new Error('No API keys configured');
}

async function callProvider(url: string, apiKey: string, model: string, systemPrompt: string, userPrompt: string, maxTokens: number, temperature: number) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error('LLM API error:', errorData);
    throw new Error(`LLM API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
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

      const result = await callLLM('You are a technical documentation specialist. Consolidate raw documentation into clean, structured markdown.', prompt);
      const trimmed = typeof result === 'string' ? result.trim() : '';
      if (!trimmed) {
        return new Response(JSON.stringify({ error: 'AI returned an empty result' }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ result: trimmed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE SINGLE FIELD ===
    if (action === 'generate-field') {
      const { fieldName, fieldDescription, existingFields, keywords } = body;
      if (!fieldName) {
        return new Response(JSON.stringify({ error: 'fieldName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const contextParts = collectContextParts(existingFields);

      let extraRules = '';
      let maxTokens = 2048;
      if (fieldName === 'mes_example') {
        maxTokens = 3500;
        extraRules = `\n\n${MES_EXAMPLE_FORMAT_RULES}\nWrite ONLY the mes_example content — no JSON, no markdown fences, no field labels.`;
      } else if (fieldName === 'alternate_greetings' || fieldName === 'group_only_greetings') {
        maxTokens = 2048;
        extraRules = `\n\nReturn EXACTLY 3 greeting messages as a JSON array of strings (["greeting1","greeting2","greeting3"]). Each greeting should be a full opening message with *actions* and natural dialogue, steered from the character context. No markdown fences.`;
      } else if (fieldName === 'first_mes') {
        extraRules = `\n\nWrite a vivid opening message using *asterisks for actions* and natural dialogue (no wrapping the whole message in quotes). Stay consistent with the character.`;
      }

      const prompt = `Generate content for the "${fieldName}" field of a character card.
${fieldDescription ? `Field purpose: ${fieldDescription}` : ''}
${keywords ? `Keywords/seed content to build from: ${keywords}` : ''}

${contextParts.length > 0 ? `FULL CHARACTER CONTEXT (use ALL of this to inform your generation — stay consistent, expand on existing details, never contradict):\n${contextParts.join('\n')}` : 'No other fields filled yet — create something original and compelling.'}

IMPORTANT: Build upon and expand the existing character context. If keywords/seed text is provided, use them as the foundation but enhance and flesh out the content significantly. Write ONLY the field content — no labels, no markdown headers, no explanation.${extraRules}
${fieldName !== 'mes_example' && fieldName !== 'alternate_greetings' && fieldName !== 'group_only_greetings' ? 'For dialogue/message fields, use *asterisks for actions* and natural spoken dialogue (not Name: labels).' : ''}`;

      const result = await callLLM(
        'You are an expert character card creator for AI roleplay platforms (SillyTavern, TavernAI, Chub.ai). You write vivid, detailed, engaging character definitions. Always stay consistent with any existing character context provided. Never contradict existing fields — build upon them.',
        prompt, maxTokens, 0.8
      );

      return new Response(JSON.stringify({ result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === CHARACTER CARD: GENERATE ALL FIELDS ===
    if (action === 'generate-all') {
      const { existingFields, specVersion } = body;

      const allFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'system_prompt', 'post_history_instructions', 'creator_notes', 'tags', 'nickname', 'source', 'alternate_greetings', 'group_only_greetings'];

      const contextParts = collectContextParts(existingFields, allFields);
      const isV3 = specVersion === 'v3' || specVersion === 'V3';

      const prompt = `Generate a COMPLETE character card. Fill ALL of these fields: ${allFields.join(', ')}

${contextParts.length > 0 ? `EXISTING CONTENT (use as foundation — expand, enhance, and flesh out each field. Treat any existing text as keywords/seeds to build from. Spread details into the most appropriate fields. Do NOT simply copy existing text — improve it):\n${contextParts.join('\n')}` : 'No fields filled — create a completely original character.'}

RESPOND IN VALID JSON FORMAT ONLY. The JSON should have each field name as a key and the generated content as the value.

Field guidelines:
- name: A memorable character name (if provided, keep it)
- description: 2-4 paragraphs covering appearance, background, abilities, and key traits
- personality: Comma-separated personality traits with brief explanations
- scenario: The setting/situation where the user meets this character
- first_mes: The character's opening message with *actions* and natural dialogue
- mes_example: ${MES_EXAMPLE_FORMAT_RULES}
  Encode mes_example as a single JSON string with real line breaks between <START> blocks. Never collapse the three blocks onto one line.
- system_prompt: Instructions for the AI on how to roleplay this character
- post_history_instructions: Brief reminder inserted after chat history
- creator_notes: Notes for other users about how to best use this character
- tags: Comma-separated tags for categorization
- nickname: Alternative name or alias
- source: Array of source URL strings if known; otherwise []
- alternate_greetings: REQUIRED — a JSON array of EXACTLY 3 distinct alternate opening messages (full greetings with *actions* and dialogue), each usable instead of first_mes. Never leave this empty or as a single string.
- group_only_greetings: A JSON array of 1-3 group-chat greetings that acknowledge other characters are present. Prefer a non-empty array when useful; otherwise [].

Generate ALL fields. Write engaging, detailed content that is consistent across all fields. Do not leave alternate_greetings blank when generation succeeds.${isV3 ? ' Prefer filling V3 list fields (source, group_only_greetings) as arrays.' : ' Include group_only_greetings as an array when you can honestly invent useful group openers; otherwise [].'}`;

      const result = await callLLM(
        'You are an expert character card creator. Create rich, detailed, engaging characters for AI roleplay. ALWAYS respond with valid JSON only — no markdown, no explanation, just the JSON object. Generate ALL requested fields, including alternate_greetings as an array of exactly 3 strings and mes_example with three <START> blocks.',
        prompt, 4096, 0.8
      );

      let parsed: Record<string, unknown> = {};
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return new Response(JSON.stringify({ result, parseError: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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

      const result = await callLLM(
        'You are a character card format conversion expert. You can parse any character format and convert to V2/V3 spec. You NEVER discard information. Respond with valid JSON only.',
        prompt, 4096, 0.3
      );

      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return new Response(JSON.stringify({ result, parseError: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE VARIABLE ===
    if (action === 'generate-prompt-variable') {
      const { variableName, variableDescription, templateContext, existingVariables, rawContext } = body;
      if (!variableName) {
        return new Response(JSON.stringify({ error: 'variableName is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

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
${rawContext ? `\nADDITIONAL RAW CONTEXT (use this as source material — extract relevant details for this variable):\n${rawContext}` : ''}

Write ONLY the variable value — no labels, no quotes around it, no explanation. Be creative and stay consistent with any existing context. If raw context is provided, extract and adapt relevant information for this specific variable.`;

      const result = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, and character definitions. Generate concise, fitting content for prompt template variables. When given raw context, intelligently extract and distribute relevant information.',
        prompt, 512, 0.8
      );

      return new Response(JSON.stringify({ result: result.trim() }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === PROMPT BUILDER: GENERATE ALL VARIABLES ===
    if (action === 'generate-all-prompt-variables') {
      const { templateId, templateName, templateDescription, template, variables, existingVariables, rawContext } = body;
      if (!variables || !Array.isArray(variables)) {
        return new Response(JSON.stringify({ error: 'variables array is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

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
${rawContext ? `\nRAW CONTEXT (use this as primary source material — extract, adapt, and distribute relevant information into the most appropriate variables):\n${rawContext}` : ''}

RESPOND IN VALID JSON FORMAT ONLY. The JSON should have each variable name as a key and the generated content as the value.
Generate ALL variables listed above. Every variable must have a value. Stay consistent across all variables. If raw context or existing content is provided, use it as the foundation — enhance and flesh out, don't just copy.`;

      const result = await callLLM(
        'You are a creative writer specializing in AI roleplay prompts, scenarios, lorebook entries, and character definitions. Generate rich, detailed, consistent content for all prompt template variables. When given raw context, intelligently extract and distribute relevant information into appropriate variables. ALWAYS respond with valid JSON only — no markdown, no explanation.',
        prompt, 2048, 0.8
      );

      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        return new Response(JSON.stringify({ result, parseError: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ result: parsed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
