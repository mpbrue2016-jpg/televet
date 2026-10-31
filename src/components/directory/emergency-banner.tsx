'use client';

import React from 'react';
import Link from 'next/link';
import { Siren, ArrowRight, PhoneCall, Clock } from 'lucide-react';

interface EmergencyBannerProps {
  compact?: boolean;
}

export function EmergencyBanner({ compact = false }: EmergencyBannerProps) {
  if (compact) {
    return (
      <div className="bg-gradient-to-r from-rose-600 to-amber-600 text-white px-4 py-2.5 rounded-2xl flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-2">
          <Siren className="w-5 h-5 text-amber-200 animate-pulse" />
          <span className="text-xs sm:text-sm font-bold">
            Socorro Imediato: Ambulâncias Veterinárias e Plantão 24h
          </span>
        </div>
        <Link
          href="/diretorio?categoria=ambulancia&atende24h=true&emergencia=true"
          className="px-3 py-1 bg-white text-rose-700 text-xs font-extrabold rounded-lg hover:bg-rose-50 transition-colors shadow-sm flex items-center space-x-1"
        >
          <span>Buscar Próximas</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rose-700 via-rose-600 to-amber-600 text-white p-6 md:p-8 shadow-xl border border-rose-400/30">
      <div className="absolute top-0 right-0 -mt-8 -mr-8 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-900/60 text-rose-200 border border-rose-400/40 text-xs font-semibold uppercase tracking-wider">
            <Siren className="w-4 h-4 text-rose-300 animate-pulse" />
            <span>Atalho de Emergência Veterinária</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Precisa de socorro urgente para seu animal?
          </h2>
          <p className="text-rose-100 text-sm md:text-base max-w-2xl leading-relaxed">
            Localize instantaneamente ambulâncias veterinárias de resgate móvel, remoção de urgência e unidades com plantão 24 horas ordenadas pela menor distância de você.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-rose-200 font-medium">
            <span className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>Plantão 24 Horas Ativo</span>
            </span>
            <span className="flex items-center space-x-1">
              <PhoneCall className="w-4 h-4" />
              <span>Ligação e WhatsApp Direto</span>
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/diretorio?categoria=ambulancia&atende24h=true&emergencia=true"
            className="inline-flex items-center justify-center space-x-2 px-6 py-4 bg-white text-rose-700 font-extrabold text-sm md:text-base rounded-2xl shadow-lg hover:bg-rose-50 hover:shadow-xl transition-all transform hover:-translate-y-0.5"
          >
            <Siren className="w-5 h-5 text-rose-600" />
            <span>Ver Ambulâncias Próximas</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
