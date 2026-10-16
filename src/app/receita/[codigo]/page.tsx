'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckCircle2, HelpCircle, Clock3, ShieldCheck, XCircle } from 'lucide-react';
import { MedicalRecordService } from '@/clinical/medical-record-service';

const medicalRecords = new MedicalRecordService();
type Verification = Record<string, unknown> & { valid?: boolean; status?: string; validation_code?: string; veterinarian_name?: string; crmv_number?: string; crmv_uf?: string; issued_at?: string; expires_at?: string };

export default function PrescriptionVerificationPage() {
  const params = useParams<{ codigo: string }>();
  const [verification, setVerification] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void medicalRecords.verifyPrescription(decodeURIComponent(params.codigo))
      .then((data) => { if (active) setVerification(data as Verification); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível verificar esta receita.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.codigo]);

  const valid = verification?.valid === true;
  return (
    <main className="mx-auto min-h-[70vh] max-w-xl px-4 py-12">
      <div className="border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="grid h-11 w-11 place-items-center bg-emerald-50 text-emerald-800"><ShieldCheck /></div>
          <div><p className="text-xs font-semibold uppercase text-emerald-800">TeleVet</p><h1 className="text-xl font-bold">Verificação de receita</h1></div>
        </div>
        {loading && <div className="py-10 text-sm text-slate-600" role="status">Verificando autenticidade...</div>}
        {!loading && error && <div role="alert" className="mt-5 border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
        {!loading && verification && <div className="space-y-5 pt-6">
          <div className={`flex items-start gap-3 border p-4 ${valid ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
            {valid ? <CheckCircle2 className="shrink-0" /> : verification.status === 'not_found' ? <XCircle className="shrink-0" /> : <Clock3 className="shrink-0" />}
            <div><p className="font-semibold">{valid ? 'Receita autêntica' : verification.status === 'not_found' ? 'Receita não localizada' : 'Receita expirada'}</p><p className="mt-1 text-sm">Esta verificação não exibe diagnóstico nem dados clínicos do paciente.</p></div>
          </div>
          {verification.status !== 'not_found' && <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Código</dt><dd className="font-mono font-semibold">{verification.validation_code}</dd></div>
            <div><dt className="text-slate-500">Profissional</dt><dd className="font-semibold">{verification.veterinarian_name}</dd></div>
            <div><dt className="text-slate-500">CRMV validado</dt><dd className="font-semibold">{verification.crmv_number}/{verification.crmv_uf}</dd></div>
            <div><dt className="text-slate-500">Emissão</dt><dd>{verification.issued_at ? new Date(String(verification.issued_at)).toLocaleDateString('pt-BR') : 'Não informado'}</dd></div>
            <div><dt className="text-slate-500">Validade</dt><dd>{verification.expires_at ? new Date(`${String(verification.expires_at)}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</dd></div>
          </dl>}
          <p className="flex items-center gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500"><HelpCircle size={15} /> A confirmação verifica apenas código, validade e registro profissional; não substitui análise farmacêutica.</p>
        </div>}
      </div>
    </main>
  );
}
