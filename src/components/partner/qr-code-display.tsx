'use client';

import React, { useRef, useState } from 'react';
import { Download, Copy, ExternalLink, Printer, Check, QrCode } from 'lucide-react';

interface QRCodeDisplayProps {
  partnerName: string;
  slug: string;
  referralCode: string;
  baseUrl?: string;
}

export function QRCodeDisplay({
  partnerName,
  slug,
  referralCode,
  baseUrl = 'https://televet.com.br'
}: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const targetUrl = `${baseUrl}/petshop/${slug}?ref=${referralCode}&utm_source=balcao&utm_medium=qrcode`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(targetUrl)}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">QR Code de Balcão</h3>
            <p className="text-xs text-slate-500">Display físico para caixa ou balcão de atendimento</p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-full">
          Rastreamento Ativo
        </span>
      </div>

      {/* Cartão de Exibição / Impressão */}
      <div
        ref={printRef}
        className="bg-gradient-to-b from-slate-50 to-white border-2 border-dashed border-slate-200 rounded-xl p-6 text-center"
      >
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          TELEVET + {partnerName}
        </p>
        <h4 className="text-sm font-extrabold text-slate-800 mb-4">
          Aponte a câmera para consultar um veterinário agora
        </h4>

        <div className="inline-block p-3 bg-white rounded-xl shadow-sm border border-slate-100">
          <img
            src={qrImageUrl}
            alt={`QR Code ${partnerName}`}
            className="w-48 h-48 object-contain mx-auto"
            loading="lazy"
          />
        </div>

        <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-500">Código de Balcão:</span>
          <span className="px-2 py-0.5 bg-slate-100 text-blue-700 font-mono font-bold rounded border border-slate-200">
            {referralCode}
          </span>
        </div>
      </div>

      {/* Botões de Ação */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center justify-center space-x-2 py-2.5 px-3 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-slate-500" />
              <span>Copiar Link</span>
            </>
          )}
        </button>

        <button
          onClick={handlePrint}
          className="inline-flex items-center justify-center space-x-2 py-2.5 px-3 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:scale-95 transition-all shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Imprimir Display</span>
        </button>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>Validade da atribuição: 30 dias</span>
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center space-x-1 text-blue-600 hover:underline font-medium"
        >
          <span>Testar link</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
