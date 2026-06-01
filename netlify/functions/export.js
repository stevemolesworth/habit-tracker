import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const format = url.searchParams.get('format') || 'json'

  const [checkInsRes, moodDimsRes, momentumRes] = await Promise.all([
    supabase.from('check_ins').select('*').eq('user_id', user.id)
      .order('check_in_date', { ascending: false }).order('check_in_type', { ascending: true }),
    supabase.from('mood_dimensions').select('id, name, five_is_good').eq('user_id', user.id).order('sort_order'),
    supabase.from('momentum_items').select('id, name').eq('user_id', user.id).order('sort_order'),
  ])

  if (checkInsRes.error) {
    return new Response(JSON.stringify({ error: checkInsRes.error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  const moodDimMap = Object.fromEntries((moodDimsRes.data ?? []).map(d => [d.id, d.name]))
  const momentumMap = Object.fromEntries((momentumRes.data ?? []).map(d => [d.id, d.name]))

  // Resolve UUID keys to names in secondary_moods and momentum_scores
  function resolveCheckin(row) {
    const out = { ...row }
    if (row.secondary_moods && Object.keys(row.secondary_moods).length) {
      out.secondary_moods = Object.fromEntries(
        Object.entries(row.secondary_moods).map(([id, val]) => [moodDimMap[id] ?? id, val])
      )
    }
    if (row.momentum_scores && Object.keys(row.momentum_scores).length) {
      out.momentum_scores = Object.fromEntries(
        Object.entries(row.momentum_scores).map(([id, val]) => [momentumMap[id] ?? id, val])
      )
    }
    return out
  }

  const data = (checkInsRes.data ?? []).map(resolveCheckin)

  if (format === 'csv') {
    if (!data.length) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="cci-export.csv"' } })
    }

    const columns = Object.keys(data[0])
    const escape = (v) => {
      if (v == null) return ''
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }

    const rows = [
      columns.join(','),
      ...data.map(row => columns.map(col => escape(row[col])).join(','))
    ]

    return new Response(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="cci-export.csv"'
      }
    })
  }

  const config = {
    mood_dimensions: (moodDimsRes.data ?? []).map(({ id, name, five_is_good }) => ({
      id, name,
      scale: five_is_good === false ? '1=best, 5=worst' : '1=worst, 5=best'
    })),
    momentum_items: (momentumRes.data ?? []).map(({ id, name }) => ({ id, name })),
  }

  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), config, check_ins: data }, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="cci-export.json"'
    }
  })
}
