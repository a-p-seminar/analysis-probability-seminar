import React, { useEffect, useRef, useState } from 'react';
import { api } from './api.mjs';
import { newPasswordError } from '../shared/password-policy.mjs';

export function PasswordDialog({ onClose, onChanged, onSessionExpired }) {
  const dialog = useRef(null);
  const pending = useRef(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function close() {
    if (pending.current) return;
    // Close while connected so the browser can restore focus to the opener.
    dialog.current.close();
    onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const validation = newPasswordError(newPassword);
    if (validation) { setError(validation); return; }
    if (newPassword !== confirmation) { setError('两次输入的新密码不一致。'); return; }
    if (newPassword === currentPassword) { setError('新密码不能与当前密码相同。'); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      await api('/admin/password', { method: 'POST', data: { currentPassword, newPassword } });
      setCurrentPassword(''); setNewPassword(''); setConfirmation('');
      dialog.current.close();
      onChanged();
    } catch (err) {
      if (err.status === 401 || err.status === 409) { dialog.current.close(); onSessionExpired(); }
      else setError(err.message);
    } finally { pending.current = false; setBusy(false); }
  }

  return <dialog ref={dialog} className="password-dialog" aria-labelledby="password-dialog-title" aria-describedby="password-dialog-note" onCancel={event => { event.preventDefault(); close(); }}>
    <h2 id="password-dialog-title">修改密码</h2>
    <p id="password-dialog-note">修改后，所有已登录页面都需要使用新密码重新登录。</p>
    <form className="login-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <label>当前密码<input type="password" autoComplete="current-password" required maxLength={1024} value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoFocus/></label>
        <div className="password-field"><label>新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} aria-describedby="new-password-hint"/></label><small id="new-password-hint">12–128 个字符，可使用字母、数字和符号。</small></div>
        <label>确认新密码<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)}/></label>
      </fieldset>
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="button-row"><button type="button" className="outline-button" disabled={busy} onClick={close}>取消</button><button type="submit" className="primary-button" disabled={busy}>{busy ? '正在修改…' : '保存新密码'}</button></div>
    </form>
  </dialog>;
}
