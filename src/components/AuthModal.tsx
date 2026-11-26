import React, { useState, useEffect } from 'react';
import { X, Mail, ShieldCheck, Loader, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../store/auth';

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { user, sendEmailOtp, verifyEmailOtp, requestNotificationPermission } = useAuthStore();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'sent'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      requestNotificationPermission();
      onClose();
    }
  }, [user, onClose, requestNotificationPermission]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      await sendEmailOtp(trimmedEmail);
      setStep('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send sign-in email.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.trim().length < 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      await verifyEmailOtp(email.trim(), otp.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl p-6 w-full max-w-md text-white">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold leading-tight">Sign In to DisasterHub</h2>
              <p className="text-xs text-gray-400">Receive real-time disaster alerts on your device</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
            aria-label="Close login modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === 'email' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-black/30 border border-white/15 rounded-lg px-3.5 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Sending Verification Email...' : 'Continue with Email'}</span>
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-200 flex items-start space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-white">Check your email inbox!</p>
                <p className="text-xs text-gray-300 mt-1">
                  We sent a verification email to <strong className="text-white">{email}</strong>. Click the link inside the email to log in instantly.
                </p>
              </div>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-3 pt-1 border-t border-white/10">
              <label className="block text-xs font-medium text-gray-400">
                Have a 6-digit code instead? Enter it below:
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-black/30 border border-white/15 rounded-lg px-4 py-2 text-white tracking-[0.35em] text-center text-base font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtp('');
                    setError(null);
                  }}
                  className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
                >
                  Change Email
                </button>
                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors text-sm"
                >
                  {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  <span>{loading ? 'Verifying...' : 'Verify Code'}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
