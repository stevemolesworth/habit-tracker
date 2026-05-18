function norm(val, min, max) {
  return (val - min) / (max - min)
}

function avg(arr) {
  const vals = arr.filter(v => v != null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
}

export function calcScore(checkin, weights) {
  const w = { ...weights }

  const hasSleep = checkin.check_in_type === 'morning' && checkin.sleep_quality != null
  if (!hasSleep) {
    const redistribute = w.weight_sleep
    w.weight_sleep = 0
    const otherKeys = ['weight_mood', 'weight_focus', 'weight_exercise', 'weight_mindfulness', 'weight_alcohol', 'weight_outside']
    const total = otherKeys.reduce((sum, k) => sum + w[k], 0)
    if (total > 0) {
      for (const k of otherKeys) {
        w[k] += redistribute * (w[k] / total)
      }
    }
  }

  const focusAvg = avg([checkin.focus_financial, checkin.focus_consulting, checkin.focus_opiner])
  const totalAlcohol = (checkin.alcohol_spirits || 0) + (checkin.alcohol_beer || 0) + (checkin.alcohol_wine || 0)
  const mindful = (checkin.mindfulness_meditation || checkin.mindfulness_yoga) ? 1 : 0

  const score =
    w.weight_mood        * norm(checkin.global_mood ?? 3, 1, 5) +
    w.weight_focus       * norm(focusAvg ?? 3, 1, 5) +
    w.weight_sleep       * (hasSleep ? norm(checkin.sleep_quality, 1, 3) : 0) +
    w.weight_exercise    * (checkin.exercised ? 1 : 0) +
    w.weight_mindfulness * mindful +
    w.weight_alcohol     * (1 - Math.min(totalAlcohol / 10, 1)) +
    w.weight_outside     * (checkin.outside_time ? 1 : 0)

  return Math.round(score * 100) / 100
}
