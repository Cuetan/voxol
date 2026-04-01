// Rate limiting simple en mémoire (reset à chaque cold start Vercel)
const rateLimit = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 5;
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives, réessayez dans une minute.' });
  }

  const { email, source, question } = req.body || {};

  // email requis sauf pour suggestions de question (suivre.html → question sans email)
  const emailProvided = email && typeof email === 'string' && email.trim().length > 0;
  const questionProvided = question && typeof question === 'string' && question.trim().length > 0;

  if (!emailProvided && !questionProvided) {
    return res.status(400).json({ error: 'Email ou question requis' });
  }
  if (emailProvided && !isValidEmail(email.trim())) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Configuration manquante' });
  }

  try {
    // 1. Sauvegarde dans Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email: emailProvided ? email.trim().toLowerCase() : null,
        source: source || 'inconnu',
        question: question || null,
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Erreur base de données' });
    }

    // 2. Envoi email via Resend selon la source
    if (RESEND_API_KEY && emailProvided) {
      const isSuggestion = source === 'suggestion';
      const emailContent = isSuggestion
        ? {
            subject: 'vOxOl — Merci pour votre suggestion.',
            text: `Bonjour,

Merci d'avoir proposé une question pour vOxOl.

Votre suggestion : « ${question} »

Je la lirai avec attention. Si elle est retenue pour une prochaine exploration, je vous en informerai.

À bientôt,
Grégoire
Fondateur de vOxOl`
          }
        : {
            subject: 'vOxOl — Vous faites partie des premiers.',
            text: `Bonjour,

Merci pour votre inscription.

Vous faites partie des premières personnes intéressées par vOxOl — un projet encore en exploration, qui part d'un constat simple : le débat public repose trop souvent sur des positions simplifiées.

Deux personnes peuvent dire « oui » pour des raisons très différentes. Ces différences comptent — et elles sont aujourd'hui largement invisibles.

vOxOl cherche à les rendre visibles.

📅 La suite

Vous recevrez une invitation à tester un premier module dès qu'il sera prêt :

• Une question d'actualité
• Une réponse en texte libre
• Une visualisation de ce qui émerge collectivement

Le projet avance progressivement, et votre intérêt à ce stade est déjà précieux.

D'ici là, aucun autre e-mail ne sera envoyé.

Si le projet vous semble intéressant, le meilleur coup de pouce est d'en parler autour de vous : https://www.voxol.org

À bientôt,
Grégoire
Fondateur de vOxOl`
          };

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: 'vOxOl <hello@voxol.org>',
          to: email.trim().toLowerCase(),
          subject: emailContent.subject,
          text: emailContent.text,
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur réseau' });
  }
}
