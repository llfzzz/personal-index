import { useEffect, useMemo, useState } from 'react';
import type {
  CSSProperties,
  Dispatch,
  MouseEvent,
  ReactNode,
  SetStateAction,
} from 'react';
import { defaultContent } from './data/profile';
import type { SiteContent } from './data/profile';

const STORAGE_KEY = 'quiet-interface-editor-content';

function loadContent(): SiteContent {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return defaultContent;
    }

    const parsed = JSON.parse(saved) as Partial<SiteContent>;

    return {
      ...defaultContent,
      ...parsed,
      contact: { ...defaultContent.contact, ...parsed.contact },
      connect: { ...defaultContent.connect, ...parsed.connect },
      experimentsPage: {
        ...defaultContent.experimentsPage,
        ...parsed.experimentsPage,
      },
      home: { ...defaultContent.home, ...parsed.home },
      navItems: defaultContent.navItems.map(
        (item) =>
          parsed.navItems?.find((savedItem) => savedItem.path === item.path) ??
          item,
      ),
      notesPage: { ...defaultContent.notesPage, ...parsed.notesPage },
    };
  } catch {
    return defaultContent;
  }
}

function getRoute() {
  const hashPath = window.location.hash.replace(/^#/, '');
  const path = hashPath || window.location.pathname;
  return defaultContent.navItems.some((item) => item.path === path) ? path : '/';
}

function App() {
  const [content, setContent] = useState<SiteContent>(loadContent);
  const [route, setRoute] = useState(getRoute);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  }, [content]);

  useEffect(() => {
    const handleLocationChange = () => setRoute(getRoute());
    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, '', `#${path}`);
    setRoute(path);
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
    window.localStorage.removeItem(STORAGE_KEY);
    setContent(defaultContent);
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
        <PageLink className="home-mark" navigate={navigate} to="/">
          0.0
        </PageLink>
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

      <div className="route-stage" key={route}>
        {route === '/' ? <HomePage content={content} navigate={navigate} /> : null}
        {route === '/notes' ? <NotesPage content={content} /> : null}
        {route === '/experiments' ? <ExperimentsPage content={content} /> : null}
        {route === '/connect' ? (
          <ConnectPage content={content} copied={copied} copyEmail={copyEmail} />
        ) : null}
        {route === '/editor' ? (
          <EditorPage
            content={content}
            navigate={navigate}
            resetContent={resetContent}
            setContent={setContent}
          />
        ) : null}
      </div>
    </main>
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
      href={`#${to}`}
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
  navigate,
}: {
  content: SiteContent;
  navigate: (path: string) => void;
}) {
  return (
    <section className="home-screen">
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

      <div className="entry-rail">
        {content.homeLinks.map((link) => (
          <button key={link.path} type="button" onClick={() => navigate(link.path)}>
            <span>{link.number}</span>
            <strong>{link.title}</strong>
            <em>{link.caption}</em>
          </button>
        ))}
      </div>
    </section>
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
    <section className="content-page notes-page">
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
    </section>
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
    <section className="content-page experiments-page">
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
          <p>{current.kicker}</p>
          <h2>{current.title}</h2>
          <span>{current.body}</span>
        </article>
      </div>
    </section>
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
    <section className="connect-page">
      <div className="connect-copy">
        <p>{content.connect.eyebrow}</p>
        <h1>{content.connect.title}</h1>
        <span>{content.connect.body}</span>
      </div>
      <div className="connect-actions">
        <a href={`mailto:${content.contact.email}`}>{content.connect.mailLabel}</a>
        <button type="button" onClick={copyEmail}>
          {copied ? 'copied' : content.contact.email}
        </button>
      </div>
    </section>
  );
}

function EditorPage({
  content,
  navigate,
  resetContent,
  setContent,
}: {
  content: SiteContent;
  navigate: (path: string) => void;
  resetContent: () => void;
  setContent: Dispatch<SetStateAction<SiteContent>>;
}) {
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

  function updateHomeLink(
    index: number,
    field: keyof SiteContent['homeLinks'][number],
    value: string,
  ) {
    setContent((current) => ({
      ...current,
      homeLinks: current.homeLinks.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
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
    field: keyof SiteContent['experiments'][number],
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
          <span>修改会实时生效，并自动保存到浏览器本地。</span>
        </div>
        <div className="editor-actions">
          <button type="button" onClick={() => navigate('/')}>
            preview home
          </button>
          <button type="button" onClick={resetContent}>
            reset
          </button>
        </div>
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

        <EditorPanel title="entry rail">
          <div className="editor-list">
            {content.homeLinks.map((link, index) => (
              <div className="editor-item" key={link.path}>
                <div className="editor-grid">
                  <label className="editor-field">
                    <span>number</span>
                    <input
                      value={link.number}
                      onChange={(event) =>
                        updateHomeLink(index, 'number', event.target.value)
                      }
                    />
                  </label>
                  <label className="editor-field">
                    <span>title</span>
                    <input
                      value={link.title}
                      onChange={(event) =>
                        updateHomeLink(index, 'title', event.target.value)
                      }
                    />
                  </label>
                </div>
                <label className="editor-field">
                  <span>caption</span>
                  <input
                    value={link.caption}
                    onChange={(event) =>
                      updateHomeLink(index, 'caption', event.target.value)
                    }
                  />
                </label>
              </div>
            ))}
          </div>
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
