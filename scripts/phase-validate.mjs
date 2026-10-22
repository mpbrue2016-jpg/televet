#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';

function showHelp() {
  console.log(`
Uso: node scripts/phase-validate.mjs [--phase <numero>] [--dry-run] [--skip-e2e]

Valida o estado final da fase atual ou do projeto inteiro usando os checks reais do repositório.

Opções:
  --phase <numero>   Nomeia a validação como "Fase <numero>".
  --dry-run          Apenas imprime os comandos que seriam executados.
  --skip-e2e         Ignora o Playwright quando a fase não exige e2e completo.
  -h, --help         Exibe esta ajuda.
`);
}

const args = process.argv.slice(2);
const options = {
  phase: null,
  dryRun: false,
  skipE2E: false,
};

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '--help' || arg === '-h') {
    showHelp();
    process.exit(0);
  }

  if (arg === '--phase') {
    options.phase = args[index + 1] ?? null;
    index += 1;
    continue;
  }

  if (arg.startsWith('--phase=')) {
    options.phase = arg.split('=')[1] ?? null;
    continue;
  }

  if (arg === '--dry-run') {
    options.dryRun = true;
    continue;
  }

  if (arg === '--skip-e2e') {
    options.skipE2E = true;
    continue;
  }

  throw new Error(`Argumento desconhecido: ${arg}`);
}

const phaseLabel = options.phase ? `Fase ${options.phase}` : 'Validação final';

const steps = [
  {
    label: 'Reset do banco local',
    command: 'npx',
    args: ['supabase', 'db', 'reset'],
  },
  {
    label: 'Lint do banco',
    command: 'npx',
    args: ['supabase', 'db', 'lint'],
  },
  {
    label: 'Testes pgTAP do banco',
    command: 'npx',
    args: ['supabase', 'test', 'db'],
  },
  {
    label: 'TypeScript',
    command: 'npx',
    args: ['tsc', '--noEmit'],
  },
  {
    label: 'Lint do Next.js',
    command: 'npx',
    args: ['next', 'lint'],
  },
];

if (!options.skipE2E) {
  steps.push({
    label: 'Smoke tests Playwright',
    command: 'npx',
    args: ['playwright', 'test'],
  });
}

function runStep(step) {
  const formattedCommand = [step.command, ...step.args].join(' ');

  if (options.dryRun) {
    console.log(`\n[DRY RUN] ${step.label}`);
    console.log(`  ${formattedCommand}`);
    return 0;
  }

  console.log(`\n>> ${step.label}`);
  console.log(`   ${formattedCommand}`);

  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });

  if (result.error) {
    console.error(`\nErro ao iniciar "${step.label}": ${result.error.message}`);
    return 1;
  }

  if (result.status !== 0) {
    return result.status ?? 1;
  }

  return 0;
}

console.log(`\n=== ${phaseLabel} ===`);
let exitCode = 0;

for (const step of steps) {
  exitCode = runStep(step) || exitCode;
  if (exitCode !== 0) {
    console.error(`\nValidação interrompida em: ${step.label}`);
    process.exit(exitCode);
  }
}

console.log(`\n✅ ${phaseLabel} concluída com sucesso.`);
process.exit(0);
