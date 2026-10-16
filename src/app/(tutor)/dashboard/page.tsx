import { Plus, Activity, Syringe, FileText, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export default function TutorDashboardPage() {
  // Mocks simplificados simulando a resposta do Supabase RLS
  const pets = [
    {
      id: '1',
      name: 'Bolinha',
      species: 'Canine',
      breed: 'Golden Retriever',
      age: '3 anos',
      weight: '28.5 kg',
      photoUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&q=80&w=200&h=200',
      nextVaccine: '12 Nov 2026',
    },
    {
      id: '2',
      name: 'Mia',
      species: 'Feline',
      breed: 'Siamês',
      age: '1 ano',
      weight: '4.2 kg',
      photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&q=80&w=200&h=200',
      nextVaccine: '05 Jan 2027',
    }
  ]

  return (
    <div className="space-y-8">
      {/* Header Resumo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meus Pets</h1>
          <p className="text-slate-500 mt-1">Acompanhe a saúde e o histórico clínico dos seus animais.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
          <Plus className="w-5 h-5" />
          Cadastrar Novo Pet
        </button>
      </div>

      {/* Grade de Pets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pets.map((pet) => (
          <div key={pet.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg transition-all group cursor-pointer relative">
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold text-slate-700 shadow-sm flex items-center gap-1">
              <Syringe className="w-3 h-3 text-blue-500" />
              Vacina: {pet.nextVaccine}
            </div>
            
            <div className="h-48 overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={pet.photoUrl} 
                alt={pet.name} 
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{pet.name}</h3>
                  <p className="text-sm font-medium text-blue-600">{pet.breed}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Idade</span>
                  <span className="font-semibold text-slate-800">{pet.age}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Peso (Último)</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <Activity className="w-4 h-4 text-green-500" />
                    {pet.weight}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href={`/dashboard/pet/${pet.id}`} className="flex-1 bg-slate-900 text-white text-center py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                  Acessar Prontuário
                </Link>
                <button className="p-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
                  <FileText className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas Gerais (Ex: Consulta próxima) */}
      <div className="mt-12 bg-blue-50 border border-blue-100 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white p-4 rounded-2xl shadow-sm text-blue-600">
            <CalendarDays className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Consulta Agendada!</h4>
            <p className="text-slate-600 mt-1">Teleconsulta com Dr. Roberto (Cardiologia) para <strong>Bolinha</strong> amanhã às 14:00.</p>
          </div>
        </div>
        <button className="flex-shrink-0 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
          Acessar Sala
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

    </div>
  )
}
