import { describe, expect, it } from 'vitest';
import { MAX_BACKGROUND_SPECIALISTS, selectBackgroundSpecialists } from '@/lib/ai/background-agent-delegation';

describe('selectBackgroundSpecialists', () => {
  it('maps a commerce analysis to the commerce specialist', () => {
    expect(selectBackgroundSpecialists('Revisa el catálogo de Shopify, los productos y el stock.')).toContain('commerce');
  });

  it('selects only matching specialists and caps fan-out deterministically', () => {
    const agents = selectBackgroundSpecialists(
      'Revisa los clientes de CRM, las conversaciones de WhatsApp, la campaña de email y el catálogo de productos.',
    );

    expect(agents).toEqual(['crm', 'inbox', 'marketing']);
    expect(agents).toHaveLength(MAX_BACKGROUND_SPECIALISTS);
    expect(new Set(agents).size).toBe(agents.length);
  });

  it('does not start a specialist run for an unrelated executive request', () => {
    expect(selectBackgroundSpecialists('Ordena mis tres prioridades semanales.')).toEqual([]);
  });
});
