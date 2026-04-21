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
  // リッチメニュー・クイックリプライからのコマンド
  if (text === 'note見る') {
    return sendNoteUrl(userId, session, env);
  }
  if (text === '結果を受け取る') {
    return sendLimitedContent(userId, session, env);
  }
  if (text === 'スタート' || text === '診断を受ける') {
    return sendWelcome(userId, env);
  }

  // ブラウザ診断からのタイプコード受信（L1, L2, K1, K2, A1, A2）
  const validTypes = ['L1','L2','K1','K2','A1','A2'];
  if (validTypes.includes(text.toUpperCase())) {
    return receiveLiffResult(userId, text.toUpperCase(), env);
  }

  // セッション状態で分岐
  if (session?.step === 'done') {
    return sendDoneGuide(userId, env);
  }

  // 新規 or 不明 → 軽い案内
  return sendMenuGuide(userId, env);
}

// ── ウェルカム ────────────────────────────────────────────

async function sendFollowWelcome(userId, env) {
  await pushText(
    userId,
    `ラビ博士のLINEへようこそ！\n\n9問に答えるだけで、\nあなたの恋愛が止まりやすいポイントがわかります。\n\nわかることは3つです。\n\n・なぜ同じ失敗を繰り返しやすいのか\n・相手からどう見えやすいのか\n・最初に変えるべきことは何か\n\n「いい人止まり」\n「期待して空回りする」\n「アプリで会えない」\nそんな悩みを、感覚ではなく整理して見える化します。\n\n完全無料、所要時間は約2分です。\n診断後すぐに、あなた専用の解説をこのトークで受け取れます。`,
    env.LINE_TOKEN,
  );
  await pushLiffButton(
    userId,
    '下のボタンから診断を始めてください。',
    '無料で診断する',
    `https://liff.line.me/${env.LIFF_ID}`,
    env.LINE_TOKEN,
  );
}

async function sendWelcome(userId, env) {
  return sendMenuGuide(userId, env);
}

async function sendMenuGuide(userId, env) {
  await pushLiffButton(
    userId,
    `ラビ博士です。\n\n9問に答えるだけで、あなたの恋愛がうまくいかない理由がわかります。\n所要時間2分・完全無料です。`,
    '診断をはじめる（無料）',
    `https://liff.line.me/${env.LIFF_ID}`,
    env.LINE_TOKEN,
  );
}

async function sendDoneGuide(userId, env) {
  await pushText(
    userId,
    `診断結果はお手元にあります。\n\nコンテンツの再取得やnoteの確認は、下のメニューからどうぞ。\n再診断したい場合は「診断を受ける」をタップしてください。`,
    env.LINE_TOKEN,
  );
}

// ── LIFF診断結果受信 ──────────────────────────────────────

export async function receiveLiffResult(userId, resultType, env) {
  const validTypes = ['L1','L2','K1','K2','A1','A2'];
  if (!validTypes.includes(resultType)) {
    await sendWelcome(userId, env);
    return;
  }

  const session = { step: 'done', resultType, createdAt: Date.now() };
  await saveSession(userId, session, env);

  // 1. 結果Flexカード
  const { altText, contents } = buildResultFlex(resultType);
  await pushFlex(userId, altText, contents, env.LINE_TOKEN);

  // 2. 限定コンテンツを自動送信（ボタン不要）
  const { contentKey, pdfPath, paidNoteKey } = getResultMeta(resultType);
  const content = LIMITED_CONTENTS[contentKey];
  const pdfUrl = env.SITE_URL ? `${env.SITE_URL}/${pdfPath}` : null;
  const messages = buildLimitedContentMessages(resultType, content, pdfUrl);

  await pushText(userId, messages.slice(0, 2), env.LINE_TOKEN);

  await pushQuickReply(
    userId,
    messages[2],
    [{ label: 'noteを見る', text: 'note見る' }],
    env.LINE_TOKEN,
  );
}

// ── 限定コンテンツ配信 ────────────────────────────────────

async function sendLimitedContent(userId, session, env) {
  // セッションがある場合 → そのまま結果送信
  if (session?.resultType) {
    const { contentKey, pdfPath } = getResultMeta(session.resultType);
    const content = LIMITED_CONTENTS[contentKey];
    const pdfUrl = env.SITE_URL ? `${env.SITE_URL}/${pdfPath}` : null;
    const messages = buildLimitedContentMessages(session.resultType, content, pdfUrl);

    await pushText(userId, messages.slice(0, 2), env.LINE_TOKEN);
    await pushQuickReply(
      userId,
      messages[2],
      [{ label: 'noteを見る', text: 'note見る' }],
      env.LINE_TOKEN,
    );
    return;
  }

  // セッションがない場合（ブラウザ診断から来た人）→ 色分けFlexボタン
  await pushFlex(
    userId,
    '診断結果を受け取る',
    buildTypeSelectFlex(),
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
  const message = buildNoteMessage(note, session.resultType);
  if (message.type === 'flex') {
    await pushFlex(userId, message.altText, message.contents, env.LINE_TOKEN);
  } else {
    await pushText(userId, message.text, env.LINE_TOKEN);
  }
}

// ── ヘルパー ──────────────────────────────────────────────

function buildTypeSelectFlex() {
  const types = [
    { code: 'L1', label: 'いい人止まり・無難化型', color: '#4a9eff' },
    { code: 'L2', label: 'いい人止まり・遠慮過多型', color: '#4a9eff' },
    { code: 'K1', label: '期待先行・妄想先行型', color: '#f0b429' },
    { code: 'K2', label: '期待先行・不安過敏型', color: '#f0b429' },
    { code: 'A1', label: 'アプリ失速・プロフ弱者型', color: '#4caf8a' },
    { code: 'A2', label: 'アプリ失速・会話失速型', color: '#4caf8a' },
  ];

  return {
    type: 'bubble',
    size: 'giga',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#08080f',
      paddingAll: '20px',
      contents: [
        {
          type: 'text',
          text: '診断結果を受け取る',
          size: 'lg',
          weight: 'bold',
          color: '#f0f0f8',
        },
        {
          type: 'text',
          text: 'ブラウザ診断で表示されたタイプを選んでください',
          size: 'xs',
          color: '#7070a0',
          margin: 'sm',
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#0d0d1a',
      paddingAll: '16px',
      spacing: 'sm',
      contents: types.map(t => ({
        type: 'button',
        action: {
          type: 'message',
          label: t.label,
          text: t.code,
        },
        style: 'primary',
        color: t.color,
        height: 'sm',
        margin: 'sm',
      })),
    },
  };
}

function getResultMeta(resultType) {
  const map = {
    L1: { contentKey: 'limited_L1', pdfPath: 'pdf/limited_L1.html', paidNoteKey: 'note_L1', mainType: 'L' },
    L2: { contentKey: 'limited_L2', pdfPath: 'pdf/limited_L2.html', paidNoteKey: 'note_L2', mainType: 'L' },
    K1: { contentKey: 'limited_K1', pdfPath: 'pdf/limited_K1.html', paidNoteKey: 'note_K1', mainType: 'K' },
    K2: { contentKey: 'limited_K2', pdfPath: 'pdf/limited_K2.html', paidNoteKey: 'note_K2', mainType: 'K' },
    A1: { contentKey: 'limited_A1', pdfPath: 'pdf/limited_A1.html', paidNoteKey: 'note_A1', mainType: 'A' },
    A2: { contentKey: 'limited_A2', pdfPath: 'pdf/limited_A2.html', paidNoteKey: 'note_A2', mainType: 'A' },
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
