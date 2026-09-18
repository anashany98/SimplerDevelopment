// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// ProjectArtifactsTab has no external lib imports beyond React — no mocks
// needed except global fetch.
// ---------------------------------------------------------------------------
import ProjectArtifactsTab from '@/components/portal/ProjectArtifactsTab';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fetchOk(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

function fetchFail(body: unknown) {
  return Promise.resolve({ ok: false, json: () => Promise.resolve(body) });
}

const PROJECT_ID = 42;

const ARTIFACT_1 = {
  id: 1,
  projectId: PROJECT_ID,
  artifactType: 'website',
  artifactId: 10,
  displayTitle: 'My Website',
  pinned: false,
  createdBy: null,
  createdAt: '2026-01-01T00:00:00Z',
};

const ARTIFACT_2 = {
  id: 2,
  projectId: PROJECT_ID,
  artifactType: 'pitch_deck',
  artifactId: 20,
  displayTitle: 'Q1 Deck',
  pinned: true,
  createdBy: 1,
  createdAt: '2026-01-02T00:00:00Z',
};

const AVAILABLE_1 = { type: 'website', id: 99, title: 'New Site' };
const AVAILABLE_2 = { type: 'survey', id: 55, title: 'Feedback Survey' };

function artifactsUrl(id = PROJECT_ID) {
  return `/api/portal/projects/${id}/artifacts`;
}

function setupFetch(artifacts: unknown[] = [], available: unknown[] = []) {
  global.fetch = vi.fn((url: string) => {
    const s = String(url);
    if (s.includes('/artifacts/available')) return fetchOk({ success: true, data: available });
    if (s.includes('/artifacts')) return fetchOk({ success: true, data: artifacts });
    return fetchOk({ success: true, data: [] });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — loading state', () => {
  it('shows loading spinner while initial fetch is in-flight', async () => {
    let resolve: (v: unknown) => void = () => {};
    const pending = new Promise((res) => { resolve = res; });
    global.fetch = vi.fn(() => pending) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    expect(screen.getByText(/Cargando artefactos/i)).toBeTruthy();

    // Clean up
    act(() => { resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [] }) }); });
  });

  it('removes loading spinner after fetch resolves', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.queryByText(/Cargando artefactos/i)).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — empty state', () => {
  it('shows empty state when artifact list is empty', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.getByText(/Aún no hay artefactos vinculados/i)).toBeTruthy());
  });

  it('shows "Link your first artifact" button in empty state when canEdit=true', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => expect(screen.getByText(/Vincula tu primer artefacto/i)).toBeTruthy());
  });

  it('does not show "Link your first artifact" button when canEdit=false', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.queryByText(/Vincula tu primer artefacto/i)).toBeNull());
  });

  it('shows "Link artifact" header button when canEdit=true', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => expect(screen.getByText(/Vincular artefacto/i)).toBeTruthy());
  });

  it('does not show "Link artifact" header button when canEdit=false', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => {
      expect(screen.queryByText(/Vincular artefacto/i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Artifact list
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — artifact list', () => {
  it('renders artifact titles when fetch returns artifacts', async () => {
    setupFetch([ARTIFACT_1, ARTIFACT_2]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => {
      expect(screen.getByText('My Website')).toBeTruthy();
      expect(screen.getByText('Q1 Deck')).toBeTruthy();
    });
  });

  it('shows artifact count in the heading', async () => {
    setupFetch([ARTIFACT_1, ARTIFACT_2]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.getByText('(2)')).toBeTruthy());
  });

  it('renders a link with correct href for known artifact types', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => {
      const links = screen.getAllByTitle('Abrir artefacto');
      expect(links[0].getAttribute('href')).toBe(`/portal/websites/${ARTIFACT_1.artifactId}`);
    });
  });

  it('renders pitch_deck artifact with correct link', async () => {
    setupFetch([ARTIFACT_2]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => {
      const links = screen.getAllByTitle('Abrir artefacto');
      expect(links[0].getAttribute('href')).toBe(`/portal/tools/pitch-decks/${ARTIFACT_2.artifactId}`);
    });
  });

  it('renders all known artifact type labels', async () => {
    const types = [
      { type: 'website', label: 'Sitio web' },
      { type: 'email_campaign', label: 'Campaña de email' },
      { type: 'proposal', label: 'Propuesta' },
      { type: 'booking', label: 'Reserva' },
      { type: 'survey', label: 'Encuesta' },
      { type: 'post', label: 'Publicación' },
      { type: 'brain_note', label: 'Nota de Brain' },
      { type: 'path_chart', label: 'Gráfico de ruta' },
    ];
    for (const { type, label } of types) {
      cleanup();
      const art = { id: 1, projectId: PROJECT_ID, artifactType: type, artifactId: 1, displayTitle: `Test ${type}`, pinned: false, createdBy: null, createdAt: '2026-01-01T00:00:00Z' };
      setupFetch([art]);
      render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);
      await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
      cleanup();
    }
  });

  it('pinned artifact is sorted before unpinned', async () => {
    // ARTIFACT_2 is pinned, ARTIFACT_1 is not
    setupFetch([ARTIFACT_1, ARTIFACT_2]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => {
      const titles = screen.getAllByText(/My Website|Q1 Deck/);
      // pinned (Q1 Deck) should come first
      expect(titles[0].textContent).toBe('Q1 Deck');
    });
  });

  it('fetches using the correct projectId', async () => {
    setupFetch([]);
    render(<ProjectArtifactsTab projectId={99} canEdit={false} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/portal/projects/99/artifacts'),
      );
    });
  });

  it('handles fetch returning success:false gracefully', async () => {
    global.fetch = vi.fn(() => fetchOk({ success: false })) as unknown as typeof fetch;
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.getByText(/Aún no hay artefactos vinculados/i)).toBeTruthy());
  });

  it('handles fetch returning non-ok response gracefully', async () => {
    global.fetch = vi.fn(() => fetchFail({})) as unknown as typeof fetch;
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.getByText(/Aún no hay artefactos vinculados/i)).toBeTruthy());
  });

  it('handles fetch network error gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.queryByText(/Cargando artefactos/i)).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Picker open / close
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — picker toggle', () => {
  it('opens picker when "Link artifact" button is clicked', async () => {
    setupFetch([], [AVAILABLE_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => expect(screen.getByPlaceholderText(/Buscar artefactos/i)).toBeTruthy());
  });

  it('button label changes to "Close" when picker is open', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => expect(screen.getByText('Cerrar')).toBeTruthy());
  });

  it('closes picker when button is clicked again', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByText('Cerrar'));
    fireEvent.click(screen.getByText('Cerrar'));

    await waitFor(() => expect(screen.queryByPlaceholderText(/Buscar artefactos/i)).toBeNull());
  });

  it('opens picker from empty state "Link your first artifact" button', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincula tu primer artefacto/i));
    fireEvent.click(screen.getByText(/Vincula tu primer artefacto/i));

    await waitFor(() => expect(screen.getByPlaceholderText(/Buscar artefactos/i)).toBeTruthy());
  });

  it('fetches available artifacts when picker opens', async () => {
    setupFetch([], [AVAILABLE_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/artifacts/available'),
      ),
    );
  });

  it('shows available artifact in picker list', async () => {
    setupFetch([], [AVAILABLE_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => expect(screen.getByText('New Site')).toBeTruthy());
  });

  it('shows "No available artifacts" when list is empty', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => expect(screen.getByText(/No hay artefactos disponibles/i)).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Picker — search and type filter
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — picker search and filters', () => {
  it('filters by search input in the picker', async () => {
    setupFetch([], [AVAILABLE_1, AVAILABLE_2]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByPlaceholderText(/Buscar artefactos/i));

    fireEvent.change(screen.getByPlaceholderText(/Buscar artefactos/i), {
      target: { value: 'New' },
    });

    // Re-fetch is triggered with q param; meanwhile filteredAvailable filters client-side
    // Both items were loaded — client-side filter shows only 'New Site'
    await waitFor(() => expect(screen.queryByText('Feedback Survey')).toBeNull());
  });

  it('shows type filter chips for all artifact types', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => {
      expect(screen.getByText('Sitio web')).toBeTruthy();
      expect(screen.getByText('Encuesta')).toBeTruthy();
      expect(screen.getByText('Propuesta')).toBeTruthy();
    });
  });

  it('clicking a type chip triggers a re-fetch with that type', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByText('Sitio web'));

    fireEvent.click(screen.getByText('Sitio web'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=website'),
      ),
    );
  });

  it('clicking "All" chip resets the type filter', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByText('Sitio web'));

    // Select a type then click All
    fireEvent.click(screen.getByText('Sitio web'));
    await waitFor(() => screen.getByRole('button', { name: 'Todos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todos' }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('type=all'),
      ),
    );
  });

  it('already-linked artifacts are excluded from picker list', async () => {
    // ARTIFACT_1 is website id=10; AVAILABLE_1 is website id=99 (different id — should show)
    // Make available return ARTIFACT_1's own type+id to test exclusion
    const alreadyLinked = { type: 'website', id: ARTIFACT_1.artifactId, title: 'Already Linked' };
    setupFetch([ARTIFACT_1], [alreadyLinked]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => expect(screen.getByText(/No hay artefactos disponibles/i)).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Link (add) artifact
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — linking an artifact', () => {
  it('POSTs to artifacts endpoint when an available item is clicked', async () => {
    const linkedArtifact = { id: 5, projectId: PROJECT_ID, artifactType: 'website', artifactId: 99, displayTitle: 'New Site', pinned: false, createdBy: null, createdAt: '2026-01-01T00:00:00Z' };
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if (s.includes('/artifacts/available')) return fetchOk({ success: true, data: [AVAILABLE_1] });
      if ((init as RequestInit | undefined)?.method === 'POST') return fetchOk({ success: true, data: linkedArtifact });
      // GET /artifacts — initial load returns empty, reload after link returns linked artifact
      return fetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));

    await waitFor(() => screen.getByText('New Site'));
    fireEvent.click(screen.getByText('New Site'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const postCall = calls.find(
        (c) => String(c[0]).includes('/artifacts') && !String(c[0]).includes('available') && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('closes picker after successfully linking an artifact', async () => {
    const linkedArtifact = { id: 5, projectId: PROJECT_ID, artifactType: 'website', artifactId: 99, displayTitle: 'New Site', pinned: false, createdBy: null, createdAt: '2026-01-01T00:00:00Z' };
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if (s.includes('/artifacts/available')) return fetchOk({ success: true, data: [AVAILABLE_1] });
      if ((init as RequestInit | undefined)?.method === 'POST') return fetchOk({ success: true, data: linkedArtifact });
      // GET /artifacts — initial load returns empty; reload after link returns one item
      return fetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByText('New Site'));

    await act(async () => {
      fireEvent.click(screen.getByText('New Site'));
    });

    await waitFor(() => expect(screen.queryByPlaceholderText(/Buscar artefactos/i)).toBeNull());
  });

  it('does not close picker when POST returns non-ok', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if (s.includes('/artifacts/available')) return fetchOk({ success: true, data: [AVAILABLE_1] });
      if ((init as RequestInit | undefined)?.method === 'POST') return fetchFail({});
      return fetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByText('New Site'));
    fireEvent.click(screen.getByText('New Site'));

    // Picker stays open because linkArtifact returned early on !res.ok
    await waitFor(() => expect(screen.getByPlaceholderText(/Buscar artefactos/i)).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Pin / unpin
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — pin/unpin', () => {
  it('renders Pin button for each artifact when canEdit=true', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => expect(screen.getByTitle('Anclar')).toBeTruthy());
  });

  it('clicking Pin calls PUT on artifacts endpoint', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByTitle('Anclar'));
    fireEvent.click(screen.getByTitle('Anclar'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const putCall = calls.find(
        (c) => String(c[0]).includes('/artifacts') && (c[1] as RequestInit)?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('updates pin state optimistically before server response', async () => {
    let resolvePut: (v: unknown) => void = () => {};
    const pendingPut = new Promise((res) => { resolvePut = res; });

    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if (s.includes('/artifacts/available')) return fetchOk({ success: true, data: [] });
      if ((init as RequestInit | undefined)?.method === 'PUT') return pendingPut;
      return fetchOk({ success: true, data: [ARTIFACT_1] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByTitle('Anclar'));

    fireEvent.click(screen.getByTitle('Anclar'));

    // Optimistic update: button title changes to 'Unpin' immediately
    await waitFor(() => expect(screen.getByTitle('Desanclar')).toBeTruthy());

    act(() => { resolvePut({ ok: true, json: () => Promise.resolve({ success: true }) }); });
  });

  it('renders Unpin button for pinned artifact when canEdit=true', async () => {
    setupFetch([ARTIFACT_2]); // ARTIFACT_2 is pinned
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => expect(screen.getByTitle('Desanclar')).toBeTruthy());
  });

  it('does not show pin/unpin buttons when canEdit=false', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.queryByTitle('Anclar')).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// Unlink (delete)
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — unlink artifact', () => {
  it('renders Unlink button when canEdit=true', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => expect(screen.getByTitle('Desvincular')).toBeTruthy());
  });

  it('does not render Unlink button when canEdit=false', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.queryByTitle('Desvincular')).toBeNull());
  });

  it('removes artifact from list optimistically on unlink', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByTitle('Desvincular'));
    fireEvent.click(screen.getByTitle('Desvincular'));

    await waitFor(() => expect(screen.queryByText('My Website')).toBeNull());
  });

  it('sends DELETE request to artifacts endpoint', async () => {
    setupFetch([ARTIFACT_1]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByTitle('Desvincular'));
    fireEvent.click(screen.getByTitle('Desvincular'));

    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = calls.find(
        (c) => String(c[0]).includes('/artifacts') && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it('rolls back unlink when DELETE returns non-ok', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if (s.includes('/artifacts') && !s.includes('available')) {
        if ((init as RequestInit | undefined)?.method === 'DELETE') return fetchFail({});
        return fetchOk({ success: true, data: [ARTIFACT_1] });
      }
      return fetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByTitle('Desvincular'));
    fireEvent.click(screen.getByTitle('Desvincular'));

    // After rollback the item should reappear
    await waitFor(() => expect(screen.getByText('My Website')).toBeTruthy());
  });

  it('rolls back unlink when DELETE fetch throws', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const s = String(url);
      if ((init as RequestInit | undefined)?.method === 'DELETE') return Promise.reject(new Error('net'));
      if (s.includes('/artifacts')) return fetchOk({ success: true, data: [ARTIFACT_1] });
      return fetchOk({ success: true, data: [] });
    }) as unknown as typeof fetch;

    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);
    await waitFor(() => screen.getByTitle('Desvincular'));
    fireEvent.click(screen.getByTitle('Desvincular'));

    await waitFor(() => expect(screen.getByText('My Website')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Outside-click closes picker
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — outside click closes picker', () => {
  it('closes picker on mousedown outside picker element', async () => {
    setupFetch([], []);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={true} />);

    await waitFor(() => screen.getByText(/Vincular artefacto/i));
    fireEvent.click(screen.getByText(/Vincular artefacto/i));
    await waitFor(() => screen.getByPlaceholderText(/Buscar artefactos/i));

    // Simulate a mousedown on the document body (outside the picker)
    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByPlaceholderText(/Buscar artefactos/i)).toBeNull());
  });
});

// ---------------------------------------------------------------------------
// artifactUrl coverage — types that map to null (no link rendered)
// ---------------------------------------------------------------------------

describe('ProjectArtifactsTab — unknown artifact type', () => {
  it('renders artifact without link when type is unknown', async () => {
    const unknownArtifact = {
      id: 9,
      projectId: PROJECT_ID,
      artifactType: 'unknown_type',
      artifactId: 1,
      displayTitle: 'Mystery Item',
      pinned: false,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
    };
    setupFetch([unknownArtifact]);
    render(<ProjectArtifactsTab projectId={PROJECT_ID} canEdit={false} />);

    await waitFor(() => expect(screen.getByText('Mystery Item')).toBeTruthy());
    // No "Open artifact" link for unknown type
    expect(screen.queryByTitle('Abrir artefacto')).toBeNull();
  });
});
