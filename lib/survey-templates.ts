import type { SurveyFieldDef } from '@/lib/db/schema';

export interface SurveyTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fields: SurveyFieldDef[];
  requireEmail: boolean;
}

let order = 0;
function f(partial: Partial<SurveyFieldDef> & { type: SurveyFieldDef['type']; label: string }): SurveyFieldDef {
  return {
    id: `t${order}`,
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: order++,
    page: 0,
    ...partial,
  };
}

function resetOrder() { order = 0; }

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  (() => {
    resetOrder();
    return {
      id: 'nps',
      name: 'Net Promoter Score (NPS)',
      description: 'Mide la lealtad de tus clientes con la pregunta estándar NPS y una de seguimiento',
      icon: 'speed',
      category: 'Opiniones',
      requireEmail: true,
      fields: [
        f({ type: 'slider', label: '¿Qué probabilidad hay de que nos recomiendes a un amigo o colega?', required: true, min: 0, max: 10, step: 1, helpText: '0 = Nada probable, 10 = Muy probable' }),
        f({ type: 'textarea', label: '¿Cuál es el motivo principal de tu puntuación?', required: true, placeholder: 'Cuéntanos qué motivó tu valoración...' }),
        f({ type: 'textarea', label: '¿Qué podríamos hacer para mejorar tu experiencia?', placeholder: 'Cualquier sugerencia es bienvenida' }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'csat',
      name: 'Satisfacción del cliente (CSAT)',
      description: 'Encuesta rápida de satisfacción tras una interacción de servicio o una compra',
      icon: 'sentiment_satisfied',
      category: 'Opiniones',
      requireEmail: false,
      fields: [
        f({ type: 'rating', label: '¿Cuál es tu grado de satisfacción con tu experiencia reciente?', required: true }),
        f({ type: 'radio', label: '¿Qué área estás valorando?', required: true, options: ['Calidad del producto', 'Atención al cliente', 'Entrega/puntualidad', 'Relación calidad-precio', 'Experiencia general'] }),
        f({ type: 'textarea', label: 'Cuéntanos más sobre tu experiencia', placeholder: '¿Qué fue bien o qué se podría mejorar?' }),
        f({ type: 'toggle', label: '¿Volverías a usar nuestro servicio?' }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'customer-feedback',
      name: 'Opiniones de clientes',
      description: 'Formulario completo de opiniones que cubre varios aspectos de tu negocio',
      icon: 'rate_review',
      category: 'Opiniones',
      requireEmail: true,
      fields: [
        f({ type: 'heading', label: 'Sobre tu experiencia' }),
        f({ type: 'rating', label: 'Satisfacción general con nuestro producto o servicio', required: true }),
        f({ type: 'rating', label: 'Calidad del soporte al cliente' }),
        f({ type: 'rating', label: 'Relación calidad-precio' }),
        f({ type: 'page_break', label: 'Salto de página' }),
        f({ type: 'heading', label: 'Detalles', page: 1 }),
        f({ type: 'radio', label: '¿Con qué frecuencia usas nuestro producto o servicio?', required: true, options: ['A diario', 'Semanalmente', 'Mensualmente', 'Rara vez'], page: 1 }),
        f({ type: 'checkbox', label: '¿Qué funciones usas más?', options: ['Producto principal', 'Informes', 'Integraciones', 'App móvil', 'API'], page: 1 }),
        f({ type: 'textarea', label: '¿Qué función te gustaría que añadiéramos?', page: 1 }),
        f({ type: 'page_break', label: 'Salto de página' }),
        f({ type: 'heading', label: 'Comentarios finales', page: 2 }),
        f({ type: 'textarea', label: '¿Alguna otra opinión o sugerencia?', page: 2 }),
        f({ type: 'toggle', label: '¿Podemos contactarte sobre tu opinión?', page: 2 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'event-feedback',
      name: 'Opiniones del evento',
      description: 'Encuesta posterior a eventos para conferencias, talleres o webinars',
      icon: 'event',
      category: 'Eventos',
      requireEmail: false,
      fields: [
        f({ type: 'heading', label: 'Experiencia en el evento' }),
        f({ type: 'rating', label: '¿Cómo valorarías el evento en general?', required: true }),
        f({ type: 'radio', label: '¿Qué relevancia tuvo el contenido para ti?', required: true, options: ['Muy relevante', 'Algo relevante', 'Neutro', 'Poco relevante', 'Nada relevante'] }),
        f({ type: 'rating', label: 'Calidad de los ponentes' }),
        f({ type: 'rating', label: 'Calidad del lugar o la plataforma' }),
        f({ type: 'page_break', label: 'Salto de página' }),
        f({ type: 'heading', label: 'En detalle', page: 1 }),
        f({ type: 'textarea', label: '¿Qué fue lo más valioso del evento?', required: true, page: 1 }),
        f({ type: 'textarea', label: '¿Qué se podría mejorar para la próxima vez?', page: 1 }),
        f({ type: 'radio', label: '¿Asistirías a un futuro evento?', options: ['Sin duda', 'Probablemente', 'Quizá', 'Probablemente no', 'Definitivamente no'], page: 1 }),
        f({ type: 'checkbox', label: '¿Qué temas te interesan para futuros eventos?', options: ['Tendencias del sector', 'Análisis técnicos en profundidad', 'Casos de éxito', 'Networking', 'Talleres prácticos'], page: 1 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'lead-qualification',
      name: 'Cualificación de clientes potenciales',
      description: 'Cualifica clientes potenciales evaluando presupuesto, plazos y necesidades',
      icon: 'filter_alt',
      category: 'Ventas',
      requireEmail: true,
      fields: [
        f({ type: 'heading', label: 'Sobre ti' }),
        f({ type: 'text', label: 'Nombre de la empresa', required: true }),
        f({ type: 'text', label: 'Cargo', required: true }),
        f({ type: 'select', label: 'Tamaño de la empresa', required: true, options: ['1-10 empleados', '11-50 empleados', '51-200 empleados', '201-1000 empleados', 'Más de 1000'] }),
        f({ type: 'page_break', label: 'Salto de página' }),
        f({ type: 'heading', label: 'Tus necesidades', page: 1 }),
        f({ type: 'checkbox', label: '¿Qué estás buscando?', required: true, options: ['Web nueva', 'Rediseño web', 'Comercio electrónico', 'SEO/Marketing', 'Desarrollo a medida', 'Consultoría'], page: 1 }),
        f({ type: 'select', label: 'Rango de presupuesto', required: true, options: ['Menos de $5.000', '$5.000 - $15.000', '$15.000 - $50.000', '$50.000 - $100.000', 'Más de $100.000'], page: 1 }),
        f({ type: 'radio', label: 'Plazos', required: true, options: ['Lo antes posible', 'En 1 mes', '1-3 meses', '3-6 meses', 'Solo estoy explorando'], page: 1 }),
        f({ type: 'page_break', label: 'Salto de página' }),
        f({ type: 'heading', label: 'Detalles', page: 2 }),
        f({ type: 'textarea', label: 'Describe tu proyecto o necesidades', required: true, placeholder: 'Cuanto más detalle nos des, mejor podremos ayudarte...', page: 2 }),
        f({ type: 'url', label: 'Web actual (si la tienes)', placeholder: 'https://...', page: 2 }),
        f({ type: 'radio', label: '¿Cómo nos conociste?', options: ['Búsqueda en Google', 'Recomendación', 'Redes sociales', 'Evento/conferencia', 'Otros'], page: 2 }),
      ],
    };
  })(),

  (() => {
    resetOrder();
    return {
      id: 'post-meeting',
      name: 'Opiniones tras la reunión',
      description: 'Encuesta de seguimiento tras consultas o reuniones con clientes',
      icon: 'groups',
      category: 'Reuniones',
      requireEmail: false,
      fields: [
        f({ type: 'rating', label: '¿Te resultó útil la reunión?', required: true }),
        f({ type: 'radio', label: '¿La reunión cubrió todo lo que necesitabas?', required: true, options: ['Sí, por completo', 'En su mayoría', 'Parcialmente', 'No realmente'] }),
        f({ type: 'textarea', label: '¿Cuál fue la conclusión más valiosa?', placeholder: 'Idea clave o acción pendiente de la reunión...' }),
        f({ type: 'textarea', label: '¿Hay algo que debamos retomar?' }),
        f({ type: 'radio', label: '¿Te gustaría agendar una reunión de seguimiento?', options: ['Sí, en una semana', 'Sí, en un mes', 'Ahora no', 'No, gracias'] }),
      ],
    };
  })(),
];

export function getTemplate(id: string): SurveyTemplate | undefined {
  return SURVEY_TEMPLATES.find(t => t.id === id);
}
