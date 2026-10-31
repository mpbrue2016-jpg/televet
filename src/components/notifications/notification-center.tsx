'use client';

import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  AlertCircle,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  ExternalLink,
  X,
  CheckCheck,
} from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';

interface InAppNotification {
  id: string;
  title: string;
  message: string;
  category: string;
  action_url?: string | null;
  read_at?: string | null;
  created_at: string;
}

export function NotificationCenter({ userId }: { userId?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const supabase = getSupabaseClient();

  // Buscar notificações
  const fetchNotifications = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data);
      }
    } catch (err) {
      console.error('Erro ao carregar notificações:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Erro ao marcar como lida:', err);
    }
  };

  const markAllAsRead = async () => {
    if (!userId) return;
    try {
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);

      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
    } catch (err) {
      console.error('Erro ao marcar todas como lidas:', err);
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category.includes('appointment')) return <Calendar className="w-4 h-4 text-blue-500" />;
    if (category.includes('payment')) return <CreditCard className="w-4 h-4 text-emerald-500" />;
    if (category.includes('prescription') || category.includes('exam')) return <FileText className="w-4 h-4 text-indigo-500" />;
    if (category.includes('vaccine')) return <CheckCircle2 className="w-4 h-4 text-amber-500" />;
    return <AlertCircle className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="relative inline-block text-left">
      {/* Botão de Sino */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#005bb5]"
        aria-label="Abrir central de notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Painel Dropdown */}
      {isOpen && (
        <div className="fixed inset-x-4 top-16 md:absolute md:inset-x-auto md:right-0 md:top-12 z-50 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="font-semibold text-slate-800 text-sm">Notificações</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-[#005bb5] rounded-full">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-[#005bb5] hover:text-[#004488] font-medium flex items-center space-x-1 p-1 hover:bg-slate-200/50 rounded transition-colors"
                  title="Marcar todas como lidas"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Ler todas</span>
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs">Carregando avisos...</div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
                <p className="text-xs font-medium text-slate-500">Nenhuma notificação no momento.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Seus avisos de consultas e receitas aparecerão aqui.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 transition-colors hover:bg-slate-50/80 flex items-start space-x-3 ${
                    !item.read_at ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-slate-200/60 shrink-0 mt-0.5">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-xs ${!item.read_at ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {item.title}
                      </p>
                      {!item.read_at && (
                        <span className="w-2 h-2 rounded-full bg-[#005bb5] shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 flex items-center">
                        <Clock className="w-3 h-3 mr-1 opacity-70" />
                        {new Date(item.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <div className="flex items-center space-x-2">
                        {item.action_url && (
                          <a
                            href={item.action_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markAsRead(item.id)}
                            className="text-[11px] font-semibold text-[#005bb5] hover:underline flex items-center"
                          >
                            Acessar <ExternalLink className="w-3 h-3 ml-0.5" />
                          </a>
                        )}
                        {!item.read_at && (
                          <button
                            onClick={() => markAsRead(item.id)}
                            className="text-[11px] text-slate-400 hover:text-slate-600"
                          >
                            Marcar lida
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
            <a
              href="/notificacoes/preferencias"
              className="text-xs text-[#005bb5] hover:text-[#004488] font-medium transition-colors"
            >
              Configurar canais e preferências de comunicação &rarr;
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
