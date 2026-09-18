'use client';

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const WEBSITE_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'form_to_crm',
    name: 'Envío de formulario al CRM',
    description: 'Crea automáticamente un contacto en el CRM cuando un visitante envía un formulario en tu web',
    icon: 'contact_page',
    trigger: { event: 'form.submitted' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo envío de formulario desde la web', body: 'Un visitante ha enviado un formulario en tu web. Revisa el envío y haz seguimiento.' } }],
  },
  {
    key: 'order_to_crm',
    name: 'Añadir cliente al CRM al comprar',
    description: 'Registra automáticamente nuevos clientes en tu CRM cuando realizan una compra',
    icon: 'person_add',
    trigger: { event: 'order.paid' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo cliente de la tienda: {{event.customerEmail}}', body: 'Un nuevo cliente ({{event.customerEmail}}) ha realizado una compra. Añádelo al CRM para seguimiento y retención.' } }],
  },
  {
    key: 'post_purchase_followup',
    name: 'Seguimiento postcompra',
    description: 'Crea una tarea de seguimiento tras la compra de un cliente para pedir reseñas o vender productos complementarios',
    icon: 'follow_the_signs',
    trigger: { event: 'order.paid' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Seguimiento del cliente: {{event.customerEmail}}', body: 'El cliente {{event.customerEmail}} ha realizado una compra. Programa un seguimiento para pedir una reseña u ofrecer productos relacionados.' }, delay: 1209600 }],
    settings: [
      {
        key: 'followUpDelay',
        label: 'Hacer seguimiento después de',
        type: 'select',
        options: [
          { value: '604800', label: '1 semana' },
          { value: '1209600', label: '2 semanas' },
          { value: '2592000', label: '30 días' },
        ],
        defaultValue: '1209600',
        mapsTo: { actionIndex: 0, paramKey: 'delay' },
      },
    ],
  },
];

export default function WebsiteAutomationSettings() {
  return (
    <ProductAutomationSettings
      productScope="website"
      presets={WEBSITE_AUTOMATION_PRESETS}
      title="Automatizaciones"
      description="Automatiza flujos de trabajo del CRM y seguimientos de clientes"
    />
  );
}
