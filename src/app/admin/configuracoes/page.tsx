'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  ShieldCheck,
  Check,
  Save,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { AdminMasterService } from '@/admin/admin-master-service';
import { GlobalGovernanceSettings } from '@/admin/types';

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<GlobalGovernanceSettings>({
    platformName: 'TeleVet',
    defaultTrialDays: 14,
    defaultCancellationHours: 2,
    gatewayFeePercent: 2.99,
    gatewayFeeFixedCents: 49,
    requireCrmvAutoValidation: true,
    maintenanceMode: false,
    supportEmail: 'suporte@televet.io',
    featureFlags: {
      enable_instant_telemedicine: true,
      enable_ai_pre_triage: false,
      enforce_mfa_superadmin: true,
      allow_cross_tenant_marketplace: true,
    },
    termsVersion: '2026.1',
    privacyPolicyVersion: '2026.1',
  });

  const adminService = new AdminMasterService();

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await adminService.getGlobalSettings();
      setSettings(data);
    } catch (err: any) {
      console.error('Erro ao carregar configurações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleToggleFlag = (key: string) => {
    setSettings((prev) => ({
      ...prev,
      featureFlags: {
        ...prev.featureFlags,
        [key]: !prev.featureFlags[key],
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    try {
      await adminService.updateGlobalSettings(settings);
      setSuccess('Parâmetros de governança e Feature Flags salvos com sucesso.');
    } catch (err: any) {
      alert(`Erro ao salvar configurações: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Carregando parâmetros globais...</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Governança Global & Feature Flags
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Controle de parâmetros econômicos, versões de termos legais e ativação de módulos da plataforma.
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-[#005bb5] hover:bg-[#004488] rounded-xl shadow-sm flex items-center space-x-1.5 transition-colors disabled:opacity-50 self-start"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Gravando...' : 'Salvar Alterações'}</span>
        </button>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Feature Flags */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
          <span>Feature Flags (Módulos em Tempo Real)</span>
        </h3>

        <div className="divide-y divide-slate-100">
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Telemedicina Imediata (Plantão 24h)</p>
              <p className="text-[11px] text-slate-500">Permite atendimento de pronto-atendimento sob demanda sem agendamento prévio.</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleFlag('enable_instant_telemedicine')}
              className={`p-1 rounded-lg text-sm font-bold ${
                settings.featureFlags.enable_instant_telemedicine
                  ? 'text-emerald-600'
                  : 'text-slate-400'
              }`}
            >
              {settings.featureFlags.enable_instant_telemedicine ? 'ATIVADO' : 'DESATIVADO'}
            </button>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Pré-Triagem com Inteligência Artificial</p>
              <p className="text-[11px] text-slate-500">Questionário inteligente antes da sala de atendimento.</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleFlag('enable_ai_pre_triage')}
              className={`p-1 rounded-lg text-sm font-bold ${
                settings.featureFlags.enable_ai_pre_triage ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {settings.featureFlags.enable_ai_pre_triage ? 'ATIVADO' : 'DESATIVADO'}
            </button>
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-900">Exigência Estrita de MFA para Superadmin</p>
              <p className="text-[11px] text-slate-500">Bloqueia acesso a rotas master caso o administrador não valide o segundo fator.</p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleFlag('enforce_mfa_superadmin')}
              className={`p-1 rounded-lg text-sm font-bold ${
                settings.featureFlags.enforce_mfa_superadmin ? 'text-emerald-600' : 'text-slate-400'
              }`}
            >
              {settings.featureFlags.enforce_mfa_superadmin ? 'ATIVADO' : 'DESATIVADO'}
            </button>
          </div>
        </div>
      </div>

      {/* Parâmetros Econômicos e Prazos */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Parâmetros Financeiros & Prazos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Taxa Percentual do Gateway (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={settings.gatewayFeePercent}
              onChange={(e) => setSettings({ ...settings, gatewayFeePercent: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Prazo Mínimo de Cancelamento (Horas)
            </label>
            <input
              type="number"
              value={settings.defaultCancellationHours}
              onChange={(e) => setSettings({ ...settings, defaultCancellationHours: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Versão Vigente dos Termos de Uso
            </label>
            <input
              type="text"
              value={settings.termsVersion}
              onChange={(e) => setSettings({ ...settings, termsVersion: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              E-mail Oficial de Suporte
            </label>
            <input
              type="email"
              value={settings.supportEmail}
              onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl"
            />
          </div>
        </div>
      </div>
    </form>
  );
}
