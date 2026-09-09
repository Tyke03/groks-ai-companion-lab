---
name: character-card-studio
description: Hub Character Card Builder rules for Gen All / single-field / Refine -- macros, POV, relational phrasing, refine delta priority.
---

# Character Card Studio

Agent skill for Cursor/Claude authors of Hub CCV2/V3 cards. Chat/completions do **not** load Venice Skills API params -- the edge function inlines a compact copy as `CHARACTER_CARD_STUDIO_SKILL_RULES` (keep that const in sync with this file).

## Macros

- Use lowercase `{{user}}` / `{{char}}` only.
- Possessives: `{{user}}'s` / `{{char}}'s` -- never `{{User's}}` / `{{user's}}`.
- Ban "The User" / "the user" as nouns -- write `{{user}}`.
- Ban `User:` / `Name:` speaker labels -- use `{{user}}:` / `{{char}}:`.

## POV

| Field | Correct | Banned |
| --- | --- | --- |
| description / personality / scenario | 3rd-person authorial about `{{char}}` | "You are...", `{{user}}` diary |
| first_mes | IC opener as `{{char}}` (*actions* + dialogue) | multi-`<START>`, User: labels |
| mes_example | `{{user}}:`/`{{char}}:` Block1 Public -> Block2 Private -> Block3 High stakes | three hellos |
| system_prompt | 2nd-person meta directives for the chat model | mid-scene RP |

## Relational phrasing

**Correct**

- `{{char}} is {{user}}'s younger sister`
- `{{char}} is the younger sister of {{user}}`

**Banned**

- `the user's sister` / `the user's [relation]`
- bare `the user`
- `your sister` / `your [relation]` when meaning `{{user}}`'s bond to `{{char}}`
- Wikipedia bio: `X, the user's Y, is...`

## Refine delta rule (mandatory)

1. Rules / POV / skill first.
2. **Creator critique first** with mandatory directive priority: critique **overrides** conflicting draft; model **MUST actively modify**; do **not** copy draft unchanged when notes conflict; preserve only parts that do **not** conflict.
3. Then current draft.
4. Then other card context.
5. Output only field text (or full Hub flat JSON for refine-all).

Same priority for Gen All refine appendix: critique first + mandatory priority, then preservation of non-conflicting parts.
