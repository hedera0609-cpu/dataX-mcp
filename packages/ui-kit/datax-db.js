/**
 * DataX DB SDK
 * ローカル(localhost)では localStorage、本番では DynamoDB API を自動で切り替える
 * Firebase風のコレクション/ドキュメントAPIを提供する
 */

(function (global) {
  'use strict';

  // =====================================
  // 環境判定
  // =====================================

  /**
   * ローカル開発環境かどうかを判定する
   * localhost または 127.0.0.1 の場合はローカルモード
   */
  function isLocalEnv() {
    return ['localhost', '127.0.0.1'].includes(location.hostname);
  }

  /**
   * アプリのnickname/app-nameをURLから取得する
   * DataX URL形式: https://datax-{nickname}--{app-name}.{domain}
   */
  function parseDataXContext() {
    const hostname = location.hostname;
    const match = hostname.match(/^datax-([^-]+)--([^.]+)\./);
    if (match) {
      return { nickname: match[1], appName: match[2] };
    }
    // ローカル環境用のフォールバック（環境変数相当のmeta tagから取得）
    const metaNickname = document.querySelector('meta[name="datax-nickname"]')?.content;
    const metaApp = document.querySelector('meta[name="datax-app"]')?.content;
    return {
      nickname: metaNickname || 'local',
      appName: metaApp || 'dev',
    };
  }

  // =====================================
  // ローカルストレージバックエンド
  // =====================================

  class LocalStorageBackend {
    constructor(nickname, appName) {
      this._prefix = `datax:${nickname}:${appName}`;
    }

    _key(collection, docId) {
      return `${this._prefix}:${collection}:${docId}`;
    }

    _collectionKey(collection) {
      return `${this._prefix}:${collection}:__index`;
    }

    async add(collection, data) {
      const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const doc = { id, ...data, _createdAt: new Date().toISOString() };
      localStorage.setItem(this._key(collection, id), JSON.stringify(doc));

      // インデックスにIDを追加する
      const index = this._getIndex(collection);
      index.push(id);
      localStorage.setItem(this._collectionKey(collection), JSON.stringify(index));

      return id;
    }

    async getAll(collection, query = {}) {
      const index = this._getIndex(collection);
      const docs = [];
      for (const id of index) {
        const raw = localStorage.getItem(this._key(collection, id));
        if (raw) {
          const doc = JSON.parse(raw);
          // 簡易クエリフィルタ（完全一致のみ）
          if (this._matchesQuery(doc, query)) {
            docs.push(doc);
          }
        }
      }
      return docs;
    }

    async getDoc(collection, docId) {
      const raw = localStorage.getItem(this._key(collection, docId));
      return raw ? JSON.parse(raw) : null;
    }

    async updateDoc(collection, docId, data) {
      const existing = await this.getDoc(collection, docId);
      const updated = {
        ...(existing || {}),
        ...data,
        id: docId,
        _updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(this._key(collection, docId), JSON.stringify(updated));
    }

    async deleteDoc(collection, docId) {
      localStorage.removeItem(this._key(collection, docId));
      const index = this._getIndex(collection).filter((id) => id !== docId);
      localStorage.setItem(this._collectionKey(collection), JSON.stringify(index));
    }

    _getIndex(collection) {
      const raw = localStorage.getItem(this._collectionKey(collection));
      return raw ? JSON.parse(raw) : [];
    }

    _matchesQuery(doc, query) {
      for (const [key, value] of Object.entries(query)) {
        if (doc[key] !== value) return false;
      }
      return true;
    }
  }

  // =====================================
  // DynamoDB API バックエンド
  // ECS上のAPIエンドポイント経由でDynamoDBにアクセスする
  // =====================================

  class DynamoDBBackend {
    constructor(nickname, appName) {
      this._nickname = nickname;
      this._appName = appName;
      // APIエンドポイントは同一オリジンに配置することを想定する
      this._baseUrl = '/api/db';
    }

    async _request(method, path, body = null) {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body) options.body = JSON.stringify(body);

      const res = await fetch(`${this._baseUrl}${path}`, options);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `API Error: ${res.status}`);
      }
      return res.json();
    }

    // PK: DATAX#{nickname}#{appName}
    // SK: {collection}#{docId}

    async add(collection, data) {
      const result = await this._request(
        'POST',
        `/${this._nickname}/${this._appName}/${collection}`,
        data
      );
      return result.id;
    }

    async getAll(collection, query = {}) {
      const params = new URLSearchParams(query).toString();
      const path = `/${this._nickname}/${this._appName}/${collection}${params ? '?' + params : ''}`;
      const result = await this._request('GET', path);
      return result.items || [];
    }

    async getDoc(collection, docId) {
      const result = await this._request(
        'GET',
        `/${this._nickname}/${this._appName}/${collection}/${docId}`
      );
      return result.item || null;
    }

    async updateDoc(collection, docId, data) {
      await this._request(
        'PUT',
        `/${this._nickname}/${this._appName}/${collection}/${docId}`,
        data
      );
    }

    async deleteDoc(collection, docId) {
      await this._request(
        'DELETE',
        `/${this._nickname}/${this._appName}/${collection}/${docId}`
      );
    }
  }

  // =====================================
  // Collection クラス
  // =====================================

  class Collection {
    constructor(db, name) {
      this._db = db;
      this._name = name;
    }

    /**
     * ドキュメントを追加する
     * @param {Object} data
     * @returns {Promise<string>} 生成されたドキュメントID
     */
    async add(data) {
      return this._db._backend.add(this._name, data);
    }

    /**
     * コレクションの全ドキュメントを取得する
     * @param {Object} [query] - フィルタ条件（完全一致）
     * @returns {Promise<Array>}
     */
    async get(query = {}) {
      return this._db._backend.getAll(this._name, query);
    }

    /**
     * 特定のドキュメントへの参照を取得する
     * @param {string} id
     * @returns {Document}
     */
    doc(id) {
      return new Document(this._db, this._name, id);
    }
  }

  // =====================================
  // Document クラス
  // =====================================

  class Document {
    constructor(db, collection, id) {
      this._db = db;
      this._collection = collection;
      this._id = id;
    }

    /**
     * ドキュメントを取得する
     * @returns {Promise<Object|null>}
     */
    async get() {
      return this._db._backend.getDoc(this._collection, this._id);
    }

    /**
     * ドキュメントを更新する（部分更新）
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async update(data) {
      return this._db._backend.updateDoc(this._collection, this._id, data);
    }

    /**
     * ドキュメントを削除する
     * @returns {Promise<void>}
     */
    async delete() {
      return this._db._backend.deleteDoc(this._collection, this._id);
    }
  }

  // =====================================
  // DataXDB メインクラス
  // =====================================

  class DataXDB {
    constructor() {
      const ctx = parseDataXContext();
      this._nickname = ctx.nickname;
      this._appName = ctx.appName;
      this._isLocal = isLocalEnv();

      // 環境に応じてバックエンドを自動切替する
      if (this._isLocal) {
        this._backend = new LocalStorageBackend(this._nickname, this._appName);
        console.info('[DataXDB] ローカルモード: localStorageを使用します');
      } else {
        this._backend = new DynamoDBBackend(this._nickname, this._appName);
        console.info('[DataXDB] 本番モード: DynamoDBを使用します');
      }
    }

    /**
     * コレクションへの参照を取得する
     * @param {string} name - コレクション名
     * @returns {Collection}
     *
     * @example
     * const db = new DataXDB();
     * const todos = db.collection('todos');
     * await todos.add({ text: 'Hello', done: false });
     */
    collection(name) {
      if (!name || typeof name !== 'string') {
        throw new Error('コレクション名は文字列で指定してください');
      }
      return new Collection(this, name);
    }

    /** 現在のモードを返す */
    get mode() {
      return this._isLocal ? 'local' : 'dynamodb';
    }
  }

  // =====================================
  // グローバルに公開する
  // =====================================

  global.DataXDB = DataXDB;

})(typeof window !== 'undefined' ? window : global);
