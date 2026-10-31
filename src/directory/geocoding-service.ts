// ==============================================================================
// src/directory/geocoding-service.ts
// Serviço de Geocodificação Configurável com Fallback Gracioso
// ==============================================================================

export interface GeocodingAddressInput {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city: string;
  stateUf: string;
  cep?: string | null;
}

export interface GeocodingResult {
  latitude: number | null;
  longitude: number | null;
  status: 'pending' | 'geocoded' | 'manual' | 'failed';
  provider: string;
  rawResponse?: any;
}

export class GeocodingService {
  private provider: string;
  private apiKey?: string;

  constructor(
    provider: string = process.env.GEOCODING_PROVIDER || 'nominatim',
    apiKey?: string
  ) {
    this.provider = provider;
    this.apiKey = apiKey || process.env.GEOCODING_API_KEY;
  }

  /**
   * Geocodifica um endereço brasileiro.
   * Se a chave não estiver configurada ou a requisição falhar/estiver offline,
   * marca graciosamente como 'pending' sem bloquear o cadastro do prestador.
   */
  async geocodeAddress(address: GeocodingAddressInput): Promise<GeocodingResult> {
    // Se o provedor exigir chave e não houver chave configurada, marca pendente
    if (this.provider !== 'nominatim' && !this.apiKey) {
      return {
        latitude: null,
        longitude: null,
        status: 'pending',
        provider: this.provider,
      };
    }

    try {
      const queryParts = [
        address.street ? `${address.street} ${address.number || ''}`.trim() : '',
        address.neighborhood || '',
        address.city,
        address.stateUf,
        address.cep || '',
        'Brasil',
      ].filter(Boolean);

      const query = queryParts.join(', ');

      // Usando Nominatim (OpenStreetMap) como provedor padrão gratuito e ético
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&countrycodes=br`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'TELEVET-Directory/1.0 (contato@televet.com.br)',
        },
        signal: AbortSignal.timeout(4000), // Timeout de 4 segundos
      });

      if (!response.ok) {
        return {
          latitude: null,
          longitude: null,
          status: 'pending',
          provider: this.provider,
        };
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
          status: 'geocoded',
          provider: this.provider,
          rawResponse: data[0],
        };
      }

      // Se a busca completa não encontrar, tenta busca por Cidade + UF
      const cityQuery = `${address.city}, ${address.stateUf}, Brasil`;
      const cityUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityQuery)}&limit=1&countrycodes=br`;
      
      const cityRes = await fetch(cityUrl, {
        headers: {
          'User-Agent': 'TELEVET-Directory/1.0 (contato@televet.com.br)',
        },
        signal: AbortSignal.timeout(3000),
      });

      if (cityRes.ok) {
        const cityData = await cityRes.json();
        if (Array.isArray(cityData) && cityData.length > 0) {
          return {
            latitude: parseFloat(cityData[0].lat),
            longitude: parseFloat(cityData[0].lon),
            status: 'geocoded',
            provider: `${this.provider}-city-level`,
          };
        }
      }

      return {
        latitude: null,
        longitude: null,
        status: 'pending',
        provider: this.provider,
      };
    } catch {
      // Qualquer falha de rede ou timeout mantém status pending de forma segura
      return {
        latitude: null,
        longitude: null,
        status: 'pending',
        provider: this.provider,
      };
    }
  }
}
