'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { ArrowLeft, Camera, PawPrint, Save, Info } from 'lucide-react'

// Schema usando validação do Zod
const petSchema = z.object({
  name: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  species: z.enum(['canine', 'feline', 'avian', 'reptile', 'rodent', 'other'], { required_error: 'Selecione a espécie' }),
  breed: z.string().min(2, 'Informe a raça'),
  sex: z.enum(['male', 'female', 'unknown'], { required_error: 'Selecione o sexo' }),
  isNeutered: z.boolean().default(false),
  birthDateApprox: z.boolean().default(false),
  birthDate: z.string().optional(),
  color: z.string().min(3, 'Informe a cor da pelagem'),
  weightKg: z.string().min(1, 'Informe o peso em Kg (ex: 4.5)'),
  microchipNumber: z.string().optional(),
  allergies: z.string().optional(),
  chronicConditions: z.string().optional(),
})

type PetFormValues = z.infer<typeof petSchema>

export default function NovoPetPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const { register, handleSubmit, formState: { errors }, watch } = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    defaultValues: {
      isNeutered: false,
      birthDateApprox: false
    }
  })

  // Watchers para dependências do form
  const isBirthApprox = watch('birthDateApprox')
  const selectedSpecies = watch('species')

  const onSubmit = async (data: PetFormValues) => {
    setIsSubmitting(true)
    // Aqui seria feito o envio via Supabase Client simulado:
    // const { error } = await supabase.from('pets').insert({...})
    await new Promise((resolve) => setTimeout(resolve, 1200))
    setIsSubmitting(false)
    window.location.href = '/dashboard' // Redireciona mock
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <Link href="/dashboard" className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PawPrint className="w-6 h-6 text-blue-600" />
            Cadastrar Novo Pet
          </h1>
          <p className="text-slate-500 mt-1">Preencha as informações para gerar o prontuário eletrônico.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <form onSubmit={handleSubmit(onSubmit)} className="p-8 space-y-8">
          
          {/* Sessão: Foto */}
          <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
            <div className="w-32 h-32 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 transition-colors shrink-0">
              <Camera className="w-8 h-8 mb-2" />
              <span className="text-xs font-medium">Adicionar Foto</span>
            </div>
            <div className="pt-2 text-center sm:text-left">
              <h3 className="text-lg font-semibold text-slate-800">Foto de Identificação</h3>
              <p className="text-sm text-slate-500 mt-1">Use uma imagem nítida do rosto do animal. Apenas arquivos JPG, PNG ou WebP até 5MB.</p>
              <input type="file" accept="image/png, image/jpeg, image/webp" className="mt-3 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Sessão: Dados Básicos */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Informações Básicas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome do Pet *</label>
                <input type="text" {...register('name')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Ex: Thor" />
                {errors.name && <span className="text-red-500 text-xs mt-1">{errors.name.message}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Espécie *</label>
                <select {...register('species')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3">
                  <option value="">Selecione...</option>
                  <option value="canine">Canino (Cachorro)</option>
                  <option value="feline">Felino (Gato)</option>
                  <option value="avian">Ave</option>
                  <option value="reptile">Réptil</option>
                  <option value="rodent">Roedor</option>
                  <option value="other">Outro</option>
                </select>
                {errors.species && <span className="text-red-500 text-xs mt-1">{errors.species.message}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Raça *</label>
                <input type="text" {...register('breed')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Ex: Poodle, SRD (Vira-lata)" />
                {errors.breed && <span className="text-red-500 text-xs mt-1">{errors.breed.message}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sexo *</label>
                <select {...register('sex')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3">
                  <option value="">Selecione...</option>
                  <option value="male">Macho</option>
                  <option value="female">Fêmea</option>
                  <option value="unknown">Não sei informar</option>
                </select>
                {errors.sex && <span className="text-red-500 text-xs mt-1">{errors.sex.message}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cor da Pelagem *</label>
                <input type="text" {...register('color')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Ex: Preto e Branco" />
                {errors.color && <span className="text-red-500 text-xs mt-1">{errors.color.message}</span>}
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Sessão: Características Clínicas */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">Características Físicas e Idade</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data de Nascimento (estimada ou real)</label>
                <input type="date" {...register('birthDate')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" />
                <div className="flex items-center mt-2">
                  <input type="checkbox" {...register('birthDateApprox')} id="approx" className="h-4 w-4 text-blue-600 rounded border-slate-300" />
                  <label htmlFor="approx" className="ml-2 text-sm text-slate-600">Não sei o dia exato (Data Aproximada)</label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peso Atual (Kg) *</label>
                <input type="number" step="0.01" {...register('weightKg')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Ex: 5.5" />
                {errors.weightKg && <span className="text-red-500 text-xs mt-1">{errors.weightKg.message}</span>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Número do Microchip</label>
                <input type="text" {...register('microchipNumber')} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Opcional" />
              </div>

              <div className="flex items-center pt-8">
                <input type="checkbox" {...register('isNeutered')} id="neutered" className="h-5 w-5 text-blue-600 rounded border-slate-300" />
                <label htmlFor="neutered" className="ml-3 text-base font-medium text-slate-700">O animal é castrado?</label>
              </div>
            </div>
          </div>

          <hr className="border-slate-100" />

          {/* Sessão: Histórico Médico Resumido */}
          <div>
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Informações de Saúde (Opcional)</h3>
            <div className="bg-blue-50 rounded-xl p-4 mb-6 flex gap-3 text-blue-800 text-sm">
              <Info className="w-5 h-5 shrink-0" />
              <p>Essas informações estarão visíveis no prontuário para os veterinários, ajudando a prevenir acidentes com alergias medicamentosas durante as teleconsultas.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Alergias Conhecidas</label>
                <textarea {...register('allergies')} rows={3} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Alergia a dipirona, carne de frango..."></textarea>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Condições Crônicas</label>
                <textarea {...register('chronicConditions')} rows={3} className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-slate-50 border p-3" placeholder="Diabetes, Sopro Cardíaco..."></textarea>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-slate-200">
            <Link href="/dashboard" className="px-6 py-3 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition-colors">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Salvando...</span>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Salvar Cadastro
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
