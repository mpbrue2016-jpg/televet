import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"
import { Logo } from "@/components/ui/logo"

export default async function BookingPage() {
  const initialPets = [
    { id: "1", name: "Thor", species: "Canina", breed: "Golden Retriever", age: "3 anos", avatar: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80" },
    { id: "2", name: "Luna", species: "Felina", breed: "Siamês", age: "1 ano", avatar: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80" }
  ]

  const initialTutor = {
    name: "Ana Carolina da Silva",
    cpf: "382.491.028-55",
    email: "ana.silva@email.com",
    phone: "(11) 98765-4321"
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-20">
      
      {/* App Header */}
      <header className="bg-white px-6 py-4 flex items-center justify-between shadow-sm relative z-10 border-b border-slate-100">
        <Link href="/" className="text-[#005bb5]">
          <ArrowLeft size={24} />
        </Link>
        <div className="scale-75 origin-right">
          <Logo />
        </div>
      </header>

      <div className="max-w-md mx-auto p-4 md:p-6 space-y-6">
        
        {/* Partner Stamp */}
        <div className="bg-[#e6f7f1] border border-[#00b37e]/20 p-4 rounded-2xl flex flex-col items-start gap-1 shadow-sm">
          <span className="text-[#008a5e] font-bold flex items-center gap-2 text-sm">
            <CheckCircle2 size={16} /> Atendimento vinculado ao parceiro
          </span>
          <span className="text-base font-extrabold text-[#005bb5]">Pet Shop Animal Feliz (Moema)</span>
        </div>

        {/* Booking Interactive Form */}
        <BookingForm initialPets={initialPets} initialTutor={initialTutor} />
        
      </div>
    </div>
  )
}
