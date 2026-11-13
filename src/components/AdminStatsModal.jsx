import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  BarChart3,
  Wifi,
  Users,
  Rss,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { callApi } from '../lib/api.js';
import { hapticFeedback } from '../lib/telegram.js';

function formatBytesClient(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${val} ${units[i] || 'TB'}`;
}

export function AdminStatsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'traffic' | 'feeds' | 'audience'
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStatus, setPollStatus] = useState(null); // { ok: boolean, message: string } | null
  const [selectedDayIdx, setSelectedDayIdx] = useState(null);

  const fetchStats = useCallback(async (isManual = false) => {
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
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPollStatus(null);
      setSelectedDayIdx(null);
      fetchStats(false);
    }
  }, [isOpen, fetchStats]);

  if (!isOpen) return null;

  const handleRunPoll = async () => {
    hapticFeedback('medium');
    setIsPolling(true);
    setPollStatus(null);
    try {
      const res = await callApi('poll', {});
      if (res?.ok) {
        hapticFeedback('success');
        setPollStatus({
          ok: true,
          message: `Polled ${res.feedsChecked || 0} feed(s) successfully.`,
        });
        await fetchStats(true);
      } else {
        throw new Error(res?.error || 'Poll failed');
      }
    } catch (err) {
      hapticFeedback('error');
      setPollStatus({
        ok: false,
        message: err.message || 'Failed to trigger poll',
      });
    } finally {
      setIsPolling(false);
    }
  };

  const o = stats?.overview || {};
  const a = stats?.articles || {};
  const t = stats?.traffic?.today || {};
  const feeds = stats?.feeds || {};

  // Sort 7-day history chronologically ascending (oldest -> today)
  const sortedHistory = [...(stats?.traffic?.history7d || [])].sort((x, y) =>
    String(x.date || '').localeCompare(String(y.date || ''))
  );
  const maxDayBytes = Math.max(1, ...sortedHistory.map((h) => Number(h.totalBytes || 0)));
  const activeDay =
    selectedDayIdx !== null && sortedHistory[selectedDayIdx]
      ? sortedHistory[selectedDayIdx]
      : sortedHistory[sortedHistory.length - 1] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[90vh] bg-tg-bg text-tg-text rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-tg-border">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-tg-border bg-tg-secondary/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/15 text-tg-button rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">Admin Dashboard</h2>
              <p className="text-xs text-tg-hint">
                {stats?.timestamp ? `Updated ${new Date(stats.timestamp).toLocaleTimeString()}` : 'Live System Metrics'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-tg-hint hover:text-tg-text rounded-lg hover:bg-tg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex p-2 bg-tg-secondary/40 border-b border-tg-border gap-1.5">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'traffic', label: 'Traffic', icon: Wifi },
            { id: 'feeds', label: 'Sources', icon: Rss },
            { id: 'audience', label: 'Audience', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const isAct = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  hapticFeedback('selection_change');
                  setActiveTab(tab.id);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-xl transition-all ${
                  isAct
                    ? 'bg-tg-button text-tg-button-text shadow-sm'
                    : 'text-tg-hint hover:text-tg-text hover:bg-tg-secondary'
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
          {pollStatus && (
            <div
              className={`px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                pollStatus.ok
                  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-500'
                  : 'bg-red-500/10 border-red-500/25 text-red-500'
              }`}
            >
              <span className="font-medium">{pollStatus.message}</span>
              <button
                type="button"
                onClick={() => setPollStatus(null)}
                className="opacity-70 hover:opacity-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-tg-hint">
              <RefreshCw className="w-7 h-7 animate-spin text-tg-button" />
              <p className="text-xs">Gathering system metrics...</p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs space-y-1">
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
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] font-medium text-tg-hint">SOURCES</div>
                      <div className="text-2xl font-bold mt-0.5">{o.totalFeeds || 0}</div>
                      <div className="text-[11px] text-emerald-500 mt-1 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{o.healthyFeeds || 0} healthy</span>
                      </div>
                    </div>

                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] font-medium text-tg-hint">TOTAL USERS</div>
                      <div className="text-2xl font-bold mt-0.5">{o.totalUsers || 0}</div>
                      <div className="text-[11px] text-tg-button mt-1 flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{o.dau || 0} DAU (24h)</span>
                      </div>
                    </div>

                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] font-medium text-tg-hint">ARTICLES TODAY</div>
                      <div className="text-2xl font-bold mt-0.5">{a.articlesToday || 0}</div>
                      <div className="text-[11px] text-tg-hint mt-1">
                        {a.totalArticles || 0} in database
                      </div>
                    </div>

                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] font-medium text-tg-hint">BANDWIDTH TODAY</div>
                      <div className="text-2xl font-bold mt-0.5 text-tg-button">{t.totalFormatted || '0 B'}</div>
                      <div className="text-[11px] text-emerald-500 mt-1 truncate">
                        +{t.savedFormatted || '0 B'} saved cache
                      </div>
                    </div>
                  </div>

                  {/* 7-Day Trend Chart */}
                  <div className="p-3.5 bg-tg-secondary rounded-xl border border-tg-border">
                    <div className="flex items-center justify-between mb-2 text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-tg-button" />
                        7-Day Network Traffic Trend
                      </span>
                      <span className="text-tg-hint font-mono">
                        {stats.traffic?.weekTotalFormatted || '0 B'} total
                      </span>
                    </div>

                    {activeDay && (
                      <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-tg-bg border border-tg-border flex items-center justify-between text-[11px]">
                        <span className="font-mono text-tg-hint">{activeDay.date}</span>
                        <span className="font-semibold text-tg-text">
                          {formatBytesClient(activeDay.totalBytes)}
                          {typeof activeDay.articlesFetched === 'number'
                            ? ` · ${activeDay.articlesFetched} articles`
                            : ''}
                        </span>
                      </div>
                    )}

                    {sortedHistory.length === 0 ? (
                      <div className="h-24 flex items-center justify-center text-xs text-tg-hint">
                        No daily traffic recorded yet
                      </div>
                    ) : (
                      <div className="h-28 flex items-end gap-2 pt-2 px-1">
                        {sortedHistory.map((day, idx) => {
                          const bytes = Number(day.totalBytes || 0);
                          const pct = bytes > 0 ? Math.max(10, Math.round((bytes / maxDayBytes) * 100)) : 6;
                          const isSelected =
                            selectedDayIdx === idx ||
                            (selectedDayIdx === null && idx === sortedHistory.length - 1);
                          return (
                            <button
                              key={day.date || idx}
                              type="button"
                              onClick={() => {
                                hapticFeedback('selection_change');
                                setSelectedDayIdx(idx);
                              }}
                              className="h-full flex-1 flex flex-col items-center justify-end gap-1.5 group focus:outline-none"
                              title={`${day.date}: ${formatBytesClient(bytes)}`}
                            >
                              <div className="w-full flex-1 flex items-end">
                                <div
                                  className={`w-full rounded-t-md transition-all ${
                                    isSelected
                                      ? 'bg-tg-button shadow-sm'
                                      : 'bg-blue-500/45 group-hover:bg-blue-500/75'
                                  }`}
                                  style={{ height: `${pct}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-mono ${
                                  isSelected ? 'text-tg-text font-semibold' : 'text-tg-hint'
                                }`}
                              >
                                {day.date ? day.date.slice(5) : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab 2: Traffic */}
              {activeTab === 'traffic' && (
                <div className="space-y-4">
                  <div className="p-4 bg-tg-secondary rounded-xl border border-tg-border space-y-3">
                    <h3 className="text-xs font-semibold text-tg-hint">
                      BANDWIDTH BREAKDOWN (TODAY)
                    </h3>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>RSS Feeds Polling</span>
                        <span className="font-semibold">{t.feedFormatted || '0 B'}</span>
                      </div>
                      <div className="h-2 bg-tg-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
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
                      <div className="h-2 bg-tg-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round(((t.telegraphBytes || 0) / (t.totalBytes || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Article Scraper &amp; WordPress API</span>
                        <span className="font-semibold">{t.extractorFormatted || '0 B'}</span>
                      </div>
                      <div className="h-2 bg-tg-bg rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, Math.round(((t.extractorBytes || 0) / (t.totalBytes || 1)) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                    <div className="text-xs font-semibold text-emerald-500 flex items-center gap-1.5">
                      <Zap className="w-4 h-4" />
                      Cache Optimization
                    </div>
                    <div className="text-xl font-bold text-emerald-500">{t.savedFormatted || '0 B'} Saved</div>
                    <p className="text-[11px] text-tg-hint leading-relaxed">
                      Bandwidth saved thanks to HTTP 304 Not Modified headers and ETag validation, reducing compute cost and preventing feed throttling.
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 3: Sources & Feeds */}
              {activeTab === 'feeds' && (
                <div className="space-y-4">
                  <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-tg-border">
                      <span>Total Active Subscriptions:</span>
                      <b className="font-semibold">{o.totalSubscriptions || 0}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-tg-border">
                      <span>Healthy Feeds:</span>
                      <b className="text-emerald-500 font-semibold">{o.healthyFeeds || 0}</b>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Failing / Erroring Feeds:</span>
                      <b className="text-red-500 font-semibold">{o.failingFeeds || 0}</b>
                    </div>
                  </div>

                  {feeds.topFeeds?.length > 0 && (
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] font-semibold text-tg-hint mb-2">
                        TOP SUBSCRIBED FEEDS
                      </div>
                      <div className="space-y-2 text-xs">
                        {feeds.topFeeds.map((f, i) => (
                          <div key={i} className="flex justify-between items-center py-1">
                            <span className="truncate pr-2">{f.title}</span>
                            <span className="px-2 py-0.5 bg-blue-500/10 text-tg-button rounded-md font-mono text-[11px]">
                              {f.subscribers} subs
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {feeds.recentErrors?.length > 0 && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                      <div className="text-[11px] font-semibold text-red-500 mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        FEEDS WITH ERRORS
                      </div>
                      <div className="space-y-2 text-xs">
                        {feeds.recentErrors.map((e, i) => (
                          <div key={i} className="py-1">
                            <div className="font-medium text-tg-text truncate">{e.title}</div>
                            <div className="text-[10px] text-red-500 font-mono mt-0.5 break-all">{e.lastError}</div>
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
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] text-tg-hint">DAU (24h)</div>
                      <div className="text-xl font-bold mt-0.5 text-tg-button">{o.dau || 0}</div>
                    </div>
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] text-tg-hint">WAU (7d)</div>
                      <div className="text-xl font-bold mt-0.5 text-indigo-500">{o.wau || 0}</div>
                    </div>
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] text-tg-hint">MAU (30d)</div>
                      <div className="text-xl font-bold mt-0.5 text-purple-500">{o.mau || 0}</div>
                    </div>
                    <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border">
                      <div className="text-[11px] text-tg-hint">NEW USERS TODAY</div>
                      <div className="text-xl font-bold mt-0.5 text-emerald-500">{o.newUsersToday || 0}</div>
                    </div>
                  </div>

                  <div className="p-3 bg-tg-secondary rounded-xl border border-tg-border space-y-2 text-xs">
                    <div className="text-[11px] font-semibold text-tg-hint mb-1">
                      USER READING ENGAGEMENT
                    </div>
                    <div className="flex justify-between py-1 border-b border-tg-border">
                      <span>Articles Marked Read:</span>
                      <b className="font-semibold">{a.articlesRead || 0}</b>
                    </div>
                    <div className="flex justify-between py-1 border-b border-tg-border">
                      <span>Articles Starred:</span>
                      <b className="font-semibold">{a.articlesStarred || 0}</b>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Telegraph Instant View Pages:</span>
                      <b className="font-semibold text-tg-button">{a.telegraphArticlesTotal || 0}</b>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 bg-tg-secondary/80 border-t border-tg-border flex gap-2">
          <button
            type="button"
            onClick={() => {
              hapticFeedback('light');
              fetchStats(true);
            }}
            disabled={isRefreshing || loading}
            className="flex-1 py-2.5 px-3 bg-tg-button hover:opacity-90 disabled:opacity-50 text-tg-button-text rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-opacity shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh Stats'}</span>
          </button>

          <button
            type="button"
            onClick={handleRunPoll}
            disabled={isPolling || loading}
            className="py-2.5 px-4 bg-tg-bg hover:bg-tg-secondary disabled:opacity-50 text-tg-text rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-tg-border"
          >
            <Zap className={`w-3.5 h-3.5 text-amber-500 ${isPolling ? 'animate-bounce' : ''}`} />
            <span>{isPolling ? 'Polling...' : 'Poll Feeds'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
