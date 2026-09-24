# Plataforma TeleVet — Multi-Tenant & Marketplace Veterinário

Arquitetura de Banco de Dados e Segurança implementada para o Supabase (PostgreSQL).

## Estrutura de Diretórios

```
televet/
├── package.json
└── supabase/
    ├── deploy_all.sql             # Executador unificado das migrações
    ├── seed.sql                   # Carga de dados realistas com 2 Tenants de teste
    ├── migrations/                # 9 Migrações modulares e idempotentes
    │   ├── 0001_core_and_multitenancy.sql
    │   ├── 0002_petshops_clinics_tutors_pets.sql
    │   ├── 0003_veterinarians_and_crm.sql
    │   ├── 0004_appointments_and_consultations.sql
    │   ├── 0005_clinical_records_and_documents.sql
    │   ├── 0006_billing_payments_and_wallets.sql
    │   ├── 0007_referrals_qrcodes_growth.sql
    │   ├── 0008_notifications_support_and_audit.sql
    │   └── 0009_row_level_security_and_policies.sql
    └── tests/
        └── tenant_isolation_test.sql # Suíte de validação de isolamento e RLS
```

---

## Entidades Criadas

1. **Multi-Tenancy & Core**: `tenants`, `users`, `tenant_users`.
2. **Pet Shops & Clínicas**: `petshops`, `clinics`.
3. **Tutores & Pets**: `tutors`, `pets`.
4. **Corpo Clínico & CRMV**: `specialties`, `veterinarians`, `veterinarian_tenants`, `veterinarian_specialties`, `professional_registrations`, `crm_validation`.
5. **Agendamento & Consultas**: `appointments`, `consultations`.
6. **Prontuário & Documentos**: `medical_records`, `prescriptions`, `exams`, `referrals_clinical`, `documents`.
7. **Financeiro & Marketplace**: `subscription_plans`, `subscriptions`, `invoices`, `payments`, `payment_splits`, `commissions`, `wallets`, `payouts`, `refunds`.
8. **Crescimento & Afiliados**: `referrals`, `referral_attributions`, `qr_codes`.
9. **Suporte & Governança**: `notifications`, `support_tickets`, `audit_logs`.

---

## Como Executar

### 1. Via Supabase CLI (Local)
```bash
cd televet
npx supabase db reset
```

### 2. Via Supabase Dashboard (Cloud)
- Acesse o painel do seu projeto no Supabase -> **SQL Editor**.
- Execute em sequência as migrações de `0001` até `0009` (ou copie e cole seu conteúdo).
- Execute `seed.sql` para carregar o ecossistema de teste.
- Execute `tests/tenant_isolation_test.sql` para validar o isolamento.
