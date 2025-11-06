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
        <h1>Quick Elections</h1>
        <p className="tagline">Enter your name to join. Admins use the special keyword.</p>
      </div>
      <label className="field">
        <span>Name or admin keyword</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. TrentAdmin"
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

