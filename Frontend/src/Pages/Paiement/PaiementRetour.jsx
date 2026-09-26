import React, { useEffect, useState, useRef } from "react";
import { ga4 } from "../../utils/ga4";
import { useSearchParams, Link } from "react-router-dom";
import SEO from "../Components/SEO/SEO";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";

// TouchPoint redirige vers cette page dès que le débit est initié côté client
// (avant même que l'utilisateur valide le code sur son téléphone) - le vrai
// statut n'arrive qu'ensuite via le webhook /callback. On reinterroge donc
// /verify à intervalle régulier tant que ça reste "en_attente", au lieu d'une
// vérification unique qui reste figée pour toujours sur "en cours".
const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 36; // ~3 minutes

const PaiementRetour = () => {
  const [params]  = useSearchParams();
  const [statut,  setStatut]  = useState("chargement");
  // L'achat n'est annoncé qu'une fois, malgré le sondage répété du statut.
  const achatDeclare = useRef(false);
  const [paiement, setPaiement] = useState(null);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  // Si le prospect a payé via un AUTRE lien (relance envoyée par la commerciale) pendant
  // que cette page reste ouverte sur la tentative d'origine, celle-ci resterait sinon
  // bloquée sur "en cours"/"échoué" indéfiniment alors que le dossier est déjà réglé.
  const [dejaPayeVia, setDejaPayeVia] = useState(null);

  const orderNumber = params.get("order_number");
  // TouchPoint ne nous appelle pas toujours de façon fiable côté serveur
  // (callback en cours d'investigation avec leur support), mais transmet les
  // mêmes informations directement dans l'URL de redirection vers le
  // navigateur du client - confirmé empiriquement le 21/08/2026. On les
  // utilise pour finaliser le paiement avant de vérifier le statut, au lieu
  // d'attendre indéfiniment un callback qui peut ne jamais arriver.
  const errorCode              = params.get("errorCode");
  const amount                 = params.get("amount");
  const numTransactionFromGu   = params.get("num_transaction_from_gu");

  useEffect(() => {
    if (!orderNumber) { setStatut("erreur"); return; }

    let cancelled = false;
    let attempts  = 0;
    setPollingTimedOut(false);

    const verify = () => {
      fetch(`${API_BASE}/api/touchpoint/verify`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ order_number: orderNumber }),
      })
        .then(r => r.json())
        .then(({ paiement, deja_paye_via }) => {
          if (cancelled) return;
          setPaiement(paiement ? { ...paiement, transaction_id: paiement.order_number } : paiement);
          const s = paiement?.statut || "en_attente";
          setStatut(s);

          /* LA CONVERSION, déclarée UNE SEULE FOIS. Cet écran interroge la passerelle en
             boucle jusqu'à ce que le statut se fige : sans ce garde-fou, chaque tour
             renverrait un achat à GA4 et le chiffre d'affaires y serait multiplié par le
             nombre de sondages. */
          if (s === "validé" && !achatDeclare.current) {
            achatDeclare.current = true;
            ga4.paiementConfirme({
              montant: paiement?.montant,
              reference: paiement?.order_number,
              offre: paiement?.offre_label,
            });
          }

          if (deja_paye_via) { setDejaPayeVia(deja_paye_via); return; }

          if (s === "en_attente") {
            attempts += 1;
            if (attempts >= POLL_MAX_ATTEMPTS) { setPollingTimedOut(true); return; }
            setTimeout(verify, POLL_INTERVAL_MS);
          }
        })
        .catch(() => {
          if (cancelled) return;
          setStatut("en_attente");
          attempts += 1;
          if (attempts >= POLL_MAX_ATTEMPTS) { setPollingTimedOut(true); return; }
          setTimeout(verify, POLL_INTERVAL_MS);
        });
    };

    const confirmerPuisVerifier = async () => {
      if (errorCode) {
        try {
          await fetch(`${API_BASE}/api/touchpoint/confirm-redirect`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({
              order_number: orderNumber,
              errorCode,
              amount,
              num_transaction_from_gu: numTransactionFromGu,
            }),
          });
        } catch (_) { /* on retombe sur le polling /verify dans tous les cas */ }
      }
      if (!cancelled) verify();
    };

    confirmerPuisVerifier();
    return () => { cancelled = true; };
  }, [orderNumber, errorCode, amount, numTransactionFromGu, refreshTick]);

  const F = "'Montserrat','Segoe UI',sans-serif";

  const config = {
    validé:     { emoji:"✅", titre:"Paiement confirmé !", color:"#059669", bg:"#f0fdf4", border:"#bbf7d0", msg:"Votre paiement a bien été reçu. Notre équipe vous contactera sous 24h pour finaliser votre inscription." },
    en_attente: { emoji:"⏳", titre:"Paiement en cours...",  color:"#d97706", bg:"#fef9c3", border:"#fde68a", msg:"Votre paiement est en cours de traitement. Vous recevrez une confirmation par email dès qu'il sera validé." },
    échoué:     { emoji:"❌", titre:"Paiement échoué",       color:"#ff2945", bg:"#fff0f2", border:"#fecdd3", msg:"Votre paiement n'a pas pu être traité. Aucun montant n'a été débité. Réessayez ou choisissez un autre moyen de paiement." },
    annulé:     { emoji:"↩️", titre:"Paiement annulé",       color:"#6b7280", bg:"#f9fafb", border:"#e5e7eb", msg:"Vous avez annulé le paiement. Aucun montant n'a été débité." },
    chargement: { emoji:"⏳", titre:"Vérification...",        color:"#0c33ac", bg:"#eef1ff", border:"#b3c4ff", msg:"Nous vérifions votre paiement..." },
    erreur:     { emoji:"⚠️", titre:"Lien invalide",          color:"#ff2945", bg:"#fff0f2", border:"#fecdd3", msg:"Ce lien de paiement est invalide ou expiré." },
    // Affichage uniquement - ne change jamais le vrai statut en base : la confirmation
    // TouchPoint (webhook /callback) n'est pas toujours fiable/rapide, donc rester en
    // "en_attente" ne veut pas dire que ça va forcément aboutir. Après ~3 min sans
    // nouvelle, on prévient honnêtement que ça semble ne pas avoir abouti, sans pour
    // autant verrouiller le dossier - un vrai succès tardif pourra encore être appliqué.
    probablement_echoue: { emoji:"⚠️", titre:"Paiement probablement non abouti", color:"#d97706", bg:"#fef9c3", border:"#fde68a", msg:"Nous n'avons toujours pas reçu de confirmation après plusieurs minutes - le paiement a probablement échoué ou a été annulé. Si vous avez bien validé sur votre téléphone, patientez encore un peu puis vérifiez à nouveau ; sinon, réessayez ou contactez votre conseillère." },
    deja_paye_ailleurs:  { emoji:"✅", titre:"Paiement déjà reçu", color:"#059669", bg:"#f0fdf4", border:"#bbf7d0", msg:"Cette tentative de paiement n'a pas abouti, mais votre dossier a déjà été réglé via un autre lien de paiement. Retrouvez votre reçu dans votre espace." },
  };

  const pollTimedOutSansReponse = statut === "en_attente" && pollingTimedOut;
  const c = dejaPayeVia ? config.deja_paye_ailleurs : (pollTimedOutSansReponse ? config.probablement_echoue : (config[statut] || config.en_attente));

  const exporterRecuPDF = () => {
    if (!paiement) return;
    const win = window.open("", "_blank", "width=700,height=900");
    win.document.write(`
      <html><head><title>Reçu de paiement - BET</title>
      <style>
        body{font-family:'Segoe UI',Arial,sans-serif;padding:36px;color:#0f172a}
        .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0c33ac;padding-bottom:20px;margin-bottom:28px}
        .logo{font-size:24px;font-weight:900;color:#0c33ac}
        .logo-sub{font-size:11px;color:#6b7280;margin-top:4px}
        h2{margin:0 0 4px;font-size:19px;font-weight:800}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}
        .card{background:#f8fafc;border-radius:8px;padding:12px;border:1px solid #e2e8f0}
        .label{font-size:11px;color:#9ca3af;margin-bottom:4px}
        .val{font-size:13px;font-weight:700}
        .badge{display:inline-block;background:#dcfce7;color:#15803d;padding:6px 18px;border-radius:20px;font-weight:800;font-size:13px;margin-top:8px}
        .footer{margin-top:32px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;line-height:1.7}
        @media print{button{display:none}}
      </style></head><body>
      <div class="header">
        <div>
          <div class="logo">Binnie's English Training</div>
          <div class="logo-sub">Centre de langues agréé - Abidjan, Côte d'Ivoire</div>
        </div>
        <div style="text-align:right">
          <h2>REÇU DE PAIEMENT</h2>
          <div class="logo-sub">Émis le ${new Date().toLocaleDateString("fr-FR",{day:"2-digit",month:"long",year:"numeric"})}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;text-align:center">
        <div class="label">Montant payé</div>
        <div style="font-size:24px;font-weight:900;color:#15803d">${Number(paiement.montant||0).toLocaleString("fr-FR")} FCFA</div>
        <div class="badge">✅ Paiement confirmé</div>
      </div>
      <div class="grid">
        <div class="card"><div class="label">Client</div><div class="val">${paiement.client_nom||"-"}</div></div>
        ${paiement.offre_label ? `<div class="card"><div class="label">Offre</div><div class="val">${paiement.offre_label}</div></div>` : ""}
        ${paiement.offre_formule ? `<div class="card"><div class="label">Formule</div><div class="val">${paiement.offre_formule}</div></div>` : ""}
        ${paiement.niveau ? `<div class="card"><div class="label">Niveau</div><div class="val">${paiement.niveau}</div></div>` : ""}
        ${paiement.payment_mode ? `<div class="card"><div class="label">Moyen de paiement</div><div class="val">${paiement.payment_mode}</div></div>` : ""}
        ${paiement.updated_at ? `<div class="card"><div class="label">Confirmé le</div><div class="val">${new Date(paiement.updated_at).toLocaleString("fr-FR",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div></div>` : ""}
        <div class="card" style="grid-column:1/-1"><div class="label">Référence transaction</div><div class="val" style="font-family:monospace">${paiement.transaction_id||"-"}</div></div>
      </div>
      <div class="footer">
        Ce reçu est généré automatiquement. Conservez ce document pour vos archives.<br/>
        Binnie's English Training - Abidjan, Côte d'Ivoire
      </div>
      <div style="text-align:center;margin-top:20px">
        <button onclick="window.print()" style="padding:10px 24px;background:#0c33ac;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700">🖨️ Imprimer / Exporter en PDF</button>
      </div>
      </body></html>`);
    win.document.close();
  };

  return (
    <div style={{ fontFamily:F, minHeight:"100vh", background:"#f8fafc", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <SEO title="Retour paiement - BET" description="Statut de votre paiement BET." canonicalUrl="/paiement/retour" noindex />
      <div style={{ background:"#fff", borderRadius:24, maxWidth:520, width:"100%", boxShadow:"0 8px 40px rgba(0,0,0,.08)", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#011451,#0c33ac)", padding:"32px 28px", textAlign:"center" }}>
          <img src="/assets/BIINIES-ENGLISH-LOGO.png" alt="BET" style={{ height:50, objectFit:"contain" }} />
        </div>

        {/* Statut */}
        <div style={{ padding:"32px 28px", textAlign:"center" }}>
          <div style={{ fontSize:52, marginBottom:16 }}>{c.emoji}</div>
          <h1 style={{ margin:"0 0 12px", fontSize:"1.4rem", fontWeight:900, color:c.color }}>{c.titre}</h1>
          <p style={{ fontSize:".95rem", color:"#475569", lineHeight:1.7, margin:"0 0 24px" }}>{c.msg}</p>

          {pollTimedOutSansReponse && !dejaPayeVia && (
            <button
              onClick={() => { setPollingTimedOut(false); setStatut("chargement"); setRefreshTick(t => t + 1); }}
              style={{ display:"block", margin:"0 auto 24px", padding:"9px 16px", background:"#d97706", color:"#fff", border:"none", borderRadius:8, fontWeight:700, fontSize:13, cursor:"pointer" }}>
              🔄 Vérifier à nouveau
            </button>
          )}

          {/* Onglet Paiement */}
          {paiement && statut === "validé" && (
            <div style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:14, padding:"18px 20px", marginBottom:24, textAlign:"left" }}>
              <div style={{ fontWeight:800, fontSize:14, color:"#011451", marginBottom:12 }}>💳 Paiement</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, fontSize:13, color:"#374151" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#9ca3af" }}>Client</span>
                  <span style={{ fontWeight:700 }}>{paiement.client_nom}</span>
                </div>
                {paiement.offre_label && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Offre</span>
                    <span style={{ fontWeight:700 }}>{paiement.offre_label}</span>
                  </div>
                )}
                {paiement.offre_formule && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Formule</span>
                    <span style={{ fontWeight:700 }}>{paiement.offre_formule}</span>
                  </div>
                )}
                {paiement.niveau && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Niveau</span>
                    <span style={{ fontWeight:700 }}>{paiement.niveau}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", paddingTop:8, borderTop:"1px solid #e2e8f0" }}>
                  <span style={{ color:"#9ca3af" }}>Montant payé</span>
                  <span style={{ fontWeight:900, color:c.color, fontSize:16 }}>{Number(paiement.montant).toLocaleString("fr-FR")} FCFA</span>
                </div>
                {paiement.payment_mode && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Moyen de paiement</span>
                    <span style={{ fontWeight:700 }}>{paiement.payment_mode}</span>
                  </div>
                )}
                {paiement.updated_at && (
                  <div style={{ display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"#9ca3af" }}>Confirmé le</span>
                    <span style={{ fontWeight:700 }}>{new Date(paiement.updated_at).toLocaleString("fr-FR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"#9ca3af" }}>Référence</span>
                  <span style={{ fontWeight:600, fontSize:11, color:"#6b7280", fontFamily:"monospace" }}>{paiement.transaction_id}</span>
                </div>
              </div>
              <button onClick={exporterRecuPDF}
                style={{ marginTop:16, width:"100%", padding:"11px 16px", background:"#011451", color:"#fff", border:"none", borderRadius:10, fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                📄 Exporter le reçu en PDF
              </button>
            </div>
          )}

          {/* CTA */}
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <Link to="/" style={{ display:"block", padding:"13px 20px", background:"#0c33ac", color:"#fff", borderRadius:10, fontWeight:700, fontSize:".95rem", textDecoration:"none" }}>
              Retour à l'accueil
            </Link>
            <Link to="/contact" style={{ display:"block", padding:"13px 20px", background:"transparent", color:"#0c33ac", border:"2px solid #0c33ac", borderRadius:10, fontWeight:700, fontSize:".95rem", textDecoration:"none" }}>
              Nous contacter
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaiementRetour;
