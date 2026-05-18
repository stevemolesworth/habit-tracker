import { supabase } from './_shared/supabase.js'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const month = url.searchParams.get('month') // e.g. "2024-05"

  let query = supabase
    .from('check_ins')
    .select('*')
    .order('check_in_date', { ascending: false })
    .order('check_in_type', { ascending: true })

  if (month) {
    const [year, mo] = month.split('-')
    const start = `${year}-${mo}-01`
    const end = new Date(Number(year), Number(mo), 0).toISOString().slice(0, 10)
    query = query.gte('check_in_date', start).lte('check_in_date', end)
  }

  const { data, error } = await query

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
