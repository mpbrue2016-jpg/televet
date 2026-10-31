-- ==============================================================================
-- 0035_notifications_outbox_preferences_and_templates.sql
-- Fase 14: Notificações Interna, E-mail, WhatsApp Oficial e Push
-- Outbox, Deduplicação por Idempotência, Templates Versionados, Preferências e Opt-in
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tabela: user_notification_preferences (Consentimentos e Preferências LGPD)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT true,
    email_enabled BOOLEAN NOT NULL DEFAULT true,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT false, -- Opt-in explícito obrigatório para WhatsApp
    whatsapp_opt_in_at TIMESTAMPTZ,
    whatsapp_opt_in_ip INET,
    push_enabled BOOLEAN NOT NULL DEFAULT true,
    reminders_enabled BOOLEAN NOT NULL DEFAULT true,
    clinical_alerts_enabled BOOLEAN NOT NULL DEFAULT true,
    marketing_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger de updated_at para preferências
CREATE OR REPLACE TRIGGER trg_user_notification_preferences_updated_at
BEFORE UPDATE ON public.user_notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Tabela: notification_templates (Templates Versionados e Conteúdo Seguro)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    channel VARCHAR(32) NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'push')),
    name VARCHAR(255) NOT NULL,
    subject_template TEXT,
    body_template TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_notification_template_slug_version_channel UNIQUE (slug, version, channel)
);

CREATE OR REPLACE TRIGGER trg_notification_templates_updated_at
BEFORE UPDATE ON public.notification_templates
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Tabela: notification_outbox (Fila Outbox Resiliente com Deduplicação)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    notification_id UUID REFERENCES public.notifications(id) ON DELETE SET NULL, -- Vínculo com in-app existente
    event VARCHAR(64) NOT NULL, -- appointment_confirmed, vaccine_due, etc.
    channel VARCHAR(32) NOT NULL CHECK (channel IN ('in_app', 'email', 'whatsapp', 'push')),
    recipient TEXT NOT NULL, -- e-mail, telefone/whatsapp E.164, push token ou user_id
    template_slug VARCHAR(64),
    template_version INT NOT NULL DEFAULT 1,
    rendered_subject TEXT,
    rendered_body TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    secure_link TEXT, -- Link seguro autenticado com expiração
    status VARCHAR(32) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'pending_configuration', 'processing', 'sent', 'delivered', 'failed', 'skipped_opt_out', 'canceled')),
    attempts INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key VARCHAR(255) UNIQUE, -- Deduplicação estrita: um evento não gera notificações duplicadas
    external_id VARCHAR(255), -- ID oficial retornado pelo provedor real (Resend, Meta, FCM)
    provider_response JSONB,
    error_message TEXT,
    error_details JSONB,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER trg_notification_outbox_updated_at
BEFORE UPDATE ON public.notification_outbox
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Índices de performance para outbox
CREATE INDEX IF NOT EXISTS idx_outbox_pending_retry ON public.notification_outbox (status, next_retry_at) 
    WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_outbox_user_event ON public.notification_outbox (user_id, event);
CREATE INDEX IF NOT EXISTS idx_outbox_idempotency ON public.notification_outbox (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_outbox_external_id ON public.notification_outbox (external_id);
CREATE INDEX IF NOT EXISTS idx_outbox_tenant_status ON public.notification_outbox (tenant_id, status);

-- ---------------------------------------------------------------------------
-- 4. Seed de Templates Versionados (Conteúdo Mínimo e Link Seguro - Zero Dados Clínicos Sensíveis)
-- ---------------------------------------------------------------------------

-- Confirmação de Agendamento
INSERT INTO public.notification_templates (slug, version, channel, name, subject_template, body_template, variables)
VALUES 
('appointment_confirmed', 1, 'email', 'Confirmação de Consulta - E-mail',
 'Consulta Confirmada - TELEVET: {{pet_name}}',
 'Olá {{tutor_name}},\n\nO agendamento da consulta para o pet {{pet_name}} em {{scheduled_date}} foi confirmado com sucesso.\n\nPara acessar a sala de atendimento e visualizar as instruções preparatórias, utilize o link seguro abaixo:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

('appointment_confirmed', 1, 'whatsapp', 'Confirmação de Consulta - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, a consulta do pet {{pet_name}} em {{scheduled_date}} está confirmada. Acesse sua sala e instruções pelo link seguro: {{secure_link}}',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

('appointment_confirmed', 1, 'push', 'Confirmação de Consulta - Push',
 'Consulta confirmada!',
 'A consulta de {{pet_name}} está agendada para {{scheduled_date}}. Toque para conferir.',
 '["pet_name", "scheduled_date", "secure_link"]'::jsonb),

-- Cancelamento de Agendamento
('appointment_canceled', 1, 'email', 'Cancelamento de Consulta - E-mail',
 'Aviso de Cancelamento de Consulta - TELEVET',
 'Olá {{tutor_name}},\n\nInformamos que o agendamento da consulta para o pet {{pet_name}} marcado para {{scheduled_date}} foi cancelado.\n\nCaso deseje reagendar um novo horário ou tirar dúvidas, acesse nosso portal seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

('appointment_canceled', 1, 'whatsapp', 'Cancelamento de Consulta - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, o agendamento de {{pet_name}} em {{scheduled_date}} foi cancelado. Para reagendamento ou dúvidas, acesse: {{secure_link}}',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

-- Reagendamento de Consulta
('appointment_rescheduled', 1, 'email', 'Reagendamento de Consulta - E-mail',
 'Alteração no Horário de Consulta - TELEVET',
 'Olá {{tutor_name}},\n\nA consulta do pet {{pet_name}} foi reagendada para a nova data: {{scheduled_date}}.\n\nConfira todos os detalhes e o acesso à teleconsulta no link seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

('appointment_rescheduled', 1, 'whatsapp', 'Reagendamento de Consulta - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, a consulta de {{pet_name}} foi reagendada para {{scheduled_date}}. Detalhes no link seguro: {{secure_link}}',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

-- Lembrete de Consulta (24h / 1h)
('appointment_reminder', 1, 'email', 'Lembrete de Consulta - E-mail',
 'Lembrete: Consulta de {{pet_name}} em breve - TELEVET',
 'Olá {{tutor_name}},\n\nLembramos que a consulta veterinária do pet {{pet_name}} ocorrerá em {{scheduled_date}}.\n\nRecomendamos conectar-se com 5 minutos de antecedência pelo link seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

('appointment_reminder', 1, 'whatsapp', 'Lembrete de Consulta - WhatsApp',
 NULL,
 'Lembrete TELEVET: A consulta de {{pet_name}} será em {{scheduled_date}}. Acesse sua sala segura: {{secure_link}}',
 '["tutor_name", "pet_name", "scheduled_date", "secure_link"]'::jsonb),

-- Pagamento Aprovado
('payment_approved', 1, 'email', 'Pagamento Aprovado - E-mail',
 'Confirmação de Pagamento - TELEVET',
 'Olá {{tutor_name}},\n\nConfirmamos o recebimento do seu pagamento no valor de {{amount_formatted}} para o atendimento do pet {{pet_name}}.\n\nSeu comprovante e recibo estão disponíveis no link seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "amount_formatted", "pet_name", "secure_link"]'::jsonb),

('payment_approved', 1, 'whatsapp', 'Pagamento Aprovado - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, seu pagamento de {{amount_formatted}} foi aprovado. Acesse seu recibo no link seguro: {{secure_link}}',
 '["tutor_name", "amount_formatted", "secure_link"]'::jsonb),

-- Pagamento com Falha
('payment_failed', 1, 'email', 'Falha no Pagamento - E-mail',
 'Importante: Falha no Pagamento - TELEVET',
 'Olá {{tutor_name}},\n\nIdentificamos uma falha no processamento do pagamento para a consulta do pet {{pet_name}}.\n\nPor favor, atualize seus dados de cobrança no link seguro abaixo para manter sua reserva:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

-- Início de Teleconsulta
('consultation_starting', 1, 'whatsapp', 'Consulta Iniciando - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, o médico veterinário já está na sala de atendimento aguardando por você e pelo pet {{pet_name}}. Entre agora: {{secure_link}}',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

('consultation_starting', 1, 'push', 'Consulta Iniciando - Push',
 'Sua consulta começou!',
 'O médico veterinário está na sala de teleatendimento. Toque para entrar.',
 '["secure_link"]'::jsonb),

-- Receita / Documento Clínico Disponível
('prescription_ready', 1, 'email', 'Receita Digital Pronta - E-mail',
 'Documento Veterinário Disponível - TELEVET',
 'Olá {{tutor_name}},\n\nUma nova receita digital assinada eletronicamente para o pet {{pet_name}} já está disponível.\n\nPor motivos de segurança e sigilo médico, visualize e baixe o documento autenticado exclusivamente pelo portal seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

('prescription_ready', 1, 'whatsapp', 'Receita Digital Pronta - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, a receita digital assinada de {{pet_name}} está pronta. Baixe no link seguro: {{secure_link}}',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

-- Exame Disponível
('exam_ready', 1, 'email', 'Exame Disponível - E-mail',
 'Novo Documento de Exame - TELEVET',
 'Olá {{tutor_name}},\n\nO laudo ou solicitação de exame para o pet {{pet_name}} está disponível para download.\n\nAcesse com segurança pelo portal autenticado:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

('exam_ready', 1, 'whatsapp', 'Exame Disponível - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, novos exames de {{pet_name}} estão disponíveis no portal seguro: {{secure_link}}',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

-- Encaminhamento Emitido
('referral_issued', 1, 'email', 'Encaminhamento Veterinário - E-mail',
 'Encaminhamento para Especialista - TELEVET',
 'Olá {{tutor_name}},\n\nUm encaminhamento para atendimento com especialista foi emitido para o pet {{pet_name}}.\n\nConsulte a carta de encaminhamento e clínicas credenciadas no link seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

('referral_issued', 1, 'whatsapp', 'Encaminhamento Veterinário - WhatsApp',
 NULL,
 'Olá {{tutor_name}}, foi gerado um encaminhamento para especialista para {{pet_name}}. Acesse: {{secure_link}}',
 '["tutor_name", "pet_name", "secure_link"]'::jsonb),

-- Vacina a Vencer / Aplicada
('vaccine_due', 1, 'email', 'Lembrete de Vacinação - E-mail',
 'Alerta de Vacinação: {{pet_name}} - TELEVET',
 'Olá {{tutor_name}},\n\nA vacina {{vaccine_name}} do pet {{pet_name}} está próxima da data de aplicação ({{due_date}}).\n\nPara agendar a imunização ou atualizar a carteirinha, utilize o link seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["tutor_name", "pet_name", "vaccine_name", "due_date", "secure_link"]'::jsonb),

('vaccine_due', 1, 'whatsapp', 'Lembrete de Vacinação - WhatsApp',
 NULL,
 'Alerta TELEVET: A vacina {{vaccine_name}} de {{pet_name}} vence em {{due_date}}. Veja a carteira: {{secure_link}}',
 '["pet_name", "vaccine_name", "due_date", "secure_link"]'::jsonb),

-- Assinatura SaaS / Notificação Financeira
('subscription_updated', 1, 'email', 'Status da Assinatura - E-mail',
 'Atualização da sua Assinatura - TELEVET',
 'Olá {{user_name}},\n\nO status do seu plano TELEVET foi atualizado para: {{plan_status}}.\n\nGerencie sua conta e faturas no portal administrativo seguro:\n{{secure_link}}\n\nAtenciosamente,\nEquipe TELEVET',
 '["user_name", "plan_status", "secure_link"]'::jsonb),

-- Suporte / Ticket Atualizado
('support_ticket_updated', 1, 'email', 'Atualização de Suporte - E-mail',
 'Chamado #{{ticket_id}} Atualizado - Suporte TELEVET',
 'Olá {{user_name}},\n\nO seu ticket de atendimento #{{ticket_id}} recebeu uma nova resposta da nossa equipe técnica.\n\nConsulte a mensagem e dê continuidade ao suporte pelo link seguro:\n{{secure_link}}\n\nAtenciosamente,\nSuporte TELEVET',
 '["user_name", "ticket_id", "secure_link"]'::jsonb)

ON CONFLICT (slug, version, channel) DO UPDATE SET
    name = EXCLUDED.name,
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    variables = EXCLUDED.variables,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 5. Funções RPC: Enfileiramento, Deduplicação, Idempotência e Auditoria
-- ---------------------------------------------------------------------------

-- 5.1 Enfileiramento com Trava Anti-Duplicação e Respeito a Opt-Out
CREATE OR REPLACE FUNCTION public.fn_enqueue_notification(
    p_tenant_id UUID,
    p_user_id UUID,
    p_event VARCHAR(64),
    p_channel VARCHAR(32),
    p_recipient TEXT,
    p_template_slug VARCHAR(64),
    p_payload JSONB DEFAULT '{}'::jsonb,
    p_secure_link TEXT DEFAULT NULL,
    p_idempotency_key VARCHAR(255) DEFAULT NULL,
    p_max_attempts INT DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_outbox public.notification_outbox;
    v_pref public.user_notification_preferences;
    v_template public.notification_templates;
    v_rendered_subject TEXT := null;
    v_rendered_body TEXT := '';
    v_var_key TEXT;
    v_var_val TEXT;
    v_outbox_id UUID;
    v_notification_id UUID := null;
    v_status VARCHAR(32) := 'pending';
    v_error_msg TEXT := null;
BEGIN
    -- 1. Verificação de Idempotência: deduplicação imediata
    IF p_idempotency_key IS NOT NULL THEN
        SELECT * INTO v_existing_outbox 
        FROM public.notification_outbox 
        WHERE idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'outbox_id', v_existing_outbox.id,
                'status', v_existing_outbox.status,
                'idempotent_reused', true,
                'message', 'Notificação já registrada anteriormente com esta chave de idempotência.'
            );
        END IF;
    END IF;

    -- 2. Verificação de Preferências do Usuário (Opt-in / Opt-out)
    SELECT * INTO v_pref 
    FROM public.user_notification_preferences 
    WHERE user_id = p_user_id;

    -- Se não existir preferência registrada, cria com valores padrão
    IF NOT FOUND THEN
        INSERT INTO public.user_notification_preferences (user_id, tenant_id)
        VALUES (p_user_id, p_tenant_id)
        RETURNING * INTO v_pref;
    END IF;

    -- Validação de Opt-out por Canal
    IF p_channel = 'whatsapp' THEN
        -- WhatsApp EXIGE consentimento explícito prévio
        IF NOT v_pref.whatsapp_enabled THEN
            v_status := 'skipped_opt_out';
            v_error_msg := 'OPT_OUT_WHATSAPP_NOT_ACCEPTED: Usuário não concedeu opt-in para WhatsApp.';
        END IF;
    ELSIF p_channel = 'email' THEN
        IF NOT v_pref.email_enabled THEN
            v_status := 'skipped_opt_out';
            v_error_msg := 'OPT_OUT_EMAIL_DISABLED: Usuário desativou notificações por e-mail.';
        END IF;
    ELSIF p_channel = 'push' THEN
        IF NOT v_pref.push_enabled THEN
            v_status := 'skipped_opt_out';
            v_error_msg := 'OPT_OUT_PUSH_DISABLED: Usuário desativou notificações push.';
        END IF;
    ELSIF p_channel = 'in_app' THEN
        IF NOT v_pref.in_app_enabled THEN
            v_status := 'skipped_opt_out';
            v_error_msg := 'OPT_OUT_IN_APP_DISABLED: Usuário desativou notificações in-app.';
        END IF;
    END IF;

    -- 3. Resolução do Template Versionado
    SELECT * INTO v_template
    FROM public.notification_templates
    WHERE slug = p_template_slug 
      AND channel = p_channel
      AND is_active = true
    ORDER BY version DESC
    LIMIT 1;

    IF FOUND THEN
        v_rendered_subject := v_template.subject_template;
        v_rendered_body := v_template.body_template;

        -- Interpolação das variáveis do payload
        FOR v_var_key, v_var_val IN SELECT * FROM jsonb_each_text(p_payload)
        LOOP
            IF v_rendered_subject IS NOT NULL THEN
                v_rendered_subject := replace(v_rendered_subject, '{{' || v_var_key || '}}', COALESCE(v_var_val, ''));
            END IF;
            v_rendered_body := replace(v_rendered_body, '{{' || v_var_key || '}}', COALESCE(v_var_val, ''));
        END LOOP;

        -- Interpolação do secure_link
        IF p_secure_link IS NOT NULL THEN
            IF v_rendered_subject IS NOT NULL THEN
                v_rendered_subject := replace(v_rendered_subject, '{{secure_link}}', p_secure_link);
            END IF;
            v_rendered_body := replace(v_rendered_body, '{{secure_link}}', p_secure_link);
        END IF;
    ELSE
        -- Fallback simples caso não haja template cadastrado
        v_rendered_subject := COALESCE(p_payload->>'title', 'Notificação TELEVET');
        v_rendered_body := COALESCE(p_payload->>'message', 'Acesse o portal para conferir novas atualizações: ' || COALESCE(p_secure_link, ''));
    END IF;

    -- 4. Tratamento do Canal in_app: reaproveita public.notifications existente
    IF p_channel = 'in_app' AND v_status <> 'skipped_opt_out' THEN
        INSERT INTO public.notifications (
            tenant_id,
            user_id,
            title,
            message,
            channel,
            category,
            action_url
        ) VALUES (
            p_tenant_id,
            p_user_id,
            COALESCE(v_rendered_subject, 'Notificação TELEVET'),
            v_rendered_body,
            'in_app',
            p_event,
            p_secure_link
        ) RETURNING id INTO v_notification_id;

        -- Notificação in-app fica entregue imediatamente na caixa do usuário
        v_status := 'delivered';
    END IF;

    -- 5. Gravação na Outbox
    INSERT INTO public.notification_outbox (
        tenant_id,
        user_id,
        notification_id,
        event,
        channel,
        recipient,
        template_slug,
        template_version,
        rendered_subject,
        rendered_body,
        payload,
        secure_link,
        status,
        attempts,
        max_attempts,
        idempotency_key,
        error_message,
        delivered_at
    ) VALUES (
        p_tenant_id,
        p_user_id,
        v_notification_id,
        p_event,
        p_channel,
        p_recipient,
        p_template_slug,
        COALESCE(v_template.version, 1),
        v_rendered_subject,
        v_rendered_body,
        p_payload,
        p_secure_link,
        v_status,
        0,
        p_max_attempts,
        p_idempotency_key,
        v_error_msg,
        CASE WHEN v_status = 'delivered' THEN NOW() ELSE NULL END
    ) RETURNING id INTO v_outbox_id;

    RETURN jsonb_build_object(
        'success', (v_status <> 'skipped_opt_out'),
        'outbox_id', v_outbox_id,
        'status', v_status,
        'idempotent_reused', false,
        'notification_id', v_notification_id,
        'error', v_error_msg
    );
END;
$$;

-- 5.2 Consulta e Obtenção de Itens da Outbox para Envio (com SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.fn_claim_notification_outbox(
    p_batch_size INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    user_id UUID,
    event VARCHAR(64),
    channel VARCHAR(32),
    recipient TEXT,
    template_slug VARCHAR(64),
    template_version INT,
    rendered_subject TEXT,
    rendered_body TEXT,
    payload JSONB,
    secure_link TEXT,
    attempts INT,
    max_attempts INT,
    idempotency_key VARCHAR(255)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    WITH claimed AS (
        SELECT outbox.id
        FROM public.notification_outbox outbox
        WHERE outbox.status IN ('pending', 'failed')
          AND outbox.next_retry_at <= NOW()
          AND outbox.attempts < outbox.max_attempts
        ORDER BY outbox.created_at ASC
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.notification_outbox u
    SET status = 'processing',
        updated_at = NOW()
    FROM claimed
    WHERE u.id = claimed.id
    RETURNING 
        u.id,
        u.tenant_id,
        u.user_id,
        u.event,
        u.channel,
        u.recipient,
        u.template_slug,
        u.template_version,
        u.rendered_subject,
        u.rendered_body,
        u.payload,
        u.secure_link,
        u.attempts,
        u.max_attempts,
        u.idempotency_key;
END;
$$;

-- 5.3 Atualização de Estado, Retry e Resposta Real do Provedor
CREATE OR REPLACE FUNCTION public.fn_update_notification_outbox_status(
    p_outbox_id UUID,
    p_status VARCHAR(32),
    p_external_id VARCHAR(255) DEFAULT NULL,
    p_provider_response JSONB DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_error_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_outbox public.notification_outbox;
    v_new_attempts INT;
    v_next_retry TIMESTAMPTZ := null;
    v_final_status VARCHAR(32) := p_status;
BEGIN
    SELECT * INTO v_outbox FROM public.notification_outbox WHERE id = p_outbox_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Registro outbox não encontrado');
    END IF;

    v_new_attempts := v_outbox.attempts;

    IF p_status = 'sent' THEN
        UPDATE public.notification_outbox
        SET status = 'sent',
            external_id = COALESCE(p_external_id, external_id),
            provider_response = COALESCE(p_provider_response, provider_response),
            sent_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE id = p_outbox_id;

    ELSIF p_status = 'delivered' THEN
        UPDATE public.notification_outbox
        SET status = 'delivered',
            external_id = COALESCE(p_external_id, external_id),
            provider_response = COALESCE(p_provider_response, provider_response),
            sent_at = COALESCE(sent_at, NOW()),
            delivered_at = NOW(),
            error_message = NULL,
            updated_at = NOW()
        WHERE id = p_outbox_id;

    ELSIF p_status = 'pending_configuration' THEN
        -- Sem credenciais válidas: nunca declarar enviado sem resposta real do provedor
        UPDATE public.notification_outbox
        SET status = 'pending_configuration',
            error_message = COALESCE(p_error_message, 'PENDENTE DE CONFIGURAÇÃO: Credenciais do provedor não configuradas'),
            error_details = p_error_details,
            provider_response = p_provider_response,
            updated_at = NOW()
        WHERE id = p_outbox_id;

    ELSIF p_status = 'failed' THEN
        v_new_attempts := v_new_attempts + 1;
        
        IF v_new_attempts >= v_outbox.max_attempts THEN
            v_final_status := 'failed';
            UPDATE public.notification_outbox
            SET status = 'failed',
                attempts = v_new_attempts,
                failed_at = NOW(),
                error_message = p_error_message,
                error_details = p_error_details,
                provider_response = p_provider_response,
                updated_at = NOW()
            WHERE id = p_outbox_id;
        ELSE
            -- Backoff exponencial controlado: 2^attempts * 60 segundos
            v_next_retry := NOW() + ((POWER(2, v_new_attempts) * 60) * INTERVAL '1 second');
            v_final_status := 'pending';
            UPDATE public.notification_outbox
            SET status = 'pending',
                attempts = v_new_attempts,
                next_retry_at = v_next_retry,
                error_message = p_error_message,
                error_details = p_error_details,
                provider_response = p_provider_response,
                updated_at = NOW()
            WHERE id = p_outbox_id;
        END IF;

    ELSE
        UPDATE public.notification_outbox
        SET status = p_status,
            external_id = COALESCE(p_external_id, external_id),
            provider_response = COALESCE(p_provider_response, provider_response),
            error_message = p_error_message,
            updated_at = NOW()
        WHERE id = p_outbox_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'outbox_id', p_outbox_id,
        'status', v_final_status,
        'attempts', v_new_attempts,
        'next_retry_at', v_next_retry
    );
END;
$$;

-- 5.4 Gerenciamento de Preferências do Usuário (Opt-in WhatsApp com IP e Timestamp)
CREATE OR REPLACE FUNCTION public.fn_update_notification_preferences(
    p_user_id UUID,
    p_email_enabled BOOLEAN DEFAULT true,
    p_whatsapp_enabled BOOLEAN DEFAULT false,
    p_push_enabled BOOLEAN DEFAULT true,
    p_in_app_enabled BOOLEAN DEFAULT true,
    p_reminders_enabled BOOLEAN DEFAULT true,
    p_marketing_enabled BOOLEAN DEFAULT false,
    p_ip_address INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pref public.user_notification_preferences;
    v_whatsapp_opt_in_at TIMESTAMPTZ := null;
    v_whatsapp_opt_in_ip INET := null;
BEGIN
    SELECT * INTO v_pref FROM public.user_notification_preferences WHERE user_id = p_user_id;

    IF FOUND THEN
        -- Se estiver ativando o WhatsApp agora, grava timestamp e IP do consentimento
        IF p_whatsapp_enabled = true AND (v_pref.whatsapp_enabled = false OR v_pref.whatsapp_enabled IS NULL) THEN
            v_whatsapp_opt_in_at := NOW();
            v_whatsapp_opt_in_ip := p_ip_address;
        ELSE
            v_whatsapp_opt_in_at := v_pref.whatsapp_opt_in_at;
            v_whatsapp_opt_in_ip := v_pref.whatsapp_opt_in_ip;
        END IF;

        UPDATE public.user_notification_preferences
        SET email_enabled = p_email_enabled,
            whatsapp_enabled = p_whatsapp_enabled,
            whatsapp_opt_in_at = v_whatsapp_opt_in_at,
            whatsapp_opt_in_ip = v_whatsapp_opt_in_ip,
            push_enabled = p_push_enabled,
            in_app_enabled = p_in_app_enabled,
            reminders_enabled = p_reminders_enabled,
            marketing_enabled = p_marketing_enabled,
            updated_at = NOW()
        WHERE user_id = p_user_id
        RETURNING * INTO v_pref;
    ELSE
        IF p_whatsapp_enabled = true THEN
            v_whatsapp_opt_in_at := NOW();
            v_whatsapp_opt_in_ip := p_ip_address;
        END IF;

        INSERT INTO public.user_notification_preferences (
            user_id,
            email_enabled,
            whatsapp_enabled,
            whatsapp_opt_in_at,
            whatsapp_opt_in_ip,
            push_enabled,
            in_app_enabled,
            reminders_enabled,
            marketing_enabled
        ) VALUES (
            p_user_id,
            p_email_enabled,
            p_whatsapp_enabled,
            v_whatsapp_opt_in_at,
            v_whatsapp_opt_in_ip,
            p_push_enabled,
            p_in_app_enabled,
            p_reminders_enabled,
            p_marketing_enabled
        ) RETURNING * INTO v_pref;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_pref.user_id,
        'email_enabled', v_pref.email_enabled,
        'whatsapp_enabled', v_pref.whatsapp_enabled,
        'whatsapp_opt_in_at', v_pref.whatsapp_opt_in_at,
        'push_enabled', v_pref.push_enabled,
        'in_app_enabled', v_pref.in_app_enabled,
        'reminders_enabled', v_pref.reminders_enabled,
        'marketing_enabled', v_pref.marketing_enabled
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_get_notification_preferences(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pref public.user_notification_preferences;
BEGIN
    SELECT * INTO v_pref FROM public.user_notification_preferences WHERE user_id = p_user_id;
    IF NOT FOUND THEN
        INSERT INTO public.user_notification_preferences (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_pref;
    END IF;

    RETURN to_jsonb(v_pref);
END;
$$;

-- 5.5 Métricas Administrativas da Outbox
CREATE OR REPLACE FUNCTION public.fn_get_outbox_audit_metrics(p_tenant_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_total BIGINT;
    v_pending BIGINT;
    v_sent BIGINT;
    v_delivered BIGINT;
    v_failed BIGINT;
    v_pending_config BIGINT;
    v_opt_out BIGINT;
    v_success_rate NUMERIC(5,2);
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE status = 'pending'),
        COUNT(*) FILTER (WHERE status = 'sent'),
        COUNT(*) FILTER (WHERE status = 'delivered'),
        COUNT(*) FILTER (WHERE status = 'failed'),
        COUNT(*) FILTER (WHERE status = 'pending_configuration'),
        COUNT(*) FILTER (WHERE status = 'skipped_opt_out')
    INTO 
        v_total, v_pending, v_sent, v_delivered, v_failed, v_pending_config, v_opt_out
    FROM public.notification_outbox
    WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id);

    IF (v_delivered + v_sent + v_failed) > 0 THEN
        v_success_rate := ROUND(((v_delivered + v_sent)::numeric / (v_delivered + v_sent + v_failed)::numeric) * 100, 2);
    ELSE
        v_success_rate := 100.00;
    END IF;

    RETURN jsonb_build_object(
        'total', v_total,
        'pending', v_pending,
        'sent', v_sent,
        'delivered', v_delivered,
        'failed', v_failed,
        'pending_configuration', v_pending_config,
        'skipped_opt_out', v_opt_out,
        'success_rate', v_success_rate
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Segurança e Row Level Security (RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- 6.1 Preferências
CREATE POLICY "Usuarios gerenciam suas proprias preferencias de notificacao"
    ON public.user_notification_preferences
    FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins e Superadmins leem preferencias do tenant"
    ON public.user_notification_preferences
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() 
              AND u.role IN ('admin', 'superadmin')
              AND (u.tenant_id = user_notification_preferences.tenant_id OR u.role = 'superadmin')
        )
    );

-- 6.2 Templates
CREATE POLICY "Usuarios autenticados leem templates ativos"
    ON public.notification_templates
    FOR SELECT
    TO authenticated
    USING (is_active = true);

CREATE POLICY "Admins gerenciam templates"
    ON public.notification_templates
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role IN ('admin', 'superadmin')
        )
    );

-- 6.3 Outbox
CREATE POLICY "Usuarios veem historico de notificacoes proprias"
    ON public.notification_outbox
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Admins e Superadmins gerenciam outbox do tenant"
    ON public.notification_outbox
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() 
              AND u.role IN ('admin', 'superadmin')
              AND (u.tenant_id = notification_outbox.tenant_id OR u.role = 'superadmin')
        )
    );

-- Revogação de acesso público direto a DML
REVOKE ALL ON public.user_notification_preferences FROM public, anon;
REVOKE ALL ON public.notification_templates FROM public, anon;
REVOKE ALL ON public.notification_outbox FROM public, anon;

GRANT SELECT ON public.user_notification_preferences TO authenticated;
GRANT SELECT ON public.notification_templates TO authenticated;
GRANT SELECT ON public.notification_outbox TO authenticated;

COMMIT;
