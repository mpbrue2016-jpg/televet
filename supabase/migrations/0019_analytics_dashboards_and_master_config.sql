-- ==============================================================================
-- 0019_analytics_dashboards_and_master_config.sql
-- Fase 9: Funções RPC de Analytics para os 4 Dashboards e Configurações Master
-- ==============================================================================

-- 1. TABELA: platform_global_settings (Painel Master de Governança Global)
CREATE TABLE IF NOT EXISTS public.platform_global_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name VARCHAR(128) NOT NULL DEFAULT 'TeleVet',
    default_trial_days INTEGER NOT NULL DEFAULT 14,
    default_cancellation_hours INTEGER NOT NULL DEFAULT 2,
    gateway_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 2.99,
    gateway_fee_fixed_cents INTEGER NOT NULL DEFAULT 49,
    require_crmv_auto_validation BOOLEAN NOT NULL DEFAULT TRUE,
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    support_email VARCHAR(255) NOT NULL DEFAULT 'suporte@televet.io',
    settings_payload JSONB NOT NULL DEFAULT '{
        "allowed_payout_days": ["monday", "thursday"],
        "min_payout_amount_cents": 5000,
        "max_refund_window_days": 7
    }'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_global_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- RLS: Apenas Superadmin pode atualizar configurações globais
ALTER TABLE public.platform_global_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_global_settings_select ON public.platform_global_settings
FOR SELECT USING (true);

CREATE POLICY policy_global_settings_update ON public.platform_global_settings
FOR ALL USING (public.is_admin());

-- 2. FUNÇÃO RPC: Métricas do Dashboard do Administrador Master
CREATE OR REPLACE FUNCTION public.get_admin_master_metrics()
RETURNS JSONB AS $$
DECLARE
    v_mrr_cents BIGINT := 0;
    v_arr_cents BIGINT := 0;
    v_commissions_cents BIGINT := 0;
    v_gmv_cents BIGINT := 0;
    v_total_revenue_cents BIGINT := 0;
    v_refunds_cents BIGINT := 0;
    
    v_petshops_active INTEGER := 0;
    v_petshops_trial INTEGER := 0;
    v_petshops_inadimplentes INTEGER := 0;
    v_petshops_cancelados INTEGER := 0;
    v_petshops_total INTEGER := 0;
    
    v_vets_total INTEGER := 0;
    v_vets_validated INTEGER := 0;
    v_vets_pending INTEGER := 0;
    
    v_apps_scheduled INTEGER := 0;
    v_apps_paid INTEGER := 0;
    v_apps_completed INTEGER := 0;
    v_apps_cancelled INTEGER := 0;
    
    v_tutors_total INTEGER := 0;
    v_pets_total INTEGER := 0;
    v_clinics_total INTEGER := 0;
BEGIN
    -- Validação de segurança: apenas Administrador Master
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Master pode consultar métricas globais.'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Métricas Financeiras
    -- MRR: Soma de mensalidades ativas do mês atual
    SELECT COALESCE(SUM(sp.price_cents), 0) INTO v_mrr_cents
    FROM public.tenant_subscriptions ts
    JOIN public.saas_plans sp ON sp.id = ts.plan_id
    WHERE ts.status = 'ativo';

    v_arr_cents := v_mrr_cents * 12;

    -- GMV: Total de pagamentos capturados
    SELECT COALESCE(SUM(gross_amount_cents), 0) INTO v_gmv_cents
    FROM public.payments
    WHERE status = 'captured';

    -- Comissões da Plataforma
    SELECT COALESCE(SUM(platform_commission_cents), 0) INTO v_commissions_cents
    FROM public.payments
    WHERE status = 'captured';

    -- Reembolsos
    SELECT COALESCE(SUM(amount_cents), 0) INTO v_refunds_cents
    FROM public.refunds
    WHERE status = 'succeeded';

    -- Receita Total Líquida da Plataforma = Mensalidades (MRR) + Comissões
    v_total_revenue_cents := v_mrr_cents + v_commissions_cents;

    -- 2. Status dos Pet Shops
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE ts.status = 'ativo'),
        COUNT(*) FILTER (WHERE ts.status = 'trial'),
        COUNT(*) FILTER (WHERE ts.status IN ('inadimplente', 'pagamento_pendente')),
        COUNT(*) FILTER (WHERE ts.status IN ('cancelado', 'suspenso'))
    INTO v_petshops_total, v_petshops_active, v_petshops_trial, v_petshops_inadimplentes, v_petshops_cancelados
    FROM public.petshops p
    LEFT JOIN public.tenant_subscriptions ts ON ts.tenant_id = p.tenant_id;

    -- 3. Veterinários e CRMV
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE pr.crmv_status = 'validated'),
        COUNT(*) FILTER (WHERE pr.crmv_status IN ('pending', 'in_validation'))
    INTO v_vets_total, v_vets_validated, v_vets_pending
    FROM public.veterinarians v
    LEFT JOIN public.professional_registrations pr ON pr.veterinarian_id = v.id;

    -- 4. Consultas
    SELECT 
        COUNT(*) FILTER (WHERE lifecycle_status = 'solicitado'),
        COUNT(*) FILTER (WHERE lifecycle_status = 'confirmado'),
        COUNT(*) FILTER (WHERE lifecycle_status = 'realizado'),
        COUNT(*) FILTER (WHERE lifecycle_status IN ('cancelado', 'reembolsado'))
    INTO v_apps_scheduled, v_apps_paid, v_apps_completed, v_apps_cancelled
    FROM public.appointments;

    -- 5. Demais contadores
    SELECT COUNT(*) INTO v_tutors_total FROM public.tutors;
    SELECT COUNT(*) INTO v_pets_total FROM public.pets;
    SELECT COUNT(*) INTO v_clinics_total FROM public.clinics;

    RETURN jsonb_build_object(
        'financial', jsonb_build_object(
            'mrr_cents', v_mrr_cents,
            'arr_cents', v_arr_cents,
            'gmv_cents', v_gmv_cents,
            'commissions_cents', v_commissions_cents,
            'refunds_cents', v_refunds_cents,
            'total_revenue_cents', v_total_revenue_cents
        ),
        'petshops', jsonb_build_object(
            'total', v_petshops_total,
            'active', v_petshops_active,
            'trial', v_petshops_trial,
            'inadimplente', v_petshops_inadimplentes,
            'canceled', v_petshops_cancelados
        ),
        'veterinarians', jsonb_build_object(
            'total', v_vets_total,
            'validated', v_vets_validated,
            'pending', v_vets_pending
        ),
        'appointments', jsonb_build_object(
            'scheduled', v_apps_scheduled,
            'paid', v_apps_paid,
            'completed', v_apps_completed,
            'cancelled', v_apps_cancelled
        ),
        'ecosystem', jsonb_build_object(
            'tutors_count', v_tutors_total,
            'pets_count', v_pets_total,
            'clinics_count', v_clinics_total
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. FUNÇÃO RPC: Métricas do Dashboard do Pet Shop
CREATE OR REPLACE FUNCTION public.get_petshop_dashboard_metrics(
    p_tenant_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_petshop RECORD;
    v_sub RECORD;
    v_commissions_received BIGINT := 0;
    v_commissions_pending BIGINT := 0;
    v_refunds_deducted BIGINT := 0;
    v_total_generated BIGINT := 0;
    v_consultations_count INTEGER := 0;
    v_tutors_count INTEGER := 0;
    v_referral_code VARCHAR(64);
    v_qr_scans INTEGER := 0;
BEGIN
    SELECT * INTO v_petshop FROM public.petshops WHERE tenant_id = p_tenant_id LIMIT 1;
    IF v_petshop.id IS NULL THEN
        RAISE EXCEPTION 'Pet Shop não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    -- Informações da Assinatura SaaS
    SELECT ts.*, sp.name AS plan_name, sp.price_cents AS plan_price 
    INTO v_sub
    FROM public.tenant_subscriptions ts
    JOIN public.saas_plans sp ON sp.id = ts.plan_id
    WHERE ts.tenant_id = p_tenant_id;

    -- Saldo disponível na Wallet da loja
    SELECT COALESCE(balance_cents, 0), COALESCE(pending_balance_cents, 0)
    INTO v_commissions_received, v_commissions_pending
    FROM public.wallets
    WHERE tenant_id = p_tenant_id AND owner_type = 'petshop';

    -- Consultas Indicadas e Faturamento Total Gerado
    SELECT 
        COUNT(*),
        COALESCE(SUM(gross_amount_cents), 0),
        COALESCE(SUM(petshop_commission_cents), 0)
    INTO v_consultations_count, v_total_generated, v_commissions_received
    FROM public.payments
    WHERE tenant_id = p_tenant_id AND status = 'captured';

    -- Código de indicação e Scans de QR Code
    SELECT code INTO v_referral_code FROM public.referrals WHERE tenant_id = p_tenant_id LIMIT 1;
    SELECT COALESCE(SUM(scans_count), 0) INTO v_qr_scans FROM public.qr_codes WHERE tenant_id = p_tenant_id;

    -- Tutores convertidos vinculados à loja
    SELECT COUNT(*) INTO v_tutors_count FROM public.tutors WHERE tenant_id = p_tenant_id;

    RETURN jsonb_build_object(
        'petshop_name', v_petshop.name,
        'commissions', jsonb_build_object(
            'consultations_count', v_consultations_count,
            'total_value_generated_cents', v_total_generated,
            'commissions_received_cents', v_commissions_received,
            'commissions_pending_cents', v_commissions_pending,
            'refunds_cents', v_refunds_deducted
        ),
        'subscription', jsonb_build_object(
            'plan_name', COALESCE(v_sub.plan_name, 'Sem plano'),
            'price_cents', COALESCE(v_sub.plan_price, 0),
            'status', COALESCE(v_sub.status::text, 'em_cadastro'),
            'renewal_date', v_sub.current_period_end
        ),
        'referrals', jsonb_build_object(
            'referral_code', v_referral_code,
            'exclusive_link', 'https://tele-veterinaria.com.br/petshop/' || (SELECT slug FROM public.tenants WHERE id = p_tenant_id),
            'qr_scans_count', v_qr_scans,
            'tutors_converted', v_tutors_count
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 4. FUNÇÃO RPC: Métricas do Dashboard do Médico Veterinário
CREATE OR REPLACE FUNCTION public.get_veterinarian_dashboard_metrics(
    p_veterinarian_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_vet RECORD;
    v_user RECORD;
    v_crmv RECORD;
    v_wallet RECORD;
    v_total_earnings BIGINT := 0;
    v_apps_today INTEGER := 0;
    v_apps_completed INTEGER := 0;
    v_patients_count INTEGER := 0;
    v_prescriptions_count INTEGER := 0;
BEGIN
    SELECT * INTO v_vet FROM public.veterinarians WHERE id = p_veterinarian_id;
    IF v_vet.id IS NULL THEN
        RAISE EXCEPTION 'Veterinário não localizado.' USING ERRCODE = 'P0002';
    END IF;

    SELECT full_name, email INTO v_user FROM public.users WHERE id = v_vet.user_id;
    SELECT crmv_number, state_uf, crmv_status INTO v_crmv FROM public.professional_registrations WHERE veterinarian_id = p_veterinarian_id LIMIT 1;
    
    -- Saldo líquido na carteira
    SELECT balance_cents, pending_balance_cents INTO v_wallet 
    FROM public.wallets 
    WHERE owner_type = 'veterinarian' AND owner_id = p_veterinarian_id LIMIT 1;

    -- Consultas de hoje
    SELECT COUNT(*) INTO v_apps_today 
    FROM public.appointments 
    WHERE veterinarian_id = p_veterinarian_id 
      AND scheduled_for::date = CURRENT_DATE 
      AND lifecycle_status = 'confirmado';

    -- Total de consultas realizadas
    SELECT COUNT(*) INTO v_apps_completed 
    FROM public.appointments 
    WHERE veterinarian_id = p_veterinarian_id 
      AND lifecycle_status = 'realizado';

    -- Total de pacientes únicos atendidos
    SELECT COUNT(DISTINCT pet_id) INTO v_patients_count
    FROM public.appointments
    WHERE veterinarian_id = p_veterinarian_id;

    -- Receitas emitidas
    SELECT COUNT(*) INTO v_prescriptions_count
    FROM public.prescriptions
    WHERE veterinarian_id = p_veterinarian_id;

    RETURN jsonb_build_object(
        'veterinarian', jsonb_build_object(
            'name', v_user.full_name,
            'crmv', v_crmv.crmv_number || '/' || v_crmv.state_uf,
            'crmv_status', v_crmv.crmv_status,
            'rating', v_vet.rating_average,
            'total_reviews', v_vet.total_reviews
        ),
        'financial', jsonb_build_object(
            'available_balance_cents', COALESCE(v_wallet.balance_cents, 0),
            'pending_balance_cents', COALESCE(v_wallet.pending_balance_cents, 0),
            'consultation_fee_cents', v_vet.consultation_fee_cents
        ),
        'appointments', jsonb_build_object(
            'today_count', v_apps_today,
            'completed_count', v_apps_completed,
            'patients_count', v_patients_count,
            'prescriptions_issued', v_prescriptions_count
        )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. FUNÇÃO RPC: Métricas do Dashboard do Tutor
CREATE OR REPLACE FUNCTION public.get_tutor_dashboard_metrics(
    p_tutor_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_next_appointment RECORD;
    v_pets_list JSONB;
    v_prescriptions_list JSONB;
BEGIN
    -- Lista de pets do tutor
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'species', species,
        'breed', breed,
        'photo_url', photo_url,
        'weight_kg', weight_kg
    )), '[]'::jsonb) INTO v_pets_list
    FROM public.pets
    WHERE tutor_id = p_tutor_id AND is_active = TRUE;

    -- Próxima consulta agendada
    SELECT 
        a.id, a.scheduled_for, a.lifecycle_status,
        u.full_name AS veterinarian_name,
        s.name AS specialty_name,
        p.name AS pet_name
    INTO v_next_appointment
    FROM public.appointments a
    JOIN public.veterinarians v ON v.id = a.veterinarian_id
    JOIN public.users u ON u.id = v.user_id
    JOIN public.pets p ON p.id = a.pet_id
    LEFT JOIN public.specialties s ON s.id = a.specialty_id
    WHERE a.tutor_id = p_tutor_id 
      AND a.lifecycle_status IN ('solicitado', 'aguardando_pagamento', 'confirmado')
      AND a.scheduled_for >= NOW()
    ORDER BY a.scheduled_for ASC
    LIMIT 1;

    -- Receitas ativas dos pets do tutor
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pr.id,
        'validation_code', pr.validation_code,
        'signed_at', pr.signed_at,
        'expires_at', pr.expires_at,
        'pet_id', pr.pet_id
    )), '[]'::jsonb) INTO v_prescriptions_list
    FROM public.prescriptions pr
    WHERE pr.tutor_id = p_tutor_id
    ORDER BY pr.signed_at DESC
    LIMIT 5;

    RETURN jsonb_build_object(
        'pets', v_pets_list,
        'next_appointment', CASE WHEN v_next_appointment.id IS NOT NULL THEN jsonb_build_object(
            'appointment_id', v_next_appointment.id,
            'scheduled_for', v_next_appointment.scheduled_for,
            'veterinarian', v_next_appointment.veterinarian_name,
            'specialty', v_next_appointment.specialty_name,
            'pet_name', v_next_appointment.pet_name,
            'status', v_next_appointment.lifecycle_status
        ) ELSE NULL END,
        'recent_prescriptions', v_prescriptions_list
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
