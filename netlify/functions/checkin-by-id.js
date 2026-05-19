import { supabase } from './_shared/supabase.js'

function calcHoursSlept(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null
  const [bh, bm] = bedtime.split(':').map(Number)
  const [wh, wm] = wakeTime.split(':').map(Number)
  let diff = (wh * 60 + wm) - (bh * 60 + bm)
  if (diff < 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

export default async function handler(req) {
  const url = new URL(req.url)
  // Extract id from path: /api/checkin/:id → forwarded as query param by Netlify redirect
  // The redirect passes the :id segment — we parse from the Netlify path
  const pathParts = url.pathname.split('/')
  const id = pathParts[pathParts.length - 1] || url.searchParams.get('id')

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('check_ins')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: error.code === 'PGRST116' ? 404 : 500, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'PUT') {
    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    }

    if (body.bedtime || body.wake_time) {
      body.hours_slept = calcHoursSlept(body.bedtime, body.wake_time)
    }

    // Strip id from update payload if present
    delete body.id
    delete body.created_at
    body.submitted_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('check_ins')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('check_ins')
      .delete()
      .eq('id', id)

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }

    return new Response(null, { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}
