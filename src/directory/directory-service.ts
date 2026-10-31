// ==============================================================================
// src/directory/directory-service.ts
// Serviço Completo do Diretório Nacional de Serviços de Saúde Animal (Fase 16)
// ==============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient, SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase-client';
import {
  DirectoryCategory,
  DirectorySearchParams,
  ServiceProviderItem,
  ServiceCategoryEntity,
  ProviderPhotoItem,
  ProviderRegionItem,
  ProviderReportItem,
  DirectoryQualityReport,
  DirectoryCsvRow,
  DirectoryCsvValidation,
  DIRECTORY_CATEGORIES_METADATA,
  EXCLUDED_CATEGORIES,
} from './types';
import { CnpjValidator } from './cnpj-validator';
import { GeocodingService } from './geocoding-service';

export class DirectoryService {
  private supabase: SupabaseClient;
  private geocodingService: GeocodingService;

  constructor(
    supabaseUrl: string = SUPABASE_URL,
    supabaseAnonKey: string = SUPABASE_ANON_KEY
  ) {
    this.supabase = (supabaseUrl === SUPABASE_URL && supabaseAnonKey === SUPABASE_ANON_KEY)
      ? getSupabaseClient()
      : createClient(supabaseUrl, supabaseAnonKey);
    this.geocodingService = new GeocodingService();
  }

  /**
   * Busca pública no Diretório Nacional com cálculo de distância (PostGIS / Haversine),
   * filtros por raio em km, categoria, 24 horas, "aberto agora", cidade, UF e CEP.
   * Regra estrita: O público visualiza exclusivamente estabelecimentos com status = 'aprovada'.
   */
  async search(params: DirectorySearchParams = {}): Promise<ServiceProviderItem[]> {
    const { data, error } = await this.supabase.rpc('search_service_providers', {
      p_categoria: params.categoria || null,
      p_uf: params.uf ? params.uf.toUpperCase() : null,
      p_cidade: params.cidade || null,
      p_bairro: params.bairro || null,
      p_cep: params.cep ? params.cep.replace(/\D/g, '') : null,
      p_lat: params.lat || null,
      p_lng: params.lng || null,
      p_radius_km: params.radiusKm || null,
      p_atende_24h: params.atende24h !== undefined ? params.atende24h : null,
      p_verificada: params.verificada !== undefined ? params.verificada : null,
      p_query: params.query || null,
      p_limit: params.limit || 30,
      p_offset: params.offset || 0,
    });

    if (error) {
      // Fallback gracioso se a procedure não existir no mock ou banco local
      console.warn('Falha na RPC search_service_providers:', error.message);
      return [];
    }

    let items: ServiceProviderItem[] = (data || []).map((row: any) => this.mapRowToItem(row));

    // Filtro adicional em memória para "Aberto Agora"
    if (params.abertoAgora) {
      items = items.filter(item => this.isOpenNow(item.horarioFuncionamento, item.atende24h));
    }

    return items;
  }

  /**
   * Obtém detalhes completos de um estabelecimento credenciado pelo ID.
   */
  async getProviderById(id: string): Promise<{
    provider: ServiceProviderItem;
    photos: ProviderPhotoItem[];
    regions: ProviderRegionItem[];
  } | null> {
    const { data: providerData, error: providerError } = await this.supabase
      .from('service_providers')
      .select('*')
      .eq('id', id)
      .single();

    if (providerError || !providerData) {
      return null;
    }

    const [photosRes, regionsRes] = await Promise.all([
      this.supabase.from('provider_photos').select('*').eq('provider_id', id).order('display_order', { ascending: true }),
      this.supabase.from('provider_regions').select('*').eq('provider_id', id),
    ]);

    const photos: ProviderPhotoItem[] = (photosRes.data || []).map((p: any) => ({
      id: p.id,
      providerId: p.provider_id,
      photoUrl: p.photo_url,
      caption: p.caption,
      isCover: Boolean(p.is_cover),
      displayOrder: p.display_order,
      createdAt: p.created_at,
    }));

    const regions: ProviderRegionItem[] = (regionsRes.data || []).map((r: any) => ({
      id: r.id,
      providerId: r.provider_id,
      cidade: r.cidade,
      uf: r.uf,
      raioAtendimentoKm: r.raio_atendimento_km ? Number(r.raio_atendimento_km) : undefined,
      createdAt: r.created_at,
    }));

    return {
      provider: this.mapRowToItem(providerData),
      photos,
      regions,
    };
  }

  /**
   * Consulta estabelecimentos pertencentes ao prestador autenticado (Isolamento entre prestadores).
   */
  async getProviderServices(ownerUserId: string): Promise<ServiceProviderItem[]> {
    const { data, error } = await this.supabase
      .from('service_providers')
      .select('*')
      .eq('owner_user_id', ownerUserId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Erro ao buscar serviços do prestador: ${error.message}`);
    }

    return (data || []).map((row: any) => this.mapRowToItem(row));
  }

  /**
   * Cadastra ou atualiza um prestador no Diretório Nacional.
   * Realiza validação estrita de CNPJ, bloqueio preventivo de categorias excluídas
   * e geocodificação resiliente com marcação de pendência se sem chave.
   */
  async saveService(service: {
    id?: string;
    ownerUserId?: string;
    razaoSocial: string;
    nomeFantasia?: string;
    cnpj?: string;
    categoria: DirectoryCategory;
    descricao?: string;
    telefone?: string;
    whatsapp?: string;
    email?: string;
    site?: string;
    endereco?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cep?: string;
    cidade: string;
    uf: string;
    latitude?: number;
    longitude?: number;
    horarioFuncionamento?: Record<string, string>;
    servicos?: string[];
    fotos?: string[];
    logotipo?: string;
    atende24h?: boolean;
    status?: 'rascunho' | 'em_analise';
    documentoComprobatorioUrl?: string;
  }): Promise<{ id: string; status: string }> {
    // 1. Validação estrita de categorias e termos proibidos
    this.assertValidCategory(service.categoria, service.razaoSocial, service.nomeFantasia);

    // 2. Validação oficial de CNPJ se fornecido
    if (service.cnpj) {
      const cleanCnpj = CnpjValidator.clean(service.cnpj);
      if (cleanCnpj.length > 0 && !CnpjValidator.isValid(cleanCnpj)) {
        throw new Error(`CNPJ Inválido: "${service.cnpj}" não atende ao cálculo dos dígitos verificadores da Receita Federal.`);
      }
    }

    // 3. Geocodificação automática caso coordenadas não tenham sido informadas manualmente
    let lat = service.latitude || null;
    let lng = service.longitude || null;
    let geocodingStatus: 'pending' | 'geocoded' | 'manual' | 'failed' = lat && lng ? 'manual' : 'pending';

    if (!lat || !lng) {
      try {
        const geoResult = await this.geocodingService.geocodeAddress({
          street: service.logradouro || service.endereco,
          number: service.numero,
          neighborhood: service.bairro,
          city: service.cidade,
          stateUf: service.uf,
          cep: service.cep,
        });
        if (geoResult.latitude && geoResult.longitude) {
          lat = geoResult.latitude;
          lng = geoResult.longitude;
          geocodingStatus = geoResult.status;
        } else {
          geocodingStatus = 'pending';
        }
      } catch {
        geocodingStatus = 'pending';
      }
    }

    const payload: any = {
      razao_social: service.razaoSocial,
      nome_fantasia: service.nomeFantasia || service.razaoSocial,
      cnpj: service.cnpj ? CnpjValidator.format(service.cnpj) : null,
      categoria: service.categoria,
      descricao: service.descricao || null,
      telefone: service.telefone || null,
      whatsapp: service.whatsapp || null,
      email: service.email || null,
      site: service.site || null,
      endereco: service.endereco || null,
      logradouro: service.logradouro || null,
      numero: service.numero || null,
      complemento: service.complemento || null,
      bairro: service.bairro || null,
      cep: service.cep || null,
      cidade: service.cidade,
      uf: service.uf.toUpperCase(),
      latitude: lat,
      longitude: lng,
      geocoding_status: geocodingStatus,
      horario_funcionamento: service.horarioFuncionamento || {
        segunda: '08:00 - 18:00',
        terca: '08:00 - 18:00',
        quarta: '08:00 - 18:00',
        quinta: '08:00 - 18:00',
        sexta: '08:00 - 18:00',
        sabado: '08:00 - 12:00',
        domingo: 'Fechado',
        feriados: 'Plantão ou Sob Consulta',
      },
      servicos: service.servicos || [],
      fotos: service.fotos || [],
      logotipo: service.logotipo || null,
      atende_24h: Boolean(service.atende24h),
      status: service.status || 'em_analise',
      documento_comprobatorio_url: service.documentoComprobatorioUrl || null,
      updated_at: new Date().toISOString(),
    };

    if (service.ownerUserId) {
      payload.owner_user_id = service.ownerUserId;
    }

    if (service.id) {
      const { data, error } = await this.supabase
        .from('service_providers')
        .update(payload)
        .eq('id', service.id)
        .select('id, status')
        .single();

      if (error) throw new Error(`Erro ao atualizar estabelecimento: ${error.message}`);
      return { id: data.id, status: data.status };
    } else {
      const { data, error } = await this.supabase
        .from('service_providers')
        .insert(payload)
        .select('id, status')
        .single();

      if (error) throw new Error(`Erro ao cadastrar estabelecimento: ${error.message}`);
      return { id: data.id, status: data.status };
    }
  }

  /**
   * Moderação Administrativa de Serviços (Aprovar, Suspender, Verificar, Rejeitar).
   * Restrito exclusivamente ao Administrador Master.
   */
  async reviewService(
    providerId: string,
    action: 'aprovar' | 'suspender' | 'rejeitar' | 'verificar' | 'desverificar',
    notes?: string
  ): Promise<{ success: boolean; action: string }> {
    const { data, error } = await this.supabase.rpc('admin_review_service_provider', {
      p_provider_id: providerId,
      p_action: action,
      p_notes: notes || null,
    });

    if (error) {
      throw new Error(`Falha na moderação do diretório: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      action: data?.action,
    };
  }

  /**
   * Registra clique de evento (Ligar, WhatsApp, Como chegar, Site) de forma agregada
   * e anônima sem coletar dados pessoais (LGPD).
   */
  async recordClick(
    providerId: string,
    eventType: 'ligar' | 'whatsapp' | 'como_chegar' | 'site' | 'perfil'
  ): Promise<void> {
    try {
      await this.supabase.rpc('record_provider_click', {
        p_provider_id: providerId,
        p_event_type: eventType,
      });
    } catch (err: any) {
      console.warn(`Falha ao registrar métrica de clique: ${err?.message}`);
    }
  }

  /**
   * Envia denúncia de informação incorreta de um estabelecimento (telefone inválido, endereço errado, etc.).
   */
  async reportIssue(
    providerId: string,
    reportType: 'telefone_invalido' | 'endereco_incorreto' | 'fechado_permanentemente' | 'categoria_inadequada' | 'outro',
    details: string,
    contact?: string
  ): Promise<{ success: boolean; reportId: string }> {
    const { data, error } = await this.supabase.rpc('report_provider_issue', {
      p_provider_id: providerId,
      p_report_type: reportType,
      p_details: details,
      p_contact: contact || null,
    });

    if (error) {
      throw new Error(`Falha ao registrar denúncia: ${error.message}`);
    }

    return {
      success: Boolean(data?.success),
      reportId: data?.report_id,
    };
  }

  /**
   * Relatório Administrativo de Qualidade de Dados (Telefones/endereços ausentes ou inválidos, denúncias).
   */
  async getDataQualityReport(): Promise<DirectoryQualityReport> {
    const { data, error } = await this.supabase.rpc('admin_get_data_quality_report');

    if (error) {
      throw new Error(`Erro ao gerar relatório de qualidade de dados: ${error.message}`);
    }

    return {
      missingPhonesCount: Number(data?.missing_phones_count || 0),
      missingCoordsCount: Number(data?.missing_coords_count || 0),
      pendingGeocodingCount: Number(data?.pending_geocoding_count || 0),
      openReportsCount: Number(data?.open_reports_count || 0),
      sampleAnomalies: data?.sample_anomalies || [],
    };
  }

  /**
   * Lista todas as categorias de serviços gerenciadas no banco.
   */
  async getCategories(): Promise<ServiceCategoryEntity[]> {
    const { data, error } = await this.supabase
      .from('service_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      throw new Error(`Erro ao listar categorias: ${error.message}`);
    }

    return (data || []).map((c: any) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      displayOrder: c.display_order,
      isActive: Boolean(c.is_active),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));
  }

  /**
   * Salva ou cria uma categoria de serviço pelo Admin, com barreira contra categorias proibidas.
   */
  async saveCategory(category: {
    id?: string;
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    displayOrder?: number;
    isActive?: boolean;
  }): Promise<{ id: string }> {
    const lower = `${category.slug} ${category.name} ${category.description || ''}`.toLowerCase();
    for (const term of EXCLUDED_CATEGORIES) {
      const cleanTerm = term.replace('_', ' ');
      if (lower.includes(cleanTerm)) {
        throw new Error(`CATEGORIA PROIBIDA: Não é permitido cadastrar "${cleanTerm}" no Diretório Nacional.`);
      }
    }

    const payload: any = {
      slug: category.slug,
      name: category.name,
      description: category.description || null,
      icon: category.icon || 'heart-pulse',
      display_order: category.displayOrder || 0,
      is_active: category.isActive !== undefined ? category.isActive : true,
      updated_at: new Date().toISOString(),
    };

    if (category.id) {
      const { data, error } = await this.supabase
        .from('service_categories')
        .update(payload)
        .eq('id', category.id)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao atualizar categoria: ${error.message}`);
      return { id: data.id };
    } else {
      const { data, error } = await this.supabase
        .from('service_categories')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw new Error(`Erro ao criar categoria: ${error.message}`);
      return { id: data.id };
    }
  }

  /**
   * Valida linha a linha um arquivo CSV de importação em lote de prestadores.
   */
  validateCsvImport(csvContent: string): DirectoryCsvValidation[] {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    const separator = lines[0].includes(';') ? ';' : ',';
    const header = lines[0].split(separator).map(h => h.trim().toLowerCase().replace(/["\s_]/g, ''));
    
    // Mapeamento de índices do cabeçalho
    const getIndex = (names: string[]): number => {
      for (const name of names) {
        const idx = header.indexOf(name);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const idxRazao = getIndex(['razaosocial', 'razao', 'nome', 'empresa']);
    const idxFantasia = getIndex(['nomefantasia', 'fantasia']);
    const idxCnpj = getIndex(['cnpj', 'documento']);
    const idxCategoria = getIndex(['categoria', 'category', 'tipo']);
    const idxTelefone = getIndex(['telefone', 'fone', 'tel']);
    const idxWhatsapp = getIndex(['whatsapp', 'whats']);
    const idxEmail = getIndex(['email', 'mail']);
    const idxSite = getIndex(['site', 'website']);
    const idxCep = getIndex(['cep']);
    const idxCidade = getIndex(['cidade', 'municipio', 'city']);
    const idxUf = getIndex(['uf', 'estado', 'state']);
    const idx24h = getIndex(['24h', 'atende24h', 'is24h']);

    const results: DirectoryCsvValidation[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map(col => col.replace(/^["']|["']$/g, '').trim());
      if (cols.length === 0 || cols.every(c => c === '')) continue;

      const razaoSocial = idxRazao !== -1 ? cols[idxRazao] || '' : cols[0] || '';
      const nomeFantasia = idxFantasia !== -1 ? cols[idxFantasia] || razaoSocial : razaoSocial;
      const cnpj = idxCnpj !== -1 ? cols[idxCnpj] || '' : '';
      const categoria = idxCategoria !== -1 ? cols[idxCategoria] || '' : '';
      const telefone = idxTelefone !== -1 ? cols[idxTelefone] || '' : '';
      const whatsapp = idxWhatsapp !== -1 ? cols[idxWhatsapp] || '' : '';
      const email = idxEmail !== -1 ? cols[idxEmail] || '' : '';
      const site = idxSite !== -1 ? cols[idxSite] || '' : '';
      const cep = idxCep !== -1 ? cols[idxCep] || '' : '';
      const cidade = idxCidade !== -1 ? cols[idxCidade] || '' : '';
      const uf = idxUf !== -1 ? cols[idxUf] || '' : '';
      const atende24h = idx24h !== -1 ? ['true', '1', 'sim', 's', 'yes'].includes((cols[idx24h] || '').toLowerCase()) : false;

      const errors: string[] = [];
      const warnings: string[] = [];

      // Validação de campos obrigatórios
      if (!razaoSocial) errors.push('Razão Social obrigatória.');
      if (!cidade) errors.push('Cidade obrigatória.');
      if (!uf || uf.length !== 2) errors.push('UF inválida (deve conter exatamente 2 letras).');

      // Validação de categoria permitida
      const validSlugs = Object.keys(DIRECTORY_CATEGORIES_METADATA);
      const normalizedCat = categoria.toLowerCase().replace(/[\s-]/g, '_');
      if (!normalizedCat || !validSlugs.includes(normalizedCat)) {
        errors.push(`Categoria "${categoria}" inválida. Permitidas: ${validSlugs.join(', ')}.`);
      }

      // Validação de termos proibidos (clínicas, hospitais, pet shops, etc.)
      const combined = `${razaoSocial} ${nomeFantasia} ${categoria}`.toLowerCase();
      for (const term of EXCLUDED_CATEGORIES) {
        const cleanTerm = term.replace('_', ' ');
        if (combined.includes(cleanTerm)) {
          errors.push(`Termo proibido detectado: "${cleanTerm}". Clínicas, hospitais e pet shops não são permitidos neste diretório.`);
        }
      }

      // Validação de CNPJ se informado
      if (cnpj) {
        const cleanCnpj = CnpjValidator.clean(cnpj);
        if (cleanCnpj.length > 0 && !CnpjValidator.isValid(cleanCnpj)) {
          errors.push(`CNPJ "${cnpj}" matematicamente inválido.`);
        }
      } else {
        warnings.push('CNPJ não informado (recomendado para verificação).');
      }

      if (!telefone && !whatsapp) {
        warnings.push('Sem telefone nem WhatsApp para contato direto.');
      }

      results.push({
        rowIndex: i,
        data: {
          razaoSocial,
          nomeFantasia,
          cnpj,
          categoria: normalizedCat,
          telefone,
          whatsapp,
          email,
          site,
          cep,
          cidade,
          uf: uf.toUpperCase(),
          atende24h,
        },
        isValid: errors.length === 0,
        errors,
        warnings,
      });
    }

    return results;
  }

  /**
   * Importa lote validado de prestadores criando registros no banco com status 'em_analise'.
   */
  async importCsvBatch(validRows: DirectoryCsvRow[]): Promise<{ importedCount: number; errorsCount: number }> {
    let importedCount = 0;
    let errorsCount = 0;

    for (const row of validRows) {
      try {
        await this.saveService({
          razaoSocial: row.razaoSocial,
          nomeFantasia: row.nomeFantasia,
          cnpj: row.cnpj,
          categoria: row.categoria as DirectoryCategory,
          telefone: row.telefone,
          whatsapp: row.whatsapp,
          email: row.email,
          site: row.site,
          cep: row.cep,
          cidade: row.cidade,
          uf: row.uf,
          atende24h: row.atende24h,
          status: 'em_analise',
        });
        importedCount++;
      } catch (err) {
        console.warn(`Erro ao importar linha CSV (${row.razaoSocial}):`, err);
        errorsCount++;
      }
    }

    return { importedCount, errorsCount };
  }

  /**
   * Gera URL de navegação (Google Maps)
   */
  generateRouteUrl(service: {
    logradouro?: string | null;
    numero?: string | null;
    bairro?: string | null;
    cidade: string;
    uf: string;
    latitude?: number | null;
    longitude?: number | null;
  }): string {
    if (service.latitude && service.longitude) {
      return `https://www.google.com/maps/dir/?api=1&destination=${service.latitude},${service.longitude}`;
    }
    const destination = encodeURIComponent(
      `${service.logradouro || ''} ${service.numero || ''}, ${service.bairro || ''}, ${service.cidade} - ${service.uf}`.replace(/\s+/g, ' ').trim()
    );
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  }

  /**
   * Gera URL do WhatsApp com mensagem contextual
   */
  generateWhatsAppUrl(phone: string, serviceName: string): string {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Olá! Encontrei o estabelecimento "${serviceName}" no Diretório TELEVET e gostaria de solicitar informações.`
    );
    return `https://wa.me/55${cleanPhone}?text=${message}`;
  }

  /**
   * Verifica se o estabelecimento está aberto no momento atual com base no horário de funcionamento.
   */
  private isOpenNow(horario?: Record<string, string>, is24h?: boolean): boolean {
    if (is24h) return true;
    if (!horario) return false;

    const days = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
    const now = new Date();
    const currentDay = days[now.getDay()];
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    const schedule = horario[currentDay];
    if (!schedule || schedule.toLowerCase().includes('fechado')) return false;

    // Formato esperado: "08:00 - 18:00"
    const match = schedule.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
    if (!match) return false;

    const startMinutes = parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    const endMinutes = parseInt(match[3], 10) * 60 + parseInt(match[4], 10);

    return currentTotalMinutes >= startMinutes && currentTotalMinutes <= endMinutes;
  }

  /**
   * Garante a rejeição preventiva de termos e estabelecimentos de natureza excluída.
   */
  private assertValidCategory(category: string, razao: string, fantasia?: string): void {
    const combined = `${razao} ${fantasia || ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    for (const term of EXCLUDED_CATEGORIES) {
      const cleanTerm = term.replace(/_/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (combined.includes(cleanTerm) && category !== 'outros_servicos') {
        throw new Error(
          `CATEGORIA EXCLUÍDA: Estabelecimentos com natureza de "${cleanTerm}" não são permitidos neste Diretório Nacional. Clínicas, hospitais e pet shops utilizam seus módulos dedicados, e especialistas permanecem no catálogo veterinário.`
        );
      }
    }
  }

  private mapRowToItem(row: any): ServiceProviderItem {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      razaoSocial: row.razao_social,
      nomeFantasia: row.nome_fantasia || row.razao_social,
      cnpj: row.cnpj,
      categoryId: row.category_id,
      categoria: row.categoria,
      descricao: row.descricao,
      telefone: row.telefone,
      whatsapp: row.whatsapp,
      email: row.email,
      site: row.site,
      endereco: row.endereco,
      logradouro: row.logradouro,
      numero: row.numero,
      complemento: row.complemento,
      bairro: row.bairro,
      cep: row.cep,
      cidade: row.cidade,
      uf: row.uf,
      latitude: row.latitude ? Number(row.latitude) : null,
      longitude: row.longitude ? Number(row.longitude) : null,
      geocodingStatus: row.geocoding_status,
      horarioFuncionamento: row.horario_funcionamento,
      servicos: row.servicos || [],
      fotos: row.fotos || [],
      logotipo: row.logotipo,
      status: row.status,
      verificada: Boolean(row.verificada),
      atende24h: Boolean(row.atende_24h),
      documentoComprobatorioUrl: row.documento_comprobatorio_url,
      clicksCount: Number(row.clicks_count || 0),
      distanceKm: row.distance_km !== null && row.distance_km !== undefined ? Number(row.distance_km) : null,
      createdAt: row.created_at || '',
      updatedAt: row.updated_at || '',
    };
  }
}
