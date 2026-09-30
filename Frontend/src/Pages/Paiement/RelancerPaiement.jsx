import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import SEO from "../Components/SEO/SEO";
import { payerAvecTouchPoint, parsePrixFCFA } from "../../utils/touchpoint";

// Lien de relance généré par une commerciale depuis son dashboard (bouton "🔄 Renvoyer
// le lien") - permet à un prospect dont le paiement en ligne a échoué/a été abandonné
// de reprendre directement à l'étape paiement, sans refaire tout le parcours d'inscription.
const RelancerPaiement = () => {
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState("");

  const nom            = params.get("nom") || "";
  const email           = params.get("email") || "";
  const telephone       = params.get("telephone") || "";
  const offre           = params.get("offre") || "Votre formation";
  const montant         = parsePrixFCFA(params.get("montant"));
  const assignationId   = params.get("assignation_id") || undefined;
  const assistanteId    = params.get("assistante_id") || undefined;
  const moisId          = params.get("mois_id") || undefined;

  const lienInvalide = !email || !montant;

  const handlePayer = async () => {
    setLoading(true);
    setErreur("");
    try {
      await payerAvecTouchPoint({
        clientInfo: { nom, email, telephone },
        montant,
        offreLabel: offre,
        assignationId,
        assistanteId,
        // mois_id référence plan_paiement.mois_paiements[].id (Plan mensuel coaching privé)
        // - lu par finalizeSuccessfulPayment côté backend pour marquer automatiquement CE
        // mois comme payé dès la confirmation TouchPoint, sans saisie manuelle ensuite.
        message: moisId ? JSON.stringify({ mois_id: moisId }) : undefined,
      });
      // En cas de succès, sendPaymentInfos() redirige déjà le navigateur - rien de plus à faire.
    } catch (e) {
      if (!e.annuleParUtilisateur) setErreur(e.message || "Impossible de lancer le paiement. Réessayez ou contactez votre conseillère.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"#f8fafc", padding:20, fontFamily:"Arial,sans-serif" }}>
      <SEO title="Finaliser votre paiement - BET Languages" noindex />
      <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 12px 40px rgba(0,0,0,.08)", padding:"36px 32px", maxWidth:440, width:"100%", textAlign:"center" }}>
        <div style={{ fontSize:28, fontWeight:900, color:"#0c33ac", marginBottom:4 }}>BET<span style={{ color:"#011451" }}>Languages</span></div>
        <div style={{ fontSize:12, color:"#94a3b8", marginBottom:24 }}>Finaliser votre inscription</div>

        {lienInvalide ? (
          <div style={{ color:"#dc2626", fontSize:14, fontWeight:600 }}>
            Ce lien de paiement est incomplet ou invalide. Contactez votre conseillère pour en obtenir un nouveau.
          </div>
        ) : (
          <>
            <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:10, padding:"16px 18px", marginBottom:20, textAlign:"left" }}>
              {nom && <div style={{ fontSize:13, color:"#0f172a", marginBottom:4 }}><strong>Nom :</strong> {nom}</div>}
              <div style={{ fontSize:13, color:"#0f172a", marginBottom:4 }}><strong>Offre :</strong> {offre}</div>
              <div style={{ fontSize:20, fontWeight:900, color:"#0c33ac", marginTop:8 }}>{montant.toLocaleString("fr-FR")} FCFA</div>
            </div>

            {erreur && <p style={{ color:"#dc2626", fontSize:13, marginBottom:14 }}>⚠ {erreur}</p>}

            <button onClick={handlePayer} disabled={loading}
              style={{ width:"100%", padding:"13px 0", background: loading ? "#94a3b8" : "linear-gradient(135deg,#ff2945,#0c33ac)", color:"#fff", border:"none", borderRadius:10, fontWeight:800, fontSize:15, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Ouverture du paiement…" : "💳 Payer maintenant"}
            </button>
            <p style={{ fontSize:11, color:"#94a3b8", marginTop:14, lineHeight:1.6 }}>
              Paiement sécurisé via TouchPoint (Mobile Money, carte bancaire).
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default RelancerPaiement;
