'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Download,
  CreditCard,
  TrendingUp,
  Receipt,
  Search,
  RefreshCw,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { AdminMasterService } from '@/admin/admin-master-service';
import { ExportService } from '@/admin/export-service';
import { FinancialLedgerEntry } from '@/admin/types';

export default function AdminFinancialPage() {
  const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  const adminService = new AdminMasterService();

  const loadLedger = async () => {
    setLoading(true);
    try {
      const data = await adminService.getFinancialLedger();
      setLedger(data);
    } catch (err: any) {
      console.error('Erro ao carregar ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // 1. Registrar auditoria do acesso a dados sensíveis de exportação
      await adminService.logSensitiveAccess(
        'financial_ledger',
        'export_all',
        'Exportação gerencial de extrato de conciliação bancária',
        'audit_export'
      );

      // 2. Formatar CSV minimizado e protegido
      const csvContent = ExportService.formatLedgerToCsv(ledger);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `televet_ledger_financeiro_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert(`Erro na exportação: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  };

  const filteredLedger = ledger.filter((item) => {
    const matchesSearch =
      item.paymentId.toLowerCase().includes(search.toLowerCase()) ||
      item.tenantName.toLowerCase().includes(search.toLowerCase());

    if (statusFilter === 'all') return matchesSearch;
    return matchesSearch && item.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Financeiro, Conciliação e Ledger
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Transações capturadas, conciliação de taxas de gateway, splits de parceiros e repasses a veterinários.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadLedger}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={exporting || ledger.length === 0}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#005bb5] hover:bg-[#004488] rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{exporting ? 'Exportando...' : 'Exportar Ledger (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* Caixa LGPD de Minimização de Dados */}
      <div className="p-4 bg-blue-50/70 border border-blue-200/70 rounded-2xl flex items-center justify-between text-xs text-slate-700">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-4 h-4 text-[#005bb5]" />
          <span>
            <strong>Exportação com Minimização de Dados (LGPD):</strong> O arquivo CSV exportado oculta dados cadastrais sensíveis (como CPFs de tutores) e exibe apenas códigos de conciliação financeira.
          </span>
        </div>
      </div>

      {/* Tabela do Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Data / ID Pagamento</th>
                <th className="py-3 px-4">Parceiro Origem</th>
                <th className="py-3 px-4 text-right">Valor Bruto</th>
                <th className="py-3 px-4 text-right">Gateway</th>
                <th className="py-3 px-4 text-right">Comissão Plataforma</th>
                <th className="py-3 px-4 text-right">Comissão Parceiro</th>
                <th className="py-3 px-4 text-right">Repasse Líquido Vet</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Carregando extrato financeiro...
                  </td>
                </tr>
              ) : filteredLedger.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Nenhuma transação financeira registrada.
                  </td>
                </tr>
              ) : (
                filteredLedger.map((row) => (
                  <tr key={row.paymentId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-medium text-slate-900 truncate max-w-[140px]">
                        {row.paymentId}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {new Date(row.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">{row.tenantName}</td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {formatCurrency(row.grossAmountCents)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500">
                      {formatCurrency(row.gatewayFeeCents)}
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-[#005bb5]">
                      {formatCurrency(row.platformCommissionCents)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600">
                      {formatCurrency(row.petshopCommissionCents)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-indigo-700">
                      {formatCurrency(row.veterinarianNetCents)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                        {row.status}
                      </span>
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
