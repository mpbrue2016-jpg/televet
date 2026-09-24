-- ==============================================================================
-- 0015_tutors_pets_and_appointments_lifecycle.sql
-- Fase 5: Tutores, Pets, Ciclo de Vida do Agendamento e Associação de Origem
-- ==============================================================================

-- 1. Redefinição dos 7 Status de Agendamento solicitados
DO $$ BEGIN
    CREATE TYPE appointment_lifecycle_status AS ENUM (
        'solicitado',           -- Criado pelo tutor
        'aguardando_pagamento', -- Aguardando checkout / Pix / Cartão
        'confirmado',           -- Pago e confirmado na agenda do veterinário
        'realizado',            -- Consulta concluída com prontuário
        'cancelado',            -- Cancelado por tutor, vet ou pet shop
        'reembolsado',          -- Pagamento estornado
        'no_show'               -- Tutor ou veterinário não compareceu
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Garantir que appointments possua petshop_id de origem explícito
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS petshop_id UUID REFERENCES public.petshops(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lifecycle_status appointment_lifecycle_status NOT NULL DEFAULT 'solicitado';

-- 3. Garantir que consultations também possua as referências diretas de rastreabilidade
ALTER TABLE public.consultations
ADD COLUMN IF NOT EXISTS petshop_id UUID REFERENCES public.petshops(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS tutor_id UUID REFERENCES public.tutors(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS pet_id UUID REFERENCES public.pets(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS veterinarian_id UUID REFERENCES public.veterinarians(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_petshop_id ON public.appointments(petshop_id);
CREATE INDEX IF NOT EXISTS idx_consultations_petshop_id ON public.consultations(petshop_id);

-- 4. Função RPC para Obter Horários Livres (Slots) em uma Data Específica
CREATE OR REPLACE FUNCTION public.get_available_appointment_slots(
    p_veterinarian_id UUID,
    p_date DATE
)
RETURNS TABLE (
    slot_time TIME,
    duration_minutes INTEGER,
    is_available BOOLEAN
) AS $$
DECLARE
    v_day_of_week SMALLINT;
    v_start_time TIME;
    v_end_time TIME;
    v_slot_duration INTEGER;
    v_curr_time TIME;
BEGIN
    -- Determina o dia da semana (0 = Domingo ... 6 = Sábado)
    v_day_of_week := EXTRACT(DOW FROM p_date);

    -- Busca a grade do veterinário para o dia
    SELECT start_time, end_time, slot_duration_minutes
    INTO v_start_time, v_end_time, v_slot_duration
    FROM public.veterinarian_schedules
    WHERE veterinarian_id = p_veterinarian_id
      AND day_of_week = v_day_of_week
      AND is_active = TRUE
    LIMIT 1;

    -- Se não atende no dia, retorna vazio
    IF v_start_time IS NULL THEN
        RETURN;
    END IF;

    -- Itera gerando os horários conforme a duração do slot
    v_curr_time := v_start_time;
    WHILE (v_curr_time + (v_slot_duration || ' minutes')::interval) <= v_end_time LOOP
        slot_time := v_curr_time;
        duration_minutes := v_slot_duration;

        -- Checa se já existe agendamento ativo nesse horário
        SELECT NOT EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.veterinarian_id = p_veterinarian_id
              AND a.scheduled_for::date = p_date
              AND a.scheduled_for::time = v_curr_time
              AND a.lifecycle_status IN ('solicitado', 'aguardando_pagamento', 'confirmado')
        ) INTO is_available;

        RETURN NEXT;

        v_curr_time := (v_curr_time + (v_slot_duration || ' minutes')::interval)::time;
    END LOOP;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Função RPC para Agendar Consulta de Forma Atômica
CREATE OR REPLACE FUNCTION public.book_appointment(
    p_tenant_id UUID,
    p_petshop_id UUID,
    p_tutor_id UUID,
    p_pet_id UUID,
    p_veterinarian_id UUID,
    p_specialty_id UUID,
    p_scheduled_for TIMESTAMPTZ,
    p_reason_for_visit TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_fee_cents INTEGER;
    v_duration INTEGER;
    v_conflict BOOLEAN;
    v_appointment_id UUID;
BEGIN
    -- 1. Busca valor da consulta e duração do veterinário
    SELECT consultation_fee_cents, consultation_duration_minutes
    INTO v_fee_cents, v_duration
    FROM public.veterinarians
    WHERE id = p_veterinarian_id AND is_active = TRUE;

    IF v_fee_cents IS NULL THEN
        RAISE EXCEPTION 'Veterinário não encontrado ou inativo.' USING ERRCODE = 'P0002';
    END IF;

    -- 2. Valida concorrência / duplo agendamento no mesmo horário
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE veterinarian_id = p_veterinarian_id
          AND scheduled_for = p_scheduled_for
          AND lifecycle_status IN ('solicitado', 'aguardando_pagamento', 'confirmado')
    ) INTO v_conflict;

    IF v_conflict THEN
        RAISE EXCEPTION 'O horário selecionado já foi reservado por outro tutor.' USING ERRCODE = '23505';
    END IF;

    -- 3. Cria o agendamento fixando o Pet Shop de origem e os dados de relacionamento
    INSERT INTO public.appointments (
        tenant_id,
        petshop_id,
        tutor_id,
        pet_id,
        veterinarian_id,
        specialty_id,
        scheduled_for,
        duration_minutes,
        price_cents,
        reason_for_visit,
        lifecycle_status
    ) VALUES (
        p_tenant_id,
        p_petshop_id,
        p_tutor_id,
        p_pet_id,
        p_veterinarian_id,
        p_specialty_id,
        p_scheduled_for,
        v_duration,
        v_fee_cents,
        p_reason_for_visit,
        'solicitado'
    ) RETURNING id INTO v_appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'tenant_id', p_tenant_id,
        'petshop_id', p_petshop_id,
        'price_cents', v_fee_cents,
        'duration_minutes', v_duration,
        'status', 'solicitado'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Função RPC para Cancelar Agendamento
CREATE OR REPLACE FUNCTION public.cancel_appointment(
    p_appointment_id UUID,
    p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
BEGIN
    UPDATE public.appointments
    SET 
        lifecycle_status = 'cancelado',
        cancellation_reason = p_cancellation_reason,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Agendamento não localizado.' USING ERRCODE = 'P0002';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', p_appointment_id,
        'status', 'cancelado'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Função RPC para Reagendar Consulta
CREATE OR REPLACE FUNCTION public.reschedule_appointment(
    p_appointment_id UUID,
    p_new_scheduled_for TIMESTAMPTZ
)
RETURNS JSONB AS $$
DECLARE
    v_vet_id UUID;
    v_conflict BOOLEAN;
BEGIN
    SELECT veterinarian_id INTO v_vet_id
    FROM public.appointments
    WHERE id = p_appointment_id;

    IF v_vet_id IS NULL THEN
        RAISE EXCEPTION 'Agendamento não localizado.' USING ERRCODE = 'P0002';
    END IF;

    -- Checa disponibilidade do novo horário
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE veterinarian_id = v_vet_id
          AND scheduled_for = p_new_scheduled_for
          AND id != p_appointment_id
          AND lifecycle_status IN ('solicitado', 'aguardando_pagamento', 'confirmado')
    ) INTO v_conflict;

    IF v_conflict THEN
        RAISE EXCEPTION 'O novo horário escolhido já está ocupado.' USING ERRCODE = '23505';
    END IF;

    UPDATE public.appointments
    SET 
        scheduled_for = p_new_scheduled_for,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', p_appointment_id,
        'new_scheduled_for', p_new_scheduled_for
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
