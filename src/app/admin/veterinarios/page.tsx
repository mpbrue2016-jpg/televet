'use client';

import React, { useState, useEffect } from 'react';
import {
  Stethoscope,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';
import { AdminMasterService } from '@/admin/admin-master-service';

interface VetRow {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone?: string;
  crmvNumber?: string;
  stateUf?: string;
  crmvStatus: string;
  isVerified: boolean;
  isActive: boolean;
  city?: string;
  createdAt: string;
}

export default function AdminVeterinariansPage() {
  const [vets, setVets] = useState<VetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedVet, setSelectedVet] = useState<VetRow | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'suspend'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const supabase = getSupabaseClient();
  const adminService = new AdminMasterService();

  const loadVets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('veterinarians')
        .select(`
          id,
          user_id,
          is_verified,
          is_active,
          city,
          state_uf,
          created_at,
          users!user_id(full_name, email, phone),
          professional_registrations(crmv_number, state_uf, crmv_status)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formatted: VetRow[] = (data || []).map((row: any) => {
        const reg = row.professional_registrations?.[0] || {};
        return {
          id: row.id,
          userId: row.user_id,
          fullName: row.users?.full_name || 'Veterinário sem nome',
          email: row.users?.email || '',
          phone: row.users?.phone,
          crmvNumber: reg.crmv_number,
          stateUf: reg.state_uf || row.state_uf,
          crmvStatus: reg.crmv_status || (row.is_verified ? 'validated' : 'pending'),
          isVerified: Boolean(row.is_verified),
          isActive: Boolean(row.is_active),
          city: row.city,
          createdAt: row.created_at,
        };
      });

      setVets(formatted);
    } catch (err: any) {
      console.error('Erro ao carregar veterinários:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVets();
  }, []);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVet) return;

    setSubmitting(true);
    try {
      await adminService.reviewVeterinarian(selectedVet.id, reviewAction, reviewNotes);
      setSelectedVet(null);
      setReviewNotes('');
      await loadVets();
    } catch (err: any) {
      alert(`Erro na moderação: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'validated':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            CRMV Validado
          </span>
        );
      case 'pending':
      case 'in_validation':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1 text-amber-600" />
            Pendente de Análise
          </span>
        );
      case 'suspended':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            <AlertTriangle className="w-3 h-3 mr-1 text-red-600" />
            Suspenso
          </span>
        );
      case 'not_validated':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-800">
            <XCircle className="w-3 h-3 mr-1 text-slate-500" />
            Não Validado
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const filteredVets = vets.filter((v) => {
    const matchesSearch =
      v.fullName.toLowerCase().includes(search.toLowerCase()) ||
      v.email.toLowerCase().includes(search.toLowerCase()) ||
      (v.crmvNumber && v.crmvNumber.toLowerCase().includes(search.toLowerCase()));

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && v.crmvStatus === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Gestão e Moderação de Veterinários
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Acompanhamento de registros profissionais, validação de CRMVs e autorização para atendimento em telemedicina.
          </p>
        </div>

        <button
          onClick={loadVets}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nome, e-mail ou CRMV..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-600">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Status CRMV:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
          >
            <option value="all">Todos os status</option>
            <option value="pending">Pendentes</option>
            <option value="validated">Validados</option>
            <option value="suspended">Suspensos</option>
            <option value="not_validated">Não Validados</option>
          </select>
        </div>
      </div>

      {/* Tabela de Veterinários */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Profissional</th>
                <th className="py-3 px-4">CRMV / UF</th>
                <th className="py-3 px-4">Cidade</th>
                <th className="py-3 px-4">Status Moderação</th>
                <th className="py-3 px-4">Ativo na Plataforma</th>
                <th className="py-3 px-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Carregando profissionais...
                  </td>
                </tr>
              ) : filteredVets.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Nenhum veterinário encontrado.
                  </td>
                </tr>
              ) : (
                filteredVets.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{v.fullName}</div>
                      <div className="text-[11px] text-slate-400">{v.email}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-700">
                      {v.crmvNumber ? `${v.crmvNumber} - ${v.stateUf || 'BR'}` : 'Não informado'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{v.city || 'Não informada'}</td>
                    <td className="py-3 px-4">{getStatusBadge(v.crmvStatus)}</td>
                    <td className="py-3 px-4">
                      {v.isActive ? (
                        <span className="text-emerald-600 font-medium">Sim</span>
                      ) : (
                        <span className="text-slate-400">Não</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedVet(v);
                          setReviewAction(v.crmvStatus === 'validated' ? 'suspend' : 'approve');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-[#005bb5] bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        Moderar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Moderação */}
      {selectedVet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <form
            onSubmit={handleReviewSubmit}
            className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Moderação do Profissional
              </h3>
              <button
                type="button"
                onClick={() => setSelectedVet(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
              <p><strong>Nome:</strong> {selectedVet.fullName}</p>
              <p><strong>CRMV:</strong> {selectedVet.crmvNumber || 'Pendente'} ({selectedVet.stateUf || 'BR'})</p>
              <p><strong>E-mail:</strong> {selectedVet.email}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Decisão de Moderação
              </label>
              <select
                value={reviewAction}
                onChange={(e) => setReviewAction(e.target.value as any)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bb5]"
              >
                <option value="approve">Aprovar e Validar CRMV</option>
                <option value="reject">Reprovar Cadastro</option>
                <option value="suspend">Suspender Atendimento</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Justificativa / Parecer Administrativo (Auditado)
              </label>
              <textarea
                required
                rows={3}
                placeholder="Informe o parecer técnico da validação do CRMV..."
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bb5]"
              />
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedVet(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#005bb5] hover:bg-[#004488] rounded-xl shadow-sm disabled:opacity-50"
              >
                {submitting ? 'Salvando...' : 'Confirmar Decisão'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
