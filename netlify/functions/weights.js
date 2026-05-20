import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('weights')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data || {}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    let body
    try { body = await req.json() } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    const update = { user_id: user.id, updated_at: new Date().toISOString() }
    if (body.default_postcode !== undefined) {
      update.default_postcode = String(body.default_postcode).replace(/\s+/g, '').toUpperCase()
    }
    if (body.default_location_lat !== undefined) update.default_location_lat = body.default_location_lat
    if (body.default_location_lng !== undefined) update.default_location_lng = body.default_location_lng
    if (body.default_location_label !== undefined) update.default_location_label = body.default_location_label

    const { data, error } = await supabase
      .from('weights')
      .upsert(update, { onConflict: 'user_id' })
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
