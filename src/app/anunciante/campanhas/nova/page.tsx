'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Megaphone,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Calendar,
  DollarSign,
  MapPin,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
} from 'lucide-react';
import { AdService } from '@/ads/ad-service';
import { DIRECTORY_CATEGORIES_METADATA } from '@/directory/types';

export default function CreateCampaignPage() {
  const router = useRouter();
  const adService = new AdService();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dados da Campanha
  const [name, setName] = useState('');
  const [campaignType, setCampaignType] = useState('banner');
  const [scope, setScope] = useState('regional');
  const [targetUf, setTargetUf] = useState('SP');
  const [targetCities, setTargetCities] = useState('São Paulo, Campinas');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['farmacia_veterinaria']);
  const [targetContext, setTargetContext] = useState('diretorio');
  const [startsAt, setStartsAt] = useState(new Date().toISOString().split('T')[0]);
  const [endsAt, setEndsAt] = useState('');
  const [budgetReais, setBudgetReais] = useState('500');
  const [dailyBudgetReais, setDailyBudgetReais] = useState('50');

  // Criativo
  const [creativeTitle, setCreativeTitle] = useState('');
  const [creativeDesc, setCreativeDesc] = useState('');
  const [creativeImageUrl, setCreativeImageUrl] = useState('');
  const [creativeTargetUrl, setCreativeTargetUrl] = useState('');
  const [creativeCta, setCreativeCta] = useState('Conhecer Agora');
  const [creativePhone, setCreativePhone] = useState('');
  const [creativeWhatsapp, setCreativeWhatsapp] = useState('');
  const [creativeFormat, setCreativeFormat] = useState('banner_horizontal');

  const toggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const budgetCents = Math.round(parseFloat(budgetReais || '0') * 100);
      const dailyBudgetCents = Math.round(parseFloat(dailyBudgetReais || '0') * 100);

      // Validação preventiva de termos clínicos
      AdService.assertZeroClinicalDataUsage({
        name,
        creativeTitle,
        creativeDesc,
        selectedCategories,
      });

      // 1. Salva a campanha com status aguardando_aprovacao
      const campResult = await adService.saveCampaign({
        advertiserId: 'adv-mock-1', // Mock ou usuário logado
        name,
        campaignType,
        scope,
        targetUfs: targetUf ? [targetUf] : [],
        targetCities: targetCities.split(',').map((c) => c.trim()).filter(Boolean),
        targetCategories: selectedCategories,
        targetContext,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        budgetCents,
        dailyBudgetCents,
        status: 'aguardando_aprovacao',
      });

      // 2. Salva o criativo associado
      await adService.saveCreative({
        campaignId: campResult.id,
        format: creativeFormat,
        title: creativeTitle,
        description: creativeDesc,
        imageUrl: creativeImageUrl || 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=600&q=80',
        targetUrl: creativeTargetUrl || 'https://seusite.com.br',
        callToAction: creativeCta,
        phone: creativePhone,
        whatsapp: creativeWhatsapp,
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao submeter campanha.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-xl border border-slate-200 text-center space-y-4">
          <CheckCircle2 className="w-16 h-16 text-emerald-600 mx-auto" />
          <h1 className="text-2xl font-extrabold text-slate-900">
            Campanha Enviada para Aprovação!
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sua campanha publicitária foi registrada e encaminhada para a <strong>fila de moderação do TeleVet Ads</strong>.
            Assim que aprovada pela equipe de auditoria, começará a ser veiculada nos slots patrocinados.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/anunciante"
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
            >
              Voltar ao Meu Painel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/anunciante"
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Voltar ao Painel</span>
          </Link>
          <span className="text-xs font-extrabold text-blue-600 uppercase tracking-wider">
            Nova Campanha • TeleVet Ads
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <h1 className="text-3xl font-extrabold text-slate-900">
            Criar Campanha Publicitária
          </h1>
          <p className="text-sm text-slate-600">
            Configure segmentação ética por região e categorias de serviço, definindo orçamento e criativos com selo de transparência garantido.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Alerta de Privacidade Regulatória */}
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <strong className="block font-bold">Privacidade Absoluta e Ética Regulatória:</strong>
            <span>
              O TeleVet Ads opera com limites rígidos: a segmentação é restrita a localização geográfica e categorias gerais de serviços. É categoricamente proibido e monitorado por código o uso de histórico clínico, raças, vacinas, diagnósticos ou dados pessoais de tutores.
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-8">
          {/* 1. Informações Básicas da Campanha */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>1. Definição da Campanha</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Campanha *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Campanha Estadual SP - Lançamento Medicamento"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Anúncio *</label>
                <select
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="banner">Banner Rotativo</option>
                  <option value="destaque_busca">Destaque no Topo da Busca</option>
                  <option value="destaque_regional">Destaque Regional + Mapa</option>
                  <option value="estadual">Campanha Estadual Ampla</option>
                  <option value="nacional">Campanha Nacional Brasil</option>
                  <option value="pagina_patrocinada">Página Patrocinada no Diretório</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Escopo Geográfico *</label>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="bairro">Bairro Específico</option>
                  <option value="cidade">Cidade</option>
                  <option value="regional">Regional (Cidades Vizinhas)</option>
                  <option value="estado">Estadual (UF Inteira)</option>
                  <option value="conjunto_estados">Conjunto de Estados</option>
                  <option value="nacional">Nacional (Todo o Brasil)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. Segmentação Permitida (Região e Categoria) */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span>2. Segmentação Permitida (Região & Categorias do Diretório)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">UF Alvo</label>
                <select
                  value={targetUf}
                  onChange={(e) => setTargetUf(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'PE', 'DF', 'GO', 'ES', 'CE', 'AM', 'PA'].map((uf) => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cidades Alvo (separadas por vírgula)</label>
                <input
                  type="text"
                  value={targetCities}
                  onChange={(e) => setTargetCities(e.target.value)}
                  placeholder="São Paulo, Campinas, Santos"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                Segmentar por Categorias do Diretório (Opcional):
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(DIRECTORY_CATEGORIES_METADATA).map(([slug, meta]) => {
                  const isChecked = selectedCategories.includes(slug);
                  return (
                    <button
                      type="button"
                      key={slug}
                      onClick={() => toggleCategory(slug)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isChecked
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 3. Orçamento e Período */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <span>3. Orçamento & Período de Veiculação</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Orçamento Total (R$) *</label>
                <input
                  type="number"
                  required
                  value={budgetReais}
                  onChange={(e) => setBudgetReais(e.target.value)}
                  placeholder="500,00"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Limite Diário (R$)</label>
                <input
                  type="number"
                  value={dailyBudgetReais}
                  onChange={(e) => setDailyBudgetReais(e.target.value)}
                  placeholder="50,00"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data Início *</label>
                <input
                  type="date"
                  required
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Data Fim (Opcional)</label>
                <input
                  type="date"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 4. Criativo da Publicidade */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              <span>4. Conteúdo do Anúncio (Criativo)</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Título do Anúncio *</label>
                <input
                  type="text"
                  required
                  value={creativeTitle}
                  onChange={(e) => setCreativeTitle(e.target.value)}
                  placeholder="Ex: Fórmulas Veterinárias Sob Medida com Sabor Carne e Frango"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Texto Descritivo do Anúncio</label>
                <textarea
                  rows={2}
                  value={creativeDesc}
                  onChange={(e) => setCreativeDesc(e.target.value)}
                  placeholder="Destaque seus diferenciais técnicos, prazos de entrega e certificações..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL da Imagem / Banner (Bucket ad-assets) *</label>
                <input
                  type="url"
                  required
                  value={creativeImageUrl}
                  onChange={(e) => setCreativeImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL de Destino ao Clicar *</label>
                <input
                  type="url"
                  required
                  value={creativeTargetUrl}
                  onChange={(e) => setCreativeTargetUrl(e.target.value)}
                  placeholder="https://suaempresa.com.br/promocao"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Texto do Botão de Ação (CTA)</label>
                <input
                  type="text"
                  value={creativeCta}
                  onChange={(e) => setCreativeCta(e.target.value)}
                  placeholder="Saiba Mais"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp para Contato Direto (Opcional)</label>
                <input
                  type="text"
                  value={creativeWhatsapp}
                  onChange={(e) => setCreativeWhatsapp(e.target.value)}
                  placeholder="(11) 99888-7766"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500 italic">
              Todo criativo exibirá compulsoriamente a identificação visual &quot;PATROCINADO&quot; ou &quot;ANÚNCIO&quot;.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <Link
              href="/anunciante"
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors"
            >
              Cancelar
            </Link>

            <button
              type="submit"
              disabled={loading}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl transition-all shadow-md flex items-center space-x-2"
            >
              <span>{loading ? 'Submetendo...' : 'Submeter Campanha para Aprovação'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
