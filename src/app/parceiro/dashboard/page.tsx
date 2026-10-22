'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  QrCode,
  Users,
  CalendarCheck,
  DollarSign,
  CreditCard,
  ExternalLink,
  ShieldCheck,
  Building2,
  TrendingUp,
  Receipt,
  ArrowRight
} from 'lucide-react';
import { QRCodeDisplay } from '@/components/partner/qr-code-display';
import { getSupabaseClient } from '@/config/supabase-client';

interface PartnerMetrics {
  clicksCount: number;
  referredTutorsCount: number;
  completedAppointmentsCount: number;
  availableBalanceCents: number;
  pendingBalanceCents: number;
  totalPaidCents: number;
}

interface AttributionRecord {
  id: string;
  createdAt: string;
  tutorName: string;
  consultationValueCents: number;
  commissionRateApplied: number;
  commissionAmountCents: number;
  status: 'pending' | 'available' | 'paid' | 'canceled';
}

interface PartnerSubscription {
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  priceCents: number;
  status: 'active' | 'trialing' | 'past_due' | 'canceled';
  currentPeriodEnd: string;
  sandboxMode: boolean;
}

export default function PartnerDashboardPage() {
  const [loading, setLoading] = useState(false);
  const [partner, setPartner] = useState({
    id: '88888888-8888-8888-8888-888888888888',
    name: 'Pet Shop Bicho Mimado',
    slug: 'bicho-mimado',
    referralCode: 'MIMADO10'
  });

  const [metrics, setMetrics] = useState<PartnerMetrics>({
    clicksCount: 342,
    referredTutorsCount: 48,
    completedAppointmentsCount: 29,
    availableBalanceCents: 43500, // R$ 435,00
    pendingBalanceCents: 12000,   // R$ 120,00
    totalPaidCents: 115000       // R$ 1.150,00
  });

  const [subscription, setSubscription] = useState<PartnerSubscription>({
    planName: 'Plano Parceiro Pro (Anual - 20% OFF)',
    billingCycle: 'yearly',
    priceCents: 383040,
    status: 'active',
    currentPeriodEnd: '2027-10-16T23:59:59Z',
    sandboxMode: true
  });

  const [history, setHistory] = useState<AttributionRecord[]>([
    {
      id: 'att-1',
      createdAt: '2026-10-15T14:30:00Z',
      tutorName: 'Mariana Silva (Pet: Thor)',
      consultationValueCents: 15000,
      commissionRateApplied: 10.0,
      commissionAmountCents: 1500,
      status: 'available'
    },
    {
      id: 'att-2',
      createdAt: '2026-10-14T09:15:00Z',
      tutorName: 'Carlos Eduardo (Pet: Luna)',
      consultationValueCents: 18000,
      commissionRateApplied: 10.0,
      commissionAmountCents: 1800,
      status: 'paid'
    },
    {
      id: 'att-3',
      createdAt: '2026-10-12T17:40:00Z',
      tutorName: 'Fernanda Rocha (Pet: Bob)',
      consultationValueCents: 20000,
      commissionRateApplied: 10.0,
      commissionAmountCents: 2000,
      status: 'pending'
    }
  ]);

  // Carregar dados reais se conectado ao Supabase
  useEffect(() => {
    async function loadData() {
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.rpc('fn_get_partner_dashboard', {
          p_petshop_id: partner.id
        });

        if (data && data.success) {
          if (data.metrics) {
            setMetrics({
              clicksCount: data.metrics.clicks_count || 0,
              referredTutorsCount: data.metrics.referred_tutors_count || 0,
              completedAppointmentsCount: data.metrics.completed_appointments_count || 0,
              availableBalanceCents: data.metrics.available_balance_cents || 0,
              pendingBalanceCents: data.metrics.pending_balance_cents || 0,
              totalPaidCents: data.metrics.total_paid_cents || 0
            });
          }
          if (data.subscription) {
            setSubscription({
              planName: data.subscription.plan_name,
              billingCycle: data.subscription.billing_cycle,
              priceCents: data.subscription.price_cents,
              status: data.subscription.status,
              currentPeriodEnd: data.subscription.current_period_end,
              sandboxMode: data.subscription.sandbox_mode
            });
          }
          if (data.history && data.history.length > 0) {
            setHistory(
              data.history.map((h: any) => ({
                id: h.id,
                createdAt: h.created_at,
                tutorName: h.tutor_name || 'Tutor Atendido',
                consultationValueCents: h.consultation_value_cents,
                commissionRateApplied: h.commission_rate_applied,
                commissionAmountCents: h.commission_amount_cents,
                status: h.status
              }))
            );
          }
        }
      } catch {
        // Usa fallbacks locais informativos
      }
    }

    loadData();
  }, [partner.id]);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Barra Superior */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-sm">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Portal do Parceiro</span>
              <h2 className="text-base font-extrabold text-slate-900 leading-tight">{partner.name}</h2>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href={`/petshop/${partner.slug}`}
              target="_blank"
              className="inline-flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-colors"
            >
              <span>Ver Minha Página Pública</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Banner de Proteção Sandbox */}
        {subscription.sandboxMode && (
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-l-4 border-amber-500 p-4 rounded-r-2xl flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShieldCheck className="w-6 h-6 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900">
                  Modo de Demonstração / Sandbox Ativo
                </p>
                <p className="text-xs text-amber-700">
                  Nenhuma cobrança bancária real é realizada nesta fase. As assinaturas e comissões operam em ambiente seguro de testes.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block px-3 py-1 bg-amber-200 text-amber-900 font-extrabold text-[10px] uppercase tracking-wider rounded-full">
              Homologação Segura
            </span>
          </div>
        )}

        {/* Grade de KPIs */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Acessos no QR Code</span>
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <QrCode className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{metrics.clicksCount}</p>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center mt-1">
              <TrendingUp className="w-3 h-3 mr-1" />
              Scans e cliques rastreados
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tutores Indicados</span>
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{metrics.referredTutorsCount}</p>
            <span className="text-[11px] font-medium text-slate-400 mt-1 block">
              Cadastros com seu vínculo
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Consultas Realizadas</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <CalendarCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 mt-2">{metrics.completedAppointmentsCount}</p>
            <span className="text-[11px] font-medium text-emerald-600 mt-1 block">
              Atendimentos finalizados
            </span>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Saldo Disponível</span>
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-emerald-700 mt-2">
              {formatCurrency(metrics.availableBalanceCents)}
            </p>
            <span className="text-[11px] font-medium text-slate-400 mt-1 block">
              Pendente: {formatCurrency(metrics.pendingBalanceCents)}
            </span>
          </div>
        </section>

        {/* Seção Principal: Coluna Esquerda (Display QR Code) e Direita (Assinatura + Extrato) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Display de Balcão com QR Code */}
          <div className="lg:col-span-1">
            <QRCodeDisplay
              partnerName={partner.name}
              slug={partner.slug}
              referralCode={partner.referralCode}
            />
          </div>

          {/* Assinatura SaaS & Extrato */}
          <div className="lg:col-span-2 space-y-6">
            {/* Cartão da Assinatura SaaS */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Assinatura SaaS White Label</h3>
                    <p className="text-xs text-slate-500">Plano de credenciamento do pet shop no TELEVET</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full uppercase">
                  {subscription.status === 'active' ? 'Ativa' : subscription.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">Plano Contratado:</span>
                  <span className="font-bold text-slate-800 text-sm">{subscription.planName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Ciclo / Valor:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {subscription.billingCycle === 'yearly' ? 'Anual' : 'Mensal'} ({formatCurrency(subscription.priceCents)})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Próxima Renovação:</span>
                  <span className="font-bold text-slate-800 text-sm">
                    {new Date(subscription.currentPeriodEnd).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Extrato de Comissões por Consulta */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Extrato de Consultas e Comissões</h3>
                  <p className="text-xs text-slate-500">Repasses gerados através do seu QR Code e link de indicação</p>
                </div>
                <span className="text-xs text-slate-400 font-medium">
                  {history.length} atendimentos
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Data</th>
                      <th className="py-3 px-4 font-semibold">Tutor / Consulta</th>
                      <th className="py-3 px-4 font-semibold">Valor Bruto</th>
                      <th className="py-3 px-4 font-semibold">Taxa</th>
                      <th className="py-3 px-4 font-semibold">Comissão</th>
                      <th className="py-3 px-4 font-semibold text-right">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-4 text-slate-500">
                          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800">
                          {item.tutorName}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600">
                          {formatCurrency(item.consultationValueCents)}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500">
                          {item.commissionRateApplied}%
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-600">
                          {formatCurrency(item.commissionAmountCents)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              item.status === 'paid'
                                ? 'bg-blue-100 text-blue-800'
                                : item.status === 'available'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.status === 'paid' ? 'Pago' : item.status === 'available' ? 'Disponível' : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
