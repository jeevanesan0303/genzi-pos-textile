import React, { useRef, useState } from 'react';
import { ArrowUpRight, ArrowLeft, Eye, EyeOff, Mail, LockKeyhole, Check, Sparkles, Cloud, LoaderCircle } from 'lucide-react';
import './LoginView.css';

const SESSION_KEY = 'genzi_demo_user'; // Matches the existing App.jsx and logout.

/** Optional backend callbacks:
 * signIn({ email, password }) => Promise<{ name: string }>
 * requestPasswordReset(email) => Promise<void>
 * Without signIn this preserves the uploaded project's frontend workspace entry.
 */
export default function Login({ setUser, setModal, signIn, requestPasswordReset }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const reset = mode === 'reset';

  function changeMode(next) {
    setMode(next);
    setErrors({});
    setNotice('');
    setPassword('');
    setVisible(false);
    emailRef.current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const address = email.trim();
    const next = {};
    if (!address || !emailRef.current?.validity.valid) next.email = 'Enter a valid email address.';
    if (!reset && !password.trim()) next.password = 'Enter your password.';
    setErrors(next);
    setNotice('');
    if (Object.keys(next).length) {
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    try {
      if (reset) {
        if (typeof requestPasswordReset !== 'function') {
          setErrors({ form: 'Password reset is not connected yet. Please contact your store administrator.' });
          return;
        }
        await requestPasswordReset(address);
        setNotice('If this email has an account, password reset instructions will be sent.');
        return;
      }
      if (typeof signIn !== 'function') {
  throw new Error(
    'Login API is not connected. Check the signIn prop in App.jsx.'
  );
}

const account = await signIn({
  email: address,
  password
});

if (
  !account ||
  typeof account.name !== 'string' ||
  !account.name.trim()
) {
  throw new Error('Invalid sign-in response from the server.');
}

const name = account.name.trim();
      if (typeof setUser !== 'function') throw new Error('Missing setUser');
      try {
        sessionStorage.setItem(SESSION_KEY, name);
      } catch {
        setErrors({ form: 'Browser session storage is unavailable. Allow storage and try again.' });
        return;
      }
      setPassword('');
      setModal?.(null);
      setUser(name);
    } catch (error) {
  setErrors({
    form: error instanceof Error
      ? error.message
      : reset
        ? 'Unable to request a reset. Please try again.'
        : 'Unable to sign in. Please try again.'
  });
} finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="gc-login">
      <aside className="gc-story" aria-label="Gen Zi Corner boutique">
        <div className="reference-brand"><img src="/assets/logo.png" alt="Gen Zi Corner"/><h1>GEN ZI CORNER</h1><h2>Great style. Better business.</h2><p>Your everyday workspace for sales, stock and customers.</p></div><img className="reference-logo" src="/assets/logo.png" alt=""/><div className="reference-features"><span>Smart POS</span><span>Sales Analytics</span><span>Customer Loyalty</span><span>Offline Ready</span></div>
      </aside>

      <section className="gc-access" aria-labelledby="gc-login-title">
        <div className="gc-access-top"><span className="gc-mini-brand">GEN ZI <b>CORNER</b></span><span className="gc-workspace-tag"><span /> Store workspace</span></div>
        <div className="gc-form-wrap">
          <div className="gc-form-icon"><Sparkles size={25} strokeWidth={1.5} /></div>
          <span className="gc-overline">{reset ? 'LET’S GET YOU BACK IN' : 'WELCOME TO GEN ZI CORNER'}</span>
          <p className="gc-description">{reset ? 'Enter your account email to request a password reset.' : 'Your store is ready. Let’s make today a good one.'}</p>

          <form className="gc-form" onSubmit={submit} noValidate aria-busy={busy}>
            <div className="gc-field">
              <label htmlFor="gc-email">Email address</label>
              <div className={`gc-input ${errors.email ? 'gc-invalid' : ''}`}>
                <Mail size={19} aria-hidden="true" />
                <input ref={emailRef} id="gc-email" name="email" type="email" autoComplete={reset ? 'email' : 'username'} autoCapitalize="none" spellCheck={false} placeholder="you@genzicorner.lk" value={email} disabled={busy} required aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'gc-email-error' : undefined} onChange={event => { setEmail(event.target.value); setErrors(current => ({ ...current, email: '', form: '' })); setNotice(''); }} />
              </div>
              {errors.email && <p className="gc-error" id="gc-email-error">{errors.email}</p>}
            </div>

            {!reset && <div className="gc-field">
              <div className="gc-label-row"><label htmlFor="gc-password">Password</label><button type="button" className="gc-text-button" disabled={busy} onClick={() => changeMode('reset')}></button></div>
              <div className={`gc-input ${errors.password ? 'gc-invalid' : ''}`}>
                <LockKeyhole size={19} aria-hidden="true" />
                <input ref={passwordRef} id="gc-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} disabled={busy} required aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'gc-password-error' : undefined} onChange={event => { setPassword(event.target.value); setErrors(current => ({ ...current, password: '', form: '' })); }} />
                <button type="button" className="gc-eye" disabled={busy} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} aria-controls="gc-password" onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
              </div>
              {errors.password && <p className="gc-error" id="gc-password-error">{errors.password}</p>}
            </div>}

            {errors.form && <div className="gc-alert" role="alert">{errors.form}</div>}
            {notice && <div className="gc-success" role="status"><Check size={18} /><span>{notice}</span></div>}
            <button className="gc-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="gc-spin" size={19} /> Please wait…</> : <>{reset ? 'Send reset instructions' : 'Sign in to workspace'}<ArrowUpRight size={20} /></>}</button>
            {reset && <button className="gc-back" type="button" disabled={busy} onClick={() => changeMode('login')}><ArrowLeft size={16} /> Back to sign in</button>}
          </form>
          <div className="gc-form-foot"><span /> Built for the way you work <span /></div>
         <div className="gc-developer-credit">
  <span className="gc-developer-label">Developed By</span>
  <strong>Xyphora Prime (Pvt) Ltd</strong>
  <span className="gc-developer-line" aria-hidden="true" />
</div>
        </div>
        <footer className="gc-access-footer"><span>© {new Date().getFullYear()} Gen Zi Corner</span><span>Powered by Xyphora Prime</span></footer>
      </section>
    </main>
  );
}
