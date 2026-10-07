import { db } from '@/lib/db';
import { clientWebsites, posts, postTypes } from '@/lib/db/schema';
import { and, eq, count, sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { resolvePortalSite } from '@/lib/portal-client';
import ApiKeysManager from '@/components/portal/ApiKeysManager';
import UploadHtmlPageButton from '@/components/portal/UploadHtmlPageButton';
import CreateSnapshotButton from '@/components/portal/CreateSnapshotButton';
import RequestActivationButton from './_components/RequestActivationButton';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pCard } from '@/components/portal/portal-ui';

export default async function PortalCmsDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { siteId } = await params;
  const { created } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site } = resolved;

  const [sitePosts, contentTypes] = await Promise.all([
    db.select().from(posts).where(eq(posts.websiteId, site.id)).orderBy(posts.updatedAt),
    db.select().from(postTypes).where(eq(postTypes.active, true)),
  ]);

  const published = sitePosts.filter(p => p.published);
  const drafts = sitePosts.filter(p => !p.published);
  const recentPosts = sitePosts.slice(-5).reverse();

  // Count posts by type
  const typeCounts: Record<string, number> = {};
  for (const p of sitePosts) {
    typeCounts[p.postType] = (typeCounts[p.postType] || 0) + 1;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Page header — the shared layout (WebsiteSubNav) owns the site name +
          domain + +Entry button; this page is the dashboard, so its title
          reflects that. */}
      <PortalPageHeader
        eyebrow="Sitio web"
        title="Panel"
        subtitle="Resumen de tu contenido, tipos y entradas."
        actions={
          <>
            <CreateSnapshotButton siteId={site.id} siteName={site.name} />
            <UploadHtmlPageButton siteId={site.id} />
          </>
        }
      />

      {created === '1' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          <span className="material-icons text-green-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">¡Sitio web creado con éxito!</p>
            <p className="text-xs mt-0.5">Crea tu primera página para empezar a construir tu web.</p>
          </div>
        </div>
      )}

      {site.deploymentStatus === 'pending' && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-900 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-300">
          <span className="material-icons text-yellow-600 mt-0.5">pending</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Hosting aún no activado</p>
            <p className="text-xs mt-0.5 text-yellow-700 dark:text-yellow-400">
              Tu web se ha creado, pero la infraestructura de alojamiento aún no está aprovisionada.
              Solicita la activación para publicarla.
            </p>
          </div>
          <RequestActivationButton siteId={site.id} />
        </div>
      )}

      {site.deploymentStatus === 'provisioning' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
          <span className="material-icons text-blue-600 animate-spin" style={{ animationDuration: '2s' }}>autorenew</span>
          <div>
            <p className="font-medium text-sm">Activación de hosting en curso</p>
            <p className="text-xs mt-0.5 text-blue-700 dark:text-blue-400">Esto suele tardar unos minutos. Actualiza para ver el estado más reciente.</p>
          </div>
        </div>
      )}

      {site.deploymentStatus === 'failed' && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-900 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
          <span className="material-icons text-red-600">error</span>
          <div>
            <p className="font-medium text-sm">Error al activar el hosting</p>
            <p className="text-xs mt-0.5 text-red-700 dark:text-red-400">
              There was a problem provisioning your site. Please contact support.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Total de entradas</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{sitePosts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Publicado</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-green-600">{published.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Borradores</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-yellow-600">{drafts.length}</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-1">Tipos de contenido</p>
          <p className="text-2xl font-display font-extrabold tracking-[-0.02em] text-foreground">{Object.keys(typeCounts).length}</p>
        </div>
      </div>

      {/* Quick links — grouped so authors find related areas together. */}
      <div className="space-y-5">
        <DashboardLinkGroup
          title="Contenido"
          links={[
            { href: `/portal/websites/${site.id}/entries`, icon: 'article', label: 'Entradas', desc: 'Todas las publicaciones, páginas y entradas de tipos personalizados' },
            { href: `/portal/websites/${site.id}/content-types`, icon: 'description', label: 'Tipos de contenido', desc: 'Plantillas, campos y código por tipo' },
            { href: `/portal/websites/${site.id}/taxonomy`, icon: 'account_tree', label: 'Taxonomía', desc: 'Categorías, tags y taxonomías personalizadas' },
            { href: `/portal/websites/${site.id}/calendar`, icon: 'calendar_month', label: 'Calendario', desc: 'Vista de programación y publicación' },
            { href: '/portal/media', icon: 'perm_media', label: 'Medios', desc: 'Biblioteca de medios compartida' },
          ]}
        />
        <DashboardLinkGroup
          title="Diseño"
          links={[
            { href: `/portal/websites/${site.id}/branding`, icon: 'palette', label: 'Marca', desc: 'Logotipo, colores, fuentes y estilos de botones' },
            { href: `/portal/websites/${site.id}/navigation`, icon: 'menu', label: 'Navegación', desc: 'Menú de navegación y enlaces del pie de página' },
            { href: `/portal/websites/${site.id}/code`, icon: 'code', label: 'Código personalizado', desc: 'CSS y JS de todo el sitio' },
          ]}
        />
        <DashboardLinkGroup
          title="Interacción"
          links={[
            { href: `/portal/websites/${site.id}/automations`, icon: 'bolt', label: 'Automatizaciones', desc: 'Notificaciones y disparadores de flujos' },
            { href: `/portal/websites/${site.id}/email`, icon: 'mail', label: 'Correo', desc: 'Plantillas transaccionales y de marketing' },
            { href: `/portal/websites/${site.id}/store`, icon: 'shopping_cart', label: 'Tienda', desc: 'Productos, pedidos y pago' },
          ]}
        />
        <DashboardLinkGroup
          title="Sistema"
          links={[
            { href: `/portal/websites/${site.id}/settings`, icon: 'settings', label: 'Ajustes', desc: 'Dominios, despliegues y entornos' },
            { href: '#api-keys', icon: 'vpn_key', label: 'Desarrollador', desc: 'Claves API para acceso SDK / REST' },
          ]}
        />
      </div>

      {/* Recent entries */}
      <div className={`${pCard} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground text-sm">Entradas recientes</h2>
          <Link
            href={`/portal/websites/${site.id}/entries`}
            className="text-xs text-primary hover:underline"
          >Ver todo</Link>
        </div>
        {recentPosts.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-icons text-4xl text-muted-foreground/30">article</span>
            <p className="text-sm text-muted-foreground mt-2">Aún no hay entradas. Crea tu primera página para empezar.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentPosts.map(post => (
              <Link
                key={post.id}
                href={`/portal/websites/${site.id}/posts/${post.id}/edit`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-accent/50 transition-colors"
              >
                <span className="material-icons text-base text-muted-foreground">
                  {post.postType === 'blog' ? 'rss_feed' : 'description'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.postType} &middot; {new Date(post.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  post.published
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
                }`}>
                  {post.published ? 'Publicado' : 'Borrador'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* API Keys / Developer */}
      <div id="api-keys" className={`${pCard} overflow-hidden`}>
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground text-sm flex items-center gap-2">
            <span className="material-icons text-base">code</span>
            Claves API de desarrollo
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Crea claves API para acceder a los datos de tu web mediante el SDK o la API REST.
          </p>
        </div>
        <div className="p-5">
          <ApiKeysManager siteId={site.id} />
        </div>
      </div>

      {/* Content type breakdown */}
      {Object.keys(typeCounts).length > 0 && (
        <div className={`${pCard} overflow-hidden`}>
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-display font-extrabold tracking-[-0.01em] text-foreground text-sm">Por tipo de contenido</h2>
          </div>
          <div className="divide-y divide-border">
            {Object.entries(typeCounts).map(([type, cnt]) => {
              const ct = contentTypes.find(t => t.slug === type);
              return (
                <Link
                  key={type}
                  href={`/portal/websites/${site.id}/entries?type=${type}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-accent/50 transition-colors"
                >
                  <span className="material-icons text-base text-muted-foreground">{ct?.icon || 'description'}</span>
                  <span className="text-sm font-medium text-foreground flex-1">{ct?.name || type}</span>
                  <span className="text-sm text-muted-foreground">{cnt}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface DashboardLink {
  href: string;
  icon: string;
  label: string;
  desc: string;
}

function DashboardLinkGroup({ title, links }: { title: string; links: DashboardLink[] }) {
  return (
    <section>
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2 px-1">
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-start gap-3 p-4 bg-card border border-border rounded-2xl hover:border-primary/30 hover:bg-accent/40 transition-colors"
          >
            <span className="material-icons text-xl text-muted-foreground group-hover:text-primary transition-colors shrink-0">
              {link.icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                {link.label}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{link.desc}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
