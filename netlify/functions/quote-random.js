import { supabase } from './_shared/supabase.js'

const FALLBACK = { text: 'You showed up. That matters.', author: null }

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const { data, error } = await supabase.from('quotes').select('*')

  if (error || !data?.length) {
    return new Response(JSON.stringify(FALLBACK), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const quote = data[Math.floor(Math.random() * data.length)]
  return new Response(JSON.stringify(quote), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
