import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

const SCHEMA = {
  check_in_type: "'morning' | 'evening'",
  check_in_date: "'YYYY-MM-DD' — date of the check-in",
  primary_mood_morning: "integer 1–5 | null — morning check-in only. 1=very low, 5=excellent",
  primary_mood_eod: "integer 1–5 | null — evening check-in only",
  secondary_moods: "{ [dimension_id]: integer 1–5 } | null — use IDs from config.mood_dimensions",
  momentum_scores: "{ [item_id]: integer 1–5 } | null — use IDs from config.momentum_items. Evening only.",
  sleep_quality: "integer 1–5 | null — morning only. 1=bad, 2=not great, 3=okay, 4=good, 5=excellent",
  bedtime: "'HH:MM' | null — morning only, time the previous night (e.g. '23:30')",
  wake_time: "'HH:MM' | null — morning only (e.g. '07:15')",
  hours_slept: "number | null — morning only, decimal hours (e.g. 7.75)",
  exercised: "boolean | null",
  exercise_types: "string[] | null — subset of ['Running', 'Cycling', 'Walking', 'Strength']",
  alcohol_logged: "boolean | null — null = not answered (skip section), false = explicitly no alcohol, true = drank (record units below)",
  alcohol_spirits: "number | null — units of spirits. Only set when alcohol_logged is true. null otherwise.",
  alcohol_beer: "number | null — units of beer. Only set when alcohol_logged is true. null otherwise.",
  alcohol_wine: "number | null — units of wine. Only set when alcohol_logged is true. null otherwise.",
  supplements: "{ [name]: boolean } | null — supplement names must exactly match config.supplements",
  behaviours: "{ [name]: boolean } | null — behaviour names must exactly match config.behaviours",
  mindfulness_meditation: "boolean | null",
  mindfulness_yoga: "boolean | null",
  outside_time: "boolean | null — true if spent time outside",
  social_media: "boolean | null — true means AVOIDED social media",
  goals_today: "string[] | null — morning only, up to 3 goals (e.g. ['Finish the report', 'Go for a run'])",
  goals_today_completed: "string[] | null — evening only. Parallel array to the morning's goals_today. Each entry: 'achieved' | 'not_achieved' | null (null = not answered, excluded from analytics)",
  goals_tomorrow: "string[] | null — evening only, goals for tomorrow",
  highlights: "string[] | null — evening only, what made today good",
}

const EXAMPLES = {
  morning: {
    check_in_type: 'morning',
    check_in_date: '2026-04-01',
    primary_mood_morning: 4,
    primary_mood_eod: null,
    secondary_moods: null,
    momentum_scores: null,
    sleep_quality: 4,
    bedtime: '23:00',
    wake_time: '07:00',
    hours_slept: 8,
    exercised: null,
    exercise_types: null,
    alcohol_logged: null,
    alcohol_spirits: null,
    alcohol_beer: null,
    alcohol_wine: null,
    supplements: null,
    behaviours: null,
    mindfulness_meditation: null,
    mindfulness_yoga: null,
    outside_time: null,
    social_media: null,
    goals_today: ['Finish the project proposal', 'Get outside for a walk'],
    goals_tomorrow: null,
    highlights: null,
  },
  evening: {
    check_in_type: 'evening',
    check_in_date: '2026-04-01',
    primary_mood_morning: null,
    primary_mood_eod: 3,
    secondary_moods: null,
    momentum_scores: null,
    sleep_quality: null,
    bedtime: null,
    wake_time: null,
    hours_slept: null,
    exercised: true,
    exercise_types: ['Walking'],
    alcohol_logged: true,
    alcohol_spirits: null,
    alcohol_beer: null,
    alcohol_wine: 1.5,
    supplements: null,
    behaviours: null,
    mindfulness_meditation: false,
    mindfulness_yoga: false,
    outside_time: true,
    social_media: true,
    goals_today: null,
    goals_today_completed: ['achieved', 'not_achieved'],
    goals_tomorrow: ['Wake up early', 'Finish the proposal'],
    highlights: ['Good walk in the afternoon', 'Productive morning'],
  },
}

const AI_PROMPT = `I want to create realistic check-in data for a habit tracking app called Chicken Check-In.

In this file you'll find:
- \`config\`: the supplements, behaviours, mood dimensions, and momentum items tracked in this account
- \`schema\`: every check-in field with its data type and meaning
- \`examples\`: one sample morning and one sample evening check-in showing the exact format

Please help me create a demo persona. I'll describe them below, and you'll generate approximately 35 days of realistic check-in data — both morning and evening for most days, with realistic gaps for missed check-ins.

Return a single JSON object in this exact format:
{
  "config": {
    "supplements": [...],
    "behaviours": [...],
    "mood_dimensions": [...],
    "momentum_items": [...]
  },
  "checkins": [ ...array of check-in objects matching the schema and examples... ]
}

The config in the response should reflect the persona's actual tracked items. If the config arrays above are empty, invent appropriate ones for the persona — see the example config below for the expected structure and format.

Example config (for reference — replace with persona-appropriate values):
{
  "supplements": [
    { "name": "Vitamin D" },
    { "name": "Magnesium" },
    { "name": "Omega 3" }
  ],
  "behaviours": [
    { "name": "Read before bed" },
    { "name": "No phone after 9pm" },
    { "name": "Packed lunch" },
    { "name": "Journalled" }
  ],
  "mood_dimensions": [
    { "id": "energy", "name": "Energy" },
    { "id": "stress", "name": "Stress" },
    { "id": "focus", "name": "Focus" },
    { "id": "motivation", "name": "Motivation" }
  ],
  "momentum_items": [
    { "id": "project_a", "name": "Side project" },
    { "id": "fitness_goal", "name": "Fitness goal" },
    { "id": "learning", "name": "Learning / study" }
  ]
}

Important — config field names:
- supplements and behaviours: objects with a "name" field only
- mood_dimensions: objects with both "id" (short snake_case, unique) and "name" (display label)
- momentum_items: objects with both "id" (short snake_case, unique) and "name" (display label)
- The id values you choose for mood_dimensions and momentum_items must be used as keys in secondary_moods and momentum_scores in every check-in

Important rules for realistic check-in data:
- goals_today, goals_tomorrow, highlights must be arrays of strings (or null) — e.g. ["Finish report", "Go for a run"]. Never plain strings.
- Alcohol: set alcohol_logged to true/false/null. If true, set unit fields (null for types not consumed, number ≥ 0 for types consumed). If false or null, all unit fields must be null.
- Sleep: bedtime 22:00–01:00, wake time 06:00–08:30. hours_slept should match the difference. sleep_quality is 1–5 (1=bad, 5=excellent).
- Moods: vary naturally — include low days (1–2), average days (3), and good days (4–5). Don't make every day a 4 or 5.
- behaviours keys must exactly match the "name" values from config.behaviours
- supplements keys must exactly match the "name" values from config.supplements
- secondary_moods keys must exactly match the "id" values from config.mood_dimensions
- momentum_scores keys must exactly match the "id" values from config.momentum_items
- Include realistic missed check-ins (roughly 15–20% of evenings, 5–10% of mornings)
- The date range should be approximately the 35 days ending yesterday

My persona:
[Describe the person here: name, age, job, general lifestyle, exercise habits, typical alcohol use, what they are trying to track or improve, personality traits, stressors, etc. The more detail you give, the more realistic and interesting the data will be.]`

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const [suppRes, behRes, moodRes, momRes] = await Promise.all([
    supabase.from('supplements').select('id, name, sort_order').eq('user_id', user.id).eq('active', true).order('sort_order'),
    supabase.from('behaviours').select('id, name, weight, sort_order').eq('user_id', user.id).eq('active', true).order('sort_order'),
    supabase.from('mood_dimensions').select('id, name, five_is_good, paused, sort_order').eq('user_id', user.id).eq('active', true).order('sort_order'),
    supabase.from('momentum_items').select('id, name, paused, sort_order').eq('user_id', user.id).eq('active', true).order('sort_order'),
  ])

  const kit = {
    _instructions: 'This is a Chicken Check-In starter kit. Give this file to an AI (e.g. Claude at claude.ai) along with a description of a fictitious persona. The AI will generate realistic demo check-in data that you can then import via the Demo data section on the Account page.',
    _ai_prompt: AI_PROMPT,
    config: {
      supplements: suppRes.data ?? [],
      behaviours: behRes.data ?? [],
      mood_dimensions: moodRes.data ?? [],
      momentum_items: momRes.data ?? [],
    },
    schema: SCHEMA,
    examples: EXAMPLES,
  }

  const today = new Date().toISOString().slice(0, 10)
  return new Response(JSON.stringify(kit, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cci-starter-kit-${today}.json"`,
    },
  })
}
