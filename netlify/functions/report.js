import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  if (!from || !to) {
    return new Response(JSON.stringify({ error: 'from and to are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', user.id)
    .gte('check_in_date', from)
    .lte('check_in_date', to)
    .order('check_in_date', { ascending: true })
    .order('submitted_at', { ascending: true, nullsFirst: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
