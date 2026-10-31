'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Eye,
  Edit3,
  PlusCircle,
  ExternalLink,
  ShieldCheck,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';
import { DirectoryService } from '@/directory/directory-service';
import { ServiceProviderItem, DIRECTORY_CATEGORIES_METADATA } from '@/directory/types';
import { getSupabaseClient } from '@/config/supabase-client';

export default function ProviderDashboardPage() {
  const directoryService = new DirectoryService();
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<ServiceProviderItem[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserEmail(user.email || null);
        const userServices = await directoryService.getProviderServices(user.id);
        setServices(userServices);
      } else {
        // Mock demonstrativo quando não autenticado
        setServices(getMockUserServices());
      }
    } catch (err) {
      console.warn('Erro ao carregar serviços do prestador:', err);
      setServices(getMockUserServices());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'aprovada':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Aprovada & Publicada</span>
          </span>
        );
      case 'em_analise':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>Em Análise pela Moderação</span>
          </span>
        );
      case 'suspensa':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>Cadastro Suspenso</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <span>Rascunho</span>
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/diretorio" className="font-extrabold text-lg text-blue-600 flex items-center space-x-1.5">
              <Compass className="w-5 h-5 text-blue-600" />
              <span>TELEVET <span className="text-slate-700 font-semibold text-sm">Painel da Empresa</span></span>
            </Link>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/diretorio/cadastrar"
              className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Novo Cadastro</span>
            </Link>
            <Link
              href="/diretorio"
              className="px-3 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              Ver Diretório Público
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Minhas Empresas & Serviços Cadastrados
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Acompanhe o status de aprovação, selo de verificação e o engajamento dos seus estabelecimentos.
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>

        {/* Resumo de Métricas Rápidas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Cadastros</p>
              <h3 className="text-2xl font-extrabold text-slate-900 mt-1">{services.length}</h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Publicados Ativos</p>
              <h3 className="text-2xl font-extrabold text-emerald-600 mt-1">
                {services.filter((s) => s.status === 'aprovada').length}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cliques & Contatos Recebidos</p>
              <h3 className="text-2xl font-extrabold text-purple-600 mt-1">
                {services.reduce((acc, curr) => acc + (curr.clicksCount || 0), 0)}
              </h3>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <MousePointerClick className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Lista de Estabelecimentos */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-44 rounded-3xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 space-y-4">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-lg font-bold text-slate-800">Nenhum serviço cadastrado ainda</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Cadastre sua ambulância, farmácia veterinária, laboratório ou serviço de transporte para começar a receber contatos pelo TELEVET.
            </p>
            <Link
              href="/diretorio/cadastrar"
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Cadastrar Primeiro Estabelecimento</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-6"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge(svc.status)}

                    <span className="px-2.5 py-0.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                      {DIRECTORY_CATEGORIES_METADATA[svc.categoria]?.label || svc.categoria}
                    </span>

                    {svc.verificada && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Selo Verificado Ativo</span>
                      </span>
                    )}

                    {svc.atende24h && (
                      <span className="px-2.5 py-0.5 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold">
                        Plantão 24h
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-extrabold text-slate-900">
                      {svc.nomeFantasia || svc.razaoSocial}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Razão Social: {svc.razaoSocial} {svc.cnpj && `• CNPJ: ${svc.cnpj}`}
                    </p>
                  </div>

                  <p className="text-xs text-slate-600">
                    {svc.logradouro ? `${svc.logradouro}, ` : ''}{svc.cidade} - {svc.uf} {svc.telefone && `• Fone: ${svc.telefone}`}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                  <div className="text-right sm:pr-4 sm:border-r sm:border-slate-100">
                    <span className="text-xs text-slate-400 block font-medium">Contatos Recebidos</span>
                    <span className="text-lg font-extrabold text-purple-600">{svc.clicksCount || 0} cliques</span>
                  </div>

                  <Link
                    href={`/diretorio/${svc.id}`}
                    target="_blank"
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1"
                  >
                    <span>Ver Página Pública</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    href={`/diretorio/cadastrar?id=${svc.id}`}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-1 shadow-sm"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Dados</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function getMockUserServices(): ServiceProviderItem[] {
  return [
    {
      id: 'prov-mock-1',
      razaoSocial: 'Vet Móvel Emergências Médicas Veterinárias Ltda',
      nomeFantasia: 'Resgate Vet 24 Horas',
      cnpj: '06.990.590/0001-23',
      categoria: 'ambulancia',
      cidade: 'São Paulo',
      uf: 'SP',
      logradouro: 'Av. Rebouças, 1200',
      telefone: '(11) 99888-1122',
      status: 'aprovada',
      verificada: true,
      atende24h: true,
      clicksCount: 88,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'prov-mock-2',
      razaoSocial: 'Transporte Pet Seguro Ltda',
      nomeFantasia: 'Pet Taxi Conforto',
      cnpj: '00.000.000/0001-91',
      categoria: 'transporte',
      cidade: 'Campinas',
      uf: 'SP',
      logradouro: 'Rua Barão de Jaguara, 500',
      telefone: '(19) 98765-4321',
      status: 'em_analise',
      verificada: false,
      atende24h: false,
      clicksCount: 0,
      createdAt: '2026-10-22T15:30:00Z',
      updatedAt: '2026-10-22T15:30:00Z',
    },
  ];
}
