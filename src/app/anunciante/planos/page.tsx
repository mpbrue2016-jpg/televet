'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Check,
  ChevronLeft,
  Building2,
  ShieldCheck,
  Zap,
  Star,
  Award,
} from 'lucide-react';
import { AdService } from '@/ads/ad-service';
import { AdPlan } from '@/ads/types';

export default function AdvertiserPlansPage() {
  const adService = new AdService();
  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await adService.getPlans();
        if (data.length > 0) {
          setPlans(data);
        } else {
          setPlans(getMockPlans());
        }
      } catch {
        setPlans(getMockPlans());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/anunciante"
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Voltar ao Painel</span>
          </Link>
          <span className="text-xs font-extrabold text-blue-600 uppercase tracking-wider">
            Planos TeleVet Ads
          </span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 space-y-8">
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Planos Flexíveis e Configuráveis</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Escolha o Plano Ideal para sua Empresa
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Todos os planos contam com transparência garantida, selo de anúncio visível, relatórios consolidados e proteção absoluta da privacidade dos tutores e pacientes.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-96 rounded-3xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-stretch">
            {plans.map((p) => {
              const isPopular = p.slug === 'regional';
              const isPremium = p.slug === 'premium';

              return (
                <div
                  key={p.id}
                  className={`relative rounded-3xl p-5 flex flex-col justify-between transition-all ${
                    isPopular
                      ? 'bg-blue-600 text-white shadow-xl ring-2 ring-blue-600 md:-translate-y-2'
                      : isPremium
                      ? 'bg-slate-900 text-white shadow-lg border border-slate-800'
                      : 'bg-white text-slate-900 shadow-sm border border-slate-200'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-amber-400 text-slate-900 font-extrabold text-[10px] uppercase tracking-wider shadow-sm">
                      Mais Popular
                    </span>
                  )}

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-extrabold text-lg">{p.name}</h3>
                      <p className={`text-xs mt-1 line-clamp-2 ${isPopular ? 'text-blue-100' : isPremium ? 'text-slate-400' : 'text-slate-500'}`}>
                        {p.description}
                      </p>
                    </div>

                    <div className="pt-2">
                      <span className="text-xs font-semibold">R$</span>
                      <span className="text-3xl font-extrabold tracking-tight ml-1">
                        {(p.priceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                      </span>
                      <span className={`text-xs ml-1 ${isPopular ? 'text-blue-200' : isPremium ? 'text-slate-400' : 'text-slate-500'}`}>
                        /{p.billingCycle === 'monthly' ? 'mês' : p.billingCycle}
                      </span>
                    </div>

                    <div className="pt-4 border-t border-slate-100/20 space-y-2 text-xs">
                      <div className="flex items-center space-x-2">
                        <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>Até <strong>{p.maxActiveCampaigns}</strong> {p.maxActiveCampaigns === 1 ? 'campanha ativa' : 'campanhas ativas'}</span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>
                          {p.maxImpressionsMonthly ? `${p.maxImpressionsMonthly.toLocaleString('pt-BR')} impressões/mês` : 'Impressões ilimitadas'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                        <span>Selo <strong>PATROCINADO</strong></span>
                      </div>

                      {p.features?.destaque_busca && (
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>Destaque na Busca</span>
                        </div>
                      )}

                      {p.features?.banner_topo && (
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>Banner de Topo Rotativo</span>
                        </div>
                      )}

                      {p.features?.relatorios_avancados && (
                        <div className="flex items-center space-x-2">
                          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                          <span>Métricas & Exportação CSV</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-6">
                    <button
                      onClick={() => alert(`Plano ${p.name} selecionado! Redirecionando para faturamento.`)}
                      className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-sm ${
                        isPopular
                          ? 'bg-white text-blue-700 hover:bg-blue-50'
                          : isPremium
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      Contratar Plano
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function getMockPlans(): AdPlan[] {
  return [
    {
      id: '1',
      slug: 'basico',
      name: 'Plano Básico',
      description: 'Cadastro institucional e página patrocinada no diretório.',
      priceCents: 9900,
      billingCycle: 'monthly',
      maxActiveCampaigns: 1,
      maxImpressionsMonthly: 10000,
      allowedScopes: ['cidade'],
      features: { badge_patrocinado: true, destaque_busca: false, banner_topo: false, relatorios_avancados: false },
      isActive: true,
      displayOrder: 1,
    },
    {
      id: '2',
      slug: 'regional',
      name: 'Plano Regional',
      description: 'Destaque regional na busca, pin prioritário e banner local.',
      priceCents: 24900,
      billingCycle: 'monthly',
      maxActiveCampaigns: 3,
      maxImpressionsMonthly: 50000,
      allowedScopes: ['bairro', 'cidade', 'regiao'],
      features: { badge_patrocinado: true, destaque_busca: true, banner_topo: false, relatorios_avancados: false },
      isActive: true,
      displayOrder: 2,
    },
    {
      id: '3',
      slug: 'estadual',
      name: 'Plano Estadual',
      description: 'Campanha estadual ampla com banner de topo e relatórios.',
      priceCents: 59000,
      billingCycle: 'monthly',
      maxActiveCampaigns: 5,
      maxImpressionsMonthly: 200000,
      allowedScopes: ['bairro', 'cidade', 'regiao', 'estado'],
      features: { badge_patrocinado: true, destaque_busca: true, banner_topo: true, relatorios_avancados: true },
      isActive: true,
      displayOrder: 3,
    },
    {
      id: '4',
      slug: 'nacional',
      name: 'Plano Nacional',
      description: 'Cobertura em todo o território nacional para marcas e redes.',
      priceCents: 149000,
      billingCycle: 'monthly',
      maxActiveCampaigns: 10,
      maxImpressionsMonthly: 1000000,
      allowedScopes: ['nacional'],
      features: { badge_patrocinado: true, destaque_busca: true, banner_topo: true, relatorios_avancados: true },
      isActive: true,
      displayOrder: 4,
    },
    {
      id: '5',
      slug: 'premium',
      name: 'Plano Premium',
      description: 'Recursos avançados com prioridade máxima e métricas em tempo real.',
      priceCents: 299000,
      billingCycle: 'monthly',
      maxActiveCampaigns: 25,
      maxImpressionsMonthly: null,
      allowedScopes: ['nacional'],
      features: { badge_patrocinado: true, destaque_busca: true, banner_topo: true, relatorios_avancados: true },
      isActive: true,
      displayOrder: 5,
    },
  ];
}
