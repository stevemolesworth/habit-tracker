import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const url = new URL(req.url)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('events')
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

    const { name, description, url: eventUrl, direction, event_date, event_time } = body
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!event_date) {
      return new Response(JSON.stringify({ error: 'event_date is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (!['countdown', 'countup'].includes(direction)) {
      return new Response(JSON.stringify({ error: 'direction must be countdown or countup' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { count } = await supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('active', true)

    const { data, error } = await supabase
      .from('events')
      .insert([{
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        url: eventUrl?.trim() || null,
        direction,
        event_date,
        event_time: event_time || null,
        sort_order: count ?? 0
      }])
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
        supabase.from('events').update({ sort_order: index }).eq('id', id).eq('user_id', user.id)
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

    const update = {}
    if (body.name !== undefined) {
      if (!body.name?.trim()) return new Response(JSON.stringify({ error: 'name cannot be empty' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      update.name = body.name.trim()
    }
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.url !== undefined) update.url = body.url?.trim() || null
    if (body.direction !== undefined) {
      if (!['countdown', 'countup'].includes(body.direction)) return new Response(JSON.stringify({ error: 'invalid direction' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
      update.direction = body.direction
    }
    if (body.event_date !== undefined) update.event_date = body.event_date
    if (body.event_time !== undefined) update.event_time = body.event_time || null

    const { data, error } = await supabase
      .from('events')
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

    const { error } = await supabase
      .from('events')
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
