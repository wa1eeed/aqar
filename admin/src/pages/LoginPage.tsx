import { useState, type FormEvent } from 'react';
import { Logo } from '../components/Logo';

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Staff authentication (login, 2FA, refresh) is implemented in Phase 1 (docs/03).
    setError('تسجيل دخول الفريق غير مفعّل بعد في هذه النسخة.');
  }

  return (
    <div className="login-wrap">
      <div className="login-form">
        <form className="box" onSubmit={onSubmit} noValidate>
          <Logo size={44} to="/login" />
          <h1 style={{ fontSize: 30, marginTop: 20 }}>تسجيل الدخول</h1>
          <p className="muted">ادخل ببيانات حسابك في فريق العمل.</p>
          {error ? (
            <div className="form-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="email">البريد الإلكتروني</label>
            <input id="email" className="input" type="email" autoComplete="username" dir="ltr" required />
          </div>
          <div className="field">
            <label htmlFor="password">كلمة المرور</label>
            <input id="password" className="input" type="password" autoComplete="current-password" required />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className="check">
              <input type="checkbox" />
              تذكرني
            </label>
            <a className="link" style={{ fontSize: 14 }} href="#forgot">
              نسيت كلمة المرور؟
            </a>
          </div>
          <button className="btn btn--primary btn--block" type="submit">
            دخول
          </button>
        </form>
      </div>
      <div className="login-art">
        <div>
          <span className="eyebrow" style={{ color: 'var(--gold)' }}>
            منصة منزلة العقارية
          </span>
          <h2 style={{ fontSize: 44, marginTop: 16, lineHeight: 1.3 }}>
            كل عقاراتك وطلباتك
            <br />
            وعملاؤك في مكان واحد
          </h2>
        </div>
        <img
          src="/assets/img/photos/villa-modern.jpg"
          alt=""
          style={{ borderRadius: 24, height: 340, objectFit: 'cover', width: '100%', opacity: 0.9 }}
        />
        <p style={{ opacity: 0.7, fontSize: 13 }}>اتصال مشفّر · مصادقة ثنائية للمدراء</p>
      </div>
    </div>
  );
}
