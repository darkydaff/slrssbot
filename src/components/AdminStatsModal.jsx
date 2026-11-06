import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  BarChart3,
  Wifi,
  Users,
  Rss,
  FileText,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { callApi } from '../lib/api.js';
import { hapticFeedback } from '../lib/telegram.js';

export function AdminStatsModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'traffic' | 'feeds' | 'audience'
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  const fetchStats = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await callApi('get_admin_stats', {});
      if (res?.ok && res.stats) {
        setStats(res.stats);
      } else {
        throw new Error(res?.error || 'Failed to load stats');
      }
    } catch (err) {
      setError(err.message || 'Access denied or network error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRunPoll = async () => {
    hapticFeedback('medium');
    setIsPolling(true);
    try {
      await callApi('poll', {});
      await fetchStats(true);
    } catch (err) {
      console.warn('Poll trigger error:', err);
    } finally {
      setIsPolling(false);
    }
  };

  const o = stats?.overview || {};
  const a = stats?.articles || {};
  const t = stats?.traffic?.today || {};
  const feeds = stats?.feeds || {};
  const history7d = stats?.traffic?.history7d || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] bg-[var(--tg-theme-bg-color,#1e293b)] text-[var(--tg-theme-text-color,#f8fafc)] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[var(--tg-theme-secondary-bg-color,#0f172a)]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Admin Dashboard</h2>
              <p className="text-xs text-[var(--tg-theme-hint-color,#94a3b8)]">
                {stats?.timestamp ? `Updated ${new Date(stats.timestamp).toLocaleTimeString()}` : 'Live System Metrics'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-2 bg-[var(--tg-theme-secondary-bg-color,#0f172a)]/30 border-b border-slate-800 gap-1.5">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'traffic', label: 'Traffic & Cache', icon: Wifi },
            { id: 'feeds', label: 'Sources', icon: Rss },
            { id: 'audience', label: 'Audience', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const isAct = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  hapticFeedback('selection_change');
                  setActiveTab(tab.id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-xl transition-all ${
                  isAct
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-[var(--tg-theme-hint-color,#94a3b8)] hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
              <p className="text-xs">Gathering system metrics...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Access Denied or Error</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && stats && (
            <>
              {/* Tab 1: Overview */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#94a3b8)]">SOURCES</div>
                      <div className="text-2xl font-bold mt-0.5">{o.totalFeeds || 0}</div>
                      <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{o.healthyFeeds || 0} healthy</span>
                      </div>
                    </div>

                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#94a3b8)]">TOTAL USERS</div>
                      <div className="text-2xl font-bold mt-0.5">{o.totalUsers || 0}</div>
                      <div className="text-[11px] text-blue-400 mt-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{o.dau || 0} DAU (24h)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#94a3b8)]">ARTICLES TODAY</div>
                      <div className="text-2xl font-bold mt-0.5">{a.articlesToday || 0}</div>
                      <div className="text-[11px] text-[var(--tg-theme-hint-color,#94a3b8)] mt-1">
                        {a.totalArticles || 0} in database
                      </div>
                    </div>

                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#94a3b8)]">BANDWIDTH TODAY</div>
                      <div className="text-2xl font-bold mt-0.5 text-blue-400">{t.totalFormatted || '0 B'}</div>
                      <div className="text-[11px] text-emerald-400 mt-1 truncate">
                        +{t.savedFormatted || '0 B'} saved cache
                      </div>
                    </div>
                  </div>

                  {/* 7-Day Trend Chart */}
                  <div className="p-3.5 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-3 text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        7-Day Network Traffic Trend
                      </span>
                      <span className="text-[var(--tg-theme-hint-color,#94a3b8)] font-mono">
                        {stats.traffic?.weekTotalFormatted || '0 B'} total
                      </span>
                    </div>

                    <div className="h-24 flex items-end gap-2 pt-4 px-1">
                      {history7d.slice().reverse().map((day, idx) => {
                        const maxB = Math.max(1, ...history7d.map((h) => h.totalBytes));
                        const pct = Math.max(8, Math.round((day.totalBytes / maxB) * 100));
                        return (
                          <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                            <div
                              className="w-full bg-blue-600/80 hover:bg-blue-500 rounded-t-md transition-all"
                              style={{ height: `${pct}%` }}
                            />
                            <span className="text-[10px] text-slate-500 font-mono">
                              {day.date ? day.date.slice(5) : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Traffic */}
              {activeTab === 'traffic' && (
                <div className="space-y-4">
                  <div className="p-4 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800 space-y-3">
                    <h3 className="text-xs font-semibold text-[var(--tg-theme-hint-color,#94a3b8)]">
                      BANDWIDTH BREAKDOWN (TODAY)
                    </h3>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>RSS Feeds Polling</span>
                        <span className="font-semibold">{t.feedFormatted || '0 B'}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round(((t.feedBytes || 0) / (t.totalBytes || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Telegraph API</span>
                        <span className="font-semibold">{t.telegraphFormatted || '0 B'}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round(((t.telegraphBytes || 0) / (t.totalBytes || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Article Scraper & WordPress API</span>
                        <span className="font-semibold">{t.extractorFormatted || '0 B'}</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{
                            width: `${Math.min(100, Math.round(((t.extractorBytes || 0) / (t.totalBytes || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      Cache Optimization
                    </div>
                    <div className="text-xl font-bold text-emerald-300">{t.savedFormatted || '0 B'} Saved</div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Bandwidth saved thanks to HTTP 304 Not Modified headers and ETag validation, reducing compute cost and preventing feed throttling.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 3: Sources & Feeds */}
              {activeTab === 'feeds' && (
                <div className="space-y-4">
                  <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800 space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>Total Active Subscriptions:</span>
                      <b className="font-semibold">{o.totalSubscriptions || 0}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>Healthy Feeds:</span>
                      <b className="text-emerald-400 font-semibold">{o.healthyFeeds || 0}</b>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Failing / Erroring Feeds:</span>
                      <b className="text-red-400 font-semibold">{o.failingFeeds || 0}</b>
                    </div>
                  </div>

                  {feeds.topFeeds?.length > 0 && (
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] font-semibold text-[var(--tg-theme-hint-color,#94a3b8)] mb-2">
                        TOP SUBSCRIBED FEEDS
                      </div>
                      <div className="space-y-2 text-xs">
                        {feeds.topFeeds.map((f, i) => (
                          <div key={i} className="flex justify-between items-center py-1">
                            <span className="truncate pr-2">{f.title}</span>
                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded-md font-mono text-[11px]">
                              {f.subscribers} subs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {feeds.recentErrors?.length > 0 && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <div className="text-[11px] font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        FEEDS WITH ERRORS
                      </div>
                      <div className="space-y-2 text-xs">
                        {feeds.recentErrors.map((e, i) => (
                          <div key={i} className="py-1">
                            <div className="font-medium text-slate-200 truncate">{e.title}</div>
                            <div className="text-[10px] text-red-400 font-mono mt-0.5">{e.lastError}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 4: Audience */}
              {activeTab === 'audience' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] text-[var(--tg-theme-hint-color,#94a3b8)]">DAU (24h)</div>
                      <div className="text-xl font-bold mt-0.5 text-blue-400">{o.dau || 0}</div>
                    </div>
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] text-[var(--tg-theme-hint-color,#94a3b8)]">WAU (7d)</div>
                      <div className="text-xl font-bold mt-0.5 text-indigo-400">{o.wau || 0}</div>
                    </div>
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] text-[var(--tg-theme-hint-color,#94a3b8)]">MAU (30d)</div>
                      <div className="text-xl font-bold mt-0.5 text-purple-400">{o.mau || 0}</div>
                    </div>
                    <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800">
                      <div className="text-[11px] text-[var(--tg-theme-hint-color,#94a3b8)]">NEW USERS TODAY</div>
                      <div className="text-xl font-bold mt-0.5 text-emerald-400">{o.newUsersToday || 0}</div>
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)] rounded-xl border border-slate-800 space-y-2 text-xs">
                    <div className="text-[11px] font-semibold text-[var(--tg-theme-hint-color,#94a3b8)] mb-1">
                      USER READING ENGAGEMENT
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>Articles Marked Read:</span>
                      <b className="font-semibold">{a.articlesRead || 0}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800">
                      <span>Articles Starred:</span>
                      <b className="font-semibold">{a.articlesStarred || 0}</b>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Telegraph Instant View Pages:</span>
                      <b className="font-semibold text-blue-400">{a.telegraphArticlesTotal || 0}</b>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-[var(--tg-theme-secondary-bg-color,#0f172a)]/80 border-t border-slate-800 flex gap-2">
          <button
            onClick={() => {
              hapticFeedback('light');
              fetchStats(true);
            }}
            disabled={isRefreshing || loading}
            className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Stats'}</span>
          </button>

          <button
            onClick={handleRunPoll}
            disabled={isPolling || loading}
            className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-400 ${isPolling ? 'animate-bounce' : ''}`} />
            <span>{isPolling ? 'Polling...' : 'Poll Feeds'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

