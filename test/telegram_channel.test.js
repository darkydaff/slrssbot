import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTelegramChannelUrl,
  extractChannelUsername,
  getCanonicalChannelUrl,
  cleanWidgetTextHtml,
  parseChannelHtml,
} from '../tgcloud/lib/telegram_channel.js';
import { formatChannelPost } from '../tgcloud/lib/formatter.js';

test('isTelegramChannelUrl accurately detects channels and ignores non-channels', () => {
  assert.equal(isTelegramChannelUrl('@durov'), true);
  assert.equal(isTelegramChannelUrl('https://t.me/Crimeanwind'), true);
  assert.equal(isTelegramChannelUrl('https://t.me/s/Crimeanwind'), true);
  assert.equal(isTelegramChannelUrl('https://telegram.me/abetka'), true);
  assert.equal(isTelegramChannelUrl('https://tg.i-c-a.su/rss/Crimeanwind'), true);

  // System routes should not be treated as channels
  assert.equal(isTelegramChannelUrl('https://t.me/joinchat/xyz123'), false);
  assert.equal(isTelegramChannelUrl('https://t.me/share/url?url=foo'), false);
  assert.equal(isTelegramChannelUrl('https://t.me/addstickers/mypack'), false);
  assert.equal(isTelegramChannelUrl('https://example.com/rss.xml'), false);
});

test('extractChannelUsername extracts correct handle across formats', () => {
  assert.equal(extractChannelUsername('@durov'), 'durov');
  assert.equal(extractChannelUsername('https://t.me/Crimeanwind'), 'Crimeanwind');
  assert.equal(extractChannelUsername('https://t.me/s/Crimeanwind'), 'Crimeanwind');
  assert.equal(extractChannelUsername('https://t.me/Crimeanwind/12345'), 'Crimeanwind');
  assert.equal(extractChannelUsername('https://tg.i-c-a.su/rss/ukrscanlate'), 'ukrscanlate');
  assert.equal(getCanonicalChannelUrl('Crimeanwind'), 'https://t.me/s/Crimeanwind');
});

test('cleanWidgetTextHtml cleans up onclick dialogs and standardizes HTML', () => {
  const raw = '<b>Important News!</b><br/><br/>Visit <a href="https://example.com" onclick="return confirm(\'Open?\')">this site</a> for details.<br/><i>End of transmission</i>';
  const cleaned = cleanWidgetTextHtml(raw);

  assert.ok(cleaned.includes('<b>Important News!</b>'));
  assert.ok(cleaned.includes('<a href="https://example.com">this site</a>'));
  assert.ok(!cleaned.includes('onclick'));
  assert.ok(cleaned.includes('\n'));

  // Test HTML entity decoding: &#33; -> !, &quot; -> "
  const rawEntities = '<b>15(&#33;) из 38 НПЗ</b> <blockquote expandable>&quot;Завтра по талонам&quot;</blockquote>';
  const cleanedEntities = cleanWidgetTextHtml(rawEntities);
  assert.ok(cleanedEntities.includes('15(!) из 38 НПЗ'));
  assert.ok(cleanedEntities.includes('"Завтра по талонам"'));
  assert.ok(!cleanedEntities.includes('&#33;'));
  assert.ok(!cleanedEntities.includes('&quot;'));
});

test('parseChannelHtml extracts posts, media, and forwarded info', () => {
  const sampleHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="Крымский ветер – Telegram">
        <meta property="og:description" content="Оперативные новости Крыма">
      </head>
      <body>
        <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="Crimeanwind/112060">
          <div class="tgme_widget_message_bubble">
            <div class="tgme_widget_message_author accent_color">
              <a class="tgme_widget_message_owner_name" href="https://t.me/Crimeanwind"><span>Крымский ветер</span></a>
            </div>
            <a class="tgme_widget_message_photo_wrap" style="background-image:url('https://cdn.telesco.pe/file/photo1.jpg')"></a>
            <div class="tgme_widget_message_text js-message_text">First test post with <b>bold</b> text.</div>
            <time datetime="2026-11-03T10:30:00+00:00">10:30</time>
          </div>
        </div>

        <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="Crimeanwind/112061">
          <div class="tgme_widget_message_bubble">
            <div class="tgme_widget_message_forwarded_from">
              <a class="tgme_widget_message_forwarded_from_name" href="https://t.me/otherchannel">Original Channel</a>
            </div>
            <div class="tgme_widget_message_text js-message_text">Forwarded content here.</div>
            <time datetime="2026-11-03T10:35:00+00:00">10:35</time>
          </div>
        </div>
      </body>
    </html>
  `;

  const parsed = parseChannelHtml(sampleHtml, 'Crimeanwind');
  assert.equal(parsed.channelTitle, 'Крымский ветер');
  assert.equal(parsed.channelDescription, 'Оперативные новости Крыма');
  assert.equal(parsed.posts.length, 2);

  // Post 1
  const p1 = parsed.posts[0];
  assert.equal(p1.id, 112060);
  assert.equal(p1.url, 'https://t.me/Crimeanwind/112060');
  assert.equal(p1.photos.length, 1);
  assert.ok(p1.photoUrl.includes('photo1.jpg'));
  assert.ok(p1.photoUrl.includes('image-proxy'));
  assert.ok(p1.textHtml.includes('<b>bold</b>'));
  assert.equal(p1.forwardedFrom, null);

  // Post 2 (forwarded)
  const p2 = parsed.posts[1];
  assert.equal(p2.id, 112061);
  assert.ok(p2.forwardedFrom);
  assert.equal(p2.forwardedFrom.name, 'Original Channel');
  assert.equal(p2.forwardedFrom.url, 'https://t.me/otherchannel');
});

test('formatChannelPost formats posts following clean Telegram channel rules without fake titles', () => {
  const post = {
    id: 112062,
    channel: 'Crimeanwind',
    url: 'https://t.me/Crimeanwind/112062',
    textHtml: '👀 "Наши глаза" всё видят: российские дроны летят над районом...',
    plainText: '👀 "Наши глаза" всё видят: российские дроны летят над районом...',
    photos: ['https://cdn.telesco.pe/file/photo.jpg'],
    photoUrl: 'https://cdn.telesco.pe/file/photo.jpg',
    forwardedFrom: null,
  };

  const formatted = formatChannelPost(post, 'Крымский ветер');
  // Must NOT include duplicated title link
  assert.ok(!formatted.text.includes('<b>[\\'));
  assert.ok(formatted.text.includes('<b>Крымский ветер</b>'));
  assert.ok(formatted.text.includes('👀 "Наши глаза" всё видят'));
  assert.ok(formatted.text.includes('https://t.me/Crimeanwind/112062'));
  assert.equal(formatted.canSendPhoto, true);
  assert.equal(formatted.photoUrl, 'https://cdn.telesco.pe/file/photo.jpg');

  // Test link_only mode
  const linkOnly = formatChannelPost(post, 'Крымский ветер', { sendMode: 'link_only' });
  assert.ok(linkOnly.text.includes('View post in Telegram'));
  assert.equal(linkOnly.photoUrl, null);
});

test('cleanWidgetTextHtml transforms spoilers and expandable blockquotes', () => {
  const rawHtml = 'Check this: <span class="tgme_widget_message_text_spoiler">Classified Info</span> and <blockquote expandable>Long citation here...</blockquote>';
  const cleaned = cleanWidgetTextHtml(rawHtml);
  assert.ok(cleaned.includes('<tg-spoiler>Classified Info</tg-spoiler>'));
  assert.ok(cleaned.includes('<blockquote expandable>Long citation here...</blockquote>'));
});

test('parseChannelHtml and formatChannelPost handle multi-photo albums and video posts', () => {
  const albumHtml = `
    <div class="tgme_widget_message" data-post="testchannel/500">
      <div class="tgme_widget_message_bubble">
        <a class="tgme_widget_message_photo_wrap photo_wrap" style="background-image:url('https://cdn.example.com/p1.jpg')"></a>
        <a class="tgme_widget_message_photo_wrap grouped_layer" style="background-image:url('https://cdn.example.com/p2.jpg')"></a>
        <a class="tgme_widget_message_photo_wrap grouped_layer" style="background-image:url('https://cdn.example.com/p3.jpg')"></a>
        <div class="tgme_widget_message_text js-message_text">Album post with 3 photos</div>
        <time datetime="2026-11-03T11:00:00Z">11:00</time>
      </div>
    </div>
    <div class="tgme_widget_message" data-post="testchannel/501">
      <div class="tgme_widget_message_bubble">
        <div class="tgme_widget_message_video_player js-message_video_player"></div>
        <i class="tgme_widget_message_video_thumb video_thumb" style="background-image:url('https://cdn.example.com/thumb.jpg')"></i>
        <div class="tgme_widget_message_text js-message_text">Video post</div>
        <time datetime="2026-11-03T11:05:00Z">11:05</time>
      </div>
    </div>
  `;

  const parsed = parseChannelHtml(albumHtml, 'testchannel');
  assert.equal(parsed.posts.length, 2);

  // Album Post
  const p1 = parsed.posts[0];
  assert.equal(p1.photos.length, 3);
  assert.equal(p1.photoUrl, 'https://cdn.example.com/p1.jpg');
  const fmtAlbum = formatChannelPost(p1, 'Test Channel');
  assert.equal(fmtAlbum.canSendMediaGroup, true);
  assert.equal(fmtAlbum.photos.length, 3);

  // Video Post
  const p2 = parsed.posts[1];
  assert.equal(p2.hasVideo, true);
  const fmtVideo = formatChannelPost(p2, 'Test Channel');
  assert.equal(fmtVideo.hasVideo, true);
  assert.ok(fmtVideo.text.includes('Watch Video in Telegram'));
  assert.ok(fmtVideo.replyMarkup?.inline_keyboard?.[0]?.[0]?.text?.includes('Watch Video'));
});

test('parseChannelHtml extracts playable video URL and enables canSendVideo', () => {
  const videoPostHtml = `
    <div class="tgme_widget_message" data-post="ukrscanlate/1832">
      <div class="tgme_widget_message_bubble">
        <a class="tgme_widget_message_video_player js-message_video_player" href="https://t.me/ukrscanlate/1832">
          <i class="tgme_widget_message_video_thumb" style="background-image:url('https://cdn4.telesco.pe/file/thumb.jpg')"></i>
        </a>
        <video src="https://cdn4.telesco.pe/file/bodycam_video.mp4?token=xyz"></video>
        <div class="tgme_widget_message_text js-message_text">Bodycam footage from front line.</div>
        <time datetime="2026-11-04T10:10:31.000Z">10:10</time>
      </div>
    </div>
  `;

  const parsed = parseChannelHtml(videoPostHtml, 'ukrscanlate');
  assert.equal(parsed.posts.length, 1);
  const post = parsed.posts[0];
  assert.equal(post.hasVideo, true);
  assert.ok(post.videoUrl);
  assert.ok(post.videoUrl.includes('image-proxy'));
  assert.ok(post.videoUrl.includes('bodycam_video.mp4'));

  const formatted = formatChannelPost(post, 'Підслухано сканлейт');
  assert.equal(formatted.canSendVideo, true);
  assert.equal(formatted.videoUrl, post.videoUrl);
  assert.ok(formatted.text.includes('Bodycam footage'));
});

test('formatChannelPost generates dual Instant View and Channel buttons when telegraphUrl is provided', () => {
  const post = {
    id: 999,
    channel: 'durov',
    url: 'https://t.me/durov/999',
    textHtml: 'Detailed analytical post by Telegram founder about future of digital freedom...',
    plainText: 'Detailed analytical post by Telegram founder about future of digital freedom...',
    photos: [],
    photoUrl: null,
    hasVideo: false,
    forwardedFrom: null,
  };

  const formatted = formatChannelPost(post, 'Du Rove', {
    telegraphUrl: 'https://telegra.ph/durov-future-01-01',
  });

  assert.ok(formatted.text.includes('⚡ <a href="https://telegra.ph/durov-future-01-01">Instant View</a>'));
  assert.ok(formatted.text.includes('🔗 <a href="https://t.me/durov/999">View in Telegram</a>'));

  // Verify inline buttons
  const buttons = formatted.replyMarkup?.inline_keyboard;
  assert.ok(Array.isArray(buttons));
  assert.equal(buttons[0][0].text, '⚡ Instant View');
  assert.equal(buttons[0][0].url, 'https://telegra.ph/durov-future-01-01');
  assert.equal(buttons[0][1].text, '📢 Channel Post');
  assert.equal(buttons[0][1].url, 'https://t.me/durov/999');
});

test('parseChannelHtml and formatChannelPost correctly handle reply-to posts without mixing text and media', () => {
  const replyScenarioHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta property="og:title" content="Крымский ветер">
      </head>
      <body>
        <!-- Post 112175: Initial post without reply -->
        <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="Crimeanwind/112175">
          <div class="tgme_widget_message_bubble">
            <div class="tgme_widget_message_author accent_color">
              <a class="tgme_widget_message_owner_name" href="https://t.me/Crimeanwind"><span>Крымский ветер</span></a>
            </div>
            <div class="tgme_widget_message_text js-message_text">❌💡В Симферополе, Севастополе и Ялте около 14.00 полностью пропал свет, сообщают подписчики</div>
            <time datetime="2026-11-05T12:00:00+00:00">14:00</time>
          </div>
        </div>

        <!-- Post 112177: Reply to 112175 with its own photo and UPD text -->
        <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="Crimeanwind/112177">
          <div class="tgme_widget_message_bubble">
            <div class="tgme_widget_message_author accent_color">
              <a class="tgme_widget_message_owner_name" href="https://t.me/Crimeanwind"><span>Крымский ветер</span></a>
            </div>
            <a class="tgme_widget_message_reply" href="https://t.me/Crimeanwind/112175">
              <i class="tgme_widget_message_reply_thumb" style="background-image:url('https://cdn.telesco.pe/file/old_thumb.jpg')"></i>
              <span class="tgme_widget_message_author_name">Крымский ветер</span>
              <div class="tgme_widget_message_text js-message_reply_text">❌💡В Симферополе, Севастополе и Ялте около 14.00 полностью пропал свет, сообщают подписчики</div>
            </a>
            <a class="tgme_widget_message_photo_wrap photo_wrap" style="background-image:url('https://cdn.telesco.pe/file/photo112177.jpg')"></a>
            <div class="tgme_widget_message_text js-message_text">UPD А также: Красноперекопск Саки Бахчисарай Симферопольский район Алушта</div>
            <time datetime="2026-11-05T12:30:00+00:00">14:30</time>
          </div>
        </div>

        <!-- Post 112178: Reply to 112177 with Aksenov photo and statement -->
        <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="Crimeanwind/112178">
          <div class="tgme_widget_message_bubble">
            <div class="tgme_widget_message_author accent_color">
              <a class="tgme_widget_message_owner_name" href="https://t.me/Crimeanwind"><span>Крымский ветер</span></a>
            </div>
            <a class="tgme_widget_message_reply" href="https://t.me/Crimeanwind/112177">
              <i class="tgme_widget_message_reply_thumb" style="background-image:url('https://cdn.telesco.pe/file/photo112177.jpg')"></i>
              <span class="tgme_widget_message_author_name">Крымский ветер</span>
              <div class="tgme_widget_message_text js-message_reply_text">UPD А также: Красноперекопск Саки Бахчисарай...</div>
            </a>
            <a class="tgme_widget_message_photo_wrap photo_wrap" style="background-image:url('https://cdn.telesco.pe/file/aksenov_photo.jpg')"></a>
            <div class="tgme_widget_message_text js-message_text">Гауляйтер Аксенов доложил об очередной "аварии на магистральных энергосетях" за пределами Крыма. "С завтрашнего дня введем электричество по талонам, как было с бензином", - добавил он.</div>
            <time datetime="2026-11-05T13:00:00+00:00">15:00</time>
          </div>
        </div>
      </body>
    </html>
  `;

  const parsed = parseChannelHtml(replyScenarioHtml, 'Crimeanwind');
  assert.equal(parsed.posts.length, 3);

  // Post 112175
  const p1 = parsed.posts[0];
  assert.equal(p1.id, 112175);
  assert.equal(p1.replyTo, null);
  assert.ok(p1.plainText.includes('полностью пропал свет'));
  assert.equal(p1.photos.length, 0);

  // Post 112177: Must NOT have 112175's text as its own text, and must NOT have old_thumb as its photo!
  const p2 = parsed.posts[1];
  assert.equal(p2.id, 112177);
  assert.ok(p2.replyTo);
  assert.equal(p2.replyTo.url, 'https://t.me/Crimeanwind/112175');
  assert.equal(p2.replyTo.author, 'Крымский ветер');
  assert.ok(p2.replyTo.text.includes('полностью пропал свет'));

  // Post 112177 own content
  assert.ok(p2.plainText.startsWith('UPD А также: Красноперекопск'));
  assert.ok(!p2.plainText.includes('полностью пропал свет')); // Should NOT contain reply quote text!
  assert.equal(p2.photos.length, 1);
  assert.ok(p2.photos[0].includes('photo112177.jpg'));
  assert.ok(!p2.photos[0].includes('old_thumb.jpg')); // Reply thumb must be excluded!

  const fmtP2 = formatChannelPost(p2, 'Крымский ветер');
  assert.ok(fmtP2.text.includes('↩️ In reply to <a href="https://t.me/Crimeanwind/112175">Post #112175</a>'));
  assert.ok(fmtP2.text.includes('UPD А также: Красноперекопск'));
  assert.ok(!fmtP2.text.includes('полностью пропал свет'));

  // Post 112178: Must have Aksenov text and photo, NOT 112177's UPD text or 112177's photo!
  const p3 = parsed.posts[2];
  assert.equal(p3.id, 112178);
  assert.ok(p3.replyTo);
  assert.equal(p3.replyTo.url, 'https://t.me/Crimeanwind/112177');
  assert.ok(p3.replyTo.text.includes('UPD А также: Красноперекопск'));

  // Post 112178 own content
  assert.ok(p3.plainText.includes('Гауляйтер Аксенов доложил'));
  assert.ok(!p3.plainText.includes('Красноперекопск')); // Must NOT contain reply quote!
  assert.equal(p3.photos.length, 1);
  assert.ok(p3.photos[0].includes('aksenov_photo.jpg'));
  assert.ok(!p3.photos[0].includes('photo112177.jpg')); // Must NOT contain reply photo!

  const fmtP3 = formatChannelPost(p3, 'Крымский ветер');
  assert.ok(fmtP3.text.includes('↩️ In reply to <a href="https://t.me/Crimeanwind/112177">Post #112177</a>'));
  assert.ok(fmtP3.text.includes('Гауляйтер Аксенов доложил'));
  assert.ok(!fmtP3.text.includes('Красноперекопск'));
});


