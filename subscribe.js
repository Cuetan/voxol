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

Je la lirai avec attention. Les prochaines explorations s'appuieront sur ces propositions — la vôtre en fait partie.

Si elle est retenue, je vous en informerai.

À bientôt,
Grégoire
Fondateur de vOxOl`
          }
        : {
            subject: 'vOxOl — Bienvenue dans l\'exploration.',
            text: `Bonjour,

Merci d'avoir rejoint l'exploration.

Vous faites partie des premières personnes à suivre vOxOl — un projet qui part d'un constat simple : dans le débat public, on voit les positions. Rarement les raisonnements derrière.

vOxOl cherche à rendre ces logiques lisibles, comparables et mesurables.

Ce n'est pas encore le cas. Les premières réponses permettront à vOxOl de commencer à révéler ces logiques.

Vous recevrez prochainement une première question. L'objectif ne sera pas de répondre oui ou non — mais d'exprimer pourquoi vous vous positionnez comme vous le faites.

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
          from: 'vOxOl <noreply@voxol.org>',
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
