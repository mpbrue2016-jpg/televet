import { ShieldCheck, Lock, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-500 mb-6 transition-colors">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar para a página inicial
        </Link>
        
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-slate-900 px-8 py-10 text-white flex items-center gap-4">
            <div className="bg-white/10 p-3 rounded-2xl">
              <ShieldCheck className="w-8 h-8 text-teal-400" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Política de Privacidade (LGPD)</h1>
              <p className="mt-1 text-slate-300">Última atualização: 08 de Outubro de 2026 (Versão 1.0.0)</p>
            </div>
          </div>
          
          <div className="px-8 py-10 prose prose-slate max-w-none text-slate-700">
            <p className="lead text-lg mb-6">
              A sua privacidade e a segurança dos dados clínicos do seu pet são nossa prioridade máxima. Esta Política de Privacidade foi elaborada em estrita conformidade com a <strong>Lei Geral de Proteção de Dados Pessoais (LGPD - Lei nº 13.709/2018)</strong> e explica como coletamos, autenticamos e protegemos suas informações.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal-600" />
              1. Coleta e Finalidade dos Dados
            </h3>
            <p>
              Coletamos informações essenciais (como CPF/CNPJ, E-mail, Telefone e registro profissional CRMV) com o objetivo exclusivo de <strong>autenticar a veracidade</strong> dos atores na plataforma (tutores e veterinários), garantindo o ambiente seguro exigido para o exercício da Telemedicina Veterinária.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li><strong>Dados Cadastrais:</strong> Usados para identificar você e manter a validade jurídica das receitas e autorizações de procedimento.</li>
              <li><strong>Dados Clínicos Sensíveis:</strong> Os prontuários e históricos do pet ficam visíveis apenas para você e os profissionais de saúde (PetShop, Clínica ou Veterinário Autônomo) com os quais você escolher se conectar.</li>
              <li><strong>Dados de Conexão:</strong> Endereço IP e User-Agent são retidos rigorosamente para trilha de auditoria e combate a fraudes.</li>
            </ul>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal-600" />
              2. Consentimento e Autenticação de Acesso
            </h3>
            <p>
              Para que seus dados sejam processados, exigimos o aceite livre e informado no momento de cadastro. Este aceite é autenticado e armazenado em nosso banco de dados. Qualquer alteração nos termos exigirá, sistemicamente, que o usuário revalide e autentique sua concordância no próximo login.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal-600" />
              3. Compartilhamento e Armazenamento (Cloud)
            </h3>
            <p>
              Nós **nunca vendemos** suas informações para anunciantes. Seus dados são armazenados na infraestrutura do Supabase com proteção avançada criptografada (Row Level Security). O compartilhamento só ocorre internamente entre o Médico e a Clínica a qual ele pertence, ou mediante demanda judicial expedida por autoridade competente.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mt-8 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-teal-600" />
              4. Direitos do Titular (Seus Direitos)
            </h3>
            <p>
              A LGPD lhe confere o direito a solicitar a qualquer momento:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-2">
              <li>Confirmação da existência de tratamento de dados;</li>
              <li>Acesso aos prontuários e logs vinculados ao seu CPF;</li>
              <li>Revogação do consentimento (o que pode impossibilitar os atendimentos via telemedicina em curso);</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários, desde que não conflitem com as resoluções do CFMV sobre armazenamento obrigatório de prontuários médicos.</li>
            </ul>

            <hr className="my-8 border-slate-200" />
            <p className="text-sm text-slate-500 font-medium">
              Caso possua dúvidas sobre esta política, o contato com o nosso DPO (Encarregado de Proteção de Dados) pode ser feito na seção &quot;Privacidade&quot; logado no Painel.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
