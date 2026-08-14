/**
 * 饭人画像谷歌插件配置页。
 * 负责展示存储统计，并处理全部用户标签的 JSON 导入和导出。
 * 作者：肥魔（serylab+fanfouer+tags@gmail.com）
 */

(function initializeOptionsPage() {
  'use strict';

  const LOG_PREFIX = '[饭人画像谷歌插件][配置页]';
  const userCountElement = document.querySelector('.user-count');
  const tagCountElement = document.querySelector('.tag-count');
  const statusElement = document.querySelector('.status');
  const importInputElement = document.querySelector('.import-input');

  /**
   * 输出普通配置页日志。
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
   * 输出配置页错误日志，并保留原始错误对象。
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
   * 显示配置页操作状态。
   * @param {string} message 要显示的状态文本。
   * @param {boolean} isError 是否使用错误样式。
   * @returns {void}
   */
  function showStatus(message, isError) {
    statusElement.textContent = message;
    statusElement.classList.toggle('error', Boolean(isError));
  }

  /**
   * 根据导出数据刷新当前存储统计。
   * @returns {Promise<void>} 统计刷新完成后结束。
   */
  async function refreshSummary() {
    try {
      const response = await sendRuntimeMessage({ type: 'exportData' });
      const users = response.data && response.data.users ? response.data.users : {};
      const tagCount = Object.values(users).reduce(function countTags(total, tags) {
        return total + (Array.isArray(tags) ? tags.length : 0);
      }, 0);

      userCountElement.textContent = String(Object.keys(users).length);
      tagCountElement.textContent = String(tagCount);
      logInfo('已刷新本地标签统计', {
        userCount: Object.keys(users).length,
        tagCount
      });
    } catch (error) {
      userCountElement.textContent = '-';
      tagCountElement.textContent = '-';
      showStatus(error.message, true);
      logError('刷新本地标签统计失败', error);
    }
  }

  /**
   * 导出全部用户标签为 JSON 文件。
   * @returns {Promise<void>} 文件触发下载后结束。
   */
  async function handleExport() {
    try {
      const response = await sendRuntimeMessage({ type: 'exportData' });
      const json = JSON.stringify(response.data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const downloadLink = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);

      downloadLink.href = downloadUrl;
      downloadLink.download = `fanfou-user-tags-${date}.json`;
      downloadLink.click();
      window.setTimeout(function revokeDownloadUrl() {
        URL.revokeObjectURL(downloadUrl);
      }, 1000);
      showStatus('全部标签已导出。', false);
      logInfo('全部标签已导出', { userCount: Object.keys(response.data.users || {}).length });
    } catch (error) {
      showStatus(error.message, true);
      logError('导出全部标签失败', error);
    }
  }

  /**
   * 打开系统文件选择器。
   * @returns {void}
   */
  function handleImportButtonClick() {
    console.info(`${LOG_PREFIX} 已打开导入文件选择器`);
    importInputElement.click();
  }

  /**
   * 读取用户选择的 JSON 文件。
   * @param {Event} event 文件选择事件。
   * @returns {void}
   */
  function handleImportFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    console.info(`${LOG_PREFIX} 正在读取标签文件`, { fileName: file.name, fileSize: file.size });

    const reader = new FileReader();
    reader.addEventListener('load', handleImportedFileLoaded);
    reader.addEventListener('error', handleImportedFileError);
    reader.readAsText(file, 'utf-8');
  }

  /**
   * 解析并导入读取完成的 JSON 文件。
   * @param {ProgressEvent<FileReader>} event 文件读取完成事件。
   * @returns {Promise<void>} 导入完成后结束。
   */
  async function handleImportedFileLoaded(event) {
    try {
      const importedData = JSON.parse(String(event.target.result || ''));
      const response = await sendRuntimeMessage({
        type: 'importData',
        data: importedData
      });
      showStatus(`导入完成：共 ${response.summary.userCount} 个用户。`, false);
      await refreshSummary();
      logInfo('标签文件导入完成', response.summary);
    } catch (error) {
      showStatus(`导入失败：${error.message}`, true);
      logError('导入标签文件失败', error);
    } finally {
      importInputElement.value = '';
    }
  }

  /**
   * 处理文件读取错误。
   * @returns {void}
   */
  function handleImportedFileError() {
    showStatus('导入失败：无法读取文件。', true);
    logError('读取标签文件失败', new Error('FileReader 无法读取所选文件。'));
    importInputElement.value = '';
  }

  document.querySelector('.export-button').addEventListener('click', handleExport);
  document.querySelector('.import-button').addEventListener('click', handleImportButtonClick);
  importInputElement.addEventListener('change', handleImportFileChange);
  void refreshSummary();
  logInfo('配置页已初始化');
})();
