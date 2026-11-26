import React, { useState } from 'react';
import { X, Phone, ShieldCheck, Loader } from 'lucide-react';
import { useAuthStore } from '../store/auth';

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { sendPhoneOtp, verifyPhoneOtp } = useAuthStore();
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setError('Please enter a valid phone number with country code (e.g. +919876543210).');
      return;
    }

    setLoading(true);
    try {
      await sendPhoneOtp(normalized);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (otp.trim().length < 6) {
      setError('Please enter the 6-digit OTP.');
      return;
    }

    setLoading(true);
    try {
      await verifyPhoneOtp(phone.trim(), otp.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl p-6 w-full max-w-md text-white">
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center space-x-2">
            <Phone className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-bold">Phone Alert Login</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
            aria-label="Close login modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-4">
          Apne phone number se login karein taaki disaster alerts seedha aapke device par mil sakein.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/40 text-red-200 rounded-lg text-sm">
            {error}
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Phone Number (with country code)
              </label>
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full bg-black/30 border border-white/15 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors"
            >
              {loading && <Loader className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Sending OTP...' : 'Send OTP'}</span>
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Enter 6-digit OTP sent to {phone}
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                className="w-full bg-black/30 border border-white/15 rounded-lg px-4 py-2.5 text-white tracking-widest text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  setError(null);
                }}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
              >
                Change Number
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors"
              >
                {loading ? <Loader className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>{loading ? 'Verifying...' : 'Verify & Enable Alerts'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
