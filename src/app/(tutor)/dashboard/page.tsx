'use client';

import { useEffect, useState } from 'react';
import { Plus, Activity, FileText, ChevronRight, CalendarDays, PawPrint, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { getSupabaseClient } from '@/config/supabase-client';
import { TutorService, type PetDTO } from '@/appointments/tutor-service';
import { EmergencyBanner } from '@/components/directory/emergency-banner';

function formatAge(birthDate?: string): string {
  if (!birthDate) return 'Não informada';
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return 'Não informada';
  const now = new Date();
  const months = Math.max(0, (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth()));
  if (months < 1) return 'Menos de 1 mês';
  if (months < 24) return `${months} ${months === 1 ? 'mês' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'ano' : 'anos'}`;
}

const SPECIES_LABEL: Record<string, string> = {
  canine: 'Cão',
  feline: 'Gato',
  avian: 'Ave',
  reptile: 'Réptil',
  rodent: 'Roedor',
  other: 'Outro',
};

export default function TutorDashboardPage() {
  const [pets, setPets] = useState<PetDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPets = async () => {
    setLoading(true);
    setError('');
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Sessão expirada. Entre novamente para ver os seus pets.');
        setPets([]);
        return;
      }
      const { pets: ownedPets } = await new TutorService().getTutorProfile(user.id);
      setPets(ownedPets);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar seus pets.');
      setPets([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPets(); }, []);

  return (
    <div className="space-y-8">
      {/* Atalho de Emergência para Ambulâncias 24h e Resgate */}
      <EmergencyBanner compact />

      {/* Header Resumo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Meus Pets</h1>
          <p className="text-slate-500 mt-1">Acompanhe a saúde e o histórico clínico dos seus animais.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadPets()} disabled={loading} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <Link href="/dashboard/pet/novo" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
            <Plus className="w-5 h-5" />
            Cadastrar Novo Pet
          </Link>
        </div>
      </div>

      {error && <div role="alert" className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">{error}</div>}
      {loading && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" aria-label="Carregando pets"><div className="h-72 animate-pulse rounded-3xl bg-slate-100" /><div className="h-72 animate-pulse rounded-3xl bg-slate-100" /></div>}
      {!loading && !error && pets.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white py-16 text-center">
          <PawPrint className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 font-medium text-slate-700">Nenhum pet cadastrado</p>
          <p className="mt-1 text-sm text-slate-500">Cadastre seu animal para gerar o prontuário eletrônico.</p>
        </div>
      )}

      {/* Grade de Pets */}
      {!loading && pets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pets.map((pet) => (
          <div key={pet.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm hover:shadow-lg transition-all group">
            <div className="h-48 overflow-hidden bg-slate-100 grid place-items-center">
              {pet.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pet.photoUrl} alt={pet.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              ) : (
                <PawPrint className="h-12 w-12 text-slate-300" />
              )}
            </div>

            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{pet.name}</h3>
                  <p className="text-sm font-medium text-blue-600">{SPECIES_LABEL[pet.species] ?? pet.species}{pet.breed ? ` · ${pet.breed}` : ''}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Idade</span>
                  <span className="font-semibold text-slate-800">{formatAge(pet.birthDate)}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <span className="text-xs text-slate-500 block mb-1">Peso (último)</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <Activity className="w-4 h-4 text-green-500" />
                    {pet.weightKg ? `${pet.weightKg} kg` : 'Não informado'}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Link href={`/dashboard/pet/${pet.id}`} className="flex-1 bg-slate-900 text-white text-center py-2.5 rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors">
                  Acessar Prontuário
                </Link>
                <Link href={`/dashboard/pet/${pet.id}`} aria-label={`Documentos de ${pet.name}`} className="p-2.5 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors">
                  <FileText className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Alertas Gerais (Ex: Consulta próxima) */}
      <div className="mt-12 bg-blue-50 border border-blue-100 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="bg-white p-4 rounded-2xl shadow-sm text-blue-600">
            <CalendarDays className="w-8 h-8" />
          </div>
          <div>
            <h4 className="text-lg font-bold text-slate-900">Precisa de uma consulta?</h4>
            <p className="text-slate-600 mt-1">Agende uma teleconsulta e acompanhe tudo pelo prontuário do seu pet.</p>
          </div>
        </div>
        <Link href="/agendamento" className="flex-shrink-0 bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm">
          Agendar
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

    </div>
  );
}
