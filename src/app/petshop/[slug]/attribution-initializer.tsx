'use client';

import { useEffect } from 'react';

export function AttributionInitializer({
  referralCode,
  slug,
  petshopId,
}: {
  referralCode: string;
  slug: string;
  petshopId?: string;
}) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      // 1. Grava no LocalStorage
      localStorage.setItem('televet_partner_ref', referralCode);
      localStorage.setItem('televet_partner_slug', slug);
      if (petshopId) {
        localStorage.setItem('televet_partner_id', petshopId);
      }

      // 2. Grava nos Cookies (30 dias / 2.592.000 segundos)
      const maxAge = 30 * 24 * 60 * 60;
      document.cookie = `televet_partner_ref=${encodeURIComponent(referralCode)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      document.cookie = `televet_partner_slug=${encodeURIComponent(slug)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      if (petshopId) {
        document.cookie = `televet_partner_id=${encodeURIComponent(petshopId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
      }
    } catch {
      // ignora se cookies ou localStorage estiverem desativados
    }
  }, [referralCode, slug, petshopId]);

  return null;
}
