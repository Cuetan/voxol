// Rate limiting simple en mémoire (reset à chaque cold start Vercel)
// Pour une protection robuste, remplacer par Upstash Redis
const rateLimit = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const max = 5; // 5 tentatives par minute par IP

  const entry = rateLimit.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    rateLimit.set(ip, { count: 1, start: now });
    return false;
  }
  if (entry.count >= max) return true;
  rateLimit.set(ip, { count: entry.count + 1, start: entry.start });
  return false;
}

function isValidEmail(email) {
  // Validation robuste : format correct, domaine avec extension
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting par IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives, réessayez dans une minute.' });
  }

  const { email, source, question, reponse } = req.body || {};

  // Validation email robuste
  if (!email || typeof email !== 'string' || !isValidEmail(email.trim())) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY; // clé anon, pas service key

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Configuration manquante' });
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        source: source || 'courte',
        question: question || null,
        reponse: reponse || null,
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Erreur base de données' });
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    return res.status(500).json({ error: 'Erreur réseau' });
  }
}
