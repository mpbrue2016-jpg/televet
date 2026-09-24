-- ==============================================================================
-- seed.sql
-- Dados iniciais realistas para desenvolvimento e validação de isolamento
-- ==============================================================================

-- 1. Especialidades Veterinárias
INSERT INTO public.specialties (id, name, description, icon_name) VALUES
('11111111-1111-1111-1111-111111110001', 'Clínica Geral', 'Atendimento primário e triagem clínica completa', 'stethoscope'),
('11111111-1111-1111-1111-111111110002', 'Dermatologia', 'Cuidados de pele, pelos, alergias e infecções cutâneas', 'allergies'),
('11111111-1111-1111-1111-111111110003', 'Cardiologia', 'Exames cardíacos, eletrocardiogramas e acompanhamento', 'heart-pulse'),
('11111111-1111-1111-1111-111111110004', 'Nutrologia e Obesidade', 'Dietas personalizadas, controle de peso e rações terapêuticas', 'apple')
ON CONFLICT (name) DO NOTHING;

-- 2. Tenants (Pet Shops Parceiros)
-- Tenant A: Pet Shop Amigo Fiel
INSERT INTO public.tenants (id, slug, name, trade_name, tax_id_cnpj, email, phone, status, white_label_config) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'amigo-fiel', 'Amigo Fiel Pet Care Ltda', 'Pet Shop Amigo Fiel', '11.222.333/0001-44', 'contato@amigofiel.com.br', '(11) 98888-1111', 'active', '{
    "primary_color": "#10b981",
    "secondary_color": "#047857",
    "brand_name": "TeleVet Amigo Fiel"
}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Tenant B: Pet Mania Store
INSERT INTO public.tenants (id, slug, name, trade_name, tax_id_cnpj, email, phone, status, white_label_config) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'pet-mania', 'Pet Mania Comércio de Rações Ltda', 'Pet Mania Store', '55.666.777/0001-88', 'atendimento@petmania.com.br', '(21) 97777-2222', 'active', '{
    "primary_color": "#6366f1",
    "secondary_color": "#4338ca",
    "brand_name": "ManiaVet Digital"
}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 3. Petshops
INSERT INTO public.petshops (id, tenant_id, name, trade_name, tax_id_cnpj, phone, email, commission_rate) VALUES
('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Pet Shop Amigo Fiel Matriz', 'Amigo Fiel Jardins', '11.222.333/0001-44', '(11) 98888-1111', 'loja@amigofiel.com.br', 12.50),
('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Pet Mania Botafogo', 'Pet Mania Loja 01', '55.666.777/0001-88', '(21) 97777-2222', 'loja@petmania.com.br', 10.00)
ON CONFLICT (id) DO NOTHING;

-- 4. Usuários
INSERT INTO public.users (id, email, full_name, phone, cpf, system_role, is_superadmin) VALUES
('99999999-9999-9999-9999-999999999999', 'admin@televet.io', 'Super Administrador Global', '(11) 99999-0000', '000.000.000-00', 'superadmin', true),
('a2222222-2222-2222-2222-222222222222', 'gestor@amigofiel.com.br', 'Carlos Gestor Amigo Fiel', '(11) 98888-2222', '111.111.111-11', 'tenant_admin', false),
('a3333333-3333-3333-3333-333333333333', 'tutor.ana@gmail.com', 'Ana Silva Tutora (Tenant A)', '(11) 98888-3333', '222.222.222-22', 'tutor', false),
('b2222222-2222-2222-2222-222222222222', 'gestor@petmania.com.br', 'Fernanda Gestora Pet Mania', '(21) 97777-3333', '333.333.333-33', 'tenant_admin', false),
('b3333333-3333-3333-3333-333333333333', 'tutor.bruno@gmail.com', 'Bruno Costa Tutor (Tenant B)', '(21) 97777-4444', '444.444.444-44', 'tutor', false),
('c1111111-1111-1111-1111-111111111111', 'dra.camila@vet.med.br', 'Dra. Camila Veterinária', '(11) 99111-5555', '555.555.555-55', 'veterinarian', false)
ON CONFLICT (id) DO NOTHING;

-- Vínculo de usuários aos tenants
INSERT INTO public.tenant_users (tenant_id, user_id, role) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'tenant_admin'),
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 'tutor'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b2222222-2222-2222-2222-222222222222', 'tenant_admin'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b3333333-3333-3333-3333-333333333333', 'tutor')
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 5. Perfil de Veterinário e Credenciamento
INSERT INTO public.veterinarians (id, user_id, bio, consultation_fee_cents, is_verified) VALUES
('c2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'Especialista em Clínica Médica de Pequenos Animais com mais de 8 anos de experiência.', 15000, true)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.professional_registrations (veterinarian_id, crmv_number, state_uf, status) VALUES
('c2222222-2222-2222-2222-222222222222', 'CRMV-SP 45892', 'SP', 'active_regular')
ON CONFLICT (crmv_number, state_uf) DO NOTHING;

-- Credencia o vet nos dois tenants
INSERT INTO public.veterinarian_tenants (tenant_id, veterinarian_id, is_primary) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c2222222-2222-2222-2222-222222222222', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c2222222-2222-2222-2222-222222222222', false)
ON CONFLICT (tenant_id, veterinarian_id) DO NOTHING;

-- 6. Tutores e Pets
-- Tutor e Pet no Tenant A
INSERT INTO public.tutors (id, tenant_id, user_id, notes) VALUES
('a4444444-4444-4444-4444-444444444444', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a3333333-3333-3333-3333-333333333333', 'Cliente fiel do plano de banho e tosa')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pets (id, tenant_id, tutor_id, name, species, breed, sex, birth_date, weight_kg) VALUES
('a5555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a4444444-4444-4444-4444-444444444444', 'Thor (Tenant A)', 'canine', 'Golden Retriever', 'male', '2021-05-10', 32.5)
ON CONFLICT (id) DO NOTHING;

-- Tutor e Pet no Tenant B
INSERT INTO public.tutors (id, tenant_id, user_id, notes) VALUES
('b4444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b3333333-3333-3333-3333-333333333333', 'Novo tutor de gatinho resgatado')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pets (id, tenant_id, tutor_id, name, species, breed, sex, birth_date, weight_kg) VALUES
('b5555555-5555-5555-5555-555555555555', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b4444444-4444-4444-4444-444444444444', 'Luna (Tenant B)', 'feline', 'Siamês', 'female', '2022-08-15', 4.2)
ON CONFLICT (id) DO NOTHING;
