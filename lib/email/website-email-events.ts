import type { EmailTemplateVariable } from '@/lib/db/schema';

export interface EmailEventDefinition {
  event: string;
  name: string;
  description: string;
  category: 'store' | 'account' | 'content' | 'booking';
  isRequired: boolean;
  defaultSubject: string;
  variables: EmailTemplateVariable[];
}

// -- Shared variables available to all templates --

const COMMON_VARIABLES: EmailTemplateVariable[] = [
  { key: 'siteName', label: 'Nombre del sitio', description: 'Nombre del sitio web', sampleValue: 'Mi tienda' },
  { key: 'siteUrl', label: 'URL del sitio', description: 'URL del sitio web', sampleValue: 'https://mystore.com' },
  { key: 'currentYear', label: 'Año actual', description: 'Año actual para los pies de página', sampleValue: '2026' },
];

const CUSTOMER_VARIABLES: EmailTemplateVariable[] = [
  { key: 'firstName', label: 'Nombre', description: 'Nombre del cliente', sampleValue: 'Ana' },
  { key: 'lastName', label: 'Apellidos', description: 'Apellidos del cliente', sampleValue: 'García' },
  { key: 'fullName', label: 'Nombre completo', description: 'Nombre completo del cliente', sampleValue: 'Ana García' },
  { key: 'email', label: 'Correo electrónico', description: 'Correo electrónico del cliente', sampleValue: 'ana@ejemplo.com' },
];

const ORDER_VARIABLES: EmailTemplateVariable[] = [
  { key: 'orderNumber', label: 'Número de pedido', description: 'Número de pedido (p. ej. ORD-0042)', sampleValue: 'ORD-0042' },
  { key: 'orderDate', label: 'Fecha del pedido', description: 'Fecha en que se realizó el pedido', sampleValue: '2 de abril de 2026' },
  { key: 'orderTotal', label: 'Total del pedido', description: 'Total del pedido con formato', sampleValue: '$149.99' },
  { key: 'subtotal', label: 'Subtotal', description: 'Subtotal antes de impuestos y envío', sampleValue: '$129.99' },
  { key: 'shippingTotal', label: 'Envío', description: 'Coste de envío', sampleValue: '$9.99' },
  { key: 'taxTotal', label: 'Impuestos', description: 'Importe de impuestos', sampleValue: '$10.01' },
  { key: 'discountTotal', label: 'Descuento', description: 'Importe del descuento', sampleValue: '$0.00' },
  { key: 'itemCount', label: 'Número de artículos', description: 'Número de artículos del pedido', sampleValue: '3' },
  { key: 'itemsHtml', label: 'Artículos (HTML)', description: 'Tabla HTML con las líneas del pedido', sampleValue: '<table>...</table>' },
  { key: 'shippingAddress', label: 'Dirección de envío', description: 'Dirección de envío con formato', sampleValue: 'Calle Mayor 123, Madrid, 28001' },
  { key: 'billingAddress', label: 'Dirección de facturación', description: 'Dirección de facturación con formato', sampleValue: 'Calle Mayor 123, Madrid, 28001' },
  { key: 'orderUrl', label: 'URL del pedido', description: 'Enlace a la página de estado del pedido', sampleValue: 'https://mystore.com/sites/mystore.com/account/orders/ORD-0042' },
];

const SHIPPING_VARIABLES: EmailTemplateVariable[] = [
  { key: 'trackingNumber', label: 'Número de seguimiento', description: 'Número de seguimiento del envío', sampleValue: '1Z999AA10123456784' },
  { key: 'trackingUrl', label: 'URL de seguimiento', description: 'Enlace para seguir el envío', sampleValue: 'https://track.example.com/1Z999' },
  { key: 'shippingMethod', label: 'Método de envío', description: 'Nombre del transportista o método', sampleValue: 'Correos Express' },
  { key: 'estimatedDelivery', label: 'Entrega estimada', description: 'Fecha estimada de entrega', sampleValue: '5 de abril de 2026' },
];

// -- All event definitions --

export const EMAIL_EVENTS: EmailEventDefinition[] = [
  // Store / eCommerce
  {
    event: 'order.confirmed',
    name: 'Confirmación de pedido',
    description: 'Se envía cuando un cliente realiza un pedido y el pago se completa correctamente.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Pedido %%orderNumber%% confirmado',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES],
  },
  {
    event: 'order.shipped',
    name: 'Aviso de envío',
    description: 'Se envía cuando un pedido se marca como enviado con información de seguimiento.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Tu pedido %%orderNumber%% ha sido enviado',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES, ...SHIPPING_VARIABLES],
  },
  {
    event: 'order.delivered',
    name: 'Confirmación de entrega',
    description: 'Se envía cuando un pedido se marca como entregado.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Tu pedido %%orderNumber%% ha sido entregado',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES],
  },
  {
    event: 'order.cancelled',
    name: 'Pedido cancelado',
    description: 'Se envía cuando la tienda o el cliente cancela un pedido.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'El pedido %%orderNumber%% ha sido cancelado',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'cancellationReason', label: 'Motivo', description: 'Motivo de la cancelación', sampleValue: 'Cancelación solicitada por el cliente' },
    ],
  },
  {
    event: 'order.refunded',
    name: 'Reembolso emitido',
    description: 'Se envía cuando se procesa el reembolso de un pedido.',
    category: 'store',
    isRequired: false,
    defaultSubject: 'Reembolso emitido para el pedido %%orderNumber%%',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'refundAmount', label: 'Importe del reembolso', description: 'Importe del reembolso con formato', sampleValue: '$49.99' },
    ],
  },
  {
    event: 'payment.failed',
    name: 'Pago fallido',
    description: 'Se envía cuando falla un intento de pago.',
    category: 'store',
    isRequired: true,
    defaultSubject: 'Pago fallido del pedido %%orderNumber%%',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES, ...ORDER_VARIABLES,
      { key: 'retryUrl', label: 'URL de reintento', description: 'Enlace para reintentar el pago', sampleValue: 'https://mystore.com/sites/mystore.com/account/orders/ORD-0042' },
    ],
  },
  // Account
  {
    event: 'account.welcome',
    name: 'Correo de bienvenida',
    description: 'Se envía cuando se crea una cuenta de cliente nueva.',
    category: 'account',
    isRequired: true,
    defaultSubject: '¡Te damos la bienvenida a %%siteName%%!',
    variables: [...COMMON_VARIABLES, ...CUSTOMER_VARIABLES],
  },
  {
    event: 'account.password_reset',
    name: 'Restablecimiento de contraseña',
    description: 'Se envía cuando un cliente solicita restablecer su contraseña.',
    category: 'account',
    isRequired: true,
    defaultSubject: 'Restablece tu contraseña de %%siteName%%',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'resetUrl', label: 'URL de restablecimiento', description: 'Enlace para restablecer la contraseña', sampleValue: 'https://mystore.com/sites/mystore.com/account/reset-password?token=abc123' },
    ],
  },
  // Booking
  {
    event: 'booking.confirmed',
    name: 'Confirmación de reserva',
    description: 'Se envía cuando se confirma una reserva.',
    category: 'booking',
    isRequired: false,
    defaultSubject: 'Tu reserva está confirmada',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'bookingDate', label: 'Fecha', description: 'Fecha y hora de la reserva', sampleValue: '5 de abril de 2026 a las 14:00' },
      { key: 'bookingService', label: 'Servicio', description: 'Nombre del servicio o cita', sampleValue: 'Consulta' },
      { key: 'bookingDuration', label: 'Duración', description: 'Duración de la cita', sampleValue: '30 minutos' },
      { key: 'cancelUrl', label: 'URL de cancelación', description: 'Enlace para cancelar la reserva', sampleValue: 'https://mystore.com/book/cancel?token=abc123' },
    ],
  },
  {
    event: 'booking.cancelled',
    name: 'Reserva cancelada',
    description: 'Se envía cuando se cancela una reserva.',
    category: 'booking',
    isRequired: false,
    defaultSubject: 'Tu reserva ha sido cancelada',
    variables: [
      ...COMMON_VARIABLES, ...CUSTOMER_VARIABLES,
      { key: 'bookingDate', label: 'Fecha', description: 'Fecha original de la reserva', sampleValue: '5 de abril de 2026 a las 14:00' },
      { key: 'bookingService', label: 'Servicio', description: 'Nombre del servicio', sampleValue: 'Consulta' },
    ],
  },
];

export function getEventDefinition(event: string): EmailEventDefinition | undefined {
  return EMAIL_EVENTS.find(e => e.event === event);
}

export function getEventsByCategory(category: string): EmailEventDefinition[] {
  return EMAIL_EVENTS.filter(e => e.category === category);
}

export function getRequiredEvents(): EmailEventDefinition[] {
  return EMAIL_EVENTS.filter(e => e.isRequired);
}

/**
 * Replace %%variable%% tokens in a string with values from a data object.
 * Unmatched tokens are left as-is (visible in preview, replaced at send time).
 */
export function replaceVariables(template: string, data: Record<string, string>): string {
  return template.replace(/%%(\w+)%%/g, (match, key) => {
    return data[key] !== undefined ? data[key] : match;
  });
}

/**
 * Build sample data from variable definitions for preview rendering.
 */
export function buildSampleData(variables: EmailTemplateVariable[]): Record<string, string> {
  const data: Record<string, string> = {};
  for (const v of variables) {
    data[v.key] = v.sampleValue;
  }
  return data;
}
