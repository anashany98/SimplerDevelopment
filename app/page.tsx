import { redirect } from 'next/navigation';

// La raíz va directa al portal de login — la landing de marketing del
// creador ya no se sirve en esta instalación.
export default function HomePage() {
  redirect('/portal/login');
}
