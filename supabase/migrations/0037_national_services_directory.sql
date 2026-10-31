-- ==============================================================================
-- 0037_national_services_directory.sql
-- FASE 16: Diretório Nacional de Serviços de Saúde e Atendimento Animal
-- Categorias Permitidas, Bloqueio Estrito de Excluídas, PostGIS, Moderação,
-- Qualidade de Dados, Denúncias e RLS
-- ==============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extensões Essenciais (PostGIS para distância geodésica, unaccent e pg_trgm)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ---------------------------------------------------------------------------
-- 2. Tabela: service_categories (Categorias Permitidas - Editável pelo Admin)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    icon VARCHAR(64) NOT NULL DEFAULT 'heart-pulse',
    display_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trava de segurança: impede que qualquer administrador cadastre categorias proibidas
-- (Clínicas, Hospitais, Pet Shops, Banho e Tosa e Especialistas continuam estritamente excluídos)
CREATE OR REPLACE FUNCTION public.fn_prevent_forbidden_categories_insert()
RETURNS TRIGGER AS $$
DECLARE
    v_forbidden_terms TEXT[] := ARRAY[
        'clinica', 'clínica', 'hospital', 'pet shop', 'petshop', 'banho e tosa', 'banho & tosa', 'estetica', 'especialista'
    ];
    v_term TEXT;
    v_target TEXT;
BEGIN
    v_target := lower(NEW.slug || ' ' || NEW.name || ' ' || COALESCE(NEW.description, ''));
    FOREACH v_term IN ARRAY v_forbidden_terms LOOP
        IF v_target LIKE '%' || v_term || '%' THEN
            RAISE EXCEPTION 'A categoria "%" é proibida no Diretório Nacional. Clínicas, hospitais, pet shops e especialistas utilizam seus próprios módulos dedicados.', v_term
                USING ERRCODE = '22023';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_service_categories_terms
BEFORE INSERT OR UPDATE ON public.service_categories
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_forbidden_categories_insert();

-- Inserção inicial das 9 Categorias Permitidas pelo Escopo da Fase 16
INSERT INTO public.service_categories (slug, name, description, icon, display_order)
VALUES
    ('ambulancia', 'Ambulâncias Veterinárias', 'Resgate, emergência móvel e remoção veterinária 24 horas.', 'siren', 1),
    ('farmacia_veterinaria', 'Farmácias Veterinárias', 'Medicamentos veterinários, antibióticos e produtos terapêuticos.', 'pill', 2),
    ('farmacia_manipulacao', 'Farmácias de Manipulação', 'Fórmulas magistrais sob medida, pastas palatáveis e xaropes.', 'flask-conical', 3),
    ('laboratorio', 'Laboratórios Veterinários', 'Exames laboratoriais, hemogramas, histopatologia e bioquímica.', 'microscope', 4),
    ('centro_diagnostico', 'Centros de Diagnóstico', 'Diagnóstico por imagem, raio-X digital, ultrassonografia e tomografia.', 'scan', 5),
    ('transporte', 'Transporte de Animais', 'Táxi dog, vans adaptadas e transporte interestadual com segurança.', 'truck', 6),
    ('funerario_cremacao', 'Serviços Funerários e Cremação', 'Cremação pet individual, cerimonial de despedida e urnas memoriais.', 'flower', 7),
    ('odontologia', 'Odontologia Veterinária', 'Profilaxia periodontal, tratamento de canal e cirurgias orais.', 'sparkles', 8),
    ('outros_servicos', 'Outros Serviços de Saúde Animal', 'Bancos de sangue pet, próteses e suporte técnico em saúde animal.', 'heart-pulse', 9)
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    display_order = EXCLUDED.display_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 3. Tabela: service_providers (Prestadores Credenciados)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(18),
    category_id UUID REFERENCES public.service_categories(id) ON DELETE RESTRICT,
    categoria VARCHAR(64) NOT NULL,
    descricao TEXT,
    
    -- Contato
    telefone VARCHAR(32),
    whatsapp VARCHAR(32),
    email VARCHAR(255),
    site TEXT,
    
    -- Localização
    endereco TEXT,
    logradouro VARCHAR(255),
    numero VARCHAR(32),
    complemento VARCHAR(128),
    bairro VARCHAR(128),
    cep VARCHAR(9),
    cidade VARCHAR(128) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    location geography(Point, 4326),
    geocoding_status VARCHAR(32) NOT NULL DEFAULT 'pending'
        CHECK (geocoding_status IN ('pending', 'geocoded', 'manual', 'failed')),
    geocoding_provider VARCHAR(64) DEFAULT 'nominatim',

    -- Operação e Serviços
    horario_funcionamento JSONB NOT NULL DEFAULT '{
        "segunda": "08:00 - 18:00",
        "terca": "08:00 - 18:00",
        "quarta": "08:00 - 18:00",
        "quinta": "08:00 - 18:00",
        "sexta": "08:00 - 18:00",
        "sabado": "08:00 - 12:00",
        "domingo": "Fechado",
        "feriados": "Plantão ou Sob Consulta"
    }'::jsonb,
    servicos TEXT[] DEFAULT ARRAY[]::TEXT[],
    fotos TEXT[] DEFAULT ARRAY[]::TEXT[],
    logotipo TEXT,
    
    -- Moderação e Status
    status VARCHAR(32) NOT NULL DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'em_analise', 'aprovada', 'suspensa')),
    verificada BOOLEAN NOT NULL DEFAULT false,
    atende_24h BOOLEAN NOT NULL DEFAULT false,
    documento_comprobatorio_url TEXT,
    
    -- Métricas e Auditoria
    clicks_count INT NOT NULL DEFAULT 0,
    verified_at TIMESTAMPTZ,
    verified_by_user_id UUID REFERENCES public.users(id),
    verification_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger de updated_at
CREATE OR REPLACE TRIGGER trg_service_providers_updated_at
BEFORE UPDATE ON public.service_providers
FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();

-- Trigger para sincronização do ponto geográfico PostGIS a partir de lat/lng
CREATE OR REPLACE FUNCTION public.fn_sync_provider_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    ELSE
        NEW.location := NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_service_providers_sync_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.service_providers
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_provider_location();

-- Trava de Segurança: Bloqueio Estrito de Categorias e Termos Excluídos nos Prestadores
CREATE OR REPLACE FUNCTION public.fn_prevent_excluded_provider_terms()
RETURNS TRIGGER AS $$
DECLARE
    v_forbidden_terms TEXT[] := ARRAY[
        'clinica', 'clínica', 'hospital', 'pet shop', 'petshop', 'banho e tosa', 'banho & tosa', 'estetica animal'
    ];
    v_term TEXT;
    v_razao_lower TEXT;
    v_fantasia_lower TEXT;
BEGIN
    v_razao_lower := lower(NEW.razao_social);
    v_fantasia_lower := lower(COALESCE(NEW.nome_fantasia, ''));

    IF NOT public.is_admin() THEN
        FOREACH v_term IN ARRAY v_forbidden_terms LOOP
            IF (v_razao_lower LIKE '%' || v_term || '%' OR v_fantasia_lower LIKE '%' || v_term || '%') 
               AND NEW.categoria <> 'outros_servicos' THEN
                RAISE EXCEPTION 'O estabelecimento possui características de "%", categoria excluída deste Diretório Nacional. Clínicas, hospitais e pet shops utilizam seus módulos dedicados.', v_term
                    USING ERRCODE = '22023';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_validate_provider_forbidden_terms
BEFORE INSERT OR UPDATE ON public.service_providers
FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_excluded_provider_terms();

-- Índices de Alta Eficiência (GIST para PostGIS, B-tree para status e UF/cidade)
CREATE INDEX IF NOT EXISTS idx_service_providers_location ON public.service_providers USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_service_providers_status_verificada ON public.service_providers(status, verificada);
CREATE INDEX IF NOT EXISTS idx_service_providers_categoria ON public.service_providers(categoria);
CREATE INDEX IF NOT EXISTS idx_service_providers_cidade_uf ON public.service_providers(uf, cidade);
CREATE INDEX IF NOT EXISTS idx_service_providers_owner ON public.service_providers(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_service_providers_cnpj ON public.service_providers(cnpj);

-- ---------------------------------------------------------------------------
-- 4. Tabela: provider_photos (Galeria de Fotos do Estabelecimento)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    caption VARCHAR(255),
    is_cover BOOLEAN NOT NULL DEFAULT false,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_photos_provider ON public.provider_photos(provider_id);

-- ---------------------------------------------------------------------------
-- 5. Tabela: provider_regions (Áreas de Atendimento por Cidade/UF para Transporte/Ambulâncias)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    cidade VARCHAR(128) NOT NULL,
    uf VARCHAR(2) NOT NULL,
    raio_atendimento_km NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_regions_location ON public.provider_regions(uf, cidade);
CREATE INDEX IF NOT EXISTS idx_provider_regions_provider ON public.provider_regions(provider_id);

-- ---------------------------------------------------------------------------
-- 6. Tabela: provider_reports (Denúncias de Informação Incorreta / Qualidade de Dados)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    reporter_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    report_type VARCHAR(64) NOT NULL CHECK (report_type IN (
        'telefone_invalido', 'endereco_incorreto', 'fechado_permanentemente', 'categoria_inadequada', 'outro'
    )),
    details TEXT NOT NULL,
    reporter_contact VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'resolvido', 'descartado')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_provider_reports_status ON public.provider_reports(status);
CREATE INDEX IF NOT EXISTS idx_provider_reports_provider ON public.provider_reports(provider_id);

-- ---------------------------------------------------------------------------
-- 7. Tabela: provider_click_events (Cliques em Ações: Ligar, WhatsApp, Rota, Site)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.provider_click_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('ligar', 'whatsapp', 'como_chegar', 'site', 'perfil')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_provider_clicks_provider_date ON public.provider_click_events(provider_id, event_date);

-- ---------------------------------------------------------------------------
-- 8. Funções RPC: Busca Geográfica PostGIS, Moderação, Qualidade e Métricas
-- ---------------------------------------------------------------------------

-- 8.1 Busca Pública no Diretório com PostGIS (Distância Real em km, Raio e Filtros)
CREATE OR REPLACE FUNCTION public.search_service_providers(
    p_categoria VARCHAR(64) DEFAULT NULL,
    p_uf VARCHAR(2) DEFAULT NULL,
    p_cidade VARCHAR(128) DEFAULT NULL,
    p_bairro VARCHAR(128) DEFAULT NULL,
    p_cep VARCHAR(9) DEFAULT NULL,
    p_lat NUMERIC(10, 7) DEFAULT NULL,
    p_lng NUMERIC(10, 7) DEFAULT NULL,
    p_radius_km NUMERIC DEFAULT NULL,
    p_atende_24h BOOLEAN DEFAULT NULL,
    p_verificada BOOLEAN DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 30,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    razao_social VARCHAR(255),
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(18),
    categoria VARCHAR(64),
    descricao TEXT,
    telefone VARCHAR(32),
    whatsapp VARCHAR(32),
    email VARCHAR(255),
    site TEXT,
    endereco TEXT,
    logradouro VARCHAR(255),
    numero VARCHAR(32),
    complemento VARCHAR(128),
    bairro VARCHAR(128),
    cep VARCHAR(9),
    cidade VARCHAR(128),
    uf VARCHAR(2),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    horario_funcionamento JSONB,
    servicos TEXT[],
    fotos TEXT[],
    logotipo TEXT,
    status VARCHAR(32),
    verificada BOOLEAN,
    atende_24h BOOLEAN,
    clicks_count INT,
    distance_km NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ref_geo public.geography;
BEGIN
    IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        v_ref_geo := public.ST_SetSRID(public.ST_MakePoint(p_lng, p_lat), 4326)::public.geography;
    ELSE
        v_ref_geo := NULL;
    END IF;

    RETURN QUERY
    SELECT 
        sp.id,
        sp.razao_social,
        sp.nome_fantasia,
        sp.cnpj,
        sp.categoria,
        sp.descricao,
        sp.telefone,
        sp.whatsapp,
        sp.email,
        sp.site,
        sp.endereco,
        sp.logradouro,
        sp.numero,
        sp.complemento,
        sp.bairro,
        sp.cep,
        sp.cidade,
        sp.uf,
        sp.latitude,
        sp.longitude,
        sp.horario_funcionamento,
        sp.servicos,
        sp.fotos,
        sp.logotipo,
        sp.status,
        sp.verificada,
        sp.atende_24h,
        sp.clicks_count,
        CASE 
            WHEN v_ref_geo IS NOT NULL AND sp.location IS NOT NULL THEN
                ROUND((public.ST_Distance(sp.location, v_ref_geo) / 1000.0)::numeric, 1)
            WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL AND sp.latitude IS NOT NULL AND sp.longitude IS NOT NULL THEN
                ROUND(
                    (6371 * acos(
                        least(1.0, greatest(-1.0,
                            cos(radians(p_lat)) * cos(radians(sp.latitude)) *
                            cos(radians(sp.longitude) - radians(p_lng)) +
                            sin(radians(p_lat)) * sin(radians(sp.latitude))
                        ))
                    ))::numeric, 1
                )
            ELSE NULL
        END AS distance_km
    FROM public.service_providers sp
    WHERE sp.status = 'aprovada' -- PÚBLICO SÓ VISUALIZA ESTABELECIMENTOS APROVADOS!
      AND (p_categoria IS NULL OR sp.categoria = p_categoria)
      AND (p_uf IS NULL OR sp.uf = upper(p_uf))
      AND (p_cidade IS NULL OR lower(sp.cidade) = lower(p_cidade))
      AND (p_bairro IS NULL OR lower(COALESCE(sp.bairro, '')) = lower(p_bairro))
      AND (p_cep IS NULL OR sp.cep LIKE p_cep || '%')
      AND (p_atende_24h IS NULL OR sp.atende_24h = p_atende_24h)
      AND (p_verificada IS NULL OR sp.verificada = p_verificada)
      AND (
          p_query IS NULL OR 
          sp.nome_fantasia ILIKE '%' || p_query || '%' OR 
          sp.razao_social ILIKE '%' || p_query || '%' OR
          COALESCE(sp.descricao, '') ILIKE '%' || p_query || '%'
      )
      AND (
          v_ref_geo IS NULL OR p_radius_km IS NULL OR sp.location IS NULL OR
          public.ST_DWithin(sp.location, v_ref_geo, p_radius_km * 1000)
      )
    ORDER BY 
        sp.verificada DESC,
        distance_km ASC NULLS LAST,
        sp.nome_fantasia ASC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- 8.2 Registro de Evento de Clique e Métricas (Ligar, WhatsApp, Rota, Site)
CREATE OR REPLACE FUNCTION public.record_provider_click(
    p_provider_id UUID,
    p_event_type VARCHAR(32)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Incremento atômico no contador geral do prestador
    UPDATE public.service_providers
    SET clicks_count = clicks_count + 1
    WHERE id = p_provider_id;

    -- Registro do evento para métricas
    INSERT INTO public.provider_click_events (provider_id, event_type, created_at, event_date)
    VALUES (p_provider_id, p_event_type, NOW(), CURRENT_DATE);
END;
$$;

-- 8.3 Moderação Administrativa de Prestadores (Aprovar / Suspender / Verificar)
CREATE OR REPLACE FUNCTION public.admin_review_service_provider(
    p_provider_id UUID,
    p_action VARCHAR(32), -- 'aprovar', 'suspender', 'rejeitar', 'verificar', 'desverificar'
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_admin_id UUID;
    v_new_status VARCHAR(32);
    v_new_verificada BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas o Administrador Master pode moderar serviços do diretório.'
            USING ERRCODE = '42501';
    END IF;

    v_admin_id := auth.uid();

    IF p_action = 'aprovar' THEN
        v_new_status := 'aprovada';
        UPDATE public.service_providers
        SET status = 'aprovada',
            verified_at = NOW(),
            verified_by_user_id = v_admin_id,
            verification_notes = p_notes,
            updated_at = NOW()
        WHERE id = p_provider_id;

    ELSIF p_action = 'suspender' THEN
        v_new_status := 'suspensa';
        UPDATE public.service_providers
        SET status = 'suspensa',
            verification_notes = p_notes,
            updated_at = NOW()
        WHERE id = p_provider_id;

    ELSIF p_action = 'rejeitar' THEN
        v_new_status := 'rascunho';
        UPDATE public.service_providers
        SET status = 'rascunho',
            verification_notes = p_notes,
            updated_at = NOW()
        WHERE id = p_provider_id;

    ELSIF p_action = 'verificar' THEN
        UPDATE public.service_providers
        SET verificada = TRUE,
            verified_at = NOW(),
            verified_by_user_id = v_admin_id,
            verification_notes = COALESCE(p_notes, verification_notes),
            updated_at = NOW()
        WHERE id = p_provider_id;
        v_new_verificada := TRUE;

    ELSIF p_action = 'desverificar' THEN
        UPDATE public.service_providers
        SET verificada = FALSE,
            updated_at = NOW()
        WHERE id = p_provider_id;
        v_new_verificada := FALSE;

    ELSE
        RAISE EXCEPTION 'Ação de moderação inválida: %', p_action USING ERRCODE = '22023';
    END IF;

    -- Auditoria
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity,
        entity_id,
        new_data
    ) VALUES (
        v_admin_id,
        'ADMIN_REVIEW_SERVICE_PROVIDER',
        'service_providers',
        p_provider_id::text,
        jsonb_build_object('action', p_action, 'notes', p_notes)
    );

    RETURN jsonb_build_object(
        'success', true,
        'provider_id', p_provider_id,
        'action', p_action
    );
END;
$$;

-- 8.4 Envio de Denúncia de Informação Incorreta pelo Usuário
CREATE OR REPLACE FUNCTION public.report_provider_issue(
    p_provider_id UUID,
    p_report_type VARCHAR(64),
    p_details TEXT,
    p_contact VARCHAR(255) DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_report_id UUID;
BEGIN
    INSERT INTO public.provider_reports (
        provider_id,
        reporter_user_id,
        report_type,
        details,
        reporter_contact,
        status,
        created_at
    ) VALUES (
        p_provider_id,
        auth.uid(),
        p_report_type,
        p_details,
        p_contact,
        'pendente',
        NOW()
    ) RETURNING id INTO v_report_id;

    RETURN jsonb_build_object(
        'success', true,
        'report_id', v_report_id
    );
END;
$$;

-- 8.5 Relatório Administrativo de Qualidade de Dados (Telefone/Endereço Inválidos)
CREATE OR REPLACE FUNCTION public.admin_get_data_quality_report()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_missing_phones INT;
    v_missing_coords INT;
    v_open_reports INT;
    v_pending_geocoding INT;
    v_anomalies JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Acesso negado: restrito ao Administrador Master.' USING ERRCODE = '42501';
    END IF;

    -- Prestadores sem telefone ou com telefone excessivamente curto
    SELECT count(*) INTO v_missing_phones
    FROM public.service_providers
    WHERE status = 'aprovada' AND (telefone IS NULL OR length(regexp_replace(telefone, '\D', '', 'g')) < 10);

    -- Prestadores sem coordenadas / sem geocodificação
    SELECT count(*) INTO v_missing_coords
    FROM public.service_providers
    WHERE status = 'aprovada' AND (location IS NULL OR latitude IS NULL);

    -- Geocodificação pendente
    SELECT count(*) INTO v_pending_geocoding
    FROM public.service_providers
    WHERE geocoding_status = 'pending';

    -- Denúncias pendentes
    SELECT count(*) INTO v_open_reports
    FROM public.provider_reports
    WHERE status IN ('pendente', 'em_analise');

    -- Amostra de anomalias detectadas
    SELECT coalesce(jsonb_agg(sub), '[]'::jsonb) INTO v_anomalies
    FROM (
        SELECT 
            sp.id,
            sp.nome_fantasia,
            sp.razao_social,
            sp.cidade,
            sp.uf,
            sp.telefone,
            sp.cep,
            sp.geocoding_status,
            CASE 
                WHEN sp.telefone IS NULL OR length(regexp_replace(sp.telefone, '\D', '', 'g')) < 10 THEN 'Telefone ausente ou inválido'
                WHEN sp.latitude IS NULL THEN 'Endereço sem coordenadas geográficas'
                WHEN sp.cep IS NULL OR length(regexp_replace(sp.cep, '\D', '', 'g')) <> 8 THEN 'CEP com formato irregular'
                ELSE 'Outra inconsistência'
            END AS issue_description
        FROM public.service_providers sp
        WHERE sp.status = 'aprovada'
          AND (
            sp.telefone IS NULL 
            OR length(regexp_replace(sp.telefone, '\D', '', 'g')) < 10
            OR sp.latitude IS NULL
            OR sp.cep IS NULL
            OR length(regexp_replace(sp.cep, '\D', '', 'g')) <> 8
          )
        LIMIT 25
    ) sub;

    RETURN jsonb_build_object(
        'missing_phones_count', v_missing_phones,
        'missing_coords_count', v_missing_coords,
        'pending_geocoding_count', v_pending_geocoding,
        'open_reports_count', v_open_reports,
        'sample_anomalies', v_anomalies
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Políticas de Segurança (Row Level Security - RLS)
-- ---------------------------------------------------------------------------
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_click_events ENABLE ROW LEVEL SECURITY;

-- 9.1 Categorias: Leitura pública, gravação apenas para admin
CREATE POLICY policy_categories_public_read ON public.service_categories
FOR SELECT USING (is_active = TRUE OR public.is_admin());

CREATE POLICY policy_categories_admin_all ON public.service_categories
FOR ALL USING (public.is_admin());

-- 9.2 Prestadores: Leitura pública apenas para aprovados; dono gerencia o seu; admin modera
CREATE POLICY policy_providers_public_select ON public.service_providers
FOR SELECT USING (
    status = 'aprovada' OR
    public.is_admin() OR
    (owner_user_id = auth.uid())
);

CREATE POLICY policy_providers_owner_insert ON public.service_providers
FOR INSERT WITH CHECK (
    owner_user_id = auth.uid() OR public.is_admin()
);

CREATE POLICY policy_providers_owner_update ON public.service_providers
FOR UPDATE USING (
    owner_user_id = auth.uid() OR public.is_admin()
) WITH CHECK (
    -- Dono comum não pode se auto-aprovar nem alterar o status para aprovada
    (owner_user_id = auth.uid() AND status IN ('rascunho', 'em_analise')) OR
    public.is_admin()
);

CREATE POLICY policy_providers_owner_delete ON public.service_providers
FOR DELETE USING (
    owner_user_id = auth.uid() OR public.is_admin()
);

-- 9.3 Fotos e Regiões: Aprovados visíveis ao público; dono edita
CREATE POLICY policy_photos_select ON public.provider_photos
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_photos.provider_id AND (sp.status = 'aprovada' OR sp.owner_user_id = auth.uid() OR public.is_admin()))
);

CREATE POLICY policy_photos_owner_manage ON public.provider_photos
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_photos.provider_id AND (sp.owner_user_id = auth.uid() OR public.is_admin()))
);

CREATE POLICY policy_regions_select ON public.provider_regions
FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_regions.provider_id AND (sp.status = 'aprovada' OR sp.owner_user_id = auth.uid() OR public.is_admin()))
);

CREATE POLICY policy_regions_owner_manage ON public.provider_regions
FOR ALL USING (
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_regions.provider_id AND (sp.owner_user_id = auth.uid() OR public.is_admin()))
);

-- 9.4 Denúncias: Qualquer pessoa pode inserir; leitura e resolução pelo admin
CREATE POLICY policy_reports_insert ON public.provider_reports
FOR INSERT WITH CHECK (true);

CREATE POLICY policy_reports_admin_all ON public.provider_reports
FOR ALL USING (public.is_admin());

-- 9.5 Eventos de Clique: Inserção livre; leitura apenas admin e dono do prestador
CREATE POLICY policy_clicks_insert ON public.provider_click_events
FOR INSERT WITH CHECK (true);

CREATE POLICY policy_clicks_read ON public.provider_click_events
FOR SELECT USING (
    public.is_admin() OR
    EXISTS (SELECT 1 FROM public.service_providers sp WHERE sp.id = provider_click_events.provider_id AND sp.owner_user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- 10. Compatibilidade Retroativa (Wrapper search_directory_services)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_directory_services(
    p_category VARCHAR(64) DEFAULT NULL,
    p_state_uf VARCHAR(2) DEFAULT NULL,
    p_city VARCHAR(128) DEFAULT NULL,
    p_lat NUMERIC(10, 7) DEFAULT NULL,
    p_lng NUMERIC(10, 7) DEFAULT NULL,
    p_radius_km NUMERIC DEFAULT NULL,
    p_is_24h BOOLEAN DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    trade_name VARCHAR(255),
    category VARCHAR(64),
    subcategory VARCHAR(128),
    description TEXT,
    is_partner BOOLEAN,
    partner_badge VARCHAR(64),
    cep VARCHAR(9),
    street VARCHAR(255),
    number VARCHAR(32),
    neighborhood VARCHAR(128),
    city VARCHAR(128),
    state_uf VARCHAR(2),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    phone VARCHAR(32),
    whatsapp VARCHAR(32),
    website_url TEXT,
    instagram_url TEXT,
    opening_hours JSONB,
    is_24h BOOLEAN,
    emergency_service BOOLEAN,
    home_service BOOLEAN,
    distance_km NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        sp.id,
        sp.razao_social AS name,
        sp.nome_fantasia AS trade_name,
        sp.categoria AS category,
        NULL::VARCHAR(128) AS subcategory,
        sp.descricao AS description,
        sp.verificada AS is_partner,
        CASE WHEN sp.verificada THEN 'Verificada' ELSE NULL END AS partner_badge,
        sp.cep,
        sp.logradouro AS street,
        sp.numero AS number,
        sp.bairro AS neighborhood,
        sp.cidade AS city,
        sp.uf AS state_uf,
        sp.latitude,
        sp.longitude,
        sp.telefone AS phone,
        sp.whatsapp,
        sp.site AS website_url,
        NULL::TEXT AS instagram_url,
        sp.horario_funcionamento AS opening_hours,
        sp.atende_24h AS is_24h,
        (sp.categoria = 'ambulancia' OR sp.atende_24h) AS emergency_service,
        false AS home_service,
        res.distance_km
    FROM public.search_service_providers(
        p_categoria := p_category,
        p_uf := p_state_uf,
        p_cidade := p_city,
        p_bairro := NULL,
        p_cep := NULL,
        p_lat := p_lat,
        p_lng := p_lng,
        p_radius_km := p_radius_km,
        p_atende_24h := p_is_24h,
        p_verificada := NULL,
        p_query := p_query,
        p_limit := p_limit,
        p_offset := p_offset
    ) res
    JOIN public.service_providers sp ON sp.id = res.id;
END;
$$;

COMMIT;
