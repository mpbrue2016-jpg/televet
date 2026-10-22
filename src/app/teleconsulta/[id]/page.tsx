'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ConnectionQuality, Room, RoomEvent, Track, type Participant, type Track as LiveKitTrack } from 'livekit-client';
import { AlertTriangle, Camera, CameraOff, FileUp, Mic, MicOff, MonitorUp, PhoneOff, Send, Video } from 'lucide-react';
import { getSupabaseClient } from '@/config/supabase-client';
import { TeleconsultationService } from '@/clinical/teleconsultation-service';
import { MedicalRecordService } from '@/clinical/medical-record-service';

type RoomAuthorization = {
  participantRole: 'tutor' | 'veterinarian';
  consultation: {
    scheduled_ends_at: string;
    pet_id?: string | null;
    clinical_draft?: ClinicalDraft | null;
    pet?: { name: string; species: string; history: Array<{ title: string; details: string; created_at: string }> } | null;
  };
};

type SharedMessage = { id: string; text?: string; filePath?: string; sender: string; sentAt: string };
type ClinicalDraft = { anamnesis: string; physicalExam: string; diagnosis: string; clinicalConduct: string };
type ConsultationState = {
  status: string;
  video_room_status: string;
  video_room_started_at: string | null;
  video_actual_duration_seconds: number;
  video_connection_drop_count: number;
  tutor_recording_consent: boolean;
  vet_recording_consent: boolean;
  recording_status: string;
  recording_storage_path: string | null;
  recording_expires_at: string | null;
  scheduled_ends_at: string;
};

const supabase = getSupabaseClient();
const teleconsultationService = new TeleconsultationService();
const medicalRecordService = new MedicalRecordService();
const EMPTY_DRAFT: ClinicalDraft = { anamnesis: '', physicalExam: '', diagnosis: '', clinicalConduct: '' };

function VideoSurface({ track, muted = false, label }: { track?: LiveKitTrack; muted?: boolean; label: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [track]);

  return (
    <div className="relative flex min-h-48 items-center justify-center overflow-hidden bg-[#16231f]">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full min-h-48 w-full object-cover" />
      {!track && <div className="absolute inset-0 grid place-items-center text-sm text-white/70">Câmera desligada</div>}
      <span className="absolute bottom-3 left-3 rounded bg-black/60 px-2 py-1 text-xs text-white">{label}</span>
    </div>
  );
}

function AudioSurface({ track }: { track?: LiveKitTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const element = audioRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [track]);
  return <audio ref={audioRef} autoPlay />;
}

function cameraTrack(participant: Participant): LiveKitTrack | undefined {
  return participant.getTrackPublication(Track.Source.Camera)?.track;
}

function microphoneTrack(participant: Participant): LiveKitTrack | undefined {
  return participant.getTrackPublication(Track.Source.Microphone)?.track;
}

function screenShareTrack(participant: Participant): LiveKitTrack | undefined {
  return participant.getTrackPublication(Track.Source.ScreenShare)?.track;
}

export default function TeleconsultationPage() {
  const params = useParams<{ id: string }>();
  const consultationId = params.id;
  const previewRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [authorization, setAuthorization] = useState<RoomAuthorization | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomRevision, setRoomRevision] = useState(0);
  const [consultationState, setConsultationState] = useState<ConsultationState | null>(null);
  const [devicesReady, setDevicesReady] = useState(false);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraDeviceId, setCameraDeviceId] = useState('');
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [recordingLoading, setRecordingLoading] = useState(false);
  const [draft, setDraft] = useState<ClinicalDraft>(EMPTY_DRAFT);
  const [draftStatus, setDraftStatus] = useState('');
  const [showExamForm, setShowExamForm] = useState(false);
  const [examDraft, setExamDraft] = useState({ title: '', category: 'blood', justification: '' });
  const [examNotice, setExamNotice] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('Aguardando entrada na sala');

  const refreshConsultationState = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_teleconsultation_state', {
      p_consultation_id: consultationId,
    });
    if (!error && data) setConsultationState(data as ConsultationState);
  }, [consultationId]);

  useEffect(() => {
    setUnsupported(!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection);
    void refreshConsultationState();

    const channel = supabase
      .channel(`teleconsultation-${consultationId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'teleconsultation_status_updates',
        filter: `consultation_id=eq.${consultationId}`,
      }, () => void refreshConsultationState())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, [consultationId, refreshConsultationState]);

  useEffect(() => {
    if (!room || !authorization || authorization.participantRole !== 'veterinarian') return;
    const timeout = window.setTimeout(async () => {
      setDraftStatus('Salvando rascunho...');
      const { error } = await supabase.rpc('save_teleconsultation_draft', {
        p_consultation_id: consultationId,
        p_anamnesis: draft.anamnesis,
        p_physical_exam: draft.physicalExam,
        p_diagnosis: draft.diagnosis,
        p_clinical_conduct: draft.clinicalConduct,
      });
      setDraftStatus(error ? 'Falha ao salvar rascunho' : 'Rascunho salvo');
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [authorization, consultationId, draft, room]);

  useEffect(() => {
    if (!consultationState?.video_room_started_at || !room) return;
    const updateTimer = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - new Date(consultationState.video_room_started_at!).getTime()) / 1000));
      setElapsedSeconds(seconds);
      const cutoff = new Date(consultationState.scheduled_ends_at).getTime() + 15 * 60 * 1000;
      if (Date.now() >= cutoff) {
        room.disconnect();
        setRoom(null);
        setConnectionStatus('Sala encerrada ao final da janela da consulta.');
      }
    };
    updateTimer();
    const interval = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(interval);
  }, [consultationState, room]);

  const inspectDevices = async () => {
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (previewRef.current) previewRef.current.srcObject = stream;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === 'videoinput');
      const microphones = devices.filter((device) => device.kind === 'audioinput');
      setCameraDevices(cameras);
      setMicrophoneDevices(microphones);
      setCameraDeviceId((current) => current || cameras[0]?.deviceId || '');
      setMicrophoneDeviceId((current) => current || microphones[0]?.deviceId || '');
      setDevicesReady(true);
    } catch {
      setErrorMessage('Não foi possível acessar câmera e microfone. Confira as permissões do navegador ou prossiga em modo de áudio.');
      setDevicesReady(false);
    }
  };

  const enterRoom = async () => {
    if (unsupported) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const video = previewRef.current?.srcObject as MediaStream | null;
      video?.getTracks().forEach((track) => track.stop());
      if (previewRef.current) previewRef.current.srcObject = null;

      const session = await teleconsultationService.startRoom(consultationId);
      const roomSession = new Room({ adaptiveStream: true, dynacast: true });
      roomSession.on(RoomEvent.ParticipantConnected, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.ParticipantDisconnected, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.TrackSubscribed, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.TrackUnsubscribed, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.LocalTrackPublished, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.LocalTrackUnpublished, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.ConnectionQualityChanged, () => setRoomRevision((revision) => revision + 1));
      roomSession.on(RoomEvent.Reconnecting, () => setConnectionStatus('Reconectando à sala...'));
      roomSession.on(RoomEvent.Reconnected, () => setConnectionStatus('Conexão restabelecida'));
      roomSession.on(RoomEvent.Disconnected, () => setConnectionStatus('Conexão encerrada'));
      roomSession.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const received = JSON.parse(new TextDecoder().decode(payload)) as Omit<SharedMessage, 'id'>;
          setMessages((current) => [...current, { ...received, id: crypto.randomUUID(), sender: participant?.identity ?? received.sender }]);
        } catch {
          setErrorMessage('Uma mensagem recebida não pôde ser exibida.');
        }
      });

      await roomSession.connect(session.serverUrl, session.token);
      if (cameraDeviceId) await roomSession.switchActiveDevice('videoinput', cameraDeviceId);
      if (microphoneDeviceId) await roomSession.switchActiveDevice('audioinput', microphoneDeviceId);
      await roomSession.localParticipant.setMicrophoneEnabled(true);
      try {
        await roomSession.localParticipant.setCameraEnabled(true);
      } catch {
        setCameraEnabled(false);
        setConnectionStatus('Conectado em modo de áudio; a câmera não pôde ser ativada.');
      }

      roomRef.current = roomSession;
      setRoom(roomSession);
      setAuthorization({
        participantRole: session.participantRole,
        consultation: session.consultation as RoomAuthorization['consultation'],
      });
      if (session.participantRole === 'veterinarian' && session.consultation.clinical_draft) {
        setDraft({ ...EMPTY_DRAFT, ...session.consultation.clinical_draft });
      }
      setConnectionStatus('Conectado à sala LiveKit');
      setRoomRevision((revision) => revision + 1);
      await refreshConsultationState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível entrar na teleconsulta.');
    } finally {
      setLoading(false);
    }
  };

  const leaveRoom = async () => {
    room?.disconnect();
    roomRef.current = null;
    setRoom(null);
    setConnectionStatus('Você saiu da sala.');
    await refreshConsultationState();
  };

  const toggleCamera = async () => {
    if (!room) return;
    const enabled = !cameraEnabled;
    try {
      await room.localParticipant.setCameraEnabled(enabled);
      setCameraEnabled(enabled);
    } catch {
      setErrorMessage('Não foi possível alterar a câmera. Você pode continuar somente com áudio.');
    }
  };

  const toggleMicrophone = async () => {
    if (!room) return;
    const enabled = !microphoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicrophoneEnabled(enabled);
  };

  const toggleScreenShare = async () => {
    if (!room) return;
    try {
      const enabled = !screenShareEnabled;
      await room.localParticipant.setScreenShareEnabled(enabled);
      setScreenShareEnabled(enabled);
    } catch {
      setErrorMessage('O compartilhamento de tela foi cancelado ou não é suportado neste navegador.');
    }
  };

  const sendMessage = async (text: string, filePath?: string) => {
    if (!room || (!text.trim() && !filePath)) return;
    const message: Omit<SharedMessage, 'id'> = {
      text: text.trim() || undefined,
      filePath,
      sender: room.localParticipant.identity,
      sentAt: new Date().toISOString(),
    };
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(message)), {
      reliable: true,
      topic: 'consultation-chat',
    });
    setMessages((current) => [...current, { ...message, id: crypto.randomUUID() }]);
    setMessageText('');
  };

  const uploadAttachment = async (file?: File) => {
    if (!file || !authorization || file.size > 20 * 1024 * 1024) {
      if (file) setErrorMessage('O arquivo excede o limite de 20 MB.');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setErrorMessage('Envie uma imagem JPG, PNG, WebP ou um PDF.');
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setErrorMessage('Entre novamente para enviar um anexo.');
      return;
    }
    const path = `${consultationId}/${userData.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await supabase.storage.from('consultation-attachments').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      setErrorMessage(`Não foi possível enviar o arquivo: ${error.message}`);
      return;
    }
    await sendMessage('', path);
  };

  const acceptRecordingConsent = async (consented: boolean) => {
    try {
      await teleconsultationService.registerConsent({ consultationId, consented });
      if (!consented && consultationState?.recording_status === 'recording_active') {
        await teleconsultationService.stopRecording(consultationId);
      }
      await refreshConsultationState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível registrar o consentimento.');
    }
  };

  const startRecording = async () => {
    setRecordingLoading(true);
    try {
      await teleconsultationService.startRecording(consultationId);
      await refreshConsultationState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a gravação.');
    } finally {
      setRecordingLoading(false);
    }
  };

  const stopRecording = async () => {
    setRecordingLoading(true);
    try {
      await teleconsultationService.stopRecording(consultationId);
      await refreshConsultationState();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível interromper a gravação.');
    } finally {
      setRecordingLoading(false);
    }
  };

  const submitExamRequest = async () => {
    const petId = authorization?.consultation.pet_id;
    if (!petId) {
      setExamNotice('Identificação do pet indisponível na sala. Solicite o exame pelo prontuário do animal.');
      return;
    }
    if (!examDraft.title.trim()) {
      setExamNotice('Informe o nome do exame solicitado.');
      return;
    }
    setExamNotice('');
    try {
      await medicalRecordService.requestExam(
        petId,
        examDraft.title.trim(),
        examDraft.category,
        examDraft.justification.trim() || undefined,
        consultationId,
      );
      setExamDraft({ title: '', category: 'blood', justification: '' });
      setShowExamForm(false);
      setExamNotice('Solicitação de exame registrada no prontuário do pet.');
    } catch (error) {
      setExamNotice(error instanceof Error ? error.message : 'Não foi possível solicitar o exame.');
    }
  };

  const finishConsultation = async () => {
    if (!window.confirm('Encerrar a consulta e registrar o prontuário?')) return;
    setLoading(true);
    try {
      if (consultationState?.recording_status === 'recording_active') {
        await teleconsultationService.stopRecording(consultationId);
      }
      await teleconsultationService.finishRoom({
        consultationId,
        anamnesis: draft.anamnesis,
        physicalExam: draft.physicalExam,
        diagnosis: draft.diagnosis,
        clinicalConduct: draft.clinicalConduct,
      });
      await leaveRoom();
      const petId = authorization?.consultation.pet_id;
      if (authorization?.participantRole === 'veterinarian' && petId) {
        window.location.assign(`/dashboard/pet/${petId}`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível finalizar a consulta.');
    } finally {
      setLoading(false);
    }
  };

  const openRecording = async () => {
    const path = consultationState?.recording_storage_path;
    if (!path) return;
    const { error: auditError } = await supabase.rpc('log_consultation_recording_access', {
      p_consultation_id: consultationId,
      p_purpose: 'playback',
    });
    if (auditError) {
      setErrorMessage('O acesso à gravação não foi autorizado.');
      return;
    }
    const { data, error } = await supabase.storage.from('consultation-recordings').createSignedUrl(path, 60);
    if (error || !data) {
      setErrorMessage('A gravação não está disponível ou expirou.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const localCameraTrack = room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
  const localMicrophoneTrack = room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
  const localScreenTrack = room ? screenShareTrack(room.localParticipant) : undefined;
  const participants = room ? Array.from(room.remoteParticipants.values()) : [];
  const remoteParticipant = participants[0];
  const remoteScreenTrack = remoteParticipant ? screenShareTrack(remoteParticipant) : undefined;
  const partnerIsVeterinarian = authorization?.participantRole !== 'veterinarian';
  const quality = room?.localParticipant.connectionQuality;
  const recordingConsentForUser = authorization?.participantRole === 'veterinarian'
    ? consultationState?.vet_recording_consent
    : consultationState?.tutor_recording_consent;
  const otherPartyConsented = authorization?.participantRole === 'veterinarian'
    ? consultationState?.tutor_recording_consent
    : consultationState?.vet_recording_consent;
  const canRecord = Boolean(consultationState?.tutor_recording_consent && consultationState?.vet_recording_consent);
  const roomIsActive = consultationState?.video_room_status === 'active';

  return (
    <main className="min-h-screen bg-[#f2f4ef] text-[#1b2924]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#d5ded7] bg-white px-4 py-3 md:px-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded bg-[#176b58] text-white"><Video size={20} /></div>
          <div>
            <h1 className="text-lg font-semibold">Teleconsulta</h1>
            <p className="text-xs text-[#597067]">{connectionStatus}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="tabular-nums">{String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}</span>
          {consultationState?.recording_status === 'recording_active' && (
            <span className="flex items-center gap-2 font-semibold text-red-700" role="status"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> GRAVANDO</span>
          )}
          {room && <span className="text-xs text-[#597067]">Rede: {quality ?? 'conectando'}</span>}
        </div>
      </header>

      {unsupported && <div role="alert" className="mx-auto mt-6 max-w-4xl px-4"><div className="flex gap-3 border border-amber-300 bg-amber-50 p-4 text-amber-950"><AlertTriangle />Este navegador não oferece os recursos necessários para teleconsulta por vídeo. Atualize o navegador ou use um navegador compatível.</div></div>}
      {errorMessage && <div role="alert" className="mx-auto mt-4 max-w-6xl px-4"><div className="flex items-start justify-between gap-3 border border-red-300 bg-red-50 p-3 text-sm text-red-900"><span>{errorMessage}</span><button onClick={() => setErrorMessage('')} aria-label="Fechar aviso">×</button></div></div>}

      {!room ? (
        <section className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1.2fr_0.8fr]">
          <div className="overflow-hidden border border-[#d5ded7] bg-[#16231f]">
            <video ref={previewRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
            {!devicesReady && <div className="grid aspect-video place-items-center text-center text-white/75"><div><Video className="mx-auto mb-2" /><p>Teste câmera e microfone antes de entrar</p></div></div>}
          </div>
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase text-[#176b58]">Sala de espera</p>
              <h2 className="mt-1 text-2xl font-semibold">Prepare seu atendimento</h2>
              <p className="mt-2 text-sm text-[#597067]">A sala só abre quando o agendamento estiver confirmado, o pagamento capturado e dentro do horário permitido.</p>
            </div>
            <button onClick={() => void inspectDevices()} disabled={unsupported} className="w-full border border-[#b8c8be] bg-white px-4 py-3 text-left text-sm font-medium disabled:opacity-50">Testar câmera, microfone e dispositivos</button>
            {devicesReady && <div className="space-y-3">
              <label className="block text-sm">Câmera<select value={cameraDeviceId} onChange={(event) => setCameraDeviceId(event.target.value)} className="mt-1 w-full border border-[#b8c8be] bg-white p-2">{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Câmera ${index + 1}`}</option>)}</select></label>
              <label className="block text-sm">Microfone<select value={microphoneDeviceId} onChange={(event) => setMicrophoneDeviceId(event.target.value)} className="mt-1 w-full border border-[#b8c8be] bg-white p-2">{microphoneDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
            </div>}
            <button onClick={() => void enterRoom()} disabled={loading || unsupported} className="w-full bg-[#176b58] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Validando acesso...' : 'Entrar na teleconsulta'}</button>
            <p className="text-xs text-[#597067]">A permissão de entrada é revalidada no servidor. Não compartilhe o link da sala.</p>
          </div>
        </section>
      ) : (
        <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <div className="grid min-h-[50vh] gap-3 md:grid-cols-2">
              <div className="overflow-hidden border border-[#d5ded7] bg-[#16231f]">
                <VideoSurface track={localCameraTrack} muted label="Você" />
                <AudioSurface track={localMicrophoneTrack} />
              </div>
              <div className="overflow-hidden border border-[#d5ded7] bg-[#16231f]">
                {remoteParticipant ? <>
                  <VideoSurface track={cameraTrack(remoteParticipant)} label={partnerIsVeterinarian ? 'Veterinário' : 'Tutor'} />
                  <AudioSurface track={microphoneTrack(remoteParticipant)} />
                </> : <div className="grid min-h-[50vh] place-items-center text-center text-white/80"><div><Video className="mx-auto mb-3" /><p className="font-medium">Você está aguardando {partnerIsVeterinarian ? 'o veterinário' : 'o tutor'}</p><p className="mt-1 text-sm text-white/55">Esta tela atualiza quando a outra pessoa entrar.</p></div></div>}
              </div>
            </div>
            {(localScreenTrack || remoteScreenTrack) && <div className="grid gap-3 md:grid-cols-2">
              {localScreenTrack && <div className="overflow-hidden border border-[#d5ded7] bg-[#16231f]"><VideoSurface track={localScreenTrack} muted label="Sua tela" /></div>}
              {remoteScreenTrack && <div className="overflow-hidden border border-[#d5ded7] bg-[#16231f]"><VideoSurface track={remoteScreenTrack} label="Tela compartilhada" /></div>}
            </div>}

            <div className="flex flex-wrap items-center justify-center gap-2 border border-[#d5ded7] bg-white p-3">
              <button title={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'} onClick={() => void toggleMicrophone()} className="grid h-11 w-11 place-items-center border border-[#b8c8be]" aria-label={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'}>{microphoneEnabled ? <Mic /> : <MicOff />}</button>
              <button title={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'} onClick={() => void toggleCamera()} className="grid h-11 w-11 place-items-center border border-[#b8c8be]" aria-label={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}>{cameraEnabled ? <Camera /> : <CameraOff />}</button>
              <button title="Compartilhar tela" onClick={() => void toggleScreenShare()} className={`grid h-11 w-11 place-items-center border ${screenShareEnabled ? 'border-[#176b58] bg-[#e5f1ec]' : 'border-[#b8c8be]'}`} aria-label="Compartilhar tela"><MonitorUp /></button>
              {authorization?.participantRole === 'veterinarian' && <button onClick={() => void finishConsultation()} disabled={loading} className="flex h-11 items-center gap-2 bg-[#9b342b] px-4 font-medium text-white disabled:opacity-50"><PhoneOff size={18} />Encerrar consulta</button>}
              <button onClick={() => void leaveRoom()} className="h-11 border border-[#b8c8be] px-4">Sair da sala</button>
            </div>

            <section className="border border-[#d5ded7] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold">Consentimento de gravação</h2><p className="mt-1 text-xs text-[#597067]">A gravação só inicia com autorização explícita do tutor e do veterinário.</p></div>
                <span className="text-xs">Tutor: {consultationState?.tutor_recording_consent ? 'aceitou' : 'pendente'} · Veterinário: {consultationState?.vet_recording_consent ? 'aceitou' : 'pendente'}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!recordingConsentForUser && <button onClick={() => void acceptRecordingConsent(true)} className="border border-[#176b58] px-3 py-2 text-sm text-[#176b58]">Aceito gravação</button>}
                {recordingConsentForUser && <button onClick={() => void acceptRecordingConsent(false)} className="border border-[#b8c8be] px-3 py-2 text-sm">Retirar consentimento</button>}
                {canRecord && consultationState?.recording_status !== 'recording_active' && <button disabled={recordingLoading} onClick={() => void startRecording()} className="bg-[#176b58] px-3 py-2 text-sm text-white disabled:opacity-50">Iniciar gravação consentida</button>}
                {consultationState?.recording_status === 'recording_active' && <button disabled={recordingLoading} onClick={() => void stopRecording()} className="bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50">Parar gravação</button>}
                {consultationState?.recording_status === 'recording_saved' && consultationState.recording_storage_path && <button onClick={() => void openRecording()} className="border border-[#b8c8be] px-3 py-2 text-sm">Acessar gravação privada</button>}
              </div>
              {otherPartyConsented && !recordingConsentForUser && <p className="mt-2 text-xs text-[#597067]">A outra pessoa autorizou; falta sua decisão. A recusa não encerra a consulta.</p>}
            </section>
          </section>

          <aside className="space-y-4">
            {authorization?.participantRole === 'veterinarian' && <section className="border border-[#d5ded7] bg-white p-4">
              <h2 className="font-semibold">Paciente</h2>
              <p className="mt-1 text-sm">{authorization.consultation.pet?.name ?? 'Pet'} · {authorization.consultation.pet?.species ?? ''}</p>
              <h3 className="mt-4 text-sm font-semibold">Histórico recente</h3>
              <div className="mt-2 max-h-40 space-y-2 overflow-auto text-xs text-[#597067]">
                {authorization.consultation.pet?.history?.length ? authorization.consultation.pet.history.map((entry, index) => <article key={`${entry.created_at}-${index}`} className="border-l-2 border-[#98b8aa] pl-2"><p className="font-medium text-[#1b2924]">{entry.title}</p><p>{entry.details}</p></article>) : <p>Nenhum registro anterior disponível.</p>}
              </div>
              <h3 className="mt-4 text-sm font-semibold">Anamnese e evolução</h3>
              <div className="mt-2 space-y-2">
                <textarea aria-label="Anamnese" value={draft.anamnesis} onChange={(event) => setDraft({ ...draft, anamnesis: event.target.value })} placeholder="Queixa e anamnese" className="min-h-20 w-full border border-[#b8c8be] p-2 text-sm" />
                <textarea aria-label="Exame físico" value={draft.physicalExam} onChange={(event) => setDraft({ ...draft, physicalExam: event.target.value })} placeholder="Exame físico" className="min-h-16 w-full border border-[#b8c8be] p-2 text-sm" />
                <input aria-label="Diagnóstico" value={draft.diagnosis} onChange={(event) => setDraft({ ...draft, diagnosis: event.target.value })} placeholder="Diagnóstico" className="w-full border border-[#b8c8be] p-2 text-sm" />
                <textarea aria-label="Conduta clínica" value={draft.clinicalConduct} onChange={(event) => setDraft({ ...draft, clinicalConduct: event.target.value })} placeholder="Conduta clínica" className="min-h-16 w-full border border-[#b8c8be] p-2 text-sm" />
                <p className="min-h-4 text-xs text-[#597067]" aria-live="polite">{draftStatus}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setShowExamForm(!showExamForm)} className="border border-[#176b58] px-3 py-2 text-xs text-[#176b58]">Solicitar exame</button>
                <span className="self-center text-xs text-[#597067]">A receita digital é emitida no prontuário do pet após o encerramento da consulta.</span>
              </div>
              {examNotice && <p className="mt-2 text-xs text-[#176b58]" role="status">{examNotice}</p>}
              {showExamForm && (
                <div className="mt-3 space-y-2 border border-[#d5ded7] p-3">
                  <input aria-label="Exame solicitado" value={examDraft.title} onChange={(event) => setExamDraft({ ...examDraft, title: event.target.value })} placeholder="Ex: Hemograma completo" className="w-full border border-[#b8c8be] p-2 text-sm" />
                  <select aria-label="Categoria do exame" value={examDraft.category} onChange={(event) => setExamDraft({ ...examDraft, category: event.target.value })} className="w-full border border-[#b8c8be] bg-white p-2 text-sm">
                    <option value="blood">Sangue</option>
                    <option value="imaging">Imagem</option>
                    <option value="urine">Urina</option>
                    <option value="biopsy">Biópsia</option>
                    <option value="cardiology">Cardiologia</option>
                    <option value="other">Outro</option>
                  </select>
                  <textarea aria-label="Justificativa clínica" value={examDraft.justification} onChange={(event) => setExamDraft({ ...examDraft, justification: event.target.value })} placeholder="Justificativa clínica" className="min-h-16 w-full border border-[#b8c8be] p-2 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => void submitExamRequest()} className="bg-[#176b58] px-3 py-2 text-xs text-white">Confirmar solicitação</button>
                    <button onClick={() => setShowExamForm(false)} className="border border-[#b8c8be] px-3 py-2 text-xs">Cancelar</button>
                  </div>
                </div>
              )}
            </section>}

            <section className="flex min-h-64 flex-col border border-[#d5ded7] bg-white">
              <div className="border-b border-[#d5ded7] px-4 py-3"><h2 className="font-semibold">Chat da consulta</h2><p className="text-xs text-[#597067]">Mensagens enviadas somente aos participantes da sala.</p></div>
              <div className="flex-1 space-y-2 overflow-auto p-3" aria-live="polite">
                {messages.map((message) => <div key={message.id} className="bg-[#f2f4ef] p-2 text-sm">
                  <p className="text-xs text-[#597067]">{message.sender === room.localParticipant.identity ? 'Você' : 'Participante'}</p>
                  {message.text && <p className="break-words">{message.text}</p>}
                  {message.filePath && <button onClick={async () => {
                    const { data, error } = await supabase.storage.from('consultation-attachments').createSignedUrl(message.filePath!, 60);
                    if (error || !data) setErrorMessage('Não foi possível acessar o anexo privado.');
                    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
                  }} className="underline">Abrir anexo privado</button>}
                </div>)}
                {!messages.length && <p className="text-sm text-[#597067]">Nenhuma mensagem nesta consulta.</p>}
              </div>
              <form onSubmit={(event) => { event.preventDefault(); void sendMessage(messageText); }} className="flex items-center gap-2 border-t border-[#d5ded7] p-2">
                <label className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center border border-[#b8c8be]" title="Enviar foto ou documento"><FileUp size={18} /><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => void uploadAttachment(event.target.files?.[0])} /></label>
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} aria-label="Mensagem" placeholder="Escreva uma mensagem" className="min-w-0 flex-1 border border-[#b8c8be] px-2 py-2 text-sm" />
                <button type="submit" aria-label="Enviar mensagem" className="grid h-10 w-10 place-items-center bg-[#176b58] text-white"><Send size={17} /></button>
              </form>
            </section>
          </aside>
        </div>
      )}

      <span className="sr-only" aria-live="polite">Sala: {consultationState?.video_room_status ?? 'aguardando'}; atualizações {roomRevision}</span>
      {consultationState && !roomIsActive && consultationState.video_room_status === 'abandoned' && <p className="mx-auto max-w-4xl px-4 pb-8 text-sm text-amber-900">O prazo de espera terminou sem a entrada de todos os participantes. Entre em contato com o atendimento para reagendamento ou análise de reembolso.</p>}
    </main>
  );
}
