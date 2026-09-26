// Reçu de versement - même moteur d'impression que les autres documents BET
// (genererPDF.js : fenêtre imprimable, bouton "Imprimer / Enregistrer en PDF").
import { genererPDF, fmtDatePDF } from './genererPDF';

const MODES_LIB = { virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces', mobile_money: 'Mobile Money' };

export function genererRecuVersement(paiement, entreprise, { montantContrat = 0, soldeRestant = null } = {}) {
  const montantFmt = `${(paiement.montant || 0).toLocaleString('fr-FR')} FCFA`;
  const modeLib = MODES_LIB[paiement.mode] || paiement.mode || '-';
  const refCourte = (paiement.id || '').split('-')[0]?.toUpperCase() || '-';
  const estSolde = montantContrat > 0 && soldeRestant !== null && soldeRestant <= 0;
  const soldeFmt = soldeRestant !== null ? `${Math.max(0, soldeRestant).toLocaleString('fr-FR')} FCFA` : null;

  const html = `
    <div class="doc-header">
      <div>
        <div class="doc-header-logo">BET E-Learning</div>
        <div class="doc-header-sub">British English Training · Reçu de versement</div>
      </div>
      <div class="doc-header-right">
        N° REC-${refCourte}<br/>
        Émis le ${fmtDatePDF(new Date().toISOString())}
      </div>
    </div>
    <div class="doc-title-band">🧾 Reçu de versement</div>
    <div class="doc-body">
      <div class="section-title">Entreprise</div>
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${entreprise?.nom || '-'}</span></div>
        <div class="info-row"><span class="info-label">Secteur</span><span class="info-value">${entreprise?.secteur || '-'}</span></div>
        <div class="info-row"><span class="info-label">Ville</span><span class="info-value">${entreprise?.ville || '-'}</span></div>
      </div>

      <div class="section-title">Détail du versement</div>
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Date du versement</span><span class="info-value">${fmtDatePDF(paiement.date)}</span></div>
        <div class="info-row"><span class="info-label">Mode de paiement</span><span class="info-value">${modeLib}</span></div>
        <div class="info-row"><span class="info-label">Référence / N° bordereau</span><span class="info-value">${paiement.reference || '-'}</span></div>
        <div class="info-row"><span class="info-label">Note</span><span class="info-value">${paiement.note || '-'}</span></div>
      </div>

      ${estSolde ? '<div class="doc-stamp">✓ Soldé</div>' : ''}

      <div class="kpi-row" style="grid-template-columns:${soldeFmt ? '1fr 1fr' : '1fr'};">
        <div class="kpi-card" style="border-top-color:#059669;">
          <div class="kpi-val" style="color:#059669;">${montantFmt}</div>
          <div class="kpi-lbl">Montant versé</div>
        </div>
        ${soldeFmt ? `
        <div class="kpi-card" style="border-top-color:${estSolde ? '#059669' : '#DC2626'};">
          <div class="kpi-val" style="color:${estSolde ? '#059669' : '#DC2626'};">${estSolde ? '0 FCFA' : soldeFmt}</div>
          <div class="kpi-lbl">Solde restant dû</div>
        </div>` : ''}
      </div>

      <div class="section-title">Enregistré par</div>
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Nom</span><span class="info-value">${paiement.cree_par_nom || '-'}</span></div>
        <div class="info-row"><span class="info-label">Date d'enregistrement</span><span class="info-value">${paiement.created_at ? fmtDatePDF(paiement.created_at) : '-'}</span></div>
      </div>

      <div class="signatures">
        <div class="sig-block"><div class="sig-line"></div><div class="sig-name">${entreprise?.nom || '-'}</div><div class="sig-role">Client</div></div>
        <div class="sig-block"><div class="sig-line"></div><div class="sig-name">${paiement.cree_par_nom || '-'}</div><div class="sig-role">BET E-Learning</div></div>
      </div>

      <div class="doc-footer">
        <span>BET E-Learning · Reçu généré automatiquement · Confidentiel</span>
        <span>REC-${refCourte}</span>
      </div>
    </div>
  `;

  genererPDF(html, `Reçu de versement - ${entreprise?.nom || ''}`);
}
