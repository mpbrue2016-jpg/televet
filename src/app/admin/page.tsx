'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  DollarSign,
  CalendarCheck,
  Users,
  Stethoscope,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  Info,
} from 'lucide-react';
import { AdminMasterService } from '@/admin/admin-master-service';
import { AdminRealAnalytics } from '@/admin/types';

export default function AdminMasterDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<AdminRealAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adminService = new AdminMasterService();

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminService.getRealAnalytics();
      setAnalytics(data);
    } catch (err: any) {
      console.error('Erro ao carregar analytics:', err);
      setError(err.message || 'Erro ao consultar indicadores com origem real nos dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMetrics();
  }, []);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Painel Executivo Admin Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Indicadores e relatórios consolidados em tempo real com origem estrita nos registros do banco de dados.
          </p>
        </div>

        <button
          onClick={loadMetrics}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Indicadores</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cartões Financeiros Reais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              MRR (Mensalidades SaaS)
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {analytics ? formatCurrency(analytics.financial.mrrCents) : '...'}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            ARR Estimado: {analytics ? formatCurrency(analytics.financial.arrCents) : '...'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              GMV Total Transacionado
            </span>
            <div className="p-2 bg-blue-50 text-[#005bb5] rounded-xl">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-[#005bb5] mt-2">
            {analytics ? formatCurrency(analytics.financial.gmvCents) : '...'}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Comissão Plataforma: {analytics ? formatCurrency(analytics.financial.platformCommissionsCents) : '...'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Consultas Realizadas
            </span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <CalendarCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {analytics?.appointments.completed ?? 0}
          </p>
          <span className="text-[11px] text-emerald-600 font-medium mt-1 block">
            Taxa de Conversão: {analytics?.appointments.conversionRate ?? 0}%
          </span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Profissionais Cadastrados
            </span>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
              <Stethoscope className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">
            {analytics?.ecosystem.veterinariansValidated ?? 0}
          </p>
          <span className="text-[11px] text-amber-600 font-medium mt-1 block">
            {analytics?.ecosystem.veterinariansPending ?? 0} pendentes de CRMV
          </span>
        </div>
      </div>

      {/* Alertas Operacionais e Pendências */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Moderação de CRMV */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Moderação de Veterinários</h3>
              <Link
                href="/admin/veterinarios"
                className="text-xs font-semibold text-[#005bb5] hover:underline flex items-center"
              >
                Gerenciar <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Existem <strong>{analytics?.ecosystem.veterinariansPending ?? 0}</strong> cadastros aguardando aprovação ou verificação oficial de CRMV.
            </p>
          </div>
        </div>

        {/* Suporte e Chamados Críticos */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start space-x-4">
          <div className="p-3 bg-blue-50 text-[#005bb5] rounded-2xl shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Tickets de Suporte & SLA</h3>
              <Link
                href="/admin/suporte"
                className="text-xs font-semibold text-[#005bb5] hover:underline flex items-center"
              >
                Ver Chamados <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </Link>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              <strong>{analytics?.support.ticketsOpen ?? 0}</strong> chamados em aberto no total ({analytics?.support.ticketsSlaBreached ?? 0} em risco de quebra de SLA).
            </p>
          </div>
        </div>
      </div>

      {/* Desempenho Regional e Ecossistema */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Distribuição Regional de Profissionais (UF)</h3>
            <span className="text-xs text-slate-400">Origem Real</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold">
                  <th className="py-2 px-3">Estado (UF)</th>
                  <th className="py-2 px-3">Profissionais Ativos</th>
                  <th className="py-2 px-3 text-right">Participação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics?.regionalBreakdown && analytics.regionalBreakdown.length > 0 ? (
                  analytics.regionalBreakdown.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{r.state_uf}</td>
                      <td className="py-2.5 px-3 text-slate-600">{r.partners_count}</td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {analytics.ecosystem.veterinariansTotal > 0
                          ? `${Math.round((r.partners_count / analytics.ecosystem.veterinariansTotal) * 100)}%`
                          : '0%'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="py-4 text-center text-slate-400">
                      Nenhum profissional com UF cadastrada no momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Resumo do Ecossistema */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Composição do Ecossistema</h3>
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-600">Tutores Cadastrados:</span>
              <strong className="text-slate-900 font-bold">{analytics?.ecosystem.tutorsCount ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-600">Pet Shops Credenciados:</span>
              <strong className="text-slate-900 font-bold">{analytics?.ecosystem.petshopsTotal ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
              <span className="text-slate-600">Cancelamentos Registrados:</span>
              <strong className="text-slate-900 font-bold">{analytics?.appointments.cancelled ?? 0}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Caixa de Notas de Dados Insuficientes (Regra de Ouro: Sem Números Fictícios) */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-5 text-slate-700">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-[#005bb5] shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <strong className="text-[#005bb5] font-bold block text-sm">
              Transparência na Origem dos Dados (Auditoria Rigorosa)
            </strong>
            <p className="text-slate-600 leading-relaxed">
              O TELEVET adota o princípio de integridade analítica: métricas só são exibidas a partir de cálculos reais. 
              Indicadores com amostragem insuficiente são formalmente documentados abaixo em vez de simulados:
            </p>
            <ul className="list-disc pl-4 space-y-1 mt-2 text-slate-600">
              {analytics?.insufficientDataNotes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
