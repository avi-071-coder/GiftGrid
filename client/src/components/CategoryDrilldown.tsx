import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shirt, Sparkles, Home, Laptop, Gem, ChevronDown } from 'lucide-react';

export interface CategorySelection {
  umbrella: string;
  type: string | null;
}

interface CategoryDrilldownProps {
  onSelect: (selection: CategorySelection | null) => void;
  selectedCategory: CategorySelection | null;
  userClips?: { umbrellaTag?: string; typeTag?: string }[];
}

const CATEGORIES = [
  {
    name: 'Outfits',
    icon: Shirt,
    types: ['Clothing', 'Footwear', 'Bags'],
  },
  {
    name: 'Accessories',
    icon: Gem,
    types: ['Jewelry', 'Watches', 'Eyewear', 'Misc'],
  },
  {
    name: 'Household',
    icon: Home,
    types: ['Kitchenware', 'Decor', 'Furniture'],
  },
  {
    name: 'Electronics',
    icon: Laptop,
    types: ['Phones & Tablets', 'Gadgets & Smart Home', 'Audio', 'Computing & Gaming'],
  },
  {
    name: 'Leisure',
    icon: Sparkles,
    types: ['Beauty & Personal Care', 'Books & Stationery', 'Games & Toys', 'Fitness & Outdoors', 'Other'],
  },
];

export default function CategoryDrilldown({
  onSelect,
  selectedCategory,
  userClips = []
}: CategoryDrilldownProps) {
  const [expandedUmbrella, setExpandedUmbrella] = useState<string | null>(null);

  // Compute active categories dynamically based on actual user clips
  const activeCategories = (() => {
    const displayCategories = [...CATEGORIES];
    const existingCategoryNames = new Set(CATEGORIES.map(c => c.name.toLowerCase()));

    userClips.forEach(clip => {
      const umbrella = clip.umbrellaTag;
      if (umbrella && !existingCategoryNames.has(umbrella.toLowerCase())) {
        displayCategories.push({
          name: umbrella,
          icon: Sparkles, // default fallback icon
          types: []
        });
        existingCategoryNames.add(umbrella.toLowerCase());
      }
    });

    return displayCategories.map((cat) => {
      const uniqueTypesForUmbrella = Array.from(
        new Set(
          userClips
            .filter((clip) => (clip.umbrellaTag || '').toLowerCase() === cat.name.toLowerCase())
            .map((clip) => clip.typeTag || 'Other')
        )
      );

      return { ...cat, types: uniqueTypesForUmbrella };
    }).filter((cat) => cat.types.length > 0);
  })();

  if (activeCategories.length === 0) return null;

  // Sync expanded umbrella with selectedCategory from parent (e.g. navigation jump)
  useEffect(() => {
    if (selectedCategory) {
      setExpandedUmbrella(selectedCategory.umbrella);
    }
  }, [selectedCategory]);

  const handleUmbrellaClick = (name: string) => {
    if (expandedUmbrella === name) {
      if (selectedCategory?.umbrella === name && selectedCategory?.type !== null) {
        // If a subcategory was selected, reset to show all items in this umbrella
        onSelect({ umbrella: name, type: null });
      } else {
        // Collapse and clear
        setExpandedUmbrella(null);
        onSelect(null);
      }
    } else {
      // Expand and select all items in this umbrella
      setExpandedUmbrella(name);
      onSelect({ umbrella: name, type: null });
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Category Row/Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {activeCategories.map((cat) => {
          const Icon = cat.icon;
          const isExpanded = expandedUmbrella === cat.name;
          const isSelected = selectedCategory?.umbrella === cat.name;

          return (
            <div key={cat.name} className="flex flex-col">
              <button
                onClick={() => handleUmbrellaClick(cat.name)}
                className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all duration-300 font-bold ${
                  isSelected || isExpanded
                    ? 'bg-accent-yellow text-black border-black dark:border-white brutal-shadow hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow-hover'
                    : 'bg-white dark:bg-neutral-900 border-black dark:border-white text-text-primary-light dark:text-text-primary-dark hover:-translate-x-0.5 hover:-translate-y-0.5 hover:brutal-shadow-hover brutal-shadow'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={18} />
                  <span className="text-sm font-sans">{cat.name}</span>
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} />
                </motion.div>
              </button>

              {/* Mobile Expansion (inside the grid column for desktop) */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    className="overflow-hidden sm:hidden"
                  >
                    <div className="flex flex-col gap-1.5 p-2 bg-neutral-100/40 dark:bg-neutral-900/20 rounded-2xl mt-1">
                      {cat.types.map((type) => {
                        const isLeafSelected =
                          selectedCategory?.umbrella === cat.name &&
                          selectedCategory?.type === type;

                        return (
                          <button
                            key={type}
                            onClick={() => onSelect({ umbrella: cat.name, type })}
                            className={`w-full text-left px-3.5 py-2 text-xs rounded-lg font-bold transition-all uppercase tracking-wider ${
                              isLeafSelected
                                ? 'bg-black dark:bg-white text-white dark:text-black'
                                : 'text-text-primary-light dark:text-text-primary-dark hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
                            }`}
                          >
                            {type}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Desktop Drawer Expansion (rendered below the grid) */}
      <AnimatePresence>
        {expandedUmbrella && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="hidden sm:block overflow-hidden"
          >
            <div className="w-full p-6 rounded-2xl bg-white dark:bg-neutral-900 border-2 border-black dark:border-white brutal-shadow flex flex-wrap gap-3">
              {activeCategories.find((c) => c.name === expandedUmbrella)?.types.map(
                (type) => {
                  const isLeafSelected =
                    selectedCategory?.umbrella === expandedUmbrella &&
                    selectedCategory?.type === type;

                  return (
                    <button
                      key={type}
                      onClick={() => onSelect({ umbrella: expandedUmbrella, type })}
                      className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-2 rounded-lg hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_#121212] ${
                        isLeafSelected
                          ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white'
                          : 'bg-white dark:bg-neutral-900 text-black dark:text-white border-black dark:border-white'
                      }`}
                    >
                      {type}
                    </button>
                  );
                }
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
