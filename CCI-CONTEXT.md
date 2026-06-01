# Chicken Check-In — Context for Data Analysis

This document provides context for AI analysis of Chicken Check-In (CCI) data exports. It describes what the app is, what each field means, and how to interpret the data.

---

## What is Chicken Check-In?

Chicken Check-In is a personal daily habit and wellbeing tracker used by a single person. It captures two structured check-ins per day — one in the morning and one in the evening — giving a richer picture of daily patterns than a single daily entry.

The data is entirely first-person. All check-ins belong to one person. There are no other users in this dataset.

**Purpose:** To track mood, sleep, behaviours, and habits over time, and to identify patterns — including correlations with weather, lifestyle choices (alcohol, exercise, sleep), and life events.

---

## Check-In Structure

### Morning check-in
Captured shortly after waking. Focuses on:
- Sleep quality and duration from the night before
- Mood at the start of the day
- Goals for the day (up to 3)
- Supplements taken
- Life context (what's going on in life at the moment — ongoing situations, events, context)

### Evening check-in
Captured at the end of the day. Focuses on:
- Behaviours and events during the day (exercise, alcohol, mindfulness, custom events)
- End-of-day mood
- Project/focus scores
- Reflection on today's goals (did they get done?)
- Memorable moments from the day
- Goals for tomorrow
- Life context
- Supplements taken

Both check-ins also capture weather data (temperature and conditions at the time of submission) via the user's location.

---

## Data Schema

### `check_in_type`
`"morning"` or `"evening"`

### `check_in_date`
`"YYYY-MM-DD"` — the calendar date the check-in is for (not the submission time). Past dates can be filled in retroactively.

### `submitted_at`
ISO 8601 timestamp — when the check-in was actually saved.

---

## Mood Fields

### `primary_mood_morning`
Integer 1–5. Mood at the start of the day. Only set on morning check-ins.
- 1 = Very low / struggling
- 2 = Below average
- 3 = Neutral / okay
- 4 = Good
- 5 = Excellent

### `primary_mood_eod`
Integer 1–5. End-of-day mood. Only set on evening check-ins. Same scale as above.

### `secondary_moods`
JSON object `{ "Dimension Name": integer 1–5 }`. Custom mood dimensions configured by the user (e.g. anxiety, energy, focus). In exports, the keys are the human-readable dimension names. The scale direction can vary per dimension — the `config.mood_dimensions` block in the export lists each dimension's scale direction (`"1=worst, 5=best"` or `"1=best, 5=worst"`). For example, for an anxiety dimension where `five_is_good` is false: 1 = calm, 5 = very anxious.

---

## Sleep Fields
Only set on morning check-ins (occasionally mirrored on evening if morning data was entered there).

### `sleep_quality`
Integer 1–5.
- 1 = Bad
- 2 = Not great
- 3 = Okay
- 4 = Good
- 5 = Excellent

### `bedtime`
`"HH:MM"` — time the user went to bed the previous night (e.g. `"23:30"`).

### `wake_time`
`"HH:MM"` — time the user woke up (e.g. `"07:15"`).

### `hours_slept`
Decimal number — calculated from bedtime and wake time (e.g. `7.75` = 7 hours 45 minutes). Handles overnight wrap (e.g. bedtime 23:00, wake 07:00 = 8 hours).

---

## Exercise Fields

### `exercised`
Boolean. `true` if any exercise was done.

### `exercise_types`
Array of strings. Subset of `["aerobic", "strength", "walking"]`.
- `aerobic` — running, spinning, swimming, tennis, etc.
- `strength` — gym, pilates, etc.
- `walking` — strenuous walks, hiking

### `exercise_sessions`
Integer. Number of exercise sessions.

### `exercise_duration_minutes`
Integer. Total exercise duration in minutes.

---

## Alcohol Fields

### `alcohol_logged`
Three-state boolean:
- `null` — not answered / skipped (treat as unknown, not as "no alcohol")
- `false` — explicitly logged as no alcohol consumed
- `true` — drank alcohol (amounts in the fields below)

### `alcohol_spirits` / `alcohol_beer` / `alcohol_wine`
Decimal numbers. Units of alcohol consumed. Only meaningful when `alcohol_logged` is `true`. UK alcohol units (a standard glass of wine ≈ 2 units, a pint of beer ≈ 2–3 units, a single measure of spirits ≈ 1 unit).

---

## Mindfulness, Supplements, Behaviours

### `supplements`
JSON object `{ "Supplement Name": boolean }`. Tracks whether configured supplements were taken. Names are user-defined. `true` = taken, `false` = not taken. Fields are only present for supplements that exist in the config at the time of the check-in.

### `behaviours`
JSON object `{ "Behaviour Name": boolean }`. User-defined events/behaviours tracked as yes/no (e.g. "Meditated", "Avoided social media", "Outside time"). Names and which ones are tracked are user-configured. `true` = did it, `false` = didn't.

---

## Goals & Reflections

### `goals_today`
Array of strings (up to 3). Goals the user set for the day. Morning check-in only.

### `goals_today_completed`
Array of strings. Evening check-in only. Parallel array to the morning's `goals_today`. Each entry:
- `"achieved"` — goal was completed
- `"not_achieved"` — goal was not completed
- `null` — not answered

### `highlights`
Array of strings (up to 3). Memorable moments from the day. Evening check-in only.

### `goals_tomorrow`
Array of strings (up to 3). Goals for the following day. Evening check-in only.

---

## Life Context

### `life_context`
Free text. Open-ended notes about what's going on in the user's life at the time — ongoing situations, life events, stressful periods, positive milestones, travel, health issues, work changes, etc. This field provides qualitative context that can help explain patterns in mood, sleep, or behaviour data. Can be filled in on either morning or evening; the evening form pre-populates from the morning value if left blank.

---

## Projects / Focus

### `momentum_scores`
JSON object `{ "Project Name": integer 1–5 }`. User-defined projects or focus areas scored 1–5 each evening. Equivalent to a daily check on how well a project is progressing or how much focus it received. In exports, the keys are the human-readable project names. Evening check-in only.

---

## Weather Fields

Weather is captured at the time of check-in from the user's location (UK-based).

### `weather_snapshot`
JSON object:
```json
{
  "current": { "temp": 14.2, "code": 2 },
  "hourly": [
    { "time": "2026-05-15T08:00", "hour": "8am", "temp": 12.1, "code": 1, "isForecast": false },
    ...
  ]
}
```
`temp` is in °C. `code` is a WMO weather interpretation code:
- 0 = Clear sky
- 1–3 = Mainly clear / partly cloudy / overcast
- 45–48 = Fog
- 51–67 = Drizzle / rain
- 71–77 = Snow
- 80–82 = Rain showers
- 85–86 = Snow showers
- 95 = Thunderstorm
- 96–99 = Thunderstorm with hail

### `weather_lat` / `weather_lng`
Decimal coordinates of the location used for weather.

### `weather_location_label`
Human-readable location name (e.g. `"SE1 7PB"` or `"London"`).

---

## Config Tables (Reference Data)

These tables define what the user is tracking. They are relatively static and provide the keys/names used in `supplements`, `behaviours`, `secondary_moods`, and `momentum_scores`.

### `mood_dimensions`
Custom mood dimensions. Key fields: `id`, `name`, `five_is_good` (boolean — if false, 1 is the desirable end of the scale).

### `supplements`
Supplements to track. Key fields: `id`, `name`.

### `behaviours`
Events/habits to track as yes/no. Key fields: `id`, `name`, `weight` (integer: positive = good, negative = undesirable, 0 = neutral).

### `momentum_items`
Projects or focus areas scored 1–5 each evening. Key fields: `id`, `name`.

---

## Interpreting the Data

**A "complete" day** has both a morning and an evening check-in. Many days will have only one or the other.

**Null vs false/zero:** In most fields, `null` means "not recorded" — not the same as "didn't happen". For alcohol specifically, `alcohol_logged: null` means the question was skipped; `alcohol_logged: false` means explicitly no alcohol.

**Date gaps are normal.** The user doesn't check in every single day. Gaps don't indicate anything other than the check-in was not completed.

**The `life_context` field** is the richest qualitative signal. When mood, sleep, or behaviour patterns shift, checking `life_context` entries around that time often explains why.

**Weather correlation** is a deliberate design feature. The data supports analysis of mood/energy vs. temperature, sunshine, or rain.

**Goals completion rate** can be computed from `goals_today` (morning) paired with `goals_today_completed` (evening, same date). A goal is achieved if its parallel entry is `"achieved"`.

**Sleep quality vs hours slept** are separate dimensions — high hours doesn't always mean high quality (and vice versa).
