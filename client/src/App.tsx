import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Share2, ArrowLeft, RefreshCw,
  Moon, Sun, Sparkles, Gift, Info, CheckCircle,
  Home, FolderOpen, Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';

import SmoothScroll from './components/SmoothScroll';
import CategoryDrilldown from './components/CategoryDrilldown';
import type { CategorySelection } from './components/CategoryDrilldown';
import MasonryGrid from './components/MasonryGrid';
import type { Clip } from './components/MasonryGrid';
import ClaimModal from './components/ClaimModal';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001/api/v1';

interface Board {
  id: string;
  name: string;
  shareToken: string;
  createdAt: string;
  clips: Clip[];
}

export default function App() {
  // Navigation & Page State
  const [view, setView] = useState<'home' | 'board' | 'public'>('home');
  const [activeTab, setActiveTab] = useState<'home' | 'categories' | 'collections'>('home');
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [publicShareToken, setPublicShareToken] = useState<string | null>(null);

  // Theme State
  const [darkMode, setDarkMode] = useState(false);

  // Data States
  const [boards, setBoards] = useState<Board[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [recentClips, setRecentClips] = useState<Clip[]>([]);
  const [publicData, setPublicData] = useState<{
    name?: string;
    clips?: Clip[];
    boards?: { id: string; name: string; clips: Clip[] }[];
    isOwner?: boolean;
  } | null>(null);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ boards: any[]; clips: Clip[] }>({ boards: [], clips: [] });
  const [isSearching, setIsSearching] = useState(false);

  // Category Filtering
  const [selectedCategory, setSelectedCategory] = useState<CategorySelection | null>(null);
  const [categoryClips, setCategoryClips] = useState<Clip[]>([]);

  // Dialog / Form States
  const [isClippingOpen, setIsClippingOpen] = useState(false);
  const [isNewBoardOpen, setIsNewBoardOpen] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  
  // Scraper Input & Preview States
  const [clipUrl, setClipUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedPreview, setScrapedPreview] = useState<{
    title: string;
    price: number | null;
    currency: string;
    imageUrl: string | null;
    sourceUrl: string;
    storeName: string;
    umbrellaTag: string;
    typeTag: string;
  } | null>(null);
  const [selectedBoardIdForClip, setSelectedBoardIdForClip] = useState('');

  // Editing & Detail Clip States
  const [editingClip, setEditingClip] = useState<Clip | null>(null);
  const [selectedClipDetail, setSelectedClipDetail] = useState<Clip | null>(null);

  // Claim Modal States
  const [claimingClip, setClaimingClip] = useState<Clip | null>(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimSuccess, setClaimSuccess] = useState(false);

  // Profile Sharing Link
  const [profileShareToken, setProfileShareToken] = useState<string | null>(null);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Legal Document Modals State
  const [activeLegalDoc, setActiveLegalDoc] = useState<'privacy' | 'terms' | null>(null);

  // Trigger brief alert toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Helper to jump to category tab
  const jumpToCategory = (umbrella: string, type: string) => {
    setActiveTab('categories');
    setView('home');
    setSelectedCategory({ umbrella, type });
    setSelectedClipDetail(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- INITIALIZATION ---

  useEffect(() => {
    // 1. Check for dark mode preference
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
      document.body.classList.add('dark');
    }

    // 2. Parse Routing Hash
    const handleHashRouting = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/b/')) {
        const token = hash.replace('#/b/', '');
        setPublicShareToken(token);
        setView('public');
      } else if (hash.startsWith('#/p/')) {
        const token = hash.replace('#/p/', '');
        setPublicShareToken(token);
        setView('public');
      } else {
        setView('home');
        setActiveBoardId(null);
        setPublicShareToken(null);
        fetchBoards();
        fetchClips();
        fetchRecentClips();
        fetchProfileShareToken();
      }
    };

    handleHashRouting();
    window.addEventListener('hashchange', handleHashRouting);

    // 3. Check for web share target query parameters
    const searchParams = new URLSearchParams(window.location.search);
    const sharedUrl = searchParams.get('url') || searchParams.get('text');
    if (sharedUrl) {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const match = sharedUrl.match(urlRegex);
      const urlToClip = match ? match[0] : sharedUrl;

      if (urlToClip.startsWith('http')) {
        setClipUrl(urlToClip);
        setIsClippingOpen(true);
        window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
        setTimeout(() => {
          handleScrapeUrl(urlToClip);
        }, 500);
      }
    }

    return () => window.removeEventListener('hashchange', handleHashRouting);
  }, []);

  // Sync dark mode class
  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.body.classList.add('dark');
    } else {
      document.body.classList.remove('dark');
    }
  };

  // --- BACKEND API CONNECTIONS ---

  const fetchBoards = async () => {
    try {
      const res = await fetch(`${API_BASE}/boards`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBoards(data);
      }
    } catch (err) {
      console.error('Error fetching boards:', err);
    }
  };

  const fetchRecentClips = async () => {
    try {
      const res = await fetch(`${API_BASE}/clips/recent`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRecentClips(data);
      }
    } catch (err) {
      console.error('Error fetching recent clips:', err);
    }
  };

  const fetchClips = async () => {
    try {
      const res = await fetch(`${API_BASE}/clips`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setClips(data);
      }
    } catch (err) {
      console.error('Error fetching clips:', err);
    }
  };

  const fetchProfileShareToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/profile/share`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setProfileShareToken(data.shareToken);
      }
    } catch (err) {
      console.error('Error profile share token:', err);
    }
  };

  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/boards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBoardName }),
        credentials: 'include',
      });

      if (res.ok) {
        triggerToast('Board created successfully!');
        setNewBoardName('');
        setIsNewBoardOpen(false);
        fetchBoards();
        fetchClips();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleGenerateProfileShare = async () => {
    try {
      const res = await fetch(`${API_BASE}/profile/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setProfileShareToken(data.shareToken);
        triggerToast('Profile sharing link active!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRevokeProfileShare = async () => {
    try {
      const res = await fetch(`${API_BASE}/profile/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revoke: true }),
        credentials: 'include',
      });
      if (res.ok) {
        setProfileShareToken(null);
        triggerToast('Profile sharing link revoked.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Scrape product URL for details
  const handleScrapeUrl = async (overrideUrl?: string) => {
    const rawUrl = overrideUrl || clipUrl;
    if (!rawUrl.trim()) return;

    // Normalize URL format (prepend https:// if protocol is missing)
    let targetUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    setIsScraping(true);
    setScrapedPreview(null);

    // Build a fallback store name from the URL (safely)
    let fallbackStoreName = targetUrl;
    try { fallbackStoreName = new URL(targetUrl).hostname.replace('www.', ''); } catch (_) {}

    // Detect currency from URL domain for fallback
    const urlLower = targetUrl.toLowerCase();
    const fallbackCurrency = urlLower.includes('.in') || urlLower.includes('flipkart') || urlLower.includes('myntra') || urlLower.includes('amazon.in') ? 'INR' : 'USD';

    try {
      // Use AbortController to enforce a 30-second client-side timeout
      // (the server retries with delays, so it can legitimately take 15-20s)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const res = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
        credentials: 'include',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setScrapedPreview(data);
      } else {
        // Server returned an error — enter editable fallback mode
        setScrapedPreview({
          title: 'Clipped Product',
          price: null,
          currency: fallbackCurrency,
          imageUrl: null,
          sourceUrl: targetUrl,
          storeName: fallbackStoreName,
          umbrellaTag: 'Leisure',
          typeTag: 'Other',
        });
        triggerToast('Could not auto-detect details. You can edit them below.');
      }
    } catch (err: any) {
      console.error('[Scrape Error]', err);
      // Network failure / timeout — still enter edit mode instead of dead-ending
      setScrapedPreview({
        title: 'Clipped Product',
        price: null,
        currency: fallbackCurrency,
        imageUrl: null,
        sourceUrl: targetUrl,
        storeName: fallbackStoreName,
        umbrellaTag: 'Leisure',
        typeTag: 'Other',
      });
      if (err.name === 'AbortError') {
        triggerToast('Request timed out. You can fill details manually.');
      } else {
        triggerToast('Could not reach server. You can fill details manually.');
      }
    } finally {
      setIsScraping(false);
    }
  };

  const handleSaveClip = async () => {
    if (!scrapedPreview) return;
    const boardId = selectedBoardIdForClip || null;

    try {
      const res = await fetch(`${API_BASE}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          ...scrapedPreview,
        }),
        credentials: 'include',
      });

      if (res.ok) {
        triggerToast('Product clipped successfully!');
        setClipUrl('');
        setScrapedPreview(null);
        setIsClippingOpen(false);
        fetchBoards();
        fetchClips();
        fetchRecentClips();
      } else {
        const errData = await res.json().catch(() => ({}));
        triggerToast(errData.error || 'Failed to save product clip.');
      }
    } catch (err: any) {
      console.error(err);
      triggerToast(err.message || 'Network error saving product.');
    }
  };

  const handleEditClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClip) return;

    try {
      const res = await fetch(`${API_BASE}/clips/${editingClip.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingClip),
        credentials: 'include',
      });

      if (res.ok) {
        triggerToast('Clip updated.');
        setEditingClip(null);
        fetchBoards();
        fetchClips();
        fetchRecentClips();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteClip = async (clipId: string) => {
    if (!window.confirm('Delete this product from your board?')) return;
    try {
      const res = await fetch(`${API_BASE}/clips/${clipId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        triggerToast('Clip removed.');
        fetchBoards();
        fetchClips();
        fetchRecentClips();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- PUBLIC SHARED BOARD LOADING & ACTIONS ---

  useEffect(() => {
    if (view === 'public' && publicShareToken) {
      loadPublicData();
    }
  }, [view, publicShareToken]);

  const loadPublicData = async () => {
    try {
      const res = await fetch(`${API_BASE}/b/${publicShareToken}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPublicData(data);
      } else {
        setPublicData(null);
        triggerToast('Invalid shared link.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmClaim = async (clipId: string, guestLabel: string) => {
    try {
      const res = await fetch(`${API_BASE}/clips/${clipId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestLabel }),
        credentials: 'include',
      });

      if (res.ok) {
        // Trigger celebration confetti!
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.65 },
          colors: ['#b84c6e', '#6e8b63', '#dcae82'],
        });
        
        setClaimSuccess(true);
        loadPublicData();
      } else {
        const err = await res.json();
        triggerToast(err.error || 'Failed to claim.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnclaim = async (clipId: string) => {
    if (!window.confirm('Unclaim this item? This lets others buy it.')) return;
    try {
      const res = await fetch(`${API_BASE}/clips/${clipId}/unclaim`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        triggerToast('Claim cancelled.');
        loadPublicData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- SEARCH ENGINE ---

  useEffect(() => {
    const delaySearch = setTimeout(() => {
      executeSearch();
    }, 300);

    return () => clearTimeout(delaySearch);
  }, [searchQuery]);

  const executeSearch = async () => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      setSearchResults({ boards: [], clips: [] });
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- CATEGORY SEARCH ---

  const handleSelectCategory = async (cat: CategorySelection | null) => {
    setSelectedCategory(cat);
    if (!cat) {
      setCategoryClips([]);
      return;
    }

    try {
      const url = cat.type
        ? `${API_BASE}/categories/${encodeURIComponent(cat.umbrella)}/${encodeURIComponent(cat.type)}`
        : `${API_BASE}/categories/${encodeURIComponent(cat.umbrella)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCategoryClips(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- SHARING HELPERS ---

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    triggerToast('Share link copied to clipboard!');
  };



  const getActiveBoard = () => {
    return boards.find(b => b.id === activeBoardId) || null;
  };

  const getProfileLink = () => {
    return `${window.location.origin}${window.location.pathname}#/p/${profileShareToken}`;
  };

  const getBoardLink = (token: string) => {
    return `${window.location.origin}${window.location.pathname}#/b/${token}`;
  };

  const getActiveCategoriesRollup = () => {
    const rollup: { [key: string]: Clip[] } = {};
    clips.forEach((clip) => {
      const cat = clip.umbrellaTag || 'Other';
      if (!rollup[cat]) {
        rollup[cat] = [];
      }
      rollup[cat].push(clip);
    });
    return rollup;
  };

  return (
    <SmoothScroll>

      {/* Global alert toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 glassmorphism px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 border border-accent-berry/30"
          >
            <Sparkles size={16} className="text-accent-berry animate-pulse" />
            <span className="text-sm font-medium text-text-primary-light dark:text-text-primary-dark">
              {toastMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`min-h-screen px-4 pt-8 ${view !== 'public' ? 'pb-24' : 'pb-8'} md:px-12 md:pb-12 max-w-7xl mx-auto flex flex-col justify-between`}>
        
        {/* --- MAIN HEADER --- */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-12 relative z-20">
          {/* Logo & Brand */}
          <div
            onClick={() => { setView('home'); setActiveTab('home'); window.location.hash = ''; }}
            className="flex items-center gap-2.5 cursor-pointer group shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-accent-yellow border-2 border-text-primary-light dark:border-text-primary-dark flex items-center justify-center text-black font-serif text-xl font-bold brutal-shadow group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:brutal-shadow-hover transition-all duration-300">
              G
            </div>
            <div>
              <h1 className="font-serif text-2xl tracking-tight leading-none text-text-primary-light dark:text-text-primary-dark">
                GiftGrid
              </h1>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-text-muted-light dark:text-text-muted-dark">
                Aesthetic Clip & Claim
              </span>
            </div>
          </div>

          {/* Persistent Search Bar (Only shown for owner) */}
          {view !== 'public' && (
            <div className="flex-1 max-w-xl mx-auto w-full relative">
              <div className="relative bg-white dark:bg-neutral-900 rounded-xl overflow-hidden flex items-center px-4 py-2.5 brutal-border brutal-shadow">
                <Search size={18} className="text-text-muted-light dark:text-text-muted-dark mr-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search your clips, boards or categories..."
                  className="w-full bg-transparent text-sm text-text-primary-light dark:text-text-primary-dark font-medium focus:outline-none placeholder-text-muted-light/60 dark:placeholder-text-muted-dark/60"
                />
              </div>
            </div>
          )}

          {/* Navigation & Actions */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Desktop Navigation Tabs (Hidden on mobile) */}
            {view !== 'public' && (
              <div className="hidden md:flex items-center gap-1.5 p-1 bg-neutral-200/50 dark:bg-neutral-800/50 rounded-xl">
                {['home', 'categories', 'collections'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab as any); setView('home'); setSearchQuery(''); }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                      activeTab === tab && !searchQuery && view === 'home'
                        ? 'bg-accent-yellow text-black brutal-border brutal-shadow'
                        : 'text-text-muted-light dark:text-text-muted-dark hover:text-text-primary-light'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}

            {/* Theme Toggle (Shown on mobile for public views, or on desktop for all) */}
            <button
              onClick={toggleDarkMode}
              className={`${view === 'public' ? 'flex' : 'hidden md:flex'} p-2.5 rounded-xl bg-white dark:bg-neutral-900 brutal-border brutal-shadow hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow-hover transition-all text-text-primary-light dark:text-text-primary-dark`}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Clipping Trigger (Hidden on mobile, desktop only) */}
            {view !== 'public' && (
              <button
                onClick={() => setIsClippingOpen(true)}
                className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl bg-text-primary-light dark:bg-text-primary-dark text-white dark:text-black brutal-border brutal-shadow hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow-hover transition-all text-sm font-bold tracking-wide"
              >
                <Plus size={16} /> CLIP
              </button>
            )}
          </div>
        </header>

        {/* --- HOME VIEW --- */}
        {view === 'home' && (
          <main className="flex-grow flex flex-col gap-12">
            


            {/* If Search is Active */}
            {searchQuery && (
              <section className="animate-fade-in flex flex-col gap-6">
                <h2 className="font-serif text-xl text-text-primary-light dark:text-text-primary-dark">
                  Search Results for "{searchQuery}"
                </h2>
                {isSearching ? (
                  <div className="text-center py-12 text-sm text-text-muted-light dark:text-text-muted-dark">
                    Searching...
                  </div>
                ) : (
                  <div className="flex flex-col gap-8">
                    {/* Matching Boards */}
                    {searchResults.boards.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider font-semibold text-text-muted-light dark:text-text-muted-dark mb-3">
                          Matching Boards
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          {searchResults.boards.map(b => (
                            <div
                              key={b.id}
                              onClick={() => {
                                setActiveBoardId(b.id);
                                setView('board');
                              }}
                              className="p-5 rounded-2xl glassmorphism border hover:border-accent-berry/30 cursor-pointer transition-all"
                            >
                              <h4 className="font-serif text-base text-text-primary-light dark:text-text-primary-dark">
                                {b.name}
                              </h4>
                              <span className="text-xs text-text-muted-light dark:text-text-muted-dark">
                                {b._count.clips} items
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Matching Clips */}
                    {searchResults.clips.length > 0 ? (
                      <div>
                        <h3 className="text-xs uppercase tracking-wider font-semibold text-text-muted-light dark:text-text-muted-dark mb-3">
                          Matching Products
                        </h3>
                        <MasonryGrid
                          clips={searchResults.clips}
                          isOwner={true}
                          onDelete={handleDeleteClip}
                        />
                      </div>
                    ) : (
                      searchResults.boards.length === 0 && (
                        <div className="text-center py-12 text-sm text-text-muted-light dark:text-text-muted-dark">
                          No matching boards or products found.
                        </div>
                      )
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Main content if search is NOT active */}
            {!searchQuery && (
              <>
                {/* --- HOME TAB --- */}
                {activeTab === 'home' && (
                  <div className="flex flex-col gap-16 animate-fade-in">
                    {/* Recently Added Zone (Last 10 clips) */}
                    <section className="flex flex-col gap-6">
                      <h2 className="font-serif text-3xl text-text-primary-light dark:text-text-primary-dark tracking-tight border-b-2 border-black dark:border-white pb-2 inline-block max-w-max">
                        Recent Add-ons
                      </h2>
                      {recentClips.length > 0 ? (
                        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 scroll-smooth scrollbar-thin snap-x px-2 -mx-2">
                          {recentClips.map((clip) => (
                            <div
                              key={clip.id}
                              className="relative min-w-[220px] max-w-[220px] flex-shrink-0 bg-white dark:bg-neutral-900 brutal-border rounded-xl p-4 snap-start cursor-pointer hover:-translate-x-1 hover:-translate-y-1 hover:brutal-shadow-hover brutal-shadow transition-all duration-300 group/card"
                              onClick={() => setSelectedClipDetail(clip)}
                            >
                              {/* Direct Delete button for owner */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteClip(clip.id);
                                }}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500 text-white border border-black hover:bg-red-600 opacity-0 group-hover/card:opacity-100 transition-opacity z-10"
                                title="Delete product"
                              >
                                <Trash2 size={12} />
                              </button>
                              
                              {clip.imageUrl ? (
                                <img
                                  src={clip.imageUrl}
                                  alt={clip.title}
                                  className="w-full h-32 object-cover rounded-lg border border-neutral-200 dark:border-neutral-800 mb-3"
                                />
                              ) : (
                                <div className="w-full h-32 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3 text-[10px] text-text-muted-light italic border border-neutral-200 dark:border-neutral-800">
                                  No image
                                </div>
                              )}
                              <span className="text-[9px] uppercase tracking-wider font-bold text-accent-berry bg-accent-berry/10 px-2 py-0.5 rounded-sm mb-1.5 inline-block">
                                {clip.storeName}
                              </span>
                              <h4 className="font-serif font-bold text-sm line-clamp-2 text-text-primary-light dark:text-text-primary-dark">
                                {clip.title}
                              </h4>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-20 flex flex-col items-center justify-center border-2 border-black dark:border-white rounded-2xl bg-accent-yellow/20 dark:bg-accent-yellow/10">
                          <h3 className="font-serif text-2xl font-bold mb-2">No items clipped yet.</h3>
                          <p className="text-sm font-medium opacity-80 text-center max-w-md">
                            Paste a URL to get started. Build your ultimate aesthetic wishlist today.
                          </p>
                        </div>
                      )}
                    </section>

                    {/* Your Shopping, Organized (Active Categories Rollup) */}
                    <section className="flex flex-col gap-8">
                      <h2 className="font-serif text-3xl text-text-primary-light dark:text-text-primary-dark tracking-tight border-b-2 border-black dark:border-white pb-2 inline-block max-w-max">
                        Your Shopping, Organized
                      </h2>
                      <div className="flex flex-col gap-10">
                        {Object.entries(getActiveCategoriesRollup()).map(([catName, items]) => (
                          <div key={catName} className="flex flex-col gap-4">
                            <h3 
                              onClick={() => {
                                setActiveTab('categories');
                                setView('home');
                                handleSelectCategory({ umbrella: catName, type: null });
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className="font-sans font-black uppercase tracking-widest text-lg flex items-center gap-2 cursor-pointer hover:underline"
                            >
                              {catName} <span className="text-xs bg-black text-white dark:bg-white dark:text-black px-2 py-0.5 rounded-md">{items.length}</span>
                            </h3>
                            <div className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-thin px-1 -mx-1">
                              {items.map((clip) => (
                                <div
                                  key={clip.id}
                                  onClick={() => setSelectedClipDetail(clip)}
                                  className="relative min-w-[160px] max-w-[160px] flex-shrink-0 bg-white dark:bg-neutral-900 border-2 border-black dark:border-white rounded-xl p-3 cursor-pointer hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_#121212] transition-all group/rollup"
                                >
                                  {/* Direct Delete button for owner */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteClip(clip.id);
                                    }}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500 text-white border border-black hover:bg-red-600 opacity-0 group-hover/rollup:opacity-100 transition-opacity z-10"
                                    title="Delete product"
                                  >
                                    <Trash2 size={10} />
                                  </button>

                                  {clip.imageUrl ? (
                                    <img src={clip.imageUrl} className="w-full h-24 object-cover rounded-md mb-2" />
                                  ) : (
                                    <div className="w-full h-24 bg-neutral-100 rounded-md mb-2 flex items-center justify-center text-xs italic">No img</div>
                                  )}
                                  <h4 className="font-serif text-xs font-bold truncate">{clip.title}</h4>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {Object.keys(getActiveCategoriesRollup()).length === 0 && (
                          <div className="text-sm italic text-text-muted-light">
                            Categories will automatically appear here once you add items.
                          </div>
                        )}
                      </div>
                    </section>
                  </div>
                )}

                {/* --- CATEGORIES TAB --- */}
                {activeTab === 'categories' && (
                  <div className="animate-fade-in flex flex-col gap-8">
                    <h2 className="font-serif text-3xl text-text-primary-light dark:text-text-primary-dark tracking-tight border-b-2 border-black dark:border-white pb-2 inline-block max-w-max">
                      Browse Categories
                    </h2>
                    {clips.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-neutral-900 brutal-shadow">
                        <h3 className="font-serif text-3xl font-bold mb-2 text-center px-4">Clip a product to organize.</h3>
                      </div>
                    ) : (
                      <CategoryDrilldown
                        onSelect={handleSelectCategory}
                        selectedCategory={selectedCategory}
                        userClips={clips}
                      />
                    )}

                    {/* Render category-filtered clips */}
                    {selectedCategory && (
                      <div className="mt-8 pt-8 border-t-2 border-black dark:border-white flex flex-col gap-6">
                        <div className="flex items-center justify-between bg-accent-yellow px-4 py-3 rounded-xl brutal-border brutal-shadow">
                          <h3 className="text-sm font-bold text-black uppercase tracking-wider">
                            Showing: {selectedCategory.umbrella} {selectedCategory.type ? `➔ ${selectedCategory.type}` : ''}
                          </h3>
                          <button
                            onClick={() => handleSelectCategory(null)}
                            className="text-xs font-bold text-black underline hover:no-underline"
                          >
                            CLEAR FILTER
                          </button>
                        </div>
                        {categoryClips.length > 0 ? (
                          <MasonryGrid
                            clips={categoryClips}
                            isOwner={true}
                            onDelete={handleDeleteClip}
                            onCardClick={setSelectedClipDetail}
                          />
                        ) : (
                          <div className="text-center py-12 text-sm italic border-2 border-dashed border-black dark:border-white rounded-2xl">
                            No clipped items in this category yet.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* --- COLLECTIONS TAB --- */}
                {activeTab === 'collections' && (
                  <div className="animate-fade-in flex flex-col gap-8">
                    <div className="flex items-center justify-between border-b-2 border-black dark:border-white pb-4">
                      <h2 className="font-serif text-3xl text-text-primary-light dark:text-text-primary-dark tracking-tight">
                        My Collection
                      </h2>
                      <button
                        onClick={() => setIsNewBoardOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-lg hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_#FFE600] transition-all brutal-border"
                      >
                        <Plus size={14} /> NEW FOLDER
                      </button>
                    </div>

                    {boards.length === 0 ? (
                      <div className="py-20 flex flex-col items-center justify-center border-2 border-black dark:border-white rounded-2xl bg-white dark:bg-neutral-900 brutal-shadow">
                        <h3 className="font-serif text-2xl font-bold mb-4">No folders created yet.</h3>
                        <button
                          onClick={() => setIsNewBoardOpen(true)}
                          className="px-6 py-3 text-sm rounded-xl bg-accent-yellow text-black font-bold brutal-border brutal-shadow hover:-translate-x-1 hover:-translate-y-1 hover:brutal-shadow-hover transition-all"
                        >
                          Create Your First Folder
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                        {boards.map((board) => {
                          const coverImages = board.clips.filter(c => c.imageUrl).slice(0, 3).map(c => c.imageUrl);
                          return (
                            <div
                              key={board.id}
                              onClick={() => {
                                setActiveBoardId(board.id);
                                setView('board');
                              }}
                              className="bg-white dark:bg-neutral-900 rounded-2xl p-5 brutal-border brutal-shadow flex flex-col justify-between group cursor-pointer hover:-translate-x-1 hover:-translate-y-1 hover:brutal-shadow-hover transition-all duration-300"
                            >
                              <div>
                                <div className="h-40 rounded-xl bg-neutral-100 dark:bg-neutral-800 overflow-hidden mb-4 relative flex gap-1 p-1 brutal-border">
                                  {coverImages.length === 0 ? (
                                    <div className="w-full flex items-center justify-center text-xs italic font-semibold">Empty folder</div>
                                  ) : coverImages.length === 1 ? (
                                    <img src={coverImages[0]!} className="w-full h-full object-cover rounded-lg" />
                                  ) : (
                                    <>
                                      <img src={coverImages[0]!} className="flex-grow w-1/2 h-full object-cover rounded-lg" />
                                      <div className="w-1/2 h-full flex flex-col gap-1">
                                        {coverImages.slice(1).map((img, i) => (
                                          <img key={i} src={img!} className="h-[calc(50%-2px)] object-cover rounded-lg" />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                                <h3 className="font-serif text-2xl font-bold text-text-primary-light dark:text-text-primary-dark">
                                  {board.name}
                                </h3>
                                <p className="text-xs font-bold uppercase tracking-wider mt-1">
                                  {board.clips.length} items
                                </p>
                              </div>
                              <div className="flex items-center justify-between mt-6 pt-4 border-t-2 border-black dark:border-white">
                                <span className="text-[10px] font-bold uppercase">
                                  {new Date(board.createdAt).toLocaleDateString()}
                                </span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyToClipboard(getBoardLink(board.shareToken)); }}
                                  className="p-2 rounded-lg border-2 border-black dark:border-white hover:bg-accent-yellow transition-colors"
                                >
                                  <Share2 size={14} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Profile Share Management */}
                    <div className="mt-8 p-6 bg-accent-yellow rounded-2xl brutal-border brutal-shadow flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div>
                        <h3 className="font-serif text-2xl font-bold text-black">Share Full Profile</h3>
                        <p className="text-xs font-semibold text-black/80 max-w-sm mt-1">
                          Generate a secure link sharing all your folders in one place.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {profileShareToken ? (
                          <>
                            <button onClick={() => copyToClipboard(getProfileLink())} className="px-4 py-2.5 bg-black text-white text-xs font-bold rounded-lg hover:opacity-80">Copy Link</button>
                            <button onClick={handleRevokeProfileShare} className="px-4 py-2.5 bg-red-500 text-white text-xs font-bold rounded-lg border-2 border-black hover:opacity-80">Revoke</button>
                          </>
                        ) : (
                          <button onClick={handleGenerateProfileShare} className="px-5 py-3 bg-black text-white text-sm font-bold rounded-xl hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_rgba(0,0,0,0.5)] border border-black">Generate Link</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        )}

        {/* --- BOARD MANAGER VIEW --- */}
        {view === 'board' && getActiveBoard() && (
          <main className="flex-grow flex flex-col gap-8 animate-fade-in">
            {/* Navigation back row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('home')}
                className="flex items-center gap-1 text-xs text-text-muted-light dark:text-text-muted-dark hover:text-accent-berry transition-colors font-medium"
              >
                <ArrowLeft size={14} /> Back to Boards
              </button>
            </div>

            {/* Board Header Details */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 pb-6 border-b border-neutral-200/40 dark:border-neutral-800/40">
              <div>
                <span className="text-[10px] tracking-wider uppercase font-semibold text-accent-berry">
                  Personal Board
                </span>
                <h2 className="font-serif text-3xl text-text-primary-light dark:text-text-primary-dark">
                  {getActiveBoard()?.name}
                </h2>
                <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-1">
                  {getActiveBoard()?.clips.length || 0} products clipped
                </p>
              </div>

              {/* Share links */}
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => copyToClipboard(getBoardLink(getActiveBoard()!.shareToken))}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-berry text-white text-xs font-semibold hover:bg-accent-berryHover transition-colors shadow-sm"
                >
                  <Share2 size={12} /> Copy Board Share Link
                </button>
              </div>
            </div>

            {/* Board clips masonry */}
            {getActiveBoard()!.clips.length === 0 ? (
              <div className="text-center py-24 glassmorphism rounded-3xl flex flex-col items-center gap-4">
                <div className="p-4 rounded-full bg-accent-berry/10 text-accent-berry">
                  <Gift size={28} />
                </div>
                <div>
                  <h3 className="font-serif text-lg mb-1">This board is empty</h3>
                  <p className="text-xs text-text-muted-light dark:text-text-muted-dark max-w-xs mx-auto">
                    Click the "Clip Product" button in the header and paste a URL to add your first product.
                  </p>
                </div>
              </div>
            ) : (
              <MasonryGrid
                clips={getActiveBoard()!.clips}
                isOwner={true}
                onEdit={(clip) => setEditingClip(clip)}
                onDelete={handleDeleteClip}
              />
            )}
          </main>
        )}

        {/* --- PUBLIC GUEST BOARD VIEW (OWNER-BLINDED) --- */}
        {view === 'public' && (
          <main className="flex-grow flex flex-col gap-8 animate-fade-in">
            {/* If loading or error */}
            {!publicData ? (
              <div className="text-center py-24 glassmorphism rounded-3xl">
                <RefreshCw size={24} className="animate-spin text-accent-berry mx-auto mb-4" />
                <h3 className="font-serif text-lg">Loading shared list...</h3>
              </div>
            ) : (
              <>
                {/* Header card for the public */}
                <div className="glassmorphism rounded-3xl p-6 border border-white/20 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3.5 rounded-2xl bg-accent-berry/10 text-accent-berry">
                      <Gift size={24} />
                    </div>
                    <div>
                      <span className="text-[10px] tracking-wider uppercase font-semibold text-accent-berry">
                        Shared {publicData.name ? 'Registry' : 'Taste Catalog'}
                      </span>
                      <h2 className="font-serif text-2xl text-text-primary-light dark:text-text-primary-dark">
                        {publicData.name || 'Anonymous Creator\'s GiftGrid'}
                      </h2>
                      <p className="text-xs text-text-muted-light dark:text-text-muted-dark mt-0.5">
                        Claim an item to let others know you've got it covered. They won't see your claim.
                      </p>
                    </div>
                  </div>

                  {/* Owner Status Tag */}
                  {publicData.isOwner && (
                    <div className="flex items-center gap-2 bg-accent-berry/10 border border-accent-berry/30 px-4 py-2 rounded-2xl text-accent-berry text-xs font-semibold">
                      <Info size={14} /> Viewing your own shared list (claims are hidden from you!)
                    </div>
                  )}
                </div>

                {/* Clips list */}
                {publicData.clips && publicData.clips.length === 0 ? (
                  <div className="text-center py-20 glassmorphism rounded-3xl">
                    <p className="text-sm text-text-muted-light dark:text-text-muted-dark">
                      This list doesn't contain any products yet.
                    </p>
                  </div>
                ) : (
                  <MasonryGrid
                    clips={publicData.clips || []}
                    isOwner={publicData.isOwner || false}
                    onEdit={(clip) => setEditingClip(clip)}
                    onDelete={handleDeleteClip}
                    onClaim={(clip) => {
                      setClaimingClip(clip);
                      setShowClaimModal(true);
                    }}
                    onUnclaim={handleUnclaim}
                  />
                )}
              </>
            )}
          </main>
        )}

        {/* --- DYNAMIC OVERLAYS / DRAWERS --- */}

        {/* 1. CLIP PRODUCT OVERLAY */}
        <AnimatePresence>
          {isClippingOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setIsClippingOpen(false);
                  setClipUrl('');
                  setScrapedPreview(null);
                }}
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
              />

              {/* Panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 30 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl glassmorphism border border-white/20 shadow-2xl p-6 z-10"
              >
                <h3 className="font-serif text-2xl mb-2 text-text-primary-light dark:text-text-primary-dark">
                  Clip Product Link
                </h3>
                <p className="text-xs text-text-muted-light dark:text-text-muted-dark mb-6">
                  Paste the product page link from any online shop (Shopify, Etsy, Amazon, custom store).
                </p>

                {/* URL Input */}
                {!scrapedPreview ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={clipUrl}
                        onChange={(e) => setClipUrl(e.target.value)}
                        placeholder="https://store.com/product/..."
                        className="flex-grow px-4 py-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none focus:ring-1 focus:ring-accent-berry"
                        disabled={isScraping}
                      />
                      <button
                        onClick={() => handleScrapeUrl()}
                        disabled={isScraping || !clipUrl}
                        className="px-5 py-3 rounded-xl bg-accent-berry hover:bg-accent-berryHover disabled:opacity-50 text-white font-medium text-sm flex items-center gap-1.5 transition-colors"
                      >
                        {isScraping ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" /> Scraping...
                          </>
                        ) : (
                          'Fetch'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  // Scraped Preview & Editing fields
                  <div className="flex flex-col gap-5">
                    {/* Image Preview & Editor */}
                    <div className="flex gap-4 p-4 rounded-2xl bg-neutral-50/50 dark:bg-neutral-900/20 border border-neutral-200/30 dark:border-neutral-800/30">
                      {scrapedPreview.imageUrl ? (
                        <img
                          src={scrapedPreview.imageUrl}
                          alt="Scraped Preview"
                          className="w-20 h-20 object-cover rounded-xl"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-neutral-100 dark:bg-neutral-800 rounded-xl flex items-center justify-center text-[10px] text-text-muted-light dark:text-text-muted-dark italic">
                          No Image
                        </div>
                      )}
                      
                      <div className="flex-grow flex flex-col gap-2">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark">
                          Image URL (Editable)
                        </label>
                        <input
                          type="text"
                          value={scrapedPreview.imageUrl || ''}
                          onChange={(e) => setScrapedPreview({ ...scrapedPreview, imageUrl: e.target.value })}
                          placeholder="Paste image URL..."
                          className="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Title Editor */}
                    <div>
                      <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                        Product Title
                      </label>
                      <textarea
                        value={scrapedPreview.title}
                        onChange={(e) => setScrapedPreview({ ...scrapedPreview, title: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none focus:ring-1 focus:ring-accent-berry"
                        rows={2}
                      />
                    </div>

                    {/* Price & Currency & Store */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                          Price
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={scrapedPreview.price === null ? '' : scrapedPreview.price}
                          onChange={(e) => setScrapedPreview({ ...scrapedPreview, price: e.target.value ? parseFloat(e.target.value) : null })}
                          className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                          Currency
                        </label>
                        <input
                          type="text"
                          value={scrapedPreview.currency}
                          onChange={(e) => setScrapedPreview({ ...scrapedPreview, currency: e.target.value.toUpperCase() })}
                          className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                          Store
                        </label>
                        <input
                          type="text"
                          value={scrapedPreview.storeName}
                          onChange={(e) => setScrapedPreview({ ...scrapedPreview, storeName: e.target.value })}
                          className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Board Picker */}
                    <div>
                      <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1.5">
                        Select Wishlist Board
                      </label>
                      <select
                        value={selectedBoardIdForClip}
                        onChange={(e) => setSelectedBoardIdForClip(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                      >
                        <option value="">None (Save to Home)</option>
                        {boards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Save Buttons */}
                    <div className="flex gap-3 mt-4">
                      <button
                        onClick={() => setScrapedPreview(null)}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleSaveClip}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-accent-berry hover:bg-accent-berryHover text-white text-sm font-medium transition-colors shadow-sm"
                      >
                        Save to Wishlist
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 2. EDIT PRODUCT CARD OVERLAY */}
        <AnimatePresence>
          {editingClip && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditingClip(null)}
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
              />

              {/* Panel */}
              <form
                onSubmit={handleEditClip}
                className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-3xl glassmorphism border border-white/20 shadow-2xl p-6 z-10 flex flex-col gap-4"
              >
                <h3 className="font-serif text-2xl text-text-primary-light dark:text-text-primary-dark">
                  Edit Wishlist Item
                </h3>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                    Title
                  </label>
                  <textarea
                    value={editingClip.title}
                    onChange={(e) => setEditingClip({ ...editingClip, title: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                    rows={2}
                    required
                  />
                </div>

                {/* Price & Currency */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingClip.price === null ? '' : editingClip.price}
                      onChange={(e) => setEditingClip({ ...editingClip, price: e.target.value ? parseFloat(e.target.value) : null })}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                      Currency
                    </label>
                    <input
                      type="text"
                      value={editingClip.currency}
                      onChange={(e) => setEditingClip({ ...editingClip, currency: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                {/* Image URL */}
                <div>
                  <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1">
                    Image URL
                  </label>
                  <input
                    type="text"
                    value={editingClip.imageUrl || ''}
                    onChange={(e) => setEditingClip({ ...editingClip, imageUrl: e.target.value || null })}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                  />
                </div>

                {/* Board selection */}
                <div>
                  <label className="block text-xs font-semibold text-text-primary-light dark:text-text-primary-dark mb-1.5">
                    Move to Board
                  </label>
                  <select
                    value={editingClip.boardId}
                    onChange={(e) => setEditingClip({ ...editingClip, boardId: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none"
                  >
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setEditingClip(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent-berry hover:bg-accent-berryHover text-white text-sm font-medium transition-colors shadow-sm"
                  >
                    Update
                  </button>
                </div>
              </form>
            </div>
          )}
        </AnimatePresence>

        {/* 3. NEW BOARD CREATOR OVERLAY */}
        <AnimatePresence>
          {isNewBoardOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsNewBoardOpen(false)}
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
              />

              {/* Panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-md rounded-3xl glassmorphism border border-white/20 shadow-2xl p-6 z-10"
              >
                <h3 className="font-serif text-xl mb-1 text-text-primary-light dark:text-text-primary-dark">
                  Create Wishlist Board
                </h3>
                <p className="text-xs text-text-muted-light dark:text-text-muted-dark mb-5">
                  Give your wishlist list a clear occasion title.
                </p>

                <form onSubmit={handleCreateBoard} className="flex flex-col gap-4">
                  <div>
                    <input
                      type="text"
                      value={newBoardName}
                      onChange={(e) => setNewBoardName(e.target.value)}
                      placeholder="e.g. Wedding registry, Christmas wish list..."
                      className="w-full px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 text-sm focus:outline-none focus:ring-1 focus:ring-accent-berry"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setIsNewBoardOpen(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 px-4 py-2.5 rounded-xl bg-accent-berry hover:bg-accent-berryHover text-white text-sm font-medium transition-colors shadow-sm"
                    >
                      Create
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 4. GUEST CLAIM MODAL */}
        <ClaimModal
          clip={claimingClip}
          isOpen={showClaimModal}
          onClose={() => {
            setShowClaimModal(false);
            setClaimingClip(null);
          }}
          onConfirm={handleConfirmClaim}
        />

        {/* 5. GUEST POST-CLAIM VIRAL LOOP MODAL */}
        <AnimatePresence>
          {claimSuccess && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setClaimSuccess(false)}
                className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-sm rounded-3xl glassmorphism border border-white/20 shadow-2xl p-6 z-10 text-center flex flex-col items-center gap-4"
              >
                <div className="w-12 h-12 rounded-full bg-claimed-sage/10 text-claimed-sage flex items-center justify-center">
                  <CheckCircle size={28} />
                </div>

                <div>
                  <h3 className="font-serif text-xl mb-1 text-text-primary-light dark:text-text-primary-dark">
                    Gift Claimed!
                  </h3>
                  <p className="text-xs text-text-muted-light dark:text-text-muted-dark">
                    Thank you! The recipient won't see this claim to keep the surprise, but it will show as claimed to other shoppers.
                  </p>
                </div>

                <div className="w-full border-t border-neutral-200/30 dark:border-neutral-800/30 my-2 pt-4">
                  <p className="text-xs font-medium mb-3 text-text-primary-light dark:text-text-primary-dark">
                    Building your own list? Start your own GiftGrid effortlessly.
                  </p>
                  <button
                    onClick={() => {
                      setClaimSuccess(false);
                      window.location.hash = '';
                    }}
                    className="w-full px-4 py-2.5 rounded-xl bg-accent-berry hover:bg-accent-berryHover text-white text-xs font-semibold shadow-sm transition-colors"
                  >
                    Start My Own GiftGrid
                  </button>
                </div>

                <button
                  onClick={() => setClaimSuccess(false)}
                  className="text-xs text-text-muted-light dark:text-text-muted-dark hover:underline"
                >
                  Dismiss
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 6. DETAILED CLIP VIEW MODAL */}
        <AnimatePresence>
          {selectedClipDetail && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedClipDetail(null)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto overflow-x-hidden rounded-3xl bg-white dark:bg-neutral-900 border-4 border-black dark:border-white brutal-shadow p-0 flex flex-col md:flex-row z-10"
              >
                {/* Image Section */}
                <div className="w-full md:w-1/2 min-h-[300px] border-b-4 md:border-b-0 md:border-r-4 border-black dark:border-white relative bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                  {selectedClipDetail.imageUrl ? (
                    <img src={selectedClipDetail.imageUrl} alt={selectedClipDetail.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="text-sm italic font-bold">No Image Available</div>
                  )}
                  <div className="absolute top-4 left-4 bg-accent-yellow text-black px-3 py-1 text-xs font-black uppercase tracking-wider rounded-lg border-2 border-black brutal-shadow">
                    {selectedClipDetail.storeName}
                  </div>
                </div>

                {/* Details Section */}
                <div className="w-full md:w-1/2 p-8 flex flex-col justify-between">
                  <div>
                    <h2 className="font-serif text-3xl font-bold leading-tight mb-4 text-text-primary-light dark:text-text-primary-dark">
                      {selectedClipDetail.title}
                    </h2>
                    
                    <div className="flex gap-2 flex-wrap mb-6">
                      <span 
                        onClick={() => jumpToCategory(selectedClipDetail.umbrellaTag || 'Misc', selectedClipDetail.typeTag || 'Other')}
                        className="bg-neutral-200 dark:bg-neutral-800 px-3 py-1 rounded-md text-xs font-bold uppercase brutal-border cursor-pointer hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
                      >
                        {selectedClipDetail.umbrellaTag || 'Misc'}
                      </span>
                      <span 
                        onClick={() => jumpToCategory(selectedClipDetail.umbrellaTag || 'Misc', selectedClipDetail.typeTag || 'Other')}
                        className="bg-neutral-200 dark:bg-neutral-800 px-3 py-1 rounded-md text-xs font-bold uppercase brutal-border cursor-pointer hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-all"
                      >
                        {selectedClipDetail.typeTag || 'Other'}
                      </span>
                      {selectedClipDetail.price !== null && (
                        <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 px-3 py-1 rounded-md text-xs font-bold uppercase border-2 border-green-800 dark:border-green-100 brutal-shadow">
                          {selectedClipDetail.currency === 'USD' ? '$' : selectedClipDetail.currency === 'EUR' ? '€' : selectedClipDetail.currency === 'GBP' ? '£' : selectedClipDetail.currency === 'INR' ? '₹' : `${selectedClipDetail.currency} `}
                          {selectedClipDetail.price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-8 pt-6 border-t-4 border-black dark:border-white">
                    <a
                      href={selectedClipDetail.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-4 bg-black dark:bg-white text-white dark:text-black font-black text-center uppercase tracking-widest rounded-xl hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0px_#FFE600] transition-all border-2 border-black dark:border-white"
                    >
                      GET IT FROM STORE
                    </a>
                    
                    {(view !== 'public' || publicData?.isOwner) ? (
                      <div className="flex gap-4 mt-2">
                        <button
                          onClick={() => { setEditingClip(selectedClipDetail); setSelectedClipDetail(null); }}
                          className="flex-grow py-3 text-xs font-bold uppercase bg-neutral-100 dark:bg-neutral-800 border-2 border-black dark:border-white rounded-lg hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow transition-all text-center"
                        >
                          EDIT CLIP
                        </button>
                        <button
                          onClick={() => { handleDeleteClip(selectedClipDetail.id); setSelectedClipDetail(null); }}
                          className="flex-grow py-3 text-xs font-bold uppercase bg-red-500 text-white border-2 border-black dark:border-white rounded-lg hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow transition-all text-center"
                        >
                          DELETE
                        </button>
                      </div>
                    ) : (
                      selectedClipDetail.claimed ? (
                        <div className="w-full py-4 mt-2 bg-claimed-sage/20 text-claimed-sage border-2 border-claimed-sage text-center rounded-xl font-black uppercase tracking-wider brutal-shadow">
                          ALREADY CLAIMED
                        </div>
                      ) : (
                        <button
                          onClick={() => { setClaimingClip(selectedClipDetail); setShowClaimModal(true); setSelectedClipDetail(null); }}
                          className="w-full py-4 mt-2 bg-accent-yellow text-black border-2 border-black font-black uppercase tracking-widest rounded-xl hover:-translate-x-1 hover:-translate-y-1 hover:brutal-shadow-hover transition-all"
                        >
                          CLAIM AS GIFT
                        </button>
                      )
                    )}
                  </div>
                </div>
                
                {/* Close Button */}
                <button
                  onClick={() => setSelectedClipDetail(null)}
                  className="absolute top-4 right-4 w-10 h-10 bg-white dark:bg-neutral-900 border-2 border-black dark:border-white rounded-full flex items-center justify-center hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow transition-all z-20 text-black dark:text-white"
                >
                  <span className="font-bold">X</span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ROTATING BADGE */}
        <div className="fixed bottom-8 right-8 z-[40] pointer-events-none select-none hidden md:block">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full animate-[spin_10s_linear_infinite] flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full p-0">
                <path id="curve" fill="transparent" d="M 50, 50 m -38, 0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
                <text className="text-[10px] font-black uppercase tracking-[0.2em] fill-black dark:fill-white">
                  <textPath href="#curve" startOffset="0%">
                    CLIP • COLLAGE • CLAIM • CLIP • COLLAGE • CLAIM • 
                  </textPath>
                </text>
              </svg>
            </div>
            <div className="w-12 h-12 bg-accent-yellow rounded-full border-2 border-black dark:border-white flex items-center justify-center brutal-shadow font-serif font-black text-black text-xl">
              G
            </div>
          </div>
        </div>

        {/* --- FOOTER CONTENT --- */}
        <footer className="mt-20 pt-8 border-t-2 border-black dark:border-white text-center flex flex-col sm:flex-row items-center justify-between gap-4 font-bold uppercase tracking-wider">
          <p className="text-[10px] text-text-muted-light dark:text-text-muted-dark">
            &copy; {new Date().getFullYear()} GiftGrid. Zero-Signup Product Wishlists.
          </p>
          <div className="flex gap-4 text-[10px] text-text-primary-light dark:text-text-primary-dark font-black">
            <span onClick={() => setActiveLegalDoc('privacy')} className="cursor-pointer hover:text-accent-yellow transition-colors">Privacy</span>
            <span>&middot;</span>
            <span onClick={() => setActiveLegalDoc('terms')} className="cursor-pointer hover:text-accent-yellow transition-colors">Terms</span>
          </div>
        </footer>

        {/* LEGAL DOCUMENT MODAL (PRIVACY / TERMS) */}
        <AnimatePresence>
          {activeLegalDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveLegalDoc(null)}
                className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm"
              />

              {/* Panel */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-3xl bg-white dark:bg-neutral-900 brutal-border brutal-shadow p-6 md:p-8 z-10 text-text-primary-light dark:text-text-primary-dark"
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b-2 border-black dark:border-white mb-6">
                  <h3 className="font-serif text-3xl font-bold">
                    {activeLegalDoc === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
                  </h3>
                  <button
                    onClick={() => setActiveLegalDoc(null)}
                    className="w-8 h-8 rounded-lg border-2 border-black dark:border-white flex items-center justify-center font-bold text-sm bg-neutral-100 dark:bg-neutral-800 hover:bg-accent-yellow transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {/* Content */}
                <div className="space-y-6 text-sm leading-relaxed overflow-y-auto pr-2 max-h-[50vh] scrollbar-none font-medium">
                  {activeLegalDoc === 'privacy' ? (
                    <>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">1. Local-First Architecture</h4>
                        <p>
                          GiftGrid operates on a zero-signup, local-first model. All wishlists, folders, and clipped products are saved directly inside your browser's local storage database on your specific device. We do not require usernames, passwords, or emails.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">2. Data Storage & Shared Links</h4>
                        <p>
                          When you explicitly choose to generate a shareable link for a folder or your entire profile, the associated metadata (title, price, store name, images, and links) is uploaded to our central secure database so that others can access it. Shared links are completely anonymous and randomly generated.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">3. Guest Gift Claims</h4>
                        <p>
                          To prevent duplicate gifts, guests visiting a shared list can claim an item. When a claim is made, we record the claim status and the guest's name in our database. To maintain the element of surprise, these claims are hidden from the creator's direct account view but shown to all other visiting guests.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">4. Third-Party Product Links</h4>
                        <p>
                          Our scraping tool retrieves public e-commerce details (titles, prices, images) on your behalf when you input URLs. We do not track or sell your browsing history, store selection, or shopping choices to marketing companies.
                        </p>
                      </section>
                    </>
                  ) : (
                    <>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">1. Platform Services</h4>
                        <p>
                          GiftGrid is a free product wishlist scraper and registry platform. It is provided "as is" and "as available" without warranty of any kind. We do not guarantee continuous uptime or absolute prevention of data clearing if you wipe your browser storage.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">2. Permissible Usage</h4>
                        <p>
                          You agree to use GiftGrid only for personal, non-commercial purposes. You may not scrape or flood the scraping API, attempt reverse engineering, or upload/paste illegal, malicious, or explicit URL content.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">3. Board Sharing & Privacy Limits</h4>
                        <p>
                          Anyone with access to your shared board link will be able to view the products, prices, and claim status. We are not liable for accidental sharing or leaks of links generated by your device.
                        </p>
                      </section>
                      <section>
                        <h4 className="font-bold text-base mb-2 uppercase tracking-wide text-accent-berry">4. E-Commerce Disclaimer</h4>
                        <p>
                          GiftGrid does not process orders, payments, or shipping. All purchases are handled directly on the merchants' respective e-commerce sites. We are not responsible for pricing changes, out-of-stock items, shipping delays, or product quality.
                        </p>
                      </section>
                    </>
                  )}
                </div>

                {/* Footer close button */}
                <div className="mt-8 pt-4 border-t-2 border-black dark:border-white flex justify-end">
                  <button
                    onClick={() => setActiveLegalDoc(null)}
                    className="px-6 py-2.5 rounded-xl bg-black dark:bg-white text-white dark:text-black font-bold uppercase tracking-wider brutal-border shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] hover:-translate-y-0.5 active:translate-y-0 transition-all text-xs"
                  >
                    Understood
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Bottom Navigation Bar for Mobile PWA */}
        {view !== 'public' && (
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-neutral-900 border-t-2 border-black dark:border-white px-6 py-2 pb-safe flex items-center justify-between shadow-[0_-4px_0px_rgba(0,0,0,0.1)]">
            <button
              onClick={() => { setActiveTab('home'); setView('home'); setSearchQuery(''); }}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                activeTab === 'home' && !searchQuery && view === 'home'
                  ? 'text-accent-berry'
                  : 'text-text-muted-light dark:text-text-muted-dark'
              }`}
            >
              <Home size={20} />
              <span>Home</span>
            </button>

            <button
              onClick={() => { setActiveTab('categories'); setView('home'); setSearchQuery(''); }}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                activeTab === 'categories' && !searchQuery && view === 'home'
                  ? 'text-accent-berry'
                  : 'text-text-muted-light dark:text-text-muted-dark'
              }`}
            >
              <FolderOpen size={20} />
              <span>Categories</span>
            </button>

            {/* Floating Action Button for Clip */}
            <button
              onClick={() => setIsClippingOpen(true)}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-accent-yellow text-black border-2 border-black dark:border-white shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] -translate-y-4 hover:translate-y-[-14px] active:translate-y-[-12px] transition-all"
            >
              <Plus size={24} />
            </button>

            <button
              onClick={() => { setActiveTab('collections'); setView('home'); setSearchQuery(''); }}
              className={`flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                activeTab === 'collections' && !searchQuery && view === 'home'
                  ? 'text-accent-berry'
                  : 'text-text-muted-light dark:text-text-muted-dark'
              }`}
            >
              <Gift size={20} />
              <span>Boards</span>
            </button>

            <button
              onClick={toggleDarkMode}
              className="flex flex-col items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-text-muted-light dark:text-text-muted-dark"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              <span>Theme</span>
            </button>
          </div>
        )}

      </div>
    </SmoothScroll>
  );
}
