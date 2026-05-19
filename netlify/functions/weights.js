import { supabase } from './_shared/supabase.js'

export default async function handler(req) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('weights')
      .select('*')
      .limit(1)
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const update = {}
    if (body.default_postcode !== undefined) {
      update.default_postcode = String(body.default_postcode).replace(/\s+/g, '').toUpperCase()
    }
    update.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('weights')
      .update(update)
      .neq('id', '00000000-0000-0000-0000-000000000000') // update all rows (there's only one)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
