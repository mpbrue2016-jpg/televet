'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Compass,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Upload,
  FileSpreadsheet,
  Building2,
  Phone,
  MapPin,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  RefreshCw,
  FileCheck,
} from 'lucide-react';
import { DirectoryService } from '@/directory/directory-service';
import {
  ServiceProviderItem,
  ServiceCategoryEntity,
  DirectoryCsvValidation,
  DirectoryQualityReport,
  DIRECTORY_CATEGORIES_METADATA,
  EXCLUDED_CATEGORIES,
} from '@/directory/types';

export default function AdminDirectoryPage() {
  const directoryService = new DirectoryService();

  const [activeTab, setActiveTab] = useState<'moderacao' | 'categorias' | 'importacao' | 'qualidade'>('moderacao');
  const [loading, setLoading] = useState(false);

  // Aba 1: Moderação
  const [providers, setProviders] = useState<ServiceProviderItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ServiceProviderItem | null>(null);
  const [moderationNotes, setModerationNotes] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [actionToPerform, setActionToPerform] = useState<'aprovar' | 'suspender' | 'rejeitar' | 'verificar' | 'desverificar'>('aprovar');

  // Aba 2: Categorias
  const [categories, setCategories] = useState<ServiceCategoryEntity[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categorySlug, setCategorySlug] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [categoryDesc, setCategoryDesc] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('heart-pulse');
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Aba 3: Importação CSV
  const [csvContent, setCsvContent] = useState('');
  const [csvValidations, setCsvValidations] = useState<DirectoryCsvValidation[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);

  // Aba 4: Qualidade de Dados
  const [qualityReport, setQualityReport] = useState<DirectoryQualityReport | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'moderacao') {
        // Busca prestadores
        const results = await directoryService.search({
          query: searchQuery || undefined,
          limit: 100,
        });
        if (results.length === 0) {
          setProviders(getMockAdminProviders());
        } else {
          setProviders(results);
        }
      } else if (activeTab === 'categorias') {
        const cats = await directoryService.getCategories();
        if (cats.length === 0) {
          setCategories(getMockCategories());
        } else {
          setCategories(cats);
        }
      } else if (activeTab === 'qualidade') {
        try {
          const report = await directoryService.getDataQualityReport();
          setQualityReport(report);
        } catch {
          setQualityReport(getMockQualityReport());
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do admin:', err);
      if (activeTab === 'moderacao') setProviders(getMockAdminProviders());
      if (activeTab === 'categorias') setCategories(getMockCategories());
      if (activeTab === 'qualidade') setQualityReport(getMockQualityReport());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  // Ações de Moderação
  const handleOpenReview = (
    provider: ServiceProviderItem,
    action: 'aprovar' | 'suspender' | 'rejeitar' | 'verificar' | 'desverificar'
  ) => {
    setSelectedProvider(provider);
    setActionToPerform(action);
    setModerationNotes('');
    setShowReviewModal(true);
  };

  const handleConfirmReview = async () => {
    if (!selectedProvider) return;
    try {
      await directoryService.reviewService(selectedProvider.id, actionToPerform, moderationNotes);
      setShowReviewModal(false);
      loadData();
      alert(`Ação "${actionToPerform}" executada com sucesso!`);
    } catch (err: any) {
      alert(`Erro na moderação: ${err.message}`);
    }
  };

  // Salvar Categoria com Barreira Estrita
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);

    const lower = `${categorySlug} ${categoryName} ${categoryDesc}`.toLowerCase();
    for (const term of EXCLUDED_CATEGORIES) {
      const clean = term.replace('_', ' ');
      if (lower.includes(clean)) {
        setCategoryError(`CATEGORIA PROIBIDA: "${clean}" não pode ser cadastrada no Diretório.`);
        return;
      }
    }

    try {
      await directoryService.saveCategory({
        slug: categorySlug.toLowerCase().replace(/[\s-]/g, '_'),
        name: categoryName,
        description: categoryDesc,
        icon: categoryIcon,
      });
      setShowCategoryModal(false);
      setCategorySlug('');
      setCategoryName('');
      setCategoryDesc('');
      loadData();
    } catch (err: any) {
      setCategoryError(err.message);
    }
  };

  // Validar CSV
  const handleValidateCsv = () => {
    if (!csvContent.trim()) return;
    const validations = directoryService.validateCsvImport(csvContent);
    setCsvValidations(validations);
    setImportResult(null);
  };

  // Efetivar Importação CSV
  const handleImportValidCsvRows = async () => {
    const validRows = csvValidations.filter((v) => v.isValid).map((v) => v.data);
    if (validRows.length === 0) return;

    setImporting(true);
    try {
      const res = await directoryService.importCsvBatch(validRows);
      setImportResult({ imported: res.importedCount, errors: res.errorsCount });
      alert(`${res.importedCount} prestadores importados com sucesso para moderação.`);
    } catch (err: any) {
      alert(`Erro na importação: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const filteredProviders = providers.filter((p) => {
    if (statusFilter !== 'todos' && p.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.nomeFantasia.toLowerCase().includes(q) ||
        p.razaoSocial.toLowerCase().includes(q) ||
        (p.cnpj && p.cnpj.includes(q)) ||
        p.cidade.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 flex items-center space-x-2">
            <Compass className="w-7 h-7 text-blue-600" />
            <span>Diretório Nacional de Saúde Animal</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Moderação de estabelecimentos credenciados, gestão de categorias, importação em lote e qualidade de dados.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Navegação entre as 4 Abas */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2 text-xs sm:text-sm font-bold">
        <button
          onClick={() => setActiveTab('moderacao')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'moderacao'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          1. Moderação de Prestadores
        </button>
        <button
          onClick={() => setActiveTab('categorias')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'categorias'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          2. Categorias de Serviços
        </button>
        <button
          onClick={() => setActiveTab('importacao')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'importacao'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          3. Importação em Lote (CSV)
        </button>
        <button
          onClick={() => setActiveTab('qualidade')}
          className={`px-4 py-2.5 rounded-xl transition-all ${
            activeTab === 'qualidade'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          4. Qualidade de Dados & Denúncias
        </button>
      </div>

      {/* ABA 1: MODERAÇÃO DE PRESTADORES */}
      {activeTab === 'moderacao' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, razão social, CNPJ ou cidade..."
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
                <option value="em_analise">Em Análise</option>
                <option value="aprovada">Aprovadas</option>
                <option value="suspensa">Suspensas</option>
                <option value="rascunho">Rascunhos</option>
              </select>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Estabelecimento / Razão Social</th>
                    <th className="px-5 py-3.5">Categoria</th>
                    <th className="px-5 py-3.5">CNPJ</th>
                    <th className="px-5 py-3.5">Cidade / UF</th>
                    <th className="px-5 py-3.5">Status</th>
                    <th className="px-5 py-3.5">Selo</th>
                    <th className="px-5 py-3.5 text-right">Ações de Moderação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProviders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400 font-medium">
                        Nenhum estabelecimento encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredProviders.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5">
                          <strong className="block text-slate-900 font-bold">{p.nomeFantasia}</strong>
                          <span className="text-[11px] text-slate-500 block truncate max-w-xs">{p.razaoSocial}</span>
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-slate-700">
                          {DIRECTORY_CATEGORIES_METADATA[p.categoria]?.label || p.categoria}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-[11px] text-slate-600">
                          {p.cnpj || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">
                          {p.cidade} - {p.uf}
                        </td>
                        <td className="px-5 py-3.5">
                          {p.status === 'aprovada' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Aprovada
                            </span>
                          )}
                          {p.status === 'em_analise' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800">
                              Em Análise
                            </span>
                          )}
                          {p.status === 'suspensa' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800">
                              Suspensa
                            </span>
                          )}
                          {p.status === 'rascunho' && (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700">
                              Rascunho
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          {p.verificada ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" />
                              <span>Verificada</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px] font-medium">Não</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                          {p.status !== 'aprovada' && (
                            <button
                              onClick={() => handleOpenReview(p, 'aprovar')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Aprovar
                            </button>
                          )}

                          {p.status !== 'suspensa' && (
                            <button
                              onClick={() => handleOpenReview(p, 'suspender')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Suspender
                            </button>
                          )}

                          {!p.verificada ? (
                            <button
                              onClick={() => handleOpenReview(p, 'verificar')}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Dar Selo
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenReview(p, 'desverificar')}
                              className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold text-[11px] transition-colors"
                            >
                              Tirar Selo
                            </button>
                          )}

                          <Link
                            href={`/diretorio/${p.id}`}
                            target="_blank"
                            className="p-1.5 text-slate-400 hover:text-slate-700 inline-block align-middle"
                            title="Ver no diretório público"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Link>
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

      {/* ABA 2: GESTÃO DE CATEGORIAS */}
      {activeTab === 'categorias' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Categorias de Saúde e Atendimento Permitidas</h3>
              <p className="text-xs text-slate-500">
                Apenas serviços estritamente correlatos à saúde animal são permitidos. Clínicas, hospitais, pet shops e especialistas são bloqueados por trava de segurança.
              </p>
            </div>

            <button
              onClick={() => {
                setCategoryError(null);
                setShowCategoryModal(true);
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Categoria</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((cat) => (
              <div key={cat.id || cat.slug} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-start justify-between">
                  <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-600">
                    <Compass className="w-5 h-5" />
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    {cat.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>

                <h4 className="font-bold text-slate-900 text-sm">{cat.name}</h4>
                <p className="text-xs text-slate-500 line-clamp-2">{cat.description || 'Sem descrição cadastrada.'}</p>
                <span className="text-[11px] font-mono text-slate-400 block pt-1">slug: {cat.slug}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ABA 3: IMPORTAÇÃO EM LOTE CSV */}
      {activeTab === 'importacao' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span>Importação em Lote via Arquivo CSV</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Cole o conteúdo CSV ou faça o upload de uma lista de estabelecimentos. O sistema validará cada linha quanto a CNPJ, formato e termos proibidos antes da inserção.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Conteúdo CSV (separado por vírgula ou ponto-e-vírgula):</label>
              <textarea
                rows={6}
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder="Razão Social;Nome Fantasia;CNPJ;Categoria;Cidade;UF;Telefone;24h&#10;Ambulância Vet Resgate;Vet Resgate 24h;06.990.590/0001-23;ambulancia;São Paulo;SP;(11) 99999-1111;sim&#10;Farmácia Magistral Pet;Magistral Pet;00.000.000/0001-91;farmacia_manipulacao;Curitiba;PR;(41) 3333-2222;não"
                className="w-full p-3 font-mono text-xs bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={handleValidateCsv}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm flex items-center space-x-1.5"
              >
                <FileCheck className="w-4 h-4" />
                <span>Validar Linhas do CSV</span>
              </button>

              {csvValidations.length > 0 && (
                <div className="flex items-center space-x-3">
                  <span className="text-xs font-bold text-slate-700">
                    {csvValidations.filter((v) => v.isValid).length} válidas / {csvValidations.length} totais
                  </span>

                  <button
                    onClick={handleImportValidCsvRows}
                    disabled={importing || csvValidations.filter((v) => v.isValid).length === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
                  >
                    <span>{importing ? 'Importando...' : `Importar ${csvValidations.filter((v) => v.isValid).length} Registros Válidos`}</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pré-visualização das Linhas Validadas */}
          {csvValidations.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 font-bold text-xs text-slate-700">
                Relatório de Validação Linha a Linha
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <tr>
                      <th className="px-4 py-2.5">Linha</th>
                      <th className="px-4 py-2.5">Razão Social</th>
                      <th className="px-4 py-2.5">Categoria</th>
                      <th className="px-4 py-2.5">CNPJ</th>
                      <th className="px-4 py-2.5">Cidade/UF</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Inconsistências / Alertas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {csvValidations.map((v) => (
                      <tr key={v.rowIndex} className={v.isValid ? 'bg-white' : 'bg-rose-50/40'}>
                        <td className="px-4 py-2.5 font-bold text-slate-400">#{v.rowIndex}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800">{v.data.razaoSocial}</td>
                        <td className="px-4 py-2.5 font-mono">{v.data.categoria}</td>
                        <td className="px-4 py-2.5 font-mono">{v.data.cnpj || '—'}</td>
                        <td className="px-4 py-2.5">{v.data.cidade} / {v.data.uf}</td>
                        <td className="px-4 py-2.5">
                          {v.isValid ? (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ Válida
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-100 text-rose-800">
                              ✕ Erro
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          {v.errors.length > 0 && (
                            <span className="text-rose-600 font-semibold block">{v.errors.join(' • ')}</span>
                          )}
                          {v.warnings.length > 0 && (
                            <span className="text-amber-600 block">{v.warnings.join(' • ')}</span>
                          )}
                          {v.errors.length === 0 && v.warnings.length === 0 && (
                            <span className="text-emerald-600">Pronto para cadastro</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ABA 4: QUALIDADE DE DADOS & DENÚNCIAS */}
      {activeTab === 'qualidade' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Telefones Suspeitos</span>
              <h3 className="text-2xl font-extrabold text-amber-600 mt-1">
                {qualityReport?.missingPhonesCount || 0}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Sem telefone ou com dígitos a menos</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sem Coordenadas</span>
              <h3 className="text-2xl font-extrabold text-rose-600 mt-1">
                {qualityReport?.missingCoordsCount || 0}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Sem latitude/longitude no PostGIS</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Geocodificação Pendente</span>
              <h3 className="text-2xl font-extrabold text-blue-600 mt-1">
                {qualityReport?.pendingGeocodingCount || 0}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Aguardando chave ou fila de processamento</p>
            </div>

            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Denúncias Abertas</span>
              <h3 className="text-2xl font-extrabold text-purple-600 mt-1">
                {qualityReport?.openReportsCount || 0}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Informadas por usuários e tutores</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <span>Amostra de Inconsistências Detectadas pelo Auditor</span>
            </h3>

            <div className="divide-y divide-slate-100 text-xs">
              {(qualityReport?.sampleAnomalies || []).map((anomaly, idx) => (
                <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <strong className="text-slate-800 font-bold block">{anomaly.nome_fantasia}</strong>
                    <span className="text-slate-500 text-[11px]">{anomaly.cidade} - {anomaly.uf} • Tel: {anomaly.telefone || 'Nenhum'}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 font-bold text-[11px] border border-amber-200">
                    {anomaly.issue_description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ação de Moderação */}
      {showReviewModal && selectedProvider && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Confirmar Moderação: {actionToPerform.toUpperCase()}
            </h3>
            <p className="text-xs text-slate-600">
              Estabelecimento: <strong>{selectedProvider.nomeFantasia}</strong> ({selectedProvider.razaoSocial})
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Parecer / Justificativa Interna (Auditada):</label>
              <textarea
                rows={3}
                value={moderationNotes}
                onChange={(e) => setModerationNotes(e.target.value)}
                placeholder="Insira o motivo da aprovação, suspensão ou atribuição de selo verificado..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReview}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Confirmar Moderação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Nova Categoria */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSaveCategory} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Criar Nova Categoria de Saúde Animal</h3>

            {categoryError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-semibold">
                {categoryError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome da Categoria *</label>
              <input
                type="text"
                required
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ex: Bancos de Sangue Veterinários"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Slug Identificador *</label>
              <input
                type="text"
                required
                value={categorySlug}
                onChange={(e) => setCategorySlug(e.target.value)}
                placeholder="banco_sangue"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Descrição</label>
              <textarea
                rows={2}
                value={categoryDesc}
                onChange={(e) => setCategoryDesc(e.target.value)}
                placeholder="Descreva o escopo desta categoria..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
              >
                Salvar Categoria
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function getMockAdminProviders(): ServiceProviderItem[] {
  return [
    {
      id: 'prov-admin-1',
      razaoSocial: 'Vet Móvel Emergências Ltda',
      nomeFantasia: 'Resgate Vet 24 Horas',
      cnpj: '06.990.590/0001-23',
      categoria: 'ambulancia',
      cidade: 'São Paulo',
      uf: 'SP',
      status: 'aprovada',
      verificada: true,
      atende24h: true,
      clicksCount: 88,
      createdAt: '2026-10-01T10:00:00Z',
      updatedAt: '2026-10-23T10:00:00Z',
    },
    {
      id: 'prov-admin-2',
      razaoSocial: 'DrogaVet Manipulação Pet',
      nomeFantasia: 'Farmácia Magistral Veterinária',
      cnpj: '00.000.000/0001-91',
      categoria: 'farmacia_manipulacao',
      cidade: 'Curitiba',
      uf: 'PR',
      status: 'em_analise',
      verificada: false,
      atende24h: false,
      clicksCount: 12,
      createdAt: '2026-10-22T10:00:00Z',
      updatedAt: '2026-10-22T10:00:00Z',
    },
    {
      id: 'prov-admin-3',
      razaoSocial: 'Transporte Pet Dog Táxi Ltda',
      nomeFantasia: 'Leva & Traz Animal',
      cnpj: '33.000.167/0001-01',
      categoria: 'transporte',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      status: 'suspensa',
      verificada: false,
      atende24h: false,
      clicksCount: 5,
      createdAt: '2026-10-15T10:00:00Z',
      updatedAt: '2026-10-20T10:00:00Z',
    },
  ];
}

function getMockCategories(): ServiceCategoryEntity[] {
  return (Object.entries(DIRECTORY_CATEGORIES_METADATA) as [string, { label: string; description: string; icon: string }][]).map(([slug, meta], idx) => ({
    id: `cat-${slug}`,
    slug,
    name: meta.label,
    description: meta.description,
    icon: meta.icon,
    displayOrder: idx + 1,
    isActive: true,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-23T00:00:00Z',
  }));
}

function getMockQualityReport(): DirectoryQualityReport {
  return {
    missingPhonesCount: 2,
    missingCoordsCount: 4,
    pendingGeocodingCount: 3,
    openReportsCount: 1,
    sampleAnomalies: [
      {
        id: '1',
        nome_fantasia: 'Transporte Pet Dog Táxi',
        razao_social: 'Transporte Pet Dog Táxi Ltda',
        cidade: 'Rio de Janeiro',
        uf: 'RJ',
        telefone: '123',
        geocoding_status: 'failed',
        issue_description: 'Telefone ausente ou com dígitos insuficientes',
      },
      {
        id: '2',
        nome_fantasia: 'DrogaVet Manipulação',
        razao_social: 'DrogaVet Manipulação Pet',
        cidade: 'Curitiba',
        uf: 'PR',
        cep: '8000',
        geocoding_status: 'pending',
        issue_description: 'CEP incompleto / Coordenadas pendentes',
      },
    ],
  };
}
