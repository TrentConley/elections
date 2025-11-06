import { useState } from 'react';

export default function LoginForm({ onSubmit, error }) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) {
      return;
    }
    setPending(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <div className="stack small">
        <h1>Beta Elections</h1>
        <p className="tagline">Sign in and start.</p>
      </div>
      <label className="field">
        <span>Full Name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Eg Trent Conley"
          autoComplete="off"
          required
        />
      </label>
      {error && <p className="feedback error">{error}</p>}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Continue'}
      </button>
    </form>
  );
}

