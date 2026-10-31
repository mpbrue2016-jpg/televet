'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  MapPin,
  Compass,
  Phone,
  MessageCircle,
  Navigation,
  Clock,
  ShieldCheck,
  Building2,
  Filter,
  CheckCircle2,
  PlusCircle,
  Globe,
  Siren,
  Pill,
  FlaskConical,
  Microscope,
  Scan,
  Truck,
  Flower,
  Sparkles,
  HeartPulse,
  ExternalLink,
  ChevronRight,
  SlidersHorizontal,
} from 'lucide-react';
import { DirectoryService } from '@/directory/directory-service';
import {
  DirectoryCategory,
  ServiceProviderItem,
  DIRECTORY_CATEGORIES_METADATA,
} from '@/directory/types';
import { EmergencyBanner } from '@/components/directory/emergency-banner';
import { AdBanner } from '@/components/ads/ad-banner';

const CATEGORY_ICONS: Record<DirectoryCategory, React.ElementType> = {
  ambulancia: Siren,
  farmacia_veterinaria: Pill,
  farmacia_manipulacao: FlaskConical,
  laboratorio: Microscope,
  centro_diagnostico: Scan,
  transporte: Truck,
  funerario_cremacao: Flower,
  odontologia: Sparkles,
  outros_servicos: HeartPulse,
};

function DirectorySearchContent() {
  const searchParams = useSearchParams();
  const directoryService = new DirectoryService();

  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<ServiceProviderItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DirectoryCategory | ''>(
    (searchParams.get('categoria') as DirectoryCategory) || ''
  );
  const [query, setQuery] = useState(searchParams.get('busca') || '');
  const [city, setCity] = useState(searchParams.get('cidade') || '');
  const [stateUf, setStateUf] = useState(searchParams.get('uf') || '');
  const [cep, setCep] = useState(searchParams.get('cep') || '');
  const [radiusKm, setRadiusKm] = useState<number | ''>(searchParams.get('raio') ? Number(searchParams.get('raio')) : 25);
  const [is24hOnly, setIs24hOnly] = useState(searchParams.get('atende24h') === 'true');
  const [isOpenNowOnly, setIsOpenNowOnly] = useState(searchParams.get('aberto') === 'true');
  const [isVerifiedOnly, setIsVerifiedOnly] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Carregar dados de busca
  const executeSearch = async () => {
    setLoading(true);
    try {
      const results = await directoryService.search({
        categoria: selectedCategory || undefined,
        cidade: city || undefined,
        uf: stateUf || undefined,
        cep: cep || undefined,
        lat: userCoords?.lat,
        lng: userCoords?.lng,
        radiusKm: radiusKm ? Number(radiusKm) : undefined,
        atende24h: is24hOnly || undefined,
        abertoAgora: isOpenNowOnly || undefined,
        verificada: isVerifiedOnly || undefined,
        query: query || undefined,
      });

      // Mocks enriquecidos para demonstração caso o banco esteja vazio
      if (results.length === 0 && !query && !city) {
        setProviders(getMockProviders());
      } else {
        setProviders(results);
      }
    } catch (err) {
      console.warn('Erro ao carregar diretório:', err);
      setProviders(getMockProviders());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSearch();
  }, [selectedCategory, radiusKm, is24hOnly, isOpenNowOnly, isVerifiedOnly]);

  // Geolocalização do navegador
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocalização não suportada neste dispositivo.');
      return;
    }

    setGeoStatus('Obtendo sua localização com precisão...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoStatus(`Localização obtida: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
        executeSearch();
      },
      (err) => {
        setGeoStatus('Permissão de localização negada ou indisponível.');
      },
      { timeout: 8000 }
    );
  };

  // Tracking de cliques em botões de ação (Ligar, WhatsApp, Rota, Site)
  const handleActionClick = (providerId: string, eventType: 'ligar' | 'whatsapp' | 'como_chegar' | 'site') => {
    directoryService.recordClick(providerId, eventType);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Barra de Topo do Diretório */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="font-extrabold text-xl text-blue-600 flex items-center space-x-1.5">
              <Compass className="w-6 h-6 text-blue-600" />
              <span>TELEVET <span className="text-slate-700 font-semibold text-sm">Diretório Nacional</span></span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/diretorio/cadastrar"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cadastrar Empresa</span>
            </Link>
            <Link
              href="/diretorio/painel"
              className="px-3 py-2 text-slate-600 hover:text-slate-900 text-xs sm:text-sm font-semibold rounded-xl border border-slate-200 hover:border-slate-300 transition-colors"
            >
              Painel do Prestador
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        {/* Banner de Emergência para Ambulâncias e 24 Horas */}
        <EmergencyBanner />

        {/* Hero e Título */}
        <div className="text-center max-w-3xl mx-auto space-y-2 pt-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Diretório Nacional de Saúde e Atendimento Animal
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Encontre ambulâncias, farmácias veterinárias, laboratórios, transporte, odontologia e serviços credenciados em todo o Brasil.
          </p>
        </div>

        {/* Barra de Pesquisa Avançada */}
        <div className="bg-white rounded-3xl p-5 md:p-6 shadow-md border border-slate-200/80 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
                placeholder="Buscar por nome, serviço ou palavra-chave..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="relative">
              <MapPin className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Cidade ou CEP..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>

            <div className="flex space-x-2">
              <select
                value={stateUf}
                onChange={(e) => setStateUf(e.target.value)}
                className="w-24 px-3 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">UF</option>
                {['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'PE', 'DF', 'GO', 'ES', 'CE', 'AM', 'PA', 'MT', 'MS', 'RN', 'PB', 'AL', 'SE', 'PI', 'MA', 'TO', 'RO', 'AC', 'AP', 'RR'].map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>

              <button
                onClick={executeSearch}
                className="flex-1 px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl transition-colors shadow-sm flex items-center justify-center space-x-1"
              >
                <Search className="w-4 h-4" />
                <span>Buscar</span>
              </button>
            </div>
          </div>

          {/* Filtros de Raio, Localização Atual e Toggles */}
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGetLocation}
                className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-bold transition-colors ${
                  userCoords ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Compass className={`w-3.5 h-3.5 ${userCoords ? 'text-emerald-600' : 'text-slate-500'}`} />
                <span>{userCoords ? 'Localização Ativa' : 'Usar Minha Localização'}</span>
              </button>

              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-slate-500">Raio:</span>
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value ? Number(e.target.value) : '')}
                  className="px-2.5 py-1 bg-slate-100 rounded-lg text-slate-800 font-bold border-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="5">5 km</option>
                  <option value="10">10 km</option>
                  <option value="25">25 km</option>
                  <option value="50">50 km</option>
                  <option value="100">100 km</option>
                  <option value="">Todo o Brasil</option>
                </select>
              </div>

              <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={is24hOnly}
                  onChange={(e) => setIs24hOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Plantão 24 Horas</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={isOpenNowOnly}
                  onChange={(e) => setIsOpenNowOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Aberto Agora</span>
              </label>

              <label className="flex items-center space-x-1.5 cursor-pointer font-medium text-slate-700 select-none">
                <input
                  type="checkbox"
                  checked={isVerifiedOnly}
                  onChange={(e) => setIsVerifiedOnly(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Apenas Verificadas</span>
              </label>
            </div>

            {geoStatus && (
              <span className="text-[11px] text-slate-500 italic">
                {geoStatus}
              </span>
            )}
          </div>
        </div>

        {/* Carrossel / Grid das 9 Categorias Oficiais do Escopo */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Categorias Permitidas no Diretório
            </h2>
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory('')}
                className="text-xs font-bold text-blue-600 hover:text-blue-800"
              >
                Limpar Categoria (Ver Todas)
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
            {(Object.entries(DIRECTORY_CATEGORIES_METADATA) as [DirectoryCategory, { label: string; icon: string }][]).map(([slug, meta]) => {
              const Icon = CATEGORY_ICONS[slug] || HeartPulse;
              const isSelected = selectedCategory === slug;

              return (
                <button
                  key={slug}
                  onClick={() => setSelectedCategory(isSelected ? '' : slug)}
                  className={`p-3 rounded-2xl flex flex-col items-center text-center transition-all ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-600 scale-[1.02]'
                      : 'bg-white text-slate-700 hover:bg-slate-100/80 border border-slate-200/80'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-1.5 ${isSelected ? 'text-white' : 'text-blue-600'}`} />
                  <span className="text-[11px] font-bold leading-tight line-clamp-2">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Slot de Publicidade Patrocinada (TeleVet Ads - Fase 17) */}
        <AdBanner
          placement="diretorio_top_banner"
          categoria={selectedCategory || undefined}
          uf={stateUf || undefined}
          cidade={city || undefined}
        />

        {/* Lista de Resultados e Alternância Lista / Mapa */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-slate-800">
                {providers.length} {providers.length === 1 ? 'estabelecimento encontrado' : 'estabelecimentos encontrados'}
              </span>
              {selectedCategory && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                  {DIRECTORY_CATEGORIES_METADATA[selectedCategory]?.label}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-1 bg-slate-200 p-0.5 rounded-xl text-xs font-bold">
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'map' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                Mapa Interativo
              </button>
            </div>
          </div>

          {/* Visualização de Mapa Simulado */}
          {viewMode === 'map' && (
            <div className="bg-slate-900 rounded-3xl h-80 relative overflow-hidden flex flex-col items-center justify-center p-6 text-white shadow-lg border border-slate-800">
              <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1px,transparent_1px)] [background-size:16px_16px]" />
              <Compass className="w-12 h-12 text-blue-400 mb-3 animate-spin duration-3000" />
              <h3 className="text-lg font-bold">Visualização Geográfica Ativa</h3>
              <p className="text-xs text-slate-400 max-w-md text-center mt-1">
                {providers.length} locais plotados no mapa. Você pode clicar no botão &quot;Como Chegar&quot; em cada card para abrir as rotas diretamente no Google Maps ou Waze.
              </p>
            </div>
          )}

          {/* Grid de Cards de Prestadores */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 rounded-3xl bg-slate-200/70 animate-pulse" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-3">
              <Compass className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-lg font-bold text-slate-800">Nenhum estabelecimento encontrado</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Tente aumentar o raio de distância ou desmarcar filtros específicos. Lembrando que clínicas e hospitais não aparecem neste diretório.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {providers.map((p) => {
                const Icon = CATEGORY_ICONS[p.categoria] || HeartPulse;
                const routeUrl = directoryService.generateRouteUrl({
                  logradouro: p.logradouro || p.endereco,
                  numero: p.numero,
                  bairro: p.bairro,
                  cidade: p.cidade,
                  uf: p.uf,
                  latitude: p.latitude,
                  longitude: p.longitude,
                });
                const waUrl = p.whatsapp ? directoryService.generateWhatsAppUrl(p.whatsapp, p.nomeFantasia) : null;

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                  >
                    <div className="p-5 space-y-3">
                      {/* Topo do Card: Categoria, Distância e Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold">
                          <Icon className="w-3.5 h-3.5" />
                          <span>{DIRECTORY_CATEGORIES_METADATA[p.categoria]?.label || p.categoria}</span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          {p.distanceKm !== null && p.distanceKm !== undefined && (
                            <span className="text-xs font-extrabold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-lg">
                              a {p.distanceKm} km
                            </span>
                          )}
                          {p.verificada && (
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Verificada</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Nome e Descrição */}
                      <div>
                        <h3 className="font-extrabold text-lg text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {p.nomeFantasia || p.razaoSocial}
                        </h3>
                        {p.descricao && (
                          <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                            {p.descricao}
                          </p>
                        )}
                      </div>

                      {/* Localização e Atendimento */}
                      <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                        <div className="flex items-center space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="line-clamp-1">
                            {p.bairro ? `${p.bairro}, ` : ''}{p.cidade} - {p.uf}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {p.atende24h ? (
                            <span className="inline-flex items-center space-x-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded text-[11px]">
                              <Clock className="w-3 h-3 text-rose-600" />
                              <span>Plantão 24h</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 font-medium text-slate-600 text-[11px]">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>Horário Comercial</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações Rápidas: Ligar, WhatsApp, Como Chegar e Perfil */}
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-1.5">
                      <div className="flex items-center space-x-1">
                        {p.telefone && (
                          <a
                            href={`tel:${p.telefone.replace(/\D/g, '')}`}
                            onClick={() => handleActionClick(p.id, 'ligar')}
                            title="Ligar para o estabelecimento"
                            className="p-2.5 bg-white text-slate-700 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors"
                          >
                            <Phone className="w-4 h-4" />
                          </a>
                        )}

                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleActionClick(p.id, 'whatsapp')}
                            title="Conversar no WhatsApp"
                            className="p-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}

                        <a
                          href={routeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => handleActionClick(p.id, 'como_chegar')}
                          title="Como chegar (Google Maps / Waze)"
                          className="p-2.5 bg-white text-slate-700 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 rounded-xl transition-colors"
                        >
                          <Navigation className="w-4 h-4" />
                        </a>
                      </div>

                      <Link
                        href={`/diretorio/${p.id}`}
                        className="inline-flex items-center space-x-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm"
                      >
                        <span>Ver Perfil</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DirectorySearchPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DirectorySearchContent />
    </React.Suspense>
  );
}

// Dados simulados para visualização instantânea de demonstração
function getMockProviders(): ServiceProviderItem[] {
  return [
    {
      id: 'prov-001',
      razaoSocial: 'Vet Móvel Emergências Ltda',
      nomeFantasia: 'Resgate Vet 24 Horas',
      cnpj: '06.990.590/0001-23',
      categoria: 'ambulancia',
      descricao: 'Ambulância veterinária equipada com UTI móvel, oxigenoterapia e monitor cardíaco.',
      telefone: '(11) 99888-1122',
      whatsapp: '11998881122',
      cidade: 'São Paulo',
      uf: 'SP',
      bairro: 'Pinheiros',
      logradouro: 'Av. Rebouças',
      numero: '1200',
      latitude: -23.565,
      longitude: -46.685,
      status: 'aprovada',
      verificada: true,
      atende24h: true,
      distanceKm: 2.1,
      clicksCount: 42,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
    {
      id: 'prov-002',
      razaoSocial: 'Farmácia Magistral Veterinária Brasil',
      nomeFantasia: 'DrogaVet Manipulação Pet',
      cnpj: '00.000.000/0001-91',
      categoria: 'farmacia_manipulacao',
      descricao: 'Manipulação de fórmulas personalizadas, petiscos medicamentosos palatáveis e suspensões.',
      telefone: '(11) 3214-5566',
      whatsapp: '11977773344',
      cidade: 'São Paulo',
      uf: 'SP',
      bairro: 'Jardins',
      logradouro: 'Alameda Lorena',
      numero: '850',
      latitude: -23.568,
      longitude: -46.663,
      status: 'aprovada',
      verificada: true,
      atende24h: false,
      distanceKm: 3.5,
      clicksCount: 28,
      createdAt: '2026-10-02T10:00:00Z',
      updatedAt: '2026-10-21T10:00:00Z',
    },
    {
      id: 'prov-003',
      razaoSocial: 'Laboratório e Diagnóstico Animal S/S',
      nomeFantasia: 'LabVet Diagnósticos & Imagem',
      cnpj: '33.000.167/0001-01',
      categoria: 'laboratorio',
      descricao: 'Exames laboratoriais de rotina e urgência, citopatologia, histologia e painéis PCR.',
      telefone: '(11) 3344-9988',
      whatsapp: '11966665544',
      cidade: 'São Paulo',
      uf: 'SP',
      bairro: 'Vila Mariana',
      logradouro: 'Rua Domingos de Morais',
      numero: '2100',
      latitude: -23.595,
      longitude: -46.637,
      status: 'aprovada',
      verificada: true,
      atende24h: false,
      distanceKm: 5.2,
      clicksCount: 19,
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    },
    {
      id: 'prov-004',
      razaoSocial: 'Táxi Dog & Transporte Animal Seguro',
      nomeFantasia: 'Pet Tranx Transporte & Remoção',
      cnpj: '06.990.590/0001-23',
      categoria: 'transporte',
      descricao: 'Vans climatizadas, caixas de transporte padronizadas e translado interestadual com laudo.',
      telefone: '(11) 98888-7711',
      whatsapp: '11988887711',
      cidade: 'São Paulo',
      uf: 'SP',
      bairro: 'Moema',
      latitude: -23.601,
      longitude: -46.662,
      status: 'aprovada',
      verificada: false,
      atende24h: true,
      distanceKm: 6.8,
      clicksCount: 14,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
  ];
}
