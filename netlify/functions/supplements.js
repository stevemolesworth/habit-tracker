import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('supplements')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'POST') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { name } = body
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase
      .from('supplements')
      .insert([{ user_id: user.id, name: name.trim() }])
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    const reorder = url.searchParams.get('reorder') === '1'

    if (reorder) {
      let body
      try { body = await req.json() } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      const { ids } = body
      if (!Array.isArray(ids)) return new Response(JSON.stringify({ error: 'ids must be an array' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

      await Promise.all(ids.map((id, index) =>
        supabase.from('supplements').update({ sort_order: index }).eq('id', id).eq('user_id', user.id)
      ))
      return new Response(null, { status: 204 })
    }

    const id = url.searchParams.get('id')
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { name } = body
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase
      .from('supplements')
      .update({ name: name.trim() })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id')
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    // Soft delete — keep historical supplement data intact
    const { error } = await supabase
      .from('supplements')
      .update({ active: false })
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(null, { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
