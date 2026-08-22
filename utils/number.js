function toInt(v, defaultVal = 0) {
  if (typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const p = parseInt(v, 10);
    return Number.isFinite(p) && Number.isInteger(p) ? p : defaultVal;
  }
  return defaultVal;
}

module.exports = { toInt };
