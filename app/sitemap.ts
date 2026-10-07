import { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';
import { ALL_SLUGS } from '@/app/docs/_lib/nav';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  // The marketing site was removed; the only crawlable public content left is
  // the developer docs (client sites are tenant-owned and excluded).
  const docPages: MetadataRoute.Sitemap = ALL_SLUGS.map((slug) => ({
    url: slug === '' ? `${baseUrl}/docs` : `${baseUrl}/docs/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }));

  return docPages;
}