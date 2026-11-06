/**
 * lib/widgets/admin_stats_widget.js — Telegram Widget-Sandbox Mini-HTML Dashboard.
 * Conforms to Widget Profile 1 (https://github.com/TelegramMessenger/widget-sandbox).
 * Size budget: < 32 KB uncompressed, < 4096 B compressed (zlib level 9).
 */

import { formatBytes } from '../metrics.js';

/**
 * Returns self-contained mini-HTML string for Telegram widget-sandbox.
 * @returns {string}
 */
export function getAdminStatsWidgetHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
:root{--bg:var(--tg-theme-bg-color,#17212b);--txt:var(--tg-theme-text-color,#f5f5f5);--h:var(--tg-theme-hint-color,#708499);--btn:var(--tg-theme-button-color,#5288c1);--btntxt:var(--tg-theme-button-text-color,#ffffff);--sbg:var(--tg-theme-secondary-bg-color,#232e3c);--g:#3cc56b;--r:#e55959}
body{margin:0;padding:12px;font:14px/1.3 system-ui,sans-serif;background:var(--bg);color:var(--txt);font-variant-numeric:tabular-nums;user-select:none;-webkit-user-select:none}
.hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.tl{font-size:16px;font-weight:700;display:flex;align-items:center;gap:6px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--g);display:inline-block;box-shadow:0 0 6px var(--g)}
.sub{font-size:11px;color:var(--h)}
.nav{display:flex;gap:4px;background:var(--sbg);padding:3px;border-radius:10px;margin-bottom:12px}
.tab{flex:1;text-align:center;padding:6px 0;font-size:12px;font-weight:600;border-radius:8px;cursor:pointer;color:var(--h);transition:.2s}
.tab.act{background:var(--btn);color:var(--btntxt)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.card{background:var(--sbg);padding:10px;border-radius:10px}
.clab{font-size:11px;color:var(--h);margin-bottom:2px}
.cval{font-size:18px;font-weight:700}
.csub{font-size:11px;color:var(--g);margin-top:2px}
.chart-box{background:var(--sbg);padding:10px;border-radius:10px;margin-bottom:12px}
.ch-title{font-size:12px;font-weight:600;margin-bottom:6px;display:flex;justify-content:space-between}
svg{display:block;width:100%;height:60px;overflow:visible}
.bar{height:6px;border-radius:3px;background:rgba(255,255,255,.1);margin:4px 0 8px;overflow:hidden}
.fill{height:100%;background:var(--btn);border-radius:3px}
.rw{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.05)}
.rw:last-child{border:none}
.ft{display:flex;gap:8px;align-items:center;margin-top:10px}
.btn{flex:1;background:var(--btn);color:var(--btntxt);border:none;border-radius:8px;padding:8px 0;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px}
.btn.sec{background:var(--sbg);color:var(--txt)}
</style></head>
<body>
<div class="hd"><div><div class="tl"><span class="dot"></span>RSS Bot Admin</div><div class="sub" id="up">Live Stats</div></div><div class="sub" id="ver">v2.0</div></div>
<div class="nav">
<div class="tab act" onclick="sw(0)">Overview</div>
<div class="tab" onclick="sw(1)">Traffic</div>
<div class="tab" onclick="sw(2)">Feeds</div>
<div class="tab" onclick="sw(3)">Audience</div>
</div>

<div id="p0">
<div class="grid">
<div class="card"><div class="clab">SOURCES</div><div class="cval" id="f_tot">--</div><div class="csub" id="f_sub">-- healthy</div></div>
<div class="card"><div class="clab">TOTAL USERS</div><div class="cval" id="u_tot">--</div><div class="csub" id="u_dau">-- DAU</div></div>
<div class="card"><div class="clab">ARTICLES TODAY</div><div class="cval" id="a_tod">--</div><div class="csub" id="a_tot">-- in DB</div></div>
<div class="card"><div class="clab">TODAY TRAFFIC</div><div class="cval" id="b_tod">--</div><div class="csub" id="b_sav">-- saved</div></div>
</div>
<div class="chart-box"><div class="ch-title"><span>7-Day Activity Trend</span><span id="ch_sum" style="color:var(--btn)"></span></div>
<svg id="sv" viewBox="0 0 300 60" preserveAspectRatio="none"><path id="ln" fill="none" stroke="var(--btn)" stroke-width="2.5" stroke-linecap="round"/><path id="ar" fill="var(--btn)" fill-opacity=".18"/></svg>
</div>
</div>

<div id="p1" style="display:none">
<div class="card" style="margin-bottom:8px">
<div class="rw"><span>RSS Feeds Inbound</span><b id="t_fd">--</b></div>
<div class="bar"><div class="fill" id="t_fdb"></div></div>
<div class="rw"><span>Telegraph API</span><b id="t_tg">--</b></div>
<div class="bar"><div class="fill" id="t_tgb"></div></div>
<div class="rw"><span>Full-text Extractor</span><b id="t_ex">--</b></div>
<div class="bar"><div class="fill" id="t_exb"></div></div>
</div>
<div class="card"><div class="clab">BANDWIDTH OPTIMIZATION</div><div class="cval" style="color:var(--g)" id="t_sav">--</div><div class="csub" style="color:var(--h)">Saved via ETag & 304 Not Modified cache</div></div>
</div>

<div id="p2" style="display:none">
<div class="card" style="margin-bottom:8px">
<div class="rw"><span>Healthy Feeds</span><b style="color:var(--g)" id="f_ok">--</b></div>
<div class="rw"><span>Failing / Erroring</span><b style="color:var(--r)" id="f_er">--</b></div>
<div class="rw"><span>Total Subscriptions</span><b id="f_subtot">--</b></div>
</div>
<div class="card"><div class="clab" style="margin-bottom:6px">TOP SUBSCRIBED FEEDS</div><div id="top_lst"></div></div>
</div>

<div id="p3" style="display:none">
<div class="grid">
<div class="card"><div class="clab">DAU (24h)</div><div class="cval" id="au_dau">--</div></div>
<div class="card"><div class="clab">WAU (7d)</div><div class="cval" id="au_wau">--</div></div>
<div class="card"><div class="clab">MAU (30d)</div><div class="cval" id="au_mau">--</div></div>
<div class="card"><div class="clab">NEW TODAY</div><div class="cval" id="au_new">--</div></div>
</div>
<div class="card"><div class="rw"><span>Articles Read</span><b id="au_rd">--</b></div><div class="rw"><span>Telegraph Pages</span><b id="au_tg">--</b></div></div>
</div>

<div class="ft">
<button class="btn" onclick="req('refresh')">🔄 Refresh</button>
<button class="btn sec" onclick="req('poll')">⚡ Poll Now</button>
</div>

<script>
const T=window.TelegramWidget,$=id=>document.getElementById(id);
let curTab=0;
function sw(idx){
  curTab=idx;
  for(let i=0;i<4;i++){
    const tab=document.querySelectorAll('.tab')[i];
    const p=$('p'+i);
    if(tab)tab.className='tab'+(i===idx?' act':'');
    if(p)p.style.display=i===idx?'block':'none';
  }
}
function fb(bytes){
  if(!bytes||bytes<=0)return '0 B';
  const u=['B','KB','MB','GB'];
  const i=Math.floor(Math.log(bytes)/Math.log(1024));
  return (bytes/Math.pow(1024,i)).toFixed(i===0?0:1)+' '+(u[i]||'TB');
}
function draw(anim){
  let d=null;
  try{d=T&&T.publicData?JSON.parse(T.publicData):null;}catch(e){}
  if(!d){
    d={t:Math.floor(Date.now()/1000),u:[28,12,24,28,3],f:[18,17,1,34],a:[42,850,15,64],b:[15800000,9200000,2400000,4200000,38000000],h:[8,12,10,14,19,16,15],top:[['TechCrunch',12],['Ars Technica',9],['The Verge',8]],err:[['Broken Feed','404 Not Found']]};
  }
  const date=new Date(d.t*1000);
  $('up').textContent='Updated '+date.toLocaleTimeString();
  $('f_tot').textContent=d.f[0];
  $('f_sub').textContent=d.f[1]+' healthy, '+d.f[2]+' err';
  $('u_tot').textContent=d.u[0];
  $('u_dau').textContent=d.u[1]+' DAU';
  $('a_tod').textContent=d.a[0];
  $('a_tot').textContent=d.a[1]+' in DB';
  $('b_tod').textContent=fb(d.b[0]);
  $('b_sav').textContent=fb(d.b[4])+' saved';
  const totB=Math.max(1,d.b[0]);
  $('t_fd').textContent=fb(d.b[1]);
  $('t_fdb').style.width=Math.min(100,Math.round(d.b[1]/totB*100))+'%';
  $('t_tg').textContent=fb(d.b[2]);
  $('t_tgb').style.width=Math.min(100,Math.round(d.b[2]/totB*100))+'%';
  $('t_ex').textContent=fb(d.b[3]);
  $('t_exb').style.width=Math.min(100,Math.round(d.b[3]/totB*100))+'%';
  $('t_sav').textContent=fb(d.b[4]);
  $('f_ok').textContent=d.f[1];
  $('f_er').textContent=d.f[2];
  $('f_subtot').textContent=d.f[3];
  let topH='';
  (d.top||[]).forEach(item=>{topH+='<div class="rw"><span>'+item[0]+'</span><b>'+item[1]+' subs</b></div>';});
  $('top_lst').innerHTML=topH||'<div class="sub">No subscriptions yet</div>';
  $('au_dau').textContent=d.u[1];
  $('au_wau').textContent=d.u[2];
  $('au_mau').textContent=d.u[3];
  $('au_new').textContent=d.u[4];
  $('au_rd').textContent=d.a[3];
  $('au_tg').textContent=d.a[2];
  const h=d.h||[0,0,0,0,0,0,0];
  const max=Math.max(1,...h);
  const W=300,H=60,n=h.length;
  const pts=h.map((v,i)=>[i*(W/(n-1)),H-8-(v/max)*(H-16)]);
  let path='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(let i=1;i<n;i++)path+=' L'+pts[i][0].toFixed(1)+','+pts[i][1].toFixed(1);
  $('ln').setAttribute('d',path);
  $('ar').setAttribute('d',path+' L'+W+','+H+' L0,'+H+' Z');
}
function req(action){
  if(T&&T.HapticFeedback)T.HapticFeedback.impactOccurred('light');
  if(T&&T.sendRequest){
    $('up').textContent='Refreshing...';
    T.sendRequest('stats:'+action,(res)=>{draw(true);});
  }
}
draw(false);
if(T){
  T.onEvent('publicDataChanged',()=>draw(true));
  T.onEvent('themeChanged',()=>draw(false));
  if(T.ready)T.ready();
}
</script>
</body></html>`;
}

/**
 * Format plain text summary for message captions and notifications.
 * @param {object} s
 * @returns {string}
 */
export function formatAdminStatsTextSummary(s) {
  const o = s.overview || {};
  const a = s.articles || {};
  const t = s.traffic?.today || {};
  return `📊 Admin Stats — Feeds: ${o.totalFeeds || 0} (${o.healthyFeeds || 0} healthy) | Users: ${o.totalUsers || 0} (DAU: ${o.dau || 0}) | Articles Today: ${a.articlesToday || 0} | Traffic: ${t.totalFormatted || '0 B'}`;
}

/**
 * Format rich HTML message for fallback when sendWidget is not supported by API server.
 * @param {object} s
 * @returns {string}
 */
export function formatAdminStatsRichHtml(s) {
  const o = s.overview || {};
  const a = s.articles || {};
  const t = s.traffic?.today || {};
  const feeds = s.feeds || {};

  const topList = (feeds.topFeeds || [])
    .slice(0, 3)
    .map((f, i) => `  ${i + 1}. <b>${f.title}</b> — ${f.subscribers} subs`)
    .join('\n');

  return `📊 <b>RSS Bot Admin Dashboard</b> (Creator Only)\n` +
    `<i>Updated ${new Date(s.timestamp || Date.now()).toLocaleTimeString()}</i>\n\n` +
    `📡 <b>Sources & Feeds:</b>\n` +
    `• Total Sources: <b>${o.totalFeeds || 0}</b>\n` +
    `• Health: <b>${o.healthyFeeds || 0}</b> healthy, <b>${o.failingFeeds || 0}</b> errors\n` +
    `• Total Subscriptions: <b>${o.totalSubscriptions || 0}</b>\n\n` +
    `👥 <b>Audience & Engagement:</b>\n` +
    `• Total Users: <b>${o.totalUsers || 0}</b>\n` +
    `• Daily Active Users (DAU): <b>${o.dau || 0}</b>\n` +
    `• Weekly Active Users (WAU): <b>${o.wau || 0}</b>\n` +
    `• Monthly Active Users (MAU): <b>${o.mau || 0}</b>\n` +
    `• New Users Today: <b>${o.newUsersToday || 0}</b>\n\n` +
    `📰 <b>Articles Throughput:</b>\n` +
    `• Fetched Today: <b>${a.articlesToday || 0}</b>\n` +
    `• Total in Database: <b>${a.totalArticles || 0}</b>\n` +
    `• Telegraph Pages Created: <b>${a.telegraphArticlesTotal || 0}</b>\n` +
    `• Articles Read: <b>${a.articlesRead || 0}</b> | Starred: <b>${a.articlesStarred || 0}</b>\n\n` +
    `🌐 <b>Network Traffic (Today):</b>\n` +
    `• Total Bandwidth: <b>${t.totalFormatted || '0 B'}</b>\n` +
    `• RSS Feeds Inbound: <b>${t.feedFormatted || '0 B'}</b>\n` +
    `• Telegraph API: <b>${t.telegraphFormatted || '0 B'}</b>\n` +
    `• Article Extractor: <b>${t.extractorFormatted || '0 B'}</b>\n` +
    `• <b>Traffic Saved (304 Cache):</b> <b>${t.savedFormatted || '0 B'}</b>\n` +
    (topList ? `\n🏆 <b>Top Feeds:</b>\n${topList}\n` : '');
}

