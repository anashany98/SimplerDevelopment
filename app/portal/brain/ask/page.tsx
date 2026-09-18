'use client';

import { useState, useEffect } from 'react';
import McpApiKeysManager from '@/components/portal/McpApiKeysManager';
import OAuthTokensManager from '@/components/portal/OAuthTokensManager';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost, pBtnPrimary, pBtnSoft, pCard, pSectionTitle, pCardPad } from '@/components/portal/portal-ui';

type ClientId = 'claude-web' | 'claude-desktop' | 'claude-code' | 'chatgpt';

const TABS: { id: ClientId; label: string; icon: string }[] = [
  { id: 'claude-web',     label: 'Claude.ai (web)', icon: 'public' },
  { id: 'claude-desktop', label: 'Claude Desktop',  icon: 'desktop_windows' },
  { id: 'claude-code',    label: 'Claude Code',     icon: 'terminal' },
  { id: 'chatgpt',        label: 'ChatGPT',         icon: 'smart_toy' },
];

export default function ConnectAiPage() {
  const [tab, setTab] = useState<ClientId>('claude-web');
  const [origin, setOrigin] = useState('https://simplerdevelopment.com');

  // Detect the actual origin client-side to avoid hardcoding the domain.
  // Must be in useEffect (not render body) to prevent a hydration mismatch.
  useEffect(() => {
    if (window.location.origin !== origin) {
      setOrigin(window.location.origin);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endpoint = `${origin}/api/mcp`;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <PortalPageHeader
        eyebrow="Cerebro de empresa"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">cable</span>
            Conecta la IA a tu portal
          </span>
        }
        subtitle={
          <>
            Conecta Claude Desktop, Claude Code, ChatGPT o cualquier cliente compatible con MCP a tu portal
            mediante <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer" className="text-primary hover:underline">Model Context Protocol</a>.
            La IA puede leer y escribir en CRM, contenido, pitch decks, correo, proyectos y mucho más —
            limitada a los permisos que concedas a la clave API.
          </>
        }
      />

      <section className="space-y-3">
        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Endpoint MCP</h2>
        <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
          <code className="text-xs flex-1 break-all">{endpoint}</code>
          <button
            onClick={() => navigator.clipboard.writeText(endpoint)}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50 shrink-0 text-xs"
          >Copiar</button>
        </div>
        <p className="text-xs text-muted-foreground">
          Transporte HTTP streamable en modo sin estado. Claude.ai web usa OAuth (no hace falta clave API).
          Los demás clientes envían <code className="text-[11px] px-1 py-0.5 bg-muted rounded">Authorization: Bearer sd_mcp_…</code>.
        </p>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Instrucciones de configuración</h2>
          <p className="text-sm text-muted-foreground">Elige tu cliente y sigue los pasos. Necesitarás una clave API de la sección de abajo.</p>
        </div>

        <div className="flex gap-1 border-b border-border overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'claude-web' && <ClaudeWebInstructions endpoint={endpoint} />}
        {tab === 'claude-desktop' && <ClaudeDesktopInstructions endpoint={endpoint} />}
        {tab === 'claude-code' && <ClaudeCodeInstructions endpoint={endpoint} />}
        {tab === 'chatgpt' && <ChatGptInstructions endpoint={endpoint} />}
      </section>

      <section>
        <OAuthTokensManager />
      </section>

      <section>
        <McpApiKeysManager
          heading="Gestiona las claves API"
          subheading="Solo es necesario para Claude Desktop, Claude Code, ChatGPT u otros clientes que no sean web. El flujo web de Claude.ai de arriba usa OAuth en su lugar. Guarda bien los valores secretos — solo se muestran una vez. Revoca cualquier clave aquí para cortar el acceso de inmediato."
        />
      </section>
    </div>
  );
}

function ClaudeWebInstructions({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs flex items-start gap-2">
        <span className="material-icons text-primary text-base mt-0.5">verified</span>
        <span>
          <strong>La vía más fácil.</strong> Sin clave API, sin archivo de configuración, sin terminal — solo tienes que hacer clic en Añadir y aprobar.
        </span>
      </div>
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          Abre{' '}
          <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer" className="text-primary hover:underline">
            claude.ai → Ajustes → Conectores
          </a>{' '}
          y haz clic en <span className="font-medium">Explorar conectores</span>, luego en{' '}
          <span className="font-medium">Añadir conector personalizado</span> en la parte inferior de la lista.
        </li>
        <li>
          Rellena el formulario:
          <ul className="list-disc ml-5 mt-1 text-muted-foreground space-y-0.5">
            <li>Nombre: <code className="text-xs px-1 py-0.5 bg-muted rounded">CRM AGENTS</code></li>
            <li>URL del servidor MCP remoto: <code className="text-xs px-1 py-0.5 bg-muted rounded break-all">{endpoint}</code></li>
            <li>Deja el Client ID / Secret de OAuth <strong>en blanco</strong> — Claude se registra automáticamente.</li>
          </ul>
        </li>
        <li>
          Haz clic en <span className="font-medium">Añadir</span>. Claude te redirigirá al inicio de sesión de tu portal (si no
          has iniciado sesión aquí ya), y luego a una pantalla de consentimiento que muestra el nombre de la aplicación y los permisos que solicita.
        </li>
        <li>
          Elige a qué portal conceder acceso (si tienes acceso a más de uno), desmarca los permisos que quieras
          denegar y haz clic en <span className="font-medium">Aprobar</span>. Listo — Claude.ai ya tiene acceso.
        </li>
        <li>
          Pruébalo: en cualquier chat nuevo, pregunta <em>&quot;Muéstrame mi pipeline de CRM&quot;</em> o <em>&quot;¿Qué tickets de soporte
          están abiertos?&quot;</em> Claude usará el conector CRM AGENTS para responder.
        </li>
      </ol>
      <div className="rounded-xl border border-border p-3 text-xs space-y-1.5">
        <p className="font-medium">Revocar el acceso</p>
        <p className="text-muted-foreground">
          Dos formas de revocar en cualquier momento:
        </p>
        <ul className="list-disc ml-5 text-muted-foreground space-y-0.5">
          <li>Claude.ai → Ajustes → Conectores → CRM AGENTS → Desconectar.</li>
          <li>Usa la tabla de <span className="font-medium">tokens emitidos por OAuth</span> de abajo y haz clic en
              <span className="font-medium"> Revocar</span> en la fila de CRM AGENTS. Corta el acceso de inmediato.</li>
        </ul>
        <p className="text-muted-foreground">
          Los tokens tienen una vida máxima de 1 año y están limitados al portal que aprobaste — no pueden ver otros
          portales a los que tengas acceso.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Por dentro: OAuth 2.1 con PKCE. Cada sesión de Claude recibe su propio token de acceso limitado al portal
        y a los permisos que aprobaste. Los tokens se guardan con hash — solo Claude tiene el valor original.
      </p>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="relative">
      <pre className="rounded-xl border border-border bg-muted/30 p-3 text-xs overflow-x-auto">
        <code>{children}</code>
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center justify-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[12px] font-semibold text-muted-foreground hover:border-foreground/25"
      >
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

function ClaudeDesktopInstructions({ endpoint }: { endpoint: string }) {
  const config = `{
  "mcpServers": {
    "crm-agents": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "${endpoint}",
        "--header",
        "Authorization: Bearer sd_mcp_your_key_here"
      ]
    }
  }
}`;
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generar una clave de API</span> en la sección de abajo — ponle un nombre como{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">Claude Desktop</code>.
        </li>
        <li>
          <span className="font-medium">Abre el archivo de configuración de Claude Desktop</span>:
          <ul className="list-disc ml-5 mt-1 text-muted-foreground space-y-0.5">
            <li>macOS: <code className="text-xs px-1 py-0.5 bg-muted rounded">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
            <li>Windows: <code className="text-xs px-1 py-0.5 bg-muted rounded">%APPDATA%\Claude\claude_desktop_config.json</code></li>
          </ul>
        </li>
        <li>
          <span className="font-medium">Agrega el servidor MCP de CRM AGENTS</span> (sustituye{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">sd_mcp_your_key_here</code> por la clave que generaste):
          <div className="mt-2"><CodeBlock>{config}</CodeBlock></div>
        </li>
        <li>
          <span className="font-medium">Reinicia Claude Desktop</span>. Las herramientas aparecerán en el menú de herramientas — prueba
          a preguntar <em>&quot;¿Qué hay en mi pipeline de CRM?&quot;</em> o <em>&quot;Redacta un pitch deck para Acme.&quot;</em>
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        El puente <code className="text-[11px] px-1 py-0.5 bg-muted rounded">mcp-remote</code> traduce el endpoint
        Streamable HTTP al transporte stdio que espera Claude Desktop. Sin instalaciones adicionales — npx lo descarga al momento.
      </p>
    </div>
  );
}

function ClaudeCodeInstructions({ endpoint }: { endpoint: string }) {
  const command = `claude mcp add --transport http crm-agents \\
  ${endpoint} \\
  --header "Authorization: Bearer sd_mcp_your_key_here"`;
  return (
    <div className="space-y-4 text-sm">
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generar una clave de API</span> abajo — ponle el nombre{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">Claude Code</code>.
        </li>
        <li>
          <span className="font-medium">Añadir el servidor MCP</span> desde tu terminal:
          <div className="mt-2"><CodeBlock>{command}</CodeBlock></div>
        </li>
        <li>
          <span className="font-medium">Verifica</span> con <code className="text-xs px-1 py-0.5 bg-muted rounded">claude mcp list</code>.
          El servidor <code className="text-xs px-1 py-0.5 bg-muted rounded">CRM AGENTS</code> debería aparecer y responder.
        </li>
        <li>
          En cualquier sesión de Claude Code, escribe <code className="text-xs px-1 py-0.5 bg-muted rounded">/mcp</code> para ver las herramientas disponibles.
        </li>
      </ol>
    </div>
  );
}

function ChatGptInstructions({ endpoint }: { endpoint: string }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted-foreground">
        ChatGPT admite servidores MCP como <strong>conectores</strong> en los planes Pro / Team / Enterprise.
        La configuración se hace en los ajustes de ChatGPT, no en esta página.
      </p>
      <ol className="list-decimal ml-5 space-y-3">
        <li>
          <span className="font-medium">Generar una clave de API</span> abajo — ponle el nombre{' '}
          <code className="text-xs px-1 py-0.5 bg-muted rounded">ChatGPT</code>.
        </li>
        <li>
          En ChatGPT, abre <span className="font-medium">Ajustes → Conectores</span> (o{' '}
          <span className="font-medium">Funciones beta → MCP</span> según tu plan) y elige{' '}
          <span className="font-medium">Añadir conector personalizado</span>.
        </li>
        <li>
          Configura el conector:
          <ul className="list-disc ml-5 mt-1 text-muted-foreground space-y-0.5">
            <li>Nombre: <code className="text-xs px-1 py-0.5 bg-muted rounded">CRM AGENTS</code></li>
            <li>URL del servidor: <code className="text-xs px-1 py-0.5 bg-muted rounded">{endpoint}</code></li>
            <li>Autenticación: <span className="font-medium">Bearer token</span></li>
            <li>Token: <code className="text-xs px-1 py-0.5 bg-muted rounded">sd_mcp_your_key_here</code></li>
          </ul>
        </li>
        <li>
          <span className="font-medium">Guardar y activar el conector</span>. Las conversaciones nuevas tendrán acceso a
          todas las herramientas de CRM AGENTS que permitan los permisos de tu clave.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        La interfaz de conectores de ChatGPT va cambiando a medida que se despliega el soporte de MCP. Si tu cuenta aún no
        ofrece conectores personalizados, las vías de Claude Desktop o Claude Code funcionan hoy.
      </p>
    </div>
  );
}
