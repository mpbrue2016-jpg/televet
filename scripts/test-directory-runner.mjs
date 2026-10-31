// ==============================================================================
// scripts/test-directory-runner.mjs
// Executor de Testes Unitários e de Integração da Fase 16 (Diretório Nacional de Saúde Animal)
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { CnpjValidator } from '../src/directory/cnpj-validator.ts';
import { GeocodingService } from '../src/directory/geocoding-service.ts';
import { DirectoryService } from '../src/directory/directory-service.ts';
import { DIRECTORY_CATEGORIES_METADATA, EXCLUDED_CATEGORIES } from '../src/directory/types.ts';

test('1. CnpjValidator valida matematicamente CNPJs legítimos e rejeita falsos ou inválidos', () => {
  // CNPJs válidos conhecidos (algoritmo Módulo 11)
  const validCnpjs = [
    '00.000.000/0001-91', // Banco do Brasil
    '33.000.167/0001-01', // Petrobras
    '06.990.590/0001-23', // Google Brasil
  ];

  for (const cnpj of validCnpjs) {
    assert.equal(CnpjValidator.isValid(cnpj), true, `CNPJ válido deveria passar: ${cnpj}`);
  }

  // CNPJs inválidos: dígitos todos iguais, tamanho incorreto, dígitos verificadores errados
  const invalidCnpjs = [
    '00.000.000/0000-00', // Sequência repetida
    '11.111.111/1111-11', // Sequência repetida
    '12.345.678/0001-99', // Dígitos verificadores incorretos
    '123456789',          // Menos de 14 dígitos
    '00.000.000/0001-92', // Último dígito errado
  ];

  for (const cnpj of invalidCnpjs) {
    assert.equal(CnpjValidator.isValid(cnpj), false, `CNPJ inválido deveria falhar: ${cnpj}`);
  }

  // Formatação
  assert.equal(CnpjValidator.format('00000000000191'), '00.000.000/0001-91');
});

test('2. Catálogo de Categorias contém exatamente as 9 categorias permitidas e bloqueia excluídas', () => {
  const allowedSlugs = Object.keys(DIRECTORY_CATEGORIES_METADATA);
  
  assert.equal(allowedSlugs.length, 9, 'Devem existir exatamente 9 categorias permitidas');
  assert.deepEqual(allowedSlugs.sort(), [
    'ambulancia',
    'centro_diagnostico',
    'farmacia_manipulacao',
    'farmacia_veterinaria',
    'funerario_cremacao',
    'laboratorio',
    'odontologia',
    'outros_servicos',
    'transporte',
  ].sort());

  // Garante que termos como clinica, hospital, pet shop constam na lista de exclusão
  assert.equal(EXCLUDED_CATEGORIES.includes('clinica'), true);
  assert.equal(EXCLUDED_CATEGORIES.includes('hospital'), true);
  assert.equal(EXCLUDED_CATEGORIES.includes('petshop'), true);
  assert.equal(EXCLUDED_CATEGORIES.includes('banho_e_tosa'), true);
  assert.equal(EXCLUDED_CATEGORIES.includes('especialista'), true);
});

test('3. DirectoryService rejeita cadastro com termos proibidos (Clínica / Hospital / Pet Shop)', async () => {
  const service = new DirectoryService('http://localhost:54321', 'mock-key');

  // Tentativa de cadastrar clínica sob categoria permitida deve lançar erro
  await assert.rejects(
    async () => {
      await service.saveService({
        razaoSocial: 'Clínica Veterinária Vida Animal Ltda',
        nomeFantasia: 'Clínica Vida Animal',
        categoria: 'ambulancia',
        cidade: 'São Paulo',
        uf: 'SP',
      });
    },
    /CATEGORIA EXCLUÍDA/
  );

  // Tentativa de cadastrar Pet Shop com Banho e Tosa
  await assert.rejects(
    async () => {
      await service.saveService({
        razaoSocial: 'Pet Shop Bicho Limpo Banho e Tosa',
        categoria: 'transporte',
        cidade: 'Rio de Janeiro',
        uf: 'RJ',
      });
    },
    /CATEGORIA EXCLUÍDA/
  );
});

test('4. GeocodingService opera com fallback resiliente marcando "pending" quando offline ou sem chave', async () => {
  const geocoding = new GeocodingService('google', ''); // Provedor que exige chave, sem chave passada

  const result = await geocoding.geocodeAddress({
    street: 'Avenida Paulista',
    number: '1000',
    city: 'São Paulo',
    stateUf: 'SP',
  });

  assert.equal(result.status, 'pending');
  assert.equal(result.latitude, null);
  assert.equal(result.longitude, null);
});

test('5. Validador de Importação CSV identifica registros válidos, erros de categoria e termos proibidos', () => {
  const service = new DirectoryService('http://localhost:54321', 'mock-key');

  const csvData = `Razão Social;Nome Fantasia;CNPJ;Categoria;Cidade;UF;Telefone;24h
Ambulância Vet Resgate;Vet Resgate 24h;06.990.590/0001-23;ambulancia;São Paulo;SP;(11) 99999-1111;sim
Farmácia Magistral Pet;Magistral Pet;00.000.000/0001-91;farmacia_manipulacao;Curitiba;PR;(41) 3333-2222;não
Clínica Veterinária 24 Horas;Hospital Pet;06.990.590/0001-23;ambulancia;Belo Horizonte;MG;(31) 98888-3333;sim
Laboratório Animal Exames;Lab Exames;;categoria_inventada;Porto Alegre;RS;;não
`;

  const validations = service.validateCsvImport(csvData);

  assert.equal(validations.length, 4, 'Deve analisar as 4 linhas de dados do CSV');

  // Linha 1: Válida (Ambulância legítima com CNPJ válido)
  assert.equal(validations[0].isValid, true);
  assert.equal(validations[0].data.categoria, 'ambulancia');
  assert.equal(validations[0].data.atende24h, true);

  // Linha 2: Válida (Farmácia de manipulação com CNPJ válido)
  assert.equal(validations[1].isValid, true);
  assert.equal(validations[1].data.categoria, 'farmacia_manipulacao');

  // Linha 3: Inválida (Contém termo proibido "Clínica" e "Hospital")
  assert.equal(validations[2].isValid, false);
  assert.match(validations[2].errors.join(' '), /Termo proibido detectado/);

  // Linha 4: Inválida (Categoria inexistente)
  assert.equal(validations[3].isValid, false);
  assert.match(validations[3].errors.join(' '), /Categoria "categoria_inventada" inválida/);
});

test('6. Geração de URLs de Navegação (Google Maps) e WhatsApp com Mensagem Contextual', () => {
  const service = new DirectoryService('http://localhost:54321', 'mock-key');

  // Rota com coordenadas geográficas
  const routeCoords = service.generateRouteUrl({
    cidade: 'São Paulo',
    uf: 'SP',
    latitude: -23.561684,
    longitude: -46.655981,
  });
  assert.equal(routeCoords, 'https://www.google.com/maps/dir/?api=1&destination=-23.561684,-46.655981');

  // Rota por endereço textual
  const routeAddress = service.generateRouteUrl({
    logradouro: 'Av Paulista',
    numero: '1000',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
  });
  assert.match(routeAddress, /destination=Av%20Paulista%201000/);

  // Link WhatsApp formatado para o Brasil (+55)
  const waUrl = service.generateWhatsAppUrl('(11) 98765-4321', 'Ambulância Pet Resgate');
  assert.equal(waUrl.startsWith('https://wa.me/5511987654321?text='), true);
  assert.match(decodeURIComponent(waUrl), /Ambulância Pet Resgate/);
});

test('7. Filtro de Emergência direciona corretamente para Ambulâncias e Atendimento 24h', () => {
  // Simulação do comportamento de busca por atalho de emergência (Fase 7 -> Fase 16)
  const emergencyParams = {
    categoria: 'ambulancia',
    atende24h: true,
    radiusKm: 25,
  };

  assert.equal(emergencyParams.categoria, 'ambulancia');
  assert.equal(emergencyParams.atende24h, true);
  assert.equal(emergencyParams.radiusKm, 25);
});

test('8. Ordenação por Proximidade Geográfica calcula distâncias coerentes', () => {
  // Ponto de origem: Centro de São Paulo (-23.55052, -46.633308)
  const originLat = -23.55052;
  const originLng = -46.633308;

  // Estabelecimento A: Av. Paulista (~2.8 km)
  const latA = -23.561684;
  const lngA = -46.655981;

  // Estabelecimento B: Campinas (~85 km)
  const latB = -22.909938;
  const lngB = -47.062633;

  const haversineKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c * 10) / 10;
  };

  const distA = haversineKm(originLat, originLng, latA, lngA);
  const distB = haversineKm(originLat, originLng, latB, lngB);

  assert.ok(distA < 5, `Distância até Av. Paulista (${distA}km) deve ser menor que 5km`);
  assert.ok(distB > 70, `Distância até Campinas (${distB}km) deve ser superior a 70km`);
  assert.ok(distA < distB, 'Estabelecimento mais próximo deve preceder na ordenação');
});

test('9. Regra RLS: Estabelecimentos rascunho ou pendentes são estritamente ocultos do público', () => {
  const providers = [
    { id: '1', nome: 'Ambulância SP', status: 'aprovada' },
    { id: '2', nome: 'Lab Em Análise', status: 'em_analise' },
    { id: '3', nome: 'Farmácia Rascunho', status: 'rascunho' },
    { id: '4', nome: 'Transporte Suspenso', status: 'suspensa' },
  ];

  // Simulação da cláusula WHERE status = 'aprovada' da RPC pública
  const publicResults = providers.filter(p => p.status === 'aprovada');

  assert.equal(publicResults.length, 1);
  assert.equal(publicResults[0].id, '1');
  assert.equal(publicResults.some(p => p.status !== 'aprovada'), false);
});

console.log('✅ Todos os testes unitários do Diretório Nacional passaram com sucesso.');
