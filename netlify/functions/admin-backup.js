import { supabase } from './_shared/supabase.js'
import { getAuthAdmin } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

  const admin = await getAuthAdmin(req)
  if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const [profilesRes, checkInsRes, supplementsRes, behavioursRes, moodDimsRes, momentumRes, weightsRes] = await Promise.all([
    supabase.from('profiles').select('id, first_name, email, created_at').order('created_at'),
    supabase.from('check_ins').select('*').order('check_in_date').order('check_in_type'),
    supabase.from('supplements').select('*').order('sort_order'),
    supabase.from('behaviours').select('*').order('sort_order'),
    supabase.from('mood_dimensions').select('*').order('sort_order'),
    supabase.from('momentum_items').select('*').order('sort_order'),
    supabase.from('weights').select('*'),
  ])

  for (const [label, res] of [
    ['profiles', profilesRes], ['check_ins', checkInsRes], ['supplements', supplementsRes],
    ['behaviours', behavioursRes], ['mood_dimensions', moodDimsRes],
    ['momentum_items', momentumRes], ['weights', weightsRes],
  ]) {
    if (res.error) return new Response(JSON.stringify({ error: `${label}: ${res.error.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  // Group everything by user_id
  const group = (rows, key = 'user_id') =>
    (rows ?? []).reduce((acc, r) => { ;(acc[r[key]] ??= []).push(r); return acc }, {})

  const ciByUser      = group(checkInsRes.data)
  const suppByUser    = group(supplementsRes.data)
  const behByUser     = group(behavioursRes.data)
  const moodByUser    = group(moodDimsRes.data)
  const momByUser     = group(momentumRes.data)
  const weightsByUser = group(weightsRes.data)

  const users = (profilesRes.data ?? []).map(p => ({
    id: p.id,
    email: p.email,
    first_name: p.first_name,
    created_at: p.created_at,
    config: {
      default_postcode: weightsByUser[p.id]?.[0]?.default_postcode ?? null,
      supplements:      suppByUser[p.id]  ?? [],
      behaviours:       behByUser[p.id]   ?? [],
      mood_dimensions:  moodByUser[p.id]  ?? [],
      momentum_items:   momByUser[p.id]   ?? [],
    },
    check_ins: ciByUser[p.id] ?? [],
  }))

  const exported_at   = new Date().toISOString()
  const total_checkins = (checkInsRes.data ?? []).length
  const payload = { exported_at, total_users: users.length, total_checkins, users }

  const date = exported_at.slice(0, 10)
  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="cci-backup-${date}.json"`,
    },
  })
}
