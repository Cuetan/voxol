export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, source } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Configuration manquante' });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ email, source: source || 'courte' }),
  });

  if (!response.ok) {
    return res.status(502).json({ error: 'Erreur base de données' });
  }

  return res.status(200).json({ ok: true });
}
