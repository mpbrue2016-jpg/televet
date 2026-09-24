-- ==============================================================================
-- 0009_row_level_security_and_policies.sql
-- Fase 1: Habilitação de RLS em TODAS as tabelas e Políticas Estritas de Isolamento
-- ==============================================================================

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veterinarians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veterinarian_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veterinarian_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_validation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals_clinical ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. POLÍTICAS: tenants
-- Usuário só enxerga tenants aos quais pertence, ou se for superadmin
CREATE POLICY policy_tenants_select ON public.tenants
FOR SELECT USING (
    public.is_superadmin() OR 
    id = public.current_tenant_id() OR
    id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND is_active = TRUE)
);

CREATE POLICY policy_tenants_update ON public.tenants
FOR UPDATE USING (
    public.is_superadmin() OR 
    (id = public.current_tenant_id() AND public.has_tenant_role(id, ARRAY['tenant_admin'::user_role_type]))
);

-- 3. POLÍTICAS: users
CREATE POLICY policy_users_select ON public.users
FOR SELECT USING (
    public.is_superadmin() OR
    id = auth.uid() OR
    id IN (
        SELECT tu.user_id FROM public.tenant_users tu 
        WHERE tu.tenant_id = public.current_tenant_id()
    )
);

CREATE POLICY policy_users_update ON public.users
FOR UPDATE USING (
    public.is_superadmin() OR id = auth.uid()
);

-- 4. POLÍTICAS: tenant_users
CREATE POLICY policy_tenant_users_select ON public.tenant_users
FOR SELECT USING (
    public.is_superadmin() OR
    tenant_id = public.current_tenant_id() OR
    user_id = auth.uid()
);

CREATE POLICY policy_tenant_users_admin ON public.tenant_users
FOR ALL USING (
    public.is_superadmin() OR
    public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type])
);

-- 5. MACRO POLÍTICAS DE ISOLAMENTO POR TENANT (Aplicadas a todas as entidades filhas de tenant_id)

-- Tabela: petshops
CREATE POLICY policy_petshops_isolation ON public.petshops
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: clinics
CREATE POLICY policy_clinics_isolation ON public.clinics
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: tutors
CREATE POLICY policy_tutors_isolation ON public.tutors
FOR ALL USING (
    public.is_superadmin() OR (
        tenant_id = public.current_tenant_id() AND (
            user_id = auth.uid() OR 
            public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type, 'receptionist'::user_role_type, 'veterinarian'::user_role_type])
        )
    )
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: pets
CREATE POLICY policy_pets_isolation ON public.pets
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: appointments
CREATE POLICY policy_appointments_isolation ON public.appointments
FOR ALL USING (
    public.is_superadmin() OR (
        tenant_id = public.current_tenant_id() AND (
            tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()) OR
            veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid()) OR
            public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type, 'receptionist'::user_role_type])
        )
    )
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: consultations
CREATE POLICY policy_consultations_isolation ON public.consultations
FOR ALL USING (
    public.is_superadmin() OR (
        tenant_id = public.current_tenant_id() AND (
            appointment_id IN (
                SELECT a.id FROM public.appointments a 
                WHERE a.tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
                   OR a.veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
            ) OR
            public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type])
        )
    )
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: medical_records
CREATE POLICY policy_medical_records_isolation ON public.medical_records
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: prescriptions
CREATE POLICY policy_prescriptions_isolation ON public.prescriptions
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: exams
CREATE POLICY policy_exams_isolation ON public.exams
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: referrals_clinical
CREATE POLICY policy_referrals_clinical_isolation ON public.referrals_clinical
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: documents
CREATE POLICY policy_documents_isolation ON public.documents
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: subscription_plans
CREATE POLICY policy_subscription_plans_isolation ON public.subscription_plans
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: subscriptions
CREATE POLICY policy_subscriptions_isolation ON public.subscriptions
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: invoices
CREATE POLICY policy_invoices_isolation ON public.invoices
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: payments
CREATE POLICY policy_payments_isolation ON public.payments
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: payment_splits
CREATE POLICY policy_payment_splits_isolation ON public.payment_splits
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: commissions
CREATE POLICY policy_commissions_isolation ON public.commissions
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: wallets
CREATE POLICY policy_wallets_isolation ON public.wallets
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: payouts
CREATE POLICY policy_payouts_isolation ON public.payouts
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: refunds
CREATE POLICY policy_refunds_isolation ON public.refunds
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: referrals
CREATE POLICY policy_referrals_isolation ON public.referrals
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: referral_attributions
CREATE POLICY policy_referral_attributions_isolation ON public.referral_attributions
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: qr_codes
CREATE POLICY policy_qr_codes_isolation ON public.qr_codes
FOR ALL USING (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: notifications
CREATE POLICY policy_notifications_isolation ON public.notifications
FOR ALL USING (
    public.is_superadmin() OR (tenant_id = public.current_tenant_id() AND user_id = auth.uid())
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: support_tickets
CREATE POLICY policy_support_tickets_isolation ON public.support_tickets
FOR ALL USING (
    public.is_superadmin() OR (
        tenant_id = public.current_tenant_id() AND (
            user_id = auth.uid() OR
            public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type])
        )
    )
) WITH CHECK (
    public.is_superadmin() OR tenant_id = public.current_tenant_id()
);

-- Tabela: audit_logs (Leitura permitida apenas para admins do Tenant ou Superadmin)
CREATE POLICY policy_audit_logs_isolation ON public.audit_logs
FOR SELECT USING (
    public.is_superadmin() OR (
        tenant_id = public.current_tenant_id() AND
        public.has_tenant_role(tenant_id, ARRAY['tenant_admin'::user_role_type])
    )
);

-- 6. Tabelas Globais / Catálogos Compartilhados
-- Specialties: Leitura pública para autenticados, escrita apenas superadmin
CREATE POLICY policy_specialties_select ON public.specialties
FOR SELECT USING (true);

CREATE POLICY policy_specialties_admin ON public.specialties
FOR ALL USING (public.is_superadmin());

-- Veterinarians & Registrations
CREATE POLICY policy_vets_select ON public.veterinarians
FOR SELECT USING (true);

CREATE POLICY policy_vets_manage ON public.veterinarians
FOR ALL USING (public.is_superadmin() OR user_id = auth.uid());

CREATE POLICY policy_vet_tenants_isolation ON public.veterinarian_tenants
FOR ALL USING (
    public.is_superadmin() OR 
    tenant_id = public.current_tenant_id() OR
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

CREATE POLICY policy_prof_registrations_select ON public.professional_registrations
FOR SELECT USING (true);

CREATE POLICY policy_prof_registrations_manage ON public.professional_registrations
FOR ALL USING (
    public.is_superadmin() OR
    veterinarian_id IN (SELECT id FROM public.veterinarians WHERE user_id = auth.uid())
);

CREATE POLICY policy_crm_validation_select ON public.crm_validation
FOR SELECT USING (
    public.is_superadmin() OR
    registration_id IN (
        SELECT pr.id FROM public.professional_registrations pr
        JOIN public.veterinarians v ON v.id = pr.veterinarian_id
        WHERE v.user_id = auth.uid()
    )
);
