import nodemailer from "nodemailer";

/* ═══════════════════════════════════════════════════════════════
   CONFIG
   - Si BREVO_API_KEY est défini → API Brevo (recommandé)
   - Sinon → SMTP nodemailer (fallback)
═══════════════════════════════════════════════════════════════ */

const BREVO_API_KEY   = process.env.BREVO_API_KEY;
const BREVO_API_URL   = "https://api.brevo.com/v3/smtp/email";

const SENDER_EMAIL    = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || "no-reply@betlanguages.com";
const SENDER_NAME     = process.env.BREVO_SENDER_NAME  || "Binnie's English Training";

/* LES DOMAINES DE REPLI, quand la variable d'environnement manque. Ils pointaient vers
   `betlanguages.com` et `dashboard.betlanguages.com`, DEUX DOMAINES QUI N'EXISTENT PAS :
   un email parti sans ces variables envoyait donc ses destinataires dans le vide, sans que
   rien ne signale l'erreur. Les vraies adresses sont celles que les applications se
   donnent entre elles (`REACT_APP_DASH_URL` du site public, `REACT_APP_FRONTEND_URL` du
   tableau de bord). Un repli doit être une valeur juste, pas un pense-bête. */
const DASH_URL  = process.env.DASHBOARD_URL || "https://app.binnie.purepro-technologie.ci";
const FRONT_URL = process.env.FRONTEND_URL  || "https://binniesenglish.net";
/* Le lien de désinscription vise le SERVEUR, jamais le site : il doit fonctionner depuis
   un client mail, sans dépendre du chargement d'une application React - et la page qu'il
   visait côté site n'a d'ailleurs jamais existé. */
const API_PUBLIQUE = process.env.BACKEND_URL || "https://backend-binnie.vercel.app";
// Hébergé sur Cloudinary (et non sur FRONT_URL) car ce dernier pointe vers localhost en dev -
// une URL inaccessible depuis les serveurs de Brevo/les clients mail des destinataires.
const LOGO_URL  = "https://res.cloudinary.com/nvp7nxqp/image/upload/v1788473005/bet/branding/bet-logo.png";
// Badge blanc contenant le logo - assure la lisibilité sur les en-têtes en dégradé de couleur.
const logoBadge = (size = 44) => `
  <div style="display:inline-block;background:#fff;border-radius:14px;padding:6px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.12);">
    <img src="${LOGO_URL}" alt="Binnie's English Training" width="${size}" height="${size}" style="display:block;width:${size}px;height:${size}px;object-fit:contain;" />
  </div>`;

// ── Nodemailer fallback ────────────────────────────────────────
const smtpTransporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || "smtp-relay.brevo.com",
  port:   parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ── Fonction d'envoi centrale ──────────────────────────────────
// Utilise Brevo API si BREVO_API_KEY disponible, sinon nodemailer
// attachments (optionnel) : [{ url, name }] - Brevo API télécharge le fichier depuis l'URL
// (Cloudinary) elle-même ; en fallback SMTP, nodemailer a besoin de le télécharger nous-mêmes.
async function brevoSend({ to, subject, html, replyTo, tags = [], attachments = [] }) {
  const toList = Array.isArray(to) ? to : [to];
  // to doit être [{ email, name? }]
  const toFormatted = toList.map(t =>
    typeof t === "string" ? { email: t } : t
  );

  if (BREVO_API_KEY) {
    // ── Brevo Transactional Email API ──────────────────────────
    const body = {
      sender:      { name: SENDER_NAME, email: SENDER_EMAIL },
      to:          toFormatted,
      subject,
      htmlContent: html,
      ...(replyTo ? { replyTo: { email: replyTo } } : {}),
      ...(tags.length ? { tags } : {}),
      ...(attachments.length ? { attachment: attachments.map(a => ({ url: a.url, name: a.name })) } : {}),
    };

    const res = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "accept":       "application/json",
        "content-type": "application/json",
        "api-key":      BREVO_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Brevo API error ${res.status}: ${err.message || JSON.stringify(err)}`);
    }
    return await res.json();
  } else {
    // ── Fallback SMTP nodemailer - nodemailer accepte directement une URL en `path`,
    // il télécharge le fichier lui-même avant l'envoi.
    return smtpTransporter.sendMail({
      from:    `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to:      toFormatted.map(t => t.email).join(", "),
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
      ...(attachments.length ? { attachments: attachments.map(a => ({ filename: a.name, path: a.url })) } : {}),
    });
  }
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL BIENVENUE COACH
═══════════════════════════════════════════════════════════════ */
export async function sendCoachWelcomeEmail({ prenom, nom, email, mdpTemp }) {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f9ff;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#0891b2,#0e7490);padding:32px 36px;text-align:center;">
      ${logoBadge(48)}
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Binnie's <span style="color:#ff2945;">BET</span></div>
      <div style="font-size:13px;color:#bae6fd;margin-top:4px;">Binnie's English Training</div>
    </div>

    <div style="padding:36px;">
      <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px;">Bonjour ${prenom} ${nom} 👋</p>
      <p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Votre profil coach vient d'être créé sur la plateforme <strong>Binnie's English Training</strong>.
        Vous pouvez dès maintenant accéder à votre espace avec les identifiants ci-dessous.
      </p>

      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#0891b2;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Vos identifiants de connexion</div>
        <div style="margin-bottom:10px;">
          <span style="font-size:11px;color:#9ca3af;">Email</span><br/>
          <span style="font-size:14px;font-weight:700;color:#0f172a;">${email}</span>
        </div>
        <div>
          <span style="font-size:11px;color:#9ca3af;">Mot de passe temporaire</span><br/>
          <span style="font-size:16px;font-weight:800;color:#0891b2;letter-spacing:2px;font-family:monospace;">${mdpTemp}</span>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="${DASH_URL}/login-professeur"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
          🚀 Accéder à mon espace coach
        </a>
      </div>

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#92400e;">
          ⚠️ <strong>Changez votre mot de passe</strong> dès votre première connexion pour sécuriser votre compte.
        </p>
      </div>

      <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;">
        En cas de problème de connexion, contactez votre responsable ou écrivez-nous à
        <a href="mailto:${SENDER_EMAIL}" style="color:#0891b2;">${SENDER_EMAIL}</a>.
      </p>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan</p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: "🎓 Bienvenue chez Binnie's English Training - Vos accès coach",
    html,
    tags:    ["coach", "bienvenue"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL BIENVENUE STAFF (tout rôle créé par le Super Admin autre que
   coach, qui a son propre email dédié ci-dessus) - même gabarit,
   générique sur le libellé du rôle/département et le lien de connexion.
═══════════════════════════════════════════════════════════════ */
export async function sendStaffWelcomeEmail({ prenom, nom, email, mdpTemp, departement }) {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#011451,#0c33ac);padding:32px 36px;text-align:center;">
      ${logoBadge(48)}
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Binnie's <span style="color:#ff2945;">BET</span></div>
      <div style="font-size:13px;color:#93c5fd;margin-top:4px;">Binnie's English Training</div>
    </div>

    <div style="padding:36px;">
      <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px;">Bonjour ${prenom} ${nom} 👋</p>
      <p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Votre profil${departement ? ` <strong>${departement}</strong>` : ""} vient d'être créé sur la plateforme <strong>Binnie's English Training</strong>.
        Vous pouvez dès maintenant accéder à votre espace avec les identifiants ci-dessous.
      </p>

      <div style="background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#0c33ac;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Vos identifiants de connexion</div>
        <div style="margin-bottom:10px;">
          <span style="font-size:11px;color:#9ca3af;">Email</span><br/>
          <span style="font-size:14px;font-weight:700;color:#0f172a;">${email}</span>
        </div>
        <div>
          <span style="font-size:11px;color:#9ca3af;">Mot de passe temporaire</span><br/>
          <span style="font-size:16px;font-weight:800;color:#0c33ac;letter-spacing:2px;font-family:monospace;">${mdpTemp}</span>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="${DASH_URL}/access"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
          🚀 Accéder à mon espace
        </a>
      </div>

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#92400e;">
          ⚠️ <strong>Changez votre mot de passe</strong> dès votre première connexion pour sécuriser votre compte.
        </p>
      </div>

      <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;">
        En cas de problème de connexion, contactez votre responsable ou écrivez-nous à
        <a href="mailto:${SENDER_EMAIL}" style="color:#0c33ac;">${SENDER_EMAIL}</a>.
      </p>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan</p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: "🎓 Bienvenue chez Binnie's English Training - Vos accès",
    html,
    tags:    ["staff", "bienvenue"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL MOT DE PASSE RÉGÉNÉRÉ - envoyé quand le Super Admin régénère
   le mot de passe d'un profil déjà existant (coach ou staff), pour
   qu'il reçoive ses nouveaux accès sans passer par le Super Admin.
═══════════════════════════════════════════════════════════════ */
export async function sendAccessRegeneratedEmail({ prenom, nom, email, mdpTemp }) {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#fff7ed;margin:0;padding:0;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#9a3412,#c2410c);padding:32px 36px;text-align:center;">
      ${logoBadge(48)}
      <div style="font-size:28px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Binnie's <span style="color:#ff2945;">BET</span></div>
      <div style="font-size:13px;color:#fed7aa;margin-top:4px;">Binnie's English Training</div>
    </div>

    <div style="padding:36px;">
      <p style="font-size:16px;font-weight:700;color:#0f172a;margin:0 0 8px;">Bonjour ${prenom} ${nom} 👋</p>
      <p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Votre mot de passe vient d'être <strong>régénéré</strong> par l'administration Binnie's English Training.
        Voici vos nouveaux identifiants de connexion.
      </p>

      <div style="background:#fff7ed;border:1.5px solid #fed7aa;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;">Vos identifiants de connexion</div>
        <div style="margin-bottom:10px;">
          <span style="font-size:11px;color:#9ca3af;">Email</span><br/>
          <span style="font-size:14px;font-weight:700;color:#0f172a;">${email}</span>
        </div>
        <div>
          <span style="font-size:11px;color:#9ca3af;">Nouveau mot de passe temporaire</span><br/>
          <span style="font-size:16px;font-weight:800;color:#9a3412;letter-spacing:2px;font-family:monospace;">${mdpTemp}</span>
        </div>
      </div>

      <div style="text-align:center;margin-bottom:28px;">
        <a href="${DASH_URL}/access"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#9a3412,#c2410c);color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">
          🚀 Accéder à mon espace
        </a>
      </div>

      <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;">
        En cas de problème de connexion, contactez votre responsable ou écrivez-nous à
        <a href="mailto:${SENDER_EMAIL}" style="color:#9a3412;">${SENDER_EMAIL}</a>.
      </p>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan</p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: "🔑 Binnie's English Training - Vos accès ont été régénérés",
    html,
    tags:    ["staff", "mdp-regenere"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   EMAIL BIENVENUE APPRENANT
═══════════════════════════════════════════════════════════════ */
export async function sendApprenantWelcomeEmail({ prenom, nom, email, mdpTemp, compteExistant = false }) {
  const identifiantsBlock = compteExistant
    ? `<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:14px;padding:24px 28px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">🔐 Vos identifiants de connexion</div>
        <div style="margin-bottom:14px;">
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Adresse email</span><br/>
          <span style="font-size:15px;font-weight:700;color:#011451;">${email}</span>
        </div>
        <div style="background:#fff;border-radius:10px;padding:14px 16px;border:1px solid #bbf7d0;">
          <span style="font-size:12px;color:#166534;font-weight:700;">✅ Utilisez le mot de passe que vous avez créé sur notre site web.</span><br/>
          <span style="font-size:11px;color:#64748b;margin-top:4px;display:block;">Votre compte existant a été activé - aucun nouveau mot de passe n'a été généré.</span>
        </div>
      </div>`
    : `<div style="background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1.5px solid #c7d2fe;border-radius:14px;padding:24px 28px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:800;color:#0c33ac;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">🔐 Vos identifiants de connexion</div>
        <div style="margin-bottom:14px;">
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Adresse email</span><br/>
          <span style="font-size:15px;font-weight:700;color:#011451;">${email}</span>
        </div>
        <div>
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Mot de passe temporaire</span><br/>
          <span style="font-size:20px;font-weight:900;color:#ff2945;letter-spacing:3px;font-family:monospace;">${mdpTemp}</span>
        </div>
      </div>`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(1,20,81,0.12);">

    <div style="background:linear-gradient(135deg,#011451 0%,#0c33ac 60%,#1e40af 100%);padding:36px;text-align:center;">
      ${logoBadge(52)}
      <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Binnie's <span style="color:#ff2945;">BET</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px;text-transform:uppercase;letter-spacing:.1em;">Binnie's English Training · Portail Apprenant</div>
    </div>

    <div style="padding:40px 36px;">
      <p style="font-size:22px;font-weight:800;color:#011451;margin:0 0 6px;">🎓 Bienvenue, ${prenom} !</p>
      <p style="font-size:14px;color:#64748b;line-height:1.7;margin:0 0 28px;">
        ${compteExistant
          ? "Votre compte BET a été activé en tant qu'apprenant sur la plateforme <strong>Binnie's English Training</strong>.<br/>Connectez-vous avec vos identifiants habituels."
          : "Votre compte apprenant vient d'être créé sur la plateforme <strong>Binnie's English Training</strong>.<br/>Voici vos identifiants de connexion pour accéder à votre espace personnel."
        }
      </p>

      ${identifiantsBlock}

      <div style="text-align:center;margin-bottom:32px;">
        <a href="${DASH_URL}/connexion/apprenant"
           style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;">
          🚀 Accéder à mon espace apprenant
        </a>
      </div>

      <div style="background:#fff7ed;border-left:4px solid #ff2945;border-radius:8px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0;font-size:13px;color:#9a3412;line-height:1.6;">
          ⏳ <strong>Note :</strong> Votre espace sera pleinement actif une fois affecté(e) à un groupe et un coach. Vous recevrez un email de confirmation.
        </p>
      </div>

      ${!compteExistant ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;color:#92400e;">
          ⚠️ <strong>Changez votre mot de passe</strong> dès votre première connexion.
        </p>
      </div>` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:28px;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
          <span style="font-size:18px;">📚</span><span style="font-size:12px;font-weight:600;color:#374151;">Cours & modules</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
          <span style="font-size:18px;">✏️</span><span style="font-size:12px;font-weight:600;color:#374151;">Exercices interactifs</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
          <span style="font-size:18px;">📈</span><span style="font-size:12px;font-weight:600;color:#374151;">Suivi de progression</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f8fafc;border-radius:10px;border:1px solid #e5e7eb;">
          <span style="font-size:18px;">🎥</span><span style="font-size:12px;font-weight:600;color:#374151;">Sessions live coach</span>
        </div>
      </div>

      <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;">
        Des questions ? Contactez-nous à
        <a href="mailto:${SENDER_EMAIL}" style="color:#0c33ac;font-weight:600;">${SENDER_EMAIL}</a>.
      </p>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: "🎓 Bienvenue chez Binnie's English Training - Vos accès apprenant",
    html,
    tags:    ["apprenant", "bienvenue"],
  });
}

// ── Badge de fidélité mensuel ("Happy to have You") ─────────────
export async function sendBadgeFideliteEmail({ prenom, email, mois, message, imageUrl, typeRecompense, valeurRecompense }) {
  const recompenseBlock = typeRecompense === "gratuit"
    ? `<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
        <span style="font-size:13px;font-weight:800;color:#16a34a;">🎁 Ce mois est gratuit pour vous !</span>
      </div>`
    : typeRecompense === "reduction"
    ? `<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:1.5px solid #fde68a;border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center;">
        <span style="font-size:13px;font-weight:800;color:#92400e;">🏷️ ${valeurRecompense || ""} de réduction ce mois !</span>
      </div>`
    : "";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(1,20,81,0.12);">
    <div style="background:#0c0a09;padding:0;text-align:center;">
      <img src="${imageUrl}" alt="Badge ${mois}e mois" style="width:100%;display:block;" />
    </div>
    <div style="padding:32px 32px 8px;text-align:center;">
      <p style="font-size:18px;font-weight:800;color:#011451;margin:0 0 10px;">Bravo ${prenom} !</p>
      <p style="font-size:14px;color:#64748b;line-height:1.7;margin:0;">${message}</p>
      ${recompenseBlock}
    </div>
    <div style="text-align:center;padding:8px 32px 32px;">
      <a href="${DASH_URL}"
         style="display:inline-block;padding:14px 34px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:12px;font-weight:800;font-size:14px;">
        🏆 Voir mes badges
      </a>
    </div>
    <div style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      ${logoBadge(28)}
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: `🏅 ${mois}e mois avec BET - Happy to have You !`,
    html,
    tags:    ["apprenant", "badge_fidelite"],
  });
}

export async function sendParentWelcomeEmail({ prenom, nom, email, mdpTemp, enfantNom = "", compteExistant = false }) {
  const identifiantsBlockParent = compteExistant
    ? `<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:14px;padding:24px 28px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:800;color:#16a34a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">🔐 Vos identifiants de connexion</div>
        <div style="margin-bottom:14px;">
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Adresse email</span><br/>
          <span style="font-size:15px;font-weight:700;color:#011451;">${email}</span>
        </div>
        <div style="background:#fff;border-radius:10px;padding:14px 16px;border:1px solid #bbf7d0;">
          <span style="font-size:12px;color:#166534;font-weight:700;">✅ Utilisez le mot de passe que vous avez créé sur notre site web.</span><br/>
          <span style="font-size:11px;color:#64748b;margin-top:4px;display:block;">Votre compte existant a été activé - aucun nouveau mot de passe n'a été généré.</span>
        </div>
      </div>`
    : `<div style="background:linear-gradient(135deg,#f0f4ff,#e8f0fe);border:1.5px solid #c7d2fe;border-radius:14px;padding:24px 28px;margin-bottom:28px;">
        <div style="font-size:11px;font-weight:800;color:#0c33ac;text-transform:uppercase;letter-spacing:.1em;margin-bottom:16px;">🔐 Vos identifiants de connexion</div>
        <div style="margin-bottom:14px;">
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Adresse email</span><br/>
          <span style="font-size:15px;font-weight:700;color:#011451;">${email}</span>
        </div>
        <div>
          <span style="font-size:11px;color:#9ca3af;font-weight:600;">Mot de passe temporaire</span><br/>
          <span style="font-size:20px;font-weight:900;color:#ff2945;letter-spacing:3px;font-family:monospace;">${mdpTemp}</span>
        </div>
      </div>`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(1,20,81,0.12);">

    <div style="background:linear-gradient(135deg,#011451 0%,#0c33ac 60%,#1e40af 100%);padding:36px;text-align:center;">
      ${logoBadge(52)}
      <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">Binnie's <span style="color:#ff2945;">BET</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px;text-transform:uppercase;letter-spacing:.1em;">Binnie's English Training · Espace Parent</div>
    </div>

    <div style="padding:40px 36px;">
      <p style="font-size:22px;font-weight:800;color:#011451;margin:0 0 6px;">👨‍👩‍👧 Bienvenue, ${prenom || nom} !</p>
      <p style="font-size:14px;color:#64748b;line-height:1.7;margin:0 0 28px;">
        ${compteExistant
          ? `Votre espace parent a été activé sur la plateforme <strong>Binnie's English Training</strong>${enfantNom ? ` pour suivre la scolarité de <strong>${enfantNom}</strong>` : ""}.<br/>Connectez-vous avec vos identifiants habituels.`
          : `Un espace parent vient d'être créé sur la plateforme <strong>Binnie's English Training</strong>${enfantNom ? ` pour suivre la scolarité de <strong>${enfantNom}</strong>` : ""}.<br/>Voici vos identifiants de connexion pour accéder à votre espace personnel.`
        }
      </p>

      ${identifiantsBlockParent}

      <div style="text-align:center;margin-bottom:32px;">
        <a href="${DASH_URL}/login-particulier"
           style="display:inline-block;padding:16px 40px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:12px;font-weight:800;font-size:15px;">
          🚀 Accéder à mon espace parent
        </a>
      </div>

      ${!compteExistant ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:8px;padding:12px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;color:#92400e;">
          ⚠️ <strong>Changez votre mot de passe</strong> dès votre première connexion.
        </p>
      </div>` : ""}

      <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:0;">
        Des questions ? Contactez-nous à
        <a href="mailto:${SENDER_EMAIL}" style="color:#0c33ac;font-weight:600;">${SENDER_EMAIL}</a>.
      </p>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to:      email,
    subject: "👨‍👩‍👧 Bienvenue chez Binnie's English Training - Votre espace parent",
    html,
    tags:    ["parent", "bienvenue"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION FORMULAIRE CONTACT (site public → email_central)
═══════════════════════════════════════════════════════════════ */
export async function sendContactNotificationEmail({ to, nom, email, telephone, type, sujet, message }) {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#011451,#0c33ac);padding:28px 32px;text-align:center;">
      ${logoBadge(36)}
      <div style="font-size:20px;font-weight:900;color:#fff;">📩 Nouveau message - Formulaire Contact</div>
    </div>
    <div style="padding:32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr><td style="padding:6px 0;font-size:12px;color:#9ca3af;width:110px;">Nom</td><td style="padding:6px 0;font-size:14px;color:#011451;font-weight:700;">${nom}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#9ca3af;">Email</td><td style="padding:6px 0;font-size:14px;color:#011451;">${email}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#9ca3af;">Téléphone</td><td style="padding:6px 0;font-size:14px;color:#011451;">${telephone || "-"}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#9ca3af;">Type</td><td style="padding:6px 0;font-size:14px;color:#011451;">${type || "particulier"}</td></tr>
        <tr><td style="padding:6px 0;font-size:12px;color:#9ca3af;">Sujet</td><td style="padding:6px 0;font-size:14px;color:#011451;">${sujet || "-"}</td></tr>
      </table>
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
        <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Message</div>
        <div style="font-size:14px;color:#374151;line-height:1.7;white-space:pre-line;">${message}</div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to,
    subject: `📩 Nouveau message de contact - ${nom}`,
    html,
    replyTo: email,
    tags: ["contact"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   REÇU DE PAIEMENT (paiement en ligne TouchPoint - boutique ou
   formation/prospect) - reprend les mêmes champs que la page de
   confirmation affichée côté client juste après le paiement.
═══════════════════════════════════════════════════════════════ */
export async function sendPaymentReceiptEmail({ clientNom, email, offreLabel, montant, modePaiement, reference, dateConfirmation, moisLabel }) {
  const dateAffichee = new Date(dateConfirmation || Date.now()).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });
  const montantAffiche = `${Number(montant).toLocaleString("fr-FR")} FCFA`;

  const ligne = (label, valeur) => `
    <tr>
      <td style="padding:9px 0;font-size:12.5px;color:#9ca3af;border-bottom:1px solid #f1f5f9;">${label}</td>
      <td style="padding:9px 0;font-size:13.5px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;">${valeur}</td>
    </tr>`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#011451,#0c33ac);padding:32px 36px;text-align:center;">
      ${logoBadge(44)}
    </div>

    <div style="padding:36px;text-align:center;">
      <div style="font-size:40px;line-height:1;margin-bottom:12px;">✅</div>
      <p style="font-size:19px;font-weight:800;color:#15803d;margin:0 0 6px;">Paiement confirmé !</p>
      <p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;">
        Bonjour ${clientNom}, votre paiement a bien été reçu. Notre équipe vous contactera sous 24h pour finaliser votre inscription.
      </p>

      <table style="width:100%;border-collapse:collapse;text-align:left;">
        ${ligne("Client", clientNom)}
        ${offreLabel ? ligne("Offre", offreLabel) : ""}
        ${moisLabel ? ligne("Mois concerné", `<span style="color:#0c33ac;">${moisLabel}</span>`) : ""}
        ${ligne("Montant payé", `<span style="color:#15803d;">${montantAffiche}</span>`)}
        ${ligne("Moyen de paiement", modePaiement || "TouchPoint")}
        ${ligne("Confirmé le", dateAffichee)}
        ${ligne("Référence", reference)}
      </table>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to: email,
    subject: "✅ Paiement confirmé - Binnie's English Training",
    html,
    tags: ["paiement", "recu"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   RÉSULTAT DU TEST DE NIVEAU (gratuit, public) - même référentiel CECRL
   que la page FreeLevelTest.jsx (Frontend/src/Pages/FreeLevelTest).
═══════════════════════════════════════════════════════════════ */
const CEFR_INFO = {
  A1: { label: "Débutant",         color: "#64748b", icon: "🌱", cours: "Anglais Débutant A1→A2" },
  A2: { label: "Élémentaire",      color: "#d97706", icon: "🌿", cours: "Anglais Élémentaire A2→B1" },
  B1: { label: "Intermédiaire",    color: "#0c33ac", icon: "🌳", cours: "Anglais Intermédiaire B1→B2" },
  B2: { label: "Inter. Supérieur", color: "#7c3aed", icon: "⭐", cours: "Préparation TOEIC / IELTS" },
  C1: { label: "Avancé",           color: "#059669", icon: "🏆", cours: "Anglais Expert C1→C2" },
  C2: { label: "Maîtrise",         color: "#ff2945", icon: "👑", cours: "Perfectionnement & Accent" },
};

const CAT_INFO = {
  "Grammaire":     { c:"#0c33ac", bg:"#eef1ff" },
  "Vocabulaire":   { c:"#92400e", bg:"#fefce8" },
  "Compréhension": { c:"#065f46", bg:"#f0fdf4" },
  "Listening":     { c:"#9d174d", bg:"#fdf2f8" },
  "Reading":       { c:"#075985", bg:"#e0f2fe" },
  "Speaking":      { c:"#9a3412", bg:"#fff7ed" },
  "Orthographe":   { c:"#5b21b6", bg:"#ede9fe" },
  "Expression":    { c:"#cc1530", bg:"#fee2e2" },
};

export async function sendLevelTestResultEmail({ prenom, email, niveau, score, correctionEnAttente = false, byCategory = null }) {
  const info = CEFR_INFO[niveau];

  // Détail par partie du test (Grammaire, Listening, Reading...) - byCategory est l'objet
  // by_category stocké sur level_test_results : { [categorie]: { correct, total, pts, max } }.
  const categoriesBlock = (!correctionEnAttente && byCategory && Object.keys(byCategory).length) ? `
      <div style="margin-bottom:24px;">
        <div style="font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;">Détail par partie</div>
        <table style="width:100%;border-collapse:collapse;">
          ${Object.entries(byCategory).map(([cat, s]) => {
            const ci = CAT_INFO[cat] || { c: "#374151", bg: "#f8fafc" };
            const max = s.max || s.total || 0;
            const pct = max > 0 ? Math.round((s.pts || s.correct || 0) / max * 100) : 0;
            return `<tr>
              <td style="padding:7px 0;font-size:12.5px;color:#374151;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ci.c};margin-right:7px;vertical-align:middle;"></span>${cat}
              </td>
              <td style="padding:7px 0;text-align:right;">
                <span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${ci.bg};color:${ci.c};font-weight:700;font-size:11.5px;">${pct}%</span>
              </td>
            </tr>`;
          }).join("")}
        </table>
      </div>` : "";

  const corpsBlock = correctionEnAttente ? `
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0 0 20px;">
        Merci d'avoir passé votre test de niveau Binnie's English Training ! Votre partie orale/rédigée est en cours de correction
        par notre équipe pédagogique - vous recevrez votre niveau CECRL définitif sous peu.
      </p>` : `
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:${info?.color || "#0c33ac"}15;border:1.5px solid ${info?.color || "#0c33ac"};border-radius:16px;padding:20px 32px;">
          <div style="font-size:32px;line-height:1;margin-bottom:6px;">${info?.icon || "🎓"}</div>
          <div style="font-size:11px;font-weight:700;color:${info?.color || "#0c33ac"};text-transform:uppercase;letter-spacing:.1em;">Votre niveau CECRL</div>
          <div style="font-size:24px;font-weight:900;color:${info?.color || "#0c33ac"};margin-top:4px;">${niveau} - ${info?.label || ""}</div>
          ${score != null ? `<div style="font-size:12px;color:#64748b;margin-top:6px;">Score global : ${Math.round(score)}%</div>` : ""}
        </div>
      </div>
      ${categoriesBlock}
      ${info?.cours ? `<p style="font-size:13px;color:#374151;line-height:1.7;margin:0 0 24px;text-align:center;">Programme recommandé pour progresser : <strong>${info.cours}</strong></p>` : ""}`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <div style="background:linear-gradient(135deg,#011451,#0c33ac);padding:32px 36px;text-align:center;">
      ${logoBadge(44)}
    </div>

    <div style="padding:36px;">
      <p style="font-size:16px;font-weight:800;color:#011451;margin:0 0 16px;text-align:center;">
        ${correctionEnAttente ? "📝 Test bien reçu" : "🎉 Vos résultats sont prêts !"}
      </p>
      ${prenom ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 14px;text-align:center;">Bonjour ${prenom},</p>` : ""}
      ${corpsBlock}
      <div style="text-align:center;">
        <a href="${FRONT_URL}"
           style="display:inline-block;padding:13px 30px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:13.5px;">
          🚀 Découvrir nos formations
        </a>
      </div>
    </div>

    <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to: email,
    subject: correctionEnAttente ? "📝 Votre test de niveau Binnie's English Training a bien été reçu" : `🎉 Votre niveau CECRL : ${niveau} - Binnie's English Training`,
    html,
    tags: ["test_niveau"],
  });
}

/* ═══════════════════════════════════════════════════════════════
   NOTIFICATION GÉNÉRIQUE (double du in-app) - échéances de paiement,
   factures impayées, devoirs/évaluations clôturés, confirmation newsletter.
   Un seul template partagé pour ne pas multiplier les gabarits pour des
   messages courts qui n'ont pas besoin d'une mise en page dédiée.
═══════════════════════════════════════════════════════════════ */
export async function sendNotificationEmail({ prenom, email, titre, message, ctaLabel, ctaUrl, tag }) {
  const ctaBlock = ctaUrl ? `
    <div style="text-align:center;margin-top:24px;">
      <a href="${ctaUrl}"
         style="display:inline-block;padding:13px 30px;background:linear-gradient(135deg,#011451,#0c33ac);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:13.5px;">
        ${ctaLabel || "Voir dans mon espace"}
      </a>
    </div>` : "";

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,sans-serif;background:#f0f4ff;margin:0;padding:0;">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#011451,#0c33ac);padding:28px 32px;text-align:center;">
      ${logoBadge(40)}
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;font-weight:800;color:#011451;margin:0 0 12px;">${titre}</p>
      ${prenom ? `<p style="font-size:13px;color:#9ca3af;margin:0 0 14px;">Bonjour ${prenom},</p>` : ""}
      <p style="font-size:14px;color:#374151;line-height:1.7;margin:0;white-space:pre-line;">${message}</p>
      ${ctaBlock}
    </div>
    <div style="background:#f8fafc;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} Binnie's English Training, Abidjan, Côte d'Ivoire</p>
    <p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
    </div>
  </div>
</body>
</html>`;

  return brevoSend({
    to: email,
    subject: titre,
    html,
    tags: ["notification", tag].filter(Boolean),
  });
}

/* ═══════════════════════════════════════════════════════════════
   CAMPAGNE NEWSLETTER (envoi groupé)
   Brevo Contacts API peut être utilisée pour des campagnes mass,
   mais ici on garde le mode transactionnel 1 par 1 avec le même brevoSend.
═══════════════════════════════════════════════════════════════ */
/**
 * Une pièce jointe que Brevo doit pouvoir TÉLÉCHARGER lui-même.
 *
 * Le compte Cloudinary de BET refuse la livraison publique des fichiers `raw` - un PDF,
 * un document - avec un `401 deny or ACL failure`. Brevo accepte alors l'envoi, puis le
 * rejette faute de pouvoir récupérer le fichier, et le message n'arrive jamais. Le backend
 * détient le secret du compte : il signe un lien temporaire que Cloudinary honore.
 *
 * Deux heures de validité : Brevo télécharge dans la minute, mais une campagne programmée
 * peut partir plus tard, et un lien expiré ferait échouer tout l'envoi.
 */
async function lienTelechargeable(url) {
  if (!url || !String(url).includes("res.cloudinary.com")) return url;
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (r.ok) return url;   // la livraison publique suffit : on ne change rien
    const m = String(url).match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(.+)$/);
    if (!m) return url;
    const resource_type = m[1];
    const chemin = m[2].split("?")[0];
    const ext = chemin.includes(".") ? chemin.split(".").pop().toLowerCase() : "";
    // `raw` garde son extension dans l'identifiant ; les autres non.
    const public_id = resource_type === "raw" ? chemin : chemin.replace(/\.[^.]+$/, "");
    const { v2: cloudinary } = await import("cloudinary");
    return cloudinary.utils.private_download_url(public_id, ext, {
      resource_type, type: "upload",
      expires_at: Math.floor(Date.now() / 1000) + 7200,
    });
  } catch (e) {
    console.warn("[email/piece jointe] signature impossible:", e.message);
    return url;
  }
}

export async function sendNewsletterCampaign({ emails, sujet, contenu, piece_jointe_url, piece_jointe_nom, tagCampagne }) {
  const urlEnvoi = await lienTelechargeable(piece_jointe_url);
  const attachments = piece_jointe_url ? [{ url: urlEnvoi, name: piece_jointe_nom || "piece-jointe" }] : [];
  const tags = tagCampagne ? ["newsletter", tagCampagne] : ["newsletter"];
  const year = new Date().getFullYear();
  let sent = 0, failed = 0;
  const erreurs = [];
  // Le DÉTAIL par destinataire, et pas seulement les totaux : c'est ce qui permet
  // d'écrire une ligne d'historique par personne, donc de répondre plus tard à
  // « qui a reçu quoi, et pourquoi les autres n'ont rien reçu ».
  const details = [];

  const preheader = (contenu || "").replace(/\s+/g, " ").trim().slice(0, 130);

  /* Le corps est du TEXTE SAISI dans une zone de texte simple : il est echappe avant
     d'entrer dans le HTML. Sans cela, un « < » dans une phrase cassait la mise en page,
     et un collage malheureux pouvait injecter du balisage dans le message. */
  const echapper = (t) => String(t || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  /* LES LIENS DEVIENNENT CLIQUABLES. Ils etaient rendus en texte brut : le lecteur voyait
     l'adresse mais ne pouvait rien en faire - c'est precisement ce qu'une campagne cherche
     a obtenir. */
  const lierUrls = (t) => t.replace(
    /(https?:\/\/[^\s<>"')]+)/g,
    (u) => `<a href="${u}" style="color:#0c33ac;text-decoration:underline;word-break:break-all;">${u}</a>`,
  );

  const corpsHtml = lierUrls(echapper(contenu));

  /* LA PIECE JOINTE S'AFFICHE. Une image etait annoncee par son nom, en texte, sans etre
     montree ni meme cliquable - pour une campagne dont le visuel EST le message, c'est
     tout l'envoi qui manquait sa cible. Une image est donc rendue en grand ; tout autre
     fichier devient un vrai lien de telechargement. */
  const estImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(piece_jointe_url || "");

  const attachmentBlock = !piece_jointe_url ? "" : estImage ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr><td align="center">
        <a href="${piece_jointe_url}" style="text-decoration:none;">
          <img src="${piece_jointe_url}" alt="${piece_jointe_nom || ""}" width="528"
               style="display:block;width:100%;max-width:528px;height:auto;border-radius:12px;border:1px solid #e2e8f0;" />
        </a>
      </td></tr>
    </table>` : `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
      <tr><td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="width:36px;height:36px;background:#e0f2fe;border-radius:10px;text-align:center;vertical-align:middle;font-size:16px;">📎</td>
          <td style="padding-left:12px;font-size:13px;color:#0369a1;vertical-align:middle;">
            <a href="${piece_jointe_url}" style="color:#0369a1;text-decoration:none;">
              Pièce jointe&nbsp;: <strong style="text-decoration:underline;">${piece_jointe_nom || "télécharger le fichier"}</strong>
            </a>
          </td>
        </tr></table>
      </td></tr>
    </table>`;

  for (const email of emails) {
    const unsubToken = Buffer.from(email).toString("base64");
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${sujet}</title>
</head>
<body style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;background:#eef2f7;margin:0;padding:0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(1,20,81,.10);">

        <tr><td style="height:5px;line-height:5px;font-size:0;background:linear-gradient(90deg,#ff2945 0%,#0c33ac 55%,#011451 100%);">&nbsp;</td></tr>

        <tr><td style="background:linear-gradient(135deg,#011451 0%,#0c33ac 60%,#1e40af 100%);padding:36px 36px 30px;text-align:center;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
            <td style="width:44px;height:44px;background:#fff;border-radius:12px;text-align:center;vertical-align:middle;padding:4px;">
              <img src="${LOGO_URL}" alt="Binnie's English Training" width="36" height="36" style="display:block;width:36px;height:36px;object-fit:contain;" />
            </td>
            <td style="padding-left:14px;text-align:left;vertical-align:middle;">
              <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-.3px;line-height:1.1;">Binnie's <span style="color:#ff2945;">BET</span></div>
              <div style="font-size:11px;color:#93c5fd;margin-top:3px;text-transform:uppercase;letter-spacing:.14em;">Binnie's English Training</div>
            </td>
          </tr></table>
          <div style="margin-top:22px;display:inline-block;padding:6px 16px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);border-radius:999px;font-size:10.5px;color:#e0e7ff;text-transform:uppercase;letter-spacing:.16em;font-weight:700;">✉️ Newsletter</div>
        </td></tr>

        <tr><td style="padding:38px 40px 8px;">
          <h1 style="font-size:22px;font-weight:800;color:#011451;margin:0 0 22px;line-height:1.35;">${sujet}</h1>
          <div style="font-size:15px;color:#374151;line-height:1.85;white-space:pre-line;">${corpsHtml}</div>
        </td></tr>

        <tr><td style="padding:22px 40px 36px;">
          ${attachmentBlock}
        </td></tr>

        <tr><td style="padding:0 40px;"><div style="height:1px;background:#e5e7eb;"></div></td></tr>

        <tr><td style="padding:26px 40px 30px;background:#f8fafc;text-align:center;">
          <div style="font-size:13px;font-weight:800;color:#011451;margin-bottom:4px;">Binnie's English Training</div>
          <p style="margin:0 0 14px;font-size:11.5px;color:#9ca3af;line-height:1.6;">Abidjan, Côte d'Ivoire · Vous recevez cet email car vous êtes inscrit(e) à la newsletter Binnie's English Training.</p>
          <a href="${API_PUBLIQUE}/api/newsletter/unsubscribe?token=${unsubToken}"
             style="display:inline-block;font-size:11.5px;color:#6b7280;text-decoration:underline;">Se désinscrire</a>
          <p style="margin:10px 0 0;font-size:11px;color:#9ca3af;">✉️ <a href="mailto:contact@binniesenglish.com" style="color:#9ca3af;text-decoration:underline;">contact@binniesenglish.com</a></p>
          <p style="margin:8px 0 0;font-size:11px;color:#d1d5db;">© ${year} Binnie's English Training - Tous droits réservés</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await brevoSend({ to: email, subject: sujet, html, tags, attachments });
      sent++;
      details.push({ email, ok: true });
    } catch (e) {
      // L'erreur etait AVALEE en silence : un envoi qui echouait ne laissait aucune
      // trace, ni dans les journaux ni dans la reponse. Diagnostiquer demandait d'aller
      // lire les evenements chez Brevo.
      failed++;
      const msg = (e?.message || "envoi refusé").slice(0, 200);
      if (!erreurs.includes(msg)) erreurs.push(msg);
      details.push({ email, ok: false, erreur: msg });
      console.error(`[newsletter] échec pour ${email} :`, msg);
    }
  }

  return { sent, failed, erreurs, details };
}

// ── Statistiques Brevo d'une campagne, agrégées par tag unique ──
export async function getBrevoStatsForTag(tag) {
  const stats = { requests: 0, delivered: 0, opened: 0, clicks: 0, hardBounces: 0, softBounces: 0, blocked: 0, spam: 0, unsubscribed: 0 };
  if (!BREVO_API_KEY || !tag) return stats;

  const r = await fetch(`${BREVO_API_URL.replace("/smtp/email", "/smtp/statistics/events")}?tags=${encodeURIComponent(tag)}&limit=2500&sort=desc`, {
    headers: { "api-key": BREVO_API_KEY, accept: "application/json" },
  });
  if (!r.ok) return stats;
  const data = await r.json();
  const openedEmails = new Set(), clickedEmails = new Set();
  for (const ev of data.events || []) {
    if (ev.event === "opened") openedEmails.add(ev.email);
    else if (ev.event === "clicks" || ev.event === "click") clickedEmails.add(ev.email);
    else if (stats[ev.event] !== undefined) stats[ev.event]++;
  }
  stats.opened = openedEmails.size;
  stats.clicks = clickedEmails.size;
  return stats;
}
