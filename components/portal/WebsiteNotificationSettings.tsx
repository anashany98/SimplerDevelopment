'use client';

import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const WEBSITE_NOTIFICATION_PRESETS: AutomationPreset[] = [
  {
    key: 'form_notification',
    name: 'Formulario enviado',
    description: 'Recibe un aviso cuando alguien envíe un formulario en tu web',
    icon: 'mark_email_unread',
    trigger: { event: 'form.submitted' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo formulario enviado en tu web', body: 'Alguien ha enviado un formulario en tu web. Revisa los envíos para responder.' } }],
  },
  {
    key: 'page_published_notify',
    name: 'Página publicada',
    description: 'Recibe un aviso cuando se publique una página o entrada nueva',
    icon: 'publish',
    trigger: { event: 'page.published' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Página publicada: revisa la versión en vivo', body: 'Se ha publicado una página nueva en tu web. Revisa la versión en vivo para asegurarte de que todo está correcto.' } }],
  },
  {
    key: 'order_placed_notify',
    name: 'Nuevo pedido',
    description: 'Recibe un aviso cuando un cliente realice un pedido',
    icon: 'shopping_bag',
    trigger: { event: 'order.placed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo pedido: {{event.customerEmail}}', body: 'Se ha realizado un nuevo pedido de {{event.customerEmail}} por {{event.total}} €. Procesa y prepara el pedido.' } }],
  },
  {
    key: 'order_shipped_notify',
    name: 'Pedido enviado',
    description: 'Recibe un aviso cuando un pedido se marque como enviado',
    icon: 'local_shipping',
    trigger: { event: 'order.shipped' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Pedido enviado: {{event.customerEmail}}', body: 'El pedido de {{event.customerEmail}} se ha enviado. Los detalles de seguimiento están disponibles en el panel de tu tienda.' } }],
  },
  {
    key: 'low_stock_notify',
    name: 'Alerta de stock bajo',
    description: 'Recibe un aviso cuando un producto baje de tu umbral de stock',
    icon: 'inventory_2',
    trigger: { event: 'product.low_stock' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Stock bajo: {{event.productName}}', body: '{{event.productName}} ha bajado de tu umbral de stock (quedan {{event.currentStock}}). Considera reponer.' } }],
  },
];

export default function WebsiteNotificationSettings() {
  return (
    <ProductAutomationSettings
      productScope="website"
      presets={WEBSITE_NOTIFICATION_PRESETS}
      title="Notificaciones"
      description="Recibe avisos sobre eventos importantes de tu web y tu tienda"
    />
  );
}
