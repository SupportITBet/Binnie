import { Helmet } from "react-helmet-async";

const SEO = ({ 
  title, 
  description, 
  canonicalUrl, 
  image, 
  type = "website", 
  publishedTime, 
  author = "Binnie's English Training",
  siteName = "Binnie's English Training",
  twitterCard = "summary_large_image",
  jsonLd = null,
  noindex = false,
}) => {
  const siteUrl = "https://binniesenglish.com";
  const fullUrl = canonicalUrl ? `${siteUrl}${canonicalUrl}` : siteUrl;
  // Pas de bannière OG dédiée (1200x630) pour l'instant - le logo sert de repli fonctionnel
  // pour les aperçus de lien (WhatsApp, Facebook, LinkedIn...), mais une vraie image de
  // partage améliorerait nettement le rendu des aperçus.
  const defaultImage = `${siteUrl}/assets/BIINIES-ENGLISH-LOGO.png`;

  return (
    <Helmet>
      {/* Balises de base */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={fullUrl} />
      <meta name="author" content={author} />
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={image || defaultImage} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image || defaultImage} />

      {/* Article (si applicable) */}
      {type === "article" && publishedTime && (
        <meta property="article:published_time" content={publishedTime} />
      )}

      {/* Données structurées (JSON-LD) - Organization, Course, BreadcrumbList, etc. */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;