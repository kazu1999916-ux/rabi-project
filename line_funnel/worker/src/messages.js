// ============================================================
// messages.js — 全メッセージテキスト定義
// {{ }} はGPTで生成した本文に差し替えてください
// ============================================================

import { QUESTIONS, RESULT_TYPES } from './diagnosis.js';

// ── 初回メッセージ ─────────────────────────────────────────

export const MSG_WELCOME = [
  `はじめまして！ラビ博士です🔬

30〜40代男性の恋愛の「なぜうまくいかないか」を9問で診断します。

所要時間：約2分
選択肢の中から、一番近いものを選んでください。

準備ができたら「スタート」と送ってください。`,
];

export const MSG_START_BUTTON = {
  text: '準備ができたら「スタート」と送ってください。',
  items: [{ label: 'スタートする', text: 'スタート' }],
};

// ── 診断中 ────────────────────────────────────────────────

/**
 * 質問メッセージを生成する
 * @param {number} index 0始まり
 * @returns {{ text: string, items: Array }}
 */
export function buildQuestionMessage(index) {
  const q = QUESTIONS[index];
  const text = `【Q${index + 1}/9】${q.text}`;
  const items = q.choices.map(c => ({
    label: c.label,
    text: c.key,
  }));
  return { text, items };
}

// ── 結果 Flex Message ─────────────────────────────────────

/**
 * 診断結果の Flex Message contents を生成する
 * @param {string} resultType — L1/L2/K1/K2/A1/A2
 * @returns {{ altText: string, contents: object }}
 */
export function buildResultFlex(resultType) {
  const rt = RESULT_TYPES[resultType];
  if (!rt) return { altText: '診断結果', contents: _errorBubble() };

  const detail = RESULT_DETAIL_TEXT[resultType] || '';
  const [hookLine, ...rest] = detail.split('\n').filter(l => l.trim());

  return {
    altText: `診断結果：${rt.name}`,
    contents: {
      type: 'bubble',
      size: 'giga',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#08080f',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'text',
                text: '🔬 診断結果',
                size: 'xs',
                color: '#e83e8c',
                weight: 'bold',
                flex: 0,
              },
            ],
          },
          {
            type: 'text',
            text: rt.name,
            size: 'xl',
            weight: 'bold',
            color: '#f0f0f8',
            wrap: true,
            margin: 'md',
          },
          {
            type: 'text',
            text: rt.short,
            size: 'sm',
            color: '#7070a0',
            wrap: true,
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#0d0d1a',
        paddingAll: '20px',
        spacing: 'lg',
        contents: [
          // フックライン
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#111120',
            cornerRadius: '12px',
            paddingAll: '16px',
            contents: [
              {
                type: 'text',
                text: hookLine || '',
                size: 'md',
                weight: 'bold',
                color: '#f0f0f8',
                wrap: true,
                lineSpacing: '6px',
              },
            ],
          },
          // 残りの本文
          {
            type: 'text',
            text: rest.join('\n') || '',
            size: 'sm',
            color: '#aaaacc',
            wrap: true,
            lineSpacing: '6px',
          },
          // 区切り線
          {
            type: 'separator',
            color: '#252540',
          },
          // CTA テキスト
          {
            type: 'text',
            text: '📄 分析レポートをこのトークに送りました\nこのまま下にスクロールして確認してください',
            size: 'sm',
            color: '#f0f0f8',
            wrap: true,
            lineSpacing: '4px',
          },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#08080f',
        paddingAll: '16px',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: 'noteで続きを読む',
              text: 'note見る',
            },
            style: 'primary',
            color: '#e83e8c',
            height: 'md',
          },
        ],
      },
    },
  };
}

function _errorBubble() {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: '診断結果を取得できませんでした。', wrap: true },
      ],
    },
  };
}

// ── タイプ別詳細テキスト（GPTで差し替え） ─────────────────

const RESULT_DETAIL_TEXT = {
  L1: `「いい感じなのに、なぜか友人止まり。」

誠実さも気遣いもある。なのに選ばれない。
問題は性格ではなく、感情が動く余地を与えていないことにあります。

安心感と恋愛感情は、脳の別の回路で動きます。
誠実さをいくら磨いても、恋愛対象にはなれない理由がここにあります。

なぜそうなるのか、無料コンテンツで解説します。`,

  L2: `「嫌われてはいない。でも、選ばれない。」

気遣いが強すぎて、自分の存在感が薄くなっています。
踏み込める場面でも引いてしまうため、好意も温度も相手に届いていない。

嫌われることを避けようとした結果、
選ばれる機会ごと消えています。

なぜそうなるのか、無料コンテンツで解説します。`,

  K1: `「少し好感触があると、一気に気持ちが入る。」

これは性格の問題ではありません。
好意を持った後の「情報のフィルタリング」の問題です。

普通の反応を「脈あり」として受け取りやすく、
相手との温度差が気づかないうちに広がっていきます。

なぜそうなるのか、無料コンテンツで解説します。`,

  K2: `「返信が遅い。少しそっけない。それだけで崩れる。」

相手の反応の変化を強く受け取り、不安が先に膨らむ。
恋愛そのものより、不安の管理に消耗しているのがこのタイプです。

これは意志力でどうにかなるものではなく、
認知の構造的な問題です。

なぜそうなるのか、無料コンテンツで解説します。`,

  A1: `「真面目にやっているのに、マッチしない。」

中身の問題ではありません。
写真やプロフィール文が「情報の羅列」になっており、
「会ってみたい」というイメージが湧かない状態になっています。

アプリは自分をよく見せる場所ではなく、
相手に想像させる場所です。

なぜ届かないのか、無料コンテンツで解説します。`,

  A2: `「マッチはする。でも、会えない。」

やり取りは始まるのに流れが止まる。
誘うタイミング、会話のテンポ、その先の設計にズレがあります。

「楽しかった」だけで終わり、次につながらない。
どこで失速しているのかを、無料コンテンツで解説します。`,
};

// ── 限定コンテンツ配信 ────────────────────────────────────

/**
 * 限定コンテンツメッセージを生成する
 * @param {string} resultType
 * @param {object} content — limitedContents.json の1エントリ
 * @returns {string[]}
 */
export function buildLimitedContentMessages(resultType, content, pdfUrl) {
  const msg1 = `🎁 限定コンテンツをご用意しました

【${content.title}】

あなたのタイプに合わせた内容をまとめています。
保存して、じっくり読んでみてください。`;

  const msg2 = pdfUrl
    ? `📄 こちらからお受け取りください\n\n${pdfUrl}`
    : `📄 準備中です。もうしばらくお待ちください。`;

  const msg3 = buildNoteTeaser(resultType);

  return [msg1, msg2, msg3];
}

function buildNoteTeaser(resultType) {
  const teasers = {
    L: `さらに詳しく知りたい方へ

「やさしいのに恋愛対象にならない男性が見落としていること」

具体的な行動変容メソッドをnoteで公開しています。

「note見る」と送ってください。`,

    K: `さらに詳しく知りたい方へ

「脈ありだと思って失敗する男の勘違い」

期待を正確にキャリブレーションする方法をnoteで公開しています。

「note見る」と送ってください。`,

    A: `さらに詳しく知りたい方へ

「マッチングアプリで会う前に切られる30〜40代男性の共通点」

プロフ・会話・誘い方の改善策をnoteで公開しています。

「note見る」と送ってください。`,
  };

  const mainType = resultType[0]; // 'L'/'K'/'A'
  return teasers[mainType] || teasers['L'];
}

// ── note誘導 ──────────────────────────────────────────────

/**
 * note URLメッセージを生成する
 * @param {object} note — paidNotes.json の1エントリ
 * @returns {string}
 */
export function buildNoteMessage(note) {
  const desc = note.description ? `\n\n${note.description}` : '';
  if (note.url) {
    return `📖 ${note.title}${desc}\n\n▶ ${note.url}`;
  }
  return `📖 ${note.title}${desc}\n\n現在準備中です。公開したらまたお知らせします！`;
}

// ── その他 ────────────────────────────────────────────────

export const MSG_INVALID_CHOICE = '選択肢の中から「A」「B」「C」のいずれかで答えてください。';

export const MSG_ERROR = '申し訳ありません、エラーが発生しました。もう一度「スタート」と送ってみてください。';

export const MSG_UNKNOWN = `メッセージありがとうございます。

診断を受けたい方は「スタート」と送ってください。`;
