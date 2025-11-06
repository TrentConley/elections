import { useMemo } from 'react';

export default function PollBoard({ polls, loading, onVote, voteHistory, isAdmin }) {
  const sortedPolls = useMemo(() => {
    const next = [...polls];
    return next.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [polls]);

  if (!loading && sortedPolls.length === 0) {
    return (
      <section className="card fill">
        <h2>Ready</h2>
        <p className="helper">No polls yet. Start one to begin.</p>
      </section>
    );
  }

  return (
    <section className="card fill">
      <div className="list-header">
        <h2>Polls</h2>
        {loading && <span className="helper">Updating…</span>}
      </div>
      <div className="poll-grid">
        {sortedPolls.map((poll) => {
          const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
          const hasVoted = Boolean(voteHistory[poll.id]);
          const voterChoice = voteHistory[poll.id];
          const statusLabel = poll.status === 'open' ? 'Open' : 'Closed';

          return (
            <article key={poll.id} className={`poll-card ${poll.status}`}>
              <header>
                <div>
                  <h3>{poll.title}</h3>
                  <p className="helper">{statusLabel} · {totalVotes} vote{totalVotes === 1 ? '' : 's'}</p>
                </div>
                {isAdmin && poll.status === 'open' && (
                  <span className="badge">Admin</span>
                )}
              </header>

              <ul className="option-list">
                {poll.options.map((option) => {
                  const percent = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0;
                  const isSelected = voterChoice === option.id;
                  const disabled = poll.status !== 'open' || (hasVoted && !isSelected);

                  return (
                    <li key={option.id} className={`option-row ${isSelected ? 'selected' : ''}`}>
                      <div className="option-copy">
                        <span className="label">{option.label}</span>
                        <span className="count">{option.votes} ({percent}%)</span>
                      </div>
                      <div className="option-footer">
                        <div className="progress">
                          <div className="progress-bar" style={{ width: `${percent}%` }} />
                        </div>
                        {poll.status === 'open' && (
                          <button
                            className="ghost"
                            type="button"
                            disabled={disabled}
                            onClick={() => onVote(poll.id, option.id)}
                          >
                            {isSelected ? 'Voted' : hasVoted ? 'Locked' : 'Vote'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}

