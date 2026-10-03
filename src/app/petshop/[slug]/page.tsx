import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { CopyButton } from "./copy-button"
import { CheckCircle2, Video, MapPin, Clock } from "lucide-react"

export default async function PetshopPage({
  params,
}: {
  params: { slug: string }
}) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )

  const { data: petshop, error } = await supabase.rpc('get_public_petshop_profile', {
    p_identifier: params.slug
  })

  if (error || !petshop) {
    if (params.slug !== 'demo' && params.slug !== 'animal-feliz') {
       notFound()
    }
  }

  // Fallback defaults for missing data or demo mode
  const profile = {
    name: petshop?.trade_name || petshop?.name || "Pet Shop Animal Feliz",
    tradeName: petshop?.trade_name || "Animal Feliz Matriz",
    slug: petshop?.slug || "animal-feliz",
    primaryColor: petshop?.white_label_config?.primary_color || "#005bb5", // drvets blue
    secondaryColor: petshop?.white_label_config?.secondary_color || "#00b37e", // drvets green
    referralCode: petshop?.referral_code || "AFELIZ2026",
    address: petshop?.address || "Rua das Flores, 120 - Centro",
    hours: petshop?.business_hours || "Segunda a Sexta: 08:00 - 19:00",
    about: petshop?.about || "Trazendo carinho e os melhores produtos para a sua família."
  }

  const exclusiveLink = `https://televet.com/petshop/${profile.slug}?ref=${profile.referralCode}`
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(exclusiveLink)}`
  const whatsappLink = `https://api.whatsapp.com/send?text=${encodeURIComponent('Conheça o atendimento veterinário online do ' + profile.name + ': ' + exclusiveLink)}`

  return (
    <div className="min-h-screen bg-white text-slate-800 font-sans flex flex-col items-center">
      
      {/* Mobile-first constraints matching drvets app */}
      <div className="w-full max-w-md mx-auto relative flex-1 flex flex-col">
        
        {/* Topbar White-Label Indicator */}
        <div 
          className="w-full text-center py-2 text-[10px] font-bold text-white uppercase tracking-wider"
          style={{ background: `linear-gradient(90deg, ${profile.primaryColor}, ${profile.secondaryColor})` }}
        >
          Parceiro Credenciado: {profile.tradeName}
        </div>

        {/* Header Hero Area */}
        <header className="px-6 pt-8 pb-4">
          <div className="flex flex-col items-center text-center">
             <img 
              src="https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?auto=format&fit=crop&w=200&q=80" 
              alt={`Logo ${profile.name}`}
              className="w-20 h-20 rounded-2xl shadow-md border-2 object-cover mb-4"
              style={{ borderColor: profile.secondaryColor }}
            />
            <h1 className="text-2xl font-extrabold text-[#005bb5]">{profile.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{profile.about}</p>
          </div>
        </header>

        {/* Main Action Content */}
        <main className="px-6 py-4 flex-1">
          
          <div className="bg-[#e6f7f1] rounded-2xl p-6 text-center shadow-sm border border-[#00b37e]/10 relative overflow-hidden mb-6">
            <div className="inline-flex items-center gap-1.5 bg-white text-[#008a5e] px-3 py-1.5 rounded-full text-[10px] font-bold mb-4 shadow-sm">
              <CheckCircle2 size={12} />
              Telemedicina Oficial
            </div>
            
            <h2 className="text-xl font-extrabold text-[#005bb5] mb-2 leading-tight">
              Seu pet não está bem?
            </h2>
            <p className="text-slate-600 text-sm mb-6 font-medium">
              Realize uma consulta online agora e receba orientações de veterinários confiáveis.
            </p>

            <Link 
              href={`/agendamento?ref=${profile.referralCode}`}
              className="flex items-center justify-center gap-2 w-full py-3.5 px-4 rounded-xl text-white font-bold shadow-[0_4px_14px_rgba(0,179,126,0.3)] hover:opacity-90 transition-opacity"
              style={{ background: `linear-gradient(90deg, ${profile.primaryColor} 0%, ${profile.secondaryColor} 100%)` }}
            >
              <Video fill="currentColor" size={20} />
              <span>Agendar Teleconsulta</span>
            </Link>
          </div>

          {/* Info & Location */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 mb-6">
            <h3 className="text-sm font-bold text-[#005bb5] mb-4">Informações da Loja</h3>
            
            <div className="flex items-start gap-3 mb-4">
              <MapPin className="text-[#00b37e] shrink-0" size={18} />
              <div className="text-sm">
                <strong className="block text-slate-700">Endereço</strong>
                <span className="text-slate-500">{profile.address}</span>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="text-[#00b37e] shrink-0" size={18} />
              <div className="text-sm">
                <strong className="block text-slate-700">Funcionamento</strong>
                <span className="text-slate-500">{profile.hours}</span>
              </div>
            </div>
          </div>

          {/* Sharing / QR */}
          <div className="text-center pb-8">
             <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Acesse pelo Celular</h3>
             <div className="bg-white p-3 rounded-2xl inline-block shadow-sm border border-slate-100 mb-4">
               <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />
             </div>
             <a 
                href={whatsappLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#25d366] hover:bg-[#1ebc59] text-white font-bold py-3 px-5 rounded-xl transition-colors w-full mb-3 shadow-sm text-sm"
              >
                Compartilhar via WhatsApp
              </a>
          </div>

        </main>
      </div>
    </div>
  )
}
