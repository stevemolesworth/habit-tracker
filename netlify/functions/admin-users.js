import { supabase } from './_shared/supabase.js'
import { getAuthAdmin } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const admin = await getAuthAdmin(req)
  if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const { data: profiles, error: profErr } = await supabase.from('profiles').select('id, first_name, email, created_at')
  if (profErr) return new Response(JSON.stringify({ error: profErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  const [{ data: checkins, error: ciErr }, { data: behaviourRows, error: behErr }] = await Promise.all([
    supabase.from('check_ins').select('user_id, check_in_date'),
    supabase.from('behaviours').select('user_id')
  ])
  if (ciErr) return new Response(JSON.stringify({ error: ciErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  if (behErr) return new Response(JSON.stringify({ error: behErr.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  // Aggregate per user
  const stats = {}
  for (const c of checkins) {
    if (!stats[c.user_id]) stats[c.user_id] = { count: 0, last: null }
    stats[c.user_id].count++
    if (!stats[c.user_id].last || c.check_in_date > stats[c.user_id].last) {
      stats[c.user_id].last = c.check_in_date
    }
  }

  const behaviourCounts = {}
  for (const b of (behaviourRows || [])) {
    behaviourCounts[b.user_id] = (behaviourCounts[b.user_id] || 0) + 1
  }

  const users = profiles.map(p => ({
    ...p,
    checkin_count: stats[p.id]?.count || 0,
    last_checkin_date: stats[p.id]?.last || null,
    behaviours_monitored: behaviourCounts[p.id] || 0
  })).sort((a, b) => {
    if (!a.last_checkin_date && !b.last_checkin_date) return 0
    if (!a.last_checkin_date) return 1
    if (!b.last_checkin_date) return -1
    return b.last_checkin_date.localeCompare(a.last_checkin_date)
  })

  const total_checkins = checkins.length

  return new Response(JSON.stringify({ users, total_checkins }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
