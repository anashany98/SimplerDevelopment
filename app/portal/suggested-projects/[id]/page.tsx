import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, suggestedProjects } from '@/lib/db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { pBtnPrimary, pBtnGhost, pSectionTitle } from '@/components/portal/portal-ui';

// ─── Category-specific content & design configs ──────────────────────────────

interface CategoryConfig {
  heroGradient: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  iconBg: string;
  tagline: string;
  subtagline: string;
  valueProps: { icon: string; title: string; body: string }[];
  process: { icon: string; label: string; desc: string }[];
  faqs: { q: string; a: string }[];
  statLabel: string;
  statValue: string;
  statIcon: string;
}

const configs: Record<string, CategoryConfig> = {
  website: {
    heroGradient: 'from-blue-600 via-blue-500 to-cyan-500',
    accentColor: 'text-blue-600 dark:text-blue-400',
    accentBg: 'bg-blue-50 dark:bg-blue-950/40',
    accentBorder: 'border-blue-200 dark:border-blue-800/50',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    tagline: 'Un sitio web que trabaja tan duro como tú',
    subtagline: 'La mayoría de los sitios web de negocios pierden al 70% de los visitantes en los primeros 10 segundos. Los nuestros no — porque cada elemento está diseñado para convertir visitantes en clientes.',
    valueProps: [
      { icon: 'trending_up', title: 'Posiciónate mejor en Google', body: 'Construido con datos estructurados, tiempos de carga rápidos y código limpio que los buscadores premian.' },
      { icon: 'devices', title: 'Impecable en cada dispositivo', body: 'Diseño mobile-first que se ve perfecto ya sea que te encuentren en un teléfono, tablet o escritorio.' },
      { icon: 'bolt', title: 'Velocidad que convierte', body: 'Los sitios que cargan en menos de 2 segundos ven conversiones 15% más altas. Optimizamos cada recurso.' },
    ],
    process: [
      { icon: 'forum', label: 'Descubrimiento', desc: 'Conocemos tus objetivos, tu audiencia y el panorama competitivo antes de diseñar un solo píxel.' },
      { icon: 'draw', label: 'Diseño y desarrollo', desc: 'Revisas y apruebas el diseño antes de que comience el desarrollo. Sin sorpresas.' },
      { icon: 'rocket_launch', label: 'Lanzamiento y crecimiento', desc: 'Lanza con capacitación completa, configuración SEO y un período de soporte de 30 días.' },
    ],
    faqs: [
      { q: '¿Cuánto tarda normalmente un proyecto de sitio web?', a: 'La mayoría de los proyectos de sitios web se completan en 3–6 semanas, según el alcance y la rapidez de las rondas de retroalimentación.' },
      { q: '¿Podré actualizar el contenido yo mismo?', a: 'Sí — construimos sobre plataformas que puedes gestionar y ofrecemos capacitación para que nunca dependas de nosotros para actualizaciones básicas.' },
      { q: '¿Gestionan el alojamiento y la configuración del dominio?', a: 'Podemos gestionar todo — alojamiento, dominio, SSL, DNS — o trabajar con tu configuración actual. Tú eliges.' },
    ],
    statLabel: 'Aumento promedio de prospectos después del lanzamiento',
    statValue: '3×',
    statIcon: 'show_chart',
  },
  ecommerce: {
    heroGradient: 'from-emerald-600 via-emerald-500 to-teal-400',
    accentColor: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-50 dark:bg-emerald-950/40',
    accentBorder: 'border-emerald-200 dark:border-emerald-800/50',
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    tagline: 'Tu tienda, abierta 24/7 y hecha para vender',
    subtagline: 'Una experiencia de comercio electrónico completa — diseñada para reducir el abandono del carrito, generar confianza al pagar y convertir visitantes en compradores desde el primer día.',
    valueProps: [
      { icon: 'payments', title: 'Pago sin fricción', body: 'Flujos de pago simplificados con Stripe, Apple Pay y más. Menos pasos significa más compras completadas.' },
      { icon: 'inventory_2', title: 'Gestión fácil de productos', body: 'Agrega productos, gestiona el inventario y cumple pedidos sin necesitar conocimientos técnicos.' },
      { icon: 'insights', title: 'Analíticas integradas', body: 'Sabrás exactamente qué productos generan ingresos, dónde abandonan los clientes y cómo mejorar.' },
    ],
    process: [
      { icon: 'category', label: 'Configuración del catálogo', desc: 'Productos, categorías, variantes y precios configurados e importados.' },
      { icon: 'palette', label: 'Marca y diseño', desc: 'Tu identidad de marca aplicada a cada página — desde la portada hasta el correo de confirmación.' },
      { icon: 'local_shipping', label: 'Publicar', desc: 'Zonas de envío, reglas de impuestos y pasarelas de pago probados y listos para procesar pedidos.' },
    ],
    faqs: [
      { q: '¿Qué procesadores de pago soportan?', a: 'Stripe, PayPal, Apple Pay, Google Pay y la mayoría de los procesadores principales. Los configuramos y probamos todos antes del lanzamiento.' },
      { q: '¿Puedo gestionar la tienda yo mismo después del lanzamiento?', a: 'Por supuesto. Construimos en plataformas diseñadas para propietarios no técnicos y ofrecemos una guía completa antes de la entrega.' },
      { q: '¿Qué hay de los envíos y los impuestos?', a: 'Configuramos zonas de envío, tarifas de transportistas y cálculo automático de impuestos según tus ubicaciones y productos.' },
    ],
    statLabel: 'Ingresos promedio recuperados mediante la optimización del carrito',
    statValue: '18%',
    statIcon: 'shopping_cart',
  },
  mobile: {
    heroGradient: 'from-violet-600 via-purple-500 to-fuchsia-500',
    accentColor: 'text-violet-600 dark:text-violet-400',
    accentBg: 'bg-violet-50 dark:bg-violet-950/40',
    accentBorder: 'border-violet-200 dark:border-violet-800/50',
    iconBg: 'bg-violet-100 dark:bg-violet-900/40',
    tagline: 'Pon tu negocio en cada bolsillo',
    subtagline: 'Las apps móviles tienen 3× más interacción que los sitios web. Ofrece a tus clientes una experiencia que usarán a diario — en iOS y Android, con sensación nativa en ambos.',
    valueProps: [
      { icon: 'notifications_active', title: 'Reactiva la interacción al instante', body: 'Las notificaciones push traen clientes de vuelta en el momento preciso — promociones, recordatorios o novedades.' },
      { icon: 'offline_bolt', title: 'Funciona sin Wi-Fi', body: 'Las funciones principales siguen disponibles sin conexión. Nada de usuarios frustrados cuando se pierde la señal.' },
      { icon: 'star_rate', title: 'Presencia en la App Store', body: 'Gestionamos el envío tanto a la App Store de Apple como a Google Play, incluyendo el cumplimiento de la revisión.' },
    ],
    process: [
      { icon: 'lightbulb', label: 'Estrategia y UX', desc: 'Planificamos cada flujo de usuario y pantalla antes de escribir una línea de código.' },
      { icon: 'phone_iphone', label: 'Diseño y desarrollo', desc: 'Interfaz con sensación nativa construida con React Native, revisada en dispositivos reales durante todo el proceso.' },
      { icon: 'publish', label: 'Envío y soporte', desc: 'Gestionamos los envíos a la App Store y a Google Play — además de un período de soporte después del lanzamiento.' },
    ],
    faqs: [
      { q: '¿Funciona tanto en iPhone como en Android?', a: 'Sí. Construimos con React Native, que ofrece rendimiento nativo en ambas plataformas desde una sola base de código.' },
      { q: '¿Cómo funcionan los envíos a las tiendas de aplicaciones?', a: 'Gestionamos todo el proceso — cuentas de desarrollador, cumplimiento de las guías de revisión, capturas y notas de la versión.' },
      { q: '¿Puede la app conectarse a mi sitio web o backend existente?', a: 'Por supuesto. Nos integramos con tus APIs, bases de datos o servicios de terceros existentes durante el desarrollo.' },
    ],
    statLabel: 'Mayor interacción frente a la web móvil',
    statValue: '3×',
    statIcon: 'phone_iphone',
  },
  maintenance: {
    heroGradient: 'from-amber-500 via-orange-500 to-red-400',
    accentColor: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-50 dark:bg-amber-950/40',
    accentBorder: 'border-amber-200 dark:border-amber-800/50',
    iconBg: 'bg-amber-100 dark:bg-amber-900/40',
    tagline: 'Tu sitio web, siempre en línea. Sin preocupaciones.',
    subtagline: 'Un sitio web hackeado o descompuesto cuesta en promedio 200 €/hora en negocios perdidos. Nuestro plan de mantenimiento detecta los problemas antes de que ocurran — para que nunca te enteres de la peor manera.',
    valueProps: [
      { icon: 'security', title: 'Seguridad antes de que sea un problema', body: 'Las actualizaciones de plugins, parches de vulnerabilidad y escaneos de malware se ejecutan en un horario estricto — no después de un incidente.' },
      { icon: 'backup', title: 'Copias diarias, restauración instantánea', body: 'Copias de seguridad completas cada 24 horas. Si algo sale mal, restauramos en minutos, no en días.' },
      { icon: 'monitor_heart', title: 'Monitoreo de disponibilidad 24/7', body: 'Nos alertan en el segundo en que tu sitio cae — a menudo resolvemos los problemas antes de que tú o tus clientes lo noten.' },
    ],
    process: [
      { icon: 'link', label: 'Date de alta en minutos', desc: 'Nos conectamos a tu alojamiento, configuramos herramientas de monitoreo y establecemos la línea base del estado actual de tu sitio.' },
      { icon: 'autorenew', label: 'Mantenimiento continuo', desc: 'Actualizaciones automáticas y manuales, escaneos de seguridad y verificaciones de rendimiento se ejecutan de forma continua.' },
      { icon: 'summarize', label: 'Informes mensuales', desc: 'Un resumen en lenguaje sencillo de todo lo realizado, cualquier problema detectado y la calificación de salud de tu sitio.' },
    ],
    faqs: [
      { q: '¿Qué pasa si hackean mi sitio?', a: 'La eliminación de malware y la restauración completa están incluidas sin costo adicional. Nos encargamos de todo — solo recibes una notificación cuando termine.' },
      { q: '¿Necesito hacer algo después de registrarme?', a: 'Nada. Nos encargamos de todo en segundo plano. Recibirás noticias nuestras cada mes, y solo con urgencia si algo requiere tu opinión.' },
      { q: '¿Esto funciona con cualquier proveedor de alojamiento?', a: 'Sí — trabajamos con todos los principales alojamientos, incluidos GoDaddy, Bluehost, WP Engine, Cloudflare y configuraciones personalizadas.' },
    ],
    statLabel: 'Sitios protegidos sin un solo incidente este año',
    statValue: '100%',
    statIcon: 'verified_user',
  },
  branding: {
    heroGradient: 'from-rose-500 via-pink-500 to-fuchsia-400',
    accentColor: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-50 dark:bg-rose-950/40',
    accentBorder: 'border-rose-200 dark:border-rose-800/50',
    iconBg: 'bg-rose-100 dark:bg-rose-900/40',
    tagline: 'Una marca que se queda en la memoria',
    subtagline: 'Se necesitan 7 segundos para formar una primera impresión. Un branding profesional asegura que la tuya diga exactamente lo que quieres — antes de decir una sola palabra.',
    valueProps: [
      { icon: 'visibility', title: 'Destaca al instante', body: 'Un logotipo distintivo y una identidad visual que te diferencian en un mercado competitivo y se quedan en la memoria.' },
      { icon: 'verified', title: 'Genera credibilidad al instante', body: 'Una marca consistente y pulida transmite profesionalismo y construye la confianza que los clientes nuevos necesitan para comprar.' },
      { icon: 'style', title: 'Coherente en todas partes', body: 'Guías de marca que cubren todos los puntos de contacto — redes, impresión, web — para que siempre luzcas coherente y deliberado.' },
    ],
    process: [
      { icon: 'search', label: 'Descubrimiento', desc: 'Investigamos tu industria, tus competidores y tu audiencia ideal para fundamentar cada decisión de diseño en la estrategia.' },
      { icon: 'brush', label: 'Diseño y refinamiento', desc: 'Se presentan varios conceptos, refinados mediante rondas de retroalimentación colaborativa hasta que queda exactamente bien.' },
      { icon: 'folder_zip', label: 'Entrega del kit de marca', desc: 'Todos los archivos que necesitarás — logotipos en todos los formatos, códigos de color, especificaciones tipográficas y guías de uso.' },
    ],
    faqs: [
      { q: '¿Qué incluye el kit de marca?', a: 'Conjunto completo de logotipos (principal, secundario, solo icono), paleta de colores, sistema tipográfico, guía de marca en PDF y todos los archivos fuente.' },
      { q: '¿Cuántos conceptos de logotipo veré?', a: 'Presentamos 3 direcciones distintas al inicio. Una vez que eliges una, la refinamos con hasta 3 rondas de revisión.' },
      { q: '¿Pueden adaptar la marca a un sitio web o producto existente?', a: 'Por supuesto — auditamos tus materiales actuales y creamos una identidad de marca que evoluciona en lugar de reemplazar lo que ya tienes.' },
    ],
    statLabel: 'Aumento del valor percibido tras el rediseño de marca',
    statValue: '2.5×',
    statIcon: 'trending_up',
  },
  development: {
    heroGradient: 'from-slate-700 via-slate-600 to-indigo-600',
    accentColor: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-50 dark:bg-indigo-950/40',
    accentBorder: 'border-indigo-200 dark:border-indigo-800/50',
    iconBg: 'bg-indigo-100 dark:bg-indigo-900/40',
    tagline: 'Software personalizado para tu flujo de trabajo exacto',
    subtagline: 'Las herramientas comerciales te cuestan tiempo en parches y dinero en funciones sin usar. Una solución personalizada hace exactamente lo que necesitas — ni más, ni menos.',
    valueProps: [
      { icon: 'extension', title: 'A la medida perfecta', body: 'Cada función corresponde a un paso real del flujo de trabajo de tu negocio. Sin relleno, sin compromisos, sin parches.' },
      { icon: 'lock', title: 'Seguro y bien probado', body: 'Cobertura de pruebas completa, revisión de seguridad y código con estándares que puedes entregar a cualquier desarrollador.' },
      { icon: 'open_in_new', title: 'Escala con tu crecimiento', body: 'Arquitectura diseñada para crecer — construida para soportar 10× la carga sin reescribir nada.' },
    ],
    process: [
      { icon: 'description', label: 'Especificación y alcance', desc: 'Requisitos documentados en detalle antes de escribir una línea de código. Sin sorpresas de alcance.' },
      { icon: 'code', label: 'Desarrollo y revisión', desc: 'Desarrollo ágil con demos periódicas para que veas el progreso y des retroalimentación durante todo el proceso.' },
      { icon: 'deployed_code', label: 'Despliegue y entrega', desc: 'Despliegue en producción con documentación completa, propiedad del código y una sesión de capacitación.' },
    ],
    faqs: [
      { q: '¿Seré dueño del código?', a: 'Sí, por completo. Recibes la propiedad total de todo el código fuente, la documentación y los scripts de despliegue.' },
      { q: '¿Qué stack tecnológico usan?', a: 'Construimos principalmente con Next.js, React, TypeScript y PostgreSQL — herramientas probadas y confiables con un amplio ecosistema de soporte.' },
      { q: '¿Qué pasa si algo falla después del lanzamiento?', a: 'Todos los proyectos incluyen un período de soporte después del lanzamiento. También ofrecemos planes de mantenimiento continuo para tu tranquilidad a largo plazo.' },
    ],
    statLabel: 'Promedio de horas manuales ahorradas por semana mediante automatización',
    statValue: '12h',
    statIcon: 'timer',
  },
  other: {
    heroGradient: 'from-primary via-primary/80 to-primary/60',
    accentColor: 'text-primary',
    accentBg: 'bg-primary/5',
    accentBorder: 'border-primary/20',
    iconBg: 'bg-primary/10',
    tagline: 'Construyamos algo grande juntos',
    subtagline: 'Todo gran negocio tiene necesidades únicas. Esta es una solución a medida diseñada específicamente en torno a tus objetivos — ni una plantilla, ni un parche.',
    valueProps: [
      { icon: 'handshake', title: 'Construido alrededor de ti', body: 'Adaptamos nuestro proceso, tecnología y enfoque a tu situación específica — no al revés.' },
      { icon: 'support_agent', title: 'Acceso directo', body: 'Trabaja directamente con las personas que construyen tu proyecto. Sin gestores de cuenta, sin retransmisión de información.' },
      { icon: 'verified_user', title: 'Satisfacción garantizada', body: 'No consideramos un proyecto terminado hasta que estés genuinamente satisfecho con el resultado.' },
    ],
    process: [
      { icon: 'forum', label: 'Descubrimiento', desc: 'Una conversación enfocada para entender tus objetivos, restricciones y definición de éxito.' },
      { icon: 'build', label: 'Execute', desc: 'Construye e itera con actualizaciones de progreso transparentes durante todo el proceso.' },
      { icon: 'check_circle', label: 'Entrega y soporte', desc: 'Lanzamos con documentación y un período de soporte para que nunca te quedes colgado.' },
    ],
    faqs: [
      { q: '¿Cómo empezamos?', a: 'Abre un ticket abajo — programaremos una llamada de descubrimiento para entender tus necesidades y preparar una propuesta detallada.' },
      { q: '¿Cómo se presupuestan los proyectos?', a: 'Ofrecemos cotizaciones de precio fijo para alcances bien definidos, y por tiempo y materiales para proyectos exploratorios o en evolución.' },
      { q: '¿Qué pasa si no estoy seguro de lo que necesito?', a: 'Para eso es exactamente la llamada de descubrimiento. Ven con un problema que resolver — te ayudamos a encontrar la solución adecuada.' },
    ],
    statLabel: 'Tasa de satisfacción del cliente',
    statValue: '100%',
    statIcon: 'star',
  },
};

function formatCents(cents: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100);
}

const categoryLabel: Record<string, string> = {
  website: 'Sitio web',
  ecommerce: 'Comercio electrónico',
  mobile: 'App móvil',
  maintenance: 'Mantenimiento',
  branding: 'Branding',
  development: 'Desarrollo',
  other: 'Otro',
};

export default async function SuggestedProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) notFound();

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const [item] = await db
    .select()
    .from(suggestedProjects)
    .where(
      and(
        eq(suggestedProjects.id, projectId),
        eq(suggestedProjects.active, true),
        or(
          isNull(suggestedProjects.clientId),
          eq(suggestedProjects.clientId, client.id),
        ),
      ),
    )
    .limit(1);

  if (!item) notFound();

  const cfg = configs[item.category] ?? configs.other;
  const features = (item.features ?? []) as string[];
  const hasSurvey = ((item.surveyFields ?? []) as unknown[]).length > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/suggested-projects" className="hover:text-foreground transition-colors flex items-center gap-1">
          <span className="material-icons text-sm">arrow_back</span>
          Suggested Projects
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span className="text-foreground truncate">{item.title}</span>
      </div>

      {/* ── Hero ── */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${cfg.heroGradient} text-white`}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-16 -left-8 w-64 h-64 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <span className="material-icons text-3xl text-white">{item.icon}</span>
            </div>
            <span className="text-sm font-medium bg-white/20 px-3 py-1 rounded-full">
              {categoryLabel[item.category] ?? item.category}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">{item.title}</h1>
          <p className="text-white/80 text-lg leading-relaxed max-w-xl">
            {item.description || cfg.tagline}
          </p>

          {/* Price + Timeline + CTA */}
          <div className="mt-8 flex items-end gap-8 flex-wrap">
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Costo estimado</p>
              <p className="text-4xl font-bold">
                {item.estimatedPrice ? formatCents(item.estimatedPrice) : 'Cotización a solicitud'}
              </p>
              <p className="text-white/60 text-xs mt-1">Facturación por hora — el costo final depende del alcance</p>
            </div>
            {item.estimatedTimeline && (
              <div>
                <p className="text-white/60 text-xs uppercase tracking-widest mb-1">Cronología</p>
                <p className="text-2xl font-semibold flex items-center gap-2">
                  <span className="material-icons text-xl text-white/80">schedule</span>
                  {item.estimatedTimeline}
                </p>
              </div>
            )}
            <div className="ml-auto self-end">
              <Link
                href={`/portal/suggested-projects/${item.id}/request`}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-foreground rounded-xl font-bold text-sm hover:bg-white/90 transition-colors shadow-lg"
              >
                <span className="material-icons text-base">{hasSurvey ? 'assignment' : 'chat'}</span>
                {hasSurvey ? 'Comenzar' : 'Solicitar este proyecto'}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Why this matters ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Por qué importa esto</p>
        <p className={`text-lg text-foreground leading-relaxed border-l-4 ${cfg.accentBorder} pl-4`}>
          {cfg.subtagline}
        </p>
      </div>

      {/* ── Value props ── */}
      <div className="grid sm:grid-cols-3 gap-4">
        {cfg.valueProps.map((vp, i) => (
          <div key={i} className={`rounded-xl border ${cfg.accentBorder} ${cfg.accentBg} p-5`}>
            <div className={`w-10 h-10 rounded-lg ${cfg.iconBg} flex items-center justify-center mb-3`}>
              <span className={`material-icons text-xl ${cfg.accentColor}`}>{vp.icon}</span>
            </div>
            <h3 className="font-semibold text-foreground text-sm mb-1">{vp.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{vp.body}</p>
          </div>
        ))}
      </div>

      {/* ── What's included ── */}
      {features.length > 0 && (
        <div className="bg-background border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <span className={`material-icons text-lg ${cfg.accentColor}`}>checklist</span>
            <h2 className={pSectionTitle}>Qué incluye</h2>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              {features.length} deliverable{features.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-border">
            {features.map((f, i) => (
              <div key={i} className="px-6 py-3.5 flex items-center gap-3">
                <span className="material-icons text-green-600 dark:text-green-400 text-lg flex-shrink-0">check_circle</span>
                <span className="text-foreground text-sm">{f}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Stat callout ── */}
      <div className={`rounded-2xl bg-gradient-to-br ${cfg.heroGradient} p-6 flex items-center gap-5`}>
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <span className="material-icons text-3xl text-white">{cfg.statIcon}</span>
        </div>
        <div>
          <p className="text-4xl font-bold text-white">{cfg.statValue}</p>
          <p className="text-white/80 text-sm mt-0.5">{cfg.statLabel}</p>
        </div>
      </div>

      {/* ── How it works ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-6">Cómo funciona</p>
        <div className="relative">
          {/* Connecting line */}
          <div className="hidden sm:block absolute top-7 left-7 right-7 h-0.5 bg-border z-0" />
          <div className="grid sm:grid-cols-3 gap-6 relative z-10">
            {cfg.process.map((step, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-3">
                <div className={`w-14 h-14 rounded-full ${cfg.iconBg} border-4 border-background flex items-center justify-center`}>
                  <span className={`material-icons text-xl ${cfg.accentColor}`}>{step.icon}</span>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <span className="text-xs font-bold text-muted-foreground">0{i + 1}</span>
                    <h3 className="font-semibold text-foreground text-sm">{step.label}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">Preguntas frecuentes</p>
        <div className="space-y-3">
          {cfg.faqs.map((faq, i) => (
            <div key={i} className="bg-background border border-border rounded-xl p-5">
              <p className="font-semibold text-foreground text-sm mb-1.5 flex items-start gap-2">
                <span className={`material-icons text-base flex-shrink-0 mt-0.5 ${cfg.accentColor}`}>help_outline</span>
                {faq.q}
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed pl-6">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="bg-background border border-border rounded-2xl overflow-hidden">
        <div className={`h-1.5 bg-gradient-to-r ${cfg.heroGradient}`} />
        <div className="p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 className={pSectionTitle}>¿Listo para avanzar?</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {hasSurvey
                ? 'Completa un formulario rápido de admisión y prepararemos una propuesta detallada.'
                : 'Envíanos un mensaje y programaremos una llamada de descubrimiento gratuita — sin compromiso, solo una conversación.'}
            </p>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                Free consultation
              </span>
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                Detailed proposal included
              </span>
              <span className="flex items-center gap-1">
                <span className="material-icons text-sm text-green-600 dark:text-green-400">check</span>
                No pressure
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <Link
              href={`/portal/suggested-projects/${item.id}/request`}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">{hasSurvey ? 'assignment' : 'chat'}</span>
              {hasSurvey ? 'Iniciar formulario de admisión' : 'Iniciar una conversación'}
            </Link>
            <Link
              href="/portal/suggested-projects"
              className={pBtnGhost}
            >
              <span className="material-icons text-sm">arrow_back</span>Explorar otras sugerencias</Link>
          </div>
        </div>
      </div>

    </div>
  );
}
