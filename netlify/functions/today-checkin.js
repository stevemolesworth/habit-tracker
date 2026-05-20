import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)
  const date = url.searchParams.get('date')
  const type = url.searchParams.get('type')

  if (!date || !type) {
    return new Response(JSON.stringify({ error: 'date and type are required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', user.id)
    .eq('check_in_date', date)
    .eq('check_in_type', type)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    })
  }

  return new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  })
}
