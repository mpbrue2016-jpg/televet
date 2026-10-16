'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Activity, AlertTriangle, CalendarClock, ClipboardList, Download, FilePlus2, FileText, Forward, ImageDown, LockKeyhole, RefreshCw, Search, ShieldCheck, Syringe, Upload, UserRoundCheck } from 'lucide-react';
import {
  MedicalRecordService,
  type MedicationCatalogItem,
  type MedicationItem,
  type MedicalTimelineEvent,
  type PetMedicalTimeline,
  type PetRecordAccessControls,
  type SpecialtyOption,
} from '@/clinical/medical-record-service';
import {
  VaccinationService,
  type VaccinationHistoryEntry,
  type VaccinationItem,
  type VaccinationStatus,
  type VaccinationWallet,
} from '@/clinical/vaccination-service';
import {
  ReferralService,
  type ReferralListItem,
  type ReferralSpecialistCandidate,
  type ReferralModality,
  type ReferralPriority,
  type ReferralScope,
  type ReferralStatus,
  type ReferralDetail,
} from '@/clinical/referral-service';

const recordService = new MedicalRecordService();
const vaccinationService = new VaccinationService();
const referralService = new ReferralService();

type SoapDraft = {
  title: string;
  complaint: string;
  anamnesis: string;
  physicalExam: string;
  assessment: string;
  diagnosis: string;
  plan: string;
  followUpAt: string;
  observations: string;
  temperature: string;
  heartRate: string;
  respiratoryRate: string;
  bloodPressure: string;
};

const emptySoap: SoapDraft = {
  title: '', complaint: '', anamnesis: '', physicalExam: '', assessment: '', diagnosis: '',
  plan: '', followUpAt: '', observations: '', temperature: '', heartRate: '', respiratoryRate: '', bloodPressure: '',
};

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}`.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function referralStatusLabel(status: ReferralStatus): string {
  const labels: Record<ReferralStatus, string> = {
    pending: 'Aguardando especialista',
    accepted: 'Aceito',
    in_progress: 'Em atendimento',
    completed: 'Concluído',
    rejected: 'Recusado',
    expired: 'Expirado',
    cancelled: 'Cancelado',
  };
  return labels[status] ?? status;
}

function referralBadgeTone(status: ReferralStatus): string {
  const tones: Record<ReferralStatus, string> = {
    pending: 'bg-amber-100 text-amber-800',
    accepted: 'bg-sky-100 text-sky-800',
    in_progress: 'bg-indigo-100 text-indigo-800',
    completed: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
    expired: 'bg-slate-200 text-slate-600',
    cancelled: 'bg-slate-200 text-slate-600',
  };
  return tones[status] ?? 'bg-slate-100 text-slate-700';
}

// Painel de detalhe: mostra anexos autorizados e retornos do encaminhamento.
// Os itens visíveis são exatamente os que o backend devolveu após autorizar escopo.
function ReferralDetailPanel({ referralId }: { referralId: string }) {
  const [detail, setDetail] = useState<ReferralDetail | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    referralService.getDetail(referralId)
      .then((value) => { if (active) setDetail(value); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o detalhe.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [referralId]);

  if (loading) return <p className="mt-3 text-sm text-slate-500">Carregando detalhe…</p>;
  if (error) return <p className="mt-3 text-sm text-red-700">{error}</p>;
  if (!detail) return null;

  return (
    <div className="mt-3 space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div>
        <h3 className="text-sm font-semibold">Escopo autorizado ao especialista</h3>
        <div className="mt-1 flex flex-wrap gap-2 text-xs">
          {detail.scopes.length === 0 && <span className="text-slate-500">Nenhum escopo concedido.</span>}
          {detail.scopes.map((scope) => (
            <span key={scope} className="rounded-full bg-white px-2 py-1 font-medium ring-1 ring-slate-200">
              {scope === 'read_clinical' ? 'Prontuário (leitura)' : scope === 'exams' ? 'Exames' : scope === 'documents' ? 'Documentos' : 'Receitas'}
            </span>
          ))}
        </div>
        {detail.clinicalSummary && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700"><span className="font-medium">Resumo clínico:</span> {detail.clinicalSummary}</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Documentos e exames anexados</h3>
        {detail.attachments.length === 0 && <p className="mt-1 text-sm text-slate-500">Nenhum anexo autorizado a este encaminhamento.</p>}
        <ul className="mt-1 divide-y divide-slate-200">
          {detail.attachments.map((attachment) => (
            <li key={attachment.attachmentId} className="py-2 text-sm">
              <p className="font-medium">{attachment.title ?? (attachment.kind === 'exam' ? 'Exame' : 'Documento')}</p>
              <p className="text-xs text-slate-500">
                {attachment.kind === 'exam' ? 'Exame' : 'Documento'} · anexado em {formatDateTime(attachment.createdAt)}
              </p>
              {attachment.notes && <p className="mt-1 text-xs text-slate-600">{attachment.notes}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Atendimentos de retorno</h3>
        {detail.returns.length === 0 && <p className="mt-1 text-sm text-slate-500">Nenhum retorno registrado até o momento.</p>}
        <ul className="mt-1 divide-y divide-slate-200">
          {detail.returns.map((entry) => (
            <li key={entry.returnId} className="py-2 text-sm">
              <p className="whitespace-pre-wrap font-medium">{entry.returnSummary}</p>
              <p className="text-xs text-slate-500">{entry.attendingVeterinarianName} · {formatDateTime(entry.createdAt)}</p>
              {entry.diagnosis && <p className="mt-1 text-xs text-slate-700"><span className="font-medium">Diagnóstico:</span> {entry.diagnosis}</p>}
              {entry.conduct && <p className="mt-1 text-xs text-slate-700"><span className="font-medium">Conduta:</span> {entry.conduct}</p>}
              {entry.medicalRecordId && <p className="mt-1 text-xs text-slate-500">Vinculado ao prontuário do animal.</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Gera a carteira em JPG no navegador via Canvas (sem dependências externas).
async function renderVaccinationCardJpg(wallet: VaccinationWallet | null): Promise<Blob> {
  const width = 1000;
  const padding = 40;
  const lineHeight = 30;
  const vaccinations = wallet?.vaccinations ?? [];
  const height = padding * 2 + 220 + vaccinations.length * (lineHeight * 4 + 16) + 60;

  const canvas = document.createElement('canvas');
  const scale = 2;
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível gerar a imagem neste dispositivo.');
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  let y = padding + 30;
  ctx.fillStyle = '#064e3b';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText('TeleVet | Carteira de vacinação', padding, y);
  y += lineHeight + 8;

  const pet = wallet?.pet;
  ctx.fillStyle = '#0f172a';
  ctx.font = '18px sans-serif';
  if (pet) {
    ctx.fillText(`Paciente: ${pet.name}`, padding, y); y += lineHeight;
    ctx.fillText(`Espécie: ${pet.species}${pet.breed ? ` · ${pet.breed}` : ''}`, padding, y); y += lineHeight;
  }
  ctx.fillText(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, padding, y); y += lineHeight;

  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, y);
  ctx.lineTo(width - padding, y);
  ctx.stroke();
  y += 34;

  if (vaccinations.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '16px sans-serif';
    ctx.fillText('Nenhuma vacina registrada até o momento.', padding, y);
  } else {
    for (const item of vaccinations) {
      ctx.fillStyle = '#064e3b';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(`${formatDate(item.application_date)} | ${item.vaccine_name}`, padding, y);
      y += lineHeight - 4;

      ctx.fillStyle = '#334155';
      ctx.font = '15px sans-serif';
      const details = [
        item.manufacturer ? `Fabricante: ${item.manufacturer}` : '',
        item.lot_number ? `Lote: ${item.lot_number}` : '',
        item.dose_number ? `Dose: ${item.dose_number}` : '',
      ].filter(Boolean).join('   |   ');
      if (details) { ctx.fillText(details, padding + 16, y); y += lineHeight - 8; }
      if (item.veterinarian_name) { ctx.fillText(`Profissional: ${item.veterinarian_name}`, padding + 16, y); y += lineHeight - 8; }
      ctx.fillText(`Próxima dose: ${item.next_dose_at ? formatDate(item.next_dose_at) : 'não definida'}`, padding + 16, y);
      y += lineHeight + 10;
    }
  }

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('Documento gerado pelo TeleVet a partir dos registros autorizados.', padding, height - padding);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Não foi possível gerar o arquivo JPG.'));
    }, 'image/jpeg', 0.92);
  });
}

function StatusBadge({ status }: { status: VaccinationStatus }) {
  const map: Record<VaccinationStatus, { label: string; cls: string }> = {
    none: { label: 'Sem próxima dose', cls: 'bg-slate-100 text-slate-700' },
    upcoming: { label: 'Próxima dose', cls: 'bg-emerald-100 text-emerald-800' },
    due_soon: { label: 'Próxima em breve', cls: 'bg-amber-100 text-amber-800' },
    overdue: { label: 'Dose atrasada', cls: 'bg-rose-100 text-rose-800' },
  };
  const item = map[status] ?? map.none;
  return <span className={`inline-shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${item.cls}`}>{item.label}</span>;
}

function TextInput({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  required = false,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <textarea required={required} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/20" />
    </label>
  );
}

function TimelineEntry({
  event,
  canWrite,
  onAddendum,
  onPrescription,
  onDocument,
  onDownloadPrescription,
}: {
  event: MedicalTimelineEvent;
  canWrite: boolean;
  onAddendum: (recordId: string) => void;
  onPrescription: (consultationId: string) => void;
  onDocument: (documentId: string) => void;
  onDownloadPrescription: (prescriptionId: string, code: string) => void;
}) {
  const addenda = Array.isArray(event.addenda) ? event.addenda as Array<Record<string, unknown>> : [];
  const signed = Boolean(event.signed_at);
  const consultationId = typeof event.consultation_id === 'string' ? event.consultation_id : '';
  const professionalName = typeof event.veterinarian_name === 'string' ? event.veterinarian_name
    : typeof event.author_name === 'string' ? event.author_name : '';
  const crmvNumber = typeof event.author_crmv_number === 'string' ? event.author_crmv_number : '';
  const crmvUf = typeof event.author_crmv_uf === 'string' ? event.author_crmv_uf : '';
  const professionalLine = [professionalName, crmvNumber ? `CRMV ${crmvNumber}${crmvUf ? `/${crmvUf}` : ''}` : '']
    .filter(Boolean).join(' · ');
  const priorityLabel = typeof event.priority === 'string'
    ? ({ routine: 'Rotina', urgent: 'Urgente', emergency: 'Emergência' } as Record<string, string>)[event.priority] ?? event.priority
    : '';
  const fields: Array<[string, unknown]> = [
    ['Queixa', event.complaint], ['Anamnese', event.anamnesis], ['Exame físico', event.physical_exam],
    ['Avaliação', event.assessment], ['Diagnóstico', event.diagnosis], ['Plano', event.plan],
    ['Detalhes', event.details], ['Justificativa', event.clinical_justification],
    ['Resultado', event.results_text], ['Recomendações', event.recommendations],
    ['Resumo clínico', event.clinical_summary], ['Prioridade', priorityLabel], ['Situação', event.status],
  ];

  return (
    <article className="border-l-2 border-emerald-700 pl-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">{new Date(event.created_at).toLocaleString('pt-BR')}</p>
          <h3 className="mt-1 font-semibold text-slate-900">{event.title}</h3>
          <p className="text-xs text-slate-500">{event.kind} · {String(event.event_type ?? '')}</p>
          {professionalLine && <p className="mt-0.5 text-xs text-slate-600">Responsável: {professionalLine}</p>}
        </div>
        {signed && <span className="inline-flex items-center gap-1 text-xs text-emerald-800"><ShieldCheck size={14} /> Assinado</span>}
      </div>

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {fields.filter(([, value]) => Boolean(value)).map(([label, value]) => (
          <div key={label}><dt className="font-medium text-slate-600">{label}</dt><dd className="whitespace-pre-wrap text-slate-800">{String(value)}</dd></div>
        ))}
      </dl>

      {event.kind === 'prescription' && Array.isArray(event.medications) && <section className="mt-3 border-t border-slate-200 pt-3">
        <h4 className="text-sm font-semibold">Medicamentos prescritos</h4>
        <ul className="mt-2 space-y-2 text-sm">
          {(event.medications as Array<Record<string, unknown>>).map((medication, index) => (
            <li key={`${String(medication.catalog_id ?? medication.name)}-${index}`} className="border border-slate-200 p-2">
              <strong>{String(medication.name ?? medication.active_ingredient ?? 'Medicamento')}</strong>
              <p>{String(medication.dosage ?? '')} · {String(medication.frequency ?? '')} · {String(medication.duration ?? '')}</p>
            </li>
          ))}
        </ul>
        <button onClick={() => onDownloadPrescription(event.id, String(event.validation_code ?? event.id))} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-800 hover:underline"><Download size={16} /> Baixar receita em PDF</button>
      </section>}

      {addenda.length > 0 && <section className="mt-3 border-t border-slate-200 pt-3">
        <h4 className="text-sm font-semibold">Adendos</h4>
        <ol className="mt-2 space-y-2">
          {addenda.map((addendum, index) => <li key={`${String(addendum.version_number)}-${index}`} className="bg-amber-50 p-3 text-sm">
            <p className="font-semibold">Versão {String(addendum.version_number)} · {String(addendum.created_at ?? '')}</p>
            <p><strong>Motivo:</strong> {String(addendum.reason)}</p>
            <p className="whitespace-pre-wrap">{String(addendum.content)}</p>
            <p className="mt-1 text-xs text-slate-600">CRMV {String(addendum.author_crmv_number ?? '')}/{String(addendum.author_crmv_uf ?? '')}</p>
          </li>)}
        </ol>
      </section>}

      <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-200 pt-3">
        {canWrite && signed && event.kind === 'medical_record' && <button onClick={() => onAddendum(event.id)} className="text-sm font-medium text-emerald-800 hover:underline">Registrar adendo</button>}
        {canWrite && consultationId && event.kind === 'medical_record' && <button onClick={() => onPrescription(consultationId)} className="text-sm font-medium text-emerald-800 hover:underline">Emitir receita</button>}
        {event.kind === 'document' && <button onClick={() => onDocument(event.id)} className="text-sm font-medium text-emerald-800 hover:underline">Abrir documento privado</button>}
      </div>
    </article>
  );
}

export default function PetProfilePage() {
  const params = useParams<{ id: string }>();
  const petId = params.id;
  const [timeline, setTimeline] = useState<PetMedicalTimeline | null>(null);
  const [accessControls, setAccessControls] = useState<PetRecordAccessControls | null>(null);
  const [accessLog, setAccessLog] = useState<Array<Record<string, unknown>>>([]);
  const [catalog, setCatalog] = useState<MedicationCatalogItem[]>([]);
  const [medicationFavorites, setMedicationFavorites] = useState<Array<Record<string, unknown>>>([]);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState('');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [eventType, setEventType] = useState('');
  const [vetFilter, setVetFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [accessLogOpen, setAccessLogOpen] = useState(false);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [showExamForm, setShowExamForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [showReferralForm, setShowReferralForm] = useState(false);
  const [specialties, setSpecialties] = useState<SpecialtyOption[]>([]);
  const [referralDraft, setReferralDraft] = useState({
    specialtyId: '', reason: '', clinicalSummary: '',
    priority: 'routine' as ReferralPriority,
    modality: 'teletriage' as ReferralModality,
    targetVeterinarianId: '',
    expirationDays: '7',
    scopes: ['read_clinical'] as ReferralScope[],
  });
  const [referralCandidates, setReferralCandidates] = useState<ReferralSpecialistCandidate[]>([]);
  const [referrals, setReferrals] = useState<ReferralListItem[]>([]);
  const [selectedReferralId, setSelectedReferralId] = useState('');
  const [addendumRecordId, setAddendumRecordId] = useState('');
  const [prescriptionConsultationId, setPrescriptionConsultationId] = useState('');
  const [grantVetId, setGrantVetId] = useState('');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedExamId, setSelectedExamId] = useState('');
  const [soap, setSoap] = useState<SoapDraft>(emptySoap);
  const [examDraft, setExamDraft] = useState({ title: '', category: 'blood', justification: '' });
  const [documentDraft, setDocumentDraft] = useState({ title: '', documentType: 'exam', resultsText: '' });
  const [medicationDraft, setMedicationDraft] = useState({ catalogId: '', dosage: '', frequency: '', duration: '', route: 'oral' as MedicationItem['route'], instructions: '' });
  const [recommendations, setRecommendations] = useState('');
  const [vaccinationWallet, setVaccinationWallet] = useState<VaccinationWallet | null>(null);
  const [vaccinationHistory, setVaccinationHistory] = useState<VaccinationHistoryEntry[]>([]);
  const [showVaccinationForm, setShowVaccinationForm] = useState(false);
  const [showVaccinationHistory, setShowVaccinationHistory] = useState(false);
  const [vaccinationDraft, setVaccinationDraft] = useState({
    vaccineName: '', applicationDate: '', manufacturer: '', lotNumber: '',
    doseNumber: '', observations: '', nextDoseAt: '', reminderEnabled: false,
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofVaccinationId, setProofVaccinationId] = useState('');

  const loadTimeline = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await recordService.getPetTimeline(petId, {
        search: search || undefined,
        eventType: eventType || undefined,
        veterinarianId: vetFilter || undefined,
        from: fromDate ? new Date(`${fromDate}T00:00:00`).toISOString() : undefined,
        to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
      });
      setTimeline(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o prontuário.');
      setTimeline(null);
    } finally {
      setLoading(false);
    }
  }, [eventType, fromDate, petId, search, toDate, vetFilter]);

  const loadTutorControls = useCallback(async () => {
    if (timeline?.viewer_role !== 'tutor') return;
    try {
      const [controls, log] = await Promise.all([recordService.getAccessControls(petId), recordService.getAccessLog(petId)]);
      setAccessControls(controls);
      setAccessLog(log);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a auditoria de acessos.');
    }
  }, [petId, timeline?.viewer_role]);

  const loadVaccinations = useCallback(async () => {
    try {
      const [wallet, history] = await Promise.all([
        vaccinationService.getWallet(petId),
        vaccinationService.getHistory(petId),
      ]);
      setVaccinationWallet(wallet);
      setVaccinationHistory(history);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a carteira de vacinação.');
      setVaccinationWallet(null);
    }
  }, [petId]);

  const loadReferrals = useCallback(async () => {
    try {
      setReferrals(await referralService.listByPet(petId));
    } catch {
      // Lista de encaminhamentos e complementar; falha nao bloqueia a pagina.
    }
  }, [petId]);

  useEffect(() => { void loadTimeline(); }, [loadTimeline]);
  useEffect(() => { void loadReferrals(); }, [loadReferrals]);
  useEffect(() => { void loadVaccinations(); }, [loadVaccinations]);
  useEffect(() => { if (timeline?.viewer_role === 'tutor') void loadTutorControls(); }, [loadTutorControls, timeline?.viewer_role]);
  useEffect(() => {
    if (timeline?.viewer_role === 'veterinarian') {
      void Promise.all([recordService.listMedicationCatalog(), recordService.listMedicationFavorites(), recordService.listSpecialties()])
        .then(([catalogItems, favorites, specialtyItems]) => { setCatalog(catalogItems); setMedicationFavorites(favorites); setSpecialties(specialtyItems); })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o catálogo.'));
    }
  }, [timeline?.viewer_role]);
  useEffect(() => {
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 30);
    setGrantExpiresAt(defaultExpiry.toISOString().slice(0, 10));
  }, []);

  const examinations = useMemo(() => timeline?.timeline.filter((event) => event.kind === 'exam') ?? [], [timeline]);

  const perform = async (action: () => Promise<void>) => {
    setWorking(true);
    setError('');
    setNotice('');
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'); }
    finally { setWorking(false); }
  };

  const submitSoap = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      const result = await recordService.createSignedRecord({
        petId, title: soap.title, complaint: soap.complaint, anamnesis: soap.anamnesis,
        physicalExam: soap.physicalExam, assessment: soap.assessment, diagnosis: soap.diagnosis,
        plan: soap.plan, followUpAt: soap.followUpAt ? new Date(`${soap.followUpAt}T12:00:00`).toISOString() : undefined,
        observations: soap.observations || undefined,
        vitalSigns: {
          temperature_celsius: soap.temperature ? Number(soap.temperature) : null,
          heart_rate_bpm: soap.heartRate ? Number(soap.heartRate) : null,
          respiratory_rate_rpm: soap.respiratoryRate ? Number(soap.respiratoryRate) : null,
          blood_pressure: soap.bloodPressure || null,
        },
      });
      setNotice(`Registro assinado e imutável. ID: ${result.recordId}`);
      setSoap(emptySoap);
      setShowRecordForm(false);
      await loadTimeline();
    });
  };

  const submitExam = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      const examId = await recordService.requestExam(petId, examDraft.title, examDraft.category, examDraft.justification || undefined);
      setSelectedExamId(examId);
      setDocumentDraft({ title: `Resultado: ${examDraft.title}`, documentType: 'exam', resultsText: '' });
      setShowExamForm(false);
      setShowDocumentForm(true);
      setNotice('Solicitação criada. Anexe o resultado quando estiver disponível.');
      await loadTimeline();
    });
  };

  const submitReferral = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      const referralId = await referralService.createReferral({
        petId,
        specialtyId: referralDraft.specialtyId,
        reason: referralDraft.reason,
        clinicalSummary: referralDraft.clinicalSummary || undefined,
        priority: referralDraft.priority,
        modality: referralDraft.modality,
        targetVeterinarianId: referralDraft.targetVeterinarianId || null,
        scopes: referralDraft.scopes,
        expirationDays: Number(referralDraft.expirationDays) || 7,
      });
      setNotice(`Encaminhamento registrado (teletriagem/teleorientação). ID: ${referralId}`);
      setReferralDraft({
        specialtyId: '', reason: '', clinicalSummary: '', priority: 'routine',
        modality: 'teletriage', targetVeterinarianId: '', expirationDays: '7', scopes: ['read_clinical'],
      });
      setReferralCandidates([]);
      setShowReferralForm(false);
      await Promise.all([loadTimeline(), loadReferrals()]);
    });
  };

  const onReferralSpecialtyChange = async (specialtyId: string) => {
    setReferralDraft((d) => ({ ...d, specialtyId, targetVeterinarianId: '' }));
    if (!specialtyId) { setReferralCandidates([]); return; }
    try {
      setReferralCandidates(await referralService.listCandidates(specialtyId));
    } catch (err: any) {
      setReferralCandidates([]);
      setError(err?.message ?? 'Não foi possível carregar especialistas.');
    }
  };

  const toggleReferralScope = (scope: ReferralScope) => {
    setReferralDraft((d) => {
      const has = d.scopes.includes(scope);
      const scopes = has ? d.scopes.filter((s) => s !== scope) : [...d.scopes, scope];
      return { ...d, scopes: scopes.length ? scopes : ['read_clinical'] };
    });
  };

  const acceptReferral = async (referralId: string) => {
    await perform(async () => {
      await referralService.accept(referralId);
      setNotice('Encaminhamento aceito. Acesso ao prontuário liberado no escopo concedido.');
      await Promise.all([loadReferrals(), loadTimeline()]);
    });
  };

  const rejectReferral = async (referralId: string) => {
    const reason = window.prompt('Motivo da recusa do encaminhamento:');
    if (!reason?.trim()) return;
    await perform(async () => {
      await referralService.updateStatus(referralId, 'rejected', reason.trim());
      setNotice('Encaminhamento recusado com registro de motivo.');
      await loadReferrals();
    });
  };

  const registerReferralReturn = async (referralId: string) => {
    const summary = window.prompt('Resumo do atendimento de retorno:');
    if (!summary?.trim()) return;
    await perform(async () => {
      const result = await referralService.recordReturn({ referralId, returnSummary: summary.trim() });
      setNotice(`Retorno registrado e vinculado ao prontuário. Registro: ${result.medicalRecordId}`);
      await Promise.all([loadReferrals(), loadTimeline()]);
    });
  };

  const submitDocument = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile) { setError('Selecione um PDF ou uma imagem antes de enviar.'); return; }
    await perform(async () => {
      await recordService.uploadClinicalDocument({
        petId, file: selectedFile, title: documentDraft.title, documentType: documentDraft.documentType,
        examId: selectedExamId || undefined, resultsText: documentDraft.resultsText || undefined,
      });
      setSelectedFile(null);
      setSelectedExamId('');
      setShowDocumentForm(false);
      setNotice('Documento armazenado em bucket privado e vinculado ao prontuário.');
      await loadTimeline();
    });
  };

  const submitPrescription = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      const medication: MedicationItem = { ...medicationDraft, instructions: medicationDraft.instructions || undefined };
      const result = await recordService.issuePrescription(prescriptionConsultationId, [medication], recommendations || undefined);
      if (result.status === 'pending_configuration') setNotice(result.message);
      else setNotice(`Receita emitida. Código de verificação: ${result.validationCode}`);
      setPrescriptionConsultationId('');
      setRecommendations('');
      setMedicationDraft({ catalogId: '', dosage: '', frequency: '', duration: '', route: 'oral', instructions: '' });
      await loadTimeline();
    });
  };

  const applyMedicationFavorite = () => {
    const favorite = medicationFavorites.find((item) => item.id === selectedFavoriteId);
    if (!favorite) return;
    setMedicationDraft({
      catalogId: String(favorite.medication_id),
      dosage: String(favorite.dosage),
      frequency: String(favorite.frequency),
      duration: String(favorite.duration),
      route: String(favorite.route) as MedicationItem['route'],
      instructions: String(favorite.instructions ?? ''),
    });
  };

  const saveMedicationFavorite = () => void perform(async () => {
    if (!medicationDraft.catalogId) throw new Error('Selecione um medicamento do catálogo primeiro.');
    await recordService.addMedicationFavorite({
      medicationId: medicationDraft.catalogId,
      dosage: medicationDraft.dosage,
      frequency: medicationDraft.frequency,
      duration: medicationDraft.duration,
      route: medicationDraft.route,
      instructions: medicationDraft.instructions || undefined,
    });
    setMedicationFavorites(await recordService.listMedicationFavorites());
    setNotice('Posologia adicionada às suas favoritas.');
  });

  const submitAddendum = async (event: FormEvent) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    await perform(async () => {
      await recordService.addAddendum({ recordId: addendumRecordId, reason: String(form.get('reason') ?? ''), content: String(form.get('content') ?? '') });
      setAddendumRecordId('');
      setNotice('Adendo append-only registrado com autor, data e CRMV.');
      await loadTimeline();
    });
  };

  const submitGrant = async (event: FormEvent) => {
    event.preventDefault();
    const expiration = new Date(`${grantExpiresAt}T23:59:59`).toISOString();
    await perform(async () => {
      await recordService.requestAccess({ petId, veterinarianId: grantVetId, scopes: ['read_clinical', 'prescriptions', 'exams', 'documents'], expiresAt: expiration });
      setNotice('Acesso concedido. Você pode revogá-lo a qualquer momento.');
      setGrantVetId('');
      await loadTutorControls();
    });
  };

  const exportRecord = () => void perform(async () => {
    const pdf = await recordService.downloadMedicalRecordPdf(petId);
    downloadBlob(pdf, `prontuario-${petId}.pdf`);
    setNotice('PDF do prontuário gerado e acesso registrado.');
  });
  const downloadPrescription = (prescriptionId: string, code: string) => void perform(async () => {
    const pdf = await recordService.downloadPrescriptionPdf(prescriptionId);
    downloadBlob(pdf, `receita-${code}.pdf`);
  });
  const openDocument = (documentId: string) => void perform(async () => {
    const url = await recordService.getDocumentUrl(documentId);
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const submitVaccination = async (event: FormEvent) => {
    event.preventDefault();
    await perform(async () => {
      const vaccinationId = await vaccinationService.createVaccination({
        petId,
        vaccineName: vaccinationDraft.vaccineName,
        applicationDate: vaccinationDraft.applicationDate,
        manufacturer: vaccinationDraft.manufacturer || undefined,
        lotNumber: vaccinationDraft.lotNumber || undefined,
        doseNumber: vaccinationDraft.doseNumber || undefined,
        observations: vaccinationDraft.observations || undefined,
        nextDoseAt: vaccinationDraft.nextDoseAt || undefined,
        reminderEnabled: vaccinationDraft.reminderEnabled,
      });
      setNotice('Vacina registrada na carteira.');
      setVaccinationDraft({ vaccineName: '', applicationDate: '', manufacturer: '', lotNumber: '', doseNumber: '', observations: '', nextDoseAt: '', reminderEnabled: false });
      setShowVaccinationForm(false);
      setProofVaccinationId(vaccinationId);
      await loadVaccinations();
    });
  };

  const submitProof = async (event: FormEvent) => {
    event.preventDefault();
    if (!proofFile) { setError('Selecione o arquivo do comprovante.'); return; }
    if (!proofVaccinationId) { setError('Selecione a vacina que o comprovante corresponde.'); return; }
    await perform(async () => {
      await vaccinationService.uploadProof({ petId, vaccinationId: proofVaccinationId, file: proofFile, title: 'Comprovante de vacina' });
      setNotice('Comprovante anexado à vacina.');
      setProofFile(null);
      setProofVaccinationId('');
      await loadVaccinations();
    });
  };

  const openProof = (documentId: string) => void perform(async () => {
    const url = await vaccinationService.getProofUrl(documentId);
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  const exportVaccinationPdf = () => void perform(async () => {
    const pdf = await vaccinationService.downloadCardPdf(petId);
    downloadBlob(pdf, `carteira-vacinacao-${petId}.pdf`);
    setNotice('PDF da carteira gerado e acesso registrado.');
  });

  const exportVaccinationJpg = () => void perform(async () => {
    const image = await renderVaccinationCardJpg(vaccinationWallet);
    downloadBlob(image, `carteira-vacinacao-${petId}.jpg`);
    setNotice('Imagem JPG da carteira gerada.');
  });

  return (
    <main className="mx-auto max-w-6xl space-y-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-800">Prontuário pertencente ao pet</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">{timeline?.pet.name ?? 'Prontuário do pet'}</h1>
          <p className="text-sm text-slate-600">{timeline ? `${timeline.pet.species}${timeline.pet.breed ? ` · ${timeline.pet.breed}` : ''}` : `Pet ${petId}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void loadTimeline()} disabled={loading} className="inline-flex items-center gap-2 border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-50"><RefreshCw size={16} /> Atualizar</button>
          {timeline && <button onClick={exportRecord} disabled={working} className="inline-flex items-center gap-2 bg-emerald-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Download size={16} /> Exportar prontuário</button>}
          {timeline?.viewer_role === 'veterinarian' && timeline.can_write && <button onClick={() => setShowRecordForm(!showRecordForm)} className="inline-flex items-center gap-2 border border-emerald-800 px-3 py-2 text-sm font-semibold text-emerald-900"><FilePlus2 size={16} /> Novo registro SOAP</button>}
        </div>
      </header>

      {timeline?.pet.allergies && <div role="alert" className="flex items-start gap-3 border border-rose-300 bg-rose-50 p-4 text-rose-950"><AlertTriangle className="mt-0.5 shrink-0" size={19} /><div><p className="font-semibold">Alergias declaradas</p><p className="text-sm">{timeline.pet.allergies}</p></div></div>}
      {error && <div role="alert" className="border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
      {notice && <div role="status" className="border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</div>}

      {timeline && <section className="grid gap-3 border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-slate-500">Espécie</p><p className="font-medium">{timeline.pet.species}</p></div>
        <div><p className="text-xs text-slate-500">Nascimento</p><p className="font-medium">{timeline.pet.birth_date ? new Date(`${timeline.pet.birth_date}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado'}</p></div>
        <div><p className="text-xs text-slate-500">Peso registrado</p><p className="font-medium">{timeline.pet.weight_kg ? `${timeline.pet.weight_kg} kg` : 'Não informado'}</p></div>
        <div><p className="text-xs text-slate-500">Microchip</p><p className="font-medium">{timeline.pet.microchip_number || 'Não informado'}</p></div>
      </section>}

      {timeline && vaccinationWallet && (
        <section className="border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="inline-flex items-center gap-2 font-semibold"><Syringe size={18} className="text-emerald-800" />Carteira de vacinação</h2>
                <p className="text-xs text-slate-500">Vacinas aplicadas, fabricante, lote, próxima dose e comprovantes.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={exportVaccinationPdf} disabled={working} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"><Download size={14} /> PDF</button>
                <button onClick={exportVaccinationJpg} disabled={working} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"><ImageDown size={14} /> JPG</button>
                <button onClick={() => setShowVaccinationHistory(!showVaccinationHistory)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold"><ClipboardList size={14} /> {showVaccinationHistory ? 'Ocultar histórico' : 'Histórico'}</button>
                {timeline.viewer_role === 'veterinarian' && vaccinationWallet.can_write && (
                  <button onClick={() => setShowVaccinationForm(!showVaccinationForm)} className="inline-flex items-center gap-1 bg-emerald-800 px-3 py-2 text-xs font-semibold text-white"><Syringe size={14} /> Nova vacina</button>
                )}
              </div>
            </div>
          </div>

          {showVaccinationForm && timeline.viewer_role === 'veterinarian' && vaccinationWallet.can_write && (
            <div className="border-b border-slate-200 bg-emerald-50/40 p-5">
              <h3 className="font-semibold">Registrar vacina</h3>
              <p className="text-xs text-slate-500">Preencha apenas o que o profissional informar. Campos vazios permanecem vazios — nada é inventado.</p>
              <form onSubmit={submitVaccination} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TextInput label="Vacina *" value={vaccinationDraft.vaccineName} onChange={(vaccineName) => setVaccinationDraft({ ...vaccinationDraft, vaccineName })} required />
                <TextInput label="Data de aplicação *" type="date" value={vaccinationDraft.applicationDate} onChange={(applicationDate) => setVaccinationDraft({ ...vaccinationDraft, applicationDate })} required />
                <TextInput label="Dose (ex.: 1ª, reforço)" value={vaccinationDraft.doseNumber} onChange={(doseNumber) => setVaccinationDraft({ ...vaccinationDraft, doseNumber })} />
                <TextInput label="Fabricante" value={vaccinationDraft.manufacturer} onChange={(manufacturer) => setVaccinationDraft({ ...vaccinationDraft, manufacturer })} />
                <TextInput label="Lote" value={vaccinationDraft.lotNumber} onChange={(lotNumber) => setVaccinationDraft({ ...vaccinationDraft, lotNumber })} />
                <TextInput label="Próxima dose" type="date" value={vaccinationDraft.nextDoseAt} onChange={(nextDoseAt) => setVaccinationDraft({ ...vaccinationDraft, nextDoseAt })} />
                <div className="sm:col-span-2 lg:col-span-3"><TextArea label="Observações" value={vaccinationDraft.observations} onChange={(observations) => setVaccinationDraft({ ...vaccinationDraft, observations })} rows={2} /></div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input type="checkbox" checked={vaccinationDraft.reminderEnabled} disabled={!vaccinationDraft.nextDoseAt} onChange={(e) => setVaccinationDraft({ ...vaccinationDraft, reminderEnabled: e.target.checked })} className="h-4 w-4" />
                  Ativar lembrete in-app (exige próxima dose)
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button disabled={working} className="bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar vacina</button>
                  <button type="button" onClick={() => setShowVaccinationForm(false)} className="border border-slate-300 px-4 py-2 text-sm">Cancelar</button>
                </div>
              </form>
            </div>
          )}

          <div className="p-5">
            {vaccinationWallet.vaccinations.length === 0 && (
              <div className="py-10 text-center"><Syringe className="mx-auto text-slate-400" /><p className="mt-3 font-medium">Nenhuma vacina registrada</p><p className="text-sm text-slate-500">Quando um profissional registrar, as vacinas aparecem aqui.</p></div>
            )}
            <ul className="grid gap-3 md:grid-cols-2">
              {vaccinationWallet.vaccinations.map((item) => (
                <li key={item.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{item.vaccine_name}</p>
                      <p className="text-xs text-slate-500">{formatDate(item.application_date)}{item.dose_number ? ` · ${item.dose_number}` : ''}</p>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <dl className="mt-3 space-y-1 text-sm text-slate-700">
                    {item.manufacturer && <div className="flex gap-2"><dt className="font-medium text-slate-500">Fabricante:</dt><dd>{item.manufacturer}</dd></div>}
                    {item.lot_number && <div className="flex gap-2"><dt className="font-medium text-slate-500">Lote:</dt><dd>{item.lot_number}</dd></div>}
                    {item.veterinarian_name && <div className="flex gap-2"><dt className="font-medium text-slate-500">Profissional:</dt><dd>{item.veterinarian_name}</dd></div>}
                    {item.observations && <div className="flex gap-2"><dt className="font-medium text-slate-500">Obs.:</dt><dd>{item.observations}</dd></div>}
                    <div className="flex gap-2"><dt className="font-medium text-slate-500">Próxima dose:</dt><dd>{item.next_dose_at ? formatDate(item.next_dose_at) : 'Não definida'}{item.reminder_enabled && item.next_dose_at ? ' · lembrete ativo' : ''}</dd></div>
                  </dl>
                  {item.attachments.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.attachments.map((att) => (
                        <button key={att.document_id} onClick={() => openProof(att.document_id)} className="inline-flex items-center gap-1 border border-slate-300 px-2 py-1 text-xs font-medium hover:bg-slate-50">
                          <FileText size={13} /> {att.title || 'Comprovante'}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {vaccinationWallet.vaccinations.length > 0 && (
              <form onSubmit={submitProof} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
                <label className="block text-sm font-medium text-slate-700">Anexar comprovante à vacina
                  <select required value={proofVaccinationId} onChange={(e) => setProofVaccinationId(e.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">
                    <option value="">Selecione</option>
                    {vaccinationWallet.vaccinations.map((v) => <option key={v.id} value={v.id}>{formatDate(v.application_date)} · {v.vaccine_name}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Arquivo (PDF/JPG/PNG/WebP · até 20 MB)
                  <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
                </label>
                <button disabled={working || !proofFile || !proofVaccinationId} className="bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Anexar</button>
              </form>
            )}

            {showVaccinationHistory && (
              <div className="mt-5 border-t border-slate-200 pt-4">
                <h3 className="font-semibold">Histórico de vacinação e consultas</h3>
                {vaccinationHistory.length === 0 && <p className="mt-2 text-sm text-slate-500">Nenhum registro no histórico.</p>}
                <ol className="mt-3 divide-y divide-slate-100">
                  {vaccinationHistory.map((entry, index) => (
                    <li key={`${entry.source}-${entry.id}-${index}`} className="py-3 text-sm">
                      <p className="font-medium">{entry.title}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(entry.application_date ?? entry.occurred_at)} · {entry.kind === 'consultation' ? 'consulta' : entry.kind === 'vaccination_legacy' ? 'registro legado' : 'vacina'}
                        {entry.veterinarian_name ? ` · ${entry.veterinarian_name}` : ''}
                      </p>
                      {entry.details && <p className="mt-1 text-slate-600">{entry.details}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            )}


          </div>

        </section>
      )}

      {showRecordForm && <section className="border border-emerald-300 bg-white p-5">
        <div className="mb-4 flex items-center gap-2"><ClipboardList className="text-emerald-800" /><div><h2 className="font-semibold">Registro clínico SOAP</h2><p className="text-xs text-slate-500">Ao assinar, o registro fica imutável; correções devem ser feitas por adendo.</p></div></div>
        <form onSubmit={submitSoap} className="space-y-4">
          <TextInput label="Título" value={soap.title} onChange={(title) => setSoap({ ...soap, title })} required />
          <TextArea label="Queixa principal" value={soap.complaint} onChange={(complaint) => setSoap({ ...soap, complaint })} required />
          <TextArea label="Anamnese" value={soap.anamnesis} onChange={(anamnesis) => setSoap({ ...soap, anamnesis })} required />
          <TextArea label="Exame físico" value={soap.physicalExam} onChange={(physicalExam) => setSoap({ ...soap, physicalExam })} required />
          <TextArea label="Avaliação" value={soap.assessment} onChange={(assessment) => setSoap({ ...soap, assessment })} required />
          <TextInput label="Diagnóstico" value={soap.diagnosis} onChange={(diagnosis) => setSoap({ ...soap, diagnosis })} required />
          <TextArea label="Plano / conduta" value={soap.plan} onChange={(plan) => setSoap({ ...soap, plan })} required />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TextInput label="Temperatura (°C)" value={soap.temperature} onChange={(temperature) => setSoap({ ...soap, temperature })} type="number" />
            <TextInput label="Frequência cardíaca (bpm)" value={soap.heartRate} onChange={(heartRate) => setSoap({ ...soap, heartRate })} type="number" />
            <TextInput label="Frequência respiratória (rpm)" value={soap.respiratoryRate} onChange={(respiratoryRate) => setSoap({ ...soap, respiratoryRate })} type="number" />
            <TextInput label="Pressão arterial" value={soap.bloodPressure} onChange={(bloodPressure) => setSoap({ ...soap, bloodPressure })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2"><TextInput label="Retorno recomendado" value={soap.followUpAt} onChange={(followUpAt) => setSoap({ ...soap, followUpAt })} type="date" /><TextArea label="Observações" value={soap.observations} onChange={(observations) => setSoap({ ...soap, observations })} rows={2} /></div>
          <div className="flex flex-wrap gap-2"><button disabled={working} className="bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Assinar registro</button><button type="button" onClick={() => setShowRecordForm(false)} className="border border-slate-300 px-4 py-2 text-sm">Cancelar</button></div>
        </form>
      </section>}

      {showExamForm && <section className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Solicitar exame</h2>
        <form onSubmit={submitExam} className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextInput label="Exame" value={examDraft.title} onChange={(title) => setExamDraft({ ...examDraft, title })} required />
          <label className="block text-sm font-medium text-slate-700">Categoria<select value={examDraft.category} onChange={(event) => setExamDraft({ ...examDraft, category: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="blood">Sangue</option><option value="imaging">Imagem</option><option value="urine">Urina</option><option value="biopsy">Biópsia</option><option value="cardiology">Cardiologia</option><option value="other">Outro</option></select></label>
          <div className="sm:col-span-2"><TextArea label="Justificativa clínica" value={examDraft.justification} onChange={(justification) => setExamDraft({ ...examDraft, justification })} required /></div>
          <button disabled={working} className="w-fit bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Criar solicitação</button>
        </form>
      </section>}

      {showReferralForm && <section className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Encaminhar para especialista</h2>
        <p className="mt-1 text-xs text-slate-500">Teletriagem ou teleorientação (Res. CFMV 1.465/2022). Registra o motivo clínico e o profissional encaminhante; o especialista acessa somente os escopos autorizados e dentro do prazo de aceite.</p>
        <form onSubmit={submitReferral} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Especialidade<select required value={referralDraft.specialtyId} onChange={(event) => void onReferralSpecialtyChange(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Selecione</option>{specialties.map((specialty) => <option key={specialty.id} value={specialty.id}>{specialty.name}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700">Modalidade<select value={referralDraft.modality} onChange={(event) => setReferralDraft({ ...referralDraft, modality: event.target.value as ReferralModality })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="teletriage">Teletriagem</option><option value="teleorientation">Teleorientação</option><option value="in_person">Presencial</option></select></label>
          <label className="block text-sm font-medium text-slate-700">Prioridade<select value={referralDraft.priority} onChange={(event) => setReferralDraft({ ...referralDraft, priority: event.target.value as ReferralPriority })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="routine">Rotina</option><option value="urgent">Urgente</option><option value="emergency">Emergência</option></select></label>
          <label className="block text-sm font-medium text-slate-700">Especialista (opcional)<select value={referralDraft.targetVeterinarianId} onChange={(event) => setReferralDraft({ ...referralDraft, targetVeterinarianId: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Qualquer especialista da área</option>{referralCandidates.map((candidate) => <option key={candidate.veterinarianId} value={candidate.veterinarianId}>{candidate.fullName} · CRMV {candidate.crmvNumber}/{candidate.crmvUf}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700">Prazo de aceite (dias)<input type="number" min={1} max={90} value={referralDraft.expirationDays} onChange={(event) => setReferralDraft({ ...referralDraft, expirationDays: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <div className="sm:col-span-2"><TextArea label="Motivo do encaminhamento" value={referralDraft.reason} onChange={(reason) => setReferralDraft({ ...referralDraft, reason })} required /></div>
          <div className="sm:col-span-2"><TextArea label="Resumo clínico (opcional)" value={referralDraft.clinicalSummary} onChange={(clinicalSummary) => setReferralDraft({ ...referralDraft, clinicalSummary })} rows={2} /></div>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Escopo mínimo liberado ao especialista</legend>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              {(['read_clinical', 'exams', 'documents', 'prescriptions'] as ReferralScope[]).map((scope) => (
                <label key={scope} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={referralDraft.scopes.includes(scope)} onChange={() => toggleReferralScope(scope)} className="rounded border-slate-300" />
                  {scope === 'read_clinical' ? 'Prontuário (leitura)' : scope === 'exams' ? 'Exames' : scope === 'documents' ? 'Documentos' : 'Receitas'}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">O especialista só enxerga o que estiver marcado, e apenas até o encerramento do encaminhamento.</p>
          </fieldset>
          <div className="flex gap-2"><button disabled={working || !specialties.length} className="bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Criar encaminhamento</button><button type="button" onClick={() => setShowReferralForm(false)} className="border border-slate-300 px-4 py-2 text-sm">Cancelar</button></div>
        </form>
      </section>}

      {referrals.length > 0 && <section className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Encaminhamentos e especialistas</h2>
        <p className="mt-1 text-xs text-slate-500">Acompanhe o estado de cada encaminhamento. O acesso do especialista é restrito aos escopos autorizados e ao prazo de aceite.</p>
        <ul className="mt-3 divide-y divide-slate-200">
          {referrals.map((referral) => (
            <li key={referral.referralId} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium">{referral.specialtyName ?? 'Especialidade'} · {referral.modality === 'teletriage' ? 'Teletriagem' : referral.modality === 'teleorientation' ? 'Teleorientação' : 'Presencial'}</p>
                  <p className="text-xs text-slate-500">
                    Encaminhado por {referral.referringVeterinarianName ?? '—'}{referral.referringCrmvNumber ? ` · CRMV ${referral.referringCrmvNumber}/${referral.referringCrmvUf ?? ''}` : ''} · {formatDateTime(referral.createdAt)}
                  </p>
                  {referral.targetVeterinarianName && <p className="text-xs text-slate-500">Especialista: {referral.targetVeterinarianName}</p>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-1 font-semibold ${referralBadgeTone(referral.status)}`}>{referralStatusLabel(referral.status)}</span>
                  {referral.expiresAt && (referral.status === 'pending' || referral.status === 'accepted') && <span className="text-slate-500">Aceite até {formatDateTime(referral.expiresAt)}</span>}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{referral.reason}</p>
              {referral.rejectionReason && <p className="mt-1 text-xs text-red-700">Motivo da recusa: {referral.rejectionReason}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button onClick={() => setSelectedReferralId(selectedReferralId === referral.referralId ? '' : referral.referralId)} className="border border-slate-300 px-3 py-1.5 font-semibold">{selectedReferralId === referral.referralId ? 'Ocultar detalhe' : 'Ver detalhe e anexos'}</button>
                {referral.status === 'pending' && <button onClick={() => void acceptReferral(referral.referralId)} className="bg-emerald-800 px-3 py-1.5 font-semibold text-white">Aceitar encaminhamento</button>}
                {(referral.status === 'pending' || referral.status === 'accepted') && <button onClick={() => void rejectReferral(referral.referralId)} className="border border-red-300 px-3 py-1.5 font-semibold text-red-700">Recusar</button>}
                {(referral.status === 'accepted' || referral.status === 'in_progress') && <button onClick={() => void registerReferralReturn(referral.referralId)} className="bg-slate-800 px-3 py-1.5 font-semibold text-white">Registrar retorno</button>}
              </div>
              {selectedReferralId === referral.referralId && <ReferralDetailPanel referralId={referral.referralId} />}
            </li>
          ))}
        </ul>
      </section>}

      {showDocumentForm && <section className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Anexar documento clínico</h2><p className="mt-1 text-xs text-slate-500">Bucket privado · PDF/JPG/PNG/WebP · até 20 MB</p>
        <form onSubmit={submitDocument} className="mt-3 grid gap-3 sm:grid-cols-2">
          <TextInput label="Título" value={documentDraft.title} onChange={(title) => setDocumentDraft({ ...documentDraft, title })} required />
          <label className="block text-sm font-medium text-slate-700">Tipo<select value={documentDraft.documentType} onChange={(event) => setDocumentDraft({ ...documentDraft, documentType: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="exam">Resultado de exame</option><option value="medical_report">Laudo</option><option value="certificate">Atestado</option><option value="other">Outro</option></select></label>
          <label className="block text-sm font-medium text-slate-700">Vincular a exame<select value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Sem exame</option>{examinations.map((exam) => <option key={exam.id} value={exam.id}>{exam.title}</option>)}</select></label>
          <label className="block text-sm font-medium text-slate-700">Arquivo<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" required /></label>
          {selectedExamId && <div className="sm:col-span-2"><TextArea label="Texto do resultado" value={documentDraft.resultsText} onChange={(resultsText) => setDocumentDraft({ ...documentDraft, resultsText })} rows={2} /></div>}
          <button disabled={working} className="w-fit bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Upload className="mr-2 inline" size={15} />Enviar documento</button>
        </form>
      </section>}

      {prescriptionConsultationId && <section className="border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Emitir receita</h2><p className="mt-1 text-xs text-slate-500">Medicamentos precisam pertencer ao catálogo. Controlados ficam bloqueados até configurar assinatura ICP-Brasil.</p>
        <form onSubmit={submitPrescription} className="mt-3 grid gap-3 sm:grid-cols-2">
          {medicationFavorites.length > 0 && <div className="flex gap-2 sm:col-span-2"><select aria-label="Posologia favorita" value={selectedFavoriteId} onChange={(event) => setSelectedFavoriteId(event.target.value)} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Posologias favoritas</option>{medicationFavorites.map((favorite) => <option key={String(favorite.id)} value={String(favorite.id)}>{String(favorite.name)} · {String(favorite.dosage)} · {String(favorite.frequency)}</option>)}</select><button type="button" onClick={applyMedicationFavorite} className="border border-slate-300 px-3 text-sm">Aplicar</button></div>}
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">Medicamento<select required value={medicationDraft.catalogId} onChange={(event) => setMedicationDraft({ ...medicationDraft, catalogId: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2"><option value="">Selecione do catálogo</option>{catalog.map((medication) => <option key={medication.id} value={medication.id}>{medication.name} · {medication.active_ingredient}{medication.requires_qualified_signature ? ' · ICP-Brasil' : ''}</option>)}</select></label>
          <TextInput label="Dose / posologia" value={medicationDraft.dosage} onChange={(dosage) => setMedicationDraft({ ...medicationDraft, dosage })} required />
          <TextInput label="Frequência" value={medicationDraft.frequency} onChange={(frequency) => setMedicationDraft({ ...medicationDraft, frequency })} required />
          <TextInput label="Duração" value={medicationDraft.duration} onChange={(duration) => setMedicationDraft({ ...medicationDraft, duration })} required />
          <label className="block text-sm font-medium text-slate-700">Via<select value={medicationDraft.route} onChange={(event) => setMedicationDraft({ ...medicationDraft, route: event.target.value as MedicationItem['route'] })} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2">{['oral', 'topical', 'injectable', 'ophthalmic', 'otic', 'other'].map((route) => <option key={route} value={route}>{route}</option>)}</select></label>
          <TextInput label="Instruções" value={medicationDraft.instructions} onChange={(instructions) => setMedicationDraft({ ...medicationDraft, instructions })} />
          <div className="sm:col-span-2"><TextArea label="Recomendações gerais" value={recommendations} onChange={setRecommendations} rows={2} /></div>
          <div className="flex flex-wrap gap-2"><button disabled={working || !catalog.length} className="bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Emitir receita</button><button type="button" onClick={saveMedicationFavorite} disabled={working || !medicationDraft.catalogId} className="border border-emerald-800 px-4 py-2 text-sm text-emerald-900 disabled:opacity-50">Salvar posologia favorita</button><button type="button" onClick={() => setPrescriptionConsultationId('')} className="border border-slate-300 px-4 py-2 text-sm">Cancelar</button></div>
        </form>
      </section>}

      {addendumRecordId && <section className="border border-amber-300 bg-white p-5"><h2 className="font-semibold">Adendo ao registro assinado</h2>
        <form onSubmit={submitAddendum} className="mt-3 space-y-3">
          <label className="block text-sm font-medium">Motivo<textarea name="reason" required rows={2} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
          <label className="block text-sm font-medium">Conteúdo do adendo<textarea name="content" required rows={4} className="mt-1 block w-full border border-slate-300 px-3 py-2" /></label>
          <div className="flex gap-2"><button disabled={working} className="bg-amber-700 px-4 py-2 text-sm font-semibold text-white">Registrar adendo</button><button type="button" onClick={() => setAddendumRecordId('')} className="border border-slate-300 px-4 py-2 text-sm">Cancelar</button></div>
        </form>
      </section>}

      {timeline?.viewer_role === 'tutor' && <section className="space-y-4 border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2"><LockKeyhole className="text-emerald-800" size={18} /><h2 className="font-semibold">Acesso ao prontuário</h2></div>
        <p className="text-sm text-slate-600">Você controla autorizações de leitura e pode revogá-las. Acesso assistencial por consulta também é auditado.</p>
        <form onSubmit={submitGrant} className="grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <label className="block text-sm font-medium">Veterinário verificado<select required value={grantVetId} onChange={(event) => setGrantVetId(event.target.value)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2"><option value="">Selecione</option>{accessControls?.veterinarian_candidates.map((vet) => <option key={vet.veterinarian_id} value={vet.veterinarian_id}>{vet.name} · CRMV {vet.crmv_number}/{vet.crmv_uf}</option>)}</select></label>
          <TextInput label="Acesso até" type="date" value={grantExpiresAt} onChange={setGrantExpiresAt} required />
          <button disabled={working || !accessControls?.veterinarian_candidates.length} className="self-end bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Autorizar leitura</button>
        </form>
        <div className="divide-y divide-slate-200">{(accessControls?.grants ?? []).map((grant) => <div key={grant.grant_id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-medium">{grant.veterinarian_name} · CRMV {grant.crmv_number}/{grant.crmv_uf}</p><p className="text-xs text-slate-500">Expira {new Date(grant.expires_at).toLocaleDateString('pt-BR')} · {grant.revoked_at ? 'Revogado' : new Date(grant.expires_at) < new Date() ? 'Expirado' : 'Ativo'}</p></div>{!grant.revoked_at && new Date(grant.expires_at) > new Date() && <button onClick={() => void perform(async () => { await recordService.revokeAccess(grant.grant_id); await loadTutorControls(); setNotice('Acesso revogado.'); })} className="text-sm font-semibold text-red-700 hover:underline">Revogar</button>}</div>)}{!accessControls?.grants.length && <p className="py-3 text-sm text-slate-500">Nenhuma autorização criada.</p>}</div>
        <button onClick={() => setAccessLogOpen(!accessLogOpen)} className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900"><UserRoundCheck size={16} /> {accessLogOpen ? 'Ocultar' : 'Ver'} histórico de acessos</button>
        {accessLogOpen && <ol className="max-h-72 divide-y divide-slate-100 overflow-auto border-t border-slate-200">{accessLog.map((entry, index) => <li key={`${String(entry.accessed_at)}-${index}`} className="py-2 text-sm"><p className="font-medium">{String(entry.actor_name ?? 'Usuário')} · {String(entry.action)} · {String(entry.purpose)}</p><p className="text-xs text-slate-500">{entry.accessed_at ? new Date(String(entry.accessed_at)).toLocaleString('pt-BR') : ''}</p></li>)}</ol>}
      </section>}

      <section className="border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Linha do tempo clínica</h2><p className="text-xs text-slate-500">Consultas, diagnósticos, exames, receitas, encaminhamentos e documentos.</p></div>{timeline?.viewer_role === 'veterinarian' && timeline.can_write && <div className="flex gap-2"><button onClick={() => setShowExamForm(!showExamForm)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold"><Syringe size={14} /> Solicitar exame</button><button onClick={() => setShowReferralForm(!showReferralForm)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold"><Forward size={14} /> Encaminhar</button><button onClick={() => setShowDocumentForm(!showDocumentForm)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold"><Upload size={14} /> Anexar</button></div>}{timeline?.viewer_role === 'tutor' && <button onClick={() => setShowDocumentForm(!showDocumentForm)} className="inline-flex items-center gap-1 border border-slate-300 px-3 py-2 text-xs font-semibold"><Upload size={14} /> Enviar documento</button>}</div>
          <form onSubmit={(event) => { event.preventDefault(); void loadTimeline(); }} className="mt-4 grid gap-2 md:grid-cols-5">
            <label className="relative md:col-span-2"><span className="sr-only">Buscar no prontuário</span><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar em registros e resultados" className="w-full rounded border border-slate-300 py-2 pl-9 pr-3 text-sm" /></label>
            <select value={eventType} onChange={(event) => setEventType(event.target.value)} className="rounded border border-slate-300 px-3 py-2 text-sm"><option value="">Todos os tipos</option><option value="medical_record">Registros clínicos</option><option value="exam">Exames</option><option value="prescription">Receitas</option><option value="referral">Encaminhamentos</option><option value="document">Documentos</option></select>
            <input aria-label="Data inicial" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <input aria-label="Data final" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded border border-slate-300 px-2 py-2 text-sm" />
            <label className="md:col-span-2"><span className="sr-only">Filtrar por veterinário</span><input value={vetFilter} onChange={(event) => setVetFilter(event.target.value)} placeholder="Filtrar por ID de veterinário" className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></label>
            <button className="w-fit rounded bg-slate-800 px-4 py-2 text-sm font-semibold text-white">Aplicar filtros</button>
          </form>
        </div>

        <div className="p-5">
          {loading && <div className="space-y-3" aria-label="Carregando prontuário"><div className="h-16 animate-pulse bg-slate-100" /><div className="h-24 animate-pulse bg-slate-100" /></div>}
          {!loading && timeline?.timeline.length === 0 && <div className="py-12 text-center"><Activity className="mx-auto text-slate-400" /><p className="mt-3 font-medium">Nenhum registro clínico encontrado</p><p className="text-sm text-slate-500">Ajuste os filtros ou aguarde um novo atendimento.</p></div>}
          {!loading && timeline?.timeline.length ? <div className="space-y-8">{timeline.timeline.map((event) => <TimelineEntry key={`${event.kind}-${event.id}`} event={event} canWrite={timeline.can_write} onAddendum={setAddendumRecordId} onPrescription={setPrescriptionConsultationId} onDocument={openDocument} onDownloadPrescription={downloadPrescription} />)}</div> : null}
          {!loading && !timeline && <div className="py-12 text-center"><FileText className="mx-auto text-slate-400" /><p className="mt-3 font-medium">Prontuário indisponível</p><p className="text-sm text-slate-500">Entre com a conta responsável ou solicite autorização ao tutor.</p></div>}
        </div>
      </section>
    </main>
  );
}
