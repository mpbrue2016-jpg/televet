import { Scale, FileText, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function TermosDeUsoPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500 mb-6 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para a página inicial
        </Link>
        
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-slate-900 px-8 py-10 text-white flex items-center gap-4">
            <div className="bg-white/10 p-3 rounded-2xl">
              <Scale className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Termos de Uso</h1>
              <p className="mt-1 text-slate-300">Última atualização: 08 de Outubro de 2026 (Versão 1.0.0)</p>
            </div>
          </div>
          
          <div className="px-8 py-10 prose prose-slate max-w-none text-slate-700">
            <p className="lead text-lg mb-6">
              Bem-vindo à plataforma TeleVet. Ao acessar, cadastrar-se ou utilizar nossos serviços de telemedicina veterinária, gestão de saúde pet ou integrações clínicas, você concorda expressamente em estar vinculado aos Termos de Uso abaixo descritos. Este é um contrato vinculante que autentica a veracidade do seu acesso.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              1. Natureza do Serviço e Veracidade das Informações
            </h3>
            <p>
              A Plataforma conecta tutores a médicos veterinários qualificados para orientações e consultas na modalidade de telemedicina (conforme normativas do CFMV). É sua responsabilidade civil e criminal fornecer dados exatos, precisos e autênticos no momento do cadastro. O acesso aos dados médicos e histórico de saúde é restrito e validado através das credenciais intransferíveis fornecidas, em conformidade estrita com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              2. Cadastro de Veterinários e Tutores
            </h3>
            <p>
              <strong>2.1 Para Veterinários:</strong> O acesso como Médico Veterinário requer a validação ativa do registro no CRMV do seu respectivo estado. O uso do serviço implica aceitação da responsabilidade clínica, de emissão de laudos autênticos e receituários sob as normas vigentes. O sistema fará validação anti-fraude periodicamente.
            </p>
            <p>
              <strong>2.2 Para Tutores:</strong> O Tutor declara ser maior de 18 (dezoito) anos, civilmente capaz e tutor legal ou possuir autorização expressa para tomar decisões de saúde sobre o(s) animal(is) cadastrado(s). A autenticação no sistema é sua assinatura digital para autorizar procedimentos.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              3. Teleconsulta e Prescrições
            </h3>
            <p>
              Em caso de teleconsultas, o Médico Veterinário determinará os limites de atuação à distância, podendo orientar o encaminhamento emergencial para uma clínica física. O usuário consente que o uso da câmera/microfone é obrigatório, e a Plataforma poderá reter logs de acesso (incluindo IP e metadados) para garantir a segurança cibernética do prontuário médico.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              4. Consentimento e Autenticação
            </h3>
            <p>
              Ao finalizar o seu cadastro clicando em &quot;Aceito&quot;, este ato gera um registro eletrônico auditável em nosso banco de dados contendo data, hora, endereço de IP e detalhes do dispositivo (User-Agent). Esta assinatura é válida para fins legais.
            </p>

            <hr className="my-8 border-slate-200" />
            <p className="text-sm text-slate-500">
              Para dirimir quaisquer controvérsias decorrentes destes Termos de Uso, as partes elegem o foro da Comarca sede da Plataforma.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
