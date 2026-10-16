'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PawPrint, Mail, Lock, User, Phone, CheckCircle2, ShieldCheck, FileText } from 'lucide-react'
import Link from 'next/link'

// Validação simples de CPF (somente números, 11 dígitos, poderia adicionar dígito verificador real)
const cpfRegex = /^\d{11}$/
// Validação de telefone BR (10 a 11 dígitos)
const phoneRegex = /^[1-9]{2}(?:[2-8]|9[0-9])[0-9]{3}[0-9]{4}$/

const tutorSchema = z.object({
  fullName: z.string().min(3, 'Nome completo é obrigatório'),
  email: z.string().email('E-mail inválido'),
  cpf: z.string().regex(cpfRegex, 'CPF deve conter 11 números sem pontuação'),
  phone: z.string().regex(phoneRegex, 'Telefone inválido (Ex: 11999999999)'),
  password: z.string().min(8, 'Senha deve ter no mínimo 8 caracteres'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Você precisa aceitar os termos de uso e privacidade.' }),
  }),
})

type TutorFormValues = z.infer<typeof tutorSchema>

export default function TutorRegistrationPage() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TutorFormValues>({
    resolver: zodResolver(tutorSchema),
  })

  const onSubmit = async (data: TutorFormValues) => {
    setIsSubmitting(true)
    // Simular chamada ao Supabase / Auth
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
            Enviamos um e-mail de confirmação para você. Por favor, verifique sua caixa de entrada para ativar sua conta.
          </p>
          <Link
            href="/login"
            className="inline-block w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition"
          >
            Ir para o Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4 shadow-sm">
          <PawPrint className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Crie sua conta de Tutor</h2>
        <p className="mt-2 text-sm text-slate-600">
          Gerencie a saúde do seu pet de forma simples e segura.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-2xl rounded-3xl sm:px-10 border border-slate-100">
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="text"
                  {...register('fullName')}
                  className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                  placeholder="João da Silva"
                />
              </div>
              {errors.fullName && <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  {...register('email')}
                  className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                  placeholder="voce@exemplo.com"
                />
              </div>
              {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">CPF</label>
                <div className="relative">
                  <input
                    type="text"
                    {...register('cpf')}
                    className="block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="000.000.000-00"
                    maxLength={11}
                  />
                </div>
                {errors.cpf && <p className="mt-1 text-xs text-red-600">{errors.cpf.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telefone (Celular)</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="tel"
                    {...register('phone')}
                    className="pl-9 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
                    placeholder="(11) 99999-9999"
                    maxLength={11}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>}
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
                  className="pl-10 block w-full border-slate-300 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-slate-50 border p-3 transition-colors"
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
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label className="font-medium text-slate-700 flex flex-wrap items-center gap-1">
                    Eu concordo com os 
                    <Link href="/termos" className="text-blue-600 hover:underline flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Termos de Uso
                    </Link> 
                    e 
                    <Link href="/privacidade" className="text-blue-600 hover:underline flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Política de Privacidade
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
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Criando conta...
                  </div>
                ) : (
                  'Cadastrar'
                )}
              </button>
            </div>
            <div className="text-center text-sm text-slate-500 mt-4">
              Já tem uma conta? <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-500">Faça login</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
