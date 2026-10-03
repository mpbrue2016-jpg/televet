export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col ${className}`}>
      <div className="flex items-center text-4xl font-extrabold tracking-tighter leading-none">
        <span className="text-[#005bb5]">dr</span>
        <span className="text-[#005bb5]">v</span>
        <span className="text-[#00b37e] relative">
          e
          <span className="absolute -top-1 -right-2 text-xl">+</span>
        </span>
        <span className="text-[#00b37e]">ts</span>
      </div>
      <span className="text-[10px] font-bold tracking-widest text-[#005bb5] uppercase mt-1 leading-none">
        Tele Veterinária
      </span>
      <span className="text-[12px] italic text-[#00b37e] font-serif mt-0.5 leading-none">
        Seu pet sempre por perto
      </span>
    </div>
  )
}
