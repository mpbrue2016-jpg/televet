-- ==============================================================================
-- deploy_all.sql
-- Script consolidado para aplicação direta via painel Supabase SQL Editor
-- Executa todas as migrações na ordem estrita de dependência
-- ==============================================================================

-- FASE 1: ARQUITETURA + BANCO DE DADOS
\ir migrations/0001_core_and_multitenancy.sql
\ir migrations/0002_petshops_clinics_tutors_pets.sql
\ir migrations/0003_veterinarians_and_crm.sql
\ir migrations/0004_appointments_and_consultations.sql
\ir migrations/0005_clinical_records_and_documents.sql
\ir migrations/0006_billing_payments_and_wallets.sql
\ir migrations/0007_referrals_qrcodes_growth.sql
\ir migrations/0008_notifications_support_and_audit.sql
\ir migrations/0009_row_level_security_and_policies.sql

-- FASE 2: AUTENTICAÇÃO + PERFIS (RBAC)
\ir migrations/0010_auth_triggers_and_sync.sql
\ir migrations/0011_rbac_functions_and_policies.sql
\ir migrations/0012_account_security_and_blocking.sql

-- FASE 3: PET SHOPS PARCEIROS, WHITE-LABEL E ATRIBUIÇÃO
\ir migrations/0013_petshop_public_profiles_and_attribution.sql

-- FASE 4: VETERINÁRIOS, ESPECIALIDADES, CRMV E MARKETPLACE
\ir migrations/0014_veterinarians_marketplace_and_crmv.sql

-- FASE 5: TUTORES, PETS, CICLO DE VIDA DO AGENDAMENTO E ORIGEM DO PET SHOP
\ir migrations/0015_tutors_pets_and_appointments_lifecycle.sql

-- FASE 6: TELECONSULTA, PRONTUÁRIO ELETRÔNICO E BLINDAGEM CLÍNICA
\ir migrations/0016_teleconsultation_and_clinical_security.sql

-- FASE 7: MOTOR FINANCEIRO, SPLIT PAYMENT, COMISSÕES E CHARGEBACKS
\ir migrations/0017_financial_engine_splits_and_chargebacks.sql

-- FASE 8: SAAS, MENSALIDADES, PLANOS, INADIMPLÊNCIA E SEGREGAÇÃO CONTÁBIL
\ir migrations/0018_saas_plans_subscriptions_and_dunning.sql

-- FASE 9: DASHBOARDS ANALÍTICOS (MASTER, PET SHOP, VET, TUTOR) E GOVERNANÇA GLOBAL
\ir migrations/0019_analytics_dashboards_and_master_config.sql

-- FASE 10: MECANISMO DE GRAVAÇÃO DE TELECONSULTA E AUTORIZAÇÃO PRÉVIA (LGPD & CFMV)
\ir migrations/0020_consultation_recording_and_consent.sql
