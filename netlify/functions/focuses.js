import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('focuses')
      .select('*')
      .eq('user_id', user.id)
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

    const { title } = body
    if (!title?.trim()) {
      return new Response(JSON.stringify({ error: 'title is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { count } = await supabase.from('focuses').select('*', { count: 'exact', head: true }).eq('user_id', user.id)

    const { data, error } = await supabase
      .from('focuses')
      .insert([{ user_id: user.id, title: title.trim(), is_active: true, sort_order: count || 0 }])
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 201, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    const id = url.searchParams.get('id')
    if (!id) {
      return new Response(JSON.stringify({ error: 'id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const update = {}
    if (body.title !== undefined) {
      if (!body.title?.trim()) {
        return new Response(JSON.stringify({ error: 'title cannot be empty' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      }
      update.title = body.title.trim()
    }
    if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)
    if (body.sort_order !== undefined) update.sort_order = Number(body.sort_order)

    const { data, error } = await supabase
      .from('focuses')
      .update(update)
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

    const { error: delError } = await supabase
      .from('focuses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (delError) {
      return new Response(JSON.stringify({ error: delError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    // Strip this focus's scores from all check_ins for this user
    await supabase.rpc('remove_focus_from_checkins', { focus_id: id, p_user_id: user.id })

    return new Response(null, { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
