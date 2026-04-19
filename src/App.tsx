import React, { useState, useEffect, useRef } from 'react';
import { Rss, Copy, Sparkles, AlertCircle, RefreshCw, ChevronRight, ChevronDown, Menu, Trash2, Download, Upload } from 'lucide-react';
import { fetchFeed, rewriteArticleWithAI } from './api';
import DOMPurify from 'isomorphic-dompurify';
import Markdown from 'react-markdown';

interface FeedItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  content: string;
  'content:encoded'?: string;
}

interface SavedFeed {
  title: string;
  url: string;
}

const DEFAULT_FEEDS: SavedFeed[] = [
  { title: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
  { title: 'TechCrunch', url: 'https://techcrunch.com/feed/' }
];

export default function App() {
  const [url, setUrl] = useState('');
  const [savedFeeds, setSavedFeeds] = useState<SavedFeed[]>(() => {
    const saved = localStorage.getItem('clearfeed_saved');
    return saved ? JSON.parse(saved) : DEFAULT_FEEDS;
  });
  
  const [activeFeedUrl, setActiveFeedUrl] = useState<string | null>(null);
  const [activeFeedTitle, setActiveFeedTitle] = useState<string>('');
  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);

  const [items, setItems] = useState<FeedItem[]>([]);
  const [visibleCount, setVisibleCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null);
  
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewrittenText, setRewrittenText] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('clearfeed_saved', JSON.stringify(savedFeeds));
  }, [savedFeeds]);

  const loadFeed = async (feedUrl: string) => {
    setActiveFeedUrl(feedUrl);
    setFetchingUrl(feedUrl);
    setLoading(true);
    setError('');
    setVisibleCount(5);
    
    try {
      const feed = await fetchFeed(feedUrl);
      setItems(feed.items || []);
      return feed;
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
      setItems([]);
      return null;
    } finally {
      setLoading(false);
      setFetchingUrl(null);
    }
  };

  const handleFetchFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setSelectedItem(null);
    setRewrittenText(null);
    
    const feed = await loadFeed(url);
    if (feed) {
      const newTitle = feed.title || new URL(url).hostname;
      setActiveFeedTitle(newTitle);
      setSavedFeeds(prev => {
        if (!prev.some(f => f.url === url)) {
          return [{ title: newTitle, url }, ...prev];
        }
        return prev;
      });
      setUrl('');
    }
  };

  const removeFeed = (feedUrl: string) => {
    setSavedFeeds(prev => prev.filter(f => f.url !== feedUrl));
    if (activeFeedUrl === feedUrl) {
      setActiveFeedUrl(null);
      setItems([]);
    }
  };

  const selectArticle = (item: FeedItem, feedTitle?: string) => {
    if (feedTitle) setActiveFeedTitle(feedTitle);
    setSelectedItem(item);
    setRewrittenText(null);
    setCopySuccess(false);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const handleCopy = async () => {
    let textToCopy = '';
    if (rewrittenText) {
      textToCopy = rewrittenText;
    } else if (selectedItem) {
      const html = selectedItem['content:encoded'] || selectedItem.content || selectedItem.contentSnippet;
      const stripped = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }); 
      textToCopy = selectedItem.title + '\n\n' + stripped;
    }

    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const handleRewrite = async () => {
    if (!selectedItem) return;
    setIsRewriting(true);
    
    const html = selectedItem['content:encoded'] || selectedItem.content || selectedItem.contentSnippet;
    const stripped = DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });

    try {
      const result = await rewriteArticleWithAI('Title: ' + selectedItem.title + '\n\n' + stripped);
      setRewrittenText(result);
    } catch (err: any) {
      alert(err.message || "Failed to rewrite article");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleExport = () => {
    const csvHeader = "Title,URL\n";
    const csvContent = savedFeeds.map(feed => `"${feed.title.replace(/"/g, '""')}","${feed.url.replace(/"/g, '""')}"`).join("\n");
    const dataStr = "data:text/csv;charset=utf-8," + encodeURIComponent(csvHeader + csvContent);
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "clearfeed_backup.csv");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const contents = event.target?.result as string;
        const lines = contents.split(/\r?\n/).filter(line => line.trim());
        const validFeeds: SavedFeed[] = [];
        
        const startIndex = lines[0].toLowerCase().includes('url') ? 1 : 0;
        
        for (let i = startIndex; i < lines.length; i++) {
          let line = lines[i];
          const row = [];
          let insideQuote = false;
          let currentValue = '';
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"' && line[j+1] === '"') {
              currentValue += '"';
              j++;
            } else if (char === '"') {
              insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
              row.push(currentValue);
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          row.push(currentValue);
          
          if (row.length >= 2) {
            const title = row[0].trim();
            const url = row[1].trim();
            if (title && url.startsWith('http')) {
              validFeeds.push({ title, url });
            }
          }
        }

        if (validFeeds.length > 0) {
          setSavedFeeds(prev => {
            const combined = [...prev];
            validFeeds.forEach(newFeed => {
              if (!combined.some(f => f.url === newFeed.url)) {
                combined.push(newFeed);
              }
            });
            return combined;
          });
        } else {
          alert("No valid feeds found in file.");
        }
      } catch (err) {
        alert("Failed to parse file.");
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const getCleanHtml = (html: string) => {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'img', 'figure', 'figcaption'],
      ALLOWED_ATTR: ['href', 'src', 'alt']
    });
  };

  return (
    <div className="flex h-screen bg-[#F7F3F0] text-[#2D2A26] overflow-hidden font-sans">
      
      {/* Sidebar List */}
      <div className={`flex flex-col bg-[#EFEDE9] border-r border-[#E0DCD8] w-full md:w-80 lg:w-96 shrink-0 transition-transform duration-300 md:translate-x-0 absolute md:relative z-20 h-full ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 pb-4 border-b border-[#E0DCD8] shrink-0">
          <h1 className="text-xl font-bold tracking-tight text-[#5B6D5B] flex items-center gap-2 mb-4">
            <Rss size={24} className="text-[#5B6D5B]" />
            ClearFeed
          </h1>
          <form onSubmit={handleFetchFeed} className="flex flex-col gap-2">
            <input 
              type="url" 
              placeholder="Add new RSS URL..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-[#D6D2CD] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#5B6D5B] focus:border-transparent shadow-sm"
              required
            />
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-[#5B6D5B] hover:bg-[#4E5D4E] active:scale-95 text-white font-medium py-2 px-4 rounded-full text-sm flex items-center justify-center disabled:opacity-50 transition-all shadow-md mt-1"
            >
              {fetchingUrl === url ? <RefreshCw size={16} className="animate-spin" /> : 'Add Feed'}
            </button>
          </form>
          {error && (
            <p className="mt-3 text-sm text-red-600 flex items-center gap-1">
              <AlertCircle size={14} /> {error}
            </p>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {savedFeeds.length === 0 && (
            <div className="p-6 text-center text-[#8C867E] text-sm">
              <p>No saved feeds. Add a URL above.</p>
            </div>
          )}
          
          {savedFeeds.map(feed => {
            const isActive = activeFeedUrl === feed.url;
            return (
              <div key={feed.url} className="space-y-1">
                <div className="flex items-center group">
                  <button 
                    onClick={() => {
                      if (isActive) {
                        setActiveFeedUrl(null);
                      } else {
                        setActiveFeedTitle(feed.title);
                        loadFeed(feed.url);
                      }
                    }}
                    className={`flex-1 text-left px-3 py-2 rounded-xl transition-colors flex items-center justify-between ${isActive ? 'bg-[#E5E2DE] text-[#2D2A26]' : 'hover:bg-[#E5E2DE] text-[#555049]'}`}
                  >
                    <span className="font-bold text-sm tracking-wide truncate pr-2">{feed.title}</span>
                    {isActive ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); removeFeed(feed.url); }}
                    className="p-2 ml-1 opacity-0 group-hover:opacity-100 text-[#8C867E] hover:text-red-500 transition-opacity rounded-lg hover:bg-[#E0DCD8]"
                    title="Remove feed">
                    <Trash2 size={16} />
                  </button>
                </div>

                {isActive && (
                  <div className="ml-3 pl-3 border-l-2 border-[#D6D2CD] space-y-1 pt-1 pb-2">
                    {fetchingUrl === feed.url && (
                      <div className="text-xs text-[#8C867E] py-4 px-3 flex items-center gap-2">
                        <RefreshCw size={12} className="animate-spin" /> Fetching posts...
                      </div>
                    )}
                    
                    {fetchingUrl !== feed.url && items.length === 0 && (
                      <div className="text-xs text-[#8C867E] py-2 px-3">No posts found.</div>
                    )}
                    
                    {fetchingUrl !== feed.url && items.slice(0, visibleCount).map((item, i) => (
                      <button 
                        key={i}
                        onClick={() => selectArticle(item, feed.title)}
                        className={`w-full text-left px-3 py-2 rounded-lg cursor-pointer transition-colors ${selectedItem === item ? 'bg-[#5B6D5B] text-white shadow-sm' : 'hover:bg-[#E5E2DE] text-[#555049]'}`}
                      >
                        <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${selectedItem === item ? 'opacity-80' : 'text-[#8C867E]'}`}>
                          {item.pubDate ? new Date(item.pubDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Article'}
                        </p>
                        <p className={`text-sm font-medium leading-snug line-clamp-2 ${selectedItem === item ? 'text-white' : 'text-[#555049]'}`}>
                          {item.title}
                        </p>
                      </button>
                    ))}

                    {fetchingUrl !== feed.url && items.length > visibleCount && (
                      <button 
                        onClick={() => setVisibleCount(c => c + 10)}
                        className="w-full mt-2 py-2 text-xs font-semibold uppercase tracking-wider text-[#5B6D5B] bg-[#E5E2DE] hover:bg-[#D6D2CD] rounded-lg transition-colors"
                      >
                        Load More
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[#E0DCD8] bg-[#E9E6E2] shrink-0">
          <div className="flex items-center gap-2 justify-between">
            <button onClick={handleExport} className="flex flex-1 justify-center items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#555049] hover:text-[#2D2A26] rounded-md transition-colors hover:bg-[#D6D2CD]">
              <Download size={14} />
              Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex flex-1 justify-center items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#555049] hover:text-[#2D2A26] rounded-md transition-colors hover:bg-[#D6D2CD]">
              <Upload size={14} />
              Import
            </button>
            <input type="file" accept=".csv" className="hidden" ref={fileInputRef} onChange={handleImport} />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 w-full h-full bg-[#F7F3F0]">
        {selectedItem ? (
          <>
            {/* Top Toolbar */}
            <header className="h-16 px-8 flex items-center justify-between border-b border-[#E0DCD8] bg-white/50 shrink-0 sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-[#8C867E] hover:text-black">
                  <Menu size={20} />
                </button>
                <span className="px-3 py-1 bg-[#F2EDE9] border border-[#E0DCD8] rounded-full text-xs font-medium text-[#8C867E] hidden sm:inline-block">Reading Mode</span>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-[#D6D2CD] rounded-full text-sm font-medium hover:bg-[#F9F8F7] active:scale-95 transition-all shadow-sm text-[#2D2A26]"
                >
                  <Copy size={16} />
                  <span className="hidden sm:inline">{copySuccess ? 'Copied!' : 'Copy Article'}</span>
                </button>
                <button 
                  onClick={handleRewrite}
                  disabled={isRewriting}
                  className="flex items-center gap-2 px-4 py-2 bg-[#5B6D5B] text-white rounded-full text-sm font-medium hover:bg-[#4E5D4E] active:scale-95 transition-all shadow-md disabled:opacity-50"
                  title="Make this article more readable"
                >
                  {isRewriting ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span className="hidden sm:inline">{isRewriting ? 'Rewriting...' : 'AI Rewrite'}</span>
                </button>
              </div>
            </header>

            {/* Reading View */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12 lg:px-24 bg-white">
              <div className="max-w-2xl mx-auto">
                <header className="mb-10">
                  <p className="text-[#5B6D5B] font-semibold text-sm mb-4 tracking-wide uppercase">
                    {activeFeedTitle || 'Reading Mode'}
                  </p>
                  <h1 className="text-4xl lg:text-5xl font-serif font-bold leading-tight mb-6 text-[#2D2A26]">
                    {selectedItem.title}
                  </h1>
                  <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[#F0EBE6]">
                     <div className="w-10 h-10 rounded-full bg-[#E9E6E2] flex items-center justify-center text-[#A39E96]">
                      <Rss size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#2D2A26]">
                         <a href={selectedItem.link} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">Source Link <ChevronRight size={14}/></a>
                      </p>
                      <p className="text-xs text-[#A39E96]">
                        {selectedItem.pubDate ? new Date(selectedItem.pubDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Unknown date'}
                      </p>
                    </div>
                  </div>
                </header>

                <div className="prose prose-lg max-w-none font-serif text-[#4A443F] prose-h1:text-[#2D2A26] prose-h2:text-[#2D2A26] prose-h3:text-[#2D2A26] prose-a:text-[#5B6D5B] hover:prose-a:text-[#4E5D4E] prose-img:rounded-2xl leading-relaxed">
                  {rewrittenText ? (
                    <div className="bg-[#EFEDE9] p-6 sm:p-8 rounded-2xl border border-[#E0DCD8]">
                      <div className="flex items-center gap-2 mb-6 text-[#5B6D5B]">
                        <Sparkles size={18} />
                        <span className="font-semibold uppercase tracking-widest text-xs">AI Rewritten</span>
                      </div>
                      <Markdown>{rewrittenText}</Markdown>
                    </div>
                  ) : (
                    <div 
                      className="article-content"
                      dangerouslySetInnerHTML={{ 
                        __html: getCleanHtml(selectedItem['content:encoded'] || selectedItem.content || selectedItem.contentSnippet) 
                      }} 
                    />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[#A39E96] p-8 h-full bg-white">
            <Rss size={48} className="mb-4 text-[#E0DCD8]" />
            <p className="text-lg font-medium text-[#8C867E]">Select an article to read</p>
            <p className="text-sm max-w-sm text-center mt-2 text-[#A39E96]">Articles are extracted carefully for a clean distraction-free reading experience.</p>
          </div>
        )}
      </main>
      
      {/* Overlay for mobile sidebar */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/20 z-10 md:hidden" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}
