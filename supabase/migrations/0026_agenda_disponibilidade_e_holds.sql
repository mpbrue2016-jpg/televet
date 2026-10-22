-- ==============================================================================
-- 0026_agenda_disponibilidade_e_holds.sql
-- Fase 6: Agenda, disponibilidade e reserva sem conflito
-- ============================================================================== 

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
    CREATE TYPE public.appointment_reservation_status AS ENUM (
        'available',
        'reserved',
        'awaiting_payment',
        'confirmed',
        'in_attendance',
        'completed',
        'cancelled',
        'rescheduled',
        'no_show'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.appointments
    ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reservation_status public.appointment_reservation_status NOT NULL DEFAULT 'available',
    ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS modality TEXT NOT NULL DEFAULT 'teleconsultation';

UPDATE public.appointments
SET
    starts_at = COALESCE(starts_at, scheduled_for),
    ends_at = COALESCE(ends_at, scheduled_for + (COALESCE(duration_minutes, 30) || ' minutes')::interval),
    reservation_status = CASE
        WHEN reservation_status IS NULL AND status = 'confirmed' THEN 'confirmed'
        WHEN reservation_status IS NULL AND status = 'in_progress' THEN 'in_attendance'
        WHEN reservation_status IS NULL AND status = 'completed' THEN 'completed'
        WHEN reservation_status IS NULL THEN 'available'
        ELSE reservation_status
    END,
    modality = COALESCE(modality, 'teleconsultation')
WHERE starts_at IS NULL OR ends_at IS NULL OR reservation_status IS NULL;

ALTER TABLE public.appointments
    ALTER COLUMN starts_at SET NOT NULL,
    ALTER COLUMN ends_at SET NOT NULL,
    ALTER COLUMN modality SET DEFAULT 'teleconsultation';

CREATE TABLE IF NOT EXISTS public.availability_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0),
    break_interval_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_interval_minutes >= 0),
    modality TEXT NOT NULL DEFAULT 'both' CHECK (modality IN ('online', 'presential', 'both')),
    min_advance_minutes INTEGER NOT NULL DEFAULT 0 CHECK (min_advance_minutes >= 0),
    max_advance_days INTEGER NOT NULL DEFAULT 90 CHECK (max_advance_days > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.availability_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    veterinarian_id UUID NOT NULL REFERENCES public.veterinarians(id) ON DELETE CASCADE,
    specialty_id UUID REFERENCES public.specialties(id) ON DELETE SET NULL,
    exception_type TEXT NOT NULL CHECK (exception_type IN ('day_off', 'period', 'time_range', 'holiday', 'personal')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (starts_at < ends_at)
);

CREATE TABLE IF NOT EXISTS public.holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL DEFAULT 'BR',
    state_code VARCHAR(2),
    city TEXT,
    holiday_date DATE NOT NULL,
    name TEXT NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_availability_rules_vet_day
    ON public.availability_rules(veterinarian_id, day_of_week, is_active);
CREATE INDEX IF NOT EXISTS idx_availability_exceptions_vet_range
    ON public.availability_exceptions(veterinarian_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_holidays_date
    ON public.holidays(holiday_date, country_code, state_code);
CREATE INDEX IF NOT EXISTS idx_appointments_starts_ends
    ON public.appointments(veterinarian_id, starts_at, ends_at, reservation_status);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.appointments'::regclass
          AND conname = 'appointments_no_overlap'
    ) THEN
        ALTER TABLE public.appointments
            ADD CONSTRAINT appointments_no_overlap
            EXCLUDE USING gist (
                veterinarian_id WITH =,
                tstzrange(starts_at, ends_at, '[)') WITH &&
            )
            WHERE (reservation_status NOT IN ('cancelled', 'rescheduled', 'no_show'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.update_appointment_range()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.scheduled_for IS NOT NULL AND (NEW.starts_at IS NULL OR NEW.ends_at IS NULL) THEN
        NEW.starts_at := NEW.scheduled_for;
        NEW.ends_at := NEW.scheduled_for + (COALESCE(NEW.duration_minutes, 30) || ' minutes')::interval;
    ELSIF NEW.starts_at IS NOT NULL AND NEW.ends_at IS NULL THEN
        NEW.ends_at := NEW.starts_at + (COALESCE(NEW.duration_minutes, 30) || ' minutes')::interval;
    ELSIF NEW.starts_at IS NULL AND NEW.ends_at IS NOT NULL THEN
        NEW.starts_at := NEW.ends_at - (COALESCE(NEW.duration_minutes, 30) || ' minutes')::interval;
    END IF;

    IF NEW.starts_at IS NOT NULL AND NEW.ends_at IS NOT NULL AND NEW.starts_at >= NEW.ends_at THEN
        RAISE EXCEPTION 'O intervalo do agendamento deve possuir início anterior ao fim.';
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointments_update_range ON public.appointments;
CREATE TRIGGER trg_appointments_update_range
BEFORE INSERT OR UPDATE OF scheduled_for, duration_minutes, starts_at, ends_at
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.update_appointment_range();

CREATE OR REPLACE FUNCTION public.validate_appointment_transition()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.reservation_status IS DISTINCT FROM OLD.reservation_status THEN
        IF NOT (
            (OLD.reservation_status = 'available'      AND NEW.reservation_status = 'reserved') OR
            (OLD.reservation_status = 'reserved'       AND NEW.reservation_status = 'awaiting_payment') OR
            (OLD.reservation_status = 'awaiting_payment' AND NEW.reservation_status = 'confirmed') OR
            (OLD.reservation_status = 'reserved'       AND NEW.reservation_status = 'cancelled') OR
            (OLD.reservation_status = 'awaiting_payment' AND NEW.reservation_status = 'cancelled') OR
            (OLD.reservation_status = 'confirmed'      AND NEW.reservation_status IN ('in_attendance','cancelled','rescheduled','no_show')) OR
            (OLD.reservation_status = 'in_attendance'  AND NEW.reservation_status IN ('completed','cancelled','no_show')) OR
            (OLD.reservation_status = 'completed'      AND NEW.reservation_status = 'rescheduled') OR
            (OLD.reservation_status = 'cancelled'      AND NEW.reservation_status = 'rescheduled')
        ) THEN
            RAISE EXCEPTION 'Transição inválida de status de agendamento: % -> %', OLD.reservation_status, NEW.reservation_status;
        END IF;
    END IF;

    IF NEW.reservation_status = 'reserved' AND NEW.hold_expires_at IS NULL THEN
        NEW.hold_expires_at := NOW() + interval '10 minutes';
    ELSIF NEW.reservation_status IN ('available', 'cancelled', 'rescheduled', 'completed', 'no_show') THEN
        NEW.hold_expires_at := NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_reservation_guard ON public.appointments;
CREATE TRIGGER trg_appointment_reservation_guard
BEFORE UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.validate_appointment_transition();

CREATE OR REPLACE FUNCTION public.release_expired_appointment_holds()
RETURNS INTEGER AS $$
DECLARE
    v_updated INTEGER;
BEGIN
    UPDATE public.appointments
    SET reservation_status = 'available',
        hold_expires_at = NULL,
        updated_at = NOW()
    WHERE reservation_status = 'reserved'
      AND hold_expires_at IS NOT NULL
      AND hold_expires_at < NOW();

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'release_expired_appointment_holds',
            '* * * * *',
            $$SELECT public.release_expired_appointment_holds();$$
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_available_appointment_slots(
    p_veterinarian_id UUID,
    p_date DATE,
    p_modality TEXT DEFAULT NULL,
    p_specialty_id UUID DEFAULT NULL
)
RETURNS TABLE (
    slot_start TIMESTAMPTZ,
    slot_end TIMESTAMPTZ,
    slot_time TIME,
    duration_minutes INTEGER,
    is_available BOOLEAN
) AS $$
WITH candidate_rules AS (
    SELECT
        r.id,
        r.start_time,
        r.end_time,
        r.slot_duration_minutes,
        r.modality,
        (((p_date::timestamp + r.start_time) AT TIME ZONE 'America/Sao_Paulo')::timestamp) AS slot_base_local
    FROM public.availability_rules r
    WHERE r.veterinarian_id = p_veterinarian_id
      AND r.day_of_week = EXTRACT(DOW FROM p_date)::int
      AND r.is_active = TRUE
      AND (p_modality IS NULL OR r.modality = 'both' OR r.modality = p_modality)
      AND (p_specialty_id IS NULL OR r.specialty_id IS NULL OR r.specialty_id = p_specialty_id)
), generated_slots AS (
    SELECT
        (slot_base_local + (gs * (slot_duration_minutes || ' minutes')::interval))::timestamp AS slot_local_start,
        ((slot_base_local + (gs * (slot_duration_minutes || ' minutes')::interval)) + (slot_duration_minutes || ' minutes')::interval)::timestamp AS slot_local_end,
        (slot_base_local + (gs * (slot_duration_minutes || ' minutes')::interval))::time AS slot_time,
        slot_duration_minutes AS duration_minutes
    FROM candidate_rules,
    LATERAL generate_series(0, ((EXTRACT(EPOCH FROM (end_time - start_time)) / 60) / slot_duration_minutes)::int - 1) AS gs
), slots_with_exclusions AS (
    SELECT
        gs.slot_local_start AT TIME ZONE 'America/Sao_Paulo' AS slot_start,
        gs.slot_local_end AT TIME ZONE 'America/Sao_Paulo' AS slot_end,
        gs.slot_time,
        gs.duration_minutes,
        (
            NOT EXISTS (
                SELECT 1
                FROM public.appointments a
                WHERE a.veterinarian_id = p_veterinarian_id
                  AND a.starts_at < ((gs.slot_local_end AT TIME ZONE 'America/Sao_Paulo'))
                  AND a.ends_at > ((gs.slot_local_start AT TIME ZONE 'America/Sao_Paulo'))
                  AND a.reservation_status NOT IN ('cancelled', 'rescheduled', 'no_show')
            )
            AND NOT EXISTS (
                SELECT 1
                FROM public.availability_exceptions e
                WHERE e.veterinarian_id = p_veterinarian_id
                  AND e.status = 'active'
                  AND e.starts_at < ((gs.slot_local_end AT TIME ZONE 'America/Sao_Paulo'))
                  AND e.ends_at > ((gs.slot_local_start AT TIME ZONE 'America/Sao_Paulo'))
            )
            AND NOT EXISTS (
                SELECT 1
                FROM public.holidays h
                WHERE h.holiday_date = p_date
            )
        ) AS is_available
    FROM generated_slots gs
)
SELECT
    slot_start,
    slot_end,
    slot_time,
    duration_minutes,
    is_available
FROM slots_with_exclusions
ORDER BY slot_start;
$$ LANGUAGE sql STABLE;

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
    v_hold_expires_at TIMESTAMPTZ;
BEGIN
    SELECT consultation_fee_cents, consultation_duration_minutes
    INTO v_fee_cents, v_duration
    FROM public.veterinarians
    WHERE id = p_veterinarian_id AND is_active = TRUE;

    IF v_fee_cents IS NULL THEN
        RAISE EXCEPTION 'Veterinário não encontrado ou inativo.' USING ERRCODE = 'P0002';
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.appointments a
        WHERE a.veterinarian_id = p_veterinarian_id
          AND a.starts_at < (p_scheduled_for + (v_duration || ' minutes')::interval)
          AND a.ends_at > p_scheduled_for
          AND a.reservation_status NOT IN ('cancelled', 'rescheduled', 'no_show')
    ) INTO v_conflict;

    IF v_conflict THEN
        RAISE EXCEPTION 'O horário selecionado já foi reservado por outro tutor.' USING ERRCODE = '23505';
    END IF;

    v_hold_expires_at := NOW() + interval '10 minutes';

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
        starts_at,
        ends_at,
        reservation_status,
        hold_expires_at,
        modality,
        status,
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
        p_scheduled_for,
        p_scheduled_for + (v_duration || ' minutes')::interval,
        'reserved',
        v_hold_expires_at,
        'teleconsultation',
        'requested',
        'solicitado'
    ) RETURNING id INTO v_appointment_id;

    RETURN jsonb_build_object(
        'success', true,
        'appointment_id', v_appointment_id,
        'tenant_id', p_tenant_id,
        'petshop_id', p_petshop_id,
        'price_cents', v_fee_cents,
        'duration_minutes', v_duration,
        'status', 'reserved',
        'hold_expires_at', v_hold_expires_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reserve_appointment_slot(
    p_appointment_id UUID,
    p_hold_minutes INTEGER DEFAULT 10
)
RETURNS JSONB AS $$
DECLARE
    v_row public.appointments%ROWTYPE;
BEGIN
    SELECT * INTO v_row
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Agendamento não localizado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.reservation_status NOT IN ('available', 'reserved') THEN
        RAISE EXCEPTION 'Só é possível reservar um slot disponível.' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.appointments
    SET reservation_status = 'reserved',
        hold_expires_at = NOW() + (p_hold_minutes || ' minutes')::interval,
        updated_at = NOW()
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object(
        'status', 'reserved',
        'hold_expires_at', NOW() + (p_hold_minutes || ' minutes')::interval
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.confirm_appointment_reservation(
    p_appointment_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_row public.appointments%ROWTYPE;
BEGIN
    SELECT * INTO v_row
    FROM public.appointments
    WHERE id = p_appointment_id
    FOR UPDATE;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'Agendamento não localizado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_row.reservation_status != 'awaiting_payment' THEN
        RAISE EXCEPTION 'A reserva deve estar em awaiting_payment para confirmação.' USING ERRCODE = 'P0003';
    END IF;

    UPDATE public.appointments
    SET reservation_status = 'confirmed',
        hold_expires_at = NULL,
        status = 'confirmed',
        lifecycle_status = 'confirmado',
        updated_at = NOW()
    WHERE id = p_appointment_id;

    RETURN jsonb_build_object('status', 'confirmed');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_availability_rules_read ON public.availability_rules;
CREATE POLICY policy_availability_rules_read ON public.availability_rules
FOR SELECT USING (true);

DROP POLICY IF EXISTS policy_availability_rules_manage ON public.availability_rules;
CREATE POLICY policy_availability_rules_manage ON public.availability_rules
FOR ALL USING (
    public.is_admin() OR veterinarian_id IN (
        SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid()
    )
)
WITH CHECK (
    public.is_admin() OR veterinarian_id IN (
        SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS policy_availability_exceptions_read ON public.availability_exceptions;
CREATE POLICY policy_availability_exceptions_read ON public.availability_exceptions
FOR SELECT USING (true);

DROP POLICY IF EXISTS policy_availability_exceptions_manage ON public.availability_exceptions;
CREATE POLICY policy_availability_exceptions_manage ON public.availability_exceptions
FOR ALL USING (
    public.is_admin() OR veterinarian_id IN (
        SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid()
    )
)
WITH CHECK (
    public.is_admin() OR veterinarian_id IN (
        SELECT v.id FROM public.veterinarians v WHERE v.user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS policy_holidays_read ON public.holidays;
CREATE POLICY policy_holidays_read ON public.holidays
FOR SELECT USING (true);

DROP POLICY IF EXISTS policy_holidays_manage ON public.holidays;
CREATE POLICY policy_holidays_manage ON public.holidays
FOR ALL USING (public.is_admin())
WITH CHECK (public.is_admin());

COMMIT;
