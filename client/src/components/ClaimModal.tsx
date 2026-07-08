import { useState } from 'react';
import { X, Gift } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Clip } from './MasonryGrid';

interface ClaimModalProps {
  clip: Clip | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (clipId: string, guestLabel: string) => Promise<void>;
}

export default function ClaimModal({
  clip,
  isOpen,
  onClose,
  onConfirm
}: ClaimModalProps) {
  const [guestLabel, setGuestLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!clip) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(clip.id, guestLabel);
      setGuestLabel('');
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
          />

          {/* Modal Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl glassmorphism border border-white/20 shadow-2xl p-6 z-10"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-600 transition-colors"
            >
              <X size={18} />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 rounded-2xl bg-accent-berry/10 text-accent-berry">
                <Gift size={20} />
              </div>
              <div>
                <h3 className="font-serif text-xl text-text-primary-light dark:text-text-primary-dark">
                  Claim Gift
                </h3>
                <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                  Claiming prevents others from buying the same item.
                </p>
              </div>
            </div>

            {/* Product Summary */}
            <div className="flex gap-4 p-3 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/30 border border-neutral-200/30 dark:border-neutral-800/30 mb-5">
              {clip.imageUrl && (
                <img
                  src={clip.imageUrl}
                  alt={clip.title}
                  className="w-16 h-16 object-cover rounded-xl"
                />
              )}
              <div className="flex flex-col justify-center">
                <span className="text-[10px] uppercase font-semibold tracking-wider text-text-muted-light dark:text-text-muted-dark">
                  {clip.storeName}
                </span>
                <h4 className="font-sans text-sm font-medium line-clamp-2 text-text-primary-light dark:text-text-primary-dark">
                  {clip.title}
                </h4>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="guest-name"
                  className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1.5"
                >
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  id="guest-name"
                  value={guestLabel}
                  onChange={(e) => setGuestLabel(e.target.value)}
                  placeholder="e.g. Aunt Sarah (so they know it's from you)"
                  className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none focus:ring-1 focus:ring-accent-berry"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent-berry hover:bg-accent-berryHover disabled:opacity-50 text-white text-sm font-medium transition-colors shadow-sm"
                >
                  {isSubmitting ? 'Claiming...' : 'Confirm Claim'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
