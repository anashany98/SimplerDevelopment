'use client';

import { Block, BlockType } from '@/types/blocks';
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { EditorInner } from '@/components/blocks/VisualBlockEditorEnhanced';
import { EMAIL_BLOCK_TYPES } from '@/lib/email/email-block-types';

interface EmailBlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

const EMAIL_BLOCK_TYPE_LIST: Array<{
  type: BlockType;
  label: string;
  icon: string;
  category: string;
  description: string;
}> = [
  // Basic
  { type: 'heading', label: 'Encabezado', icon: 'title', category: 'Content', description: 'Añade un título o encabezado' },
  { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Content', description: 'Add text content' },
  { type: 'image', label: 'Imagen', icon: 'image', category: 'Content', description: 'Inserta una imagen' },
  { type: 'button', label: 'Botón', icon: 'smart_button', category: 'Content', description: 'Añade un botón de llamada a la acción' },
  { type: 'quote', label: 'Cita', icon: 'format_quote', category: 'Content', description: 'Añade una cita' },

  // Layout
  { type: 'spacer', label: 'Espaciador', icon: 'height', category: 'Layout', description: 'Añadir espacio vertical' },
  { type: 'divider', label: 'Divisor', icon: 'horizontal_rule', category: 'Layout', description: 'Añade una línea horizontal' },
  { type: 'columns', label: 'Columnas', icon: 'view_column', category: 'Layout', description: '2-column layout' },
  { type: 'section', label: 'Sección', icon: 'crop_free', category: 'Layout', description: 'Background section wrapper' },

  // Email-specific
  { type: 'email-header', label: 'Email Header', icon: 'mark_email_read', category: 'Email', description: 'Logo and tagline' },
  { type: 'email-footer', label: 'Email Footer', icon: 'mark_email_unread', category: 'Email', description: 'Company info and unsubscribe' },
  { type: 'social-links', label: 'Social Links', icon: 'share', category: 'Email', description: 'Social media link buttons' },
];

export function EmailBlockEditor({ blocks, onChange }: EmailBlockEditorProps) {
  return (
    <BlockEditorProvider
      initialBlocks={blocks}
      onBlocksChange={onChange}
      initialViewport="desktop"
    >
      <div className="max-w-[600px] mx-auto">
        <EditorInner onChange={onChange} blockTypes={EMAIL_BLOCK_TYPE_LIST} />
      </div>
    </BlockEditorProvider>
  );
}
