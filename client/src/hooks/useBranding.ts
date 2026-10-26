import { useQuery } from "@tanstack/react-query";

interface Branding {
  companyName: string;
  companyLogoUrl: string | null;
  slug?: string | null;
}

export function useBranding(slug?: string | null) {
  return useQuery<Branding>({
    queryKey: slug ? ["/api/public/branding", slug] : ["/api/public/branding"],
    queryFn: async () => {
      if (slug) {
        const res = await fetch(`/api/public/branding/${slug}`);
        if (!res.ok) {
          const fallback = await fetch("/api/public/branding");
          if (!fallback.ok) return { companyName: "Suporte RedeG7", companyLogoUrl: null };
          return fallback.json();
        }
        return res.json();
      }
      const res = await fetch("/api/public/branding");
      if (!res.ok) return { companyName: "Suporte RedeG7", companyLogoUrl: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
