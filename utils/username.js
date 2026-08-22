function sanitizeUsername(raw) {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

function validUsername(u) {
  return typeof u === 'string' && /^[a-z0-9_\-]{3,30}$/.test(u);
}

module.exports = { sanitizeUsername, validUsername };
