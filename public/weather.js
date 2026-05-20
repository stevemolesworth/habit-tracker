const WMO_EMOJI = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️',
  45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️',
  61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '🌨️', 73: '🌨️', 75: '🌨️', 77: '🌨️',
  80: '🌦️', 81: '🌦️', 82: '🌦️',
  85: '🌨️', 86: '🌨️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
}

const SLOTS = [6, 8, 10, 12, 14, 16, 18, 20, 22]

const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$/i

export function wmoEmoji(code) {
  return WMO_EMOJI[code] ?? '🌡️'
}

function nominatimLabel(address) {
  const locality = address.city || address.town || address.village || address.county || ''
  const country = address.country || ''
  return [locality, country].filter(Boolean).join(', ')
}

export async function geocode(query) {
  const q = query.trim()
  if (!q) throw new Error('No location entered')

  if (UK_POSTCODE_RE.test(q)) {
    const clean = q.replace(/\s+/g, '').toUpperCase()
    const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
    if (!res.ok) throw new Error('Invalid UK postcode')
    const data = await res.json()
    return { lat: data.result.latitude, lng: data.result.longitude, label: clean }
  }

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`,
    { headers: { 'Accept-Language': 'en' } }
  )
  if (!res.ok) throw new Error('Could not reach geocoding service')
  const results = await res.json()
  if (!results.length) throw new Error(`Location not found: "${q}"`)
  const r = results[0]
  return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: nominatimLabel(r.address) || q }
}

export async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
    { headers: { 'Accept-Language': 'en' } }
  )
  if (!res.ok) throw new Error('Could not reach geocoding service')
  const data = await res.json()
  return { label: nominatimLabel(data.address) || `${lat.toFixed(3)}, ${lng.toFixed(3)}` }
}

export async function fetchWeather(location, date = null) {
  const { lat, lng, label } = location

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  const targetDate = date || todayStr
  const isPast = targetDate < todayStr

  if (isPast) {
    return fetchHistoricalWeather(lat, lng, targetDate, label)
  } else {
    return fetchForecastWeather(lat, lng, label)
  }
}

async function fetchForecastWeather(lat, lng, label) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&temperature_unit=celsius&forecast_days=1&timezone=auto`

  const wxRes = await fetch(url)
  if (!wxRes.ok) throw new Error('Could not fetch weather')
  const wx = await wxRes.json()

  const currentHour = new Date().getHours()

  const hourly = SLOTS.map(h => {
    const idx = wx.hourly.time.findIndex(t => t.endsWith(`T${String(h).padStart(2, '0')}:00`))
    if (idx === -1) return null
    return {
      time: `${String(h).padStart(2, '0')}:00`,
      hour: h,
      temp: Math.round(wx.hourly.temperature_2m[idx]),
      code: wx.hourly.weather_code[idx],
      isForecast: h > currentHour
    }
  }).filter(Boolean)

  const current = {
    temp: Math.round(wx.current.temperature_2m),
    code: wx.current.weather_code
  }

  return { current, hourly, lat, lng, label }
}

async function fetchHistoricalWeather(lat, lng, date, label) {
  // Archive API has a 2–5 day lag; use forecast API for recent dates
  const daysAgo = Math.round((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000)
  const base = daysAgo <= 7
    ? `https://api.open-meteo.com/v1/forecast`
    : `https://archive-api.open-meteo.com/v1/archive`
  const url = `${base}` +
    `?latitude=${lat}&longitude=${lng}` +
    `&start_date=${date}&end_date=${date}` +
    `&hourly=temperature_2m,weather_code` +
    `&temperature_unit=celsius&timezone=auto`

  const wxRes = await fetch(url)
  if (!wxRes.ok) throw new Error('Could not fetch historical weather')
  const wx = await wxRes.json()

  const hourly = SLOTS.map(h => {
    const idx = wx.hourly.time.findIndex(t => t.endsWith(`T${String(h).padStart(2, '0')}:00`))
    if (idx === -1) return null
    return {
      time: `${String(h).padStart(2, '0')}:00`,
      hour: h,
      temp: Math.round(wx.hourly.temperature_2m[idx]),
      code: wx.hourly.weather_code[idx],
      isForecast: false
    }
  }).filter(Boolean)

  // Use noon as the representative 'current' reading for the day
  const noonIdx = wx.hourly.time.findIndex(t => t.endsWith('T12:00'))
  const ref = noonIdx !== -1 ? noonIdx : (hourly[0] ? wx.hourly.time.indexOf(`${date}T${hourly[0].time}`) : -1)
  const current = ref !== -1
    ? { temp: Math.round(wx.hourly.temperature_2m[ref]), code: wx.hourly.weather_code[ref] }
    : { temp: null, code: null }

  return { current, hourly, lat, lng, label }
}

export function buildWeatherStrip(weatherData, type) {
  const { hourly } = weatherData

  const temps = hourly.map(h => h.temp).filter(t => t !== null)
  const avgTemp = temps.length
    ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
    : null

  const avgRow = `<tr class="nhsuk-table__row">
    <td class="nhsuk-table__cell"><strong>Average</strong></td>
    <td class="nhsuk-table__cell"></td>
    <td class="nhsuk-table__cell"><strong>${avgTemp !== null ? `${avgTemp}°C` : '—'}</strong></td>
  </tr>`

  const hourlyRows = hourly.map(h => weatherCard(h.time, wmoEmoji(h.code), h.temp, h.isForecast)).join('')

  return `<table class="nhsuk-table">
    <thead class="nhsuk-table__head">
      <tr class="nhsuk-table__row">
        <th class="nhsuk-table__header" scope="col">Time</th>
        <th class="nhsuk-table__header" scope="col">Condition</th>
        <th class="nhsuk-table__header" scope="col">Temp</th>
      </tr>
    </thead>
    <tbody class="nhsuk-table__body">${avgRow}${hourlyRows}</tbody>
  </table>`
}

function weatherCard(label, emoji, temp, isForecast) {
  const style = isForecast ? ' style="color:#768692"' : ''
  const marker = isForecast ? '*' : ''
  return `<tr class="nhsuk-table__row"${style}>
    <td class="nhsuk-table__cell">${label}${marker}</td>
    <td class="nhsuk-table__cell">${emoji}</td>
    <td class="nhsuk-table__cell">${temp !== null ? `${temp}°C${marker}` : '—'}</td>
  </tr>`
}
