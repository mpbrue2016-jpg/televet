import Link from "next/link"
import { Menu, CheckCircle2, Video, Home, Calendar, PawPrint, User } from "lucide-react"
import { Logo } from "@/components/ui/logo"

export default function MobileHome() {
  return (
    <div className="flex flex-col min-h-screen bg-white max-w-md mx-auto relative shadow-2xl overflow-hidden font-sans">
      
      {/* Background Image (Vet with Dog) positioned absolutely */}
      <div 
        className="absolute inset-0 z-0 opacity-90"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1596492784531-6e6eb5ea9993?auto=format&fit=crop&w=800&q=80')",
          backgroundPosition: "right 20% top 30%",
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat"
        }}
      >
        {/* Gradient overlay to ensure text readability on the left */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent w-full"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-white/90 via-transparent to-white w-full"></div>
      </div>

      {/* Header */}
      <header className="flex justify-between items-center p-6 z-10 relative">
        <Logo />
        
        <button className="text-[#00b37e]">
          <Menu size={32} strokeWidth={2.5} />
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-6 pt-2 z-10 relative flex flex-col justify-center pb-24">
        
        {/* Trust Badge */}
        <div className="inline-flex items-center gap-1.5 bg-[#e6f7f1] text-[#008a5e] px-3 py-1.5 rounded-full text-xs font-bold w-max mb-6">
          <CheckCircle2 size={14} />
          Profissionais com CRMV verificado
        </div>

        {/* Hero Heading */}
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-[1.1] tracking-tight mb-4 max-w-[280px]">
          <span className="text-[#005bb5] block">Cuidado</span>
          <span className="text-[#005bb5] block">veterinário,</span>
          <span className="text-[#00b37e] block">onde seu pet</span>
          <span className="text-[#00b37e] block">estiver:</span>
        </h1>

        {/* Description */}
        <p className="text-slate-700 text-sm sm:text-base leading-relaxed max-w-[260px] mb-8 font-medium">
          Converse por video com veterinários selecionados, receba orientações e cuide de quem faz parte da sua família.
        </p>

        {/* CTA Button */}
        <Link 
          href="/veterinarios"
          className="flex items-center justify-between w-full py-4 px-6 rounded-2xl text-white font-bold text-lg shadow-xl hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg, #005bb5 0%, #00b37e 100%)" }}
        >
          <div className="flex items-center gap-3">
            <Video fill="currentColor" size={24} />
            <span>Encontrar veterinário</span>
          </div>
          <span className="text-2xl leading-none">→</span>
        </Link>
        
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-slate-100 flex justify-around items-center pt-3 pb-6 z-20 fixed bottom-0 w-full max-w-md left-1/2 -translate-x-1/2 rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <Link href="/" className="flex flex-col items-center gap-1 text-[#00b37e] relative">
          <Home size={24} strokeWidth={2.5} />
          <span className="text-[10px] font-bold">Início</span>
          <div className="absolute -bottom-3 w-8 h-1 bg-[#00b37e] rounded-full"></div>
        </Link>
        
        <Link href="/consultas" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <Calendar size={24} strokeWidth={2} />
          <span className="text-[10px] font-semibold">Consultas</span>
        </Link>
        
        <Link href="/pets" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <PawPrint size={24} strokeWidth={2} />
          <span className="text-[10px] font-semibold">Meus Pets</span>
        </Link>
        
        <Link href="/perfil" className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
          <User size={24} strokeWidth={2} />
          <span className="text-[10px] font-semibold">Perfil</span>
        </Link>
      </nav>
      
    </div>
  )
}
