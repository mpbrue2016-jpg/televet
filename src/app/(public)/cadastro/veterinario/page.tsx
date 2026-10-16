'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Stethoscope, Mail, Lock, User, Phone, CheckCircle2, ShieldCheck, FileText, Badge } from 'lucide-react'
import Link from 'next/link'

// Regras simples para exemplificar
const cpfCnpjRegex = /^\d{11}|\d{14}$/
const phoneRegex = /^[1-9]{2}(?:[2-8]|9[0-9])[0-9]{3}[0-9]{4}$/

const vetSchema = z.object({
  fullName: z.string().min(3, 'Nome completo é obrigatório'),
  email: z.string().email('E-mail inválido'),
  documentId: z.string().regex(cpfCnpjRegex, 'Informe CPF (11) ou CNPJ (14) apenas números'),
  crmv: z.string().min(4, 'O CRMV deve ter pelo menos 4 caracteres'),
  crmvState: z.string().length(2, 'Informe a UF do CRMV (ex: SP)'),
  phone: z.string().regex(phoneRegex, 'Telefone inválido (Ex: 11999999999)'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os termos de uso e a política de privacidade.' }),
  }),
})

type VetFormValues = z.infer<typeof vetSchema>

export default function VetRegistrationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VetFormValues>({
    resolver: zodResolver(vetSchema),
  })

  const onSubmit = async (data: VetFormValues) => {
    setIsSubmitting(true)
    // Simular API request ao Supabase Auth
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setIsSubmitting(false)
    setIsSuccess(true)
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full p-8 rounded-3xl shadow-xl text-center space-y-6">
          <div className="mx-auto bg-green-100 w-20 h-20 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Conta Criada!</h2>
          <p className="text-slate-600">
            Sua conta de Médico Veterinário foi registrada. Em breve enviaremos as instruções no seu e-mail para configurar sua carteira digital e seu consultório online!
          </p>
          <Link
            href="/login"
            className="inline-block w-full bg-teal-600 text-white font-semibold py-3 rounded-xl hover:bg-teal-700 transition"
          >
            Acessar Plataforma
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-xl text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 mb-4 shadow-sm">
          <Stethoscope className="w-8 h-8 text-teal-600" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Cadastro para Veterinários</h2>
        <p className="mt-2 text-sm text-slate-600">
          Abra seu consultório virtual e expanda seus atendimentos na nossa plataforma.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    {...register('fullName')}
                    className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="Dr. José da Silva"
                  />
                </div>
                {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">E-mail Profissional</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    type="email"
                    {...register('email')}
                    className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="contato@vet.com.br"
                  />
                </div>
                {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CPF ou CNPJ</label>
                <input
                  type="text"
                  {...register('documentId')}
                  className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                  placeholder="Somente números"
                  maxLength={14}
                />
                {errors.documentId && <p className="mt-1 text-xs text-red-600">{errors.documentId.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Celular</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    {...register('phone')}
                    className="pl-9 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="(11) 99999-9999"
                    maxLength={11}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CRMV</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    {...register('crmv')}
                    className="pl-9 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="12345"
                  />
                </div>
                {errors.crmv && <p className="mt-1 text-xs text-red-600">{errors.crmv.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">UF (CRMV)</label>
                <select
                  {...register('crmvState')}
                  className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors uppercase"
                >
                  <option value="">Selecione...</option>
                  <option value="SP">SP</option>
                  <option value="RJ">RJ</option>
                  <option value="MG">MG</option>
                  <option value="RS">RS</option>
                  <option value="PR">PR</option>
                  <option value="SC">SC</option>
                  {/* Poderia listar os demais aqui */}
                  <option value="BA">BA</option>
                </select>
                {errors.crmvState && <p className="mt-1 text-xs text-red-600">{errors.crmvState.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  {...register('password')}
                  className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-teal-500 focus:border-teal-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                  placeholder="••••••••"
                />
              </div>
              {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    {...register('acceptTerms')}
                    className="h-4 w-4 text-teal-600 focus:ring-teal-500 border-slate-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label className="font-medium text-slate-700 flex flex-wrap items-center gap-1">
                    Eu declaro ser Médico(a) Veterinário(a) e aceito os 
                    <Link href="/termos" className="text-teal-600 hover:underline flex items-center gap-1">
                      Termos de Uso
                    </Link> 
                    e a 
                    <Link href="/privacidade" className="text-teal-600 hover:underline flex items-center gap-1">
                       Política de Privacidade
                    </Link>.
                  </label>
                  {errors.acceptTerms && <p className="mt-1 text-sm text-red-600">{errors.acceptTerms.message}</p>}
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Aguarde...
                  </div>
                ) : (
                  'Cadastrar'
                )}
              </button>
            </div>
            <div className="text-center text-sm text-slate-500 mt-4">
              Já faz parte da rede? <Link href="/login" className="font-semibold text-teal-600 hover:text-teal-500">Acesse seu consultório</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
