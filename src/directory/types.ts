// ==============================================================================
// src/directory/types.ts
// Tipos e Interfaces da Fase 16: Diretório Nacional de Serviços de Saúde Animal
// ==============================================================================

export type DirectoryCategory =
  | 'ambulancia'
  | 'farmacia_veterinaria'
  | 'farmacia_manipulacao'
  | 'laboratorio'
  | 'centro_diagnostico'
  | 'transporte'
  | 'funerario_cremacao'
  | 'odontologia'
  | 'outros_servicos';

export interface CategoryMetadata {
  slug: DirectoryCategory;
  label: string;
  description: string;
  icon: string;
}

export const DIRECTORY_CATEGORIES_METADATA: Record<DirectoryCategory, { label: string; description: string; icon: string }> = {
  ambulancia: {
    label: 'Ambulâncias Veterinárias',
    description: 'Resgate, emergência móvel e remoção veterinária 24 horas.',
    icon: 'siren',
  },
  farmacia_veterinaria: {
    label: 'Farmácias Veterinárias',
    description: 'Medicamentos veterinários, antibióticos e produtos terapêuticos.',
    icon: 'pill',
  },
  farmacia_manipulacao: {
    label: 'Farmácias de Manipulação',
    description: 'Fórmulas magistrais sob medida, pastas palatáveis e xaropes.',
    icon: 'flask-conical',
  },
  laboratorio: {
    label: 'Laboratórios Veterinários',
    description: 'Exames laboratoriais, hemogramas, histopatologia e bioquímica.',
    icon: 'microscope',
  },
  centro_diagnostico: {
    label: 'Centros de Diagnóstico',
    description: 'Diagnóstico por imagem, raio-X digital, ultrassonografia e tomografia.',
    icon: 'scan',
  },
  transporte: {
    label: 'Transporte de Animais',
    description: 'Táxi dog, vans adaptadas e transporte interestadual com segurança.',
    icon: 'truck',
  },
  funerario_cremacao: {
    label: 'Serviços Funerários e Cremação',
    description: 'Cremação pet individual, cerimonial de despedida e urnas memoriais.',
    icon: 'flower',
  },
  odontologia: {
    label: 'Odontologia Veterinária',
    description: 'Profilaxia periodontal, tratamento de canal e cirurgias orais.',
    icon: 'sparkles',
  },
  outros_servicos: {
    label: 'Outros Serviços de Saúde Animal',
    description: 'Bancos de sangue pet, próteses e suporte técnico em saúde animal.',
    icon: 'heart-pulse',
  },
};

/**
 * Categorias expressamente excluídas deste diretório.
 * Clínicas, hospitais, pet shops, banho e tosa e especialistas utilizam módulos dedicados.
 */
export const EXCLUDED_CATEGORIES = [
  'clinica',
  'clinicas',
  'hospital',
  'hospitais',
  'petshop',
  'pet_shop',
  'petshops',
  'banho_tosa',
  'banho_e_tosa',
  'estetica',
  'estetica_animal',
  'especialista',
  'especialistas',
] as const;

export type ProviderStatus = 'rascunho' | 'em_analise' | 'aprovada' | 'suspensa';

export interface ServiceProviderItem {
  id: string;
  ownerUserId?: string | null;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string | null;
  categoryId?: string | null;
  categoria: DirectoryCategory;
  descricao?: string | null;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  site?: string | null;
  endereco?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade: string;
  uf: string;
  latitude?: number | null;
  longitude?: number | null;
  geocodingStatus?: 'pending' | 'geocoded' | 'manual' | 'failed';
  horarioFuncionamento?: Record<string, string>;
  servicos?: string[];
  fotos?: string[];
  logotipo?: string | null;
  status: ProviderStatus;
  verificada: boolean;
  atende24h: boolean;
  documentoComprobatorioUrl?: string | null;
  clicksCount: number;
  distanceKm?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Compatibilidade de interface para componentes já existentes
export type DirectoryServiceItem = ServiceProviderItem;

export interface DirectorySearchParams {
  categoria?: DirectoryCategory;
  uf?: string;
  cidade?: string;
  bairro?: string;
  cep?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  atende24h?: boolean;
  abertoAgora?: boolean;
  verificada?: boolean;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface ServiceCategoryEntity {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderPhotoItem {
  id: string;
  providerId: string;
  photoUrl: string;
  caption?: string;
  isCover: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface ProviderRegionItem {
  id: string;
  providerId: string;
  cidade: string;
  uf: string;
  raioAtendimentoKm?: number;
  createdAt: string;
}

export interface ProviderReportItem {
  id: string;
  providerId: string;
  reporterUserId?: string | null;
  reportType: 'telefone_invalido' | 'endereco_incorreto' | 'fechado_permanentemente' | 'categoria_inadequada' | 'outro';
  details: string;
  reporterContact?: string;
  status: 'pendente' | 'em_analise' | 'resolvido' | 'descartado';
  adminNotes?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface DirectoryQualityAnomaly {
  id: string;
  nome_fantasia: string;
  razao_social: string;
  cidade: string;
  uf: string;
  telefone?: string;
  cep?: string;
  geocoding_status: string;
  issue_description: string;
}

export interface DirectoryQualityReport {
  missingPhonesCount: number;
  missingCoordsCount: number;
  pendingGeocodingCount: number;
  openReportsCount: number;
  sampleAnomalies: DirectoryQualityAnomaly[];
}

export interface DirectoryCsvRow {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj?: string;
  categoria: string;
  telefone?: string;
  whatsapp?: string;
  email?: string;
  site?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  atende24h?: boolean;
  servicos?: string;
}

export interface DirectoryCsvValidation {
  rowIndex: number;
  data: DirectoryCsvRow;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
