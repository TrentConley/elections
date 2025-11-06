import { useCallback, useEffect, useMemo, useState } from 'react';
import LoginForm from './components/LoginForm.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import PollBoard from './components/PollBoard.jsx';

const STORAGE_KEY = 'quick-election-session';
const VOTE_STORAGE_KEY = 'quick-election-votes';
const ACCESS_CODES_KEY = 'quick-election-access-codes';
const API_BASE = import.meta.env.VITE_API_URL ?? '';

const initialSession = () => {
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (!fromStorage) {
      return null;
    }
    const parsed = JSON.parse(fromStorage);
    if (!parsed?.name || !parsed?.role) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Unable to restore session', error);
    return null;
  }
};

const initialVotes = () => {
  try {
    const stored = localStorage.getItem(VOTE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Unable to restore vote history', error);
    return {};
  }
};

const initialAccessCodes = () => {
  try {
    const stored = localStorage.getItem(ACCESS_CODES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Unable to restore poll access', error);
    return {};
  }
};

export default function App() {
  const [session, setSession] = useState(initialSession);
  const [polls, setPolls] = useState([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsError, setPollsError] = useState('');
  const [authError, setAuthError] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [voteHistory, setVoteHistory] = useState(initialVotes);
  const [pollAccess, setPollAccess] = useState(initialAccessCodes);
  const [joinPending, setJoinPending] = useState(false);
  const [joinError, setJoinError] = useState('');

  const isAdmin = session?.role === 'admin';

  const headers = useMemo(() => {
    const base = { 'Content-Type': 'application/json' };
    if (isAdmin && session?.admin_key) {
      return { ...base, 'X-Admin-Key': session.admin_key };
    }
    return base;
  }, [isAdmin, session]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  useEffect(() => {
    localStorage.setItem(VOTE_STORAGE_KEY, JSON.stringify(voteHistory));
  }, [voteHistory]);

  useEffect(() => {
    localStorage.setItem(ACCESS_CODES_KEY, JSON.stringify(pollAccess));
  }, [pollAccess]);

  const fetchPolls = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setPollsError('');
    setPollsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/polls`, {
        headers,
      });
      if (!response.ok) {
        throw new Error('Failed to load polls');
      }
      const data = await response.json();
      const openPolls = data.filter((poll) => poll.status === 'open');
      setPolls(openPolls);
    } catch (error) {
      setPollsError(error.message || 'Unable to fetch polls');
    } finally {
      setPollsLoading(false);
    }
  }, [headers, isAdmin]);

  const refreshAccessiblePolls = useCallback(async () => {
    if (!session || isAdmin) {
      return;
    }
    const entries = Object.entries(pollAccess);
    if (entries.length === 0) {
      setPolls([]);
      return;
    }
    setPollsLoading(true);
    setPollsError('');
    try {
      const results = await Promise.all(entries.map(async ([pollId, code]) => {
        try {
          const response = await fetch(`${API_BASE}/api/polls/access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });
          if (!response.ok) {
            if (response.status === 404) {
              setPollAccess((prev) => {
                if (!prev[pollId]) {
                  return prev;
                }
                const next = { ...prev };
                delete next[pollId];
                return next;
              });
              return null;
            }
            const detail = await response.json().catch(() => ({}));
            throw new Error(detail?.detail || 'Unable to load poll');
          }
          return await response.json();
        } catch (error) {
          if (error instanceof Error) {
            throw error;
          }
          throw new Error('Unable to load poll');
        }
      }));
      const nextPolls = results.filter(Boolean);
      setPolls(nextPolls);
    } catch (error) {
      setPollsError(error.message || 'Unable to load polls');
    } finally {
      setPollsLoading(false);
    }
  }, [API_BASE, isAdmin, pollAccess, session]);

  useEffect(() => {
    if (!session) {
      return;
    }
    if (isAdmin) {
      fetchPolls();
      const interval = setInterval(fetchPolls, 5000);
      return () => clearInterval(interval);
    }
    refreshAccessiblePolls();
    const interval = setInterval(refreshAccessiblePolls, 5000);
    return () => clearInterval(interval);
  }, [session, isAdmin, fetchPolls, refreshAccessiblePolls]);

  const handleLogin = useCallback(async (name) => {
    setAuthError('');
    setActionMessage('');
    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        throw new Error('Unable to sign in');
      }
      const data = await response.json();
      setSession(data);
      setVoteHistory((prev) => (
        data.role === 'admin' ? {} : prev
      ));
    } catch (error) {
      setAuthError(error.message || 'Sign-in failed');
    }
  }, []);

  const handleLogout = useCallback(() => {
    setSession(null);
    setPolls([]);
    setVoteHistory({});
    setPollAccess({});
    setActionMessage('');
    setJoinError('');
    setJoinPending(false);
  }, []);

  const handleCreatePoll = useCallback(
    async ({ title, options, accessCode }) => {
      if (!isAdmin) {
        return;
      }
      setCreatingPoll(true);
      setActionMessage('');
      setPollsError('');
      try {
        const response = await fetch(`${API_BASE}/api/polls`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ title, options, access_code: accessCode }),
        });
        if (!response.ok) {
          const { detail } = await response.json();
          throw new Error(detail || 'Unable to create poll');
        }
        const poll = await response.json();
        setPolls((prev) => [poll, ...prev]);
        setActionMessage('Poll launched');
      } catch (error) {
        setPollsError(error.message || 'Unable to create poll');
        throw error;
      } finally {
        setCreatingPoll(false);
      }
    },
    [headers, isAdmin],
  );

  const handleClosePoll = useCallback(
    async (pollId) => {
      if (!isAdmin) {
        return;
      }
      setActionMessage('');
      try {
        const response = await fetch(`${API_BASE}/api/polls/${pollId}/close`, {
          method: 'POST',
          headers,
        });
        if (!response.ok) {
          const { detail } = await response.json();
          throw new Error(detail || 'Unable to close poll');
        }
        const updated = await response.json();
        setPolls((prev) => prev.filter((poll) => poll.id !== updated.id));
        setVoteHistory((prev) => {
          if (!prev[pollId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[pollId];
          return next;
        });
        setPollAccess((prev) => {
          if (!prev[pollId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[pollId];
          return next;
        });
        setActionMessage('Poll closed');
      } catch (error) {
        setPollsError(error.message || 'Unable to close poll');
        throw error;
      }
    },
    [headers, isAdmin],
  );

  const handleVote = useCallback(
    async (pollId, optionId) => {
      if (!session?.name) {
        return;
      }
      setPollsError('');
      try {
        const response = await fetch(`${API_BASE}/api/polls/${pollId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voter_name: session.name, option_id: optionId }),
        });
        if (!response.ok) {
          const { detail } = await response.json();
          throw new Error(detail || 'Unable to vote');
        }
        const updated = await response.json();
        setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)));
        setVoteHistory((prev) => ({ ...prev, [pollId]: optionId }));
        setActionMessage('Vote saved');
      } catch (error) {
        setPollsError(error.message || 'Unable to vote');
      }
    },
    [session],
  );

  const handleJoinPoll = useCallback(async (code) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setJoinError('Code is required');
      return;
    }
    setJoinError('');
    setJoinPending(true);
    setPollsError('');
    try {
      const response = await fetch(`${API_BASE}/api/polls/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized }),
      });
      if (!response.ok) {
        const { detail } = await response.json();
        throw new Error(detail || 'Invalid code');
      }
      const poll = await response.json();
      setPolls((prev) => {
        const existing = prev.find((item) => item.id === poll.id);
        if (existing) {
          return prev.map((item) => (item.id === poll.id ? poll : item));
        }
        return [poll, ...prev];
      });
      setPollAccess((prev) => ({ ...prev, [poll.id]: normalized }));
      setActionMessage('Poll unlocked');
    } catch (error) {
      setJoinError(error.message || 'Invalid code');
    } finally {
      setJoinPending(false);
    }
  }, [API_BASE]);

  const content = () => {
    if (!session) {
      return (
        <div className="card">
          <LoginForm onSubmit={handleLogin} error={authError} />
        </div>
      );
    }

    return (
      <>
        <header className="app-header">
          <div>
            <h1>Beta Elections</h1>
          </div>
          <div className="session-meta">
            <span>{session.role === 'admin' ? 'Admin' : 'Participant'}: {session.name}</span>
            <button className="text-button" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        {actionMessage && <div className="toast success">{actionMessage}</div>}
        {pollsError && <div className="toast error">{pollsError}</div>}

        <div className="layout">
          {isAdmin && (
            <AdminPanel
              disabled={creatingPoll}
              onCreatePoll={handleCreatePoll}
              onClosePoll={handleClosePoll}
              polls={polls}
            />
          )}

          <PollBoard
            polls={polls}
            loading={pollsLoading}
            onVote={handleVote}
            voteHistory={voteHistory}
            isAdmin={isAdmin}
            onJoinPoll={handleJoinPoll}
            joinPending={joinPending}
            joinError={joinError}
            clearJoinError={() => setJoinError('')}
          />
        </div>
      </>
    );
  };

  return (
    <div className="app-shell">
      <main>{content()}</main>
      <footer>
        <p>FastAPI · React · Railway</p>
      </footer>
    </div>
  );
}

