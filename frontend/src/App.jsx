import { useCallback, useEffect, useMemo, useState } from 'react';
import LoginForm from './components/LoginForm.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import PollBoard from './components/PollBoard.jsx';

const STORAGE_KEY = 'quick-election-session';
const VOTE_STORAGE_KEY = 'quick-election-votes';
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

export default function App() {
  const [session, setSession] = useState(initialSession);
  const [polls, setPolls] = useState([]);
  const [pollsLoading, setPollsLoading] = useState(false);
  const [pollsError, setPollsError] = useState('');
  const [authError, setAuthError] = useState('');
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [voteHistory, setVoteHistory] = useState(initialVotes);

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

  const fetchPolls = useCallback(async () => {
    setPollsError('');
    setPollsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/polls`);
      if (!response.ok) {
        throw new Error('Failed to load polls');
      }
      const data = await response.json();
      setPolls(data);
    } catch (error) {
      setPollsError(error.message || 'Unable to fetch polls');
    } finally {
      setPollsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }
    fetchPolls();
    const interval = setInterval(fetchPolls, 5000);
    return () => clearInterval(interval);
  }, [session, fetchPolls]);

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
    setActionMessage('');
  }, []);

  const handleCreatePoll = useCallback(
    async ({ title, options }) => {
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
          body: JSON.stringify({ title, options }),
        });
        if (!response.ok) {
          const { detail } = await response.json();
          throw new Error(detail || 'Unable to create poll');
        }
        const poll = await response.json();
        setPolls((prev) => [poll, ...prev]);
        setActionMessage('Poll created');
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
        setPolls((prev) => prev.map((poll) => (poll.id === updated.id ? updated : poll)));
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
        setActionMessage('Vote submitted');
      } catch (error) {
        setPollsError(error.message || 'Unable to vote');
      }
    },
    [session],
  );

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
            <h1>Quick Elections</h1>
            <p className="tagline">Log in, launch a poll, watch the numbers live.</p>
          </div>
          <div className="session-meta">
            <span>{session.role === 'admin' ? 'Admin' : 'Participant'}: {session.name}</span>
            <button className="text-button" onClick={handleLogout}>
              Log out
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
          />
        </div>
      </>
    );
  };

  return (
    <div className="app-shell">
      <main>{content()}</main>
      <footer>
        <p>Hosted on Railway • FastAPI + React</p>
      </footer>
    </div>
  );
}

