import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToTelegraphNodes } from '../tgcloud/lib/telegraph.js';

test('htmlToTelegraphNodes converts headings, paragraphs, and inline formatting', () => {
  const html = `
    <h1>Major Breaking News</h1>
    <p>This is a <b>bold announcement</b> with an <a href="https://example.com">important link</a> and <i>italic note</i>.</p>
    <h4>Subheading Level 4</h4>
    <p>Here is some <code>inline code</code> and <s>strikethrough</s> text.</p>
  `;

  const nodes = htmlToTelegraphNodes(html);
  assert.ok(Array.isArray(nodes));
  assert.ok(nodes.length >= 4);

  // Check h1 -> h3 conversion
  assert.equal(nodes[0].tag, 'h3');
  assert.equal(nodes[0].children[0], 'Major Breaking News');

  // Check paragraph with bold, link, italic
  assert.equal(nodes[1].tag, 'p');
  const pChildren = nodes[1].children;
  assert.ok(pChildren.some((c) => c.tag === 'b' && c.children.includes('bold announcement')));
  assert.ok(pChildren.some((c) => c.tag === 'a' && c.attrs?.href === 'https://example.com'));
  assert.ok(pChildren.some((c) => c.tag === 'i' && c.children.includes('italic note')));

  // Check h4
  assert.equal(nodes[2].tag, 'h4');
  assert.equal(nodes[2].children[0], 'Subheading Level 4');
});

test('htmlToTelegraphNodes preserves blockquotes, lists, and images', () => {
  const html = `
    <blockquote>A memorable quote by a famous thinker.</blockquote>
    <ul>
      <li>First bullet item</li>
      <li>Second bullet with <b>bold</b></li>
    </ul>
    <figure>
      <img src="https://images.example.com/photo.jpg" alt="Example photo"/>
      <figcaption>Photo caption text</figcaption>
    </figure>
  `;

  const nodes = htmlToTelegraphNodes(html);

  // Blockquote
  const bq = nodes.find((n) => n.tag === 'blockquote');
  assert.ok(bq);
  assert.ok(JSON.stringify(bq).includes('A memorable quote'));

  // List
  const ul = nodes.find((n) => n.tag === 'ul');
  assert.ok(ul);
  assert.equal(ul.children.length, 2);
  assert.equal(ul.children[0].tag, 'li');
  assert.equal(ul.children[1].tag, 'li');

  // Image figure
  const fig = nodes.find((n) => n.tag === 'figure');
  assert.ok(fig);
  const imgNode = fig.children.find((c) => c.tag === 'img');
  assert.equal(imgNode?.attrs?.src, 'https://images.example.com/photo.jpg');
});

test('htmlToTelegraphNodes respects 60KB safety budget for large content', () => {
  const longParagraph = '<p>' + 'word '.repeat(3000) + '</p>';
  const massiveHtml = longParagraph.repeat(20);

  const nodes = htmlToTelegraphNodes(massiveHtml);
  const jsonSize = JSON.stringify(nodes).length;
  assert.ok(jsonSize < 62000, `JSON payload size ${jsonSize} exceeded 62000 bytes`);
});

test('htmlToTelegraphNodes correctly formats video embeds and audio players for Instant View', () => {
  const html = `
    <!--kg-card-begin: html-->
    <figure class="kg-card kg-embed-card">
      <iframe width="200" height="113" src="https://www.youtube.com/embed/BDpSbXBG8sY?feature=oembed" frameborder="0"></iframe>
    </figure>
    <!--kg-card-end: html-->
    <p>Some actual text paragraph.</p>
    <iframe src="https://playlist.megaphone.fm?p=TBIEA2761282490&episodes=1"></iframe>
    <p>   \n   \n   </p>
  `;

  const nodes = htmlToTelegraphNodes(html);

  // 1. YouTube figure MUST contain iframe with /embed/youtube, NEVER img!
  const ytFigure = nodes.find((n) => n.tag === 'figure' && n.children?.[0]?.tag === 'iframe');
  assert.ok(ytFigure, 'YouTube figure with iframe must be generated');
  assert.ok(ytFigure.children[0].attrs.src.includes('/embed/youtube'), 'Must use Telegraph native /embed/youtube route');
  assert.ok(ytFigure.children[0].attrs.src.includes('BDpSbXBG8sY'), 'Must keep video ID');

  // Verify NO invalid img tags with youtube URLs exist anywhere
  const invalidImgs = JSON.stringify(nodes).match(/"tag":"img"[^}]*youtube/gi);
  assert.equal(invalidImgs, null, 'Must NEVER emit img tag for YouTube embed');

  // 2. Audio podcast iframe MUST be rendered as an accessible player link paragraph
  const audioP = nodes.find((n) => n.tag === 'p' && JSON.stringify(n).includes('megaphone.fm'));
  assert.ok(audioP, 'Megaphone audio player link paragraph must be generated');
  assert.ok(JSON.stringify(audioP).includes('🎧'));

  // 3. Comments and empty paragraphs MUST be discarded
  assert.equal(JSON.stringify(nodes).includes('kg-card-begin'), false, 'HTML comments must be stripped');
  const emptyPs = nodes.filter((n) => n.tag === 'p' && n.children.every((c) => typeof c === 'string' && !c.trim()));
  assert.equal(emptyPs.length, 0, 'No empty whitespace paragraphs should exist');
});

test('htmlToTelegraphNodes converts HTML tables into clean monospace pre blocks', () => {
  const html = `
    <table>
      <thead>
        <tr><th>Product</th><th>Price</th></tr>
      </thead>
      <tbody>
        <tr><td>Pixel 11</td><td>$799</td></tr>
        <tr><td>Pixel 11 Pro</td><td>$999</td></tr>
      </tbody>
    </table>
  `;

  const nodes = htmlToTelegraphNodes(html);
  const preNode = nodes.find((n) => n.tag === 'pre');
  assert.ok(preNode, 'Table must be transformed into pre block');
  assert.ok(preNode.children[0].includes('Product  |  Price'));
  assert.ok(preNode.children[0].includes('Pixel 11 Pro  |  $999'));
});

