/**
 * 用户链接悬浮标签卡片。
 * 负责识别页面中的 a.former、a.p 以及普通根路径用户链接，并在鼠标悬浮时加载、展示和维护该用户的标签。
 * 作者：肥魔（serylab+fanfouer+tags@gmail.com）
 */

(function initializeTargetHoverTags() {
  'use strict';

  const ROOT_ID = 'fanfou-user-tags-extension-root';
  const LOG_PREFIX = '[饭人画像谷歌插件][页面]';
  const PHOTO_PREVIEW_HOVER_DELAY = 1000;
  const IGNORED_ROUTE_PATHS = new Set([
    'home',
    'friends',
    'privatemsg',
    'search',
    'photo.upload',
    'browse',
    'mentions',
    'friend.request'
  ]);
  const state = {
    hoverAnchor: null,
    hoverUserId: '',
    hoverRequestId: 0,
    hoverShowTimer: null,
    hoverHideTimer: null,
    photoPreviewAnchor: null,
    photoPreviewRequestId: 0,
    photoPreviewHoverId: 0,
    photoPreviewShowTimer: null
  };

  let rootElement;
  let shadowRoot;
  let hoverCardElement;
  let hoverTitleElement;
  let hoverUserIdElement;
  let hoverStatusElement;
  let hoverTagListElement;
  let hoverTagInputElement;
  let photoOverlayElement;
  let photoPreviewTitleElement;
  let photoPreviewImageElement;
  let photoPreviewStatusElement;

  /**
   * 输出普通运行日志。
   * @param {string} message 日志消息。
   * @param {unknown} details 可选的结构化详情。
   * @returns {void}
   */
  function logInfo(message, details) {
    if (typeof details === 'undefined') {
      console.info(`${LOG_PREFIX} ${message}`);
      return;
    }

    console.info(`${LOG_PREFIX} ${message}`, details);
  }

  /**
   * 输出警告日志。
   * @param {string} message 警告消息。
   * @param {unknown} details 可选的结构化详情。
   * @returns {void}
   */
  function logWarn(message, details) {
    if (typeof details === 'undefined') {
      console.warn(`${LOG_PREFIX} ${message}`);
      return;
    }

    console.warn(`${LOG_PREFIX} ${message}`, details);
  }

  /**
   * 输出错误日志，并保留原始错误对象便于查看堆栈。
   * @param {string} message 错误上下文。
   * @param {unknown} error 原始错误对象。
   * @param {unknown} details 可选的结构化详情。
   * @returns {void}
   */
  function logError(message, error, details) {
    const errorDetails = {
      error,
      ...(typeof details === 'object' && details !== null ? details : {})
    };
    console.error(`${LOG_PREFIX} ${message}`, errorDetails);
  }

  /**
   * 从一个用户链接中提取用户 ID。
   * @param {string} urlValue 待解析的链接地址。
   * @returns {string} 链接路径中的用户 ID；链接不是 m.fanfou.com 用户地址时返回空字符串。
   */
  function getUserIdFromUrl(urlValue) {
    if (typeof urlValue !== 'string' || !urlValue.trim()) {
      return '';
    }

    try {
      const parsedUrl = new URL(urlValue, window.location.href);
      if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'm.fanfou.com') {
        return '';
      }

      const rawPath = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
      if (!rawPath) {
        return '';
      }

      // 用户链接只允许一个路径段；例如 /Sery 有效，/foo/bar 应忽略。
      if (rawPath.includes('/')) {
        return '';
      }

      let normalizedUserId;
      try {
        normalizedUserId = decodeURIComponent(rawPath);
      } catch (error) {
        // 单个链接编码损坏时保留原始路径，避免影响同一页面上的其他用户链接。
        logWarn('用户链接编码异常，已使用原始路径', { urlValue, error });
        normalizedUserId = rawPath;
      }

      if (IGNORED_ROUTE_PATHS.has(normalizedUserId)) {
        return '';
      }

      return normalizedUserId;
    } catch (error) {
      logWarn('无法解析用户链接', { urlValue, error });
      return '';
    }
  }

  /**
   * 向后台服务发送一条请求。
   * @param {Object} message 请求内容。
   * @returns {Promise<Object>} 后台返回的响应。
   * @throws {Error} 扩展上下文失效或后台返回失败时抛出异常。
   */
  function sendRuntimeMessage(message) {
    return new Promise(function sendMessagePromise(resolve, reject) {
      chrome.runtime.sendMessage(message, function handleMessageResponse(response) {
        if (chrome.runtime.lastError) {
          const runtimeError = new Error(chrome.runtime.lastError.message);
          logError(`后台请求失败：${message.type || '未知操作'}`, runtimeError, { message });
          reject(runtimeError);
          return;
        }

        if (!response || !response.ok) {
          const responseError = new Error((response && response.error) || '扩展操作失败。');
          logError(`后台返回失败：${message.type || '未知操作'}`, responseError, { message });
          reject(responseError);
          return;
        }

        resolve(response);
      });
    });
  }

  /**
   * 创建悬浮卡片及其 Shadow DOM 容器。
   * @returns {void}
   * @throws {Error} 当前页面无法创建扩展容器时抛出异常。
   */
  function createHoverCard() {
    if (document.getElementById(ROOT_ID)) {
      return;
    }

    rootElement = document.createElement('div');
    rootElement.id = ROOT_ID;
    shadowRoot = rootElement.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          color: #243447;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        .hover-card {
          position: fixed;
          z-index: 2147483647;
          width: min(320px, calc(100vw - 24px));
          max-width: 320px;
          padding: 13px;
          border: 1px solid #c7d9e8;
          border-radius: 11px;
          background: #ffffff;
          box-shadow: 0 9px 28px rgba(34, 56, 78, 0.22);
          color: #243447;
          pointer-events: auto;
        }

        .hover-card[hidden] {
          display: none;
        }

        .hover-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .hover-title {
          display: block;
          max-width: 210px;
          overflow: hidden;
          color: #102a43;
          font-size: 14px;
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hover-user-id {
          max-width: 190px;
          overflow: hidden;
          color: #627d98;
          font-size: 11px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .hover-status {
          min-height: 17px;
          margin-bottom: 8px;
          color: #627d98;
          font-size: 12px;
          line-height: 1.4;
        }

        .hover-status.error {
          color: #b42318;
        }

        .hover-tag-list {
          display: flex;
          min-height: 25px;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 11px;
        }

        .hover-tag {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 4px;
          padding: 5px 6px 5px 8px;
          border: 1px solid #b9d7ee;
          border-radius: 999px;
          background: #f0f8ff;
          color: #145b85;
          font-size: 12px;
          line-height: 1.2;
        }

        .hover-tag-text {
          max-width: 230px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .delete-tag-button {
          width: 17px;
          height: 17px;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: transparent;
          color: #6b8aa3;
          cursor: pointer;
          font-size: 13px;
          line-height: 17px;
        }

        .delete-tag-button:hover {
          background: #d8eaf7;
          color: #b42318;
        }

        .hover-empty {
          color: #829ab1;
          font-size: 12px;
        }

        .hover-add-form {
          display: flex;
          gap: 7px;
          padding-top: 10px;
          border-top: 1px solid #e6eef5;
        }

        .hover-tag-input {
          min-width: 0;
          flex: 1;
          padding: 7px 8px;
          border: 1px solid #bcccdc;
          border-radius: 7px;
          outline: none;
          color: #243b53;
          font-size: 12px;
        }

        .hover-tag-input:focus {
          border-color: #2680c2;
          box-shadow: 0 0 0 3px rgba(38, 128, 194, 0.14);
        }

        .hover-add-button {
          padding: 7px 10px;
          border: 1px solid #1976b8;
          border-radius: 7px;
          background: #1976b8;
          color: #ffffff;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .hover-add-button:hover {
          background: #145b85;
        }

        .photo-overlay {
          position: fixed;
          z-index: 2147483647;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: rgba(0, 0, 0, 0.86);
          cursor: pointer;
        }

        .photo-overlay[hidden],
        .photo-preview-image[hidden],
        .photo-preview-title[hidden],
        .photo-preview-status[hidden] {
          display: none;
        }

        .photo-preview-content {
          display: flex;
          width: 100%;
          max-width: 100vw;
          max-height: 100vh;
          padding: 16px;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
        }

        .photo-preview-title {
          align-self: stretch;
          max-width: 100%;
          max-height: 20vh;
          margin-bottom: 10px;
          overflow: auto;
          color: #ffffff;
          font-size: 15px;
          line-height: 1.5;
          text-align: left;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          cursor: pointer;
        }

        .photo-preview-image {
          /* 只限制最大尺寸，不设置固定宽高，保证小图保持原始尺寸而不被放大。 */
          align-self: flex-end;
          display: block;
          max-width: calc(100vw - 32px);
          max-height: calc(100vh - 54px);
          width: auto;
          height: auto;
          object-fit: contain;
          cursor: pointer;
        }

        .photo-preview-status {
          position: absolute;
          top: 50%;
          left: 50%;
          max-width: calc(100vw - 32px);
          padding: 10px 14px;
          transform: translate(-50%, -50%);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.68);
          color: #ffffff;
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
          pointer-events: none;
        }
      </style>
      <aside class="hover-card" aria-label="用户标签悬浮卡片" hidden>
        <div class="hover-header">
          <strong class="hover-title"></strong>
          <span class="hover-user-id"></span>
        </div>
        <div class="hover-status" role="status" aria-live="polite">正在加载标签…</div>
        <div class="hover-tag-list"></div>
        <form class="hover-add-form">
          <input class="hover-tag-input" type="text" maxlength="200" placeholder="添加标签，例如：爱好鲜花" autocomplete="off">
          <button class="hover-add-button" type="submit">添加</button>
        </form>
      </aside>
      <div class="photo-overlay" role="dialog" aria-modal="true" aria-label="原图预览，点击关闭" hidden>
        <div class="photo-preview-content">
          <div class="photo-preview-title" hidden></div>
          <img class="photo-preview-image" alt="照片原图" hidden>
        </div>
        <div class="photo-preview-status" role="status" aria-live="polite">正在加载原图…</div>
      </div>
    `;

    hoverCardElement = shadowRoot.querySelector('.hover-card');
    hoverTitleElement = shadowRoot.querySelector('.hover-title');
    hoverUserIdElement = shadowRoot.querySelector('.hover-user-id');
    hoverStatusElement = shadowRoot.querySelector('.hover-status');
    hoverTagListElement = shadowRoot.querySelector('.hover-tag-list');
    hoverTagInputElement = shadowRoot.querySelector('.hover-tag-input');
    photoOverlayElement = shadowRoot.querySelector('.photo-overlay');
    photoPreviewTitleElement = shadowRoot.querySelector('.photo-preview-title');
    photoPreviewImageElement = shadowRoot.querySelector('.photo-preview-image');
    photoPreviewStatusElement = shadowRoot.querySelector('.photo-preview-status');

    hoverCardElement.addEventListener('pointerenter', handleHoverCardPointerEnter);
    hoverCardElement.addEventListener('pointerleave', handleHoverCardPointerLeave);
    shadowRoot.querySelector('.hover-add-form').addEventListener('submit', handleHoverAddTag);
    hoverTagListElement.addEventListener('click', handleHoverTagListClick);
    photoOverlayElement.addEventListener('click', handlePhotoOverlayClick);
    photoPreviewImageElement.addEventListener('load', handlePhotoPreviewImageLoad);
    photoPreviewImageElement.addEventListener('error', handlePhotoPreviewImageError);
    document.documentElement.appendChild(rootElement);
  }

  /**
   * 从事件目标中找到照片链接，并取得其中的缩略图地址。
   * @param {EventTarget|null} target 事件目标。
   * @returns {{link: HTMLAnchorElement, imageUrl: string, title: string}|null} 照片链接、缩略图地址和标题；不符合条件时返回 null。
   */
  function getPhotoLink(target) {
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const link = target.closest('a.photo[href]');
    if (!link || link.tagName !== 'A') {
      return null;
    }

    try {
      const parsedHref = new URL(link.getAttribute('href') || '', window.location.href);
      // 同时支持旧版 photo.normal 和新版 photo 路径，避免页面升级后预览功能失效。
      if (parsedHref.protocol !== 'https:'
        || parsedHref.hostname !== 'm.fanfou.com'
        || !/^\/(?:photo\.normal|photo)(?:\/|$)/.test(parsedHref.pathname)) {
        return null;
      }

      const imageElement = link.querySelector('img[src]');
      const imageUrl = imageElement ? imageElement.getAttribute('src') : '';
      if (!imageUrl || !imageUrl.trim()) {
        return null;
      }

      // 示例页面把标题放在 img 上；同时兼容标题写在 a 上的页面结构。
      const title = (imageElement.getAttribute('title') || link.getAttribute('title') || '').trim();
      return { link, imageUrl: imageUrl.trim(), title };
    } catch (error) {
      logWarn('无法解析照片链接', { href: link.getAttribute('href'), error });
      return null;
    }
  }

  /**
   * 将图片缩略图地址转换为原图地址。
   * @param {string} imageUrl 图片地址，可以是绝对地址或相对地址。
   * @returns {string} 去除末尾尺寸处理参数后的图片地址；无法解析时返回原始地址。
   */
  function getOriginalPhotoUrl(imageUrl) {
    try {
      const parsedUrl = new URL(imageUrl, window.location.href);
      // 缩略图使用 @尺寸参数 一类后缀；只移除最后一个 @ 后的路径片段。
      parsedUrl.pathname = parsedUrl.pathname.replace(/@[^/]+$/, '');
      return parsedUrl.href;
    } catch (error) {
      logWarn('无法转换照片原图地址，已使用原始地址', { imageUrl, error });
      return imageUrl;
    }
  }

  /**
   * 根据左右箭头计算分页后的页面地址。
   * @param {string} key 按下的键名，只处理 ArrowLeft 或 ArrowRight。
   * @returns {string|null} 分页后的完整地址；当前地址不是以 /p.数字 结尾或无需翻页时返回 null。
   */
  function getPaginationUrl(key) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') {
      return null;
    }

    try {
      const currentUrl = new URL(window.location.href);
      const pageMatch = currentUrl.pathname.match(/^(.*\/p\.)(\d+)$/i);
      if (!pageMatch) {
        return null;
      }

      const currentPage = Number(pageMatch[2]);
      if (!Number.isSafeInteger(currentPage) || currentPage < 1) {
        return null;
      }

      const pageDelta = key === 'ArrowLeft' ? -1 : 1;
      const nextPage = currentPage + pageDelta;
      // 第一页没有上一页，避免把地址改成不存在的 p.0。
      if (nextPage < 1) {
        return null;
      }

      currentUrl.pathname = `${pageMatch[1]}${nextPage}`;
      return currentUrl.href;
    } catch (error) {
      logWarn('无法计算分页地址', { key, currentUrl: window.location.href, error });
      return null;
    }
  }

  /**
   * 判断键盘事件是否来自不应被分页快捷键打断的输入区域。
   * @param {EventTarget|null} target 键盘事件目标。
   * @returns {boolean} 目标是表单控件、可编辑区域或扩展浮层时返回 true。
   */
  function isPaginationInputTarget(target) {
    if (target === rootElement || isInsideNode(rootElement, target)) {
      return true;
    }

    if (!(target instanceof Element)) {
      return false;
    }

    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  }

  /**
   * 处理页面分页快捷键，按左右箭头后刷新到上一页或下一页。
   * @param {KeyboardEvent} event 键盘事件。
   * @returns {void}
   */
  function handlePaginationKeyDown(event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    // 修饰键通常代表用户正在选择文本或使用浏览器/系统快捷键，此时不接管事件。
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || isPaginationInputTarget(event.target)
      || !photoOverlayElement.hidden) {
      return;
    }

    const nextUrl = getPaginationUrl(event.key);
    if (!nextUrl) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    logInfo('通过左右箭头切换分页', { from: window.location.href, to: nextUrl });
    window.location.assign(nextUrl);
  }

  /**
   * 判断事件目标是否来自照片预览层，用于避免关闭预览时因底层链接重新获得指针而立即重开。
   * @param {EventTarget|null} target 待判断的事件目标。
   * @returns {boolean} 目标位于预览层或扩展宿主节点时返回 true。
   */
  function isPhotoOverlayTarget(target) {
    return target === rootElement || isInsideNode(photoOverlayElement, target);
  }

  /**
   * 取消尚未触发的照片预览定时器。
   * @returns {void}
   */
  function clearPhotoPreviewShowTimer() {
    if (state.photoPreviewShowTimer) {
      window.clearTimeout(state.photoPreviewShowTimer);
      state.photoPreviewShowTimer = null;
    }
  }

  /**
   * 显示照片原图预览层并开始加载图片。
   * @param {HTMLAnchorElement} link 当前悬停的照片链接。
   * @param {string} imageUrl 照片缩略图地址。
   * @param {string} title 图片标题，将显示在原图上方。
   * @returns {void}
   */
  function showPhotoPreview(link, imageUrl, title) {
    const originalPhotoUrl = getOriginalPhotoUrl(imageUrl);
    state.photoPreviewAnchor = link;
    state.photoPreviewRequestId += 1;
    const requestId = state.photoPreviewRequestId;

    // 原图层覆盖页面后，用户标签卡片不应继续留在原图上方，因此先关闭标签卡片。
    hideHoverCard();
    photoPreviewImageElement.hidden = true;
    photoPreviewTitleElement.textContent = title;
    photoPreviewTitleElement.hidden = !title;
    photoPreviewStatusElement.hidden = false;
    photoPreviewStatusElement.textContent = '正在加载原图…';
    photoOverlayElement.hidden = false;
    photoPreviewImageElement.alt = '照片原图';
    photoPreviewImageElement.dataset.requestId = String(requestId);
    photoPreviewImageElement.src = originalPhotoUrl;
    logInfo('开始加载照片原图', { imageUrl, originalPhotoUrl });
  }

  /**
   * 关闭照片原图预览层并清理当前图片请求状态。
   * @returns {void}
   */
  function hidePhotoPreview() {
    state.photoPreviewRequestId += 1;
    photoOverlayElement.hidden = true;
    photoPreviewImageElement.hidden = true;
    photoPreviewTitleElement.hidden = true;
    photoPreviewTitleElement.textContent = '';
    photoPreviewImageElement.removeAttribute('src');
    photoPreviewImageElement.removeAttribute('data-request-id');
    photoPreviewStatusElement.hidden = false;
    photoPreviewStatusElement.textContent = '正在加载原图…';
  }

  /**
   * 处理原图预览层的点击事件，点击任意位置都关闭预览。
   * @param {MouseEvent} event 点击事件。
   * @returns {void}
   */
  function handlePhotoOverlayClick(event) {
    event.preventDefault();
    event.stopPropagation();
    hidePhotoPreview();
  }

  /**
   * 处理键盘事件，按 Escape 时关闭照片原图预览层。
   * @param {KeyboardEvent} event 键盘事件。
   * @returns {void}
   */
  function handlePhotoPreviewKeyDown(event) {
    if (event.key !== 'Escape' || photoOverlayElement.hidden) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    hidePhotoPreview();
  }

  /**
   * 处理原图加载成功事件并显示图片。
   * @returns {void}
   */
  function handlePhotoPreviewImageLoad() {
    if (photoPreviewImageElement.dataset.requestId !== String(state.photoPreviewRequestId)
      || photoOverlayElement.hidden) {
      return;
    }

    photoPreviewStatusElement.hidden = true;
    photoPreviewImageElement.hidden = false;
  }

  /**
   * 处理原图加载失败事件并在预览层显示错误信息。
   * @returns {void}
   */
  function handlePhotoPreviewImageError() {
    if (photoPreviewImageElement.dataset.requestId !== String(state.photoPreviewRequestId)
      || photoOverlayElement.hidden) {
      return;
    }

    photoPreviewImageElement.hidden = true;
    photoPreviewStatusElement.hidden = false;
    photoPreviewStatusElement.textContent = '原图加载失败，点击关闭';
    logWarn('照片原图加载失败', { source: photoPreviewImageElement.src });
  }

  /**
   * 从事件目标中找到符合条件的用户链接。
   * 支持 a.former 绝对地址、a.p 根路径相对地址，以及没有 class 的普通根路径相对地址。
   * @param {EventTarget|null} target 事件目标。
   * @returns {HTMLAnchorElement|null} 用户链接；不符合条件时返回 null。
   */
  function getUserLink(target) {
    if (!target || typeof target.closest !== 'function') {
      return null;
    }

    const link = target.closest('a[href]');
    if (!link || link.tagName !== 'A') {
      return null;
    }

    const rawHref = link.getAttribute('href') || '';
    const isAbsoluteTargetLink = /^https:\/\/m\.fanfou\.com\//.test(rawHref);
    const isRootRelativeLink = rawHref.startsWith('/') && !rawHref.startsWith('//');

    // 只有绝对地址或根路径单段地址才可能是用户链接，避免误处理锚点和其他站内导航。
    if (!isAbsoluteTargetLink && !isRootRelativeLink) {
      return null;
    }
    if (!getUserIdFromUrl(link.href)) {
      return null;
    }

    return link;
  }

  /**
   * 根据用户显示名称生成悬浮卡片标题。
   * @param {string} username 匹配到的用户链接文本。
   * @param {string} userId 用户 ID，用于用户文本为空时回退显示。
   * @returns {string} 悬浮卡片标题。
   */
  function getHoverTitle(username, userId) {
    if (username === '空间') {
      return '我本人的标签';
    }
    if (username === '肥魔') {
      return '他的标签';
    }

    return `${username || userId} 的标签`;
  }

  /**
   * 判断一个事件目标是否处在指定 DOM 节点内部。
   * @param {Node} container 容器节点。
   * @param {EventTarget|null} target 待判断的事件目标。
   * @returns {boolean} 目标在容器内部时返回 true。
   */
  function isInsideNode(container, target) {
    return Boolean(target && target instanceof Node && container.contains(target));
  }

  /**
   * 判断指针是否进入了悬浮卡片或其 Shadow DOM 宿主。
   * @param {EventTarget|null} target 指针关联目标。
   * @returns {boolean} 指针位于悬浮卡片区域时返回 true。
   */
  function isHoverCardTarget(target) {
    return target === rootElement || isInsideNode(hoverCardElement, target);
  }

  /**
   * 清除悬浮卡片的延迟隐藏计时器。
   * @returns {void}
   */
  function clearHoverHideTimer() {
    if (state.hoverHideTimer) {
      window.clearTimeout(state.hoverHideTimer);
      state.hoverHideTimer = null;
    }
  }

  /**
   * 渲染悬浮卡片中的标签和删除按钮。
   * @param {string[]} tags 当前用户标签。
   * @returns {void}
   */
  function renderHoverTags(tags) {
    hoverTagListElement.textContent = '';

    if (tags.length === 0) {
      const emptyElement = document.createElement('span');
      emptyElement.className = 'hover-empty';
      emptyElement.textContent = '还没有保存的标签';
      hoverTagListElement.appendChild(emptyElement);
      return;
    }

    tags.forEach(function renderHoverTag(tag, index) {
      const tagElement = document.createElement('span');
      tagElement.className = 'hover-tag';

      const tagTextElement = document.createElement('span');
      tagTextElement.className = 'hover-tag-text';
      tagTextElement.textContent = tag;

      const deleteButton = document.createElement('button');
      deleteButton.className = 'delete-tag-button';
      deleteButton.type = 'button';
      deleteButton.title = '删除标签';
      deleteButton.setAttribute('aria-label', `删除标签：${tag}`);
      deleteButton.dataset.tagIndex = String(index);
      deleteButton.textContent = '×';

      tagElement.append(tagTextElement, deleteButton);
      hoverTagListElement.appendChild(tagElement);
    });
  }

  /**
   * 将悬浮卡片定位到用户链接附近。
   * @param {HTMLAnchorElement} link 当前悬浮的用户链接。
   * @returns {void}
   */
  function positionHoverCard(link) {
    if (!link || !link.isConnected || hoverCardElement.hidden) {
      return;
    }

    const linkRect = link.getBoundingClientRect();
    const cardWidth = hoverCardElement.offsetWidth || Math.min(320, window.innerWidth - 24);
    const cardHeight = hoverCardElement.offsetHeight;
    const edgeGap = 12;
    let left = linkRect.left;
    let top = linkRect.bottom + 8;

    if (left + cardWidth > window.innerWidth - edgeGap) {
      left = window.innerWidth - cardWidth - edgeGap;
    }
    if (left < edgeGap) {
      left = edgeGap;
    }
    if (top + cardHeight > window.innerHeight - edgeGap && linkRect.top - cardHeight - 8 >= edgeGap) {
      top = linkRect.top - cardHeight - 8;
    }

    hoverCardElement.style.left = `${left}px`;
    hoverCardElement.style.top = `${Math.max(edgeGap, top)}px`;
  }

  /**
   * 隐藏用户链接悬浮卡片并取消过期请求。
   * @returns {void}
   */
  function hideHoverCard() {
    if (state.hoverShowTimer) {
      window.clearTimeout(state.hoverShowTimer);
      state.hoverShowTimer = null;
    }
    if (state.hoverHideTimer) {
      window.clearTimeout(state.hoverHideTimer);
      state.hoverHideTimer = null;
    }

    state.hoverRequestId += 1;
    state.hoverAnchor = null;
    state.hoverUserId = '';
    hoverCardElement.hidden = true;
  }

  /**
   * 加载悬浮用户的标签并更新卡片。
   * @param {HTMLAnchorElement} link 当前用户链接。
   * @param {string} userId 当前用户 ID。
   * @param {number} requestId 本次悬浮请求序号。
   * @returns {Promise<void>} 标签加载完成后结束。
   */
  async function loadHoverTags(link, userId, requestId) {
    try {
      const response = await sendRuntimeMessage({ type: 'getTags', userId });
      if (state.hoverRequestId !== requestId || state.hoverAnchor !== link) {
        return;
      }

      const tags = Array.isArray(response.tags) ? response.tags : [];
      hoverStatusElement.textContent = '';
      hoverStatusElement.classList.remove('error');
      renderHoverTags(tags);
      positionHoverCard(link);
      logInfo(`已加载用户 ${userId} 的标签`, { tagCount: tags.length });
    } catch (error) {
      if (state.hoverRequestId === requestId && state.hoverAnchor === link) {
        hoverStatusElement.textContent = '标签加载失败';
        hoverStatusElement.classList.add('error');
        renderHoverTags([]);
      }
      logError(`加载用户 ${userId} 的标签失败`, error, { userId });
    }
  }

  /**
   * 处理鼠标进入用户或照片链接事件，并延迟显示对应的浮层以减少误触。
   * @param {PointerEvent} event 指针进入事件。
   * @returns {void}
   */
  function handleDocumentPointerOver(event) {
    // 关闭全屏层后，浏览器可能让底层照片链接重新获得指针；在指针真正离开该链接前禁止立即重开。
    if (state.photoPreviewAnchor
      && photoOverlayElement.hidden
      && !isInsideNode(state.photoPreviewAnchor, event.target)) {
      clearPhotoPreviewShowTimer();
      state.photoPreviewHoverId += 1;
      state.photoPreviewAnchor = null;
    }

    const photoLink = getPhotoLink(event.target);
    if (photoLink && !isInsideNode(photoLink.link, event.relatedTarget)) {
      if (state.photoPreviewAnchor === photoLink.link && photoOverlayElement.hidden) {
        return;
      }
      clearPhotoPreviewShowTimer();
      state.photoPreviewAnchor = photoLink.link;
      const hoverId = state.photoPreviewHoverId + 1;
      state.photoPreviewHoverId = hoverId;
      state.photoPreviewShowTimer = window.setTimeout(function showPhotoPreviewLater() {
        state.photoPreviewShowTimer = null;
        // 只有指针仍在同一个链接上时才显示，防止快速扫过照片时弹出预览。
        if (state.photoPreviewHoverId !== hoverId
          || state.photoPreviewAnchor !== photoLink.link
          || !photoOverlayElement.hidden
          || !photoLink.link.matches(':hover')) {
          return;
        }

        showPhotoPreview(photoLink.link, photoLink.imageUrl, photoLink.title);
      }, PHOTO_PREVIEW_HOVER_DELAY);
      return;
    }

    const link = getUserLink(event.target);
    if (!link || isInsideNode(link, event.relatedTarget)) {
      return;
    }

    clearHoverHideTimer();
    if (state.hoverAnchor === link) {
      return;
    }
    if (state.hoverShowTimer) {
      window.clearTimeout(state.hoverShowTimer);
    }

    const userId = getUserIdFromUrl(link.href);
    const username = link.textContent.replace(/\s+/g, ' ').trim() || userId;
    const hoverTitle = getHoverTitle(username, userId);
    const requestId = state.hoverRequestId + 1;
    state.hoverRequestId = requestId;
    state.hoverAnchor = link;
    state.hoverUserId = userId;
    hoverCardElement.hidden = true;

    state.hoverShowTimer = window.setTimeout(function showHoverCardLater() {
      if (state.hoverRequestId !== requestId || state.hoverAnchor !== link) {
        return;
      }

      hoverTitleElement.textContent = hoverTitle;
      hoverUserIdElement.textContent = `/${userId}`;
      hoverStatusElement.textContent = '正在加载标签…';
      hoverStatusElement.classList.remove('error');
      hoverTagListElement.textContent = '';
      hoverCardElement.hidden = false;
      positionHoverCard(link);
      void loadHoverTags(link, userId, requestId);
    }, PHOTO_PREVIEW_HOVER_DELAY);
  }

  /**
   * 处理鼠标离开用户链接事件，并隐藏悬浮卡片。
   * @param {PointerEvent} event 指针离开事件。
   * @returns {void}
   */
  function handleDocumentPointerOut(event) {
    const photoLink = getPhotoLink(event.target);
    if (photoLink
      && state.photoPreviewAnchor === photoLink.link
      && !isInsideNode(photoLink.link, event.relatedTarget)
      && !isPhotoOverlayTarget(event.relatedTarget)) {
      clearPhotoPreviewShowTimer();
      state.photoPreviewHoverId += 1;
      state.photoPreviewAnchor = null;
    }

    const link = getUserLink(event.target);
    if (!link || isInsideNode(link, event.relatedTarget) || isHoverCardTarget(event.relatedTarget)) {
      return;
    }

    if (state.hoverShowTimer) {
      window.clearTimeout(state.hoverShowTimer);
      state.hoverShowTimer = null;
    }
    clearHoverHideTimer();
    state.hoverHideTimer = window.setTimeout(hideHoverCard, 100);
  }

  /**
   * 指针进入悬浮卡片时取消隐藏，保证用户可以操作卡片中的控件。
   * @returns {void}
   */
  function handleHoverCardPointerEnter() {
    clearHoverHideTimer();
  }

  /**
   * 指针离开悬浮卡片时延迟隐藏卡片。
   * @returns {void}
   */
  function handleHoverCardPointerLeave() {
    clearHoverHideTimer();
    state.hoverHideTimer = window.setTimeout(hideHoverCard, 100);
  }

  /**
   * 处理悬浮卡片中的添加标签表单。
   * @param {SubmitEvent} event 表单提交事件。
   * @returns {Promise<void>} 标签保存完成后结束。
   */
  async function handleHoverAddTag(event) {
    event.preventDefault();
    const tag = hoverTagInputElement.value.trim();

    if (!tag) {
      hoverStatusElement.textContent = '请输入标签内容';
      hoverStatusElement.classList.add('error');
      logWarn('添加标签被取消：标签内容为空', { userId: state.hoverUserId });
      hoverTagInputElement.focus();
      return;
    }

    try {
      const response = await sendRuntimeMessage({
        type: 'addTag',
        userId: state.hoverUserId,
        tag
      });
      hoverTagInputElement.value = '';
      hoverStatusElement.textContent = '标签已保存';
      hoverStatusElement.classList.remove('error');
      renderHoverTags(response.tags);
      positionHoverCard(state.hoverAnchor);
      logInfo(`已为用户 ${state.hoverUserId} 添加标签`, { tagCount: response.tags.length });
    } catch (error) {
      hoverStatusElement.textContent = error.message;
      hoverStatusElement.classList.add('error');
      logError(`为用户 ${state.hoverUserId} 添加标签失败`, error, { userId: state.hoverUserId });
    }
  }

  /**
   * 处理悬浮卡片中的删除标签按钮。
   * @param {MouseEvent} event 点击事件。
   * @returns {Promise<void>} 标签删除完成后结束。
   */
  async function handleHoverTagListClick(event) {
    const deleteButton = event.target.closest('.delete-tag-button');
    if (!deleteButton || !state.hoverUserId) {
      return;
    }

    const tagIndex = Number(deleteButton.dataset.tagIndex);
    try {
      const response = await sendRuntimeMessage({
        type: 'deleteTag',
        userId: state.hoverUserId,
        tagIndex
      });
      hoverStatusElement.textContent = '标签已删除';
      hoverStatusElement.classList.remove('error');
      renderHoverTags(response.tags);
      positionHoverCard(state.hoverAnchor);
      logInfo(`已删除用户 ${state.hoverUserId} 的标签`, { tagCount: response.tags.length });
    } catch (error) {
      hoverStatusElement.textContent = error.message;
      hoverStatusElement.classList.add('error');
      logError(`删除用户 ${state.hoverUserId} 的标签失败`, error, { userId: state.hoverUserId, tagIndex });
    }
  }

  /**
   * 页面滚动或缩放时重新定位悬浮卡片。
   * @returns {void}
   */
  function handleWindowViewportChange() {
    if (state.hoverAnchor && !hoverCardElement.hidden) {
      positionHoverCard(state.hoverAnchor);
    }
  }

  /**
   * 初始化页面上的悬浮标签功能。
   * @returns {void}
   */
  function start() {
    try {
      createHoverCard();
      document.addEventListener('pointerover', handleDocumentPointerOver, true);
      document.addEventListener('pointerout', handleDocumentPointerOut, true);
      document.addEventListener('keydown', handlePaginationKeyDown, true);
      document.addEventListener('keydown', handlePhotoPreviewKeyDown, true);
      window.addEventListener('scroll', handleWindowViewportChange, true);
      window.addEventListener('resize', handleWindowViewportChange);
      logInfo('悬浮标签功能已初始化');
    } catch (error) {
      logError('悬浮标签功能初始化失败', error);
    }
  }

  start();
})();
