import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LogoMark } from '../BrandLogo'

const SIDEBAR = [
  {
    label: 'Guides',
    items: [
      { id: 'quickstart', title: 'Quickstart' },
      { id: 'universal-setup', title: 'Connect any tool' },
      { id: 'free-credits', title: 'Free credits' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { id: 'api-auth', title: 'API & auth' },
      { id: 'errors', title: 'Errors' },
    ],
  },
  {
    label: 'Markdown',
    items: [
      { href: '/docs/guide.md', title: 'guide.md' },
      { href: '/llms.txt', title: 'llms.txt' },
    ],
  },
] as const

function injectOrigin(markdown: string, origin: string) {
  return markdown.replaceAll('{origin}', origin).replaceAll('{your-origin}', origin)
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

export function DocsPage() {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://trymandate.dev'
  const [markdown, setMarkdown] = useState('')
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [activeId, setActiveId] = useState('quickstart')

  useEffect(() => {
    let cancelled = false
    fetch('/docs/guide.md')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load /docs/guide.md')
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setMarkdown(injectOrigin(text, origin))
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load docs')
      })
    return () => {
      cancelled = true
    }
  }, [origin])

  useEffect(() => {
    if (!markdown) return
    const id = window.location.hash.replace(/^#/, '')
    if (!id) return
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
      setActiveId(id)
    })
  }, [markdown])

  useEffect(() => {
    if (!markdown) return
    const headings = Array.from(document.querySelectorAll('.docs-article h2[id]'))
    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]?.target.id) setActiveId(visible[0].target.id)
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 1] },
    )

    headings.forEach((heading) => observer.observe(heading))
    return () => observer.disconnect()
  }, [markdown])

  const components = useMemo(
    () => ({
      h2: ({ children }: { children?: ReactNode }) => {
        const text = String(children)
        const id = slugify(text)
        return (
          <h2 id={id}>
            <a href={`#${id}`} className="docs-heading-anchor">
              {children}
            </a>
          </h2>
        )
      },
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        if (href?.startsWith('/')) {
          return <Link to={href}>{children}</Link>
        }
        if (href?.startsWith('#')) {
          return <a href={href}>{children}</a>
        }
        return (
          <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
            {children}
          </a>
        )
      },
    }),
    [],
  )

  return (
    <div className="docs-site">
      <header className="docs-topbar">
        <button
          type="button"
          className="docs-menu-btn"
          aria-label="Open docs menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          ☰
        </button>
        <Link className="docs-brand" to="/docs" aria-label="Mandate docs">
          <LogoMark />
          <span>Mandate</span>
          <em>Docs</em>
        </Link>
        <nav className="docs-top-links" aria-label="Docs actions">
          <a href="/llms.txt">llms.txt</a>
          <Link to="/app">Open app</Link>
          <Link className="docs-top-cta" to="/sign-up">
            Get started
          </Link>
        </nav>
      </header>

      <div className="docs-shell">
        <aside className={`docs-sidebar ${menuOpen ? 'open' : ''}`}>
          <nav aria-label="Documentation">
            {SIDEBAR.map((group) => (
              <div key={group.label} className="docs-nav-group">
                <p>{group.label}</p>
                <ul>
                  {group.items.map((item) =>
                    'href' in item ? (
                      <li key={item.href}>
                        <a href={item.href} onClick={() => setMenuOpen(false)}>
                          {item.title}
                        </a>
                      </li>
                    ) : (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className={activeId === item.id ? 'active' : undefined}
                          onClick={() => setMenuOpen(false)}
                        >
                          {item.title}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </nav>
          <div className="docs-sidebar-foot">
            <NavLink to="/">← Marketing site</NavLink>
          </div>
        </aside>

        {menuOpen && (
          <button
            type="button"
            className="docs-sidebar-backdrop"
            aria-label="Close docs menu"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <main className="docs-content">
          <p className="docs-llm-banner">
            Are you an LLM? Read <a href="/llms.txt">llms.txt</a> for a summary of the docs, or{' '}
            <a href="/docs/guide.md">guide.md</a> for the full page as Markdown.
          </p>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          {!error && !markdown && <p className="docs-loading">Loading docs…</p>}

          {markdown && (
            <article className="docs-article">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {markdown}
              </ReactMarkdown>
            </article>
          )}
        </main>
      </div>
    </div>
  )
}
