import { useState, useEffect } from 'react';
import { ExternalLink, Check, Trash2, Edit } from 'lucide-react';
import { motion } from 'framer-motion';

export interface Clip {
  id: string;
  boardId: string;
  title: string;
  price: number | null;
  currency: string;
  imageUrl: string | null;
  sourceUrl: string;
  storeName: string;
  umbrellaTag: string;
  typeTag: string;
  claimed?: boolean;
  guestLabel?: string | null;
}

interface MasonryGridProps {
  clips: Clip[];
  isOwner: boolean;
  onClaim?: (clip: Clip) => void;
  onUnclaim?: (clipId: string) => void;
  onEdit?: (clip: Clip) => void;
  onDelete?: (clipId: string) => void;
  onCardClick?: (clip: Clip) => void;
}

export default function MasonryGrid({
  clips,
  isOwner,
  onClaim,
  onUnclaim,
  onEdit,
  onDelete,
  onCardClick
}: MasonryGridProps) {
  const [columnCount, setColumnCount] = useState(3);

  // Responsive column count calculator
  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 640) setColumnCount(1);      // Mobile
      else if (w < 1024) setColumnCount(2); // Tablet
      else if (w < 1280) setColumnCount(3); // Small desktop
      else setColumnCount(4);              // Large desktop
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Distribute clips into columns
  const columns: Clip[][] = Array.from({ length: columnCount }, () => []);
  clips.forEach((clip, index) => {
    columns[index % columnCount].push(clip);
  });

  const formatPrice = (price: number | null, currency: string) => {
    if (price === null) return '';
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'INR' ? '₹' : `${currency} `;
    return `${symbol}${price.toFixed(2)}`;
  };

  return (
    <div className="flex gap-6 w-full">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex flex-col gap-6 flex-1">
          {col.map((clip) => (
            <motion.div
              key={clip.id}
              layoutId={`clip-card-${clip.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onCardClick && onCardClick(clip)}
              className={`premium-card group relative rounded-2xl overflow-hidden glassmorphism shadow-sm flex flex-col ${
                clip.claimed ? 'opacity-70 dark:opacity-60' : ''
              } ${onCardClick ? 'cursor-pointer' : ''}`}
            >
              {/* Product Image */}
              {clip.imageUrl ? (
                <div className="relative overflow-hidden bg-neutral-100 dark:bg-neutral-900/40">
                  <img
                    src={clip.imageUrl}
                    alt={clip.title}
                    className="w-full object-cover max-h-96 transition-transform duration-700 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  {clip.claimed && (
                    <div className="absolute inset-0 bg-black/5 backdrop-blur-[1px] pointer-events-none" />
                  )}
                </div>
              ) : (
                <div className="h-32 bg-neutral-100 dark:bg-neutral-900/40 flex items-center justify-center text-text-muted-light dark:text-text-muted-dark italic text-sm">
                  No preview image
                </div>
              )}

              {/* Card Body */}
              <div className="p-5 flex flex-col flex-grow">
                {/* Store Name & Category tag */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-text-muted-light dark:text-text-muted-dark">
                    {clip.storeName}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider bg-accent-berry/10 text-accent-berry px-2 py-0.5 rounded-full font-medium">
                    {clip.typeTag}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-serif text-lg leading-tight mb-2 text-text-primary-light dark:text-text-primary-dark group-hover:text-accent-berry transition-colors">
                  {clip.title}
                </h3>

                {/* Price */}
                {clip.price !== null && (
                  <div className="text-base font-semibold text-text-muted-light dark:text-text-muted-dark mb-4">
                    {formatPrice(clip.price, clip.currency)}
                  </div>
                )}

                {/* Spacer */}
                <div className="flex-grow" />

                {/* Action Row */}
                <div className="flex items-center gap-2 mt-4">
                  {/* View product external link */}
                  <a
                    href={clip.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 font-medium transition-colors border border-black/10 dark:border-white/10"
                  >
                    View Store <ExternalLink size={12} />
                  </a>

                  {/* Owner Controls */}
                  {isOwner && (
                    <div className="flex gap-1.5">
                      {onEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(clip); }}
                          className="p-2 rounded-xl text-neutral-500 hover:text-accent-yellow hover:bg-accent-yellow/5 transition-colors"
                          title="Edit clip"
                        >
                          <Edit size={14} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(clip.id); }}
                          className="p-2 rounded-xl text-neutral-500 hover:text-red-500 hover:bg-red-500/5 transition-colors"
                          title="Delete clip"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Guest Claim Actions */}
                  {!isOwner && onClaim && onUnclaim && (
                    <div className="flex-1">
                      {clip.claimed ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); onUnclaim(clip.id); }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-claimed-sage/10 text-claimed-sage border border-claimed-sage/30 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 font-medium transition-all group/claimBtn"
                          >
                            <Check size={12} className="group-hover/claimBtn:hidden" />
                            <span className="group-hover/claimBtn:hidden">
                              Claimed {clip.guestLabel ? `by ${clip.guestLabel}` : ''}
                            </span>
                            <span className="hidden group-hover/claimBtn:inline">
                              Unclaim?
                            </span>
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); onClaim(clip); }}
                          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-xl bg-accent-yellow hover:bg-accent-yellowHover text-black font-bold transition-colors shadow-sm brutal-border"
                        >
                          Claim Gift
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}
