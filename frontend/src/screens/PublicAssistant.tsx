import { useEffect, useState } from "react";
import { chatSite, publicSite, type PublicSite } from "../api";
import { SiteView } from "../components/site/SiteView";
import { translate } from "../i18n";
import { Spinner } from "../ui";

/**
 * A published site, as its visitors see it at /a/<slug>[/<page>]: its pages in
 * its theme, with the N-ATLAS assistant on every page. Nothing of Launchpad
 * around it.
 */
export default function PublicAssistant({ slug, page: firstPage }: { slug: string; page: string }) {
  const [site, setSite] = useState<PublicSite | null>(null);
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(firstPage);

  useEffect(() => {
    publicSite(slug)
      .then((s) => {
        setSite(s);
        document.documentElement.lang = s.language === "pid" ? "pcm" : s.language;
      })
      .catch(() => setMissing(true));
  }, [slug]);

  // Back/forward between the site's pages.
  useEffect(() => {
    const onPop = () => setPage(window.location.pathname.split("/").slice(3).filter(Boolean).join("/"));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!site) return;
    const post = page.startsWith("blog/") ? site.posts.find((x) => x.slug === page.slice(5)) : undefined;
    const p = site.pages.find((x) => x.slug === page) ?? site.pages[0];
    document.title = post ? `${post.title} · ${site.name}` : p.slug ? `${p.title} · ${site.name}` : site.name;
  }, [site, page]);

  if (missing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-ink">{translate("en", "There's no assistant at this address.")}</p>
          <p className="mt-1 text-sm text-slate-500">{translate("en", "It may have been taken offline by its owner.")}</p>
        </div>
      </div>
    );
  }
  if (!site) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Spinner className="h-5 w-5 text-forge-600" />
      </div>
    );
  }

  return (
    <SiteView
      site={site}
      page={page}
      onNavigate={(next) => {
        window.history.pushState(null, "", `/a/${slug}${next ? `/${next}` : ""}`);
        setPage(next);
        window.scrollTo(0, 0);
      }}
      chat={(history, sent) => chatSite(slug, history, sent)}
    />
  );
}
