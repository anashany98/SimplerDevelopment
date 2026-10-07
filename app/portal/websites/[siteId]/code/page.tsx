import { CustomCodeForm } from '@/components/portal/CustomCodeForm';

interface PageProps {
  params: Promise<{ siteId: string }>;
}

export default async function SiteCodePage({ params }: PageProps) {
  const { siteId } = await params;
  return (
    <CustomCodeForm
      endpoint={`/api/portal/cms/websites/${siteId}/code`}
      title="Código personalizado del sitio"
      subtitle="Se aplica a todas las páginas de este sitio web. Se propaga antes del código personalizado por tipo de contenido y por página."
    />
  );
}
