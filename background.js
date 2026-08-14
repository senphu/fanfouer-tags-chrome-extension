/**
 * 饭人画像谷歌插件的后台数据服务。
 * 负责统一读写 chrome.storage.local，并处理内容脚本发来的标签、导入和导出请求。
 * 作者：肥魔（serylab+fanfouer+tags@gmail.com）
 */

const STORAGE_KEY = 'fanfouUserTags';
const DATA_VERSION = 1;
const MAX_USER_ID_LENGTH = 500;
const MAX_TAG_LENGTH = 200;
const MAX_TAGS_PER_USER = 500;
const MAX_USERS = 10000;
const LOG_PREFIX = '[饭人画像谷歌插件][后台]';
const AUTHOR_NAME = '肥魔';
const AUTHOR_EMAIL = 'serylab+fanfouer+tags@gmail.com';

/**
 * 输出后台错误日志，并保留原始错误对象便于查看堆栈。
 * @param {string} message 错误上下文。
 * @param {unknown} error 原始错误对象。
 * @param {unknown} details 可选的结构化详情。
 * @returns {void}
 */
function logBackgroundError(message, error, details) {
  const errorDetails = {
    error,
    ...(typeof details === 'object' && details !== null ? details : {})
  };
  console.error(`${LOG_PREFIX} ${message}`, errorDetails);
}

/**
 * 输出后台普通运行日志。
 * @param {string} message 日志消息。
 * @param {unknown} details 可选的结构化详情。
 * @returns {void}
 */
function logBackgroundInfo(message, details) {
  if (typeof details === 'undefined') {
    console.info(`${LOG_PREFIX} ${message}`);
    return;
  }

  console.info(`${LOG_PREFIX} ${message}`, details);
}

/**
 * 创建一个空的数据仓库。
 * @returns {{version: number, users: Object<string, string[]>}} 空的数据仓库。
 */
function createEmptyStore() {
  return {
    version: DATA_VERSION,
    users: {}
  };
}

/**
 * 规范化用户 ID。
 * @param {unknown} value 待规范化的值。
 * @returns {string} 去除首尾空白后的用户 ID；无效值返回空字符串。
 */
function normalizeUserId(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_USER_ID_LENGTH);
}

/**
 * 规范化单个标签。
 * @param {unknown} value 待规范化的标签值。
 * @returns {string} 去除首尾空白后的标签；无效值返回空字符串。
 */
function normalizeTag(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, MAX_TAG_LENGTH);
}

/**
 * 对标签数组去重并限制数量。
 * @param {unknown} value 待规范化的标签数组。
 * @returns {string[]} 安全、去重后的标签数组。
 */
function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const uniqueTags = [];
  const seenTags = new Set();

  for (const rawTag of value) {
    const tag = normalizeTag(rawTag);
    if (!tag || seenTags.has(tag)) {
      continue;
    }

    seenTags.add(tag);
    uniqueTags.push(tag);

    if (uniqueTags.length >= MAX_TAGS_PER_USER) {
      break;
    }
  }

  return uniqueTags;
}

/**
 * 校验并规范化一个数据仓库。
 * @param {unknown} value 待校验的数据。
 * @returns {{version: number, users: Object<string, string[]>}} 可安全使用的数据仓库。
 */
function normalizeStore(value) {
  const normalizedStore = createEmptyStore();

  if (!value || typeof value !== 'object' || !value.users || typeof value.users !== 'object') {
    return normalizedStore;
  }

  const userEntries = Object.entries(value.users).slice(0, MAX_USERS);
  for (const [rawUserId, rawTags] of userEntries) {
    const userId = normalizeUserId(rawUserId);
    const tags = normalizeTags(rawTags);

    if (userId && tags.length > 0) {
      normalizedStore.users[userId] = tags;
    }
  }

  return normalizedStore;
}

/**
 * 读取当前数据仓库。
 * @returns {Promise<{version: number, users: Object<string, string[]>}>} 当前数据。
 * @throws {Error} Chrome 存储接口不可用时抛出异常。
 */
async function readStore() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeStore(result[STORAGE_KEY]);
}

/**
 * 保存数据仓库。
 * @param {{version: number, users: Object<string, string[]>}} store 待保存的数据。
 * @returns {Promise<void>} 保存完成后结束。
 * @throws {Error} Chrome 存储接口不可用时抛出异常。
 */
async function writeStore(store) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: normalizeStore(store)
  });
}

/**
 * 合并两个数据仓库中的标签。
 * @param {{version: number, users: Object<string, string[]>}} currentStore 当前数据。
 * @param {{version: number, users: Object<string, string[]>}} importedStore 导入数据。
 * @returns {{version: number, users: Object<string, string[]>}} 合并后的数据。
 */
function mergeStores(currentStore, importedStore) {
  const mergedStore = normalizeStore(currentStore);
  const safeImportedStore = normalizeStore(importedStore);

  for (const [userId, importedTags] of Object.entries(safeImportedStore.users)) {
    // 导入采用合并策略，避免用户误导入一个文件后覆盖当前浏览器中的已有标签。
    mergedStore.users[userId] = normalizeTags([
      ...(mergedStore.users[userId] || []),
      ...importedTags
    ]);
  }

  return mergedStore;
}

/**
 * 校验用户 ID 并在无效时抛出可读异常。
 * @param {unknown} value 待校验的用户 ID。
 * @returns {string} 合法的用户 ID。
 * @throws {Error} 用户 ID 为空时抛出异常。
 */
function requireUserId(value) {
  const userId = normalizeUserId(value);
  if (!userId) {
    throw new Error('缺少有效的用户 ID。');
  }

  return userId;
}

/**
 * 获取指定用户的标签。
 * @param {string} userId 用户 ID。
 * @returns {Promise<string[]>} 指定用户的标签列表。
 * @throws {Error} 用户 ID 无效或存储接口失败时抛出异常。
 */
async function getTags(userId) {
  const store = await readStore();
  const safeUserId = requireUserId(userId);
  return store.users[safeUserId] || [];
}

/**
 * 向指定用户增加一个标签。
 * @param {string} userId 用户 ID。
 * @param {string} tag 待增加的标签。
 * @returns {Promise<string[]>} 增加标签后的完整列表。
 * @throws {Error} 用户 ID或标签无效，或存储接口失败时抛出异常。
 */
async function addTag(userId, tag) {
  const store = await readStore();
  const safeUserId = requireUserId(userId);
  const safeTag = normalizeTag(tag);

  if (!safeTag) {
    throw new Error('标签不能为空。');
  }

  const updatedTags = normalizeTags([...(store.users[safeUserId] || []), safeTag]);
  store.users[safeUserId] = updatedTags;
  await writeStore(store);
  return updatedTags;
}

/**
 * 删除指定用户的一个标签。
 * @param {string} userId 用户 ID。
 * @param {number} tagIndex 待删除标签的数组下标。
 * @returns {Promise<string[]>} 删除标签后的完整列表。
 * @throws {Error} 用户 ID或标签下标无效，或存储接口失败时抛出异常。
 */
async function deleteTag(userId, tagIndex) {
  const store = await readStore();
  const safeUserId = requireUserId(userId);
  const tags = store.users[safeUserId] || [];

  if (!Number.isInteger(tagIndex) || tagIndex < 0 || tagIndex >= tags.length) {
    throw new Error('要删除的标签不存在。');
  }

  tags.splice(tagIndex, 1);
  if (tags.length > 0) {
    store.users[safeUserId] = tags;
  } else {
    delete store.users[safeUserId];
  }

  await writeStore(store);
  return tags;
}

/**
 * 生成可导出的数据结构。
 * @returns {Promise<Object>} 带格式版本和导出时间的数据。
 * @throws {Error} 存储接口失败时抛出异常。
 */
async function exportData() {
  const store = await readStore();
  return {
    schema: 'fanfou-user-tags',
    version: DATA_VERSION,
    exportedAt: new Date().toISOString(),
    author: {
      name: AUTHOR_NAME,
      email: AUTHOR_EMAIL
    },
    users: store.users
  };
}

/**
 * 合并导入的数据。
 * @param {unknown} importedData 外部 JSON 解析后的数据。
 * @returns {Promise<{userCount: number, tagCount: number}>} 导入后的统计信息。
 * @throws {Error} 导入文件格式不正确或存储接口失败时抛出异常。
 */
async function importData(importedData) {
  if (!importedData || typeof importedData !== 'object' || !importedData.users) {
    throw new Error('文件格式不正确：没有找到 users 数据。');
  }

  const currentStore = await readStore();
  const mergedStore = mergeStores(currentStore, importedData);
  await writeStore(mergedStore);

  const allTags = Object.values(mergedStore.users).reduce(
    (total, tags) => total + tags.length,
    0
  );

  return {
    userCount: Object.keys(mergedStore.users).length,
    tagCount: allTags
  };
}

/**
 * 处理内容脚本的请求并返回统一格式的结果。
 * @param {Object} message 内容脚本发送的消息。
 * @returns {Promise<Object>} 给内容脚本的响应对象。
 * @throws {Error} 未知操作或业务处理失败时抛出异常。
 */
async function handleMessage(message) {
  switch (message && message.type) {
    case 'getTags':
      return { ok: true, tags: await getTags(message.userId) };
    case 'addTag':
      return { ok: true, tags: await addTag(message.userId, message.tag) };
    case 'deleteTag':
      return { ok: true, tags: await deleteTag(message.userId, message.tagIndex) };
    case 'exportData':
      return { ok: true, data: await exportData() };
    case 'importData':
      return { ok: true, summary: await importData(message.data) };
    default:
      throw new Error('未知的操作类型。');
  }
}

/**
 * 接收来自内容脚本的消息。
 * @param {Object} message 请求消息。
 * @param {chrome.runtime.MessageSender} sender 消息发送者信息。
 * @param {function(Object): void} sendResponse 异步响应回调。
 * @returns {boolean} 返回 true，保持消息通道直到异步操作完成。
 */
function handleRuntimeMessage(message, sender, sendResponse) {
  void handleMessage(message)
    .then(function handleSuccess(response) {
      sendResponse(response);
    })
    .catch(function handleFailure(error) {
      logBackgroundError(`处理操作失败：${message && message.type ? message.type : '未知操作'}`, error, {
        messageType: message && message.type
      });
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : '操作失败。'
      });
    });

  return true;
}

chrome.runtime.onMessage.addListener(handleRuntimeMessage);

/**
 * 点击扩展图标时打开扩展配置页。
 * @returns {void}
 */
function handleActionClick() {
  logBackgroundInfo('正在打开配置页');
  void Promise.resolve(chrome.runtime.openOptionsPage()).catch(function handleOptionsPageError(error) {
    logBackgroundError('打开配置页失败', error);
  });
}

chrome.action.onClicked.addListener(handleActionClick);
