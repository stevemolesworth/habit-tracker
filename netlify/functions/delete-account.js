import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

export default async function handler(req) {
  if (req.method !== 'DELETE') return new Response('Method Not Allowed', { status: 405 })

  const user = await getAuthUser(req)
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const id = user.id

  // Delete all user data
  await supabase.from('check_ins').delete().eq('user_id', id)
  await supabase.from('behaviours').delete().eq('user_id', id)
  await supabase.from('supplements').delete().eq('user_id', id)
  await supabase.from('weights').delete().eq('user_id', id)
  await supabase.from('profiles').delete().eq('id', id)

  // Remove from Supabase Auth
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(null, { status: 204 })
}
