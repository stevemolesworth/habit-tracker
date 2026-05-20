import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: JSON_HEADERS })

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS })
    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS })
  }

  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS })
    }
    const { first_name } = body
    if (!first_name?.trim()) {
      return new Response(JSON.stringify({ error: 'first_name is required' }), { status: 400, headers: JSON_HEADERS })
    }
    const { data, error } = await supabase.from('profiles').insert([{
      id: user.id,
      first_name: first_name.trim(),
      email: user.email,
      role: 'user'
    }]).select().single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS })
    return new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS })
  }

  if (req.method === 'PATCH') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: JSON_HEADERS })
    }
    const { first_name } = body
    if (!first_name?.trim()) {
      return new Response(JSON.stringify({ error: 'first_name is required' }), { status: 400, headers: JSON_HEADERS })
    }
    const { data, error } = await supabase.from('profiles').update({ first_name: first_name.trim() }).eq('id', user.id).select().single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: JSON_HEADERS })
    return new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
