'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Lock,
  Search,
  RefreshCw,
  Eye,
  Clock,
  User,
  Database,
  Calendar,
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';

interface SensitiveAccessRow {
  id: string;
  admin_user_id: string;
  target_entity: string;
  target_entity_id: string;
  access_reason: string;
  view_mode: string;
  created_at: string;
}

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<SensitiveAccessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const supabase = getSupabaseClient();

  const loadLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_sensitive_access_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setLogs(data);
      }
    } catch (err) {
      console.error('Erro ao carregar logs de acesso sensível:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = logs.filter((l) => {
    return (
      l.target_entity.toLowerCase().includes(search.toLowerCase()) ||
      l.access_reason.toLowerCase().includes(search.toLowerCase()) ||
      l.target_entity_id.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center space-x-2">
            <span>Trilha de Auditoria & Acessos Sensíveis</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Registro imutável de todas as justificativas fornecidas por administradores para acessar dados sensíveis (LGPD / CFMV).
          </p>
        </div>

        <button
          onClick={loadLogs}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Atualizar Trilha</span>
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por entidade, justificativa ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Entidade Alvo</th>
                <th className="py-3 px-4">ID do Recurso</th>
                <th className="py-3 px-4">Modo</th>
                <th className="py-3 px-4">Justificativa Formal Registrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Carregando trilha de auditoria...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Nenhum log de acesso sensível registrado.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {log.target_entity}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600 truncate max-w-[120px]">
                      {log.target_entity_id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {log.view_mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 italic">
                      &quot;{log.access_reason}&quot;
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
