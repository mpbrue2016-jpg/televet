'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Megaphone,
  PlusCircle,
  Eye,
  MousePointerClick,
  TrendingUp,
  DollarSign,
  PhoneCall,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Filter,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  Building2,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AdService } from '@/ads/ad-service';
import { AdCampaign, Advertiser, AdMetricsSummary } from '@/ads/types';
import { getSupabaseClient } from '@/config/supabase-client';

export default function AdvertiserPortalPage() {
  const adService = new AdService();
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [advertiser, setAdvertiser] = useState<Advertiser | null>(null);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [metrics, setMetrics] = useState<AdMetricsSummary>({
    impressionsCount: 0,
    viewsCount: 0,
    clicksCount: 0,
    ctrPercent: 0,
    callsCount: 0,
    whatsappCount: 0,
    routesCount: 0,
    spentCents: 0,
    budgetCents: 0,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const adv = await adService.getAdvertiserProfile(user.id);
        if (adv) {
          setAdvertiser(adv);
          const camps = await adService.getCampaigns(adv.id);
          setCampaigns(camps);

          // Agrega métricas das campanhas
          let totalImpr = 0;
          let totalViews = 0;
          let totalClicks = 0;
          let totalCalls = 0;
          let totalWa = 0;
          let totalRoutes = 0;
          let totalSpent = 0;
          let totalBudget = 0;

          for (const c of camps) {
            const m = await adService.getCampaignMetrics(c.id);
            totalImpr += m.impressionsCount;
            totalViews += m.viewsCount;
            totalClicks += m.clicksCount;
            totalCalls += m.callsCount;
            totalWa += m.whatsappCount;
            totalRoutes += m.routesCount;
            totalSpent += m.spentCents;
            totalBudget += m.budgetCents;
          }

          const ctr = totalImpr > 0 ? (totalClicks / totalImpr) * 100 : 0;
          setMetrics({
            impressionsCount: totalImpr,
            viewsCount: totalViews,
            clicksCount: totalClicks,
            ctrPercent: Math.round(ctr * 100) / 100,
            callsCount: totalCalls,
            whatsappCount: totalWa,
            routesCount: totalRoutes,
            spentCents: totalSpent,
            budgetCents: totalBudget,
          });
        } else {
          setAdvertiser(getMockAdvertiser());
          setCampaigns(getMockCampaigns());
          setMetrics(getMockMetrics());
        }
      } else {
        setAdvertiser(getMockAdvertiser());
        setCampaigns(getMockCampaigns());
        setMetrics(getMockMetrics());
      }
    } catch (err) {
      console.warn('Erro ao carregar anunciante:', err);
      setAdvertiser(getMockAdvertiser());
      setCampaigns(getMockCampaigns());
      setMetrics(getMockMetrics());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleExportCsv = () => {
    const csv = adService.exportMetricsCsv(metrics, advertiser?.nomeFantasia || 'Minha Empresa');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `metricas_televet_ads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ativo':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ativa</span>
          </span>
        );
      case 'aguardando_aprovacao':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-100 text-amber-800">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Em Aprovação</span>
          </span>
        );
      case 'pausado':
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-700">
            Pausada
          </span>
        );
      case 'rejeitado':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-800">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Rejeitada</span>
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">
            Rascunho
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header do Anunciante */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="font-extrabold text-xl text-blue-600 flex items-center space-x-1.5">
              <Megaphone className="w-6 h-6 text-blue-600" />
              <span>TeleVet <span className="text-slate-700 font-semibold text-sm">Ads</span></span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/anunciante/campanhas/nova"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Criar Nova Campanha</span>
            </Link>

            <Link
              href="/anunciante/planos"
              className="px-3 py-2 text-slate-700 hover:text-blue-600 text-xs sm:text-sm font-bold rounded-xl border border-slate-200 hover:border-slate-300 transition-colors flex items-center space-x-1"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Planos & Preços</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Banner de Boas-vindas e Saldo */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white rounded-3xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-800/80 text-blue-200 text-xs font-bold border border-blue-600/50">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-300" />
              <span>Painel Oficial do Anunciante • TeleVet Ads</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {advertiser?.nomeFantasia || 'Portal do Anunciante'}
            </h1>
            <p className="text-blue-200 text-xs sm:text-sm max-w-xl">
              Gerencie suas campanhas geolocalizadas, acompanhe métricas reais de engajamento e exporte relatórios sem comprometer a privacidade dos pacientes.
            </p>
          </div>

          <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-md px-5 py-4 rounded-2xl border border-white/20 shrink-0">
            <div>
              <span className="text-[11px] font-bold text-blue-200 uppercase tracking-wider block">Saldo Disponível</span>
              <span className="text-2xl font-extrabold text-white">
                R$ {((advertiser?.balanceCents || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <button
              onClick={() => alert('Recurso de adição de créditos e emissão de fatura integrado à Fase 18.')}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs rounded-xl shadow-md transition-colors"
            >
              + Adicionar Saldo
            </button>
          </div>
        </div>

        {/* 6 Cards de Métricas com Botão de Exportação */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <span>Métricas Consolidadas de Desempenho</span>
            </h2>

            <button
              onClick={handleExportCsv}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl shadow-sm transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Exportar Métricas (CSV)</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Impressões</span>
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900">{metrics.impressionsCount.toLocaleString('pt-BR')}</span>
              <span className="text-[10px] text-slate-500 block">Exibições na tela</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Visualizações</span>
              <span className="text-xl sm:text-2xl font-extrabold text-blue-600">{metrics.viewsCount.toLocaleString('pt-BR')}</span>
              <span className="text-[10px] text-slate-500 block">&gt; 50% na área visível</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Cliques Únicos</span>
              <span className="text-xl sm:text-2xl font-extrabold text-purple-600">{metrics.clicksCount.toLocaleString('pt-BR')}</span>
              <span className="text-[10px] text-slate-500 block">Deduplicados por sessão</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Taxa de Cliques (CTR)</span>
              <span className="text-xl sm:text-2xl font-extrabold text-emerald-600">{metrics.ctrPercent.toFixed(2)}%</span>
              <span className="text-[10px] text-slate-500 block">Média de conversão</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Contatos Diretos</span>
              <span className="text-xl sm:text-2xl font-extrabold text-amber-600">
                {metrics.callsCount + metrics.whatsappCount + metrics.routesCount}
              </span>
              <span className="text-[10px] text-slate-500 block">WhatsApp, Fone e Rota</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Investimento Total</span>
              <span className="text-xl sm:text-2xl font-extrabold text-slate-900">
                R$ {(metrics.spentCents / 100).toFixed(2)}
              </span>
              <span className="text-[10px] text-slate-500 block">De R$ {(metrics.budgetCents / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Lista de Campanhas */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900 flex items-center space-x-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <span>Minhas Campanhas ({campaigns.length})</span>
            </h2>

            <Link
              href="/anunciante/campanhas/nova"
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Nova Campanha</span>
            </Link>
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-32 rounded-3xl bg-slate-200 animate-pulse" />
              ))}
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3">
              <Megaphone className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="text-lg font-bold text-slate-800">Você ainda não possui campanhas criadas</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Crie sua primeira campanha para exibir sua marca, farmácia veterinária, laboratório ou serviço de ambulância no TeleVet.
              </p>
              <Link
                href="/anunciante/campanhas/nova"
                className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Criar Primeira Campanha</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {getStatusBadge(camp.status)}

                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold uppercase">
                        Escopo: {camp.scope}
                      </span>

                      <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
                        Tipo: {camp.campaignType.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 className="text-lg font-extrabold text-slate-900">{camp.name}</h3>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Início: {new Date(camp.startsAt).toLocaleDateString('pt-BR')}</span>
                      {camp.endsAt && <span>Término: {new Date(camp.endsAt).toLocaleDateString('pt-BR')}</span>}
                      <span>Orçamento: R$ {(camp.budgetCents / 100).toFixed(2)}</span>
                      <span>Gasto: R$ {(camp.spentCents / 100).toFixed(2)}</span>
                    </div>

                    {camp.rejectionReason && (
                      <p className="text-xs text-rose-600 font-medium">
                        Motivo da rejeição: {camp.rejectionReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <button
                      onClick={() => alert(`Visualização de criativos da campanha ${camp.name}`)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors"
                    >
                      Ver Criativos
                    </button>
                    <Link
                      href={`/anunciante/campanhas/nova?id=${camp.id}`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
                    >
                      Editar Campanha
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function getMockAdvertiser(): Advertiser {
  return {
    id: 'adv-mock-1',
    razaoSocial: 'DrogaVet Manipulação Veterinária Ltda',
    nomeFantasia: 'DrogaVet Farmácia Pet',
    cnpj: '00.000.000/0001-91',
    contactName: 'Mariana Souza',
    contactEmail: 'marketing@drogavet.com.br',
    contactPhone: '(11) 3214-5566',
    balanceCents: 45000, // R$ 450,00
    status: 'active',
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-23T10:00:00Z',
  };
}

function getMockCampaigns(): AdCampaign[] {
  return [
    {
      id: 'camp-mock-1',
      advertiserId: 'adv-mock-1',
      name: 'Campanha SP - Pastas Palatáveis e Manipulação',
      campaignType: 'banner',
      scope: 'estado',
      targetUfs: ['SP'],
      targetCities: ['São Paulo', 'Campinas'],
      targetNeighborhoods: [],
      targetCategories: ['farmacia_manipulacao', 'farmacia_veterinaria'],
      targetContext: 'diretorio',
      startsAt: '2026-10-01T00:00:00Z',
      endsAt: '2026-11-01T00:00:00Z',
      budgetCents: 100000,
      dailyBudgetCents: 5000,
      spentCents: 34200,
      status: 'ativo',
      paymentStatus: 'paid',
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    },
    {
      id: 'camp-mock-2',
      advertiserId: 'adv-mock-1',
      name: 'Destaque na Busca por Farmácias',
      campaignType: 'destaque_busca',
      scope: 'regional',
      targetUfs: ['SP'],
      targetCities: ['São Paulo'],
      targetNeighborhoods: ['Pinheiros', 'Jardins'],
      targetCategories: ['farmacia_manipulacao'],
      targetContext: 'busca',
      startsAt: '2026-10-15T00:00:00Z',
      budgetCents: 50000,
      dailyBudgetCents: 2000,
      spentCents: 8500,
      status: 'aguardando_aprovacao',
      paymentStatus: 'paid',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: '2026-10-23T00:00:00Z',
    },
  ];
}

function getMockMetrics(): AdMetricsSummary {
  return {
    impressionsCount: 14250,
    viewsCount: 11800,
    clicksCount: 428,
    ctrPercent: 3.0,
    callsCount: 34,
    whatsappCount: 78,
    routesCount: 19,
    spentCents: 42700,
    budgetCents: 150000,
  };
}
