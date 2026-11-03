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
  assert.equal(p1.photoUrl, 'https://cdn.telesco.pe/file/photo1.jpg');
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

