-- ==============================================================================
-- 0008_notifications_support_and_audit.sql
-- Fase 1: Notificações, Suporte, LGPD e Auditoria Completa
-- ==============================================================================

DO $$ BEGIN
    CREATE TYPE ticket_priority_type AS ENUM (
        'low',
        'medium',
        'high',
        'urgent'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ticket_status_type AS ENUM (
        'open',
        'in_progress',
        'waiting_user',
        'resolved',
        'closed'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. TABELA: notifications (Notificações in-app, push, e-mail e whatsapp)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'in_app', -- in_app, email, push, whatsapp
    category VARCHAR(64) NOT NULL DEFAULT 'general', -- appointment_reminder, prescription_ready, payment_approved, system
    action_url TEXT,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABELA: support_tickets (Helpdesk / Atendimento a tutores, vets e pet shops)
CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_to_user_id UUID REFERENCES public.users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'general', -- technical, billing, medical, doubt
    priority ticket_priority_type NOT NULL DEFAULT 'medium',
    status ticket_status_type NOT NULL DEFAULT 'open',
    resolution_notes TEXT,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. TABELA: audit_logs (Auditoria imutável com rastreamento completo de eventos e LGPD)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL, -- INSERT, UPDATE, DELETE, ACCESS, EXPORT
    entity VARCHAR(128) NOT NULL, -- Nome da tabela / entidade
    entity_id VARCHAR(128) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gatilho Genérico de Auditoria Automática
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_old JSONB := null;
    v_new JSONB := null;
    v_entity_id VARCHAR(128);
BEGIN
    -- Identifica usuário autenticado se houver
    v_user_id := auth.uid();
    
    IF (TG_OP = 'DELETE') THEN
        v_entity_id := OLD.id::text;
        v_old := to_jsonb(OLD);
        -- Tenta inferir tenant_id se a coluna existir
        BEGIN
            v_tenant_id := OLD.tenant_id;
        EXCEPTION WHEN OTHERS THEN
            v_tenant_id := null;
        END;
    ELSE
        v_entity_id := NEW.id::text;
        v_new := to_jsonb(NEW);
        IF (TG_OP = 'UPDATE') THEN
            v_old := to_jsonb(OLD);
        END IF;
        BEGIN
            v_tenant_id := NEW.tenant_id;
        EXCEPTION WHEN OTHERS THEN
            v_tenant_id := null;
        END;
    END IF;

    -- Inserção no log de auditoria
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        entity,
        entity_id,
        old_data,
        new_data,
        ip_address
    ) VALUES (
        v_tenant_id,
        v_user_id,
        TG_OP,
        TG_TABLE_NAME,
        v_entity_id,
        v_old,
        v_new,
        inet_client_addr()
    );

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ativação do gatilho de auditoria em tabelas sensíveis
CREATE OR REPLACE TRIGGER trg_audit_pets
AFTER INSERT OR UPDATE OR DELETE ON public.pets
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_prescriptions
AFTER INSERT OR UPDATE OR DELETE ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_payments
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE OR REPLACE TRIGGER trg_audit_medical_records
AFTER INSERT OR UPDATE OR DELETE ON public.medical_records
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

-- Índices
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON public.notifications(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON public.support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Triggers de atualização
CREATE OR REPLACE TRIGGER trg_support_tickets_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();
