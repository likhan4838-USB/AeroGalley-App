import { useRef, useState } from 'react';
import { T } from '../theme';
// Real signed-in user from the web auth (same account as the web app).
import { getAuthUser } from '@/lib/auth';
// Avatar read/write goes through the SAME durable per-user photo store the web
// Account Settings page uses, so a photo set on either side shows on both.
import { saveProfilePhotoFromFile, clearProfilePhoto } from '@/lib/user-photo';
// Name/email edits go through the same durable per-user store, so they survive
// a re-login and show on the web app too.
import { saveProfileEdits, getProfileFields } from '@/lib/user-profile';

const BTN_BACK = { background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: T.radiusFull, width: 32, height: 32, cursor: 'pointer', color: '#fff', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

function initials(name) {
  const parts = String(name || '').replace(/[.]/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileScreen({ nav, onLogout }) {
  const user = getAuthUser();
  // Read through the profile store, not the session, so edits show whether or
  // not anyone is signed in — the mobile login does not create a session.
  const fields = getProfileFields();
  const name  = fields.name;
  const email = fields.email || '—';
  const role  = fields.role   || '—';
  const userId = fields.userId || '—';
  const isDark = nav.themeMode === 'dark';

  // Seeded from the web store; kept in state so the new avatar shows the
  // instant it is picked, without waiting for a re-mount.
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl);
  const [photoMsg, setPhotoMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const onPickPhoto = async (file) => {
    if (!file) return;
    setBusy(true);
    setPhotoMsg('');
    try {
      setPhotoUrl(await saveProfilePhotoFromFile(file));
      setPhotoMsg('Photo saved — it shows on the web app too.');
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      setPhotoMsg(
        reason === 'not-an-image' ? 'Please choose an image file.'
          : reason === 'no-user'  ? 'No signed-in user.'
          : "Couldn't read that image. Try another one.",
      );
    } finally {
      setBusy(false);
    }
  };

  const onRemovePhoto = () => {
    clearProfilePhoto();
    setPhotoUrl(undefined);
    setPhotoMsg('Photo removed.');
  };

  // ── Editable identity fields ───────────────────────────────────────────────
  // `name`/`email` above are re-read from the store on every render, so closing
  // the editor is all it takes for the new values to appear everywhere here.
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [editErr, setEditErr] = useState('');
  const [editMsg, setEditMsg] = useState('');

  const onStartEdit = () => {
    setForm({ name, email: email === '—' ? '' : email });
    setEditErr('');
    setEditMsg('');
    setEditing(true);
  };

  const onCancelEdit = () => {
    setEditing(false);
    setEditErr('');
  };

  const onSaveEdit = () => {
    try {
      saveProfileEdits(form);
      setEditing(false);
      setEditErr('');
      // Only a signed-in edit propagates to the web app; a guest edit is local.
      setEditMsg(user ? 'Profile updated — it shows on the web app too.' : 'Profile updated.');
    } catch (err) {
      const reason = err instanceof Error ? err.message : '';
      setEditErr(
        reason === 'empty-name' ? 'Name cannot be empty.'
          : reason === 'bad-email' ? 'Enter a valid email address.'
          : "Couldn't save those changes.",
      );
    }
  };

  const rowStyle = { display: 'flex', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 10, borderTop: `1px solid ${T.border}` };
  const labelStyle = { fontSize: 12, color: T.textTertiary, fontFamily: T.fontBody };
  const valueStyle = { fontSize: 12, fontWeight: 600, color: T.textPrimary, fontFamily: T.fontBody };
  const inputStyle = { width: '100%', boxSizing: 'border-box', marginTop: 5, border: `1px solid ${T.border}`, borderRadius: T.radiusMd, padding: '8px 10px', fontSize: 12, fontFamily: T.fontBody, outline: 'none', background: T.bgSubtle, color: T.textPrimary };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bgBase, overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ background: T.topbarGradient, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => nav.goBack()} style={BTN_BACK}>←</button>
        <div style={{ fontFamily: T.fontBody, fontSize: 15, fontWeight: 700, color: '#fff' }}>Profile</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 24px' }}>
        {/* Identity */}
        <div style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: '18px 14px', boxShadow: T.shadowSm, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          {/* Tap the avatar to replace it. No `capture` attribute — the OS sheet
              then offers both the camera and the photo library. */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label={photoUrl ? 'Change profile photo' : 'Upload profile photo'}
            style={{ position: 'relative', width: 66, height: 66, borderRadius: T.radiusFull, background: T.buttonGradient, border: 'none', padding: 0, overflow: 'visible', cursor: busy ? 'default' : 'pointer', flexShrink: 0, opacity: busy ? 0.6 : 1 }}
          >
            <span style={{ position: 'absolute', inset: 0, borderRadius: T.radiusFull, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, fontWeight: 700, fontFamily: T.fontBody }}>
              {photoUrl
                ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : initials(name)}
            </span>
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: T.radiusFull, background: T.bgSurface, border: `1px solid ${T.border}`, boxShadow: T.shadowSm, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
              📷
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => { onPickPhoto(e.target.files?.[0] ?? null); e.target.value = ''; }}
          />

          <div style={{ fontSize: 17, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody, marginTop: 10 }}>{name}</div>
          <span style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: T.statusApproved, background: T.statusApprovedBg, padding: '3px 10px', borderRadius: T.radiusFull, fontFamily: T.fontBody }}>{role}</span>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ padding: '7px 14px', borderRadius: T.radiusFull, border: `1px solid ${T.border}`, background: T.bgSurface, color: T.textSecondary, fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: busy ? 'default' : 'pointer' }}>
              {busy ? 'Saving…' : photoUrl ? 'Change photo' : 'Upload photo'}
            </button>
            {photoUrl && !busy && (
              <button onClick={onRemovePhoto}
                style={{ padding: '7px 14px', borderRadius: T.radiusFull, border: `1px solid ${T.statusRejected}40`, background: T.bgSurface, color: T.statusRejected, fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
          {photoMsg && (
            <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 8 }}>{photoMsg}</div>
          )}
        </div>

        {/* Account details — Full Name and Email are editable in place; User ID
            and Role come from the credential table and stay read-only. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '20px 2px 8px' }}>
          <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Account</div>
          {!editing && (
            <button onClick={onStartEdit}
              style={{ padding: '4px 12px', borderRadius: T.radiusFull, border: `1px solid ${T.border}`, background: T.bgSurface, color: T.primary, fontSize: 11, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
              Edit
            </button>
          )}
        </div>
        <div style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, padding: '2px 14px', boxShadow: T.shadowSm }}>
          {editing ? (
            <>
              <div style={{ ...rowStyle, borderTop: 'none', display: 'block' }}>
                <label style={labelStyle} htmlFor="profile-name">Full Name</label>
                <input id="profile-name" type="text" value={form.name} placeholder="Your full name"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={inputStyle} />
              </div>
              <div style={{ ...rowStyle, display: 'block' }}>
                <label style={labelStyle} htmlFor="profile-email">Email</label>
                <input id="profile-email" type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                  value={form.email} placeholder="name@usbair.com"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle} />
              </div>
            </>
          ) : (
            <>
              <div style={{ ...rowStyle, borderTop: 'none' }}>
                <span style={labelStyle}>Full Name</span><span style={valueStyle}>{name}</span>
              </div>
              <div style={rowStyle}><span style={labelStyle}>Email</span><span style={valueStyle}>{email || '—'}</span></div>
            </>
          )}
          <div style={rowStyle}><span style={labelStyle}>User ID</span><span style={valueStyle}>{userId}</span></div>
          <div style={rowStyle}><span style={labelStyle}>Role</span><span style={valueStyle}>{role}</span></div>

          {editing && (
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12, paddingBottom: 12 }}>
              {editErr && (
                <div style={{ fontSize: 11, color: T.statusRejected, fontFamily: T.fontBody, marginBottom: 8 }}>{editErr}</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onSaveEdit}
                  style={{ flex: 1, padding: '9px 0', borderRadius: T.radiusMd, border: 'none', background: T.buttonGradient, color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
                  Save Changes
                </button>
                <button onClick={onCancelEdit}
                  style={{ flex: 1, padding: '9px 0', borderRadius: T.radiusMd, border: `1px solid ${T.border}`, background: T.bgSurface, color: T.textSecondary, fontSize: 12, fontWeight: 700, fontFamily: T.fontBody, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        {!editing && editMsg && (
          <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, margin: '8px 2px 0' }}>{editMsg}</div>
        )}

        {/* Appearance */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textTertiary, fontFamily: T.fontBody, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '20px 2px 8px' }}>Appearance</div>
        <div style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: T.radiusLg, boxShadow: T.shadowSm, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: T.radiusMd, background: T.bgSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              {isDark ? '🌙' : '☀️'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>Dark Mode</div>
              <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 2 }}>{isDark ? 'Dark theme is on' : 'Switch to a darker interface'}</div>
            </div>
            {/* Toggle */}
            <button
              onClick={() => nav.setTheme(isDark ? 'light' : 'dark')}
              aria-label="Toggle dark mode"
              style={{ width: 46, height: 26, borderRadius: T.radiusFull, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 3, background: isDark ? T.primary : T.borderStrong, display: 'flex', justifyContent: isDark ? 'flex-end' : 'flex-start', alignItems: 'center', transition: 'background 150ms ease' }}
            >
              <span style={{ width: 20, height: 20, borderRadius: T.radiusFull, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)' }} />
            </button>
          </div>
          {/* Theme Center — colour presets + font size, mirroring the web */}
          <div
            onClick={() => nav.navigate('theme')}
            style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, borderTop: `1px solid ${T.border}`, cursor: 'pointer' }}
          >
            <div style={{ width: 38, height: 38, borderRadius: T.radiusMd, background: T.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
              🎨
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, fontFamily: T.fontBody }}>Theme & Appearance</div>
              <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.fontBody, marginTop: 2 }}>Colour theme · font size</div>
            </div>
            <span style={{ width: 16, height: 16, borderRadius: T.radiusFull, background: T.buttonGradient, flexShrink: 0, border: `2px solid ${T.border}` }} />
            <span style={{ fontSize: 18, color: T.textTertiary, lineHeight: 1 }}>›</span>
          </div>
        </div>

        {/* Sign out */}
        {onLogout && (
          <button onClick={onLogout}
            style={{ width: '100%', marginTop: 24, padding: '13px 0', background: T.bgSurface, border: `1px solid ${T.statusRejected}`, borderRadius: T.radiusMd, fontSize: 14, fontWeight: 700, color: T.statusRejected, fontFamily: T.fontBody, cursor: 'pointer' }}>
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
