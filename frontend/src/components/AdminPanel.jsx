import { useMemo, useState } from 'react';

const emptyOptionRow = () => ['', ''];

export default function AdminPanel({ disabled, onCreatePoll, onClosePoll, polls }) {
  const [title, setTitle] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [accessCode, setAccessCode] = useState('');
  const [formError, setFormError] = useState('');

  const openPolls = useMemo(() => polls.filter((poll) => poll.status === 'open'), [polls]);
  const closedPolls = useMemo(() => polls.filter((poll) => poll.status === 'closed'), [polls]);

  const handleOptionChange = (index, next) => {
    setOptions((prev) => {
      const nextOptions = [...prev];
      nextOptions[index] = next;
      return nextOptions;
    });
  };

  const addOptionField = () => setOptions((prev) => [...prev, '']);

  const resetForm = () => {
    setTitle('');
    setOptions(emptyOptionRow());
    setAccessCode('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    try {
      await onCreatePoll({ title, options, accessCode });
      resetForm();
    } catch (error) {
      setFormError(error.message || 'Unable to create poll');
    }
  };

  const handleClose = async (pollId) => {
    try {
      await onClosePoll(pollId);
    } catch (error) {
      setFormError(error.message || 'Unable to close poll');
    }
  };

  return (
    <section className="sidebar">
      <div className="card">
        <h2>New poll</h2>
        <p className="helper">Title plus two options. Keep it sharp.</p>
        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Access code</span>
            <input
              type="text"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.toUpperCase())}
              placeholder="Room code"
              required
              maxLength={32}
            />
          </label>
          <label className="field">
            <span>Title</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Poll headline"
              required
            />
          </label>

          <div className="stack small">
            {options.map((option, index) => (
              <label className="field" key={`option-${index}`}>
                <span>Option {index + 1}</span>
                <input
                  type="text"
                  value={option}
                  onChange={(event) => handleOptionChange(index, event.target.value)}
                  placeholder="Option text"
                />
              </label>
            ))}
          </div>

          <div className="actions">
            <button className="text-button" type="button" onClick={addOptionField}>
              Add option
            </button>
            <div className="actions">
              <button className="text-button" type="button" onClick={resetForm}>
                Clear
              </button>
              <button className="primary" type="submit" disabled={disabled}>
                {disabled ? 'Creating…' : 'Launch'}
              </button>
            </div>
          </div>
          {formError && <p className="feedback error">{formError}</p>}
        </form>
      </div>

      <div className="card">
        <h2>Open polls</h2>
        {openPolls.length === 0 ? (
          <p className="helper">None running yet.</p>
        ) : (
          <ul className="poll-list">
            {openPolls.map((poll) => {
              const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
              return (
                <li key={poll.id} className="poll-row">
                  <div>
                    <p className="poll-title">{poll.title}</p>
                    <p className="helper">{totalVotes} vote{totalVotes === 1 ? '' : 's'} · Code {poll.access_code}</p>
                  </div>
                  <button className="text-button" onClick={() => handleClose(poll.id)}>
                    Close poll
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {closedPolls.length > 0 && (
        <div className="card">
          <h2>Closed polls</h2>
          <ul className="poll-list muted">
            {closedPolls.map((poll) => (
              <li key={poll.id} className="poll-row">
                <div>
                  <p className="poll-title">{poll.title}</p>
                  <p className="helper">Closed</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

