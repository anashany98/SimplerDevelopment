'use client';

import { TextBlock } from '@/types/blocks';

interface TextBlockEditProps {
  block: TextBlock;
  onChange: (block: TextBlock) => void;
}

export function TextBlockEdit({ block, onChange }: TextBlockEditProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Content
        </label>
        <textarea
          value={block.content}
          onChange={(e) => onChange({ ...block, content: e.target.value })}
          className="w-full min-h-[100px] rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          placeholder="Enter text content..."
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Alineación</label>
          <select
            value={block.alignment || 'left'}
            onChange={(e) => onChange({ ...block, alignment: e.target.value as TextBlock['alignment'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="left">Izquierda</option>
            <option value="center">Centrado</option>
            <option value="right">Derecha</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Tamaño</label>
          <select
            value={block.size || 'base'}
            onChange={(e) => onChange({ ...block, size: e.target.value as TextBlock['size'] })}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary"
          >
            <option value="sm">Pequeño</option>
            <option value="base">Base</option>
            <option value="lg">Grande</option>
            <option value="xl">Extra Large</option>
          </select>
        </div>
      </div>
    </div>
  );
}
