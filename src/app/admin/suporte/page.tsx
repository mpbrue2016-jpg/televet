'use client';

import React, { useState, useEffect } from 'react';
import {
  HeadphonesIcon,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Send,
  Lock,
  MessageSquare,
  Search,
  Filter,
  User,
  Paperclip,
  Eye,
  RefreshCw,
  X,
} from 'lucide-react';
import { AdminMasterService } from '@/admin/admin-master-service';
import { SupportTicketDetail, SupportTicketMessage } from '@/admin/types';

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicketDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDetail | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const adminService = new AdminMasterService();

  const loadTickets = async () => {
    setLoading(true);
    try {
      const data = await adminService.getSupportTickets(statusFilter);
      setTickets(data);
    } catch (err: any) {
      console.error('Erro ao carregar chamados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [statusFilter]);

  const selectTicket = async (ticket: SupportTicketDetail) => {
    setSelectedTicket(ticket);
    setLoadingMessages(true);
    try {
      const msgs = await adminService.getTicketMessages(ticket.id);
      setMessages(msgs);
    } catch (err: any) {
      console.error('Erro ao carregar mensagens do ticket:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newMessage.trim()) return;

    try {
      await adminService.addTicketMessage(selectedTicket.id, newMessage, isInternalNote);
      setNewMessage('');
      setIsInternalNote(false);
      // Recarregar mensagens
      const msgs = await adminService.getTicketMessages(selectedTicket.id);
      setMessages(msgs);
    } catch (err: any) {
      alert(`Erro ao enviar mensagem: ${err.message}`);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-700">Urgente</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700">Alta</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-700">Média</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">Baixa</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Central de Suporte & Helpdesk Master
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestão de chamados de tutores, clínicas e veterinários com acompanhamento de SLA e notas internas restritas.
          </p>
        </div>

        <button
          onClick={loadTickets}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Chamados */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase">Chamados ({tickets.length})</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1"
            >
              <option value="all">Todos</option>
              <option value="open">Abertos</option>
              <option value="in_progress">Em Andamento</option>
              <option value="resolved">Resolvidos</option>
            </select>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[600px]">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Carregando chamados...</div>
            ) : tickets.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">Nenhum ticket encontrado.</div>
            ) : (
              tickets.map((t) => (
                <div
                  key={t.id}
                  onClick={() => selectTicket(t)}
                  className={`p-3.5 cursor-pointer transition-colors hover:bg-slate-50 ${
                    selectedTicket?.id === t.id ? 'bg-blue-50/50 border-l-4 border-[#005bb5]' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-400">#{t.id.slice(0, 8)}</span>
                    {getPriorityBadge(t.priority)}
                  </div>
                  <h4 className="text-xs font-bold text-slate-900 truncate">{t.title}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{t.description}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 text-[10px]">
                    <span className="text-slate-400">{t.userFullName || t.userEmail}</span>
                    {t.slaBreached && (
                      <span className="text-red-600 font-bold flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-0.5" /> SLA Violado
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Detalhes do Chamado e Histórico de Mensagens */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
          {selectedTicket ? (
            <div className="flex-1 flex flex-col">
              {/* Header do Chamado Selecionado */}
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-bold text-slate-900">{selectedTicket.title}</h3>
                    {getPriorityBadge(selectedTicket.priority)}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Aberto por: <strong>{selectedTicket.userFullName}</strong> ({selectedTicket.userEmail}) em{' '}
                    {new Date(selectedTicket.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-200 text-slate-700 capitalize">
                  {selectedTicket.status}
                </span>
              </div>

              {/* Mensagens do Ticket */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[380px]">
                {/* Descrição inicial */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <span className="font-semibold text-slate-700 block mb-1">Descrição Inicial do Usuário:</span>
                  <p className="text-slate-600 whitespace-pre-wrap">{selectedTicket.description}</p>
                </div>

                {loadingMessages ? (
                  <p className="text-center text-xs text-slate-400">Carregando histórico...</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`p-3 rounded-xl text-xs space-y-1 ${
                        m.isInternalNote
                          ? 'bg-amber-50 border border-amber-200 text-amber-900'
                          : 'bg-blue-50 border border-blue-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="flex items-center space-x-1">
                          {m.isInternalNote && <Lock className="w-3 h-3 text-amber-600" />}
                          <span>{m.isInternalNote ? 'NOTA INTERNA (Exclusiva do Suporte)' : m.senderName || 'Atendente'}</span>
                        </span>
                        <span className="text-slate-400 font-normal">
                          {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Caixa de Resposta */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center space-x-2 text-xs">
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className={`font-semibold ${isInternalNote ? 'text-amber-800' : 'text-slate-600'}`}>
                      Nota Interna (Oculta para o usuário)
                    </span>
                  </label>
                </div>

                <div className="flex space-x-2">
                  <input
                    type="text"
                    required
                    placeholder={
                      isInternalNote
                        ? 'Escreva uma anotação privada para a equipe...'
                        : 'Responder ao usuário com link seguro...'
                    }
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    className="flex-1 text-xs px-3 py-2 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#005bb5]"
                  />
                  <button
                    type="submit"
                    className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-sm flex items-center space-x-1 ${
                      isInternalNote ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#005bb5] hover:bg-[#004488]'
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Enviar</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <HeadphonesIcon className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-xs font-medium text-slate-600">Selecione um chamado ao lado</p>
              <p className="text-[11px] text-slate-400">Visualize mensagens, adicione notas internas e acompanhe o SLA.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
