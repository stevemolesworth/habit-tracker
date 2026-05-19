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

export function wmoEmoji(code) {
  return WMO_EMOJI[code] ?? '🌡️'
}

export async function fetchWeather(postcode, date = null) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()

  const geoRes = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
  if (!geoRes.ok) throw new Error('Invalid postcode')
  const geo = await geoRes.json()
  const { latitude: lat, longitude: lng } = geo.result

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  const targetDate = date || todayStr
  const isPast = targetDate < todayStr

  if (isPast) {
    return fetchHistoricalWeather(lat, lng, targetDate, clean)
  } else {
    return fetchForecastWeather(lat, lng, clean)
  }
}

async function fetchForecastWeather(lat, lng, postcode) {
  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&temperature_unit=celsius&forecast_days=1&timezone=Europe%2FLondon`

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

  return { current, hourly, postcode }
}

async function fetchHistoricalWeather(lat, lng, date, postcode) {
  // Archive API has a 2–5 day lag; use forecast API for recent dates
  const daysAgo = Math.round((Date.now() - new Date(date + 'T12:00:00').getTime()) / 86400000)
  const base = daysAgo <= 7
    ? `https://api.open-meteo.com/v1/forecast`
    : `https://archive-api.open-meteo.com/v1/archive`
  const url = `${base}` +
    `?latitude=${lat}&longitude=${lng}` +
    `&start_date=${date}&end_date=${date}` +
    `&hourly=temperature_2m,weather_code` +
    `&temperature_unit=celsius&timezone=Europe%2FLondon`

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

  return { current, hourly, postcode }
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
