'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Building2,
  CheckCircle2,
  AlertCircle,
  FileText,
  MapPin,
  Clock,
  Phone,
  Globe,
  Upload,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { DirectoryService } from '@/directory/directory-service';
import { CnpjValidator } from '@/directory/cnpj-validator';
import {
  DirectoryCategory,
  DIRECTORY_CATEGORIES_METADATA,
  EXCLUDED_CATEGORIES,
} from '@/directory/types';

export default function DirectoryRegisterPage() {
  const router = useRouter();
  const directoryService = new DirectoryService();

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formulário
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [cnpjValid, setCnpjValid] = useState<boolean | null>(null);
  const [categoria, setCategoria] = useState<DirectoryCategory>('ambulancia');
  const [descricao, setDescricao] = useState('');
  const [telefone, setTelefone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [site, setSite] = useState('');
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('SP');
  const [atende24h, setAtende24h] = useState(false);
  const [servicosText, setServicosText] = useState('');
  const [documentoUrl, setDocumentoUrl] = useState('');
  const [logotipoUrl, setLogotipoUrl] = useState('');

  // Validação dinâmica do CNPJ ao digitar
  const handleCnpjChange = (value: string) => {
    setCnpj(value);
    const clean = CnpjValidator.clean(value);
    if (clean.length === 14) {
      setCnpjValid(CnpjValidator.isValid(clean));
    } else {
      setCnpjValid(null);
    }
  };

  // Preenchimento de CEP via ViaCEP
  const handleCepBlur = async () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setLogradouro(data.logradouro || '');
          setBairro(data.bairro || '');
          setCidade(data.localidade || '');
          setUf(data.uf || 'SP');
        }
      } catch {
        // Ignora falha de CEP
      }
    }
  };

  // Checagem em tempo real de termos proibidos (Clínicas, Hospitais, Pet Shops)
  const checkForbiddenTerms = (): string | null => {
    const combined = `${razaoSocial} ${nomeFantasia}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const term of EXCLUDED_CATEGORIES) {
      const cleanTerm = term.replace(/_/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (combined.includes(cleanTerm)) {
        return `O termo "${cleanTerm}" não é permitido no Diretório Nacional. Clínicas, hospitais e pet shops utilizam seus módulos dedicados.`;
      }
    }
    return null;
  };

  const forbiddenWarning = checkForbiddenTerms();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (forbiddenWarning) {
      setError(forbiddenWarning);
      return;
    }

    if (cnpj && cnpjValid === false) {
      setError('O CNPJ informado é inválido de acordo com o cálculo oficial da Receita Federal.');
      return;
    }

    setLoading(true);
    try {
      const servicos = servicosText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await directoryService.saveService({
        razaoSocial,
        nomeFantasia: nomeFantasia || razaoSocial,
        cnpj: cnpj || undefined,
        categoria,
        descricao,
        telefone,
        whatsapp,
        email,
        site,
        cep,
        logradouro,
        numero,
        complemento,
        bairro,
        cidade,
        uf,
        atende24h,
        servicos,
        logotipo: logotipoUrl || undefined,
        documentoComprobatorioUrl: documentoUrl || undefined,
        status: 'em_analise',
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erro ao submeter cadastro para moderação.');
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
            Cadastro Submetido com Sucesso!
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Sua empresa foi cadastrada e enviada para o <strong>fluxo de aprovação e verificação do TELEVET</strong>.
            Nossa equipe de moderação avaliará a consistência dos dados e o CNPJ. Você receberá um aviso assim que for aprovado.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
            <Link
              href="/diretorio/painel"
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm"
            >
              Acessar Meu Painel
            </Link>
            <Link
              href="/diretorio"
              className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl transition-colors"
            >
              Voltar ao Diretório
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/diretorio" className="font-extrabold text-lg text-blue-600 flex items-center space-x-1.5">
            <Compass className="w-5 h-5 text-blue-600" />
            <span>TELEVET <span className="text-slate-700 font-semibold text-sm">Diretório</span></span>
          </Link>
          <Link href="/diretorio" className="text-xs font-bold text-slate-600 hover:text-blue-600">
            Voltar
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 space-y-6">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h1 className="text-3xl font-extrabold text-slate-900">
            Cadastre sua Empresa no Diretório Nacional
          </h1>
          <p className="text-sm text-slate-600">
            Credenciamento para ambulâncias, farmácias veterinárias, laboratórios, diagnóstico por imagem, transporte de animais, serviços funerários e odontologia veterinária.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {forbiddenWarning && (
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <span>{forbiddenWarning}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 space-y-6">
          {/* Seção 1: Dados da Empresa */}
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Building2 className="w-5 h-5 text-blue-600" />
              <span>1. Identificação da Empresa & CNPJ</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Razão Social *</label>
                <input
                  type="text"
                  required
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Ex: Vida Animal Remoções e Resgate Ltda"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Resgate Pet 24h"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CNPJ (Validado em Tempo Real)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={cnpj}
                    onChange={(e) => handleCnpjChange(e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className={`w-full p-3 pr-10 bg-slate-50 border rounded-xl text-sm focus:outline-none focus:ring-2 ${
                      cnpjValid === true
                        ? 'border-emerald-500 focus:ring-emerald-500'
                        : cnpjValid === false
                        ? 'border-rose-500 focus:ring-rose-500'
                        : 'border-slate-200 focus:ring-blue-500'
                    }`}
                  />
                  {cnpjValid === true && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 absolute right-3 top-3.5" />
                  )}
                  {cnpjValid === false && (
                    <AlertCircle className="w-5 h-5 text-rose-600 absolute right-3 top-3.5" />
                  )}
                </div>
                {cnpjValid === false && (
                  <p className="text-[11px] text-rose-600 font-medium mt-1">CNPJ com dígitos verificadores inválidos.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Categoria Permitida *</label>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value as DirectoryCategory)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.entries(DIRECTORY_CATEGORIES_METADATA) as [DirectoryCategory, { label: string }][]).map(([slug, meta]) => (
                    <option key={slug} value={slug}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Nota: Clínicas, hospitais e pet shops não são permitidos neste diretório.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Descrição dos Serviços e Estrutura</label>
              <textarea
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Descreva equipamentos, estrutura física, diferenciais e especialidades..."
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Seção 2: Localização e Endereço */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <MapPin className="w-5 h-5 text-blue-600" />
              <span>2. Endereço e Localização</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">CEP</label>
                <input
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(e.target.value)}
                  onBlur={handleCepBlur}
                  placeholder="00000-000"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Logradouro / Rua</label>
                <input
                  type="text"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  placeholder="Av. Brasil"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Número</label>
                <input
                  type="text"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                  placeholder="123"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bairro</label>
                <input
                  type="text"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                  placeholder="Centro"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex space-x-2">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Cidade *</label>
                  <input
                    type="text"
                    required
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                    placeholder="São Paulo"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="w-20">
                  <label className="block text-xs font-bold text-slate-700 mb-1">UF *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={uf}
                    onChange={(e) => setUf(e.target.value.toUpperCase())}
                    placeholder="SP"
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 3: Contato & Operação */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <Phone className="w-5 h-5 text-blue-600" />
              <span>3. Contatos & Horário de Atendimento</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Telefone Principal</label>
                <input
                  type="text"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 3344-5566"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp para Atendimento</label>
                <input
                  type="text"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  placeholder="(11) 99888-7766"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">E-mail Comercial</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@suaempresa.com.br"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Site Oficial</label>
                <input
                  type="url"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="https://suaempresa.com.br"
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer font-bold text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={atende24h}
                  onChange={(e) => setAtende24h(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                />
                <span>Esta unidade possui atendimento com Plantão 24 Horas?</span>
              </label>
              <p className="text-xs text-slate-500">
                Unidades 24h ganham destaque prioritário no atalho de emergência e na busca de urgência.
              </p>
            </div>
          </div>

          {/* Seção 4: Serviços & Documento de Verificação */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2 pb-2 border-b border-slate-100">
              <FileText className="w-5 h-5 text-blue-600" />
              <span>4. Serviços & Comprovação para Selo Verificado</span>
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Serviços Oferecidos (separados por vírgula)</label>
              <input
                type="text"
                value={servicosText}
                onChange={(e) => setServicosText(e.target.value)}
                placeholder="Ex: Hemograma Completo, Ultrassom Abdominal, Raio-X Digital"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">URL do Logotipo da Empresa</label>
                <input
                  type="url"
                  value={logotipoUrl}
                  onChange={(e) => setLogotipoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Documento Comprobatório (Alvará ou CNPJ)</label>
                <input
                  type="url"
                  value={documentoUrl}
                  onChange={(e) => setDocumentoUrl(e.target.value)}
                  placeholder="URL pública do documento para verificação..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Botão de Envio */}
          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-slate-500">
              Ao submeter, você concorda com os termos de uso do Diretório Nacional e a verificação cadastral.
            </p>

            <button
              type="submit"
              disabled={loading || Boolean(forbiddenWarning)}
              className="w-full sm:w-auto px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-2xl shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <span>{loading ? 'Submetendo...' : 'Submeter para Aprovação'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
