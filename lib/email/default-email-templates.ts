import type { Block } from '@/types/blocks';
import type { EmailTemplateVariable } from '@/lib/db/schema';
import { EMAIL_EVENTS, getEventDefinition } from './website-email-events';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';

export interface DefaultTemplate {
  event: string;
  name: string;
  subject: string;
  description: string;
  blocks: Block[];
  htmlContent: string;
  variables: EmailTemplateVariable[];
  isRequired: boolean;
}

function makeBlock(type: string, order: number, props: Record<string, unknown>): Block {
  return { id: `default-${type}-${order}`, type, order, ...props } as Block;
}

function orderConfirmationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Pedido confirmado', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, ¡gracias por tu pedido! Hemos recibido tu pago y tu pedido se está procesando.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('heading', 4, { content: 'Pedido %%orderNumber%%', level: 3, alignment: 'left' }),
    makeBlock('text', 5, { content: '%%itemsHtml%%', alignment: 'left', size: 'base' }),
    makeBlock('divider', 6, { lineStyle: 'solid' }),
    makeBlock('text', 7, { content: '<strong>Subtotal:</strong> %%subtotal%%<br/><strong>Envío:</strong> %%shippingTotal%%<br/><strong>Impuestos:</strong> %%taxTotal%%<br/><strong>Total:</strong> %%orderTotal%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 8, { height: 'md' }),
    makeBlock('text', 9, { content: '<strong>Envío a:</strong><br/>%%shippingAddress%%', alignment: 'left', size: 'sm' }),
    makeBlock('spacer', 10, { height: 'md' }),
    makeBlock('button', 11, { text: 'Ver pedido', url: '%%orderUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 12, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function shippingNotificationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: '¡Tu pedido ha sido enviado!', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, ¡buenas noticias! Tu pedido %%orderNumber%% está en camino.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Método de envío:</strong> %%shippingMethod%%<br/><strong>Número de seguimiento:</strong> %%trackingNumber%%<br/><strong>Entrega estimada:</strong> %%estimatedDelivery%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('button', 6, { text: 'Sigue tu pedido', url: '%%trackingUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 7, { height: 'sm' }),
    makeBlock('text', 8, { content: 'Si tienes alguna pregunta sobre tu pedido, responde a este correo.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 9, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function deliveryConfirmationBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Tu pedido ha sido entregado', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, tu pedido %%orderNumber%% ha sido entregado. ¡Esperamos que te encante!', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 3, { height: 'md' }),
    makeBlock('button', 4, { text: 'Ver pedido', url: '%%orderUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 5, { height: 'sm' }),
    makeBlock('text', 6, { content: 'Si algo no está bien con tu pedido, no dudes en escribirnos.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function orderCancelledBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Pedido cancelado', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, tu pedido %%orderNumber%% ha sido cancelado.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: '<strong>Motivo:</strong> %%cancellationReason%%', alignment: 'left', size: 'base' }),
    makeBlock('text', 4, { content: 'Si se realizó un pago, el reembolso se emitirá a tu método de pago original en un plazo de 5 a 10 días hábiles.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('button', 6, { text: 'Ver detalles del pedido', url: '%%orderUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function paymentFailedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Pago fallido', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, no pudimos procesar el pago de tu pedido %%orderNumber%%.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'Actualiza tu método de pago para completar la compra. Tus artículos quedan reservados durante 24 horas.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 4, { height: 'md' }),
    makeBlock('button', 5, { text: 'Reintentar pago', url: '%%retryUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('spacer', 6, { height: 'sm' }),
    makeBlock('text', 7, { content: 'Si necesitas ayuda, responde a este correo y te ayudaremos.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 8, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function welcomeBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: '¡Te damos la bienvenida a %%siteName%%!', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, gracias por crear una cuenta. ¡Nos alegra tenerte aquí!', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'Ya puedes explorar nuestra tienda, seguir tus pedidos y disfrutar de una experiencia de compra personalizada.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 4, { height: 'md' }),
    makeBlock('button', 5, { text: 'Empezar a comprar', url: '%%siteUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('email-footer', 6, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function passwordResetBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Restablece tu contraseña', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón de abajo para elegir una nueva.', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 3, { height: 'md' }),
    makeBlock('button', 4, { text: 'Restablecer contraseña', url: '%%resetUrl%%', variant: 'primary', size: 'lg', alignment: 'center' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: 'Si no solicitaste esto, puedes ignorar este correo sin problema. El enlace caduca en 1 hora.', alignment: 'left', size: 'sm' }),
    makeBlock('email-footer', 7, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function refundIssuedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Reembolso emitido', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, se ha emitido un reembolso de <strong>%%refundAmount%%</strong> para tu pedido %%orderNumber%%.', alignment: 'left', size: 'base' }),
    makeBlock('text', 3, { content: 'El reembolso aparecerá en tu método de pago original en un plazo de 5 a 10 días hábiles, según tu banco.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 4, { lineStyle: 'solid' }),
    makeBlock('text', 5, { content: '<strong>Pedido:</strong> %%orderNumber%%<br/><strong>Importe del reembolso:</strong> %%refundAmount%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 6, { height: 'md' }),
    makeBlock('button', 7, { text: 'Ver pedido', url: '%%orderUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 8, { height: 'sm' }),
    makeBlock('text', 9, { content: 'Si tienes alguna pregunta sobre tu reembolso, responde a este correo.', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 10, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function bookingConfirmedBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Reserva confirmada', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, ¡tu reserva está confirmada! Estos son los detalles:', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Servicio:</strong> %%bookingService%%<br/><strong>Fecha y hora:</strong> %%bookingDate%%<br/><strong>Duración:</strong> %%bookingDuration%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: '¿Necesitas hacer cambios? Puedes cancelar tu reserva con el enlace de abajo.', alignment: 'left', size: 'base' }),
    makeBlock('button', 7, { text: 'Cancelar reserva', url: '%%cancelUrl%%', variant: 'outline', size: 'md', alignment: 'center' }),
    makeBlock('spacer', 8, { height: 'sm' }),
    makeBlock('text', 9, { content: '¡Te esperamos!', alignment: 'center', size: 'sm' }),
    makeBlock('email-footer', 10, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

function bookingCancelledBlocks(): Block[] {
  return [
    makeBlock('email-header', 0, { alignment: 'center' }),
    makeBlock('heading', 1, { content: 'Reserva cancelada', level: 1, alignment: 'center' }),
    makeBlock('text', 2, { content: 'Hola %%firstName%%, tu reserva ha sido cancelada.', alignment: 'left', size: 'base' }),
    makeBlock('divider', 3, { lineStyle: 'solid' }),
    makeBlock('text', 4, { content: '<strong>Servicio:</strong> %%bookingService%%<br/><strong>Fecha original:</strong> %%bookingDate%%', alignment: 'left', size: 'base' }),
    makeBlock('spacer', 5, { height: 'md' }),
    makeBlock('text', 6, { content: 'Si quieres volver a reservar, puedes pedir una nueva cita cuando quieras.', alignment: 'left', size: 'base' }),
    makeBlock('button', 7, { text: 'Reservar de nuevo', url: '%%siteUrl%%', variant: 'primary', size: 'md', alignment: 'center' }),
    makeBlock('email-footer', 8, { companyName: '%%siteName%%', showUnsubscribe: false }),
  ];
}

const TEMPLATE_BLOCKS: Record<string, () => Block[]> = {
  'order.confirmed': orderConfirmationBlocks,
  'order.shipped': shippingNotificationBlocks,
  'order.delivered': deliveryConfirmationBlocks,
  'order.cancelled': orderCancelledBlocks,
  'order.refunded': refundIssuedBlocks,
  'payment.failed': paymentFailedBlocks,
  'account.welcome': welcomeBlocks,
  'account.password_reset': passwordResetBlocks,
  'booking.confirmed': bookingConfirmedBlocks,
  'booking.cancelled': bookingCancelledBlocks,
};

export function getDefaultTemplates(): DefaultTemplate[] {
  return EMAIL_EVENTS.map(eventDef => {
    const blocksFn = TEMPLATE_BLOCKS[eventDef.event];
    const blocks = blocksFn ? blocksFn() : [];
    const htmlContent = blocks.length > 0 ? renderBlocksToEmailHtml(blocks) : '';

    return {
      event: eventDef.event,
      name: eventDef.name,
      subject: eventDef.defaultSubject,
      description: eventDef.description,
      blocks,
      htmlContent,
      variables: eventDef.variables,
      isRequired: eventDef.isRequired,
    };
  });
}
