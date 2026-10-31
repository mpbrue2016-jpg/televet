'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  ShieldAlert,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  ExternalLink,
  ChevronRight,
  Database,
  Eye,
  X,
  Play,
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';
import { OutboxAuditMetrics } from '@/notifications/types';
import { Logo } from '@/components/ui/logo';

interface OutboxRow {
  id: string;
  event: string;
  channel: string;
  recipient: string;
  template_slug: string;
  rendered_subject: string | null;
  rendered_body: string;
  secure_link: string | null;
  status: string;
  attempts: number;
  max_attempts: number;
  idempotency_key: string | null;
  external_id: string | null;
  error_message: string | null;
  error_details: any;
  provider_response: any;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export default function AdminNotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [processingWorker, setProcessingWorker] = useState(false);
  const [metrics, setMetrics] = useState<OutboxAuditMetrics>({
    total: 0,
    pending: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    pendingConfiguration: 0,
    skippedOptOut: 0,
    successRate: 100,
  });

  const [items, setItems] = useState<OutboxRow[]>([]);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<OutboxRow | null>(null);

  const supabase = getSupabaseClient();

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Obter métricas via RPC
      const { data: metricsData } = await supabase.rpc('fn_get_outbox_audit_metrics');
      if (metricsData) {
        setMetrics({
          total: Number(metricsData.total || 0),
          pending: Number(metricsData.pending || 0),
          sent: Number(metricsData.sent || 0),
          delivered: Number(metricsData.delivered || 0),
          failed: Number(metricsData.failed || 0),
          pendingConfiguration: Number(metricsData.pending_configuration || 0),
          skippedOptOut: Number(metricsData.skipped_opt_out || 0),
          successRate: Number(metricsData.success_rate || 100),
        });
      }

      // 2. Carregar registros da outbox
      let query = supabase
        .from('notification_outbox')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (channelFilter !== 'all') {
        query = query.eq('channel', channelFilter);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: rows, error: rowsError } = await query;
      if (!rowsError && rows) {
        setItems(rows);
      }
    } catch (err) {
      console.error('Erro ao carregar auditoria de notificações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [channelFilter, statusFilter]);

  const handleRunWorker = async () => {
    setProcessingWorker(true);
    try {
      // Reivindicar e processar fila de outbox
      const response = await fetch('/api/notifications/worker', { method: 'POST' });
      await loadData();
    } catch (err) {
      console.error('Erro ao disparar worker:', err);
      // Fallback: recarregar tela
      await loadData();
    } finally {
      setProcessingWorker(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            Entregue
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1 text-blue-600" />
            Enviado (Aguardando Confirmação)
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1 text-amber-600" />
            Pendente
          </span>
        );
      case 'pending_configuration':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-800">
            <AlertTriangle className="w-3 h-3 mr-1 text-amber-600" />
            Pendente de Configuração
          </span>
        );
      case 'skipped_opt_out':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
            <ShieldAlert className="w-3 h-3 mr-1 text-purple-600" />
            Opt-Out Respeitado
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            <AlertTriangle className="w-3 h-3 mr-1 text-red-600" />
            Falha / Excedido
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            {status}
          </span>
        );
    }
  };

  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case 'email':
        return (
          <span className="inline-flex items-center text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
            <Mail className="w-3 h-3 mr-1" /> E-mail
          </span>
        );
      case 'whatsapp':
        return (
          <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            <MessageSquare className="w-3 h-3 mr-1" /> WhatsApp Oficial
          </span>
        );
      case 'push':
        return (
          <span className="inline-flex items-center text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
            <Smartphone className="w-3 h-3 mr-1" /> Push
          </span>
        );
      case 'in_app':
        return (
          <span className="inline-flex items-center text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md">
            <Bell className="w-3 h-3 mr-1" /> In-App
          </span>
        );
      default:
        return <span>{channel}</span>;
    }
  };

  const filteredItems = items.filter((row) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.event.toLowerCase().includes(q) ||
      row.recipient.toLowerCase().includes(q) ||
      (row.external_id && row.external_id.toLowerCase().includes(q)) ||
      (row.idempotency_key && row.idempotency_key.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Cabeçalho da Gestão de Notificações */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-500 mb-1">
              <Link href="/admin" className="hover:underline">Administração</Link>
              <span>/</span>
              <span>Notificações & Outbox</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
              <span>Auditoria de Notificações & Fila Outbox</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-blue-100 text-[#005bb5]">
                Fase 14
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Rastreamento imutável de entregas, deduplicação por idempotência, políticas de retry e respeito a opt-out.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>
            <button
              onClick={handleRunWorker}
              disabled={processingWorker}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#005bb5] hover:bg-[#004488] rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{processingWorker ? 'Processando fila...' : 'Processar Outbox (Worker)'}</span>
            </button>
          </div>
        </div>

        {/* Cartões de Métricas / KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">Total Registradas</p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.total}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-emerald-600 font-medium flex items-center">
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Entregues
            </p>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1">{metrics.delivered}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-blue-600 font-medium flex items-center">
              <Clock className="w-3.5 h-3.5 mr-1" /> Enviadas / Pendentes
            </p>
            <p className="text-2xl font-extrabold text-blue-600 mt-1">{metrics.sent + metrics.pending}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-amber-600 font-medium flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Pend. Configuração
            </p>
            <p className="text-2xl font-extrabold text-amber-600 mt-1">{metrics.pendingConfiguration}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-purple-600 font-medium flex items-center">
              <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Opt-Outs
            </p>
            <p className="text-2xl font-extrabold text-purple-600 mt-1">{metrics.skippedOptOut}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-xs text-red-600 font-medium flex items-center">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Falhas Finais
            </p>
            <p className="text-2xl font-extrabold text-red-600 mt-1">{metrics.failed}</p>
          </div>
        </div>

        {/* Barra de Filtros e Busca */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por evento, destinatário ou ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
            />
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>Canal:</span>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
              >
                <option value="all">Todos os canais</option>
                <option value="email">E-mail</option>
                <option value="whatsapp">WhatsApp Oficial</option>
                <option value="push">Push</option>
                <option value="in_app">In-App</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 text-xs text-slate-600">
              <span>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
              >
                <option value="all">Todos os status</option>
                <option value="delivered">Entregue</option>
                <option value="sent">Enviado</option>
                <option value="pending">Pendente</option>
                <option value="pending_configuration">Pendente Configuração</option>
                <option value="skipped_opt_out">Opt-out</option>
                <option value="failed">Falha</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tabela de Histórico da Outbox */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-3 px-4">Evento / Template</th>
                  <th className="py-3 px-4">Canal</th>
                  <th className="py-3 px-4">Destinatário</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Tentativas</th>
                  <th className="py-3 px-4">ID Externo</th>
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Carregando registros da outbox...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Nenhum registro encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{row.event}</div>
                        <div className="text-[11px] text-slate-400">{row.template_slug} (v{row.attempts > 0 ? '1' : '1'})</div>
                      </td>
                      <td className="py-3 px-4">{getChannelBadge(row.channel)}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                        {row.recipient}
                      </td>
                      <td className="py-3 px-4">{getStatusBadge(row.status)}</td>
                      <td className="py-3 px-4 text-slate-600">
                        {row.attempts} / {row.max_attempts}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                        {row.external_id ? (
                          <span className="truncate max-w-[120px] inline-block">{row.external_id}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {new Date(row.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedItem(row)}
                          className="p-1.5 text-slate-500 hover:text-[#005bb5] hover:bg-slate-100 rounded-lg transition-colors"
                          title="Inspecionar detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal de Inspeção de Registro */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <h3 className="text-base font-bold text-slate-900">
                    Detalhes da Notificação Outbox
                  </h3>
                  {getStatusBadge(selectedItem.status)}
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-medium">ID Outbox</span>
                  <span className="font-mono text-slate-800 break-all">{selectedItem.id}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Chave de Idempotência</span>
                  <span className="font-mono text-slate-800 break-all">{selectedItem.idempotency_key || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Canal & Provedor</span>
                  <span className="text-slate-800">{getChannelBadge(selectedItem.channel)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-medium">Destinatário</span>
                  <span className="font-mono text-slate-800">{selectedItem.recipient}</span>
                </div>
              </div>

              {/* Mensagem Renderizada */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs space-y-1">
                <span className="text-slate-500 font-semibold block">Conteúdo Enviado (Seguro):</span>
                {selectedItem.rendered_subject && (
                  <p className="font-bold text-slate-900">Assunto: {selectedItem.rendered_subject}</p>
                )}
                <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{selectedItem.rendered_body}</p>
                {selectedItem.secure_link && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-blue-600 break-all">
                    Link Seguro: {selectedItem.secure_link}
                  </div>
                )}
              </div>

              {/* Mensagem de Erro / Provedor */}
              {selectedItem.error_message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                  <span className="font-bold block mb-0.5">Motivo do Erro / Pendência:</span>
                  {selectedItem.error_message}
                </div>
              )}

              {/* Resposta do Provedor (JSON) */}
              {selectedItem.provider_response && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-900 text-slate-100 text-xs space-y-1">
                  <span className="text-slate-400 font-mono block">Evidência / Resposta do Provedor:</span>
                  <pre className="font-mono text-[11px] overflow-x-auto text-emerald-400">
                    {JSON.stringify(selectedItem.provider_response, null, 2)}
                  </pre>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-xl"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
