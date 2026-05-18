import { supabase } from './_shared/supabase.js'

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const format = url.searchParams.get('format') || 'json'

  const { data, error } = await supabase
    .from('check_ins')
    .select('*')
    .order('check_in_date', { ascending: false })
    .order('check_in_type', { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }

  if (format === 'csv') {
    if (!data.length) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="habit-tracker-export.csv"' } })
    }

    const columns = Object.keys(data[0])
    const escape = (v) => {
      if (v == null) return ''
      const str = typeof v === 'object' ? JSON.stringify(v) : String(v)
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str
    }

    const rows = [
      columns.join(','),
      ...data.map(row => columns.map(col => escape(row[col])).join(','))
    ]

    return new Response(rows.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="habit-tracker-export.csv"'
      }
    })
  }

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="habit-tracker-export.json"'
    }
  })
}
