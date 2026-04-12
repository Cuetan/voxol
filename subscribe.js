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
            subject: 'Bienvenue dans l\'exploration vOxOl',
            html: `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0e1628;padding:28px 40px;text-align:center;">
              <span style="font-family:Georgia,serif;font-style:italic;font-weight:700;font-size:22px;color:white;letter-spacing:-0.01em;">vOxOl</span>
              <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.4);letter-spacing:0.12em;text-transform:uppercase;font-family:Arial,sans-serif;">Concept en exploration · 2026</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Arial,sans-serif;">Bonjour,</p>
              <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Arial,sans-serif;">Merci de participer à cette phase d'exploration.</p>

              <!-- Citation -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
                <tr>
                  <td style="border-left:3px solid #f97316;padding:4px 0 4px 20px;">
                    <p style="margin:0 0 8px;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Arial,sans-serif;">Dans le débat public, on voit les positions. Rarement les raisonnements derrière.</p>
                    <p style="margin:0;font-size:15px;color:#555;line-height:1.7;font-family:Arial,sans-serif;">Ces raisonnements existent déjà. Ils sont simplement dispersés, non structurés, difficiles à comparer. vOxOl cherche à les rendre lisibles, comparables et mesurables.</p>
                  </td>
                </tr>
              </table>

              <!-- Contexte -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="background:#f8f8f8;border-radius:8px;padding:18px 20px;">
                    <p style="margin:0;font-size:13.5px;color:#555;line-height:1.75;font-family:Arial,sans-serif;">vOxOl est aujourd'hui un concept en construction — pas encore une application. Cette phase d'exploration vise à tester l'idée : est-ce que les gens ont envie d'exprimer leur raisonnement&nbsp;? Est-ce que cela permet de révéler quelque chose d'utile&nbsp;?</p>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 20px;font-size:15px;color:#1a1a1a;line-height:1.7;font-family:Arial,sans-serif;">Vous recevrez dans les prochains jours une première question. L'objectif ne sera pas de répondre oui ou non — mais d'exprimer <em>pourquoi</em> vous vous positionnez comme vous le faites. Votre réponse contribuera directement à la construction du projet.</p>

              <p style="margin:0 0 32px;font-size:13.5px;color:#999;line-height:1.7;font-family:Arial,sans-serif;">D'ici là, aucun autre e-mail ne sera envoyé.</p>

              <!-- Divider -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr><td style="border-top:1px solid #eeeeee;"></td></tr>
              </table>

              <p style="margin:0 0 20px;font-size:13.5px;color:#555;line-height:1.7;font-family:Arial,sans-serif;">Si le projet vous semble intéressant, la meilleure façon d'y contribuer est d'en parler autour de vous :</p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
                <tr>
                  <td style="background:#0e1628;border-radius:8px;padding:12px 24px;">
                    <a href="https://www.voxol.org" style="color:white;font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif;letter-spacing:0.01em;">voxol.org →</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#1a1a1a;line-height:1.7;font-family:Arial,sans-serif;">À bientôt,<br>
              <strong>Grégoire</strong><br>
              <span style="color:#999;font-size:12px;">Fondateur de vOxOl</span></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f8f8;padding:20px 40px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:11px;color:#bbb;font-family:Arial,sans-serif;">© 2026 vOxOl · Concept en exploration</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
            text: `Bonjour,

Merci de participer à cette phase d'exploration.

Dans le débat public, on voit les positions. Rarement les raisonnements derrière.

Ces raisonnements existent déjà. Ils sont simplement dispersés, non structurés, difficiles à comparer. vOxOl cherche à les rendre lisibles, comparables et mesurables.

vOxOl est aujourd'hui un concept en construction — pas encore une application. Cette phase d'exploration vise à tester l'idée : est-ce que les gens ont envie d'exprimer leur raisonnement ? Est-ce que cela permet de révéler quelque chose d'utile ?

Vous recevrez dans les prochains jours une première question. L'objectif ne sera pas de répondre oui ou non — mais d'exprimer pourquoi vous vous positionnez comme vous le faites. Votre réponse contribuera directement à la construction du projet.

D'ici là, aucun autre e-mail ne sera envoyé.

Si le projet vous semble intéressant, la meilleure façon d'y contribuer est d'en parler autour de vous : https://www.voxol.org

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
          html: emailContent.html || undefined,
          text: emailContent.text,
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Erreur réseau' });
  }
}
