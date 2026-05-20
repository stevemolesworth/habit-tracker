import { supabase } from './_shared/supabase.js'
import { getAuthAdmin } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const admin = await getAuthAdmin(req)
  if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const [{ data: profile, error: profErr }, { data: checkins, error: ciErr }, { data: behaviourRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).single(),
    supabase.from('check_ins').select('check_in_date, weather_location_label').eq('user_id', id).order('check_in_date', { ascending: false }),
    supabase.from('behaviours').select('id').eq('user_id', id)
  ])

  if (profErr) return new Response(JSON.stringify({ error: profErr.message }), { status: profErr.code === 'PGRST116' ? 404 : 500, headers: { 'Content-Type': 'application/json' } })
  if (ciErr) return new Response(JSON.stringify({ error: ciErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const checkinCount = checkins.length
  const firstCheckin = checkins.length ? checkins[checkins.length - 1].check_in_date : null
  const lastCheckin = checkins.length ? checkins[0].check_in_date : null
  const location = checkins.find(c => c.weather_location_label)?.weather_location_label || null
  const country = location?.includes(',') ? location.split(',').pop().trim() : null

  const behavioursMonitored = behaviourRows?.length ?? 0

  let avgPerWeek = null
  if (firstCheckin && lastCheckin && firstCheckin !== lastCheckin) {
    const days = (new Date(lastCheckin) - new Date(firstCheckin)) / 86400000
    const weeks = days / 7
    avgPerWeek = weeks > 0 ? Math.round((checkinCount / weeks) * 10) / 10 : null
  }

  return new Response(JSON.stringify({
    ...profile,
    checkin_count: checkinCount,
    first_checkin: firstCheckin,
    last_checkin: lastCheckin,
    location,
    country,
    behaviours_monitored: behavioursMonitored,
    avg_checkins_per_week: avgPerWeek
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
