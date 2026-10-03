"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function BookingForm({ initialPets, initialTutor }: { initialPets: any[], initialTutor: any }) {
  const router = useRouter()
  const [pets, setPets] = useState(initialPets)
  const [selectedPet, setSelectedPet] = useState(initialPets[0]?.id)
  const [showNewPetForm, setShowNewPetForm] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState("10:30")
  const [tutorData, setTutorData] = useState(initialTutor)
  
  const [newPet, setNewPet] = useState({ name: "", species: "Canina", breed: "" })

  const handleAddPet = () => {
    if (!newPet.name) return alert("Por favor, informe o nome do pet.")
    const pet = {
      id: Math.random().toString(),
      name: newPet.name,
      species: newPet.species,
      breed: newPet.breed || "SRD",
      age: "Novo",
      avatar: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?auto=format&fit=crop&w=150&q=80"
    }
    setPets([...pets, pet])
    setSelectedPet(pet.id)
    setShowNewPetForm(false)
    setNewPet({ name: "", species: "Canina", breed: "" })
  }

  const handleCheckout = () => {
    router.push("/checkout")
  }

  return (
    <div className="space-y-6 pb-6">
      
      {/* Contact Info Card */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 md:p-6">
        <h2 className="text-lg font-bold text-[#005bb5] mb-4">1. Seus Dados de Contato</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Nome Completo:</label>
            <input type="text" value={tutorData.name} onChange={(e) => setTutorData({...tutorData, name: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-[#005bb5] focus:bg-white transition-colors" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">CPF:</label>
            <input type="text" value={tutorData.cpf} onChange={(e) => setTutorData({...tutorData, cpf: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-[#005bb5] focus:bg-white transition-colors" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">E-mail para Recebimento:</label>
            <input type="email" value={tutorData.email} onChange={(e) => setTutorData({...tutorData, email: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-[#005bb5] focus:bg-white transition-colors" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">WhatsApp / Celular:</label>
            <input type="tel" value={tutorData.phone} onChange={(e) => setTutorData({...tutorData, phone: e.target.value})} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-[#005bb5] focus:bg-white transition-colors" />
          </div>
        </div>
      </div>

      {/* Pet Selection Card */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 md:p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-3">
          <h2 className="text-lg font-bold text-[#005bb5]">2. Selecione o Paciente</h2>
          <button 
            onClick={() => setShowNewPetForm(!showNewPetForm)}
            className="text-[#00b37e] bg-[#e6f7f1] hover:bg-[#cceee3] px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
          >
            {showNewPetForm ? "✕ Cancelar" : "+ Cadastrar Novo Pet"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {pets.map((pet) => (
            <div 
              key={pet.id} 
              onClick={() => setSelectedPet(pet.id)}
              className={`border-2 rounded-xl p-3 text-center cursor-pointer transition-all ${
                selectedPet === pet.id 
                  ? 'border-[#00b37e] bg-[#e6f7f1]' 
                  : 'border-slate-100 bg-white hover:border-slate-300'
              }`}
            >
              <img src={pet.avatar} alt={pet.name} className="w-12 h-12 rounded-full mx-auto mb-2 object-cover" />
              <strong className="block text-slate-800 text-sm">{pet.name}</strong>
              <span className="text-xs text-slate-500">{pet.breed}</span>
            </div>
          ))}
        </div>

        {/* New Pet Form Inline */}
        {showNewPetForm && (
          <div className="bg-slate-50 p-4 rounded-xl border border-dashed border-[#005bb5] mb-5">
            <h3 className="text-[#005bb5] font-bold text-sm mb-3">Novo Paciente</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-slate-500 block mb-1">Nome do Pet:</label>
                <input type="text" value={newPet.name} onChange={(e) => setNewPet({...newPet, name: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-[#005bb5]" />
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Espécie:</label>
                <select value={newPet.species} onChange={(e) => setNewPet({...newPet, species: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-[#005bb5]">
                  <option value="Canina">Cachorro</option>
                  <option value="Felina">Gato</option>
                  <option value="Silvestre">Ave / Silvestre</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 block mb-1">Raça:</label>
                <input type="text" value={newPet.breed} onChange={(e) => setNewPet({...newPet, breed: e.target.value})} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-[#005bb5]" />
              </div>
            </div>
            <button onClick={handleAddPet} className="mt-4 bg-[#005bb5] text-white font-bold px-4 py-2 rounded-lg text-sm">Salvar Pet</button>
          </div>
        )}

        {/* Motivo */}
        <div>
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Sintomas / Motivo da consulta:</label>
          <textarea 
            rows={3} 
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 outline-none focus:border-[#005bb5] transition-colors"
            placeholder="Descreva brevemente os sintomas observados."
          ></textarea>
        </div>
      </div>

      {/* Date & Time / Summary Card */}
      <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-5 md:p-6">
        <h2 className="text-lg font-bold text-[#005bb5] mb-2">3. Horário da Consulta</h2>
        <p className="text-slate-500 text-xs mb-4">
          Profissional: <strong className="text-slate-800">Dr. João Silveira</strong> (Cardiologia)
        </p>

        <div className="mb-4">
          <label className="text-xs font-semibold text-slate-500 block mb-1.5">Data Selecionada:</label>
          <input type="date" defaultValue="2026-09-23" className="w-full md:w-auto bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 outline-none focus:border-[#005bb5]" />
        </div>

        <div className="grid grid-cols-3 gap-2 mb-6">
          {["09:00", "09:45", "10:30", "14:00", "14:45", "15:30"].map((slot) => (
            <button 
              key={slot}
              onClick={() => setSelectedSlot(slot)}
              className={`py-2.5 rounded-xl font-bold text-sm transition-colors ${
                selectedSlot === slot 
                  ? 'bg-[#005bb5] text-white border-2 border-[#005bb5]' 
                  : 'bg-white border border-slate-200 text-slate-700 hover:border-[#005bb5]'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6">
          <div className="flex justify-between text-xs text-slate-600 mb-2">
            <span>Consulta Online (Cardiologia)</span>
            <span>R$ 180,00</span>
          </div>
          <div className="flex justify-between text-xs text-slate-600 mb-4">
            <span>Duração Estimada</span>
            <span>45 minutos</span>
          </div>
          <div className="flex justify-between text-base font-extrabold text-[#00b37e] pt-3 border-t border-slate-200">
            <span>Valor a Pagar:</span>
            <span>R$ 180,00</span>
          </div>
        </div>

        <button 
          onClick={handleCheckout}
          className="w-full py-4 rounded-2xl text-white font-bold text-lg shadow-[0_4px_14px_rgba(0,179,126,0.3)] hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(90deg, #005bb5 0%, #00b37e 100%)" }}
        >
          Ir para Pagamento
        </button>
      </div>

    </div>
  )
}
