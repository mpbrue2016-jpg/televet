'use client';

import React from 'react';
import { Megaphone } from 'lucide-react';

interface SponsoredBadgeProps {
  label?: 'PATROCINADO' | 'ANÚNCIO';
  className?: string;
}

/**
 * Selo "PATROCINADO" / "ANÚNCIO" obrigatório e inegociável.
 * O TeleVet Ads garante que este selo não pode ser removido nem ocultado
 * por nenhum estilo ou parâmetro customizado do anunciante.
 */
export function SponsoredBadge({ label = 'PATROCINADO', className = '' }: SponsoredBadgeProps) {
  return (
    <span
      data-testid="ad-sponsored-badge"
      className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider uppercase bg-slate-100 text-slate-600 border border-slate-300 select-none pointer-events-none ${className}`}
      style={{
        zIndex: 10,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      <Megaphone className="w-2.5 h-2.5 text-slate-500 shrink-0" />
      <span>{label}</span>
    </span>
  );
}
