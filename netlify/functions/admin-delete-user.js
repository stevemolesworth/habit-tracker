import { supabase } from './_shared/supabase.js'
import { getAuthAdmin } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405 })

  const admin = await getAuthAdmin(req)
  if (!admin) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  if (id === admin.id) return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  await supabase.from('check_ins').delete().eq('user_id', id)
  await supabase.from('behaviours').delete().eq('user_id', id)
  await supabase.from('supplements').delete().eq('user_id', id)
  await supabase.from('weights').delete().eq('user_id', id)
  await supabase.from('profiles').delete().eq('id', id)

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })

  return new Response(null, { status: 204 })
}
