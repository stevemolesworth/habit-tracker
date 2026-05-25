import { supabase } from './_shared/supabase.js'
import { getAuthUser } from './_shared/auth.js'

const IMPORT_LIMIT = 500
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// Insert items from config that don't already exist; return count + mapping from JSON id → DB UUID.
// mood_dimensions and momentum_items carry a JSON "id" field (e.g. "energy") that the check-ins use
// as keys in secondary_moods / momentum_scores. After inserting we build a map so those keys can be
// rewritten to the real DB UUIDs before the check-ins are inserted.
async function importDimensionTable(table, items, allowedFields, userId) {
  if (!Array.isArray(items) || !items.length) return { count: 0, idToUuid: {} }

  // Build: JSON id → name  (e.g. "energy" → "Energy")
  const jsonIdToName = {}
  for (const item of items) {
    if (item.id !== undefined && item.name) jsonIdToName[String(item.id)] = item.name
  }

  // Fetch existing rows so we can skip duplicates and still build the full mapping
  const { data: existing } = await supabase.from(table).select('id, name').eq('user_id', userId).eq('active', true)
  const existingByName = Object.fromEntries((existing ?? []).map(r => [r.name, r.id]))

  const toInsert = items
    .filter(item => item.name && !existingByName[item.name])
    .map((item, i) => {
      const row = { user_id: userId }
      for (const f of allowedFields) if (item[f] !== undefined) row[f] = item[f]
      if (row.sort_order === undefined) row.sort_order = i
      return row
    })

  let newByName = {}
  if (toInsert.length) {
    const { data: inserted } = await supabase.from(table).insert(toInsert).select('id, name')
    newByName = Object.fromEntries((inserted ?? []).map(r => [r.name, r.id]))
  }

  // Full name → DB UUID  (existing rows + newly inserted)
  const nameToUuid = { ...existingByName, ...newByName }

  // JSON id → DB UUID  (e.g. "energy" → "uuid-abc-123")
  const idToUuid = {}
  for (const [jsonId, name] of Object.entries(jsonIdToName)) {
    if (nameToUuid[name]) idToUuid[jsonId] = nameToUuid[name]
  }

  return { count: toInsert.length, idToUuid }
}

// Insert config items with no id remapping needed (supplements, behaviours).
async function importSimpleTable(table, items, allowedFields, userId) {
  if (!Array.isArray(items) || !items.length) return 0
  const { data: existing } = await supabase.from(table).select('name').eq('user_id', userId).eq('active', true)
  const existingNames = new Set((existing ?? []).map(r => r.name))
  const toInsert = items
    .filter(item => item.name && !existingNames.has(item.name))
    .map((item, i) => {
      const row = { user_id: userId }
      for (const f of allowedFields) if (item[f] !== undefined) row[f] = item[f]
      if (row.sort_order === undefined) row.sort_order = i
      return row
    })
  if (!toInsert.length) return 0
  const { error } = await supabase.from(table).insert(toInsert)
  return error ? 0 : toInsert.length
}

// Remap keys of a JSONB object using a mapping. If mapping is empty, returns original unchanged
// (safe for bare-array imports where keys are already real UUIDs).
const remapKeys = (obj, mapping) => {
  if (!obj || typeof obj !== 'object') return obj
  if (!Object.keys(mapping).length) return obj
  const result = {}
  for (const [k, v] of Object.entries(obj)) result[mapping[k] ?? k] = v
  return result
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const user = await getAuthUser(req)
  if (!user) return json({ error: 'Unauthorized' }, 401)

  let body
  try { body = await req.json() } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  // Accept bare array (same format as JSON export) or { checkins, config? }
  const checkins = Array.isArray(body) ? body : body?.checkins
  const configToImport = Array.isArray(body) ? null : body?.config

  if (!Array.isArray(checkins)) return json({ error: '"checkins" must be an array' }, 400)
  if (checkins.length > IMPORT_LIMIT) return json({ error: `Maximum ${IMPORT_LIMIT} check-ins per import` }, 400)

  const result = { checkins: { inserted: 0, skipped: 0 }, config: null }
  let moodDimMapping = {}
  let momentumMapping = {}

  // ── Config import ─────────────────────────────────────────────
  if (configToImport) {
    const [suppCount, behCount, moodResult, momResult] = await Promise.all([
      importSimpleTable('supplements', configToImport.supplements, ['name', 'sort_order'], user.id),
      importSimpleTable('behaviours', configToImport.behaviours, ['name', 'weight', 'sort_order'], user.id),
      importDimensionTable('mood_dimensions', configToImport.mood_dimensions, ['name', 'five_is_good', 'paused', 'sort_order'], user.id),
      importDimensionTable('momentum_items', configToImport.momentum_items, ['name', 'paused', 'sort_order'], user.id),
    ])

    moodDimMapping = moodResult.idToUuid
    momentumMapping = momResult.idToUuid

    result.config = {
      supplements: suppCount,
      behaviours: behCount,
      mood_dimensions: moodResult.count,
      momentum_items: momResult.count,
    }
  }

  // ── Check-ins import ──────────────────────────────────────────
  if (checkins.length) {
    const { data: existing } = await supabase
      .from('check_ins')
      .select('check_in_date, check_in_type')
      .eq('user_id', user.id)

    const existingSet = new Set((existing ?? []).map(r => `${r.check_in_date}|${r.check_in_type}`))

    // goals_today/tomorrow/highlights are text[] in the DB — normalise strings → arrays
    const toArray = v => v == null ? null : Array.isArray(v) ? v : [v]

    const toInsert = checkins
      .filter(c => c.check_in_date && c.check_in_type)
      .filter(c => !existingSet.has(`${c.check_in_date}|${c.check_in_type}`))
      .map(c => {
        const { id, user_id, ...rest } = c
        return {
          ...rest,
          user_id: user.id,
          goals_today: toArray(rest.goals_today),
          goals_tomorrow: toArray(rest.goals_tomorrow),
          highlights: toArray(rest.highlights),
          // Remap JSON id keys (e.g. "energy") → real DB UUIDs for the demo account
          secondary_moods: remapKeys(rest.secondary_moods, moodDimMapping),
          momentum_scores: remapKeys(rest.momentum_scores, momentumMapping),
        }
      })

    result.checkins.skipped = checkins.length - toInsert.length

    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH)
      const { error } = await supabase.from('check_ins').insert(batch)
      if (error) { result.error = error.message; break }
      result.checkins.inserted += batch.length
    }
  }

  return json(result)
}
