'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PawPrint, CalendarDays, FileText, Settings, LogOut, Bell } from 'lucide-react'
import { getSupabaseClient } from '@/config/supabase-client'

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  const [portalTitle, setPortalTitle] = useState('Portal de Saúde')
  const [userInitial, setUserInitial] = useState('')

  useEffect(() => {
    let active = true
    const supabase = getSupabaseClient()
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || !active) return
      const [{ data: profile }, { data: veterinarian }] = await Promise.all([
        supabase.from('users').select('full_name').eq('id', data.user.id).maybeSingle(),
        supabase.from('veterinarians').select('id').eq('user_id', data.user.id).maybeSingle(),
      ])
      if (!active) return
      const fullName = profile?.full_name ?? ''
      setUserInitial(fullName.trim().charAt(0).toUpperCase())
      setPortalTitle(veterinarian ? 'Painel do Veterinário' : 'Portal do Tutor')
    })
    return () => { active = false }
  }, [])

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar Mobile & Desktop (simplificada para o contexto) */}
      <aside className="w-full md:w-64 bg-white border-r border-slate-200 flex-shrink-0 flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl">
            <PawPrint className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-800">TeleVet</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 text-blue-700 bg-blue-50 rounded-xl font-medium transition-colors">
            <PawPrint className="w-5 h-5" />
            Meus Pets
          </Link>
          <Link href="/agendamentos" className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
            <CalendarDays className="w-5 h-5" />
            Consultas
          </Link>
          <Link href="/documentos" className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
            <FileText className="w-5 h-5" />
            Documentos
          </Link>
          <Link href="/configuracoes" className="flex items-center gap-3 px-4 py-3 text-slate-600 hover:bg-slate-50 rounded-xl font-medium transition-colors">
            <Settings className="w-5 h-5" />
            Perfil & Ajustes
          </Link>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button className="flex w-full items-center gap-3 px-4 py-3 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-xl font-medium transition-colors">
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">{portalTitle}</h2>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-slate-400 hover:bg-slate-50 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold" aria-hidden="true">
                {userInitial || 'U'}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">Conta autenticada</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
