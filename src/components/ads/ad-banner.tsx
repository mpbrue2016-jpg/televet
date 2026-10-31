'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, Phone, MessageCircle, Info } from 'lucide-react';
import { AdService } from '@/ads/ad-service';
import { ServedAd } from '@/ads/types';
import { SponsoredBadge } from './sponsored-badge';

interface AdBannerProps {
  placement: string;
  uf?: string;
  cidade?: string;
  categoria?: string;
  format?: 'banner_horizontal' | 'card_destaque' | 'banner_quadrado';
  className?: string;
}

export function AdBanner({
  placement,
  uf,
  cidade,
  categoria,
  format = 'banner_horizontal',
  className = '',
}: AdBannerProps) {
  const [ad, setAd] = useState<ServedAd | null>(null);
  const [loading, setLoading] = useState(true);
  const bannerRef = useRef<HTMLDivElement>(null);
  const viewTrackedRef = useRef(false);

  const adService = new AdService();

  useEffect(() => {
    let isMounted = true;

    async function loadAd() {
      setLoading(true);
      try {
        const ads = await adService.serveAds({
          placement,
          uf,
          cidade,
          categoria,
          limit: 1,
        });

        if (isMounted) {
          if (ads.length > 0) {
            setAd(ads[0]);
          } else {
            // Mock de demonstração contextual para visualização
            setAd(getMockServedAd(placement, categoria));
          }
        }
      } catch (err) {
        if (isMounted) {
          setAd(getMockServedAd(placement, categoria));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadAd();
    return () => {
      isMounted = false;
    };
  }, [placement, uf, cidade, categoria]);

  // Rastreamento automático de visualização com IntersectionObserver
  useEffect(() => {
    if (!ad || viewTrackedRef.current || !bannerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !viewTrackedRef.current) {
            viewTrackedRef.current = true;
            adService.recordEvent(ad.campaignId, ad.creativeId, 'visualizacao', placement);
          }
        });
      },
      { threshold: 0.5 } // Pelo menos 50% visível na tela
    );

    observer.observe(bannerRef.current);
    return () => observer.disconnect();
  }, [ad, placement]);

  const handleActionClick = (eventType: 'clique' | 'ligacao' | 'whatsapp') => {
    if (ad) {
      adService.recordEvent(ad.campaignId, ad.creativeId, eventType, placement);
    }
  };

  if (loading) {
    return <div className={`h-24 rounded-2xl bg-slate-100 animate-pulse ${className}`} />;
  }

  if (!ad) return null;

  return (
    <div
      ref={bannerRef}
      data-testid="ad-banner-container"
      className={`relative overflow-hidden rounded-3xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition-all ${className}`}
    >
      {/* Selo PATROCINADO Imutável no Topo */}
      <div className="absolute top-3 right-3 z-20 flex items-center space-x-1.5">
        <SponsoredBadge label={ad.badgeLabel} />
      </div>

      {format === 'banner_horizontal' ? (
        <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-5 gap-4">
          <div className="flex items-center space-x-4">
            {ad.imageUrl && (
              <img
                src={ad.imageUrl}
                alt={ad.title}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 border border-slate-100"
              />
            )}
            <div className="space-y-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                {ad.advertiserName}
              </span>
              <h4 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                {ad.title}
              </h4>
              {ad.description && (
                <p className="text-xs text-slate-600 line-clamp-1 sm:line-clamp-2 max-w-xl">
                  {ad.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
            {ad.whatsapp && (
              <a
                href={`https://wa.me/55${ad.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleActionClick('whatsapp')}
                className="p-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl transition-colors border border-emerald-200"
                title="Contato via WhatsApp"
              >
                <MessageCircle className="w-4 h-4" />
              </a>
            )}

            {ad.phone && (
              <a
                href={`tel:${ad.phone.replace(/\D/g, '')}`}
                onClick={() => handleActionClick('ligacao')}
                className="p-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-xl transition-colors border border-blue-200"
                title="Ligar agora"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}

            <a
              href={ad.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleActionClick('clique')}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl transition-all shadow-sm"
            >
              <span>{ad.callToAction}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ) : (
        /* Formato Card Destaque ou Quadrado */
        <div className="p-5 space-y-3">
          {ad.imageUrl && (
            <div className="h-36 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100">
              <img src={ad.imageUrl} alt={ad.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {ad.advertiserName}
            </span>
            <h4 className="font-extrabold text-slate-900 text-base leading-tight">
              {ad.title}
            </h4>
            {ad.description && (
              <p className="text-xs text-slate-500 line-clamp-2">
                {ad.description}
              </p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between">
            <a
              href={ad.targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleActionClick('clique')}
              className="w-full text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl transition-colors shadow-sm"
            >
              {ad.callToAction}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function getMockServedAd(placement: string, category?: string): ServedAd {
  if (category === 'ambulancia') {
    return {
      adId: 'ad-mock-amb',
      campaignId: 'camp-amb-1',
      creativeId: 'creat-amb-1',
      advertiserName: 'Resgate Vet Brasil',
      title: 'Ambulância Veterinária com UTI Móvel 24 Horas',
      description: 'Atendimento de emergência e remoção rápida de pequenos animais com suporte avançado.',
      imageUrl: 'https://images.unsplash.com/photo-1583337130417-3346a1be7dee?auto=format&fit=crop&w=300&q=80',
      targetUrl: 'https://televet.com.br/diretorio',
      callToAction: 'Chamar Resgate',
      phone: '(11) 99888-0000',
      whatsapp: '11998880000',
      format: 'banner_horizontal',
      badgeLabel: 'PATROCINADO',
    };
  }

  return {
    adId: 'ad-mock-gen',
    campaignId: 'camp-gen-1',
    creativeId: 'creat-gen-1',
    advertiserName: 'LabVet Diagnósticos',
    title: 'Exames Laboratoriais e Citologia com Laudo em 24h',
    description: 'Bioquímica, hemograma completo e histopatologia com coleta em domicílio.',
    imageUrl: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=300&q=80',
    targetUrl: 'https://televet.com.br/diretorio',
    callToAction: 'Agendar Coleta',
    phone: '(11) 3214-0000',
    whatsapp: '11977770000',
    format: 'banner_horizontal',
    badgeLabel: 'PATROCINADO',
  };
}
