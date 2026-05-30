import { supabase } from './_shared/supabase.js'
import { getAuthAdmin } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const admin = await getAuthAdmin(req)
  if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  let backup
  try {
    backup = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (!Array.isArray(backup?.users)) {
    return new Response(JSON.stringify({ error: 'Invalid backup format: missing users array' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { data: existingProfiles } = await supabase.from('profiles').select('id')
  const existingIds = new Set((existingProfiles ?? []).map(p => p.id))

  const results = []
  let totalCheckIns = 0

  for (const user of backup.users) {
    if (!existingIds.has(user.id)) {
      results.push({ id: user.id, email: user.email, status: 'skipped', reason: 'user not found' })
      continue
    }

    const uid = user.id
    const errors = []

    if (user.check_ins?.length) {
      const { error } = await supabase.from('check_ins').upsert(
        user.check_ins.map(ci => ({ ...ci, user_id: uid })),
        { onConflict: 'id' }
      )
      if (error) errors.push(`check_ins: ${error.message}`)
      else totalCheckIns += user.check_ins.length
    }

    for (const table of ['supplements', 'behaviours', 'mood_dimensions', 'momentum_items']) {
      const rows = user.config?.[table]
      if (rows?.length) {
        const { error } = await supabase.from(table).upsert(
          rows.map(r => ({ ...r, user_id: uid })),
          { onConflict: 'id' }
        )
        if (error) errors.push(`${table}: ${error.message}`)
      }
    }

    if (user.config?.default_postcode != null) {
      const { error } = await supabase.from('weights').upsert(
        { user_id: uid, default_postcode: user.config.default_postcode },
        { onConflict: 'user_id' }
      )
      if (error) errors.push(`weights: ${error.message}`)
    }

    results.push({
      id: uid,
      email: user.email,
      status: errors.length ? 'partial' : 'ok',
      check_ins_restored: user.check_ins?.length ?? 0,
      ...(errors.length && { errors })
    })
  }

  const restored = results.filter(r => r.status !== 'skipped').length
  const skipped = results.filter(r => r.status === 'skipped').length

  return new Response(JSON.stringify({ restored_users: restored, skipped_users: skipped, total_check_ins_restored: totalCheckIns, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
