import type { Metadata } from 'next';
import { InstallClient } from './InstallClient';

export const metadata: Metadata = {
  title: 'Install — CRM AGENTS Claude skills',
  description:
    'One-click installer for the CRM AGENTS Claude skills. Run sd-create-page, sd-create-deck, sd-create-website and more directly from Claude Desktop or Claude Code.',
  robots: { index: false }, // private install page, not for organic discovery
};

export default function InstallPage() {
  return <InstallClient />;
}
