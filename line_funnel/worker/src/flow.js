// ============================================================
// flow.js — 会話フロー制御・セッション管理
// ============================================================
// セッション構造（KV に保存）:
// {
//   step: 'idle' | 'done',
//   resultType: 'L1' | null,
//   createdAt: timestamp
// }
// ============================================================

import { pushQuickReply, pushText, pushFlex, pushLiffButton } from './lineApi.js';
import {
  buildResultFlex,
  buildLimitedContentMessages,
  buildNoteMessage,
  MSG_WELCOME,
  MSG_ERROR,
} from './messages.js';

import LIMITED_CONTENTS from '../../diagnosis/limitedContents.json';
import PAID_NOTES from '../../diagnosis/paidNotes.json';

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24時間

// ── エントリポイント ──────────────────────────────────────

export async function handleLineEvent(event, env) {
  if (event.type === 'follow') {
    await sendFollowWelcome(event.source.userId, env);
    return;
  }

  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const text = event.message.text.trim();

  try {
    const session = await getSession(userId, env);
    await dispatch(userId, text, session, env);
  } catch (e) {
    console.error('flow error', e);
    await pushText(userId, MSG_ERROR, env.LINE_TOKEN);
  }
}

// ── ディスパッチ ──────────────────────────────────────────

async function dispatch(userId, text, session, env) {
  // LIFF診断からの結果受信（例: "診断結果:L1"）
  if (text.startsWith('診断結果:')) {
    const resultType = text.split(':')[1];
    return receiveLiffResult(userId, resultType, env);
  }

  if (text === 'もらう') {
    return sendLimitedContent(userId, session, env);
  }

  if (text === 'note見る') {
    return sendNoteUrl(userId, session, env);
  }

  // その他のメッセージはLIFFボタンを返す
  return sendWelcome(userId, env);
}

// ── ウェルカム ────────────────────────────────────────────

async function sendFollowWelcome(userId, env) {
  await pushText(userId, `ラビ博士のLINEへようこそ！

9問に答えるだけで、あなたの恋愛がうまくいかない理由がわかります。

▶ あなたのつまずきパターン
　→「いい人止まり」「期待して空回り」「アプリで会えない」など6タイプから特定

▶ なぜそれが起きているか
　→ 脳の認知構造・相手からの見え方・行動パターンの癖を解説

▶ 最初に直すべきこと
　→ 誠実さを捨てずに変えられる、具体的な1つの切り口

完全無料・所要時間2分です。`, env.LINE_TOKEN);

  await pushLiffButton(
    userId,
    '無料で診断を受けますか？',
    '診断をはじめる（無料）',
    `https://liff.line.me/${env.LIFF_ID}`,
    env.LINE_TOKEN,
  );
}

async function sendWelcome(userId, env) {
  await pushLiffButton(
    userId,
    MSG_WELCOME[0],
    '診断をはじめる（無料）',
    `https://liff.line.me/${env.LIFF_ID}`,
    env.LINE_TOKEN,
  );
}

// ── LIFF診断結果受信 ──────────────────────────────────────

async function receiveLiffResult(userId, resultType, env) {
  const validTypes = ['L1','L2','K1','K2','A1','A2'];
  if (!validTypes.includes(resultType)) {
    await sendWelcome(userId, env);
    return;
  }

  const session = { step: 'done', resultType, createdAt: Date.now() };
  await saveSession(userId, session, env);

  const { altText, contents } = buildResultFlex(resultType);
  await pushFlex(userId, altText, contents, env.LINE_TOKEN);
}

// ── 限定コンテンツ配信 ────────────────────────────────────

async function sendLimitedContent(userId, session, env) {
  if (!session?.resultType) {
    await sendWelcome(userId, env);
    return;
  }

  const { contentKey, pdfPath } = getResultMeta(session.resultType);
  const content = LIMITED_CONTENTS[contentKey];
  const pdfUrl = env.SITE_URL ? `${env.SITE_URL}/${pdfPath}` : null;
  const messages = buildLimitedContentMessages(session.resultType, content, pdfUrl);

  // 1通目（案内）・2通目（PDFリンク）→ テキスト
  await pushText(userId, messages.slice(0, 2), env.LINE_TOKEN);

  // 3通目（noteティザー）→ クイックリプライ
  await pushQuickReply(
    userId,
    messages[2],
    [{ label: 'noteを見る', text: 'note見る' }],
    env.LINE_TOKEN,
  );
}

// ── note URL 送信 ─────────────────────────────────────────

async function sendNoteUrl(userId, session, env) {
  if (!session?.resultType) {
    await sendWelcome(userId, env);
    return;
  }

  const { paidNoteKey } = getResultMeta(session.resultType);
  const note = PAID_NOTES[paidNoteKey];
  const message = buildNoteMessage(note);
  await pushText(userId, message, env.LINE_TOKEN);
}

// ── ヘルパー ──────────────────────────────────────────────

function getResultMeta(resultType) {
  const map = {
    L1: { contentKey: 'limited_L1', pdfPath: 'pdf/limited_L1.html', paidNoteKey: 'note_L', mainType: 'L' },
    L2: { contentKey: 'limited_L2', pdfPath: 'pdf/limited_L2.html', paidNoteKey: 'note_L', mainType: 'L' },
    K1: { contentKey: 'limited_K1', pdfPath: 'pdf/limited_K1.html', paidNoteKey: 'note_K', mainType: 'K' },
    K2: { contentKey: 'limited_K2', pdfPath: 'pdf/limited_K2.html', paidNoteKey: 'note_K', mainType: 'K' },
    A1: { contentKey: 'limited_A1', pdfPath: 'pdf/limited_A1.html', paidNoteKey: 'note_A', mainType: 'A' },
    A2: { contentKey: 'limited_A2', pdfPath: 'pdf/limited_A2.html', paidNoteKey: 'note_A', mainType: 'A' },
  };
  return map[resultType] || map['L1'];
}

// ── KVセッション管理 ──────────────────────────────────────

async function getSession(userId, env) {
  const raw = await env.KV_SESSIONS.get(userId);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSession(userId, session, env) {
  await env.KV_SESSIONS.put(userId, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}
