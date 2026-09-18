'use client';

import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';
import ProductAutomationSettings from '@/components/portal/ProductAutomationSettings';
import type { AutomationPreset } from '@/components/portal/ProductAutomationSettings';

const PROJECT_AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    key: 'project_created_notify',
    name: 'Notificación de nuevo proyecto',
    description: 'Recibe una notificación cuando se cree un proyecto nuevo para configurarlo correctamente',
    icon: 'notifications_active',
    trigger: { event: 'project.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Nuevo proyecto creado: {{event.name}}', body: 'Se ha creado el proyecto "{{event.name}}". Configura el tablero, asigna miembros del equipo y define el primer sprint.' } }],
  },
  {
    key: 'task_completed_notify',
    name: 'Alerta de tarea completada',
    description: 'Recibe una alerta cuando una tarea pase a la columna de completadas',
    icon: 'task_alt',
    trigger: { event: 'task.completed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Tarea completada: {{event.title}}', body: 'La tarea "{{event.title}}" se ha marcado como completada. Revisa si hace falta algún seguimiento.' } }],
  },
  {
    key: 'task_assigned_notify',
    name: 'Notificación de asignación de tarea',
    description: 'Avisa a los miembros del equipo cuando se les asigne una tarea',
    icon: 'assignment_ind',
    trigger: { event: 'task.assigned' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Tarea asignada: {{event.title}}', body: 'Se te ha asignado la tarea "{{event.title}}". Consulta el tablero del proyecto para ver los detalles y la prioridad.' } }],
  },
  {
    key: 'project_status_change',
    name: 'Alerta de cambio de estado del proyecto',
    description: 'Recibe una notificación cuando cambie el estado de un proyecto (activo, en pausa, completado)',
    icon: 'swap_horiz',
    trigger: { event: 'project.status.changed' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Estado del proyecto cambiado: {{event.name}}', body: 'El estado del proyecto "{{event.name}}" ha cambiado a {{event.status}}. Revísalo y actualiza al equipo en consecuencia.' } }],
  },
  {
    key: 'task_created_crm',
    name: 'Registrar tarea en el CRM',
    description: 'Crea una actividad del CRM cuando se cree una tarea de proyecto para trabajo de cara al cliente',
    icon: 'contacts',
    trigger: { event: 'task.created' },
    actions: [{ tool: 'create_support_ticket', params: { subject: 'Tarea de proyecto para seguimiento en el CRM: {{event.title}}', body: 'Se ha creado la tarea "{{event.title}}". Considera registrarla como actividad del CRM si implica trabajo para un cliente.' } }],
  },
];

export default function ProjectAutomationsPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <PortalPageHeader
        eyebrow="Proyectos"
        title="Automatizaciones"
        actions={
          <Link href="/portal/projects" className={pBtnGhost}>
            <span className="material-icons text-base">arrow_back</span>
            Volver a Proyectos
          </Link>
        }
      />

      <ProductAutomationSettings
        productScope="projects"
        presets={PROJECT_AUTOMATION_PRESETS}
        title="Automatizaciones de proyectos"
        description="Automatiza notificaciones y flujos de trabajo para tus proyectos y tareas"
      />
    </div>
  );
}
