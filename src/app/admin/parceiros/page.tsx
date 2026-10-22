'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Settings,
  DollarSign,
  Building2,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Save,
  X,
  CreditCard,
  Percent,
  Search
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';

interface PartnerItem {
  id: string;
  name: string;
  tradeName: string;
  cnpj: string;
  whatsapp?: string;
  email: string;
  slug: string;
  customCommissionRate: number | null;
  status: 'active' | 'pending' | 'suspended';
  createdAt: string;
}

interface SystemSettings {
  defaultCommissionRate: number;
  attributionWindowDays: number;
  minPayoutCents: number;
}

interface SaaSPlanItem {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  billingInterval: 'monthly' | 'yearly';
  maxConsultationsMonth: number;
  isActive: boolean;
}

export default function AdminPartnersPage() {
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Configurações Globais Editáveis
  const [settings, setSettings] = useState<SystemSettings>({
    defaultCommissionRate: 10.00,
    attributionWindowDays: 30,
    minPayoutCents: 5000
  });
  const [isEditingGlobal, setIsEditingGlobal] = useState(false);
  const [globalRateInput, setGlobalRateInput] = useState('10.00');

  // Modal / Edição de Taxa Customizada de Parceiro
  const [editingPartner, setEditingPartner] = useState<PartnerItem | null>(null);
  const [partnerRateInput, setPartnerRateInput] = useState('');

  // Busca e Filtros
  const [searchQuery, setSearchQuery] = useState('');

  // Lista de Parceiros
  const [partners, setPartners] = useState<PartnerItem[]>([
    {
      id: '88888888-8888-8888-8888-888888888888',
      name: 'Pet Shop Bicho Mimado',
      tradeName: 'Bicho Mimado Matriz',
      cnpj: '12.345.678/0001-99',
      whatsapp: '(11) 98765-4321',
      email: 'contato@bichomimado.com.br',
      slug: 'bicho-mimado',
      customCommissionRate: 15.00, // 15% customizado
      status: 'active',
      createdAt: '2026-09-01T10:00:00Z'
    },
    {
      id: '88888888-8888-8888-8888-000000000002',
      name: 'Pet Shop Animal Feliz',
      tradeName: 'Animal Feliz Centro',
      cnpj: '98.765.432/0001-11',
      whatsapp: '(11) 91234-5678',
      email: 'financeiro@animalfeliz.com.br',
      slug: 'animal-feliz',
      customCommissionRate: null, // Usa global (10%)
      status: 'active',
      createdAt: '2026-09-15T14:30:00Z'
    },
    {
      id: '88888888-8888-8888-8888-000000000003',
      name: 'Clínica & Pet Patas & Pelos',
      tradeName: 'Patas & Pelos Sul',
      cnpj: '45.678.901/0001-22',
      whatsapp: '(21) 99887-6655',
      email: 'contato@patasepelos.com.br',
      slug: 'patas-pelos',
      customCommissionRate: 12.50,
      status: 'active',
      createdAt: '2026-10-02T11:20:00Z'
    }
  ]);

  // Planos SaaS Ativos (Mensal e Anual)
  const [plans, setPlans] = useState<SaaSPlanItem[]>([
    {
      id: 'plan-1',
      name: 'Parceiro Básico (Mensal)',
      slug: 'basico',
      priceCents: 19900,
      billingInterval: 'monthly',
      maxConsultationsMonth: 30,
      isActive: true
    },
    {
      id: 'plan-2',
      name: 'Parceiro Básico (Anual - 20% OFF)',
      slug: 'basico-anual',
      priceCents: 191040,
      billingInterval: 'yearly',
      maxConsultationsMonth: 30,
      isActive: true
    },
    {
      id: 'plan-3',
      name: 'Parceiro Profissional (Mensal)',
      slug: 'profissional',
      priceCents: 39900,
      billingInterval: 'monthly',
      maxConsultationsMonth: 150,
      isActive: true
    },
    {
      id: 'plan-4',
      name: 'Parceiro Profissional (Anual - 20% OFF)',
      slug: 'profissional-anual',
      priceCents: 383040,
      billingInterval: 'yearly',
      maxConsultationsMonth: 150,
      isActive: true
    },
    {
      id: 'plan-5',
      name: 'Parceiro Premium (Anual - 20% OFF)',
      slug: 'premium-anual',
      priceCents: 671040,
      billingInterval: 'yearly',
      maxConsultationsMonth: 9999,
      isActive: true
    }
  ]);

  const notify = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 4000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Salvar Taxa Global
  const handleSaveGlobalRate = async () => {
    const rateNum = parseFloat(globalRateInput);
    if (isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
      notify('Por favor, informe uma taxa válida entre 0% e 100%.', true);
      return;
    }

    try {
      const supabase = getSupabaseClient();
      await supabase.rpc('fn_update_partner_system_settings', {
        p_default_rate: rateNum,
        p_window_days: settings.attributionWindowDays,
        p_min_payout_cents: settings.minPayoutCents
      });
    } catch {
      // continua local
    }

    setSettings((prev) => ({ ...prev, defaultCommissionRate: rateNum }));
    setIsEditingGlobal(false);
    notify(`Taxa padrão global atualizada para ${rateNum.toFixed(2)}%!`);
  };

  // Salvar Taxa Customizada por Parceiro
  const handleSavePartnerRate = async () => {
    if (!editingPartner) return;

    let customRate: number | null = null;
    if (partnerRateInput.trim() !== '') {
      const parsed = parseFloat(partnerRateInput);
      if (isNaN(parsed) || parsed < 0 || parsed > 100) {
        notify('A taxa customizada precisa ser entre 0% e 100%.', true);
        return;
      }
      customRate = parsed;
    }

    try {
      const supabase = getSupabaseClient();
      await supabase.rpc('fn_update_partner_custom_commission', {
        p_petshop_id: editingPartner.id,
        p_custom_rate: customRate
      });
    } catch {
      // continua local
    }

    setPartners((prev) =>
      prev.map((p) =>
        p.id === editingPartner.id ? { ...p, customCommissionRate: customRate } : p
      )
    );

    setEditingPartner(null);
    notify(
      customRate !== null
        ? `Taxa customizada de ${customRate.toFixed(2)}% salva para ${editingPartner.name}!`
        : `Taxa de ${editingPartner.name} redefinida para a taxa padrão global (${settings.defaultCommissionRate}%)!`
    );
  };

  const filteredPartners = partners.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.cnpj.includes(searchQuery) ||
      p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Barra de Topo */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-slate-900 text-white rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Administrador Master</span>
              <h1 className="text-base font-extrabold text-slate-900 leading-tight">
                Gestão de Parceiros & White Label
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full">
              Fase 13 Ativa
            </span>
          </div>
        </div>
      </header>

      {/* Alertas */}
      {successMessage && (
        <div className="fixed top-20 right-8 z-50 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center space-x-2 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="fixed top-20 right-8 z-50 bg-rose-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center space-x-2 text-sm font-semibold animate-in fade-in slide-in-from-top-2">
          <AlertCircle className="w-5 h-5" />
          <span>{errorMessage}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Painel de Configurações Globais do Administrador */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Settings className="w-5 h-5 text-slate-600" />
                <span>Configurações Globais de Comissões & Repasses</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Valores base do sistema que se aplicam a todos os parceiros que não possuem taxa negociada individualmente.
              </p>
            </div>

            {!isEditingGlobal ? (
              <button
                onClick={() => {
                  setGlobalRateInput(settings.defaultCommissionRate.toString());
                  setIsEditingGlobal(true);
                }}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                <Edit2 className="w-4 h-4" />
                <span>Editar Valores Globais</span>
              </button>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleSaveGlobalRate}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar</span>
                </button>
                <button
                  onClick={() => setIsEditingGlobal(false)}
                  className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Cancelar</span>
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-slate-100">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 block mb-1">
                Taxa de Comissão Padrão
              </span>
              {isEditingGlobal ? (
                <div className="flex items-center space-x-2 mt-2">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={globalRateInput}
                    onChange={(e) => setGlobalRateInput(e.target.value)}
                    className="w-24 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm font-bold text-slate-600">%</span>
                </div>
              ) : (
                <p className="text-2xl font-black text-blue-600">
                  {settings.defaultCommissionRate.toFixed(2)}%
                </p>
              )}
              <span className="text-[11px] text-slate-400 mt-1 block">
                Aplicada por consulta aos parceiros sem taxa customizada
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 block mb-1">
                Janela de Atribuição (Validade do Cookie)
              </span>
              <p className="text-2xl font-black text-slate-800">
                {settings.attributionWindowDays} dias
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Tempo que o tutor permanece vinculado ao parceiro após escanear o QR Code
              </span>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs font-semibold text-slate-500 block mb-1">
                Saque Mínimo para Repasse
              </span>
              <p className="text-2xl font-black text-slate-800">
                {formatCurrency(settings.minPayoutCents)}
              </p>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Limite mínimo acumulado para liberação do pagamento ao pet shop
              </span>
            </div>
          </div>
        </section>

        {/* Tabela de Pet Shops Parceiros Cadastrados */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-slate-600" />
                <span>Pet Shops Parceiros & Comissões Individuais</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie taxas personalizadas, credenciamento e status de cada parceiro.
              </p>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Buscar parceiro ou CNPJ..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-6 font-bold">Parceiro / Razão Social</th>
                  <th className="py-3 px-4 font-bold">CNPJ & Contato</th>
                  <th className="py-3 px-4 font-bold">Slug White Label</th>
                  <th className="py-3 px-4 font-bold">Taxa de Comissão</th>
                  <th className="py-3 px-4 font-bold">Situação</th>
                  <th className="py-3 px-6 font-bold text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPartners.map((p) => {
                  const hasCustom = p.customCommissionRate !== null;
                  const currentRate = hasCustom ? p.customCommissionRate! : settings.defaultCommissionRate;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="font-extrabold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-400">{p.tradeName}</div>
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-mono text-slate-700">{p.cnpj}</div>
                        <div className="text-[11px] text-slate-400">{p.whatsapp || p.email}</div>
                      </td>

                      <td className="py-4 px-4">
                        <a
                          href={`/petshop/${p.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-blue-600 hover:underline font-bold"
                        >
                          /petshop/{p.slug}
                        </a>
                      </td>

                      <td className="py-4 px-4">
                        {hasCustom ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-50 text-blue-700 font-extrabold rounded-lg">
                            <Percent className="w-3 h-3" />
                            <span>{currentRate.toFixed(2)}% (Negociada)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 text-slate-600 font-semibold rounded-lg">
                            <span>{currentRate.toFixed(2)}% (Padrão Global)</span>
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            p.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.status === 'active' ? 'Ativo' : p.status}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => {
                            setEditingPartner(p);
                            setPartnerRateInput(
                              p.customCommissionRate !== null ? p.customCommissionRate.toString() : ''
                            );
                          }}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-bold rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Editar Taxa</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Modal de Edição de Taxa do Parceiro */}
        {editingPartner && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900">
                  Editar Taxa de Comissão
                </h3>
                <button
                  onClick={() => setEditingPartner(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500 mb-4">
                Alterando a comissão de <strong>{editingPartner.name}</strong>.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Taxa Personalizada (%)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      placeholder={`Ex: ${settings.defaultCommissionRate}`}
                      value={partnerRateInput}
                      onChange={(e) => setPartnerRateInput(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="font-bold text-slate-600">%</span>
                  </div>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    Deixe em branco para voltar a usar a taxa padrão global ({settings.defaultCommissionRate}%).
                  </span>
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => setEditingPartner(null)}
                    className="flex-1 py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSavePartnerRate}
                    className="flex-1 py-2.5 px-4 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-sm"
                  >
                    Salvar Alteração
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Planos SaaS Cadastrados (Mensais e Anuais) */}
        <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-slate-600" />
                <span>Planos de Assinatura SaaS Disponíveis</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Planos B2B contratáveis pelos Pet Shops parceiros (com proteção Sandbox ativa).
              </p>
            </div>
            <span className="px-3 py-1 bg-amber-50 text-amber-800 text-xs font-bold rounded-full">
              Sandbox Ativo (Sem cobrança real)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-slate-50 p-5 rounded-xl border border-slate-200 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-blue-600">
                    {plan.billingInterval === 'yearly' ? 'Ciclo Anual' : 'Ciclo Mensal'}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                    Ativo
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900">{plan.name}</h3>
                <p className="text-2xl font-black text-slate-900 mt-2">
                  {formatCurrency(plan.priceCents)}
                </p>
                <div className="mt-4 pt-3 border-t border-slate-200 text-xs text-slate-600 flex justify-between">
                  <span>Limite de Consultas:</span>
                  <span className="font-bold">
                    {plan.maxConsultationsMonth === 9999 ? 'Ilimitadas' : `${plan.maxConsultationsMonth}/mês`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
