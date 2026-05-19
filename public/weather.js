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

export function wmoEmoji(code) {
  return WMO_EMOJI[code] ?? '🌡️'
}

export async function fetchWeather(postcode) {
  const clean = postcode.replace(/\s+/g, '').toUpperCase()

  const geoRes = await fetch(`https://api.postcodes.io/postcodes/${clean}`)
  if (!geoRes.ok) throw new Error('Invalid postcode')
  const geo = await geoRes.json()
  const { latitude: lat, longitude: lng } = geo.result

  const url = `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&temperature_unit=celsius&forecast_days=1&timezone=Europe%2FLondon`

  const wxRes = await fetch(url)
  if (!wxRes.ok) throw new Error('Could not fetch weather')
  const wx = await wxRes.json()

  const currentHour = new Date().getHours()

  // 2-hourly slots covering the day
  const slots = [6, 8, 10, 12, 14, 16, 18, 20, 22]
  const hourly = slots.map(h => {
    const timeStr = `T${String(h).padStart(2, '0')}:00`
    const idx = wx.hourly.time.findIndex(t => t.endsWith(timeStr))
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

  return { current, hourly, postcode: clean }
}

export function buildWeatherStrip(weatherData, type) {
  const { current, hourly } = weatherData
  const currentHour = new Date().getHours()

  const cards = [weatherCard('Now', wmoEmoji(current.code), current.temp, false)]

  if (type === 'morning') {
    // Show future 2-hourly slots from the next slot after now
    const nextSlotHour = currentHour % 2 === 0 ? currentHour + 2 : currentHour + (2 - currentHour % 2)
    hourly
      .filter(h => h.hour >= nextSlotHour)
      .forEach(h => cards.push(weatherCard(h.time, wmoEmoji(h.code), h.temp, false)))
  } else {
    // Evening: all slots — past is actual, future is forecast*
    hourly.forEach(h => cards.push(weatherCard(h.time, wmoEmoji(h.code), h.temp, h.isForecast)))
  }

  return `<div style="display:inline-flex;gap:8px">${cards.join('')}</div>`
}

function weatherCard(label, emoji, temp, isForecast) {
  const muted = isForecast ? 'color:#768692' : ''
  const marker = isForecast ? '*' : ''
  return `<div style="display:inline-flex;flex-direction:column;align-items:center;min-width:52px;text-align:center;${muted}">
    <span style="font-size:0.75rem">${label}${marker}</span>
    <span style="font-size:1.25rem;line-height:1.4">${emoji}</span>
    <span style="font-size:0.875rem">${temp}°C${marker}</span>
  </div>`
}
