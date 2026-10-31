'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Compass,
  MapPin,
  Phone,
  MessageCircle,
  Navigation,
  Globe,
  Clock,
  ShieldCheck,
  ChevronLeft,
  AlertTriangle,
  Send,
  CheckCircle2,
  Calendar,
  Share2,
  HeartPulse,
  ExternalLink,
} from 'lucide-react';
import { DirectoryService } from '@/directory/directory-service';
import {
  ServiceProviderItem,
  ProviderPhotoItem,
  ProviderRegionItem,
  DIRECTORY_CATEGORIES_METADATA,
} from '@/directory/types';

export default function ProviderDetailsPage() {
  const params = useParams();
  const providerId = params.id as string;
  const directoryService = new DirectoryService();

  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState<ServiceProviderItem | null>(null);
  const [photos, setPhotos] = useState<ProviderPhotoItem[]>([]);
  const [regions, setRegions] = useState<ProviderRegionItem[]>([]);

  // Modal de denúncia de informação incorreta
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<'telefone_invalido' | 'endereco_incorreto' | 'fechado_permanentemente' | 'categoria_inadequada' | 'outro'>('telefone_invalido');
  const [reportDetails, setReportDetails] = useState('');
  const [reportContact, setReportContact] = useState('');
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const data = await directoryService.getProviderById(providerId);
        if (data) {
          setProvider(data.provider);
          setPhotos(data.photos);
          setRegions(data.regions);
        } else {
          // Fallback mock caso esteja navegando pelos mocks
          setProvider(getMockProviderById(providerId));
        }
      } catch (err) {
        console.warn('Erro ao carregar detalhes do prestador:', err);
        setProvider(getMockProviderById(providerId));
      } finally {
        setLoading(false);
      }
    }

    if (providerId) {
      loadData();
    }
  }, [providerId]);

  const handleActionClick = (eventType: 'ligar' | 'whatsapp' | 'como_chegar' | 'site') => {
    if (provider?.id) {
      directoryService.recordClick(provider.id, eventType);
    }
  };

  const handleSendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportDetails.trim() || !provider?.id) return;

    setReportSubmitting(true);
    try {
      await directoryService.reportIssue(provider.id, reportType, reportDetails, reportContact);
      setReportSuccess(true);
    } catch (err: any) {
      alert(`Falha ao registrar denúncia: ${err.message}`);
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <Compass className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">Carregando informações do prestador...</p>
        </div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Compass className="w-12 h-12 text-slate-400" />
        <h1 className="text-2xl font-bold text-slate-800">Prestador não encontrado</h1>
        <p className="text-sm text-slate-500 max-w-md">
          O estabelecimento solicitado não existe ou ainda não foi aprovado pela moderação TELEVET.
        </p>
        <Link
          href="/diretorio"
          className="px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors"
        >
          Voltar ao Diretório
        </Link>
      </div>
    );
  }

  const categoryMeta = DIRECTORY_CATEGORIES_METADATA[provider.categoria];
  const routeUrl = directoryService.generateRouteUrl({
    logradouro: provider.logradouro || provider.endereco,
    numero: provider.numero,
    bairro: provider.bairro,
    cidade: provider.cidade,
    uf: provider.uf,
    latitude: provider.latitude,
    longitude: provider.longitude,
  });
  const waUrl = provider.whatsapp
    ? directoryService.generateWhatsAppUrl(provider.whatsapp, provider.nomeFantasia)
    : null;

  // JSON-LD Dados Estruturados Schema.org para SEO
  const jsonLdData = {
    '@context': 'https://schema.org',
    '@type': provider.categoria === 'ambulancia' ? 'EmergencyService' : 'LocalBusiness',
    name: provider.nomeFantasia || provider.razaoSocial,
    legalName: provider.razaoSocial,
    description: provider.descricao,
    telephone: provider.telefone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${provider.logradouro || ''} ${provider.numero || ''}`.trim(),
      addressLocality: provider.cidade,
      addressRegion: provider.uf,
      postalCode: provider.cep,
      addressCountry: 'BR',
    },
    geo: provider.latitude && provider.longitude ? {
      '@type': 'GeoCoordinates',
      latitude: provider.latitude,
      longitude: provider.longitude,
    } : undefined,
    url: provider.site,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Script JSON-LD Schema.org injetado no DOM */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdData) }}
      />

      {/* Header com Navegação */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href="/diretorio"
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-slate-600 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Voltar à Busca</span>
          </Link>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: provider.nomeFantasia,
                  text: `Confira ${provider.nomeFantasia} no Diretório TELEVET`,
                  url: window.location.href,
                }).catch(() => {});
              } else {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copiado para a área de transferência!');
              }
            }}
            className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
            title="Compartilhar"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Card Principal de Apresentação */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-slate-200 space-y-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold">
                  {categoryMeta?.label || provider.categoria}
                </span>

                {provider.verificada && (
                  <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Empresa Verificada & Credenciada</span>
                  </span>
                )}

                {provider.atende24h && (
                  <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                    <Clock className="w-3.5 h-3.5 text-rose-600" />
                    <span>Plantão 24 Horas</span>
                  </span>
                )}
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  {provider.nomeFantasia || provider.razaoSocial}
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Razão Social: {provider.razaoSocial} {provider.cnpj && `• CNPJ: ${provider.cnpj}`}
                </p>
              </div>

              {provider.descricao && (
                <p className="text-sm text-slate-600 leading-relaxed max-w-3xl">
                  {provider.descricao}
                </p>
              )}
            </div>

            {/* Logotipo se houver */}
            {provider.logotipo && (
              <div className="w-24 h-24 rounded-2xl border border-slate-200 p-2 shrink-0 bg-slate-50 flex items-center justify-center">
                <img src={provider.logotipo} alt="Logo" className="max-w-full max-h-full object-contain rounded-xl" />
              </div>
            )}
          </div>

          {/* Botões de Ação com Registro de Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {provider.telefone ? (
              <a
                href={`tel:${provider.telefone.replace(/\D/g, '')}`}
                onClick={() => handleActionClick('ligar')}
                className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-2xl shadow-sm transition-all transform hover:-translate-y-0.5"
              >
                <Phone className="w-4 h-4" />
                <span>Ligar Agora</span>
              </a>
            ) : (
              <button disabled className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-slate-100 text-slate-400 font-bold text-sm rounded-2xl cursor-not-allowed">
                <Phone className="w-4 h-4" />
                <span>Sem Telefone</span>
              </button>
            )}

            {waUrl ? (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleActionClick('whatsapp')}
                className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-2xl shadow-sm transition-all transform hover:-translate-y-0.5"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </a>
            ) : (
              <button disabled className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-slate-100 text-slate-400 font-bold text-sm rounded-2xl cursor-not-allowed">
                <MessageCircle className="w-4 h-4" />
                <span>Sem WhatsApp</span>
              </button>
            )}

            <a
              href={routeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleActionClick('como_chegar')}
              className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-sm rounded-2xl shadow-sm transition-all transform hover:-translate-y-0.5"
            >
              <Navigation className="w-4 h-4" />
              <span>Como Chegar</span>
            </a>

            {provider.site ? (
              <a
                href={provider.site.startsWith('http') ? provider.site : `https://${provider.site}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleActionClick('site')}
                className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-sm rounded-2xl shadow-sm transition-all"
              >
                <Globe className="w-4 h-4 text-slate-600" />
                <span>Visitar Site</span>
              </a>
            ) : (
              <button disabled className="flex items-center justify-center space-x-2 px-4 py-3.5 bg-slate-100 text-slate-400 font-bold text-sm rounded-2xl cursor-not-allowed">
                <Globe className="w-4 h-4" />
                <span>Sem Site</span>
              </button>
            )}
          </div>
        </div>

        {/* Grade Informativa: Endereço & Horários de Funcionamento */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card de Localização */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span>Endereço & Localização</span>
            </h2>

            <div className="space-y-1 text-sm text-slate-700">
              <p className="font-semibold">
                {provider.logradouro ? `${provider.logradouro}, ${provider.numero || 'S/N'}` : provider.endereco || 'Endereço sob consulta'}
              </p>
              {provider.complemento && <p className="text-slate-500 text-xs">Complemento: {provider.complemento}</p>}
              <p className="text-slate-600">
                {provider.bairro && `${provider.bairro} — `}{provider.cidade} / {provider.uf}
              </p>
              {provider.cep && <p className="text-slate-500 text-xs">CEP: {provider.cep}</p>}
            </div>

            {/* Mapa Interativo / Pré-visualização */}
            <div className="bg-slate-100 rounded-2xl h-44 flex flex-col items-center justify-center p-4 border border-slate-200 text-center relative overflow-hidden">
              <Compass className="w-8 h-8 text-blue-500 mb-1" />
              <span className="text-xs font-bold text-slate-700">
                {provider.cidade} - {provider.uf}
              </span>
              <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                {provider.latitude && provider.longitude
                  ? `Coordenadas: ${provider.latitude.toFixed(4)}, ${provider.longitude.toFixed(4)}`
                  : 'Endereço validado para navegação'}
              </p>
              <a
                href={routeUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleActionClick('como_chegar')}
                className="mt-2 px-3 py-1 bg-white text-blue-600 text-xs font-bold rounded-lg shadow-sm border border-slate-200 hover:bg-blue-50 transition-colors flex items-center space-x-1"
              >
                <span>Abrir no Google Maps</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

          {/* Card de Horários de Funcionamento */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <span>Horário de Funcionamento</span>
            </h2>

            {provider.atende24h ? (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-bold flex items-center space-x-3">
                <Clock className="w-6 h-6 text-rose-600 shrink-0" />
                <div>
                  <p>Atendimento 24 Horas Ininterrupto</p>
                  <p className="text-xs font-normal text-rose-600 mt-0.5">
                    Disponível inclusive em domingos, madrugadas e feriados nacionais.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-xs divide-y divide-slate-100">
                {[
                  { key: 'segunda', label: 'Segunda-feira' },
                  { key: 'terca', label: 'Terça-feira' },
                  { key: 'quarta', label: 'Quarta-feira' },
                  { key: 'quinta', label: 'Quinta-feira' },
                  { key: 'sexta', label: 'Sexta-feira' },
                  { key: 'sabado', label: 'Sábado' },
                  { key: 'domingo', label: 'Domingo' },
                  { key: 'feriados', label: 'Feriados' },
                ].map(({ key, label }) => {
                  const hours = provider.horarioFuncionamento?.[key] || 'Fechado';
                  return (
                    <div key={key} className="pt-2 flex justify-between items-center text-slate-700">
                      <span className="font-medium">{label}</span>
                      <span className={`font-semibold ${hours.toLowerCase().includes('fechado') ? 'text-slate-400' : 'text-slate-900'}`}>
                        {hours}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Serviços Oferecidos */}
        {provider.servicos && provider.servicos.length > 0 && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Serviços Especializados Disponíveis
            </h2>
            <div className="flex flex-wrap gap-2">
              {provider.servicos.map((servico, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  ✓ {servico}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Galeria de Fotos */}
        {photos && photos.length > 0 && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-3">
            <h2 className="text-base font-bold text-slate-900">
              Galeria de Imagens do Estabelecimento
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="h-32 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
                  <img src={photo.photoUrl} alt={photo.caption || 'Foto'} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rodapé do Perfil: Denúncia de Informação Incorreta */}
        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 text-amber-900">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Notou algum telefone que não atende, endereço desatualizado ou erro cadastral?</span>
          </div>

          <button
            onClick={() => setShowReportModal(true)}
            className="px-3 py-1.5 bg-white text-amber-800 font-bold rounded-xl border border-amber-300 hover:bg-amber-100/60 transition-colors shrink-0"
          >
            Denunciar Informação Incorreta
          </button>
        </div>
      </main>

      {/* Modal de Denúncia de Informação Incorreta */}
      {showReportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>Informar Erro Cadastral</span>
              </h3>
              <button
                onClick={() => {
                  setShowReportModal(false);
                  setReportSuccess(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {reportSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <h4 className="font-bold text-emerald-900">Denúncia Recebida!</h4>
                <p className="text-xs text-emerald-700">
                  Nossa equipe de auditoria do TELEVET irá averiguar as informações e corrigir o cadastro. Muito obrigado pela colaboração!
                </p>
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setReportSuccess(false);
                  }}
                  className="mt-3 px-4 py-2 bg-emerald-600 text-white font-bold text-xs rounded-xl"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendReport} className="space-y-3">
                <p className="text-xs text-slate-500">
                  Ajude a manter a comunidade de saúde animal com informações precisas e seguras.
                </p>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Inconsistência:</label>
                  <select
                    value={reportType}
                    onChange={(e: any) => setReportType(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="telefone_invalido">Telefone não atende ou não existe</option>
                    <option value="endereco_incorreto">Endereço ou CEP incorreto</option>
                    <option value="fechado_permanentemente">Estabelecimento fechado permanentemente</option>
                    <option value="categoria_inadequada">Categoria incorreta / Serviço divergente</option>
                    <option value="outro">Outro problema</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Detalhes do que está incorreto:</label>
                  <textarea
                    rows={3}
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Descreva o que observou (ex: o número de telefone chama e diz que não existe)..."
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Seu contato (opcional):</label>
                  <input
                    type="text"
                    value={reportContact}
                    onChange={(e) => setReportContact(e.target.value)}
                    placeholder="E-mail ou WhatsApp para retorno..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={reportSubmitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center space-x-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{reportSubmitting ? 'Enviando...' : 'Enviar Denúncia'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getMockProviderById(id: string): ServiceProviderItem {
  return {
    id,
    razaoSocial: 'Vet Móvel Emergências Médicas Veterinárias Ltda',
    nomeFantasia: 'Resgate Vet 24 Horas',
    cnpj: '06.990.590/0001-23',
    categoria: 'ambulancia',
    descricao: 'Ambulância veterinária equipada com UTI móvel, oxigenoterapia, monitor multiparâmetro e equipe treinada para remoção de urgência de cães e gatos.',
    telefone: '(11) 99888-1122',
    whatsapp: '11998881122',
    email: 'contato@resgatevet24h.com.br',
    site: 'https://resgatevet24h.com.br',
    logradouro: 'Avenida Rebouças',
    numero: '1200',
    complemento: 'Base Móvel 01',
    bairro: 'Pinheiros',
    cidade: 'São Paulo',
    uf: 'SP',
    cep: '05402-000',
    latitude: -23.565,
    longitude: -46.685,
    horarioFuncionamento: {
      segunda: '24 Horas',
      terca: '24 Horas',
      quarta: '24 Horas',
      quinta: '24 Horas',
      sexta: '24 Horas',
      sabado: '24 Horas',
      domingo: '24 Horas',
      feriados: '24 Horas',
    },
    servicos: [
      'Remoção de Emergência',
      'UTI Móvel Veterinária',
      'Oxigenoterapia',
      'Deslocamento para Hospitais de Referência',
      'Atendimento Domiciliar Pré-Hospitalar',
    ],
    status: 'aprovada',
    verificada: true,
    atende24h: true,
    clicksCount: 88,
    createdAt: '2026-10-01T10:00:00Z',
    updatedAt: '2026-10-23T10:00:00Z',
  };
}
