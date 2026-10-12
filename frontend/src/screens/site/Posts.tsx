import { useState } from "react";
import { previewSite, viewOf, writeSitePost, type Post } from "../../api";
import { useT } from "../../i18n";
import { Badge, Button, Card, Spinner } from "../../ui";
import { ArrowRightIcon, SparklesIcon } from "../../ui/icons";
import { SiteFrame } from "../../components/site/SiteFrame";
import { SiteView } from "../../components/site/SiteView";
import { input } from "../../components/site/editors";
import { publishable, useSite } from "../../components/site/useSite";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Posts — WordPress's Posts: news, tips and offers, listed on the site by a "Latest posts" section. */
export default function SitePosts() {
  const t = useT();
  const s = useSite();
  const [editing, setEditing] = useState<string | null>(null);
  const [idea, setIdea] = useState("");
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = s.config;
  const posts = c?.posts ?? [];
  const post = posts.find((p) => p.id === editing);
  const hasBlogSection = !!c?.pages.some((p) => p.sections.some((x) => x.type === "posts"));

  const setPosts = (f: (ps: Post[]) => Post[]) => s.setConfig((cfg) => ({ ...cfg, posts: f(cfg.posts ?? []) }));
  const setPost = (id: string, patch: Partial<Post>) => setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const newPost = (title: string, body: string) => {
    const id = Math.random().toString(36).slice(2, 10);
    setPosts((ps) => [{ id, title, slug: slugify(title) || id, date: new Date().toISOString(), body, status: "draft" }, ...ps]);
    setEditing(id);
  };

  async function write() {
    if (!c || !idea.trim()) return;
    setWriting(true);
    setError(null);
    try {
      const r = await writeSitePost(publishable(c), idea.trim());
      newPost(r.title, r.body);
      setIdea("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWriting(false);
    }
  }

  if (post && c) {
    // Preview as if published, so the post's own page shows.
    const view = viewOf({ ...c, posts: posts.map((p) => (p.id === post.id ? { ...p, status: "published" as const } : p)) });
    return (
      <SiteFrame
        wide
        title={t("Edit post")}
        actions={
          <Button variant="secondary" onClick={() => setEditing(null)}>
            ← {t("All posts")}
          </Button>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="space-y-3 p-5">
            <label className="block text-xs font-medium text-slate-600">
              {t("Title")}
              <input value={post.title} maxLength={160} onChange={(e) => setPost(post.id, { title: e.target.value })} className={`${input} mt-1 text-base font-semibold`} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-slate-600">
                {t("Status")}
                <select value={post.status} onChange={(e) => setPost(post.id, { status: e.target.value as Post["status"] })} className={`${input} mt-1`}>
                  <option value="draft">{t("Draft")}</option>
                  <option value="published">{t("Published")}</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                {t("Date")}
                <input type="date" value={post.date.slice(0, 10)} onChange={(e) => e.target.value && setPost(post.id, { date: new Date(e.target.value).toISOString() })} className={`${input} mt-1`} />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                {t("Author")}
                <input value={post.author ?? ""} maxLength={60} onChange={(e) => setPost(post.id, { author: e.target.value })} className={`${input} mt-1`} />
              </label>
            </div>
            <label className="block text-xs font-medium text-slate-600">
              {t("Address")}
              <div className="mt-1 flex items-center gap-1">
                <span className="font-mono text-xs text-slate-400">/blog/</span>
                <input value={post.slug} maxLength={60} onChange={(e) => setPost(post.id, { slug: slugify(e.target.value) })} className={`${input} font-mono`} />
              </div>
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("Cover picture (link)")}
              <input value={post.cover ?? ""} onChange={(e) => setPost(post.id, { cover: e.target.value || undefined })} className={`${input} mt-1`} placeholder="https://…" />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              {t("Text (leave a blank line between paragraphs)")}
              <textarea value={post.body} rows={14} maxLength={20000} onChange={(e) => setPost(post.id, { body: e.target.value })} className={`${input} mt-1 leading-relaxed`} />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={() => window.confirm(t("Delete the post “{title}”?", { title: post.title })) && (setPosts((ps) => ps.filter((p) => p.id !== post.id)), setEditing(null))}
                className="text-sm text-red-600 hover:underline"
              >
                {t("Delete")}
              </button>
              {post.status === "draft" && (
                <Button onClick={() => setPost(post.id, { status: "published" })}>{t("Mark as published")}</Button>
              )}
            </div>
            {post.status === "published" && !hasBlogSection && <BlogPageHint onAdd={() => addBlogPage(s.setConfig)} />}
          </Card>
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{t("Live preview")}</h2>
            <div className="h-[40rem] overflow-y-auto rounded-xl border border-slate-200 shadow-card">
              <SiteView site={view} page={`blog/${post.slug}`} onNavigate={() => {}} chat={(h, sent) => previewSite(publishable(c), h, sent)} contained showBlanks />
            </div>
          </div>
        </div>
      </SiteFrame>
    );
  }

  return (
    <SiteFrame
      title={t("Posts")}
      subtitle={t("News, tips and offers for your customers. Published posts appear on your site — and the assistant knows them.")}
      actions={c && <Button onClick={() => newPost(t("New post"), "")}>+ {t("Add new post")}</Button>}
    >
      {c && (
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <SparklesIcon size={14} className="text-forge-600" /> {t("Write with Groq")}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                write();
              }}
              className="mt-2 flex flex-wrap gap-2"
            >
              <input value={idea} maxLength={300} onChange={(e) => setIdea(e.target.value)} placeholder={t("What should the post be about? e.g. New rice prices this week")} className={`${input} min-w-0 flex-1`} />
              <Button type="submit" disabled={writing || !idea.trim()}>
                {writing ? <Spinner className="h-3.5 w-3.5" /> : null} {writing ? t("Writing…") : t("Write a draft")}
              </Button>
            </form>
            <p className="mt-1.5 text-xs text-slate-400">{t("Groq writes from what your site says, in your site's language, and marks facts it doesn't know with …. It's saved as a draft for you to check.")}</p>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </Card>

          {posts.some((p) => p.status === "published") && !hasBlogSection && <BlogPageHint onAdd={() => addBlogPage(s.setConfig)} />}

          {posts.length === 0 ? (
            <Card className="p-6 text-sm text-slate-500">{t("No posts yet.")}</Card>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{t("Title")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Status")}</th>
                    <th className="px-4 py-2.5 font-semibold">{t("Date")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...posts]
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((p) => (
                      <tr key={p.id}>
                        <td className="px-4 py-3">
                          <button onClick={() => setEditing(p.id)} className="font-semibold text-forge-700 hover:underline">
                            {p.title}
                          </button>
                        </td>
                        <td className="px-4 py-3">{p.status === "published" ? <Badge tone="green">{t("Published")}</Badge> : <Badge>{t("Draft")}</Badge>}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{p.date.slice(0, 10)}</td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => setEditing(p.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-forge-700 hover:underline">
                            {t("Edit")} <ArrowRightIcon size={11} />
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}
    </SiteFrame>
  );
}

/** A "Blog" page listing the latest posts, added to the menu. */
function addBlogPage(setConfig: ReturnType<typeof useSite>["setConfig"]) {
  setConfig((cfg) => ({
    ...cfg,
    pages: [
      ...cfg.pages,
      { id: Math.random().toString(36).slice(2, 10), title: "Blog", slug: "blog", inMenu: true, reviewed: true, sections: [{ type: "posts", heading: "Latest news", count: 10 }] },
    ],
  }));
}

function BlogPageHint({ onAdd }: { onAdd: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-forge-200 bg-forge-50 px-4 py-3 text-sm text-forge-900">
      <span>{t("No page on your site shows posts yet.")}</span>
      <button onClick={onAdd} className="font-semibold underline">
        {t("Add a Blog page to the menu")}
      </button>
    </div>
  );
}
