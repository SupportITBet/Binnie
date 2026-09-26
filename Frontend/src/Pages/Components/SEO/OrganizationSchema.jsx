import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";

const API_URL = process.env.REACT_APP_API_URL || "";
const SITE_URL = "https://binniesenglish.com";

// Données structurées globales (Organization) - présentes sur toutes les pages via App.js.
// Alimentées par la même config contact que le Footer, pour ne jamais désynchroniser
// coordonnées affichées et coordonnées déclarées à Google.
const OrganizationSchema = () => {
  const [contact, setContact] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/config-contact`)
      .then(r => r.ok ? r.json() : null)
      .then(setContact)
      .catch(() => {});
  }, []);

  const sameAs = contact
    ? [
        contact.social_facebook,
        contact.social_instagram,
        contact.social_linkedin,
        contact.social_tiktok,
        contact.social_twitter,
      ].filter(Boolean)
    : [];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EducationalOrganization",
    name: "Binnie's English Training",
    alternateName: "BET",
    url: SITE_URL,
    logo: `${SITE_URL}/assets/BIINIES-ENGLISH-LOGO.png`,
    image: `${SITE_URL}/assets/BIINIES-ENGLISH-LOGO.png`,
    description: "Cabinet agréé État - cours d'anglais et certifications TOEIC, TOEFL, IELTS pour particuliers et professionnels en Côte d'Ivoire.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Abidjan",
      addressCountry: "CI",
      streetAddress: contact?.localisation || undefined,
    },
    ...(contact?.email_central ? { email: contact.email_central } : {}),
    ...(contact?.whatsapp_number ? { telephone: `+${contact.whatsapp_number}` } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
};

export default OrganizationSchema;
