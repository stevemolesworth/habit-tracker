import { supabase } from './_shared/supabase.js'

export default async function handler(req) {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
  }

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return new Response(JSON.stringify({ error: 'Missing from or to date' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const { count, error } = await supabase
    .from('check_ins')
    .delete({ count: 'exact' })
    .gte('check_in_date', from)
    .lte('check_in_date', to)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(JSON.stringify({ deleted: count }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
