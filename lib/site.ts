const LOCAL_FALLBACK = 'http://localhost:3000';

/**
 * Canonical origin used by metadata, robots and sitemap. Vercel's system URLs
 * keep previews self-referential; set NEXT_PUBLIC_SITE_URL for a custom domain.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return new URL(explicit);

  const vercelHost =
    process.env.VERCEL_ENV === 'production'
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL
      : process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) {
    return new URL(vercelHost.startsWith('http') ? vercelHost : `https://${vercelHost}`);
  }

  return new URL(LOCAL_FALLBACK);
}
