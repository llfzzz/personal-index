import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  Dispatch,
  MouseEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import { defaultContent } from './data/profile';
import type { SiteContent } from './data/profile';

const TOKEN_STORAGE_KEY = 'quiet-interface-editor-token';
const PUBLIC_ROUTES = defaultContent.navItems.map((item) => item.path);
const HIDDEN_ROUTES = ['/editor'];
const VALID_ROUTES = [...PUBLIC_ROUTES, ...HIDDEN_ROUTES];

type PublishStatus = {
  tone: 'idle' | 'loading' | 'success' | 'error';
  message: string;
};

function mergeContent(content: Partial<SiteContent>): SiteContent {
  return {
    ...defaultContent,
    ...content,
    contact: { ...defaultContent.contact, ...content.contact },
    connect: { ...defaultContent.connect, ...content.connect },
    experimentsPage: {
      ...defaultContent.experimentsPage,
      ...content.experimentsPage,
    },
    home: { ...defaultContent.home, ...content.home },
    navItems: defaultContent.navItems.map(
      (item) =>
        content.navItems?.find((savedItem) => savedItem.path === item.path) ??
        item,
    ),
    notesPage: { ...defaultContent.notesPage, ...content.notesPage },
  };
}

async function loadServerContent(): Promise<SiteContent> {
  try {
    const response = await fetch('/api/site-content', {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return defaultContent;
    }

    return mergeContent((await response.json()) as Partial<SiteContent>);
  } catch {
    return defaultContent;
  }
}

function getRoute() {
  const hashPath = window.location.hash.replace(/^#/, '');
  const path = hashPath || window.location.pathname;
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return VALID_ROUTES.includes(normalizedPath) ? normalizedPath : '/';
}

function routeToSectionId(path: string) {
  return path === '/' ? 'home' : path.replace(/^\//, '');
}

function scrollToPublicRoute(path: string, behavior: ScrollBehavior = 'smooth') {
  const section = document.getElementById(routeToSectionId(path));
  section?.scrollIntoView({ behavior, block: 'start' });
}

function App() {
  const [content, setContent] = useState<SiteContent>(defaultContent);
  const [route, setRoute] = useState(getRoute);
  const hasRestoredInitialRoute = useRef(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>({
    tone: 'idle',
    message: 'Changes are local until you publish.',
  });

  useEffect(() => {
    function handleLocationChange() {
      const nextRoute = getRoute();
      setRoute(nextRoute);
      if (PUBLIC_ROUTES.includes(nextRoute)) {
        window.setTimeout(() => scrollToPublicRoute(nextRoute, 'auto'), 0);
      }
    }

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadServerContent().then((serverContent) => {
      if (isMounted) {
        setContent(serverContent);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);


  useEffect(() => {
    if (hasRestoredInitialRoute.current || !PUBLIC_ROUTES.includes(route)) {
      return;
    }

    hasRestoredInitialRoute.current = true;
    window.setTimeout(() => scrollToPublicRoute(route, 'auto'), 0);
  }, [route]);

  useEffect(() => {
    if (route === '/editor') {
      return;
    }

    let frame = 0;

    function updateActiveRoute() {
      frame = 0;
      const anchor = window.innerHeight * 0.38;
      let nextRoute = '/';
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const path of PUBLIC_ROUTES) {
        const section = document.getElementById(routeToSectionId(path));
        if (!section) continue;

        const rect = section.getBoundingClientRect();
        const distance = Math.abs(rect.top - anchor);
        const inRange = rect.top <= anchor && rect.bottom >= anchor;

        if (inRange || distance < bestDistance) {
          bestDistance = distance;
          nextRoute = path;
          if (inRange) break;
        }
      }

      setRoute((current) => (current === nextRoute ? current : nextRoute));
      if (window.location.pathname !== nextRoute) {
        window.history.replaceState({}, '', nextRoute);
      }
    }

    function handleScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActiveRoute);
    }

    updateActiveRoute();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [route]);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(path);

    if (PUBLIC_ROUTES.includes(path)) {
      scrollToPublicRoute(path);
      return;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handlePointerMove(event: MouseEvent<HTMLElement>) {
    setCursor({
      x: event.clientX / window.innerWidth - 0.5,
      y: event.clientY / window.innerHeight - 0.5,
    });
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(content.contact.email);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = content.contact.email;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function resetContent() {
    setContent(defaultContent);
    setPublishStatus({
      tone: 'idle',
      message: 'Reset only changed the local draft. Publish to update the server.',
    });
  }

  async function publishContent(token: string) {
    if (!token.trim()) {
      setPublishStatus({
        tone: 'error',
        message: 'Enter the editor token before publishing.',
      });
      return;
    }

    setPublishStatus({ tone: 'loading', message: 'Publishing to server...' });

    try {
      const response = await fetch('/api/site-content', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(content),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? 'Publish failed.');
      }

      const savedContent = mergeContent(
        ((await response.json()) as { content?: Partial<SiteContent> }).content ??
          content,
      );
      setContent(savedContent);
      setPublishStatus({
        tone: 'success',
        message: 'Published. New visitors will see this content.',
      });
    } catch (error) {
      setPublishStatus({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Publish failed. Check the API server.',
      });
    }
  }

  return (
    <main
      className="site"
      onPointerMove={handlePointerMove}
      style={
        {
          '--mx': cursor.x.toFixed(4),
          '--my': cursor.y.toFixed(4),
        } as CSSProperties
      }
    >
      <header className="top-nav">
        <ProfileMenu />
        <nav aria-label="site navigation">
          {content.navItems.map((item) => (
            <PageLink
              className={route === item.path ? 'active' : ''}
              key={item.path}
              navigate={navigate}
              to={item.path}
            >
              {item.label}
            </PageLink>
          ))}
        </nav>
      </header>

      {route === '/editor' ? (
        <div className="route-stage editor-stage">
          <EditorPage
            content={content}
            navigate={navigate}
            publishContent={publishContent}
            publishStatus={publishStatus}
            resetContent={resetContent}
            setContent={setContent}
          />
        </div>
      ) : (
        <ScrollPage
          content={content}
          copied={copied}
          copyEmail={copyEmail}
        />
      )}
    </main>
  );
}



function ScrollPage({
  content,
  copied,
  copyEmail,
}: {
  content: SiteContent;
  copied: boolean;
  copyEmail: () => void;
}) {
  return (
    <div className="scroll-stage">
      <section className="scroll-section scroll-section-home" id="home" data-route="/">
        <HomePage content={content} />
      </section>
      <section className="scroll-section scroll-section-notes" id="notes" data-route="/notes">
        <NotesPage content={content} />
      </section>
      <section className="scroll-section scroll-section-experiments" id="experiments" data-route="/experiments">
        <ExperimentsPage content={content} />
      </section>
      <section className="scroll-section scroll-section-connect" id="connect" data-route="/connect">
        <ConnectPage content={content} copied={copied} copyEmail={copyEmail} />
      </section>
    </div>
  );
}

function ProfileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        type="button"
        className="home-mark profile-trigger"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="open personal links"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>0.0</span>
      </button>

      {isOpen ? (
        <div className="profile-tile-menu" role="menu" aria-label="personal links">
          <a
            className="profile-tile"
            href="https://github.com/llfzzz"
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            aria-label="open GitHub profile"
            title="GitHub"
            onClick={() => setIsOpen(false)}
          >
            <GithubIcon />
          </a>
        </div>
      ) : null}
    </div>
  );
}

function GithubIcon() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M12 .7C5.7.7.6 5.8.6 12.1c0 5 3.3 9.3 7.8 10.8.6.1.8-.2.8-.6v-2.2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.5-.3-5.2-1.3-5.2-5.6 0-1.2.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.3-5.2 5.6.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6a11.4 11.4 0 0 0 7.8-10.8C23.4 5.8 18.3.7 12 .7Z"
      />
    </svg>
  );
}

function PageLink({
  children,
  className,
  navigate,
  to,
}: {
  children: ReactNode;
  className?: string;
  navigate: (path: string) => void;
  to: string;
}) {
  return (
    <a
      className={className}
      href={to}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function HomePage({
  content,
}: {
  content: SiteContent;
}) {
  return (
    <div className="home-screen">
      <div className="hero-type">
        <p>{content.home.eyebrow}</p>
        <h1>
          {content.home.titleLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </h1>
      </div>

      <Specimen content={content} />

      <div className="home-intro">
        <span>{content.home.introLabel}</span>
        <p>{content.home.introBody}</p>
      </div>
    </div>
  );
}

function Specimen({ content }: { content: SiteContent }) {
  return (
    <div className="specimen" aria-hidden="true">
      <div className="specimen-ring" />
      <div className="specimen-pieces">
        {content.fragments.map((fragment) => (
          <span
            key={fragment.id}
            style={
              {
                '--x': fragment.x,
                '--y': fragment.y,
                '--w': fragment.w,
                '--h': fragment.h,
                '--clip': fragment.clip,
                '--tone': fragment.tone,
                '--rx': fragment.rx,
                '--ry': fragment.ry,
                '--r': fragment.rotate,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="specimen-caption">
        <span>{content.home.specimenCaptionLabel}</span>
        <strong>{content.home.specimenCaptionText}</strong>
      </div>
    </div>
  );
}

function NotesPage({ content }: { content: SiteContent }) {
  return (
    <div className="content-page notes-page">
      <div className="page-heading">
        <p>{content.notesPage.eyebrow}</p>
        <h1>{content.notesPage.title}</h1>
      </div>

      <div className="note-list">
        {content.notes.map((note) => (
          <article key={`${note.number}-${note.title}`}>
            <span>{note.number}</span>
            <h2>{note.title}</h2>
            <p>{note.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function ExperimentsPage({ content }: { content: SiteContent }) {
  const [active, setActive] = useState(content.experiments[0].id);
  const current = useMemo(
    () =>
      content.experiments.find((item) => item.id === active) ??
      content.experiments[0],
    [active, content.experiments],
  );

  return (
    <div className="content-page experiments-page">
      <div className="page-heading">
        <p>{content.experimentsPage.eyebrow}</p>
        <h1>{content.experimentsPage.title}</h1>
      </div>

      <div className="experiment-layout">
        <div className="experiment-list">
          {content.experiments.map((item) => (
            <button
              className={item.id === active ? 'active' : ''}
              key={item.id}
              onClick={() => setActive(item.id)}
              type="button"
            >
              <span>{item.number}</span>
              <strong>{item.title}</strong>
              <em>{item.kicker}</em>
            </button>
          ))}
        </div>

        <article className="experiment-preview">
          <div className="preview-symbol">{current.symbol}</div>
          <div className="preview-copy">
            <p>{current.kicker}</p>
            <h2>{current.title}</h2>
            <span>{current.body}</span>
          </div>

          <div className="preview-body">
            <div className="project-thumbnail" aria-hidden="true">
              <div className="thumbnail-sidebar">
                {current.preview.cards.map((card) => (
                  <span key={card}>{card}</span>
                ))}
              </div>
              <div className="thumbnail-main">
                <div className="thumbnail-bar">
                  <span>{current.preview.eyebrow}</span>
                  <b>{current.status}</b>
                </div>
                <strong>{current.preview.title}</strong>
                <div className="thumbnail-rows">
                  <span />
                  <span />
                  <span />
                </div>
                <em>{current.preview.footer}</em>
              </div>
            </div>

            <div className="preview-detail">
              <ul>
                {current.highlights.map((highlight) => (
                  <li key={highlight}>{highlight}</li>
                ))}
              </ul>
              {current.ctaHref ? (
                <a className="preview-cta" href={current.ctaHref}>
                  {current.ctaLabel}
                </a>
              ) : (
                <span className="preview-cta preview-cta-muted">
                  {current.ctaLabel}
                </span>
              )}
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function ConnectPage({
  content,
  copied,
  copyEmail,
}: {
  content: SiteContent;
  copied: boolean;
  copyEmail: () => void;
}) {
  return (
    <div className="connect-page">
      <div className="connect-copy">
        <p>{content.connect.eyebrow}</p>
        <h1>{content.connect.title}</h1>
        <span>{content.connect.body}</span>
      </div>
      <div className="connect-actions">
        <span>{content.connect.mailLabel}</span>
        <button type="button" onClick={copyEmail}>
          {copied ? 'copied' : content.contact.email}
        </button>
        <span>phone</span>
        <a href={`tel:${content.contact.phone}`}>{content.contact.phone}</a>
      </div>
    </div>
  );
}

function EditorPage({
  content,
  navigate,
  publishContent,
  publishStatus,
  resetContent,
  setContent,
}: {
  content: SiteContent;
  navigate: (path: string) => void;
  publishContent: (token: string) => Promise<void>;
  publishStatus: PublishStatus;
  resetContent: () => void;
  setContent: Dispatch<SetStateAction<SiteContent>>;
}) {
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });

  function updateToken(value: string) {
    setToken(value);
    try {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, value);
    } catch {
      // Browsers can block localStorage in private or hardened contexts.
    }
  }

  function updateHome(
    field: Exclude<keyof SiteContent['home'], 'titleLines'>,
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      home: { ...current.home, [field]: value },
    }));
  }

  function updateHomeLine(index: number, value: string) {
    setContent((current) => ({
      ...current,
      home: {
        ...current.home,
        titleLines: current.home.titleLines.map((line, lineIndex) =>
          lineIndex === index ? value : line,
        ),
      },
    }));
  }

  function updateNavLabel(index: number, value: string) {
    setContent((current) => ({
      ...current,
      navItems: current.navItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, label: value } : item,
      ),
    }));
  }

  function updateNote(
    index: number,
    field: keyof SiteContent['notes'][number],
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      notes: current.notes.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function updateExperiment(
    index: number,
    field: 'number' | 'symbol' | 'kicker' | 'title' | 'body',
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      experiments: current.experiments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function updateFragmentTone(index: number, value: string) {
    setContent((current) => ({
      ...current,
      fragments: current.fragments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, tone: value } : item,
      ),
    }));
  }

  return (
    <section className="editor-page">
      <div className="editor-header">
        <div>
          <p>editor</p>
          <h1>control room</h1>
          <span>修改会实时预览。输入 token 后发布，才会同步到服务器。</span>
        </div>
        <div className="editor-actions">
          <label className="editor-token">
            <span>token</span>
            <input
              autoComplete="off"
              type="password"
              value={token}
              onChange={(event) => updateToken(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => publishContent(token)}>
            publish
          </button>
          <button type="button" onClick={() => navigate('/')}>
            preview home
          </button>
        </div>
      </div>
      <div className={`editor-status ${publishStatus.tone}`}>
        {publishStatus.message}
      </div>

      <div className="editor-layout">
        <EditorPanel title="navigation">
          <div className="editor-grid small">
            {content.navItems.map((item, index) => (
              <label className="editor-field" key={item.path}>
                <span>{item.path}</span>
                <input
                  value={item.label}
                  onChange={(event) => updateNavLabel(index, event.target.value)}
                />
              </label>
            ))}
          </div>
        </EditorPanel>

        <EditorPanel title="home">
          <label className="editor-field">
            <span>eyebrow</span>
            <input
              value={content.home.eyebrow}
              onChange={(event) => updateHome('eyebrow', event.target.value)}
            />
          </label>
          <div className="editor-grid">
            {content.home.titleLines.map((line, index) => (
              <label className="editor-field" key={`title-${index}`}>
                <span>title line {index + 1}</span>
                <input
                  value={line}
                  onChange={(event) => updateHomeLine(index, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="editor-grid">
            <label className="editor-field">
              <span>intro label</span>
              <input
                value={content.home.introLabel}
                onChange={(event) => updateHome('introLabel', event.target.value)}
              />
            </label>
            <label className="editor-field">
              <span>specimen label</span>
              <input
                value={content.home.specimenCaptionLabel}
                onChange={(event) =>
                  updateHome('specimenCaptionLabel', event.target.value)
                }
              />
            </label>
          </div>
          <label className="editor-field">
            <span>intro body</span>
            <textarea
              value={content.home.introBody}
              onChange={(event) => updateHome('introBody', event.target.value)}
            />
          </label>
          <label className="editor-field">
            <span>specimen caption</span>
            <input
              value={content.home.specimenCaptionText}
              onChange={(event) =>
                updateHome('specimenCaptionText', event.target.value)
              }
            />
          </label>
        </EditorPanel>

        <EditorPanel title="notes page">
          <div className="editor-grid">
            <label className="editor-field">
              <span>eyebrow</span>
              <input
                value={content.notesPage.eyebrow}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    notesPage: {
                      ...current.notesPage,
                      eyebrow: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              <span>title</span>
              <input
                value={content.notesPage.title}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    notesPage: { ...current.notesPage, title: event.target.value },
                  }))
                }
              />
            </label>
          </div>
          <div className="editor-list">
            {content.notes.map((note, index) => (
              <div className="editor-item" key={`note-${index}`}>
                <div className="editor-grid">
                  <label className="editor-field">
                    <span>number</span>
                    <input
                      value={note.number}
                      onChange={(event) =>
                        updateNote(index, 'number', event.target.value)
                      }
                    />
                  </label>
                  <label className="editor-field">
                    <span>title</span>
                    <input
                      value={note.title}
                      onChange={(event) =>
                        updateNote(index, 'title', event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="editor-field">
                  <span>body</span>
                  <textarea
                    value={note.body}
                    onChange={(event) =>
                      updateNote(index, 'body', event.target.value)
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </EditorPanel>

        <EditorPanel title="experiments page">
          <div className="editor-grid">
            <label className="editor-field">
              <span>eyebrow</span>
              <input
                value={content.experimentsPage.eyebrow}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    experimentsPage: {
                      ...current.experimentsPage,
                      eyebrow: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              <span>title</span>
              <input
                value={content.experimentsPage.title}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    experimentsPage: {
                      ...current.experimentsPage,
                      title: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>
          <div className="editor-list">
            {content.experiments.map((item, index) => (
              <div className="editor-item" key={item.id}>
                <div className="editor-grid">
                  <label className="editor-field">
                    <span>number</span>
                    <input
                      value={item.number}
                      onChange={(event) =>
                        updateExperiment(index, 'number', event.target.value)
                      }
                    />
                  </label>
                  <label className="editor-field">
                    <span>symbol</span>
                    <input
                      value={item.symbol}
                      onChange={(event) =>
                        updateExperiment(index, 'symbol', event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="editor-field">
                  <span>kicker</span>
                  <input
                    value={item.kicker}
                    onChange={(event) =>
                      updateExperiment(index, 'kicker', event.target.value)
                    }
                  />
                </label>
                <label className="editor-field">
                  <span>title</span>
                  <input
                    value={item.title}
                    onChange={(event) =>
                      updateExperiment(index, 'title', event.target.value)
                    }
                  />
                </label>
                <label className="editor-field">
                  <span>body</span>
                  <textarea
                    value={item.body}
                    onChange={(event) =>
                      updateExperiment(index, 'body', event.target.value)
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </EditorPanel>

        <EditorPanel title="specimen colors">
          <div className="fragment-editor">
            {content.fragments.map((fragment, index) => (
              <label className="color-field" key={fragment.id}>
                <span>{String(fragment.id).padStart(2, '0')}</span>
                <input
                  type="color"
                  value={fragment.tone}
                  onChange={(event) => updateFragmentTone(index, event.target.value)}
                />
              </label>
            ))}
          </div>
        </EditorPanel>

        <EditorPanel title="connect">
          <div className="editor-grid">
            <label className="editor-field">
              <span>email</span>
              <input
                value={content.contact.email}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    contact: { ...current.contact, email: event.target.value },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              <span>phone</span>
              <input
                value={content.contact.phone}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    contact: { ...current.contact, phone: event.target.value },
                  }))
                }
              />
            </label>
          </div>
          <div className="editor-grid">
            <label className="editor-field">
              <span>eyebrow</span>
              <input
                value={content.connect.eyebrow}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    connect: { ...current.connect, eyebrow: event.target.value },
                  }))
                }
              />
            </label>
            <label className="editor-field">
              <span>button</span>
              <input
                value={content.connect.mailLabel}
                onChange={(event) =>
                  setContent((current) => ({
                    ...current,
                    connect: { ...current.connect, mailLabel: event.target.value },
                  }))
                }
              />
            </label>
          </div>
          <label className="editor-field">
            <span>title</span>
            <input
              value={content.connect.title}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  connect: { ...current.connect, title: event.target.value },
                }))
              }
            />
          </label>
          <label className="editor-field">
            <span>body</span>
            <textarea
              value={content.connect.body}
              onChange={(event) =>
                setContent((current) => ({
                  ...current,
                  connect: { ...current.connect, body: event.target.value },
                }))
              }
            />
          </label>
        </EditorPanel>
      </div>
      <div className="editor-danger-zone">
        <button type="button" onClick={resetContent}>
          reset
        </button>
      </div>
    </section>
  );
}

function EditorPanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <article className="editor-panel">
      <h2>{title}</h2>
      {children}
    </article>
  );
}

export default App;
