/**
 * DataX UI Kit - JavaScript
 * モーダル、トースト通知、テーマ切り替えを提供する
 * 依存ライブラリなし（バニラJS）
 */

(function (global) {
  'use strict';

  // =====================================
  // テーマ管理
  // =====================================

  const DataXTheme = {
    /**
     * 現在のテーマを取得する
     * @returns {'light'|'dark'|'auto'}
     */
    get() {
      return localStorage.getItem('dx-theme') || 'auto';
    },

    /**
     * テーマを設定する
     * @param {'light'|'dark'|'auto'} theme
     */
    set(theme) {
      localStorage.setItem('dx-theme', theme);
      if (theme === 'auto') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
      document.dispatchEvent(new CustomEvent('dx:themechange', { detail: { theme } }));
    },

    /** ライトとダークをトグルする */
    toggle() {
      const current = this.get();
      const isDark = current === 'dark' ||
        (current === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      this.set(isDark ? 'light' : 'dark');
    },

    /** ページロード時に保存済みテーマを適用する */
    init() {
      const saved = this.get();
      if (saved !== 'auto') {
        document.documentElement.setAttribute('data-theme', saved);
      }
    }
  };

  // =====================================
  // トースト通知
  // =====================================

  const DataXToast = {
    _container: null,

    /**
     * トーストコンテナを取得または作成する
     */
    _getContainer() {
      if (!this._container) {
        this._container = document.createElement('div');
        this._container.className = 'dx-toast-container';
        document.body.appendChild(this._container);
      }
      return this._container;
    },

    /**
     * トーストを表示する
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration - 表示時間(ms)、0で自動消去しない
     */
    show(message, type = 'info', duration = 4000) {
      const container = this._getContainer();
      const toast = document.createElement('div');
      toast.className = `dx-toast dx-toast-${type}`;

      const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
      toast.innerHTML = `<span style="font-weight:700">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
      container.appendChild(toast);

      if (duration > 0) {
        setTimeout(() => this._remove(toast), duration);
      }
      return toast;
    },

    _remove(toast) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = '200ms ease';
      setTimeout(() => toast.remove(), 200);
    },

    // 各タイプのショートカットメソッド
    success(msg, duration) { return this.show(msg, 'success', duration); },
    error(msg, duration)   { return this.show(msg, 'error', duration); },
    info(msg, duration)    { return this.show(msg, 'info', duration); },
    warning(msg, duration) { return this.show(msg, 'warning', duration); },
  };

  // =====================================
  // モーダル
  // =====================================

  const DataXModal = {
    _current: null,

    /**
     * モーダルを表示する
     * @param {Object} options
     * @param {string} options.title - モーダルタイトル
     * @param {string|HTMLElement} options.body - モーダル本文
     * @param {Array} [options.buttons] - フッターボタン配列
     * @param {boolean} [options.closeOnOverlay=true] - オーバーレイクリックで閉じる
     * @returns {HTMLElement} overlay要素
     */
    open({ title, body, buttons = [], closeOnOverlay = true } = {}) {
      this.close(); // 既存モーダルを閉じる

      const overlay = document.createElement('div');
      overlay.className = 'dx-modal-overlay';

      const closeBtn = `<button class="dx-modal-close" data-dx-modal-close>✕</button>`;
      const footerBtns = buttons.map(btn =>
        `<button class="dx-btn ${btn.class || 'dx-btn-secondary'}" data-dx-modal-action="${btn.action || ''}">${btn.label}</button>`
      ).join('');

      overlay.innerHTML = `
        <div class="dx-modal" role="dialog" aria-modal="true">
          <div class="dx-modal-header">
            <h2 class="dx-modal-title">${title || ''}</h2>
            ${closeBtn}
          </div>
          <div class="dx-modal-body">${
            typeof body === 'string' ? body : ''
          }</div>
          ${buttons.length ? `<div class="dx-modal-footer">${footerBtns}</div>` : ''}
        </div>
      `;

      // HTMLElementの場合はbody要素に追加する
      if (body instanceof HTMLElement) {
        overlay.querySelector('.dx-modal-body').appendChild(body);
      }

      // 閉じるボタンのイベント
      overlay.querySelector('[data-dx-modal-close]')
        .addEventListener('click', () => this.close());

      // アクションボタンのイベント
      overlay.querySelectorAll('[data-dx-modal-action]').forEach(btn => {
        const action = btn.dataset.dxModalAction;
        const btnConfig = buttons.find(b => b.action === action);
        if (btnConfig?.onClick) {
          btn.addEventListener('click', () => btnConfig.onClick(this.close.bind(this)));
        } else {
          btn.addEventListener('click', () => this.close());
        }
      });

      // オーバーレイクリックで閉じる
      if (closeOnOverlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) this.close();
        });
      }

      // ESCキーで閉じる
      this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this._escHandler);

      document.body.appendChild(overlay);
      this._current = overlay;

      // アニメーション
      requestAnimationFrame(() => overlay.classList.add('dx-open'));

      return overlay;
    },

    /** モーダルを閉じる */
    close() {
      if (!this._current) return;
      this._current.classList.remove('dx-open');
      const el = this._current;
      setTimeout(() => el.remove(), 150);
      this._current = null;
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
      }
    },

    /**
     * 確認ダイアログを表示する（Promise形式）
     * @param {string} message
     * @param {string} [title='確認']
     * @returns {Promise<boolean>}
     */
    confirm(message, title = '確認') {
      return new Promise((resolve) => {
        this.open({
          title,
          body: `<p style="margin:0">${message}</p>`,
          buttons: [
            { label: 'キャンセル', class: 'dx-btn dx-btn-secondary', action: 'cancel',
              onClick: (close) => { close(); resolve(false); } },
            { label: '確認', class: 'dx-btn dx-btn-primary', action: 'ok',
              onClick: (close) => { close(); resolve(true); } },
          ],
          closeOnOverlay: false,
        });
      });
    },
  };

  // =====================================
  // テーマトグルボタンの自動初期化
  // =====================================

  function initThemeToggleButtons() {
    document.querySelectorAll('[data-dx-theme-toggle]').forEach(btn => {
      btn.addEventListener('click', () => DataXTheme.toggle());
    });
  }

  // =====================================
  // DOMContentLoaded 時の自動初期化
  // =====================================

  document.addEventListener('DOMContentLoaded', () => {
    DataXTheme.init();
    initThemeToggleButtons();
  });

  // =====================================
  // グローバルに公開する
  // =====================================

  global.DataX = {
    theme: DataXTheme,
    toast: DataXToast,
    modal: DataXModal,
  };

})(typeof window !== 'undefined' ? window : global);
