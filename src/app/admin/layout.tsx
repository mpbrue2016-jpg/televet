'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Stethoscope,
  Building2,
  DollarSign,
  HeadphonesIcon,
  Bell,
  Megaphone,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Eye,
  LogOut,
  ChevronRight,
  Menu,
  X,
  Lock,
  Compass,
} from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { getSupabaseClient } from '@/config/supabase-client';

const NAV_ITEMS = [
  { href: '/admin', label: 'Visão Geral', icon: LayoutDashboard },
  { href: '/admin/veterinarios', label: 'Veterinários & CRMV', icon: Stethoscope },
  { href: '/admin/parceiros', label: 'Pet Shops & Parceiros', icon: Building2 },
  { href: '/admin/diretorio', label: 'Diretório Nacional', icon: Compass },
  { href: '/admin/financeiro', label: 'Financeiro & Ledger', icon: DollarSign },
  { href: '/admin/suporte', label: 'Suporte & SLA', icon: HeadphonesIcon },
  { href: '/admin/notificacoes', label: 'Notificações & Outbox', icon: Bell },
  { href: '/admin/anuncios', label: 'Anúncios & Patrocinadores', icon: Megaphone },
  { href: '/admin/configuracoes', label: 'Governança & Flags', icon: Settings },
  { href: '/admin/auditoria', label: 'Auditoria & Logs', icon: ShieldAlert },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showViewAsModal, setShowViewAsModal] = useState(false);
  const [viewAsUserId, setViewAsUserId] = useState('');
  const [viewAsReason, setViewAsReason] = useState('');
  const [viewAsActiveUser, setViewAsActiveUser] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleStartViewAs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewAsUserId || !viewAsReason) return;

    try {
      const { data, error } = await supabase.rpc('fn_admin_generate_view_as_token', {
        p_target_user_id: viewAsUserId,
        p_justification: viewAsReason,
      });

      if (error) throw error;

      setViewAsActiveUser(data.target_email || viewAsUserId);
      setShowViewAsModal(false);
    } catch (err: any) {
      alert(`Erro ao iniciar modo Ver Como Usuário: ${err.message}`);
    }
  };

  const handleExitViewAs = () => {
    setViewAsActiveUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Barra de Aviso de "Ver Como Usuário" quando ativo */}
      {viewAsActiveUser && (
        <div className="bg-amber-500 text-slate-900 px-4 py-2 text-xs font-semibold flex items-center justify-between shadow-sm sticky top-0 z-50">
          <div className="flex items-center space-x-2">
            <Eye className="w-4 h-4 animate-pulse" />
            <span>
              MODO SIMULAÇÃO ATIVO: Visualizando em modo <strong>SOMENTE LEITURA</strong> como {viewAsActiveUser}. Todas as ações são auditadas.
            </span>
          </div>
          <button
            onClick={handleExitViewAs}
            className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] hover:bg-slate-800 transition-colors"
          >
            Encerrar Simulação
          </button>
        </div>
      )}

      {/* Header Superior Administrativo */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex items-center space-x-3">
              <Logo className="scale-75 origin-left" />
              <span className="hidden sm:inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-[#005bb5] uppercase tracking-wide">
                Admin Master
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Badge de MFA Superadmin */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>MFA Ativo</span>
            </div>

            {/* Botão Ver Como Usuário */}
            <button
              onClick={() => setShowViewAsModal(true)}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center space-x-1.5 transition-colors"
              title="Acesso auditado em modo somente leitura"
            >
              <Eye className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden md:inline">Ver como Usuário</span>
            </button>

            <Link
              href="/"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
              title="Voltar ao portal"
            >
              <LogOut className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Layout Principal com Sidebar */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6">
        {/* Sidebar Desktop */}
        <aside className="hidden md:block w-64 shrink-0">
          <nav className="bg-white rounded-2xl border border-slate-200 p-3 shadow-sm space-y-1 sticky top-24">
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Navegação Master
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-[#005bb5] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Menu Mobile */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm md:hidden">
            <div className="fixed inset-y-0 left-0 w-72 bg-white p-4 shadow-2xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <Logo className="scale-75 origin-left" />
                  <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="mt-4 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-medium ${
                          isActive ? 'bg-[#005bb5] text-white' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo Central */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>

      {/* Modal: Ver Como Usuário (Auditado) */}
      {showViewAsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleStartViewAs}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Modo &quot;Ver como Usuário&quot;</h3>
              <p className="text-xs text-slate-500 mt-1">
                Permite inspecionar a interface pela perspectiva do usuário alvo em modo <strong>somente leitura</strong>. Esta ação é auditada e exige justificativa.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  UUID ou E-mail do Usuário
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: a4444444-4444-4444-4444-444444444444"
                  value={viewAsUserId}
                  onChange={(e) => setViewAsUserId(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bb5]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Justificativa Formal de Acesso (Obrigatória)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o motivo do suporte ou auditoria técnica..."
                  value={viewAsReason}
                  onChange={(e) => setViewAsReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bb5]"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800 flex items-start space-x-2">
              <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                Regra estrita de segurança: nenhuma ação de gravação é permitida. Apenas leitura sem contornar as permissões originais do usuário.
              </span>
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowViewAsModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm"
              >
                Iniciar Simulação
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
