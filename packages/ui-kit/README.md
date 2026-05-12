# DataX UI Kit — AI向け使用ガイド

> このファイルはAIが読むためのドキュメントです。
> DataX上でアプリを作る前に必ずこのファイルを読み、CSS/JSを適用してください。

---

## 1. ファイルの読み込み方法

HTMLの `<head>` に以下を追加してください。

```html
<head>
  <!-- DataX UI Kit CSS（必須） -->
  <link rel="stylesheet" href="/ui-kit/datax-ui.css">

  <!-- DataX DB SDK（DBを使う場合のみ） -->
  <script src="/ui-kit/datax-db.js"></script>

  <!-- DataX UI JS（モーダル・トーストを使う場合） -->
  <script src="/ui-kit/datax-ui.js"></script>
</head>
```

**ローカル開発時**（`datax_read_file` で取得してscriptタグで埋め込む場合）:
```html
<style>/* datax-ui.cssの内容をここに貼る */</style>
<script>/* datax-ui.jsの内容をここに貼る */</script>
<script>/* datax-db.jsの内容をここに貼る */</script>
```

---

## 2. 基本レイアウト

```html
<body>
  <!-- ヘッダー -->
  <header class="dx-header">
    <a class="dx-header-brand" href="/">MyApp</a>
    <nav class="dx-header-nav">
      <button class="dx-btn dx-btn-ghost dx-btn-sm" data-dx-theme-toggle>🌙</button>
    </nav>
  </header>

  <!-- メインコンテンツ -->
  <main class="dx-container" style="padding-top: 24px">
    <!-- ここにコンテンツを入れる -->
  </main>
</body>
```

---

## 3. コンポーネント一覧

### ボタン

```html
<!-- プライマリ（メインアクション） -->
<button class="dx-btn dx-btn-primary">保存</button>

<!-- セカンダリ（サブアクション） -->
<button class="dx-btn dx-btn-secondary">キャンセル</button>

<!-- 危険（削除など） -->
<button class="dx-btn dx-btn-danger">削除</button>

<!-- ゴースト（軽量アクション） -->
<button class="dx-btn dx-btn-ghost">詳細</button>

<!-- サイズ変更 -->
<button class="dx-btn dx-btn-primary dx-btn-sm">小さい</button>
<button class="dx-btn dx-btn-primary dx-btn-lg">大きい</button>

<!-- ローディング状態 -->
<button class="dx-btn dx-btn-primary" disabled>
  <span class="dx-spinner"></span> 処理中...
</button>
```

### カード

```html
<div class="dx-card">
  <div class="dx-card-header">
    <h3 class="dx-card-title">カードタイトル</h3>
    <button class="dx-btn dx-btn-ghost dx-btn-sm">編集</button>
  </div>
  <div class="dx-card-body">
    カードの本文コンテンツ
  </div>
  <div class="dx-card-footer">
    <span class="dx-text-sm dx-text-muted">最終更新: 2024-01-01</span>
  </div>
</div>
```

### フォーム

```html
<form>
  <div class="dx-form-group">
    <label class="dx-label" for="name">名前 <span style="color: var(--dx-color-danger)">*</span></label>
    <input class="dx-input" id="name" type="text" placeholder="入力してください">
    <p class="dx-form-hint">英数字で入力してください</p>
  </div>

  <div class="dx-form-group">
    <label class="dx-label" for="category">カテゴリ</label>
    <select class="dx-select" id="category">
      <option value="">選択してください</option>
      <option value="a">カテゴリA</option>
      <option value="b">カテゴリB</option>
    </select>
  </div>

  <div class="dx-form-group">
    <label class="dx-label" for="memo">メモ</label>
    <textarea class="dx-textarea" id="memo" rows="4" placeholder="メモを入力"></textarea>
  </div>

  <button class="dx-btn dx-btn-primary dx-w-full">送信</button>
</form>
```

### テーブル

```html
<div class="dx-table-wrap">
  <table class="dx-table">
    <thead>
      <tr>
        <th>名前</th>
        <th>ステータス</th>
        <th>日付</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>サンプルアイテム</td>
        <td><span class="dx-badge dx-badge-green">完了</span></td>
        <td>2024-01-01</td>
        <td><button class="dx-btn dx-btn-ghost dx-btn-sm">編集</button></td>
      </tr>
    </tbody>
  </table>
</div>
```

### バッジ

```html
<span class="dx-badge dx-badge-blue">情報</span>
<span class="dx-badge dx-badge-green">成功</span>
<span class="dx-badge dx-badge-yellow">警告</span>
<span class="dx-badge dx-badge-red">エラー</span>
<span class="dx-badge dx-badge-gray">未設定</span>
```

### アラート

```html
<div class="dx-alert dx-alert-info">ℹ 情報メッセージです</div>
<div class="dx-alert dx-alert-success">✓ 保存しました</div>
<div class="dx-alert dx-alert-warning">⚠ 注意が必要です</div>
<div class="dx-alert dx-alert-error">✕ エラーが発生しました</div>
```

---

## 4. DataX.toast — トースト通知

```javascript
// 成功通知（4秒で自動消去）
DataX.toast.success('保存しました');

// エラー通知
DataX.toast.error('保存に失敗しました');

// 情報通知
DataX.toast.info('データを読み込んでいます...');

// 警告通知
DataX.toast.warning('入力内容を確認してください');

// 表示時間を変更する（ミリ秒、0で自動消去しない）
DataX.toast.success('完了しました', 8000);
```

---

## 5. DataX.modal — モーダルダイアログ

```javascript
// 基本的なモーダルを開く
DataX.modal.open({
  title: 'タイトル',
  body: '<p>モーダルの内容</p>',
  buttons: [
    { label: '閉じる', class: 'dx-btn dx-btn-secondary', action: 'close' },
    {
      label: '確認',
      class: 'dx-btn dx-btn-primary',
      action: 'ok',
      onClick: (close) => {
        // 処理を実行してからモーダルを閉じる
        doSomething();
        close();
      }
    }
  ]
});

// 確認ダイアログ（Promise形式）
const confirmed = await DataX.modal.confirm('本当に削除しますか？', '削除確認');
if (confirmed) {
  await deleteItem();
  DataX.toast.success('削除しました');
}

// モーダルを手動で閉じる
DataX.modal.close();
```

---

## 6. DataXDB — データベース

### 初期化

```javascript
// ページ読み込み時に一度だけ初期化する
// localhost → localStorage、本番 → DynamoDB に自動切替
const db = new DataXDB();
```

### CRUD操作

```javascript
const db = new DataXDB();
const todos = db.collection('todos');

// ─── Create ─────────────────────────────
const id = await todos.add({
  text: 'タスクを完了する',
  done: false,
  priority: 'high',
});
console.log('追加されたID:', id);

// ─── Read（全件取得） ─────────────────────
const allTodos = await todos.get();
console.log('全件:', allTodos);

// ─── Read（フィルタ取得） ──────────────────
const doneTodos = await todos.get({ done: true });
const highPriority = await todos.get({ priority: 'high' });

// ─── Read（1件取得） ──────────────────────
const todo = await todos.doc(id).get();
console.log('1件:', todo);

// ─── Update ─────────────────────────────
await todos.doc(id).update({ done: true });

// ─── Delete ─────────────────────────────
await todos.doc(id).delete();
```

### 実践例：Todoアプリ

```javascript
const db = new DataXDB();
const todos = db.collection('todos');

// 追加ボタンの処理
document.getElementById('add-btn').addEventListener('click', async () => {
  const text = document.getElementById('todo-input').value.trim();
  if (!text) return;

  const id = await todos.add({ text, done: false });
  DataX.toast.success('追加しました');
  renderTodos();
});

// 一覧の描画
async function renderTodos() {
  const items = await todos.get();
  const list = document.getElementById('todo-list');
  list.innerHTML = items.map(item => `
    <div class="dx-card" style="margin-bottom: 8px">
      <div class="dx-card-body dx-flex dx-items-center dx-justify-between">
        <span style="${item.done ? 'text-decoration: line-through; opacity: 0.5' : ''}">
          ${item.text}
        </span>
        <div class="dx-flex dx-gap-2">
          <button class="dx-btn dx-btn-secondary dx-btn-sm"
            onclick="toggleTodo('${item.id}', ${item.done})">
            ${item.done ? '戻す' : '完了'}
          </button>
          <button class="dx-btn dx-btn-ghost dx-btn-sm"
            onclick="deleteTodo('${item.id}')">削除</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function toggleTodo(id, current) {
  await todos.doc(id).update({ done: !current });
  renderTodos();
}

async function deleteTodo(id) {
  const ok = await DataX.modal.confirm('このタスクを削除しますか？');
  if (ok) {
    await todos.doc(id).delete();
    DataX.toast.success('削除しました');
    renderTodos();
  }
}
```

---

## 7. テーマ切り替え

```javascript
// 現在のテーマを取得する
const theme = DataX.theme.get(); // 'light' | 'dark' | 'auto'

// テーマを設定する
DataX.theme.set('dark');
DataX.theme.set('light');
DataX.theme.set('auto'); // OSの設定に従う

// トグルする
DataX.theme.toggle();
```

HTML側でテーマ切り替えボタンを使う場合は `data-dx-theme-toggle` 属性を追加するだけで動作します:
```html
<button class="dx-btn dx-btn-ghost" data-dx-theme-toggle>🌙 テーマ切り替え</button>
```

---

## 8. ❌ 禁止事項

```html
<!-- ❌ インラインスタイルを直接書かない -->
<button style="background: blue; color: white; padding: 8px 16px;">NG</button>

<!-- ✅ dx-クラスを使う -->
<button class="dx-btn dx-btn-primary">OK</button>

<!-- ❌ 独自CSSクラスでデザインを上書きしない -->
<style>.my-button { background: red; }</style>

<!-- ❌ dx-変数を上書きしない（テーマが崩れる） -->
<style>:root { --dx-bg: pink; }</style>

<!-- ✅ カスタムデザインが必要な場合は dx- 変数を参照する -->
<style>
  .my-component {
    background: var(--dx-bg-secondary);
    border: 1px solid var(--dx-border);
    border-radius: var(--dx-radius);
  }
</style>
```

---

## 9. アプリのHTMLテンプレート（コピペ用）

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>アプリ名</title>
  <link rel="stylesheet" href="/ui-kit/datax-ui.css">
</head>
<body>
  <header class="dx-header">
    <a class="dx-header-brand" href="/">アプリ名</a>
    <nav class="dx-header-nav">
      <button class="dx-btn dx-btn-ghost dx-btn-sm" data-dx-theme-toggle>🌙</button>
    </nav>
  </header>

  <main class="dx-container" style="padding: 32px 24px">
    <h1 style="font-size: 24px; font-weight: 700; margin-bottom: 24px">ページタイトル</h1>

    <!-- コンテンツをここに入れる -->

  </main>

  <script src="/ui-kit/datax-db.js"></script>
  <script src="/ui-kit/datax-ui.js"></script>
  <script>
    // アプリのJavaScriptをここに書く
  </script>
</body>
</html>
```
