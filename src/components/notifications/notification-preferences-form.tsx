'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  ShieldCheck,
  Check,
  AlertTriangle,
  Lock,
  Clock,
  HelpCircle,
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';
import { UserNotificationPreferences } from '@/notifications/types';

interface PreferencesFormProps {
  userId?: string;
  onSaved?: (prefs: UserNotificationPreferences) => void;
}

export function NotificationPreferencesForm({ userId, onSaved }: PreferencesFormProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [preferences, setPreferences] = useState<UserNotificationPreferences>({
    userId: userId || '',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    pushEnabled: true,
    remindersEnabled: true,
    clinicalAlertsEnabled: true,
    marketingEnabled: false,
  });

  const [showWhatsAppOptInModal, setShowWhatsAppOptInModal] = useState(false);
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!userId) return;

    async function load() {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('fn_get_notification_preferences', {
          p_user_id: userId,
        });

        if (!error && data) {
          setPreferences({
            userId: data.user_id,
            tenantId: data.tenant_id,
            inAppEnabled: data.in_app_enabled,
            emailEnabled: data.email_enabled,
            whatsappEnabled: data.whatsapp_enabled,
            whatsappOptInAt: data.whatsapp_opt_in_at,
            whatsappOptInIp: data.whatsapp_opt_in_ip,
            pushEnabled: data.push_enabled,
            remindersEnabled: data.reminders_enabled,
            clinicalAlertsEnabled: data.clinical_alerts_enabled,
            marketingEnabled: data.marketing_enabled,
          });
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Erro ao carregar preferências.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [userId]);

  const handleWhatsAppToggle = (checked: boolean) => {
    if (checked && !preferences.whatsappEnabled) {
      // Exige confirmação de opt-in formal para WhatsApp
      setShowWhatsAppOptInModal(true);
    } else {
      setPreferences((prev) => ({ ...prev, whatsappEnabled: false }));
    }
  };

  const confirmWhatsAppOptIn = () => {
    setPreferences((prev) => ({ ...prev, whatsappEnabled: true }));
    setShowWhatsAppOptInModal(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc('fn_update_notification_preferences', {
        p_user_id: userId,
        p_email_enabled: preferences.emailEnabled,
        p_whatsapp_enabled: preferences.whatsappEnabled,
        p_push_enabled: preferences.pushEnabled,
        p_in_app_enabled: preferences.inAppEnabled,
        p_reminders_enabled: preferences.remindersEnabled,
        p_marketing_enabled: preferences.marketingEnabled,
      });

      if (error) throw error;

      setSuccessMessage('Suas preferências de notificação foram salvas com sucesso.');
      if (onSaved && data) {
        onSaved({
          userId: data.user_id,
          inAppEnabled: data.in_app_enabled,
          emailEnabled: data.email_enabled,
          whatsappEnabled: data.whatsapp_enabled,
          whatsappOptInAt: data.whatsapp_opt_in_at,
          pushEnabled: data.push_enabled,
          remindersEnabled: data.reminders_enabled,
          marketingEnabled: data.marketing_enabled,
          clinicalAlertsEnabled: preferences.clinicalAlertsEnabled,
        });
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao salvar preferências.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando preferências de comunicação...</div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
      {/* Alerta de Sucesso ou Erro */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center space-x-3">
          <Check className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl flex items-center space-x-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <span className="text-sm font-medium">{errorMessage}</span>
        </div>
      )}

      {/* Caixa Informativa LGPD e Sigilo Clínico */}
      <div className="p-4 bg-blue-50/70 border border-blue-200/60 rounded-2xl flex items-start space-x-3 text-slate-700">
        <Lock className="w-5 h-5 text-[#005bb5] shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <strong className="text-[#005bb5] font-semibold block mb-0.5">Privacidade e Sigilo Clínico Garantidos</strong>
          Por diretrizes do CFMV e LGPD, nossas mensagens externas (e-mail e WhatsApp) contêm apenas informações essenciais e links protegidos com token seguro. Seus diagnósticos, receitas completas e prontuários nunca são expostos em texto livre.
        </div>
      </div>

      {/* Canais de Comunicação */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <h3 className="text-base font-semibold text-slate-900 flex items-center space-x-2">
          <span>Canais de Comunicação</span>
        </h3>

        <div className="divide-y divide-slate-100">
          {/* E-mail */}
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-blue-50 text-[#005bb5] rounded-lg mt-0.5">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Notificações por E-mail</p>
                <p className="text-xs text-slate-500">
                  Confirmações de agendamento, recibos de pagamento e avisos de receitas disponíveis.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.emailEnabled}
                onChange={(e) => setPreferences({ ...preferences, emailEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#005bb5]"></div>
            </label>
          </div>

          {/* WhatsApp Oficial */}
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-emerald-50 text-[#00b37e] rounded-lg mt-0.5">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-slate-900">WhatsApp Oficial (Business API)</p>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-100 text-[#00b37e]">
                    Opt-in Exigido
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Lembretes imediatos no dia da consulta e avisos urgentes pelo canal oficial da clínica.
                </p>
                {preferences.whatsappEnabled && preferences.whatsappOptInAt && (
                  <p className="text-[11px] text-emerald-600 mt-1 flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                    Consentimento registrado em {new Date(preferences.whatsappOptInAt).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.whatsappEnabled}
                onChange={(e) => handleWhatsAppToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00b37e]"></div>
            </label>
          </div>

          {/* Push Web / Mobile */}
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-lg mt-0.5">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Notificações Push no Navegador e Celular</p>
                <p className="text-xs text-slate-500">
                  Avisos sonoros quando o médico veterinário entrar na sala de teleconsulta.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.pushEnabled}
                onChange={(e) => setPreferences({ ...preferences, pushEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </label>
          </div>

          {/* In-App */}
          <div className="py-4 flex items-center justify-between">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-slate-100 text-slate-700 rounded-lg mt-0.5">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-900">Central de Avisos no Painel (In-App)</p>
                <p className="text-xs text-slate-500">
                  Histórico de alertas e novidades dentro da sua conta no portal TELEVET.
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.inAppEnabled}
                onChange={(e) => setPreferences({ ...preferences, inAppEnabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#005bb5]"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Categorias e Tipos de Alertas */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <h3 className="text-base font-semibold text-slate-900">Tipos de Alertas</h3>

        <div className="divide-y divide-slate-100">
          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Lembretes de Consultas e Vacinas</p>
              <p className="text-xs text-slate-500">Alertas de 24h e 1h antes do atendimento, e avisos de revacinação.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.remindersEnabled}
              onChange={(e) => setPreferences({ ...preferences, remindersEnabled: e.target.checked })}
              className="w-4 h-4 text-[#005bb5] rounded border-slate-300 focus:ring-[#005bb5]"
            />
          </div>

          <div className="py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Comunicações e Campanhas de Saúde Animal</p>
              <p className="text-xs text-slate-500">Artigos informativos de prevenção e campanhas veterinárias.</p>
            </div>
            <input
              type="checkbox"
              checked={preferences.marketingEnabled}
              onChange={(e) => setPreferences({ ...preferences, marketingEnabled: e.target.checked })}
              className="w-4 h-4 text-[#005bb5] rounded border-slate-300 focus:ring-[#005bb5]"
            />
          </div>
        </div>
      </div>

      {/* Botão de Gravação */}
      <div className="flex justify-end space-x-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-[#005bb5] hover:bg-[#004488] text-white font-medium text-sm rounded-xl shadow-sm transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-[#005bb5] disabled:opacity-50"
        >
          {saving ? 'Salvando preferências...' : 'Salvar Preferências'}
        </button>
      </div>

      {/* Modal de Confirmação de Opt-in para WhatsApp */}
      {showWhatsAppOptInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200">
            <div className="w-12 h-12 bg-emerald-100 text-[#00b37e] rounded-2xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Consentimento para WhatsApp Oficial</h4>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              Ao ativar este canal, você autoriza expressamente a plataforma TELEVET a enviar notificações operacionais, avisos de consulta e links de receitas assinadas para o seu número via <strong>WhatsApp Business API Oficial</strong>.
            </p>
            <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500">
              ✓ Sem spam ou mensagens invasivas.<br />
              ✓ Protegido pela Política de Privacidade e LGPD.<br />
              ✓ Possibilidade de revogar o consentimento a qualquer momento.
            </div>
            <div className="mt-6 flex space-x-3 justify-end">
              <button
                type="button"
                onClick={() => setShowWhatsAppOptInModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmWhatsAppOptIn}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#00b37e] hover:bg-[#009266] rounded-xl shadow-sm"
              >
                Concordar e Ativar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
