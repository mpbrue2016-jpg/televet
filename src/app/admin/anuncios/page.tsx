'use client';

import React, { useState, useEffect } from 'react';
import {
  Megaphone,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  AlertTriangle,
  Layers,
  Settings,
  Users,
  BarChart3,
  Edit2,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { AdService } from '@/ads/ad-service';
import { AdCampaign, AdPlan, Advertiser } from '@/ads/types';

export default function AdminAdsPage() {
  const adService = new AdService();

  const [activeTab, setActiveTab] = useState<'aprovacao' | 'planos' | 'anunciantes' | 'metricas'>('aprovacao');
  const [loading, setLoading] = useState(false);

  // Aba 1: Fila de Campanhas
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [statusFilter, setStatusFilter] = useState('aguardando_aprovacao');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState<AdCampaign | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  // Aba 2: Planos de Publicidade
  const [plans, setPlans] = useState<AdPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<AdPlan | null>(null);
  const [planPriceReais, setPlanPriceReais] = useState('');
  const [planMaxCampaigns, setPlanMaxCampaigns] = useState('');

  // Aba 3: Anunciantes
  const [advertisers, setAdvertisers] = useState<Advertiser[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'aprovacao') {
        const data = await adService.getCampaigns('adv-mock-1');
        if (data.length === 0) {
          setCampaigns(getMockAdminCampaigns());
        } else {
          setCampaigns(data);
        }
      } else if (activeTab === 'planos') {
        const data = await adService.getPlans();
        if (data.length === 0) {
          setPlans(getMockPlans());
        } else {
          setPlans(data);
        }
      } else if (activeTab === 'anunciantes') {
        setAdvertisers(getMockAdvertisers());
      }
    } catch {
      if (activeTab === 'aprovacao') setCampaigns(getMockAdminCampaigns());
      if (activeTab === 'planos') setPlans(getMockPlans());
      if (activeTab === 'anunciantes') setAdvertisers(getMockAdvertisers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Ações de Moderação
  const handleApprove = async (id: string) => {
    try {
      await adService.moderateCampaign(id, 'aprovar');
      alert('Campanha aprovada com sucesso! Agora está ativa para veiculação.');
      loadData();
    } catch (err: any) {
      alert(`Erro ao aprovar: ${err.message}`);
    }
  };

  const handleOpenReject = (campaign: AdCampaign) => {
    setSelectedCampaign(campaign);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedCampaign || !rejectionReason.trim()) {
      alert('Informe o motivo da rejeição.');
      return;
    }
    try {
      await adService.moderateCampaign(selectedCampaign.id, 'rejeitar', rejectionReason);
      setShowRejectModal(false);
      alert('Campanha rejeitada com justificativa registrada em auditoria.');
      loadData();
    } catch (err: any) {
      alert(`Erro ao rejeitar: ${err.message}`);
    }
  };

  const handleTogglePause = async (id: string, currentStatus: string) => {
    const action = currentStatus === 'pausado' ? 'ativar' : 'pausar';
    try {
      await adService.moderateCampaign(id, action);
      loadData();
    } catch (err: any) {
      alert(`Erro na ação: ${err.message}`);
    }
  };

  // Edição de Preços dos Planos
  const handleOpenEditPlan = (plan: AdPlan) => {
    setEditingPlan(plan);
    setPlanPriceReais((plan.priceCents / 100).toFixed(2));
    setPlanMaxCampaigns(String(plan.maxActiveCampaigns));
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    try {
      const priceCents = Math.round(parseFloat(planPriceReais) * 100);
      const maxActive = parseInt(planMaxCampaigns, 10);

      await adService.savePlan({
        ...editingPlan,
        priceCents,
        maxActiveCampaigns: maxActive,
      });

      setEditingPlan(null);
      alert(`Plano "${editingPlan.name}" atualizado com sucesso no banco!`);
      loadData();
    } catch (err: any) {
      alert(`Erro ao salvar plano: ${err.message}`);
    }
  };

  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
    if (searchQuery) {
      return c.name.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center space-x-2">
            <Megaphone className="w-7 h-7 text-blue-600" />
            <span>TeleVet Ads • Governança & Moderação</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Fila de aprovação de campanhas publicitárias, controle de planos e preços dinâmicos, anunciantes e relatórios.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Abas Superiores */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-xs sm:text-sm font-bold">
        <button
          onClick={() => setActiveTab('aprovacao')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'aprovacao'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          1. Fila de Moderação ({campaigns.filter((c) => c.status === 'aguardando_aprovacao').length})
        </button>

        <button
          onClick={() => setActiveTab('planos')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'planos'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          2. Planos & Preços (Banco)
        </button>

        <button
          onClick={() => setActiveTab('anunciantes')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'anunciantes'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          3. Anunciantes Cadastrados
        </button>

        <button
          onClick={() => setActiveTab('metricas')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'metricas'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          4. Métricas & Faturamento
        </button>
      </div>

      {/* ABA 1: FILA DE APROVAÇÃO */}
      {activeTab === 'aprovacao' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar campanha por nome..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos os Status</option>
                <option value="aguardando_aprovacao">Aguardando Aprovação</option>
                <option value="ativo">Ativas</option>
                <option value="pausado">Pausadas</option>
                <option value="rejeitado">Rejeitadas</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Nome da Campanha</th>
                    <th className="px-5 py-3.5">Tipo & Escopo</th>
                    <th className="px-5 py-3.5">Orçamento</th>
                    <th className="px-5 py-3.5">Gasto</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5 text-right">Ações de Moderação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCampaigns.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400 font-medium">
                        Nenhuma campanha na fila de moderação com o filtro atual.
                      </td>
                    </tr>
                  ) : (
                    filteredCampaigns.map((camp) => (
                      <tr key={camp.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <strong className="block text-slate-900 font-bold">{camp.name}</strong>
                          <span className="text-[11px] text-slate-500 block">
                            Início: {new Date(camp.startsAt).toLocaleDateString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-slate-800 block capitalize">{camp.campaignType.replace('_', ' ')}</span>
                          <span className="text-[11px] text-slate-500 uppercase">{camp.scope}</span>
                        </td>
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          R$ {(camp.budgetCents / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 font-bold text-blue-600">
                          R$ {(camp.spentCents / 100).toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5">
                          {camp.status === 'ativo' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Ativa
                            </span>
                          )}
                          {camp.status === 'aguardando_aprovacao' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800">
                              Aguardando
                            </span>
                          )}
                          {camp.status === 'pausado' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-200 text-slate-700">
                              Pausada
                            </span>
                          )}
                          {camp.status === 'rejeitado' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800">
                              Rejeitada
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {camp.status === 'aguardando_aprovacao' && (
                            <>
                              <button
                                onClick={() => handleApprove(camp.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                              >
                                Aprovar
                              </button>
                              <button
                                onClick={() => handleOpenReject(camp)}
                                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                              >
                                Rejeitar
                              </button>
                            </>
                          )}

                          {camp.status === 'ativo' && (
                            <button
                              onClick={() => handleTogglePause(camp.id, camp.status)}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Pausar
                            </button>
                          )}

                          {camp.status === 'pausado' && (
                            <button
                              onClick={() => handleTogglePause(camp.id, camp.status)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Ativar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: GESTÃO DE PLANOS & PREÇOS (EDITÁVEL NO BANCO) */}
      {activeTab === 'planos' && (
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              <strong>Preços e Limites Dinâmicos:</strong> Todos os preços e capacidades abaixo são configurados no banco de dados (`ad_plans`) e consumidos em tempo real pelo portal de anunciantes.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {plans.map((p) => (
              <div key={p.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-slate-400 font-bold uppercase">{p.slug}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Ativo
                    </span>
                  </div>

                  <h3 className="font-extrabold text-base text-slate-900">{p.name}</h3>
                  <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>

                  <div className="pt-2">
                    <span className="text-2xl font-extrabold text-slate-900">
                      R$ {(p.priceCents / 100).toFixed(2)}
                    </span>
                    <span className="text-xs text-slate-400 block">/mês</span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 text-xs space-y-1 text-slate-600">
                    <p>Campanhas: <strong>{p.maxActiveCampaigns}</strong></p>
                    <p>Impressões: <strong>{p.maxImpressionsMonthly ? p.maxImpressionsMonthly.toLocaleString('pt-BR') : 'Ilimitado'}</strong></p>
                  </div>
                </div>

                <button
                  onClick={() => handleOpenEditPlan(p)}
                  className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar Preço / Limites</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 3: ANUNCIANTES CADASTRADOS */}
      {activeTab === 'anunciantes' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
            Empresas e Anunciantes Cadastrados
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-5 py-3">Empresa / Razão Social</th>
                <th className="px-5 py-3">CNPJ</th>
                <th className="px-5 py-3">Contato</th>
                <th className="px-5 py-3">Saldo</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {advertisers.map((adv) => (
                <tr key={adv.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5">
                    <strong className="block text-slate-900 font-bold">{adv.nomeFantasia}</strong>
                    <span className="text-slate-500 text-[11px]">{adv.razaoSocial}</span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{adv.cnpj || '—'}</td>
                  <td className="px-5 py-3.5 text-slate-700">
                    <span className="block font-semibold">{adv.contactName}</span>
                    <span className="text-[11px] text-slate-500">{adv.contactEmail}</span>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-emerald-600">
                    R$ {(adv.balanceCents / 100).toFixed(2)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {adv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => alert(`Ações administrativas da conta ${adv.nomeFantasia}`)}
                      className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs"
                    >
                      Gerenciar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ABA 4: MÉTRICAS & FATURAMENTO */}
      {activeTab === 'metricas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Faturamento Total Ads</span>
              <span className="text-2xl font-extrabold text-emerald-600">R$ 14.850,00</span>
              <span className="text-[11px] text-slate-500 block">Planos contratados e CPC</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Impressões Servidas</span>
              <span className="text-2xl font-extrabold text-blue-600">184.200</span>
              <span className="text-[11px] text-slate-500 block">Exibições seguras sem PII</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Cliques Únicos (Anti-Fraude)</span>
              <span className="text-2xl font-extrabold text-purple-600">5.640</span>
              <span className="text-[11px] text-slate-500 block">Deduplicação de 60s ativa</span>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-1">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">CTR Médio da Rede</span>
              <span className="text-2xl font-extrabold text-slate-900">3.06%</span>
              <span className="text-[11px] text-slate-500 block">Dentro do padrão do setor</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Rejeição de Campanha com Motivo Obrigatório */}
      {showRejectModal && selectedCampaign && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>Rejeitar Campanha Publicitária</span>
            </h3>
            <p className="text-xs text-slate-600">
              Campanha: <strong>{selectedCampaign.name}</strong>
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Motivo Formal da Rejeição (Auditado):</label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Imagem com resolução inadequada, promessa de cura sem embasamento ou violação de diretrizes éticas..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Confirmar Rejeição
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Plano */}
      {editingPlan && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSavePlan} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Editar Preço e Limites: {editingPlan.name}
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Preço Mensal (R$) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={planPriceReais}
                onChange={(e) => setPlanPriceReais(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Máximo de Campanhas Ativas *</label>
              <input
                type="number"
                required
                value={planMaxCampaigns}
                onChange={(e) => setPlanMaxCampaigns(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Salvar Alterações no Banco
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function getMockAdminCampaigns(): AdCampaign[] {
  return [
    {
      id: 'camp-admin-1',
      advertiserId: 'adv-mock-1',
      name: 'DrogaVet - Lançamento Pasta Palatável Antibiótica',
      campaignType: 'banner',
      scope: 'estado',
      targetUfs: ['SP'],
      targetCities: ['São Paulo'],
      targetNeighborhoods: [],
      targetCategories: ['farmacia_manipulacao'],
      targetContext: 'diretorio',
      startsAt: '2026-10-20T00:00:00Z',
      budgetCents: 150000,
      dailyBudgetCents: 5000,
      spentCents: 0,
      status: 'aguardando_aprovacao',
      paymentStatus: 'paid',
      createdAt: '2026-10-23T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'camp-admin-2',
      advertiserId: 'adv-mock-2',
      name: 'Resgate Vet - Plantão de Ambulâncias 24 Horas',
      campaignType: 'destaque_busca',
      scope: 'regional',
      targetUfs: ['SP'],
      targetCities: ['São Paulo', 'Guarulhos'],
      targetNeighborhoods: [],
      targetCategories: ['ambulancia'],
      targetContext: 'busca',
      startsAt: '2026-10-10T00:00:00Z',
      budgetCents: 80000,
      dailyBudgetCents: 3000,
      spentCents: 24500,
      status: 'ativo',
      paymentStatus: 'paid',
      createdAt: '2026-10-10T00:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
  ];
}

function getMockPlans(): AdPlan[] {
  return [
    { id: '1', slug: 'basico', name: 'Plano Básico', priceCents: 9900, billingCycle: 'monthly', maxActiveCampaigns: 1, allowedScopes: ['cidade'], features: {}, isActive: true, displayOrder: 1 },
    { id: '2', slug: 'regional', name: 'Plano Regional', priceCents: 24900, billingCycle: 'monthly', maxActiveCampaigns: 3, allowedScopes: ['bairro', 'cidade', 'regiao'], features: {}, isActive: true, displayOrder: 2 },
    { id: '3', slug: 'estadual', name: 'Plano Estadual', priceCents: 59000, billingCycle: 'monthly', maxActiveCampaigns: 5, allowedScopes: ['bairro', 'cidade', 'regiao', 'estado'], features: {}, isActive: true, displayOrder: 3 },
    { id: '4', slug: 'nacional', name: 'Plano Nacional', priceCents: 149000, billingCycle: 'monthly', maxActiveCampaigns: 10, allowedScopes: ['nacional'], features: {}, isActive: true, displayOrder: 4 },
    { id: '5', slug: 'premium', name: 'Plano Premium', priceCents: 299000, billingCycle: 'monthly', maxActiveCampaigns: 25, allowedScopes: ['nacional'], features: {}, isActive: true, displayOrder: 5 },
  ];
}

function getMockAdvertisers(): Advertiser[] {
  return [
    {
      id: 'adv-mock-1',
      razaoSocial: 'DrogaVet Manipulação Veterinária Ltda',
      nomeFantasia: 'DrogaVet Farmácia Pet',
      cnpj: '00.000.000/0001-91',
      contactName: 'Mariana Souza',
      contactEmail: 'marketing@drogavet.com.br',
      contactPhone: '(11) 3214-5566',
      balanceCents: 45000,
      status: 'active',
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'adv-mock-2',
      razaoSocial: 'Resgate Móvel Veterinário S/A',
      nomeFantasia: 'Resgate Vet 24h',
      cnpj: '06.990.590/0001-23',
      contactName: 'Carlos Silveira',
      contactEmail: 'contato@resgatevet.com.br',
      contactPhone: '(11) 99888-1122',
      balanceCents: 120000,
      status: 'active',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
  ];
}
