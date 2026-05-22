import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

function calcHoursSlept(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let diff = (wh * 60 + wm) - (bh * 60 + bm)
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const {
    check_in_type, check_in_date,
    bedtime, wake_time, sleep_quality,
    primary_mood_morning, primary_mood_eod, secondary_moods, momentum_scores,
    exercised, exercise_types, exercise_sessions, exercise_duration_minutes,
    alcohol_spirits, alcohol_beer, alcohol_wine,
    supplements,
    behaviours,
    goals_today, highlights, goals_tomorrow,
    weather_postcode, weather_lat, weather_lng, weather_location_label, weather_snapshot
  } = body

  if (!check_in_type || !check_in_date) {
    return new Response(JSON.stringify({ error: 'check_in_type and check_in_date are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const hours_slept = calcHoursSlept(bedtime, wake_time)
  const submitted_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('check_ins')
    .insert([{
      user_id: user.id,
      check_in_type, check_in_date, submitted_at,
      bedtime, wake_time, hours_slept, sleep_quality,
      primary_mood_morning, primary_mood_eod, secondary_moods, momentum_scores,
      exercised, exercise_types, exercise_sessions, exercise_duration_minutes,
      alcohol_spirits, alcohol_beer, alcohol_wine,
      supplements,
      behaviours,
      goals_today, highlights, goals_tomorrow,
      weather_postcode, weather_lat, weather_lng, weather_location_label, weather_snapshot
    }])
    .select()
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } })
}
