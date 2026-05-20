import { supabase } from './_shared/supabase.js'

export default async function handler(req) {
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('behaviours')
      .select('*')
      .eq('active', true)
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

    const { name, weight } = body
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (weight == null || !Number.isInteger(Number(weight)) || Number(weight) < -3 || Number(weight) > 3) {
      return new Response(JSON.stringify({ error: 'weight must be an integer between -3 and 3' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase
      .from('behaviours')
      .insert([{ name: name.trim(), weight: Number(weight) }])
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

    const { name, weight } = body
    if (!name?.trim()) {
      return new Response(JSON.stringify({ error: 'name is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }
    if (weight == null || !Number.isInteger(Number(weight)) || Number(weight) < -3 || Number(weight) > 3) {
      return new Response(JSON.stringify({ error: 'weight must be an integer between -3 and 3' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const { data, error } = await supabase
      .from('behaviours')
      .update({ name: name.trim(), weight: Number(weight) })
      .eq('id', id)
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
      .from('behaviours')
      .update({ active: false })
      .eq('id', id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(null, { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
