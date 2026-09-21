'use client';

import { useState } from 'react';
import type { StepProps } from './types';
import { obLabel, obHint, obTextarea, obPrimaryBtn } from '../ob-styles';

const EXAMPLES = [
  'Ayudamos a pequeños propietarios a gestionar inquilinos sin hojas de cálculo.',
  'Estudio de diseño boutique para lanzamientos de SaaS indie.',
  'Clases de programación con IA para estudiantes de secundaria.',
];

export function StepMission({ state, setAnswers, next }: StepProps) {
  const [mission, setMission] = useState<string>(state.answers.mission ?? '');

  return (
    <div className="space-y-5">
      <div>
        <label className={obLabel}>
          En una frase — ¿a qué se dedica tu empresa realmente?
        </label>
        <textarea
          value={mission}
          onChange={(e) => { setMission(e.target.value); setAnswers({ mission: e.target.value }); }}
          rows={3}
          placeholder="Intenta mantenerlo en menos de 25 palabras…"
          maxLength={500}
          data-testid="onboarding-mission"
          className={obTextarea}
        />
        <p className="mt-1.5 text-right text-[12px] text-muted-foreground">{mission.length}/500</p>
      </div>

      <div>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">
          ¿Necesitas una idea? Prueba con una de estas:
        </p>
        <ul className="flex flex-col gap-2">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => { setMission(ex); setAnswers({ mission: ex }); }}
                className="text-left text-[13.5px] italic text-primary transition-opacity hover:opacity-75"
              >
                &ldquo;{ex}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className={obHint}>
          <span className="material-icons" style={{ fontSize: 15 }}>lightbulb</span>
          Puedes refinarlo cuando quieras desde tu panel.
        </p>
        <button
          type="button"
          onClick={() => next({ mission })}
          data-testid="onboarding-mission-next"
          className={obPrimaryBtn}
        >
          {mission.trim() ? 'Continuar' : 'Omitir esto'}
          <span className="material-icons" style={{ fontSize: 18 }}>arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
