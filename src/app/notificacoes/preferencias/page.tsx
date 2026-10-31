'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BellRing, ShieldCheck } from 'lucide-react';
import { NotificationPreferencesForm } from '@/components/notifications/notification-preferences-form';
import { Logo } from '@/components/ui/logo';

export default function NotificationPreferencesPage() {
  // Usuário padrão ou recuperado da sessão
  const testUserId = 'a4444444-4444-4444-4444-444444444444';

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Cabeçalho da Página */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Voltar ao início
          </Link>
          <Logo className="scale-75 origin-right" />
        </div>

        <div className="border-b border-slate-200 pb-5">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100/70 text-[#005bb5] flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Preferências de Comunicação e Notificações
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie como e quando você deseja receber avisos de consultas, receitas digitais e lembretes de saúde animal.
              </p>
            </div>
          </div>
        </div>

        {/* Formulário de Preferências e Opt-in */}
        <NotificationPreferencesForm userId={testUserId} />
      </div>
    </div>
  );
}
