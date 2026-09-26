// src/components/WhatsAppButton.jsx
import React, { useState, useEffect } from "react";
import { ga4 } from "../../../utils/ga4";
import "./WhatsAppButton.css";

const API_URL = process.env.REACT_APP_API_URL || "";
const LS_KEY  = "bet_contact_config";

const DEFAULTS = {
  whatsapp_number:  "2250000000000",
  whatsapp_message: "Bonjour ! Je souhaite avoir des informations sur les cours d'anglais chez BET.",
};

export default function WhatsAppButton() {
  const [config, setConfig] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || DEFAULTS; }
    catch { return DEFAULTS; }
  });

  useEffect(() => {
    // Charger depuis l'API au montage
    fetch(`${API_URL}/api/config-contact`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) { setConfig(d); localStorage.setItem(LS_KEY, JSON.stringify(d)); } })
      .catch(() => {});

    // Écouter les mises à jour depuis SuperAdmin (même onglet)
    const handler = (e) => {
      if (e.key === LS_KEY && e.newValue) {
        try { setConfig(JSON.parse(e.newValue)); } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const number  = config.whatsapp_number  || DEFAULTS.whatsapp_number;
  const message = config.whatsapp_message || DEFAULTS.whatsapp_message;
  const url     = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <>
      <a
        href={url}
        className="whatsapp-button"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Contactez-nous sur WhatsApp"
        onClick={() => ga4.contactWhatsApp({ centre: config.centre || null })}
      >
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg"
          alt="WhatsApp"
          className="whatsapp-icon"
        />
      </a>
      <button
        onClick={scrollToTop}
        className="scroll-top-button"
        aria-label="Retour en haut"
      >
        ↑
      </button>
    </>
  );
}
