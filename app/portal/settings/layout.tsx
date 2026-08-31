'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/portal/settings/profile', label: 'Perfil', icon: 'person' },
  { href: '/portal/settings/security', label: 'Seguridad', icon: 'security' },
  { href: '/portal/settings/notifications', label: 'Notificaciones', icon: 'notifications' },
  { href: '/portal/settings/billing', label: 'Facturación', icon: 'payments' },
  { href: '/portal/settings/team', label: 'Equipo', icon: 'group' },
  { href: '/portal/settings/ai', label: 'Asistente de IA', icon: 'smart_toy' },
  { href: '/portal/settings/api-keys', label: 'Claves API', icon: 'vpn_key' },
  { href: '/portal/settings/webhooks', label: 'Webhooks', icon: 'webhook' },
  { href: '/portal/settings/integrations', label: 'Integraciones', icon: 'integration_instructions' },
  { href: '/portal/settings/channels', label: 'Canales', icon: 'hub' },
  { href: '/portal/settings/support', label: 'Soporte', icon: 'support_agent' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        {/* This is the page-level h1 for every /portal/settings/** route
            (bypasses <PortalPageHeader/>) — child route content must start
            its own headings at h2, not h3, or the outline skips a level. */}
        <h1 className="text-2xl font-bold text-foreground">Ajustes</h1>
        <p className="text-muted-foreground text-sm mt-1">Gestiona tu cuenta, facturación, equipo y soporte.</p>
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 scrollbar-thin">
        <div className="flex items-center gap-1 border-b border-border whitespace-nowrap">
          {tabs.map(tab => {
            const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/');
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <span className="material-icons text-base">{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
